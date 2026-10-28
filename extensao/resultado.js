import { avisoMotivo, nomePrint } from './comum.js';
import { apagarSessao, atualizarSessao, lerPrints, lerSessao } from './db.js';
import {
  acesso,
  apagarCopia,
  apagarDownload,
  atualizarIndice,
  baixarArquivo,
  copiaExiste,
  dentroDaPasta,
  explicarErro,
  gravarNaPasta,
  lerDestino,
  lerPergunta,
  maiorNumeroNaPasta,
  nomeDoCaminho,
} from './destino.js';
import { zipDaCaptura } from './exportar.js';
import { criarPacote, lerPacotes, nomeNoPacote, nomeSolto, proximoNumero, referencia, registrarZip, sugerirNomePacote, tirarDoPacote } from './pacotes.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('sessao');
const urls = [];

let sessao = null;
let prints = [];
let pacotes = [];
let destino = { modo: 'downloads', pasta: null, nome: 'Downloads' };
let zipFeito = null; // { chave, blob }: o info.txt do ZIP cita o pacote, então muda com ele
let alertaAberto = '';

const estado = (texto) => ($('estado').textContent = texto);

class SemAcesso extends Error {}

// ---------------------------------------------------------------- alertas

function alertar(tipo, texto, acoes = []) {
  $('alerta-texto').textContent = texto;
  $('alerta-acoes').replaceChildren(
    ...acoes.map(([rotulo, acao, primario]) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: rotulo, className: primario ? 'primario' : '' });
      b.addEventListener('click', acao);
      return b;
    }),
  );
  $('alerta').hidden = false;
  alertaAberto = tipo;
}

function fecharAlerta(tipo) {
  if (tipo && tipo !== alertaAberto) return;
  $('alerta').hidden = true;
  alertaAberto = '';
}

const abrirGerenciador = () => chrome.tabs.create({ url: chrome.runtime.getURL('pacotes.html#destino') });

function avisarPergunta(pasta) {
  alertar(
    'pergunta',
    `O Chrome abre a janela “Salvar como” porque está configurado para perguntar onde salvar cada arquivo. Para o ZIP ficar no pacote, salve-o dentro da pasta “${pasta}” em Downloads (crie a pasta se ela não existir). Para não precisar fazer isso a cada ZIP, escolha uma pasta para os pacotes em Gerenciar pacotes: a extensão passa a gravar direto nela, com uma pasta para cada pacote.`,
    [
      ['Escolher pasta para os pacotes', abrirGerenciador, true],
      ['Configurações de download do Chrome', () => chrome.tabs.create({ url: 'chrome://settings/downloads' })],
    ],
  );
}

function pedirAcesso(ref) {
  alertar(
    'acesso',
    `Para salvar no pacote, o Chrome precisa confirmar que a extensão pode gravar na pasta “${destino.nome}” (ele pede isso de vez em quando, por exemplo depois de reabrir o navegador).`,
    [
      ['Permitir e salvar', () => salvarEm(ref), true],
      ['Salvar em Downloads desta vez', () => salvarEm(ref, { emDownloads: true })],
    ],
  );
}

// ---------------------------------------------------------------- onde está salvo

// Onde o ZIP desta captura foi salvo. As capturas da versão 1.3 guardavam isso em "download".
function salvoAtual() {
  if (sessao.salvo) return sessao.salvo;
  const d = sessao.download;
  if (d) return { local: 'downloads', id: d.id, arquivo: d.nome, pasta: d.pasta || '', pacoteId: d.pasta ? (sessao.pacote?.id ?? null) : null };
  if (sessao.baixado) return { local: 'downloads', id: null, arquivo: nomeSolto(sessao.pasta), pasta: '', pacoteId: null };
  return null;
}

const foraDaPasta = (s) => s.local === 'downloads' && s.pasta && s.completo && !dentroDaPasta(s.completo, s.pasta);

function onde(s) {
  if (s.local === 'pasta') return `${s.raiz}/${s.pasta}/${s.arquivo}`;
  if (s.completo && (s.perguntou || foraDaPasta(s))) return s.completo;
  return `Downloads/${s.pasta ? `${s.pasta}/` : ''}${s.arquivo}`;
}

