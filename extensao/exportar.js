// Monta os ZIPs: o de uma captura (a pasta com os prints numerados) e o do
// pacote inteiro (a pasta principal do pacote com o índice e uma pasta por matéria).
import { nomePrint, textoInfo } from './comum.js';
import { NOME_INDICE, porNumero, referencia, textoDoIndice } from './pacotes.js';
import { lerZip } from './unzip.js';
import { criarZip } from './zip.js';

const utf8 = (texto) => new TextEncoder().encode(texto);

// <pasta>/001.png, 002.png… e info.txt (com o nome do pacote, se tiver).
export async function entradasDaCaptura(sessao, prints, pasta, pacote = null) {
  const entradas = [{ nome: `${pasta}/` }];
  for (const [i, blob] of prints.entries()) {
    entradas.push({ nome: `${pasta}/${nomePrint(i + 1, prints.length, sessao.formato)}`, dados: new Uint8Array(await blob.arrayBuffer()) });
  }
  if (sessao.incluirInfo) {
    entradas.push({ nome: `${pasta}/info.txt`, dados: utf8(textoInfo({ ...sessao, total: prints.length, pacote })) });
  }
  return entradas;
}

export async function zipDaCaptura(sessao, prints, pacote = null) {
  return criarZip(await entradasDaCaptura(sessao, prints, sessao.pasta, pacote), new Date(sessao.data));
}

// lerCaptura(item) devolve { sessao, prints } (prints guardados na extensão),
// { zip: ArrayBuffer } (o ZIP salvo, quando dá para ler) ou null.
// Devolve o Blob do ZIP e as matérias que ficaram de fora.
export async function zipDoPacote(pacote, lerCaptura) {
  const raiz = pacote.pasta;
  const entradas = [];
  const faltando = [];
  for (const item of [...pacote.itens].sort(porNumero)) {
    const pasta = `${raiz}/${item.arquivo.replace(/\.zip$/i, '')}`;
    const captura = await lerCaptura(item);
    if (captura?.prints?.length) {
      entradas.push(...(await entradasDaCaptura(captura.sessao, captura.prints, pasta, referencia(pacote))));
    } else if (captura?.zip) {
      entradas.push({ nome: `${pasta}/` });
      // tira a pasta de dentro do ZIP da matéria: os arquivos vão direto para a pasta dela
      for (const a of await lerZip(captura.zip)) entradas.push({ nome: `${pasta}/${a.nome.slice(a.nome.indexOf('/') + 1)}`, dados: a.dados });
    } else {
      faltando.push(item);
    }
  }
  entradas.unshift({ nome: `${raiz}/` }, { nome: `${raiz}/${NOME_INDICE}`, dados: utf8(textoDoIndice(pacote, { comoPasta: true, faltando })) });
  return { blob: criarZip(entradas), faltando };
}
