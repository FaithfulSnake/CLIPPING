import { capturarComRolagem, limparNome, normalizarOpcoes } from './comum.js';
import { apagarAntigas, salvarPrint, salvarSessao } from './db.js';
import { lerOpcoes } from './opcoes.js';
import { lerPacotes, referencia } from './pacotes.js';
import { motivoParaOcr } from './transcricao.js';

// Captura em andamento (só uma por vez).
let tarefa = null;
let ultimaCaptura = 0;

const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

function status() {
  if (!tarefa) return { ativo: false, estado: 'parado' };
  const { ativo, estado, total, porcento, mensagem, tabId, ocr } = tarefa;
  return { ativo, estado, total, porcento, mensagem, tabId, ocr, resultado: tarefa.opcoes?.resultado };
}

function avisarPopup() {
  chrome.runtime.sendMessage({ tipo: 'progresso', status: status() }).catch(() => {
    // popup fechado: ninguém escutando
  });
}

function selo(texto, cor) {
  chrome.action.setBadgeText({ text: texto });
  if (cor) chrome.action.setBadgeBackgroundColor({ color: cor });
}

function descreverErro(e) {
  const msg = String(e?.message || e);
  if (/file:\/\//i.test(msg) || /file access/i.test(msg)) {
    return 'Para capturar arquivos do computador, ative "Permitir acesso a URLs de arquivo" nos detalhes da extensão.';
  }
  if (/cannot (be scripted|access)|chrome:\/\/|edge:\/\/|extensions gallery|webstore/i.test(msg)) {
    return 'O navegador não deixa extensões acessarem esta página (páginas internas, loja de extensões, etc.).';
  }
  if (/no tab with id|tab.*closed/i.test(msg)) return 'A aba foi fechada durante a captura.';
  if (/frame.*removed|document.*unloaded|recarregada/i.test(msg)) return 'A página foi recarregada ou mudou durante a captura.';
  return msg;
}

// Chama um método da API que pagina.js deixou na aba.
async function chamarPagina(tabId, metodo, arg = null) {
  const [resposta] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (metodo, arg) => {
      const api = globalThis.__clippingPrints;
      return api ? api[metodo](arg) : { semApi: true };
    },
    args: [metodo, arg],
  });
  const valor = resposta?.result;
  if (valor?.semApi) throw new Error('A página foi recarregada ou mudou durante a captura.');
  return valor;
}

// captureVisibleTab só fotografa a aba ativa: se o usuário trocar de aba ou
// minimizar a janela, pausa até ele voltar.
async function aguardarAbaVisivel(t) {
  let pausou = false;
  for (;;) {
    const aba = await chrome.tabs.get(t.tabId);
    const janela = await chrome.windows.get(aba.windowId);
    if (aba.active && janela.state !== 'minimized') {
      t.windowId = aba.windowId;
      if (pausou) {
        t.estado = 'capturando';
        avisarPopup();
        await esperar(t.opcoes.espera + 300);
      }
      return;
    }
    if (t.parar) return;
    if (!pausou) {
      pausou = true;
      t.estado = 'pausado';
      selo('||', '#b45309');
      avisarPopup();
    }
    await esperar(500);
  }
}

// O Chrome aceita no máximo 2 capturas por segundo.
async function capturarTela(windowId, formato) {
  for (let tentativa = 0; ; tentativa++) {
    const falta = ultimaCaptura + 550 - Date.now();
    if (falta > 0) await esperar(falta);
    ultimaCaptura = Date.now();
    try {
      return await chrome.tabs.captureVisibleTab(windowId, formato === 'jpeg' ? { format: 'jpeg', quality: 92 } : { format: 'png' });
    } catch (e) {
      if (tentativa < 3 && /MAX_CAPTURE|quota/i.test(String(e?.message))) {
        await esperar(1000);
        continue;
      }
      throw e;
    }
  }
}

