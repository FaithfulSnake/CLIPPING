// Onde os pacotes são gravados: na pasta Downloads do navegador (padrão) ou
// numa pasta escolhida pelo usuário, que a extensão grava direto, sem a
// janela "Salvar como" do Chrome (que ignora a pasta do pacote quando a opção
// "Perguntar onde salvar cada arquivo" está ligada). Só para páginas da extensão.
import { gravarAjuste, lerAjuste } from './db.js';
import { NOME_INDICE, textoDoIndice } from './pacotes.js';

export async function lerDestino() {
  const d = await lerAjuste('destinoPacotes');
  return d?.modo === 'pasta' && d.pasta ? { modo: 'pasta', pasta: d.pasta, nome: d.pasta.name } : { modo: 'downloads', pasta: null, nome: 'Downloads' };
}

export const salvarDestino = (destino) =>
  gravarAjuste('destinoPacotes', destino.modo === 'pasta' && destino.pasta ? { modo: 'pasta', pasta: destino.pasta } : { modo: 'downloads' });

// Situação do acesso à pasta: 'granted', 'prompt' ou 'denied'.
// pedir=true pergunta ao usuário (só funciona logo depois de um clique).
export async function acesso(pasta, pedir = false) {
  try {
    let situacao = await pasta.queryPermission({ mode: 'readwrite' });
    if (situacao === 'prompt' && pedir) situacao = await pasta.requestPermission({ mode: 'readwrite' });
    return situacao;
  } catch {
    return 'denied';
  }
}

// O Chrome pediu para escolher onde salvar (opção "Perguntar onde salvar
// cada arquivo" ligada)? Anotado no último download feito pela extensão.
export const lerPergunta = async () => Boolean(await lerAjuste('perguntaAoBaixar'));

// Mensagem de erro de gravação em português.
export function explicarErro(e, destino) {
  if (e?.name === 'NotFoundError') return `a pasta “${destino?.nome || ''}” não foi encontrada (foi apagada, renomeada ou movida?). Escolha a pasta de novo em Gerenciar pacotes`;
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'o navegador não deu permissão para gravar na pasta';
  if (e?.name === 'QuotaExceededError') return 'não há espaço livre no disco';
  if (e?.name === 'NoModificationAllowedError' || e?.name === 'InvalidStateError') return 'o arquivo está aberto em outro programa ou a pasta não aceita gravação';
  return e?.message || String(e);
}

// ---------------------------------------------------------------- pasta escolhida

// Grava <base>/<pastaDoPacote>/<arquivo> (sem pastaDoPacote, direto na base).
export async function gravarNaPasta(base, pastaDoPacote, arquivo, blob) {
  const pasta = pastaDoPacote ? await base.getDirectoryHandle(pastaDoPacote, { create: true }) : base;
  const alvo = await pasta.getFileHandle(arquivo, { create: true });
  const escrita = await alvo.createWritable();
  try {
    await escrita.write(blob);
    await escrita.close();
  } catch (e) {
    await escrita.abort().catch(() => {});
    throw e;
  }
}

export async function apagarDaPasta(base, pastaDoPacote, arquivo) {
  try {
    await (await base.getDirectoryHandle(pastaDoPacote)).removeEntry(arquivo);
    return true;
  } catch {
    return false;
  }
}

export async function existeNaPasta(base, pastaDoPacote, arquivo) {
  try {
    await (await base.getDirectoryHandle(pastaDoPacote)).getFileHandle(arquivo);
    return true;
  } catch {
    return false;
  }
}

// Maior número de matéria ("07 - …") que já está na pasta do pacote, para um
// ZIP novo nunca cair em cima de um que ficou lá (0 se a pasta ainda não existe).
export async function maiorNumeroNaPasta(base, pastaDoPacote) {
  let maior = 0;
  try {
    for await (const nome of (await base.getDirectoryHandle(pastaDoPacote)).keys()) {
      const n = Number(/^(\d+) - /.exec(nome)?.[1] || 0);
      if (n > maior) maior = n;
    }
  } catch {
    // pasta ainda não existe
  }
  return maior;
}

export async function lerDaPasta(base, pastaDoPacote, arquivo) {
  return (await (await base.getDirectoryHandle(pastaDoPacote)).getFileHandle(arquivo)).getFile();
}

const blobDoIndice = (pacote) => new Blob([textoDoIndice(pacote)], { type: 'text/plain;charset=utf-8' });

// Cria a pasta principal do pacote (se ainda não existe) com o índice atualizado.
export const gravarIndice = (base, pacote) => gravarNaPasta(base, pacote.pasta, NOME_INDICE, blobDoIndice(pacote));

// ---------------------------------------------------------------- pasta Downloads

