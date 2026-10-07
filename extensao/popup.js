import { OPCOES_PADRAO, limparNome, normalizarOpcoes } from './comum.js';
import { lerOpcoes, salvarOpcoes } from './opcoes.js';
import { caminhoDoZip, criarPacote, guardarEscolha, lerPacotes, pastaDoPacote, sugerirNomePacote } from './pacotes.js';

const $ = (id) => document.getElementById(id);
const NUMEROS = ['sobreposicao', 'espera', 'limite'];
const CAIXAS = ['esconderFixos', 'incluirInfo', 'baixarAuto'];

let aba = null;
let pacotes = [];
let sugestaoPacote = '';

function preencher(opcoes) {
  for (const campo of NUMEROS) $(campo).value = opcoes[campo];
  for (const campo of CAIXAS) $(campo).checked = opcoes[campo];
  document.querySelector(`input[name="formato"][value="${opcoes.formato}"]`).checked = true;
}

function coletar() {
  const opcoes = {};
  for (const campo of NUMEROS) opcoes[campo] = $(campo).value;
  for (const campo of CAIXAS) opcoes[campo] = $(campo).checked;
  opcoes.formato = document.querySelector('input[name="formato"]:checked')?.value;
  return normalizarOpcoes(opcoes);
}

async function enviar(msg) {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch (e) {
    return { erro: e.message };
  }
}

function mostrarAviso(texto, tipo = 'aviso') {
  const el = $('aviso');
  el.textContent = texto;
  el.className = tipo === 'erro' ? 'aviso erro' : 'aviso';
  el.hidden = !texto;
}

// Páginas que o navegador não deixa capturar, ou que precisam de cuidado.
function verificarPagina(url = '') {
  if (!url) return { bloqueio: 'Não foi possível identificar a página desta aba.' };
  if (/^(chrome|edge|brave|opera|vivaldi|about|chrome-extension|devtools|view-source|chrome-search):/i.test(url)) {
    return { bloqueio: 'O navegador não permite capturar páginas internas (configurações, nova aba, extensões…).' };
  }
  if (/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i.test(url)) {
    return { bloqueio: 'O navegador não permite capturar a loja de extensões.' };
  }
  if (/\.pdf([?#]|$)/i.test(url)) {
    return {
      aviso: 'Isto parece um PDF. O leitor de PDF do navegador não aceita rolagem automática; se a captura sair com um print só, baixe o PDF direto.',
    };
  }
  if (/^file:/i.test(url)) {
    return {
      aviso: 'Arquivo do computador: se der erro, ative "Permitir acesso a URLs de arquivo" nos detalhes da extensão (chrome://extensions).',
    };
  }
  return {};
}

function textoStatus(s) {
  const prints = (n) => `${n} ${n === 1 ? 'print' : 'prints'}`;
  switch (s.estado) {
    case 'capturando':
      return s.total ? `Capturando… ${prints(s.total)} (${s.porcento}% da página)` : 'Preparando a página…';
    case 'pausado':
      return `Pausado em ${prints(s.total)}: volte para a aba da página para continuar.`;
    case 'concluido':
      return `Pronto! ${prints(s.total)}. O resultado abriu em uma nova aba.${s.mensagem ? ` (${s.mensagem})` : ''}`;
    case 'erro':
      return `Erro: ${s.mensagem || 'falha desconhecida.'}`;
    default:
      return '';
  }
}

function mostrarStatus(s) {
  $('tela-config').hidden = true;
  $('tela-progresso').hidden = false;
  $('status').textContent = textoStatus(s);
  const terminou = !s.ativo;
  $('barra').value = s.estado === 'concluido' ? 100 : s.porcento || 0;
  $('barra').hidden = s.estado === 'erro';
  $('parar').hidden = terminou;
  $('parar').disabled = false;
  $('nova').hidden = !terminou;
}

function mostrarConfig() {
  $('tela-progresso').hidden = true;
  $('tela-config').hidden = false;
}

function mostrarAba(nome, guardar = true) {
  for (const aba of ['prints', 'noticias']) {
    const ativa = aba === nome;
    $(`aba-${aba}`).setAttribute('aria-selected', String(ativa));
    $(`aba-${aba}`).tabIndex = ativa ? 0 : -1;
    $(`painel-${aba}`).hidden = !ativa;
  }
  if (guardar) chrome.storage.local.set({ abaPopup: nome });
}

// ---------------------------------------------------------------- pacotes

function desenharPacotes(escolha) {
  const opcao = (valor, rotulo, detalhe) => {
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'pacote', value: valor });
    const texto = Object.assign(document.createElement('span'), { textContent: rotulo });
    const linha = Object.assign(document.createElement('label'), { className: 'opcao-pacote' });
    linha.append(radio, texto);
    if (detalhe) linha.append(Object.assign(document.createElement('small'), { textContent: detalhe }));
    return linha;
  };
  $('pacote-opcoes').replaceChildren(
    opcao('', 'Sem pacote', 'ZIP solto em Downloads'),
    ...pacotes.map((p) => opcao(p.id, p.nome, `${p.itens.length} ${p.itens.length === 1 ? 'ZIP' : 'ZIPs'}`)),
    opcao('novo', 'Novo pacote…'),
  );
  const marcado = [...document.querySelectorAll('input[name="pacote"]')].find((r) => r.value === (escolha || ''));
  (marcado || document.querySelector('input[name="pacote"]')).checked = true;
  atualizarDestino();
}

const escolhaPacote = () => document.querySelector('input[name="pacote"]:checked')?.value ?? '';

