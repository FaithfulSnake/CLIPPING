import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contarConferir, montarEmail, montarTexto } from '../extensao/noticias-texto.js';
import {
  dataDoSite,
  juntarLinhas,
  limiteDeParagrafo,
  materiaDaLeitura,
  materiaDoOcr,
  motivoParaOcr,
  palavraDuvidosa,
  pareceEmbaralhado,
  textoDaLinha,
  textoDoOcr,
  textoDosBlocos,
} from '../extensao/transcricao.js';

const PARAGRAFO =
  'A 2ª Turma do Supremo Tribunal Federal decidiu que a alíquota do ICMS sobre energia pode chegar a 20,5% nos estados que aprovaram lei até 31/12/2025, e afastou a multa de R$ 1.234.567,89 (art. 155, § 2º, da Constituição).';

test('blocos viram o texto integral com intertítulo, legenda, lista e tabela', () => {
  const texto = textoDosBlocos([
    { tipo: 'paragrafo', texto: 'Primeiro parágrafo.' },
    { tipo: 'legenda', texto: 'Ministra durante a sessão' },
    { tipo: 'intertitulo', texto: 'Entenda o caso' },
    { tipo: 'item', texto: '• a multa de 75% fica afastada;' },
    { tipo: 'item', texto: '• os juros seguem a Selic.' },
    { tipo: 'paragrafo', texto: 'RE 1.234.567\nClique aqui para ler o acórdão' },
    { tipo: 'tabela', texto: 'Ano | Alíquota' },
    { tipo: 'tabela', texto: '2026 | 20,5%' },
  ]);
  assert.equal(
    texto,
    [
      'Primeiro parágrafo.',
      '_Ministra durante a sessão_',
      '**Entenda o caso**',
      '• a multa de 75% fica afastada;\n• os juros seguem a Selic.',
      'RE 1.234.567\nClique aqui para ler o acórdão',
      'Ano | Alíquota\n2026 | 20,5%',
    ].join('\n\n'),
  );
});

test('matéria da página: dados do site, sem linha de autor, crédito de foto nem linha fina repetida', () => {
  const leitura = {
    ok: true,
    titulo: 'STF fixa alíquota de 20,5% do ICMS sobre energia',
    subtitulo: 'Por 3 votos a 2, a 2ª Turma manteve a cobrança.',
    autor: '',
    data: '2026-10-27T23:30:00-03:00',
    endereco: 'https://www.jota.info/tributos/stf-fixa-aliquota',
    blocos: [
      { tipo: 'paragrafo', texto: 'Por 3 votos a 2, a 2ª Turma manteve a cobrança.' },
      { tipo: 'paragrafo', texto: 'Por Mariana Duarte | 27 de outubro de 2026, 8h05' },
      { tipo: 'legenda', texto: 'Spacca' },
      { tipo: 'paragrafo', texto: PARAGRAFO },
      { tipo: 'intertitulo', texto: 'Entenda o caso' },
      { tipo: 'paragrafo', texto: 'O ICMS e o contribuinte: a decisão vale para o fisco estadual.' },
    ],
  };
  const m = materiaDaLeitura(leitura);
  assert.equal(m.titulo, 'STF fixa alíquota de 20,5% do ICMS sobre energia');
  assert.equal(m.autor, 'Mariana Duarte (JOTA)');
  assert.equal(m.data, '2026-10-27', 'a data como o site publicou, sem fuso');
  assert.equal(m.link, leitura.endereco);
  assert.equal(m.area, 'Tributário');
  assert.equal(m.texto, ['Por 3 votos a 2, a 2ª Turma manteve a cobrança.', PARAGRAFO, '**Entenda o caso**', 'O ICMS e o contribuinte: a decisão vale para o fisco estadual.'].join('\n\n'));
  assert.deepEqual(m.transcricao, { tipo: 'pagina' });

  // linha fina que não está no corpo entra como primeiro parágrafo
  const outra = materiaDaLeitura({ ...leitura, blocos: leitura.blocos.slice(3) });
  assert.ok(outra.texto.startsWith('Por 3 votos a 2, a 2ª Turma manteve a cobrança.\n\n'));
});