function esperarDownload(id) {
  return new Promise((pronto) => {
    const terminar = (situacao, erro) => {
      chrome.downloads.onChanged.removeListener(ouvir);
      pronto({ situacao, erro });
    };
    const ouvir = (d) => {
      if (d.id === id && d.state && d.state.current !== 'in_progress') terminar(d.state.current, d.error?.current);
    };
    chrome.downloads.onChanged.addListener(ouvir);
    // pode ter terminado antes de o ouvinte entrar
    chrome.downloads.search({ id }).then(([d]) => {
      if (d && d.state !== 'in_progress') terminar(d.state, d.error);
    });
  });
}

// Baixa para Downloads/<caminho>. Se o Chrome abrir a janela "Salvar como",
// chama aoPerguntar() enquanto ela está aberta. Devolve o id, o caminho
// completo onde o arquivo ficou e se o Chrome perguntou.
export async function baixarArquivo(blob, caminho, { conflito = 'uniquify', aoPerguntar } = {}) {
  const url = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({ url, filename: caminho, conflictAction: conflito, saveAs: false });
    let perguntou = false;
    // Sem a janela, o Chrome define o nome do arquivo na hora; com ela, o
    // download fica parado e sem nome até o usuário escolher.
    const vigia = setTimeout(async () => {
      const [d] = await chrome.downloads.search({ id });
      if (d?.state === 'in_progress' && !d.filename) {
        perguntou = true;
        aoPerguntar?.();
      }
    }, 1000);
    const fim = await esperarDownload(id);
    clearTimeout(vigia);
    await gravarAjuste('perguntaAoBaixar', perguntou).catch(() => {});
    if (fim.situacao !== 'complete') {
      throw new Error(fim.erro === 'USER_CANCELED' ? 'o download foi cancelado' : `o download falhou (${fim.erro || 'sem detalhes'})`);
    }
    const [item] = await chrome.downloads.search({ id });
    return { id, completo: item?.filename || '', perguntou };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Apaga do disco um arquivo baixado e tira do histórico de downloads.
export async function apagarDownload(id) {
  try {
    const [d] = await chrome.downloads.search({ id });
    if (d?.exists && d.state === 'complete') await chrome.downloads.removeFile(id);
    await chrome.downloads.erase({ id });
    return Boolean(d?.exists);
  } catch {
    return false;
  }
}

const partes = (completo) => String(completo || '').split(/[\\/]/);

// O arquivo baixado ficou dentro da pasta do pacote?
export const dentroDaPasta = (completo, pastaDoPacote) => partes(completo).at(-2) === pastaDoPacote;

export const nomeDoCaminho = (completo) => partes(completo).at(-1);

// Índice também na pasta Downloads, substituindo o anterior; sai do histórico
// para não encher a lista de downloads.
export async function baixarIndice(pacote) {
  const { id } = await baixarArquivo(blobDoIndice(pacote), `${pacote.pasta}/${NOME_INDICE}`, { conflito: 'overwrite' });
  await chrome.downloads.erase({ id });
}

// ---------------------------------------------------------------- os dois jeitos

// Reescreve o índice do pacote na pasta escolhida ou em Downloads (local).
// Em Downloads, só se o Chrome não estiver pedindo para escolher onde salvar
// (seria uma janela a mais).
export async function atualizarIndice(destino, pacote, local = destino.modo) {
  try {
    if (local === 'pasta') {
      if (destino.modo === 'pasta' && (await acesso(destino.pasta)) === 'granted') await gravarIndice(destino.pasta, pacote);
    } else if (!(await lerPergunta())) {
      await baixarIndice(pacote);
    }
  } catch {
    // o índice é um extra: a falha não atrapalha o ZIP
  }
}

// Onde uma cópia do ZIP está: { local: 'pasta'|'downloads', pasta, arquivo, id, raiz }.
export async function copiaExiste(destino, copia) {
  if (copia.local === 'pasta') {
    if (destino.modo !== 'pasta' || copia.raiz !== destino.nome || (await acesso(destino.pasta)) !== 'granted') return null; // não dá para saber
    return existeNaPasta(destino.pasta, copia.pasta, copia.arquivo);
  }
  if (copia.id == null) return null;
  const [d] = await chrome.downloads.search({ id: copia.id });
  return Boolean(d?.exists);
}

// Apaga uma cópia do ZIP (depois que ele foi salvo em outro lugar).
export async function apagarCopia(destino, copia) {
  if (copia.local === 'pasta') {
    return destino.modo === 'pasta' && copia.raiz === destino.nome && (await acesso(destino.pasta)) === 'granted' && apagarDaPasta(destino.pasta, copia.pasta, copia.arquivo);
  }
  return copia.id != null && apagarDownload(copia.id);
}