// Recorta o print na região escolhida (coordenadas da tela em pixels CSS).
async function recortar(blob, corte, janela, formato) {
  const imagem = await createImageBitmap(blob);
  const escala = imagem.width / janela.largura;
  const x = Math.round(corte.x * escala);
  const y = Math.round(corte.y * escala);
  const w = Math.min(imagem.width - x, Math.round(corte.w * escala));
  const h = Math.min(imagem.height - y, Math.round(corte.h * escala));
  const tela = new OffscreenCanvas(w, h);
  tela.getContext('2d').drawImage(imagem, x, y, w, h, 0, 0, w, h);
  imagem.close();
  return tela.convertToBlob(formato === 'jpeg' ? { type: 'image/jpeg', quality: 0.92 } : { type: 'image/png' });
}

async function dimensoes(blob) {
  const imagem = await createImageBitmap(blob);
  const d = { largura: imagem.width, altura: imagem.height };
  imagem.close();
  return d;
}

// Lê a matéria direto da página (leitor.js): o texto como o site publica.
async function lerMateria(tabId, selecao) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['terceiros/readability/Readability.js', 'limpeza.js', 'leitor.js'] });
  const config = {
    area: Boolean(selecao?.rolagemEscolhida),
    faixaX: selecao?.recorte ? { x: selecao.recorte.x, w: selecao.recorte.w } : null,
  };
  const [resposta] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (c) => globalThis.__clippingLeitor.extrair(c),
    args: [config],
  });
  return resposta?.result ?? { ok: false, erro: 'a página não respondeu' };
}

// Leva a transcrição para a página de notícias (que monta a matéria e grava a
// lista): avisa a que já está aberta ou abre uma ao lado da matéria.
async function entregarTranscricao(sessaoId, aba) {
  const url = chrome.runtime.getURL('noticias.html');
  let aberta = null;
  try {
    aberta = (await chrome.runtime.getContexts({ contextTypes: ['TAB'] })).find((c) => c.documentUrl?.startsWith(url) && c.tabId >= 0);
  } catch {
    // sem como procurar: abre outra
  }
  if (aberta) {
    chrome.runtime.sendMessage({ tipo: 'transcrever', sessao: sessaoId }).catch(() => {});
    const alvo = await chrome.tabs.update(aberta.tabId, { active: true });
    await chrome.windows.update(alvo.windowId, { focused: true }).catch(() => {});
    return;
  }
  await chrome.tabs.create({
    url: `${url}?transcrever=${encodeURIComponent(sessaoId)}`,
    windowId: aba.windowId,
    index: aba.index + 1,
    openerTabId: aba.id,
  });
}

// selecao: o que foi escolhido na página pelo seletor ({ rolagemEscolhida, recorte }).
async function iniciar(tabId, pasta, opcoesRecebidas, pacoteId = null, selecao = null) {
  if (tarefa?.ativo) return { erro: 'Já existe uma captura em andamento.' };
  const opcoes = normalizarOpcoes(opcoesRecebidas);
  const aba = await chrome.tabs.get(tabId);
  const pacote = pacoteId ? (await lerPacotes()).lista.find((p) => p.id === pacoteId) : null;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['pagina.js'] });
  } catch (e) {
    return { erro: descreverErro(e) };
  }
  // Escolher na página antes: o seletor mostra as opções na própria aba e,
  // quando o usuário confirma, manda outro "iniciar" já com a escolha feita.
  if (!selecao && (opcoes.areaRolagem === 'escolher' || opcoes.recorte === 'regiao')) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['seletor.js'] });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (pedido) => globalThis.__clippingSeletor.abrir(pedido),
      args: [{ pasta, opcoes, pacoteId }],
    });
    return { ok: true, escolhendo: true };
  }
  const recorte = opcoes.recorte === 'regiao' ? (selecao?.recorte ? 'regiao' : 'tela') : opcoes.recorte;
  tarefa = {
    ativo: true,
    estado: 'capturando',
    tabId,
    windowId: aba.windowId,
    sessaoId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    total: 0,
    porcento: 0,
    mensagem: '',
    parar: false,
    opcoes,
    pacote: referencia(pacote),
    selecao,
    configPagina: { usarEscolhida: Boolean(selecao?.rolagemEscolhida), recorte: { modo: recorte, retangulo: selecao?.recorte || null } },
  };
  executar(tarefa, aba, limparNome(pasta || aba.title));
  return { ok: true };
}

