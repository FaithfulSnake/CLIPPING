// Gera dist/ferramentas-fanjas.zip com a pasta da extensão, pronta para
// descompactar e carregar em chrome://extensions ("Carregar sem compactação").
// Uso: npm run empacotar
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarZip } from '../extensao/zip.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const origem = join(raiz, 'extensao');
const PASTA = 'ferramentas-fanjas';

function* arquivos(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) yield* arquivos(caminho);
    else yield caminho;
  }
}

const entradas = [{ nome: `${PASTA}/` }, { nome: `${PASTA}/icones/` }];
for (const arquivo of arquivos(origem)) {
  entradas.push({ nome: `${PASTA}/${relative(origem, arquivo).split(sep).join('/')}`, dados: new Uint8Array(readFileSync(arquivo)) });
}
const zip = await criarZip(entradas).arrayBuffer();
mkdirSync(join(raiz, 'dist'), { recursive: true });
const destino = join(raiz, 'dist', `${PASTA}.zip`);
writeFileSync(destino, Buffer.from(zip));
console.log(`${relative(raiz, destino)}: ${entradas.length} itens, ${zip.byteLength} bytes`);
