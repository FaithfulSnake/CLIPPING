import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  acharData,
  assunto,
  classificarArea,
  dataPredominante,
  interpretarMateria,
  linkSozinho,
  montarEmail,
  montarTexto,
  nomeArquivo,
  paragrafos,
  separarMaterias,
} from '../extensao/noticias-texto.js';
import { decodificarTexto, lerZip } from '../extensao/unzip.js';

const exemplo = (nome) => readFileSync(new URL(`./noticias/${nome}`, import.meta.url), 'utf8');

test('lê matéria com rótulos (Título, Autor, Link, Data)', () => {
  const m = interpretarMateria(exemplo('01 - stf icms.txt'), '01 - stf icms.txt');
  assert.equal(m.titulo, 'STF afasta ICMS na transferência de mercadorias entre filiais do mesmo contribuinte');
  assert.equal(m.autor, 'Ana Beatriz Souza');
  assert.equal(m.link, 'https://www.conjur.com.br/2026-out-05/stf-afasta-icms-transferencia-filiais/');
  assert.equal(m.data, '2026-10-05');
  assert.equal(m.area, 'Tributário');
  assert.equal(m.areaConferir, false);
  assert.match(m.texto, /^O Plenário do Supremo/);
  assert.match(m.texto, /Recurso Extraordinário nº 1\.490\.708\/SP$/, 'mantém o texto inteiro, até a última linha');
});

test('lê matéria copiada do JOTA: "Por …", data solta e link no rodapé', () => {
  const m = interpretarMateria(exemplo('02 - tst gerente.txt'));
  assert.equal(m.titulo, 'TST valida acordo coletivo que afasta horas extras de gerente bancário');
  assert.equal(m.autor, 'Carla Menezes (JOTA)');
  assert.equal(m.data, '2026-10-05');
  assert.equal(m.link, 'https://www.jota.info/trabalho/tst-valida-acordo-coletivo-gerente-bancario-05102026');
  assert.equal(m.area, 'Trabalhista');
  assert.doesNotMatch(m.texto, /Link de Acesso|Por Carla|10:30/);
});

test('lê matéria copiada do site: tira botões e créditos, sem autor', () => {
  const m = interpretarMateria(exemplo('03 - stj recuperacao.txt'));
  assert.equal(m.titulo, 'Recuperação judicial: STJ admite créditos de sócios no plano aprovado pelos credores');
  assert.equal(m.autor, '');
  assert.equal(m.data, '2026-10-05');
  assert.equal(m.link, 'https://www.conjur.com.br/2026-out-05/stj-admite-creditos-socios-plano-recuperacao/');
  assert.equal(m.area, 'Empresarial');
  assert.doesNotMatch(m.texto, /Compartilhar|Facebook|WhatsApp|Spacca|8h05/);
  assert.equal(paragrafos(m.texto).length, 4, 'sem linhas em branco, cada linha é um parágrafo');
});

test('vários textos num .txt, separados por =====, com área por rótulo', () => {
  const partes = separarMaterias(exemplo('04 - varias.txt'));
  assert.equal(partes.length, 2);
  const [reforma, motorista] = partes.map((p) => interpretarMateria(p));
  assert.equal(reforma.area, 'Tributário');
  assert.equal(reforma.link, '');
  assert.equal(motorista.area, 'Trabalhista');
  assert.equal(motorista.areaConferir, false);
  assert.equal(motorista.autor, 'Pedro Albuquerque (Migalhas)');
  assert.equal(motorista.data, '2026-10-04');
});

test('pasta com o nome da área decide a área', () => {
  const texto = 'Título qualquer\n\nTexto sobre um assunto sem palavras típicas de nenhuma área.';
  assert.equal(interpretarMateria(texto, 'Notícias/Trabalhista/1.txt').area, 'Trabalhista');
  assert.equal(interpretarMateria(texto, 'TRIBUTÁRIO - 2.txt').area, 'Tributário');
  assert.equal(interpretarMateria(texto, 'Notícias - Empresarial/x.txt').area, 'Empresarial');
  assert.equal(interpretarMateria(texto, 'Trabalho de hoje/Tributário/x.txt').area, 'Tributário', 'pasta solta não decide');
  assert.equal(interpretarMateria(texto, 'Empresa X/3.txt').areaConferir, true);
  const solto = interpretarMateria(texto, 'tribunal decide.txt');
  assert.equal(solto.areaConferir, true, 'sem pistas, pede para conferir');
});