const limparSeloDepois = () =>
  setTimeout(() => {
    if (!tarefa?.ativo) selo('');
  }, 10000);

async function executar(t, aba, pasta) {
  const querTexto = t.opcoes.resultado !== 'zip';
  const querZip = t.opcoes.resultado !== 'email';
  const sessao = {
    id: t.sessaoId,
    pasta,
    titulo: aba.title,
    url: aba.url,
    data: Date.now(),
    total: 0,
    formato: t.opcoes.formato,
    sobreposicao: t.opcoes.sobreposicao,
    incluirInfo: t.opcoes.incluirInfo,
    baixarAuto: t.opcoes.baixarAuto,
    pacote: querZip ? t.pacote : null,
    zip: querZip,
    motivo: 'capturando',
    medidas: [],
  };
  selo('0', '#2563eb');
  avisarPopup();
  try {
    await apagarAntigas(5);
  } catch {
    // sem limpeza desta vez
  }

  // Texto da matéria: direto da página; os prints só entram se ela não tiver o texto.
  let motivoOcr = '';
  if (querTexto) {
    t.estado = 'lendo';
    selo('…', '#2563eb');
    avisarPopup();
    let leitura;
    try {
      leitura = await lerMateria(t.tabId, t.selecao);
    } catch (e) {
      leitura = { ok: false, erro: descreverErro(e) };
    }
    motivoOcr = t.opcoes.leitura === 'ocr' ? 'leitura por OCR escolhida nas configurações' : motivoParaOcr(leitura);
    Object.assign(sessao, { tipo: 'transcricao', transcricao: 'pendente', leitura, precisaOcr: Boolean(motivoOcr), motivoOcr });
    t.ocr = Boolean(motivoOcr);
    if (!motivoOcr && !querZip) {
      try {
        sessao.motivo = 'fim';
        await salvarSessao(sessao);
        t.ativo = false;
        t.estado = 'concluido';
        selo('OK', '#16a34a');
        avisarPopup();
        await entregarTranscricao(sessao.id, aba);
      } catch (e) {
        t.ativo = false;
        t.estado = 'erro';
        t.mensagem = descreverErro(e);
        selo('ERR', '#dc2626');
        avisarPopup();
      }
      limparSeloDepois();
      return;
    }
  }

  // Prints só para o OCR: recortados na coluna da matéria e só pelo trecho dela,
  // com mais sobreposição (cada linha precisa aparecer inteira em algum print).
  let opcoesCaptura = t.opcoes;
  let configPagina = t.configPagina;
  let faixa = null;
  if (motivoOcr && !querZip) {
    opcoesCaptura = { ...t.opcoes, sobreposicao: Math.max(t.opcoes.sobreposicao, 15), esconderFixos: true };
    const c = sessao.leitura?.caixa;
    const j = sessao.leitura?.janela;
    if (c && j && configPagina.recorte.modo === 'tela') {
      const x = Math.max(0, c.x - 12);
      const w = Math.min(j.largura, c.x + c.w + 12) - x;
      if (w >= 200) configPagina = { ...configPagina, recorte: { modo: 'regiao', retangulo: { x, y: 0, w, h: j.altura } } };
      faixa = (inicio) => (inicio.tipo === 'janela' ? { de: c.y > j.altura * 1.5 ? c.y - j.altura * 0.5 : 0, ate: c.y + c.h + 40 } : null);
    }
  }
  t.estado = 'capturando';
  avisarPopup();
  try {
    await salvarSessao(sessao);
  } catch (e) {
    t.ativo = false;
    t.estado = 'erro';
    t.mensagem = `Não foi possível gravar os prints: ${descreverErro(e)}`;
    selo('ERR', '#dc2626');
    avisarPopup();
    return;
  }

  const resultado = await capturarComRolagem({
    opcoes: opcoesCaptura,
    pagina: (metodo, arg) => chamarPagina(t.tabId, metodo, arg),
    configPagina,
    faixa,
    antesDoPrint: () => aguardarAbaVisivel(t),
    tirarPrint: async (medidas, inicio) => {
      const dataUrl = await capturarTela(t.windowId, t.opcoes.formato);
      const blob = await (await fetch(dataUrl)).blob();
      sessao.recorte ??= inicio?.recorte || null;
      sessao.tipoRolagem ??= inicio?.tipo || null;
      return inicio?.recorte ? recortar(blob, inicio.recorte, medidas.janela || inicio.janela, t.opcoes.formato) : blob;
    },
    aoCapturar: async (blob, n, porcento, medidas) => {
      if (n === 1) Object.assign(sessao, await dimensoes(blob));
      await salvarPrint(t.sessaoId, n - 1, blob);
      sessao.medidas.push(medidas);
      t.total = n;
      t.porcento = porcento;
      selo(String(n), '#2563eb');
      avisarPopup();
    },
    deveParar: () => t.parar,
  });

  Object.assign(sessao, {
    total: resultado.total,
    motivo: resultado.motivo,
    mensagemErro: resultado.erro ? descreverErro(resultado.erro) : '',
  });
  t.ativo = false;

  if (resultado.total === 0) {
    t.estado = 'erro';
    t.mensagem = sessao.mensagemErro || 'Nenhum print foi capturado.';
    selo('ERR', '#dc2626');
    avisarPopup();
    return;
  }

  try {
    await salvarSessao(sessao);
    t.estado = 'concluido';
    t.mensagem = sessao.mensagemErro;
    selo('OK', '#16a34a');
    avisarPopup();
    if (querZip) {
      await chrome.tabs.create({
        url: `resultado.html?sessao=${encodeURIComponent(t.sessaoId)}`,
        windowId: aba.windowId,
        index: aba.index + 1,
        openerTabId: aba.id,
        active: !querTexto,
      });
    }
    if (querTexto) await entregarTranscricao(sessao.id, aba);
  } catch (e) {
    t.estado = 'erro';
    t.mensagem = descreverErro(e);
    selo('ERR', '#dc2626');
    avisarPopup();
  }
  limparSeloDepois();
}

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  switch (msg?.tipo) {
    case 'iniciar':
      // vem do popup (com tabId) ou do seletor na própria página (aba de quem enviou)
      iniciar(msg.tabId ?? remetente.tab?.id, msg.pasta, msg.opcoes, msg.pacoteId, msg.selecao).then(responder, (e) =>
        responder({ erro: descreverErro(e) }),
      );
      return true;
    case 'status':
      responder(status());
      return false;
    case 'parar':
      if (tarefa?.ativo) tarefa.parar = true;
      responder(status());
      return false;
    default:
      return false;
  }
});

// Atalho de teclado: inicia com as últimas opções e o último pacote escolhido;
// apertar de novo para.
chrome.commands.onCommand.addListener(async (comando, aba) => {
  if (comando !== 'iniciar-captura' || !aba?.id) return;
  if (tarefa?.ativo) {
    tarefa.parar = true;
    return;
  }
  const resposta = await iniciar(aba.id, aba.title, await lerOpcoes(), (await lerPacotes()).escolha);
  if (resposta?.erro) {
    tarefa = { ativo: false, estado: 'erro', total: 0, porcento: 0, mensagem: resposta.erro, tabId: aba.id };
    selo('ERR', '#dc2626');
  }
});