test('quando é preciso ler os prints com OCR', () => {
  const blocos = (texto) => ({ ok: true, blocos: [{ tipo: 'paragrafo', texto }] });
  assert.equal(motivoParaOcr(blocos(PARAGRAFO)), '');
  assert.match(motivoParaOcr({ ok: false }), /não deixou ler/);
  assert.match(motivoParaOcr(blocos('Sefaz publica tabela')), /não tem o texto/);
  const embaralhado = 'Xqzv bwlp trhk mnsd fgjq pvtr klmz wqxs zrtv hjkl pqws mnbv cxzl qwer tyui opas dfgh jklz xcvb nmqw ertp yuio asdf ghjk lzxc';
  assert.equal(pareceEmbaralhado(embaralhado), true);
  assert.match(motivoParaOcr(blocos(embaralhado)), /embaralhado/);
  assert.equal(pareceEmbaralhado(PARAGRAFO.repeat(2)), false);
  assert.equal(pareceEmbaralhado('The Supreme Court ruled that the tax is valid for all of the states in the country and it was a long case for the parties that are in the dispute.'), false);
});

test('palavras do OCR que vão para conferir', () => {
  const p = (texto, confianca, simbolos = []) => ({ texto, confianca, simbolos });
  assert.equal(palavraDuvidosa(p('tributária', 96)), false);
  assert.equal(palavraDuvidosa(p('tributária', 70)), true, 'pouca confiança');
  assert.equal(palavraDuvidosa(p('amulta', 88)), true, 'palavras juntadas ficam abaixo de uma leitura limpa');
  assert.equal(palavraDuvidosa(p('20,5%', 91)), true, 'número precisa de confiança alta');
  assert.equal(palavraDuvidosa(p('20,5%', 96)), false);
  assert.equal(palavraDuvidosa(p('2º', 95)), true, 'º e ª se confundem');
  assert.equal(palavraDuvidosa(p('casa', 95, [{ texto: 'c', confianca: 50 }])), true, 'uma letra duvidosa');
  assert.equal(textoDaLinha([p('decisão', 96), p('da', 96), p('2º', 90), p('Turma', 60), p('do', 95)]), 'decisão da ⟦2º Turma⟧ do');

});

test('juntar prints: cada linha uma vez, sem cabeçalho fixo, só da matéria', () => {
  const linha = (y, texto, x = 100) => ({ x, y, w: 500, h: 18, paragrafo: 1, palavras: texto.split(' ').map((t) => ({ texto: t, confianca: 96 })) });
  const prints = [
    { topoDoc: 0, altura: 700, ocupadoTopo: 60, ocupadoBase: 0, linhas: [linha(20, 'Menu do site'), linha(100, 'Título'), linha(600, 'Linha A'), linha(640, 'Linha B')] },
    // o 2º print começa em 560: o cabeçalho fixo (60px) cobre 560–620; A e B se repetem
    { topoDoc: 560, altura: 700, ocupadoTopo: 60, ocupadoBase: 0, linhas: [linha(580, 'Menu do site'), linha(600, 'Linha A'), linha(640, 'Linha B'), linha(700, 'Linha C'), linha(800, 'Anúncio', 900)] },
  ];
  const caixa = { x: 80, y: 90, w: 600, h: 2000 };
  const juntas = juntarLinhas(prints, { caixa, imagens: [{ x: 80, y: 690, w: 600, h: 30 }] });
  assert.deepEqual(
    juntas.map((l) => l.palavras.map((p) => p.texto).join(' ')),
    ['Título', 'Linha A', 'Linha B'],
    'menu (fora da caixa e sob o cabeçalho), C (dentro de uma imagem) e anúncio (fora da coluna) saem',
  );
  assert.equal(juntas.filter((l) => l.palavras[0].texto === 'Linha').length, 2, 'A e B só uma vez');
});

