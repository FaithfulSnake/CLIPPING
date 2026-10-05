// Gera um arquivo ZIP sem compressão ("stored"). PNG e JPEG já são
// comprimidos, então comprimir de novo só gastaria tempo. Os nomes vão em
// UTF-8, então acentos no nome da pasta aparecem certos no Windows.

const TABELA_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataHoraDos(d) {
  const ano = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// entradas: [{ nome: 'pasta/' }, { nome: 'pasta/001.png', dados: Uint8Array }, ...]
// Nomes terminados em "/" são pastas. Devolve um Blob.
export function criarZip(entradas, quando = new Date()) {
  if (entradas.length > 0xffff) throw new Error('Arquivos demais para um único ZIP.');
  const { hora, data } = dataHoraDos(quando);
  const utf8 = new TextEncoder();
  const locais = [];
  const centrais = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    const nome = utf8.encode(entrada.nome);
    const dados = entrada.dados || new Uint8Array(0);
    const ehPasta = entrada.nome.endsWith('/');
    const crc = crc32(dados);
    if (deslocamento + 30 + nome.length + dados.length > 0xffffffff) {
      throw new Error('O ZIP passaria de 4 GB. Diminua o limite de prints ou use JPEG.');
    }

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão necessária
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    locais.push(local, nome, dados);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // criado por: MS-DOS, versão 2.0
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, data, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, dados.length, true);
    central.setUint32(24, dados.length, true);
    central.setUint16(28, nome.length, true);
    central.setUint32(38, ehPasta ? 0x10 : 0, true); // atributo de pasta do DOS
    central.setUint32(42, deslocamento, true);
    centrais.push(central, nome);

    deslocamento += 30 + nome.length + dados.length;
  }

  const tamanhoCentral = centrais.reduce((soma, parte) => soma + parte.byteLength, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, entradas.length, true);
  fim.setUint16(10, entradas.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  return new Blob([...locais, ...centrais, fim], { type: 'application/zip' });
}