// Mostra onde o ZIP vai ser salvo, para não haver surpresa.
function atualizarDestino() {
  const valor = escolhaPacote();
  const novo = $('novo-pacote');
  if (valor === 'novo' && novo.hidden) {
    novo.hidden = false;
    novo.value ||= sugestaoPacote;
    novo.focus();
    novo.select();
  } else if (valor !== 'novo') {
    novo.hidden = true;
  }
  const pasta = valor === 'novo' ? pastaDoPacote(novo.value || sugestaoPacote) : pacotes.find((p) => p.id === valor)?.pasta;
  $('pacote-destino').textContent = `Vai para: Downloads/${caminhoDoZip(pasta, $('pasta').value || aba?.title)}`;
}

// Pacote escolhido; "Novo pacote…" é criado agora (ou reaproveitado, se o nome já existe).
async function resolverPacote() {
  const valor = escolhaPacote();
  if (valor === 'novo') return (await criarPacote($('novo-pacote').value.trim() || sugestaoPacote)).id;
  return valor || null;
}

// Abre uma página da extensão (ou volta para ela, se já estiver aberta).
async function abrirPagina(arquivo) {
  const url = chrome.runtime.getURL(arquivo);
  try {
    const [aberta] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
    if (aberta?.tabId >= 0) {
      const aba = await chrome.tabs.update(aberta.tabId, { active: true });
      await chrome.windows.update(aba.windowId, { focused: true });
      window.close();
      return;
    }
  } catch {
    // sem como achar a aba já aberta: abre outra
  }
  await chrome.tabs.create({ url });
  window.close();
}

async function main() {
  const [opcoes, abas, status, comandos, guardado, dadosPacotes] = await Promise.all([
    lerOpcoes(),
    chrome.tabs.query({ active: true, currentWindow: true }),
    enviar({ tipo: 'status' }),
    chrome.commands.getAll(),
    chrome.storage.local.get(['abaPopup', 'noticias']),
    lerPacotes(),
  ]);
  mostrarAba(status?.ativo ? 'prints' : guardado.abaPopup || 'prints', false);
  const pendentes = guardado.noticias?.materias?.length || 0;
  if (pendentes) {
    $('noticias-pendentes').textContent = `${pendentes} ${pendentes === 1 ? 'matéria está' : 'matérias estão'} na lista, esperando para virar e-mail.`;
    $('noticias-pendentes').hidden = false;
  }
  aba = abas[0];
  preencher(opcoes);
  $('pasta').value = limparNome(aba?.title);
  pacotes = dadosPacotes.lista;
  sugestaoPacote = sugerirNomePacote(aba?.url);
  desenharPacotes(dadosPacotes.escolha);

  const atalho = comandos.find((c) => c.name === 'iniciar-captura')?.shortcut;
  if (atalho) {
    $('atalho').textContent = ' Atalho: ';
    for (const [i, tecla] of atalho.split('+').entries()) {
      if (i) $('atalho').append('+');
      const kbd = document.createElement('kbd');
      kbd.textContent = tecla;
      $('atalho').append(kbd);
    }
  }

  const { bloqueio, aviso } = verificarPagina(aba?.url);
  if (bloqueio) {
    mostrarAviso(bloqueio, 'erro');
    $('iniciar').disabled = true;
  } else if (aviso) {
    mostrarAviso(aviso);
  }

  if (status?.ativo) mostrarStatus(status);
}

$('iniciar').addEventListener('click', async () => {
  const opcoes = coletar();
  preencher(opcoes);
  await salvarOpcoes(opcoes);
  const pasta = limparNome($('pasta').value || aba?.title);
  $('pasta').value = pasta;
  const pacoteId = await resolverPacote();
  await guardarEscolha(pacoteId);
  mostrarStatus({ ativo: true, estado: 'capturando', total: 0, porcento: 0 });
  const resposta = await enviar({ tipo: 'iniciar', tabId: aba.id, pasta, opcoes, pacoteId });
  if (resposta?.erro) {
    mostrarConfig();
    mostrarAviso(resposta.erro, 'erro');
  }
});

$('parar').addEventListener('click', async () => {
  $('parar').disabled = true;
  $('status').textContent = 'Parando e salvando…';
  await enviar({ tipo: 'parar' });
});

$('nova').addEventListener('click', mostrarConfig);

$('aba-prints').addEventListener('click', () => mostrarAba('prints'));
$('aba-noticias').addEventListener('click', () => mostrarAba('noticias'));
document.querySelector('.abas').addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  const proxima = $('aba-prints').getAttribute('aria-selected') === 'true' ? 'noticias' : 'prints';
  mostrarAba(proxima);
  $(`aba-${proxima}`).focus();
});
$('abrir-noticias').addEventListener('click', () => abrirPagina('noticias.html'));
$('abrir-pacotes').addEventListener('click', () => abrirPagina('pacotes.html'));
$('pacote-opcoes').addEventListener('change', atualizarDestino);
$('novo-pacote').addEventListener('input', atualizarDestino);
$('pasta').addEventListener('input', atualizarDestino);
$('novo-pacote').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !$('iniciar').disabled) $('iniciar').click();
});

$('restaurar').addEventListener('click', async () => {
  preencher(OPCOES_PADRAO);
  await salvarOpcoes(OPCOES_PADRAO);
});

$('pasta').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !$('iniciar').disabled) $('iniciar').click();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.tipo === 'progresso' && msg.status.tabId === aba?.id && $('tela-config').hidden) mostrarStatus(msg.status);
});

main();