test('classificação pelo assunto', () => {
  assert.equal(classificarArea('Carf mantém autuação de IRPJ e CSLL', 'O contribuinte questionava o lançamento.').area, 'Tributário');
  assert.equal(classificarArea('TRT condena empresa por assédio moral', 'A trabalhadora foi dispensada após denunciar o empregador.').area, 'Trabalhista');
  assert.equal(classificarArea('Cade aprova fusão entre redes de farmácias', 'O acordo de acionistas foi analisado.').area, 'Empresarial');
});

test('não confunde frase do texto com autor ou data', () => {
  const m = interpretarMateria('STJ mantém decisão sobre o tema\nPor unanimidade, a turma decidiu em 03/10/2026 manter a decisão.\nMais texto.');
  assert.equal(m.titulo, 'STJ mantém decisão sobre o tema');
  assert.equal(m.autor, '');
  assert.equal(m.data, '');
  assert.match(m.texto, /^Por unanimidade/);
});

test('chapéu acima do título sai do texto e pode indicar a área', () => {
  const m = interpretarMateria('OPINIÃO\nTRIBUTÁRIO\nA reforma e os créditos de PIS e Cofins na transição\nPor Fulano de Tal\n\nTexto da coluna.');
  assert.equal(m.titulo, 'A reforma e os créditos de PIS e Cofins na transição');
  assert.equal(m.area, 'Tributário');
  assert.equal(m.areaConferir, false);
  assert.equal(m.texto, 'Texto da coluna.');
  const curto = interpretarMateria('Reforma tributária avança\n\nTexto.');
  assert.equal(curto.titulo, 'Reforma tributária avança', 'título de três palavras continua título');
});

test('copiado do site: tira rodapé da revista e linhas de navegação', () => {
  const m = interpretarMateria('Título da matéria de teste aqui\n\nParágrafo.\n\nRevista Consultor Jurídico, 5 de outubro de 2026, 8h05\nTopo da página');
  assert.equal(m.texto, 'Parágrafo.');
});

test('link colado sozinho', () => {
  assert.equal(linkSozinho('  https://www.conjur.com.br/2026-out-05/x/ \n'), 'https://www.conjur.com.br/2026-out-05/x/');
  assert.equal(linkSozinho('veja https://a.b/c'), '');
  assert.equal(linkSozinho('Título\nhttps://a.b/c'), '');
});

test('datas em vários formatos', () => {
  assert.equal(acharData('5 de outubro de 2026, 8h05'), '2026-10-05');
  assert.equal(acharData('1º de março de 2026'), '2026-03-01');
  assert.equal(acharData('Publicado em 25.08.2026'), '2026-08-25');
  assert.equal(acharData('2026-08-25T10:00'), '2026-08-25');
  assert.equal(acharData('31/02/2026'), '', 'data impossível');
});

test('data predominante: a mais frequente; empate, a mais recente', () => {
  assert.equal(dataPredominante([{ data: '2026-10-04' }, { data: '2026-10-05' }, { data: '2026-10-04' }]), '2026-10-04');
  assert.equal(dataPredominante([{ data: '2026-10-04' }, { data: '2026-10-05' }, { data: '' }]), '2026-10-05');
  assert.equal(dataPredominante([{ data: '' }]), '');
});

test('assunto e nome do arquivo no padrão do escritório', () => {
  assert.equal(assunto('Tributário', '2026-10-05'), 'Notícias - Tributário - 05.10.2026');
  assert.equal(nomeArquivo('Tributário', '2026-10-05'), 'EMAIL_NOTICIAS_TRIBUTARIO_05-10-2026.html');
});

