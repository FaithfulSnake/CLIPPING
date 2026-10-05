// Gera a versão sem instalar a partir do código da extensão:
//   script/captura-sem-instalar.js  (para colar no Console, F12)
//   script/bookmarklet.txt          (endereço do favorito "javascript:…")
//   script/instalar-favorito.html   (página com o botão para arrastar aos favoritos)
// Uso: npm run gerar
//      node ferramentas/gerar-script.mjs --fragmento saida.html  (página para publicar no claude.ai)
import { readFileSync, writeFileSync } from 'node:fs';
import { paginaInstalacao } from './pagina-instalacao.mjs';

const ler = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');
const semModulos = (codigo) => codigo.replace(/^import .*\n/gm, '').replace(/^export /gm, '');

export function gerar() {
  const corpo = [
    ler('extensao/pagina.js'),
    semModulos(ler('extensao/comum.js')),
    semModulos(ler('extensao/zip.js')),
    ler('script/fonte/painel.js'),
    'abrirPainel();',
  ].join('\n');

  const script = [
    '// Clipping – Prints com rolagem (versão sem instalar).',
    '// ARQUIVO GERADO por ferramentas/gerar-script.mjs a partir de extensao/ e script/fonte/: não edite à mão.',
    '// Uso: abra a página, aperte F12, vá em "Console", cole todo este texto e aperte Enter.',
    '(() => {',
    "'use strict';",
    corpo,
    '})();',
    '',
  ].join('\n');

  // No favorito: sem comentários de linha inteira nem indentação, para ficar menor.
  const compacto = script
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');

  const bookmarklet = `javascript:${encodeURIComponent(compacto)}`;
  return { script, bookmarklet, instalacao: paginaInstalacao(bookmarklet) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { script, bookmarklet, instalacao } = gerar();
  const fragmento = process.argv.indexOf('--fragmento');
  if (fragmento > 0) {
    writeFileSync(process.argv[fragmento + 1], paginaInstalacao(bookmarklet, { completo: false }));
  } else {
    writeFileSync(new URL('../script/captura-sem-instalar.js', import.meta.url), script);
    writeFileSync(new URL('../script/bookmarklet.txt', import.meta.url), `${bookmarklet}\n`);
    writeFileSync(new URL('../script/instalar-favorito.html', import.meta.url), instalacao);
    console.log(`script/captura-sem-instalar.js: ${script.length} caracteres`);
    console.log(`script/bookmarklet.txt: ${bookmarklet.length} caracteres`);
    console.log(`script/instalar-favorito.html: ${instalacao.length} caracteres`);
  }
}