function mostrarDestino() {
  const s = salvoAtual();
  if (!s) $('destino-texto').textContent = 'O ZIP ainda não foi salvo.';
  else if (s.pacoteId) $('destino-texto').textContent = `Salvo no pacote “${sessao.pacote?.nome || s.pasta}”: ${onde(s)}${foraDaPasta(s) ? ' (fora da pasta do pacote)' : ''}`;
  else $('destino-texto').textContent = `Salvo em ${onde(s)}`;
  $('mostrar').hidden = !(s?.local === 'downloads' && s.id != null);
  $('baixar').textContent = sessao.pacote ? 'Salvar no pacote' : 'Baixar ZIP';
}

async function desenharPacotes() {
  pacotes = (await lerPacotes()).lista;
  const opcoes = [
    new Option('Sem pacote (solto em Downloads)', ''),
    ...pacotes.map((p) => new Option(`${p.nome} (${p.itens.length} ${p.itens.length === 1 ? 'ZIP' : 'ZIPs'})`, p.id)),
    new Option('Novo pacote…', 'novo'),
  ];
  // o pacote desta captura pode ter sido excluído da lista: continua aparecendo
  if (sessao.pacote && !pacotes.some((p) => p.id === sessao.pacote.id)) opcoes.splice(1, 0, new Option(sessao.pacote.nome, sessao.pacote.id));
  $('pacote-select').replaceChildren(...opcoes);
  $('pacote-select').value = sessao.pacote?.id ?? '';
  atualizarBotaoMover();
}

function atualizarBotaoMover() {
  const valor = $('pacote-select').value;
  const salvo = Boolean(salvoAtual());
  if (valor) $('mover').textContent = salvo ? 'Mover para este pacote' : 'Salvar neste pacote';
  else $('mover').textContent = salvo ? 'Tirar do pacote (salvar solto)' : 'Salvar solto em Downloads';
  $('mover').disabled = salvo && valor !== 'novo' && valor === (sessao.pacote?.id ?? '');
  $('pacote-novo').hidden = valor !== 'novo';
}

function ocupado(sim) {
  for (const botao of ['baixar', 'mover', 'apagar']) $(botao).disabled = sim;
  if (!sim) atualizarBotaoMover();
}

// ---------------------------------------------------------------- salvar

async function zipPara(ref) {
  const chave = ref?.id ?? '';
  if (zipFeito?.chave !== chave) zipFeito = { chave, blob: await zipDaCaptura(sessao, prints, ref) };
  return zipFeito.blob;
}

// Downloads/<caminho>; um nome recusado pelo navegador vira um nome simples na mesma pasta.
async function baixar(blob, caminho, aoPerguntar, conflito = 'uniquify') {
  try {
    return await baixarArquivo(blob, caminho, { aoPerguntar, conflito });
  } catch (e) {
    if (!/invalid filename/i.test(e.message)) throw e;
    return baixarArquivo(blob, caminho.replace(/[^/]+$/, `prints-${sessao.id}.zip`), { aoPerguntar });
  }
}

async function salvarSolto() {
  const r = await baixar(await zipPara(null), nomeSolto(sessao.pasta));
  return { local: 'downloads', pacoteId: null, pasta: '', arquivo: nomeDoCaminho(r.completo) || nomeSolto(sessao.pasta), id: r.id, completo: r.completo, perguntou: r.perguntou };
}

