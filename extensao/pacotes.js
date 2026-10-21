// Pacotes de prints: grupos com nome, escolhidos antes da captura. Cada pacote
// é uma pasta principal (dentro da pasta escolhida para os pacotes, ou de
// Downloads) com os ZIPs numerados na ordem e o "Índice do pacote.txt".
// A lista fica no armazenamento da extensão (chrome.storage.local, "pacotes").
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

// ZIP solto (sem pacote): "Nome.zip" direto em Downloads.
export const nomeSolto = (nome) => `${nomeParaDownload(nome)}.zip`;

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

const dois = (n) => String(n).padStart(2, '0');

// Sugestão para um pacote novo: site e data, como "ConJur 07-10-2026".
export function sugerirNomePacote(url, quando = new Date()) {
  const data = `${dois(quando.getDate())}-${dois(quando.getMonth() + 1)}-${quando.getFullYear()}`;
  const site = /^https?:/i.test(url || '') ? nomeDoSite(url) : '';
  return pastaDoPacote(site ? `${site} ${data}` : `Pacote ${data}`);
}

// No Windows "STF Outubro" e "stf outubro" são a mesma pasta: viram o mesmo pacote.
export const chaveDoNome = (nome) =>
  pastaDoPacote(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const NOME_INDICE = 'Índice do pacote.txt';

// Número da matéria no pacote: o que ela já tem, ou o próximo da sequência.
export function proximoNumero(pacote, sessaoId) {
  const itens = pacote?.itens || [];
  const ja = itens.find((i) => i.sessaoId === sessaoId)?.numero;
  if (ja) return ja;
  return Math.max(0, ...itens.map((i) => i.numero || 0)) + 1;
}

// Nome do ZIP dentro do pacote: "01 - Título da matéria.zip".
export const nomeNoPacote = (numero, nome) => `${dois(numero)} - ${nomeParaDownload(nome, { limite: 90 })}.zip`;

const dataHora = (ms) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Conteúdo do "Índice do pacote.txt" (identifica a pasta e lista as matérias).
// No ZIP do pacote exportado cada matéria é uma pasta (comoPasta); faltando
// são as matérias que ficaram de fora dele.
export function textoDoIndice(pacote, { comoPasta = false, faltando = [] } = {}) {
  const itens = [...(pacote.itens || [])].sort(porNumero);
  const linhas = [
    `Pacote: ${pacote.nome}`,
    `Criado em: ${dataHora(pacote.criado)}`,
    `Atualizado em: ${dataHora(pacote.atualizado)}`,
    `Matérias: ${itens.length}`,
    '',
  ];
  for (const i of itens) {
    linhas.push(
      comoPasta ? `${i.arquivo.replace(/\.zip$/i, '')}/` : i.arquivo,
      `    Página: ${i.titulo || '(sem título)'}`,
      `    Endereço: ${i.url || ''}`,
      `    Capturada em: ${dataHora(i.data)} · ${i.total} ${i.total === 1 ? 'print' : 'prints'}`,
    );
    if (faltando.some((f) => f.sessaoId === i.sessaoId)) linhas.push('    (fora deste ZIP: os prints não estão mais guardados na extensão)');
    linhas.push('');
  }
  linhas.push('Gerado pela extensão Ferramentas Fanjas (Prints com rolagem).');
  return `\uFEFF${linhas.join('\r\n')}\r\n`;
}

// Ordem das matérias no pacote (capturas antigas, sem número, pela data).
export const porNumero = (a, b) => (a.numero || Infinity) - (b.numero || Infinity) || a.data - b.data;

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

// Tira o ZIP da lista do pacote (o arquivo continua na pasta). Devolve o
// pacote como ficou, para atualizar o índice.
export const tirarDoPacote = (pacoteId, sessaoId) =>
  emFila(async () => {
    const dados = await ler();
    const pacote = dados.lista.find((p) => p.id === pacoteId);
    if (!pacote?.itens.some((i) => i.sessaoId === sessaoId)) return null;
    pacote.itens = pacote.itens.filter((i) => i.sessaoId !== sessaoId);
    pacote.atualizado = Date.now();
    await gravar(dados);
    return pacote;
  });

// Tira o pacote da lista (a pasta e os ZIPs continuam no disco).
export const excluirPacote = (id) =>
  emFila(async () => {
    const dados = await ler();
    dados.lista = dados.lista.filter((p) => p.id !== id);
    if (dados.escolha === id) dados.escolha = null;
    await gravar(dados);
  });
