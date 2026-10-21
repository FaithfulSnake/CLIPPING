import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// Armazenamento falso no lugar do chrome.storage.local.
let guardado = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (chave) => (chave in guardado ? { [chave]: structuredClone(guardado[chave]) } : {}),
      set: async (itens) => Object.assign(guardado, structuredClone(itens)),
    },
  },
};

const {
  NOME_INDICE,
  criarPacote,
  excluirPacote,
  guardarEscolha,
  lerPacotes,
  nomeDoSite,
  nomeNoPacote,
  nomeParaDownload,
  nomeSolto,
  pastaDoPacote,
  porNumero,
  proximoNumero,
  referencia,
  registrarZip,
  sugerirNomePacote,
  textoDoIndice,
  tirarDoPacote,
} = await import('../extensao/pacotes.js');

beforeEach(() => {
  guardado = {};
});

test('nomes que o Chrome recusaria viram nomes aceitos', () => {
  assert.equal(nomeParaDownload('x​y'), 'x y', 'caractere invisível');
  assert.equal(nomeParaDownload('soft­hífen'), 'soft hífen');
  assert.equal(nomeParaDownload('.oculto'), 'oculto', 'começando com ponto');
  assert.equal(nomeParaDownload('atalho.lnk'), 'atalho lnk');
  assert.equal(nomeParaDownload('teste.local'), 'teste local');
  assert.equal(nomeParaDownload('pasta.{abc}'), 'pasta {abc}');
  assert.equal(nomeParaDownload('a~b'), 'a-b');
  assert.equal(nomeParaDownload('CON'), 'CON_');
  assert.equal(nomeParaDownload('.CON'), 'CON_');
  assert.equal(nomeParaDownload('STF: decisão 1/2?'), 'STF decisão 1 2');
  assert.equal(nomeParaDownload('   '), 'prints');
  assert.equal(nomeParaDownload('Notícias - 05.10.2026'), 'Notícias - 05.10.2026', 'pontos no meio continuam');
  assert.equal(pastaDoPacote('a'.repeat(200)).length, 60);
  assert.equal(pastaDoPacote(''), 'Pacote');
});

test('limpar duas vezes dá o mesmo nome', () => {
  for (const nome of ['x​y.lnk', ' .. CON. ', 'Título: “aspas” ~ fim.', 'a'.repeat(150), 'pasta.{x}']) {
    assert.equal(nomeParaDownload(nomeParaDownload(nome)), nomeParaDownload(nome), nome);
    assert.equal(pastaDoPacote(pastaDoPacote(nome)), pastaDoPacote(nome), nome);
  }
});

test('nome do ZIP solto e numerado dentro do pacote', () => {
  assert.equal(nomeSolto('Matéria 1'), 'Matéria 1.zip');
  assert.equal(nomeSolto('a/b'), 'a b.zip');
  assert.equal(nomeNoPacote(1, 'Matéria: 1'), '01 - Matéria 1.zip');
  assert.equal(nomeNoPacote(12, '.oculto'), '12 - oculto.zip');
  assert.equal(nomeNoPacote(105, 'x'), '105 - x.zip');
  assert.ok(nomeNoPacote(3, 'a'.repeat(300)).length <= 100, 'cabe no limite de nome');
});

test('numeração das matérias no pacote', () => {
  assert.equal(proximoNumero(null, 's1'), 1);
  assert.equal(proximoNumero({ itens: [] }, 's1'), 1);
  const pacote = { itens: [{ sessaoId: 'a', numero: 1 }, { sessaoId: 'b', numero: 3 }, { sessaoId: 'c' }] };
  assert.equal(proximoNumero(pacote, 'b'), 3, 'a mesma matéria mantém o número');
  assert.equal(proximoNumero(pacote, 'novo'), 4, 'a próxima vem depois da maior');
  assert.equal(proximoNumero(pacote, 'c'), 4, 'captura antiga, sem número, ganha um');
  const ordem = [{ numero: 2, data: 1 }, { data: 5 }, { numero: 1, data: 9 }, { data: 3 }].sort(porNumero);
  assert.deepEqual(ordem.map((i) => i.numero ?? `d${i.data}`), [1, 2, 'd3', 'd5']);
});