// Grava o ZIP na pasta principal do pacote, numerado na ordem das matérias, e
// atualiza o "Índice do pacote.txt".
async function salvarNoPacote(ref, anterior, emDownloads) {
  const blob = await zipPara(ref);
  const pacote = (await lerPacotes()).lista.find((p) => p.id === ref.id);
  const naPasta = destino.modo === 'pasta' && !emDownloads;
  let numero = proximoNumero(pacote, sessao.id);
  // matéria nova: depois também do que ficou na pasta (ZIP tirado do pacote, pacote antigo com o mesmo nome)
  if (naPasta && !pacote?.itens.some((i) => i.sessaoId === sessao.id)) numero = Math.max(numero, (await maiorNumeroNaPasta(destino.pasta, ref.pasta)) + 1);
  const arquivo = nomeNoPacote(numero, sessao.pasta);
  const item = { sessaoId: sessao.id, numero, titulo: sessao.titulo, url: sessao.url, total: prints.length, data: sessao.data };

  if (naPasta) {
    await gravarNaPasta(destino.pasta, ref.pasta, arquivo, blob);
    const atualizado = await registrarZip(ref, { ...item, arquivo, local: 'pasta', raiz: destino.nome });
    await atualizarIndice(destino, atualizado, 'pasta');
    return { local: 'pasta', pacoteId: ref.id, pasta: ref.pasta, raiz: destino.nome, arquivo, numero };
  }
  // Salvar de novo no mesmo pacote troca o arquivo anterior (é o mesmo ZIP):
  // no mesmo lugar, o novo substitui; em outro (nome antigo, outra pasta), o antigo é apagado depois.
  let antigo = null;
  if (anterior?.local === 'downloads' && anterior.pacoteId === ref.id && anterior.id != null) [antigo] = await chrome.downloads.search({ id: anterior.id });
  const substituir = Boolean(antigo?.exists && dentroDaPasta(antigo.filename, ref.pasta) && nomeDoCaminho(antigo.filename) === arquivo);
  const r = await baixar(blob, `${ref.pasta}/${arquivo}`, () => avisarPergunta(ref.pasta), substituir ? 'overwrite' : 'uniquify');
  if (antigo && antigo.id !== r.id) {
    if (antigo.filename === r.completo) await chrome.downloads.erase({ id: antigo.id });
    else await apagarDownload(antigo.id);
  }
  const final = nomeDoCaminho(r.completo) || arquivo;
  const atualizado = await registrarZip(ref, { ...item, arquivo: final, local: 'downloads', downloadId: r.id });
  if (!r.perguntou) await atualizarIndice(destino, atualizado, 'downloads');
  return { local: 'downloads', pacoteId: ref.id, pasta: ref.pasta, arquivo: final, numero, id: r.id, completo: r.completo, perguntou: r.perguntou };
}

const mesmoLugar = (a, b) => a.local === b.local && (a.pacoteId ?? null) === (b.pacoteId ?? null);

// O ZIP estava em outro lugar: apaga a cópia antiga (é o mesmo ZIP) e tira a
// captura do pacote de onde ela saiu.
async function tirarDoLugarAnterior(anterior, novo) {
  let texto = '';
  if (await apagarCopia(destino, anterior)) texto = ' A cópia que estava no lugar anterior foi apagada.';
  else if ((await copiaExiste(destino, anterior)) !== false) texto = ` A cópia anterior continua em ${onde(anterior)}; apague-a se não precisar dela.`;
  if (anterior.pacoteId && anterior.pacoteId !== novo.pacoteId) {
    const saiu = await tirarDoPacote(anterior.pacoteId, sessao.id);
    if (saiu) await atualizarIndice(destino, saiu, anterior.local);
  }
  return texto;
}

// Salva o ZIP no pacote ref (ou solto em Downloads, se ref for null).
async function salvarEm(ref, { emDownloads = false } = {}) {
  ocupado(true);
  fecharAlerta('acesso');
  try {
    destino = await lerDestino();
    if (ref && destino.modo === 'pasta' && !emDownloads) {
      // logo depois de um clique o Chrome deixa pedir a permissão; sem clique, mostra o botão
      if ((await acesso(destino.pasta, navigator.userActivation?.isActive)) !== 'granted') throw new SemAcesso();
    } else if (ref && (await lerPergunta())) {
      avisarPergunta(ref.pasta); // a janela "Salvar como" vai abrir
    }
    estado('Montando o ZIP…');
    const anterior = salvoAtual();
    const novo = ref ? await salvarNoPacote(ref, anterior, emDownloads) : await salvarSolto();
    Object.assign(sessao, { salvo: novo, baixado: true, pacote: ref });
    delete sessao.download;
    // só os campos do ZIP: a transcrição da mesma captura pode estar gravando os dela
    await atualizarSessao(sessao.id, { salvo: novo, baixado: true, pacote: ref, download: undefined });
    if (!novo.perguntou) fecharAlerta('pergunta');

    let mensagem = ref
      ? `Pronto: ZIP nº ${novo.numero} do pacote “${ref.nome}”. Dentro dele, a pasta “${sessao.pasta}” tem os prints numerados na ordem da página.`
      : `Pronto: a pasta “${sessao.pasta}” dentro do ZIP tem os prints numerados na ordem da página.`;
    if (foraDaPasta(novo)) mensagem += ` Atenção: ele foi salvo fora da pasta “${ref.pasta}” do pacote.`;
    if (anterior && !mesmoLugar(anterior, novo)) mensagem += await tirarDoLugarAnterior(anterior, novo);
    estado(mensagem);
  } catch (e) {
    if (e instanceof SemAcesso) {
      estado('');
      pedirAcesso(ref);
    } else {
      estado(`Não foi possível salvar o ZIP: ${explicarErro(e, destino)}.`);
    }
  } finally {
    ocupado(false);
    mostrarDestino();
    await desenharPacotes();
  }
}

