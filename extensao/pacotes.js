// Pacotes de prints: grupos com nome, escolhidos antes da captura. Os ZIPs de
// um pacote são salvos em Downloads/<pasta do pacote>/. A lista fica no
// armazenamento da extensão (chrome.storage.local, chave "pacotes").
import { limparNome } from './comum.js';

const CHAVE = 'pacotes';
export const LIMITE_PASTA = 60;

// Nome aceito como pasta ou arquivo pelo chrome.downloads: além do que o
// Windows proíbe, o Chrome recusa caracteres invisíveis (como o espaço de
// largura zero), nome começando com ponto e terminações como ".lnk" e ".local".
export function nomeParaDownload(nome, { limite = 100, padrao = 'prints' } = {}) {
  let s = String(nome ?? '')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/~/g, '-')
    .replace(/^[\s.]+/, '')
    .trim();
  s = Array.from(s).slice(0, limite).join('').replace(/[\s.]+$/, '');
  if (/\.(lnk|local|\{[^.]*)$/i.test(s)) s = s.replace(/\.(?=[^.]*$)/, ' ');
  return limparNome(s, padrao);
}

export const pastaDoPacote = (nome) => nomeParaDownload(nome, { limite: LIMITE_PASTA, padrao: 'Pacote' });

// Caminho relativo à pasta Downloads: "Pacote/Nome.zip", ou só "Nome.zip".
export function caminhoDoZip(pasta, nome) {
  const arquivo = `${nomeParaDownload(nome)}.zip`;
  return pasta ? `${pastaDoPacote(pasta)}/${arquivo}` : arquivo;
}

const SITES = [
  [/(^|\.)conjur\.com\.br$/, 'ConJur'],
  [/(^|\.)jota\.info$/, 'JOTA'],
  [/(^|\.)migalhas\.com\.br$/, 'Migalhas'],
  [/(^|\.)valor\.globo\.com$/, 'Valor'],
  [/(^|\.)stf\.jus\.br$/, 'STF'],
  [/(^|\.)stj\.jus\.br$/, 'STJ'],
  [/(^|\.)tst\.jus\.br$/, 'TST'],
];

export function nomeDoSite(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\d*\./, '');
    return SITES.find(([re]) => re.test(host))?.[1] || host;
  } catch {
    return '';
  }
}

// Sugestão para um pacote novo: site e data, como "ConJur 07-10-2026".
export function sugerirNomePacote(url, quando = new Date()) {
  const dois = (n) => String(n).padStart(2, '0');
  const data = `${dois(quando.getDate())}-${dois(quando.getMonth() + 1)}-${quando.getFullYear()}`;
  const site = /^https?:/i.test(url || '') ? nomeDoSite(url) : '';
  return pastaDoPacote(site ? `${site} ${data}` : `Pacote ${data}`);
}

// No Windows "STF Outubro" e "stf outubro" são a mesma pasta: viram o mesmo pacote.
const chaveDoNome = (nome) =>
  pastaDoPacote(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Referência curta guardada junto da captura.
export const referencia = (pacote) => (pacote ? { id: pacote.id, nome: pacote.nome, pasta: pacote.pasta } : null);

// ---------------------------------------------------------------- armazenamento

// Uma alteração por vez nesta página, para uma não apagar a outra.
let fila = Promise.resolve();
function emFila(tarefa) {
  const vez = fila.then(tarefa, tarefa);
  fila = vez.catch(() => {});
  return vez;
}

async function ler() {
  const { [CHAVE]: dados } = await chrome.storage.local.get(CHAVE);
  return {
    lista: Array.isArray(dados?.lista) ? dados.lista : [],
    escolha: dados?.escolha ?? null,
  };
}

const gravar = (dados) => chrome.storage.local.set({ [CHAVE]: dados });

// Lista (mais recentes primeiro) e o pacote escolhido para a próxima captura.
export async function lerPacotes() {
  const dados = await ler();
  dados.lista.sort((a, b) => b.atualizado - a.atualizado);
  if (dados.escolha && !dados.lista.some((p) => p.id === dados.escolha)) dados.escolha = null;
  return dados;
}

// Cria o pacote; se já existe um com o mesmo nome de pasta, devolve esse.
export const criarPacote = (nome) =>
  emFila(async () => {
    const dados = await ler();
    const pasta = pastaDoPacote(nome);
    const existente = dados.lista.find((p) => chaveDoNome(p.pasta) === chaveDoNome(pasta));
    if (existente) return existente;
    const agora = Date.now();
    const pacote = {
      id: `p${agora.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      nome: pasta,
      pasta,
      criado: agora,
      atualizado: agora,
      itens: [],
    };
    dados.lista.push(pacote);
    await gravar(dados);
    return pacote;
  });

export const guardarEscolha = (id) =>
  emFila(async () => {
    const dados = await ler();
    dados.escolha = id || null;
    await gravar(dados);
  });

// Anota um ZIP salvo na pasta do pacote (a mesma captura não se repete).
// Se o pacote foi excluído enquanto a captura rodava, ele volta à lista.
export const registrarZip = (ref, item) =>
  emFila(async () => {
    const dados = await ler();
    let pacote = dados.lista.find((p) => p.id === ref.id);
    if (!pacote) {
      pacote = { ...ref, criado: Date.now(), atualizado: Date.now(), itens: [] };
      dados.lista.push(pacote);
    }
    pacote.itens = pacote.itens.filter((i) => i.sessaoId !== item.sessaoId);
    pacote.itens.push(item);
    pacote.atualizado = Date.now();
    await gravar(dados);
    return pacote;
  });

// Tira o ZIP da lista do pacote (o arquivo continua na pasta).
export const tirarDoPacote = (pacoteId, sessaoId) =>
  emFila(async () => {
    const dados = await ler();
    const pacote = dados.lista.find((p) => p.id === pacoteId);
    if (!pacote) return;
    pacote.itens = pacote.itens.filter((i) => i.sessaoId !== sessaoId);
    await gravar(dados);
  });

// Tira o pacote da lista (a pasta e os ZIPs continuam em Downloads).
export const excluirPacote = (id) =>
  emFila(async () => {
    const dados = await ler();
    dados.lista = dados.lista.filter((p) => p.id !== id);
    if (dados.escolha === id) dados.escolha = null;
    await gravar(dados);
  });
