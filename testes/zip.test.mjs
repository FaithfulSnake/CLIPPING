import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { crc32, criarZip } from '../extensao/zip.js';

test('crc32 bate com o valor de referência', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('ZIP é lido pelo zipfile do Python, com pasta, acentos e conteúdo íntegros', async () => {
  const pasta = 'Transcrição – página 1';
  const png = new Uint8Array(5000).map((_, i) => (i * 31) % 256);
  const entradas = [
    { nome: `${pasta}/` },
    { nome: `${pasta}/001.png`, dados: png },
    { nome: `${pasta}/002.png`, dados: png.slice(0, 10) },
    { nome: `${pasta}/info.txt`, dados: new TextEncoder().encode('Endereço: https://exemplo.com\r\n') },
  ];
  const zip = Buffer.from(await criarZip(entradas, new Date(2026, 9, 5, 14, 30, 20)).arrayBuffer());
  const arquivo = join(mkdtempSync(join(tmpdir(), 'zip-')), 'teste.zip');
  writeFileSync(arquivo, zip);

  const saida = execFileSync(
    'python3',
    [
      '-c',
      `import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps([[i.filename, i.file_size, i.is_dir(), list(i.date_time), z.read(i).hex()[:40]] for i in z.infolist()]))`,
      arquivo,
    ],
    { encoding: 'utf8' },
  );
  const itens = JSON.parse(saida);
  assert.deepEqual(
    itens.map(([nome]) => nome),
    entradas.map((e) => e.nome),
  );
  assert.equal(itens[0][2], true, 'primeira entrada é a pasta');
  assert.equal(itens[1][1], 5000);
  assert.equal(itens[1][4], Buffer.from(png.slice(0, 20)).toString('hex'));
  assert.deepEqual(itens[1][3], [2026, 10, 5, 14, 30, 20]);
});
