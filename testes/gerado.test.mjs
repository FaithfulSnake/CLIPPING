import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { gerar } from '../ferramentas/gerar-script.mjs';

const ler = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

test('script sem instalar, bookmarklet e página de instalação estão atualizados (rode "npm run gerar")', () => {
  const { script, bookmarklet, instalacao } = gerar();
  assert.equal(ler('script/captura-sem-instalar.js'), script);
  assert.equal(ler('script/bookmarklet.txt'), `${bookmarklet}\n`);
  assert.equal(ler('script/instalar-favorito.html'), instalacao);
  assert.ok(instalacao.includes(`href="${bookmarklet}"`), 'o botão arrastável leva o bookmarklet');
  assert.doesNotMatch(bookmarklet, /["<>&]/, 'seguro dentro do atributo href');
});

test('página de notícias (script único e versão sem instalar) está atualizada e é válida', () => {
  const { noticias, semInstalar } = gerar();
  assert.equal(ler('extensao/noticias-pagina.js'), noticias);
  assert.equal(ler('script/noticias-sem-instalar.html'), semInstalar);
  assert.doesNotMatch(noticias, /^\s*(import|export)\b/m, 'sem módulos');
  assert.doesNotThrow(() => new vm.Script(noticias));
  assert.doesNotMatch(noticias, /<\/script/i, 'pode ser embutido num <script>');
  assert.match(ler('extensao/noticias.html'), /<script src="noticias-pagina\.js"><\/script>/);
  assert.doesNotMatch(semInstalar, /src="|href="noticias\.css"/, 'tudo embutido');
});

test('script e bookmarklet são JavaScript válido', () => {
  const { script, bookmarklet } = gerar();
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotThrow(() => new vm.Script(decodeURIComponent(bookmarklet.slice('javascript:'.length))));
});