async function moverParaPacote() {
  const valor = $('pacote-select').value;
  let ref = null;
  if (valor === 'novo') ref = referencia(await criarPacote($('pacote-novo').value.trim() || sugerirNomePacote(sessao.url)));
  else if (valor) ref = referencia(pacotes.find((p) => p.id === valor) ?? (sessao.pacote?.id === valor ? sessao.pacote : null));
  await salvarEm(ref);
  if (valor === 'novo') $('pacote-novo').value = '';
}

// ---------------------------------------------------------------- página

function mostrarGrade() {
  const grade = $('grade');
  for (const [i, blob] of prints.entries()) {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const nome = nomePrint(i + 1, prints.length, sessao.formato);
    const figura = document.createElement('figure');
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.title = `Abrir ${nome} em tamanho real`;
    const img = document.createElement('img');
    img.src = url;
    img.alt = `Print ${i + 1}`;
    img.loading = 'lazy';
    if (sessao.largura) {
      img.width = sessao.largura;
      img.height = sessao.altura;
    }
    const legenda = document.createElement('figcaption');
    legenda.textContent = nome;
    link.append(img);
    figura.append(link, legenda);
    grade.append(figura);
  }
}

async function main() {
  sessao = id ? await lerSessao(id) : null;
  if (!sessao) {
    $('pasta').textContent = 'Captura não encontrada';
    $('destino-texto').textContent = '';
    estado('Ela pode ter sido apagada (a extensão guarda as 5 capturas mais recentes fora de pacotes). O ZIP já salvo continua no disco.');
    return;
  }
  prints = await lerPrints(id);
  destino = await lerDestino();
  document.title = `${sessao.pasta} – ${prints.length} prints`;
  $('pasta').textContent = sessao.pasta;

  const detalhes = $('detalhes');
  const partes = [`${prints.length} ${prints.length === 1 ? 'print' : 'prints'}`];
  if (sessao.largura) partes.push(`${sessao.largura} × ${sessao.altura} px`);
  partes.push(new Date(sessao.data).toLocaleString('pt-BR'));
  detalhes.textContent = `${partes.join(' · ')} · `;
  const link = document.createElement('a');
  link.href = sessao.url;
  link.textContent = sessao.titulo || sessao.url;
  link.target = '_blank';
  link.rel = 'noopener';
  detalhes.append(link);

  const aviso = avisoMotivo({ ...sessao, total: prints.length });
  if (aviso) {
    $('aviso').textContent = aviso;
    $('aviso').hidden = false;
  }

  mostrarGrade();
  mostrarDestino();
  await desenharPacotes();

  $('baixar').addEventListener('click', () => salvarEm(sessao.pacote));
  $('mover').addEventListener('click', moverParaPacote);
  $('pacote-select').addEventListener('change', () => {
    atualizarBotaoMover();
    if ($('pacote-select').value === 'novo') {
      $('pacote-novo').value ||= sugerirNomePacote(sessao.url);
      $('pacote-novo').focus();
      $('pacote-novo').select();
    }
  });
  $('pacote-novo').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !$('mover').disabled) moverParaPacote();
  });
  $('mostrar').addEventListener('click', async () => {
    const s = salvoAtual();
    const [d] = await chrome.downloads.search({ id: s.id });
    if (!d?.exists) {
      estado(`O arquivo não está mais lá: foi apagado ou movido. Use “${$('baixar').textContent}” para salvar de novo.`);
      return;
    }
    chrome.downloads.show(s.id);
  });
  $('apagar').addEventListener('click', async () => {
    if (!confirm('Apagar estes prints da memória da extensão? O ZIP já salvo não é afetado.')) return;
    await apagarSessao(id);
    for (const url of urls) URL.revokeObjectURL(url);
    $('grade').replaceChildren();
    $('baixar').disabled = $('apagar').disabled = $('mover').disabled = true;
    estado('Prints apagados da memória da extensão.');
  });
  ocupado(false);

  // captura feita só para o e-mail de notícias: os prints ficam para conferir, sem ZIP automático
  if (sessao.baixarAuto && sessao.zip !== false && !salvoAtual()) await salvarEm(sessao.pacote);
}

main().catch((e) => {
  estado(`Erro ao abrir a captura: ${e.message}`);
});
