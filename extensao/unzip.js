// Lê os arquivos de um .zip (sem compressão ou "deflate", os tipos que o
// Windows e os programas comuns usam) e decodifica textos .txt.

// Página de código 850, usada pelo Windows em português para nomes dentro do
// ZIP quando o arquivo não marca os nomes como UTF-8.
const CP850 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

function nomeDoZip(bytes, utf8) {
  if (!utf8) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : CP850[b - 128])).join('');
    }
  }
  return new TextDecoder().decode(bytes);
}

async function descomprimir(dados) {
  const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

// Devolve [{ nome, dados: Uint8Array }] na ordem em que estão no ZIP.
export async function lerZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error('o arquivo não é um ZIP válido');

  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const arquivos = [];
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('o ZIP está corrompido');
    const flags = dv.getUint16(p + 8, true);
    const metodo = dv.getUint16(p + 10, true);
    const tamanho = dv.getUint32(p + 20, true);
    const tamNome = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const nome = nomeDoZip(bytes.subarray(p + 46, p + 46 + tamNome), flags & 0x0800);
    p += 46 + tamNome + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    if (nome.endsWith('/')) continue;
    if (flags & 1) throw new Error(`"${nome}" está protegido por senha`);
    const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const conteudo = bytes.subarray(inicio, inicio + tamanho);
    if (metodo === 0) arquivos.push({ nome, dados: conteudo.slice() });
    else if (metodo === 8) arquivos.push({ nome, dados: await descomprimir(conteudo) });
    else throw new Error(`"${nome}" usa um tipo de compressão não suportado`);
  }
  return arquivos;
}

// Texto de um .txt: UTF-8 (com ou sem BOM), UTF-16 do Bloco de Notas
// ("Unicode") ou, se não for UTF-8 válido, ANSI do Windows (1252).
export function decodificarTexto(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const inicio = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(inicio));
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