test('parágrafos do OCR pelo espaço entre as linhas', () => {
  assert.equal(limiteDeParagrafo([13, 13, 13, 37, 13, 37, 13, 37, 35], 17), 24);
  assert.equal(limiteDeParagrafo([12, 13, 12, 13], 17), Infinity, 'sem salto: nada separa');
  const linha = (y, texto, w = 700) => ({ x: 20, y, w, h: 17, palavras: texto.split(' ').map((t) => ({ texto: t, confianca: 96 })) });
  const texto = textoDoOcr([
    linha(0, 'A Secretaria de Fazenda publicou a nova'),
    linha(30, 'tabela do ICMS. A alíquota subiu.'),
    linha(84, 'Segundo o órgão, a arrecadação deve'),
    linha(114, 'crescer. O contribuinte que pagar até a trans-'),
    linha(144, 'ferência terá desconto.', 300),
    linha(198, 'Último parágrafo.', 200),
  ]);
  assert.equal(
    texto,
    'A Secretaria de Fazenda publicou a nova tabela do ICMS. A alíquota subiu.\n\nSegundo o órgão, a arrecadação deve crescer. O contribuinte que pagar até a ⟦transferência⟧ terá desconto.\n\nÚltimo parágrafo.',
  );
});

test('matéria do OCR: título e autor lidos no começo não se repetem', () => {
  const l = (y, texto, h = 17) => ({ x: 20, y, w: 600, h, palavras: texto.split(' ').map((t) => ({ texto: t, confianca: 96 })) });
  const prints = [
    {
      topoDoc: 0,
      altura: 700,
      ocupadoTopo: 0,
      ocupadoBase: 0,
      linhas: [l(0, 'Sefaz-MA publica nova tabela do ICMS', 30), l(60, 'Por Ana Lima'), l(110, 'A alíquota subiu para 20,5%.'), l(140, 'O contribuinte pode parcelar.'), l(194, 'Fim.')],
    },
  ];
  const m = materiaDoOcr({ prints, leitura: { titulo: 'Sefaz-MA publica nova tabela do ICMS', endereco: 'https://x.y/a' }, sessao: 's1' });
  assert.equal(m.titulo, 'Sefaz-MA publica nova tabela do ICMS');
  assert.equal(m.autor, 'Ana Lima');
  assert.equal(m.texto, 'A alíquota subiu para 20,5%. O contribuinte pode parcelar.\n\nFim.');
  assert.deepEqual(m.transcricao, { tipo: 'ocr', sessao: 's1' });
});

test('e-mail: intertítulo em negrito, legenda em itálico e trecho a conferir em amarelo', () => {
  const materia = {
    titulo: 'Título',
    autor: '',
    link: 'https://x.y/a',
    texto: 'Primeiro parágrafo com ⟦20,5%⟧.\n\n**Entenda o caso**\n\n_Ministra durante a sessão_\n\nLinha 1\nLinha 2',
  };
  const html = montarEmail({ area: 'Tributário', data: '2026-10-27', materias: [materia] });
  assert.match(html, /<p style="font-family:Calibri,sans-serif; font-weight:bold; margin:12pt 0 6pt 0;">Entenda o caso<\/p>/);
  assert.match(html, /<p style="text-align:justify; font-style:italic; margin:0 0 8pt 0;">Ministra durante a sessão<\/p>/);
  assert.match(html, /Primeiro parágrafo com <span style="background-color:#ffff00; mso-highlight:yellow;">20,5%<\/span>\./);
  assert.match(html, /Linha 1<br>Linha 2/);
  assert.doesNotMatch(html, /\*\*|⟦|⟧/);
  const texto = montarTexto({ area: 'Tributário', data: '2026-10-27', materias: [materia] });
  assert.match(texto, /\nEntenda o caso\n/);
  assert.match(texto, /\nMinistra durante a sessão\n/);
  assert.match(texto, /Primeiro parágrafo com 20,5%\./);
  assert.equal(contarConferir(materia.texto), 1);
  assert.equal(dataDoSite('27/10/2026'), '2026-10-27');
});
