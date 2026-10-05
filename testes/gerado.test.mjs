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

test('script e bookmarklet são JavaScript válido', () => {
  const { script, bookmarklet } = gerar();
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotThrow(() => new vm.Script(decodeURIComponent(bookmarklet.slice('javascript:'.length))));
});