test('índice do pacote identifica a pasta e lista as matérias em ordem', () => {
  const pacote = {
    nome: 'STF outubro',
    criado: Date.UTC(2026, 9, 7, 12),
    atualizado: Date.UTC(2026, 9, 8, 12),
    itens: [
      { sessaoId: 'b', numero: 2, arquivo: '02 - Segunda.zip', titulo: 'Segunda', url: 'https://x/2', total: 1, data: Date.UTC(2026, 9, 8, 12) },
      { sessaoId: 'a', numero: 1, arquivo: '01 - Primeira.zip', titulo: 'Primeira', url: 'https://x/1', total: 4, data: Date.UTC(2026, 9, 7, 12) },
    ],
  };
  const texto = textoDoIndice(pacote);
  assert.equal(NOME_INDICE, 'Índice do pacote.txt');
  assert.ok(texto.startsWith('\uFEFFPacote: STF outubro\r\n'), 'BOM para o Bloco de Notas');
  assert.match(texto, /Matérias: 2\r\n/);
  assert.match(texto, /01 - Primeira\.zip\r\n {4}Página: Primeira\r\n {4}Endereço: https:\/\/x\/1\r\n {4}Capturada em: .* · 4 prints[\s\S]*02 - Segunda\.zip[\s\S]*· 1 print\r\n/);
  const exportado = textoDoIndice(pacote, { comoPasta: true, faltando: [{ sessaoId: 'b' }] });
  assert.match(exportado, /01 - Primeira\/\r\n/);
  assert.match(exportado, /02 - Segunda\/\r\n[\s\S]*fora deste ZIP/);
  assert.doesNotMatch(exportado.split('02 - Segunda')[0], /fora deste ZIP/);
});

test('sugestão de nome pelo site e pela data', () => {
  const dia = new Date(2026, 9, 7);
  assert.equal(sugerirNomePacote('https://www.conjur.com.br/2026-out-07/x/', dia), 'ConJur 07-10-2026');
  assert.equal(sugerirNomePacote('https://www.jota.info/tributos/x', dia), 'JOTA 07-10-2026');
  assert.equal(sugerirNomePacote('https://www.tjma.jus.br/noticias/1', dia), 'tjma.jus.br 07-10-2026');
  assert.equal(sugerirNomePacote('chrome://newtab', dia), 'Pacote 07-10-2026');
  assert.equal(sugerirNomePacote('', dia), 'Pacote 07-10-2026');
  assert.equal(nomeDoSite('https://portal.stf.jus.br/noticias'), 'STF');
});

test('criar pacote reaproveita o mesmo nome (sem diferenciar maiúsculas e acentos)', async () => {
  const a = await criarPacote('STF Outubro');
  const b = await criarPacote('stf outubro');
  const c = await criarPacote('Notícias');
  const d = await criarPacote('Noticias');
  assert.equal(a.id, b.id);
  assert.equal(c.id, d.id);
  assert.equal(a.pasta, 'STF Outubro');
  assert.equal((await lerPacotes()).lista.length, 2);
});

test('registrar, mover e tirar ZIPs; escolha da próxima captura', async () => {
  const stf = await criarPacote('STF outubro');
  const outro = await criarPacote('Outro');
  const item = { sessaoId: 's1', downloadId: 7, arquivo: 'M1.zip', titulo: 'M1', url: 'https://x', total: 3, data: 1 };
  await registrarZip(referencia(stf), item);
  await registrarZip(referencia(stf), { ...item, downloadId: 8 });
  let { lista } = await lerPacotes();
  assert.deepEqual(lista.find((p) => p.id === stf.id).itens.map((i) => i.downloadId), [8], 'mesma captura não se repete');
  assert.equal(lista[0].id, stf.id, 'o mais recente vem primeiro');

  const depois = await tirarDoPacote(stf.id, 's1');
  assert.deepEqual(depois.itens, [], 'devolve o pacote como ficou (para o índice)');
  assert.equal(await tirarDoPacote(stf.id, 's1'), null, 'nada a tirar');
  await registrarZip(referencia(outro), item);
  ({ lista } = await lerPacotes());
  assert.equal(lista.find((p) => p.id === stf.id).itens.length, 0);
  assert.equal(lista.find((p) => p.id === outro.id).itens.length, 1);

  await guardarEscolha(outro.id);
  assert.equal((await lerPacotes()).escolha, outro.id);
  await excluirPacote(outro.id);
  assert.equal((await lerPacotes()).escolha, null, 'pacote excluído deixa de ser a escolha');
  assert.equal((await lerPacotes()).lista.length, 1);
});

test('ZIP de captura cujo pacote foi excluído no meio: o pacote volta', async () => {
  const p = await criarPacote('Some e volta');
  await excluirPacote(p.id);
  await registrarZip(referencia(p), { sessaoId: 's9', downloadId: 1, arquivo: 'x.zip', data: 1 });
  const { lista } = await lerPacotes();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, p.id);
  assert.equal(lista[0].itens.length, 1);
});

test('alterações seguidas não se perdem', async () => {
  const p = await criarPacote('Muitos');
  await Promise.all(Array.from({ length: 10 }, (_, i) => registrarZip(referencia(p), { sessaoId: `s${i}`, downloadId: i, arquivo: `${i}.zip`, data: i })));
  assert.equal((await lerPacotes()).lista[0].itens.length, 10);
});
