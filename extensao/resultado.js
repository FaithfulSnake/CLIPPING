import { avisoMotivo, nomePrint, textoInfo } from './comum.js';
import { apagarSessao, lerPrints, lerSessao, salvarSessao } from './db.js';
import { caminhoDoZip, criarPacote, lerPacotes, referencia, registrarZip, sugerirNomePacote, tirarDoPacote } from './pacotes.js';
import { criarZip } from './zip.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('sessao');
const urls = [];

let sessao = null;
let prints = [];
let zip = null;
let pacotes = [];

const estado = (texto) => ($('estado').textContent = texto);

async function montarZip() {
  const pasta = sessao.pasta;
  const entradas = [{ nome: `${pasta}/` }];
  for (const [i, blob] of prints.entries()) {
    entradas.push({
      nome: `${pasta}/${nomePrint(i + 1, prints.length, sessao.formato)}`,
      dados: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  if (sessao.incluirInfo) {
    entradas.push({ nome: `${pasta}/info.txt`, dados: new TextEncoder().encode(textoInfo({ ...sessao, total: prints.length })) });
  }
  return criarZip(entradas, new Date(sessao.data));
}

// Plano B, sem a API de downloads: baixa direto em Downloads (sem pasta).
function baixarPorLink(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function esperarDownload(idDownload) {
  return new Promise((pronto) => {
    const terminar = (situacao, erro) => {
      chrome.downloads.onChanged.removeListener(ouvir);
      pronto({ situacao, erro });
    };
    const ouvir = (d) => {
      if (d.id === idDownload && d.state && d.state.current !== 'in_progress') terminar(d.state.current, d.error?.current);
    };
    chrome.downloads.onChanged.addListener(ouvir);
    // pode ter terminado antes de o ouvinte entrar
    chrome.downloads.search({ id: idDownload }).then(([d]) => {
      if (d && d.state !== 'in_progress') terminar(d.state, d.error);
    });
  });
}

// Salva o ZIP em Downloads/<caminho> (o navegador cria a pasta do pacote).
// Devolve { id, nome } do arquivo salvo; o nome muda para "Nome (1).zip" se já existir.
async function salvarNoDisco(caminho) {
  const url = URL.createObjectURL(zip);
  try {
    const idDownload = await chrome.downloads.download({ url, filename: caminho, conflictAction: 'uniquify', saveAs: false });
    const fim = await esperarDownload(idDownload);
    if (fim.situacao !== 'complete') {
      throw new Error(fim.erro === 'USER_CANCELED' ? 'o download foi cancelado' : `o download falhou (${fim.erro || 'sem detalhes'})`);
    }
    const [item] = await chrome.downloads.search({ id: idDownload });
    return { id: idDownload, nome: item?.filename.split(/[\\/]/).pop() || caminho.split('/').pop() };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function salvar(pasta) {
  zip ??= await montarZip();
  const caminho = caminhoDoZip(pasta, sessao.pasta);
  if (!globalThis.chrome?.downloads?.download) {
    baixarPorLink(zip, caminho.split('/').pop());
    return { id: null, nome: caminho.split('/').pop(), pasta: '' };
  }
  try {
    return { ...(await salvarNoDisco(caminho)), pasta: pasta || '' };
  } catch (e) {
    if (!/invalid filename/i.test(e.message)) throw e;
    // nome recusado pelo navegador: usa um nome simples na mesma pasta
    return { ...(await salvarNoDisco(caminho.replace(/[^/]+$/, `prints-${sessao.id}.zip`))), pasta: pasta || '' };
  }
}

const itemDoPacote = () => ({
  sessaoId: sessao.id,
  downloadId: sessao.download?.id ?? null,
  arquivo: sessao.download?.nome || `${sessao.pasta}.zip`,
  titulo: sessao.titulo,
  url: sessao.url,
  total: prints.length,
  data: sessao.data,
});

// Apaga do disco a cópia anterior (é o mesmo ZIP, já salvo no lugar novo).
async function apagarArquivo(idDownload) {
  try {
    const [d] = await chrome.downloads.search({ id: idDownload });
    if (d?.exists && d.state === 'complete') await chrome.downloads.removeFile(idDownload);
    await chrome.downloads.erase({ id: idDownload });
    return Boolean(d?.exists);
  } catch {
    return false;
  }
}

function ocupado(sim) {
  for (const botao of ['baixar', 'mover', 'apagar']) $(botao).disabled = sim;
  if (!sim) atualizarBotaoMover();
}

function mostrarDestino() {
  const d = sessao.download;
  if (d) $('destino-texto').textContent = `Salvo em Downloads/${d.pasta ? `${d.pasta}/` : ''}${d.nome}`;
  else if (sessao.baixado) $('destino-texto').textContent = 'Baixado na pasta Downloads.';
  else $('destino-texto').textContent = 'O ZIP ainda não foi baixado.';
  $('mostrar').hidden = !d?.id;
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
  const baixado = Boolean(sessao.download || sessao.baixado);
  $('mover').textContent = baixado ? 'Mover para este pacote' : 'Salvar neste pacote';
  $('mover').disabled = baixado && valor !== 'novo' && valor === (sessao.pacote?.id ?? '');
  $('pacote-novo').hidden = valor !== 'novo';
}

async function baixarZip() {
  ocupado(true);
  estado('Montando o ZIP…');
  try {
    const salvo = await salvar(sessao.pacote?.pasta);
    sessao.download = salvo.id ? salvo : null;
    sessao.baixado = true;
    await salvarSessao(sessao);
    if (sessao.pacote && salvo.id) await registrarZip(sessao.pacote, itemDoPacote());
    estado(
      sessao.pacote && !salvo.id
        ? 'O navegador não deixou criar a pasta do pacote: o ZIP foi salvo direto em Downloads.'
        : `Pronto: a pasta “${sessao.pasta}” dentro do ZIP tem os prints numerados na ordem da página.`,
    );
    mostrarDestino();
    await desenharPacotes();
  } catch (e) {
    estado(`Não foi possível salvar o ZIP: ${e.message}`);
  } finally {
    ocupado(false);
  }
}

// Põe o ZIP no pacote escolhido (ou tira de pacote). Se já estava salvo em
// outro lugar, a cópia antiga é apagada depois que a nova estiver salva.
async function moverParaPacote() {
  const valor = $('pacote-select').value;
  ocupado(true);
  estado('Salvando…');
  try {
    let destino = null;
    if (valor === 'novo') destino = referencia(await criarPacote($('pacote-novo').value.trim() || sugerirNomePacote(sessao.url)));
    else if (valor) destino = referencia(pacotes.find((p) => p.id === valor) ?? (sessao.pacote?.id === valor ? sessao.pacote : null));
    const anterior = { pacote: sessao.pacote, download: sessao.download, baixado: sessao.baixado };

    const salvo = await salvar(destino?.pasta);
    sessao.pacote = destino;
    sessao.download = salvo.id ? salvo : null;
    sessao.baixado = true;
    await salvarSessao(sessao);
    if (anterior.pacote && anterior.pacote.id !== destino?.id) await tirarDoPacote(anterior.pacote.id, sessao.id);
    if (destino && salvo.id) await registrarZip(destino, itemDoPacote());

    let mensagem = destino ? `ZIP salvo no pacote “${destino.nome}”.` : 'ZIP salvo solto em Downloads.';
    if (anterior.download?.id && anterior.download.id !== salvo.id) {
      if (await apagarArquivo(anterior.download.id)) mensagem += ' A cópia que estava no lugar anterior foi apagada.';
    } else if (anterior.baixado && !anterior.download) {
      mensagem += ' A cópia baixada antes continua em Downloads; apague-a se quiser.';
    }
    estado(mensagem);
    $('pacote-novo').value = '';
    mostrarDestino();
    await desenharPacotes();
  } catch (e) {
    estado(`Não foi possível salvar no pacote: ${e.message}`);
  } finally {
    ocupado(false);
  }
}

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
    estado('Ela pode ter sido apagada (a extensão guarda só as 5 capturas mais recentes). O ZIP já salvo continua na pasta Downloads.');
    return;
  }
  prints = await lerPrints(id);
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

  $('baixar').addEventListener('click', baixarZip);
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
    const [d] = await chrome.downloads.search({ id: sessao.download.id });
    if (!d?.exists) {
      estado('O arquivo não está mais lá: foi apagado ou movido. Use “Baixar ZIP” para salvar de novo.');
      return;
    }
    chrome.downloads.show(sessao.download.id);
  });
  $('apagar').addEventListener('click', async () => {
    if (!confirm('Apagar estes prints da memória da extensão? O ZIP já baixado não é afetado.')) return;
    await apagarSessao(id);
    for (const url of urls) URL.revokeObjectURL(url);
    $('grade').replaceChildren();
    $('baixar').disabled = $('apagar').disabled = $('mover').disabled = true;
    estado('Prints apagados da memória da extensão.');
  });
  ocupado(false);

  if (sessao.baixarAuto && !sessao.baixado) await baixarZip();
}

main().catch((e) => {
  estado(`Erro ao abrir a captura: ${e.message}`);
});