test('e-mail segue o modelo, com o texto integral e sem resumir', () => {
  const materias = [
    interpretarMateria(exemplo('01 - stf icms.txt')),
    { titulo: 'Sem autor & <com> "aspas"', autor: '', link: '', data: '', texto: 'Linha 1\nLinha 2\n\nParágrafo 2' },
  ];
  const html = montarEmail({ area: 'Tributário', data: '2026-10-05', materias });
  assert.match(html, /^<meta charset="utf-8">/);
  assert.match(html, /font-family:'Calibri Light',Calibri,sans-serif; font-size:11pt; color:#000000; line-height:1\.35;/);
  assert.match(html, /margin:0 0 12pt 0;">Notícias - Tributário - 05\.10\.2026<\/p>/);
  assert.match(html, /<a href="#materia-1" style="color:#000000; text-decoration:none;">1\. STF afasta ICMS/);
  assert.match(html, /<a href="#materia-2"[^>]*>2\. Sem autor &amp; &lt;com&gt; &quot;aspas&quot;<\/a>/);
  assert.match(html, /<div id="materia-1">\n<p style="font-family:Calibri,sans-serif; font-weight:bold; text-align:center; margin:18pt 0 4pt 0;"><a name="materia-1"><\/a>STF afasta/);
  assert.match(html, /<p style="text-align:center; margin:0 0 12pt 0;">Por: Ana Beatriz Souza<\/p>/);
  assert.match(html, /<p style="margin:12pt 0 18pt 0;"><strong>Link de Acesso:<\/strong> <a href="https:\/\/www\.conjur\.com\.br\/2026-out-05\/stf-afasta-icms-transferencia-filiais\/">/);
  // Matéria 2: sem autor (sem linha "Por:") e sem link (sem linha de link).
  const bloco2 = html.slice(html.indexOf('<div id="materia-2">'));
  assert.doesNotMatch(bloco2, /Por:|Link de Acesso/);
  assert.match(bloco2, /margin:18pt 0 12pt 0;/);
  assert.match(bloco2, />Linha 1<br>Linha 2<\/p>\n<p style="text-align:justify; margin:0 0 8pt 0;">Parágrafo 2<\/p>/);
  // Todo o texto da matéria 1 está no e-mail.
  const original = materias[0].texto.replace(/\s+/g, ' ');
  const noEmail = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  assert.ok(noEmail.includes(original), 'texto integral presente');
  assert.equal((html.match(/<div id="materia-/g) || []).length, 2);
});

test('texto simples do e-mail', () => {
  const t = montarTexto({
    area: 'Trabalhista',
    data: '2026-10-05',
    materias: [{ titulo: 'T', autor: 'A', link: 'https://x.y/z', texto: 'P1\n\nP2' }],
  });
  assert.equal(t, 'Notícias - Trabalhista - 05.10.2026\n\nSumário\n1. T\n\n\nT\nPor: A\n\nP1\n\nP2\n\nLink de Acesso: https://x.y/z\n');
});

test('decodifica .txt em UTF-8, UTF-16 do Bloco de Notas e ANSI', () => {
  const texto = 'Título: Ação de cobrança — §1º';
  assert.equal(decodificarTexto(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(texto)])), texto);
  assert.equal(decodificarTexto(new Uint8Array([0xff, 0xfe, ...Buffer.from(texto, 'utf16le')])), texto);
  assert.equal(decodificarTexto(new Uint8Array([0x41, 0xe7, 0xe3, 0x6f])), 'Ação', 'Windows-1252');
});

test('lê ZIP do Windows (nomes em CP850) e ZIP com UTF-8, comprimidos', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'unzip-'));
  const criar = (arquivo, codificacao) =>
    execFileSync('python3', [
      '-c',
      `import sys, zipfile
class Info(zipfile.ZipInfo):
    def _encodeFilenameFlags(self):
        if sys.argv[2] == 'cp850':
            return self.filename.encode('cp850'), self.flag_bits & ~0x800
        return super()._encodeFilenameFlags()
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr(Info('Tributário/'), b'')
    for nome, texto in [('Tributário/Matéria 1.txt', 'Título: ICMS\\n' + 'texto ' * 500), ('Trabalhista/2.txt', 'TST')]:
        i = Info(nome)
        i.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(i, texto.encode('utf-8'))`,
      arquivo,
      codificacao,
    ]);
  for (const codificacao of ['cp850', 'utf8']) {
    const arquivo = join(pasta, `${codificacao}.zip`);
    criar(arquivo, codificacao);
    const itens = await lerZip(readFileSync(arquivo));
    assert.deepEqual(
      itens.map((i) => i.nome),
      ['Tributário/Matéria 1.txt', 'Trabalhista/2.txt'],
      codificacao,
    );
    assert.equal(decodificarTexto(itens[0].dados), `Título: ICMS\n${'texto '.repeat(500)}`);
  }
});
