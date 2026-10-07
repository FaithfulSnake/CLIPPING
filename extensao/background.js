import { capturarComRolagem, limparNome, normalizarOpcoes } from './comum.js';
import { apagarAntigas, salvarPrint, salvarSessao } from './db.js';
import { lerOpcoes } from './opcoes.js';
import { lerPacotes, referencia } from './pacotes.js';

// Captura em andamento (só uma por vez).
let tarefa = null;
let ultimaCaptura = 0;

const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

function status() {
  if (!tarefa) return { ativo: false, estado: 'parado' };
  const { ativo, estado, total, porcento, mensagem, tabId } = tarefa;
  return { ativo, estado, total, porcento, mensagem, tabId };
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

async function dimensoes(blob) {
  const imagem = await createImageBitmap(blob);
  const d = { largura: imagem.width, altura: imagem.height };
  imagem.close();
  return d;
}

async function iniciar(tabId, pasta, opcoesRecebidas, pacoteId = null) {
  if (tarefa?.ativo) return { erro: 'Já existe uma captura em andamento.' };
  const opcoes = normalizarOpcoes(opcoesRecebidas);
  const aba = await chrome.tabs.get(tabId);
  const pacote = pacoteId ? (await lerPacotes()).lista.find((p) => p.id === pacoteId) : null;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['pagina.js'] });
  } catch (e) {
    return { erro: descreverErro(e) };
  }
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
  };
  executar(tarefa, aba, limparNome(pasta || aba.title));
  return { ok: true };
}

async function executar(t, aba, pasta) {
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
    pacote: t.pacote,
    motivo: 'capturando',
    medidas: [],
  };
  selo('0', '#2563eb');
  avisarPopup();
  try {
    await apagarAntigas(5);
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
    opcoes: t.opcoes,
    pagina: (metodo, arg) => chamarPagina(t.tabId, metodo, arg),
    antesDoPrint: () => aguardarAbaVisivel(t),
    tirarPrint: async () => {
      const dataUrl = await capturarTela(t.windowId, t.opcoes.formato);
      return (await fetch(dataUrl)).blob();
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
    await chrome.tabs.create({
      url: `resultado.html?sessao=${encodeURIComponent(t.sessaoId)}`,
      windowId: aba.windowId,
      index: aba.index + 1,
      openerTabId: aba.id,
    });
  } catch (e) {
    t.estado = 'erro';
    t.mensagem = descreverErro(e);
    selo('ERR', '#dc2626');
    avisarPopup();
  }
  setTimeout(() => {
    if (!tarefa?.ativo) selo('');
  }, 10000);
}

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  switch (msg?.tipo) {
    case 'iniciar':
      iniciar(msg.tabId, msg.pasta, msg.opcoes, msg.pacoteId).then(responder, (e) => responder({ erro: descreverErro(e) }));
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
