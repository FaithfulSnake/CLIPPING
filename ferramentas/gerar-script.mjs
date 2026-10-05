// Gera a versão sem instalar a partir do código da extensão:
//   script/captura-sem-instalar.js  (para colar no Console, F12)
//   script/bookmarklet.txt          (endereço do favorito "javascript:…")
//   script/instalar-favorito.html   (página com o botão para arrastar aos favoritos)
//   extensao/noticias-pagina.js     (script único da página de notícias, sem módulos)
//   script/noticias-sem-instalar.html (página de notícias num arquivo só, sem a extensão)
// Uso: npm run gerar
//      node ferramentas/gerar-script.mjs --fragmento saida.html  (página para publicar no claude.ai)
import { readFileSync, writeFileSync } from 'node:fs';
import { paginaInstalacao } from './pagina-instalacao.mjs';

const ler = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');
const semModulos = (codigo) => codigo.replace(/^import\b[\s\S]*?\bfrom\s+['"][^'"]+['"];?\n/gm, '').replace(/^export /gm, '');

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
  return { script, bookmarklet, instalacao: paginaInstalacao(bookmarklet), ...gerarNoticias() };
}

// Página de notícias: um script clássico (sem "import"), porque módulos não
// carregam quando o .html é aberto direto do disco (file://).
function gerarNoticias() {
  const noticias = [
    '// Notícias jurídicas – Ferramentas Fanjas.',
    '// ARQUIVO GERADO por ferramentas/gerar-script.mjs a partir de extensao/noticias-texto.js, unzip.js, zip.js e noticias.js: não edite à mão.',
    '(() => {',
    "'use strict';",
    semModulos(ler('extensao/noticias-texto.js')),
    semModulos(ler('extensao/unzip.js')),
    semModulos(ler('extensao/zip.js')),
    semModulos(ler('extensao/noticias.js')),
    '})();',
    '',
  ].join('\n');
  const trocar = (texto, de, para) => {
    if (!texto.includes(de)) throw new Error(`noticias.html: não achei ${de}`);
    return texto.replace(de, () => para);
  };
  let semInstalar = ler('extensao/noticias.html');
  semInstalar = trocar(semInstalar, '    <link rel="icon" href="icones/icone-32.png" />\n', '');
  semInstalar = trocar(semInstalar, '<link rel="stylesheet" href="noticias.css" />', `<style>\n${ler('extensao/noticias.css')}</style>`);
  semInstalar = trocar(semInstalar, '<script src="noticias-pagina.js"></script>', `<script>\n${noticias}</script>`);
  semInstalar = trocar(semInstalar, '<head>', '<head>\n    <!-- ARQUIVO GERADO por ferramentas/gerar-script.mjs: não edite à mão. Abra no Chrome ou no Edge. -->');
  return { noticias, semInstalar };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { script, bookmarklet, instalacao, noticias, semInstalar } = gerar();
  const fragmento = process.argv.indexOf('--fragmento');
  if (fragmento > 0) {
    writeFileSync(process.argv[fragmento + 1], paginaInstalacao(bookmarklet, { completo: false }));
  } else {
    writeFileSync(new URL('../script/captura-sem-instalar.js', import.meta.url), script);
    writeFileSync(new URL('../script/bookmarklet.txt', import.meta.url), `${bookmarklet}\n`);
    writeFileSync(new URL('../script/instalar-favorito.html', import.meta.url), instalacao);
    writeFileSync(new URL('../extensao/noticias-pagina.js', import.meta.url), noticias);
    writeFileSync(new URL('../script/noticias-sem-instalar.html', import.meta.url), semInstalar);
    console.log(`script/captura-sem-instalar.js: ${script.length} caracteres`);
    console.log(`script/bookmarklet.txt: ${bookmarklet.length} caracteres`);
    console.log(`script/instalar-favorito.html: ${instalacao.length} caracteres`);
    console.log(`extensao/noticias-pagina.js: ${noticias.length} caracteres`);
    console.log(`script/noticias-sem-instalar.html: ${semInstalar.length} caracteres`);
  }
}
