// Ferramenta "Notícias jurídicas": lê o texto integral das matérias (.txt),
// descobre título, autor, link, data e área, e monta o e-mail de cada área no
// modelo do escritório, com a matéria inteira (sem resumo).
// Só funções puras: nada de DOM nem de APIs do Chrome (testável no Node).

export const AREAS = Object.freeze(['Tributário', 'Empresarial', 'Trabalhista']);

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Minúsculas e sem acentos, para comparar palavras.
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------- datas

const RE_DATA = new RegExp(
  [
    String.raw`(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)`,
    String.raw`(?<!\d)(\d{1,2})(?:º|°|o)?\s+de\s+(${MESES.join('|')})\s+de\s+(\d{4})(?!\d)`,
    String.raw`(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)`,
  ].join('|'),
  'g',
);

const doisDigitos = (n) => String(n).padStart(2, '0');

function dataValida(a, m, d) {
  const data = new Date(Date.UTC(a, m - 1, d));
  if (a < 1990 || a > 2100 || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return '';
  return `${a}-${doisDigitos(m)}-${doisDigitos(d)}`;
}

// Primeira data no texto, como "AAAA-MM-DD" ('' se não houver).
export function acharData(texto) {
  for (const r of normalizar(texto).matchAll(RE_DATA)) {
    const data = r[1]
      ? dataValida(+r[3], +r[2], +r[1])
      : r[4]
        ? dataValida(+r[6], MESES.indexOf(r[5]) + 1, +r[4])
        : dataValida(+r[7], +r[8], +r[9]);
    if (data) return data;
  }
  return '';
}

// "AAAA-MM-DD" → "DD.MM.AAAA" (ou outro separador).
export function formatarData(data, separador = '.') {
  const [a, m, d] = String(data).split('-');
  return a && m && d ? [d, m, a].join(separador) : '';
}

// Linha que é só uma data ("25 de agosto de 2026, 8h05", "Publicado em 25/08/2026 às 10:00").
function linhaSoDeData(linha) {
  if (!acharData(linha)) return false;
  const resto = normalizar(linha)
    .replace(RE_DATA, ' ')
    .replace(/\d{1,2}\s*(?:h|:)\s*\d{0,2}(?:min)?/g, ' ')
    .replace(/\b(publicad[oa]|atualizad[oa]|postad[oa]|em|as|de|segunda|terca|quarta|quinta|sexta|feira|sabado|domingo)\b/g, ' ')
    .replace(/[\s,.\-–—|•·:()]+/g, '');
  return resto.length === 0;
}

// ---------------------------------------------------------------- áreas

// [peso, termo]. Termo terminado em * vale como início de palavra.
// Peso 3: típico só daquela área; 1: aparece em outras também.
const TERMOS = {
  Tributário: [
    [3, 'tributari*'], [3, 'tributo'], [3, 'tributos'], [3, 'tributacao'], [3, 'icms'], [3, 'iss'], [3, 'issqn'],
    [3, 'ipi'], [3, 'pis'], [3, 'cofins'], [3, 'irpj'], [3, 'csll'], [3, 'irpf'], [3, 'imposto*'], [3, 'carf'],
    [3, 'pgfn'], [3, 'receita federal'], [3, 'execucao fiscal'], [3, 'execucoes fiscais'], [3, 'credito tributario'],
    [3, 'creditos tributarios'], [3, 'divida ativa'], [3, 'itcmd'], [3, 'itbi'], [3, 'iptu'], [3, 'iof'], [3, 'ibs'],
    [3, 'cbs'], [3, 'simples nacional'], [3, 'fisco'], [3, 'sefaz'], [3, 'contribuinte*'], [3, 'difal'],
    [3, 'substituicao tributaria'], [3, 'sonegacao'], [3, 'evasao fiscal'], [3, 'auto de infracao'],
    [3, 'beneficio fiscal'], [3, 'beneficios fiscais'], [3, 'incentivo fiscal'], [3, 'incentivos fiscais'],
    [3, 'isencao'], [3, 'isencoes'], [3, 'aliquota*'], [3, 'base de calculo'], [3, 'fato gerador'], [3, 'ctn'],
    [3, 'juros sobre capital proprio'], [3, 'jcp'], [3, 'refis'], [3, 'fazenda nacional'], [3, 'imunidade tributaria'],
    [2, 'contribuicao previdenciaria'], [2, 'contribuicoes previdenciarias'], [2, 'fazenda publica'],
    [2, 'repeticao de indebito'], [2, 'arrecadacao'], [2, 'restituicao'],
    [1, 'fiscal'], [1, 'fiscais'], [1, 'taxa'], [1, 'taxas'], [1, 'parcelamento'], [1, 'compensacao'],
  ],
  Empresarial: [
    [3, 'empresarial'], [3, 'empresariais'], [3, 'societari*'], [3, 'sociedade anonima'], [3, 'sociedades anonimas'],
    [3, 'sociedade limitada'], [3, 'socio'], [3, 'socios'], [3, 'socia'], [3, 'socias'], [3, 'acionista*'],
    [3, 'recuperacao judicial'], [3, 'recuperacao extrajudicial'], [3, 'recuperanda'], [3, 'falencia'],
    [3, 'falencias'], [3, 'falid*'], [3, 'administrador judicial'], [3, 'plano de recuperacao'], [3, 'lei 11.101'],
    [3, 'cvm'], [3, 'comissao de valores mobiliarios'], [3, 'mercado de capitais'], [3, 'valores mobiliarios'],
    [3, 'debenture*'], [3, 'm&a'], [3, 'cade'], [3, 'antitruste'], [3, 'concorrencial'], [3, 'propriedade intelectual'],
    [3, 'propriedade industrial'], [3, 'patente*'], [3, 'inpi'], [3, 'franquia*'], [3, 'franqueado*'], [3, 'startup*'],
    [3, 'holding*'], [3, 'quotas'], [3, 'apuracao de haveres'], [3, 'dissolucao parcial'],
    [3, 'desconsideracao da personalidade juridica'], [3, 'junta comercial'], [3, 'contrato social'],
    [3, 'titulo de credito'], [3, 'titulos de credito'], [3, 'duplicata*'], [3, 'nota promissoria'],
    [3, 'joint venture'], [3, 'acordo de acionistas'], [3, 'assembleia geral'], [3, 'conselho de administracao'],
    [2, 'credor'], [2, 'credores'], [2, 'fusao'], [2, 'fusoes'], [2, 'marca'], [2, 'marcas'], [2, 'arbitragem'],
    [2, 'arbitral'], [2, 'governanca'], [2, 'lgpd'], [2, 'compliance'], [2, 'instituicao financeira'],
    [2, 'instituicoes financeiras'], [2, 'bancari*'], [2, 'seguradora*'], [2, 'mercantil'], [2, 'comercial'],
    [1, 'empresa*'], [1, 'contrato*'], [1, 'aquisicao'], [1, 'aquisicoes'], [1, 'cotas'], [1, 'concorrencia'],
    [1, 'consumidor*'], [1, 'banco*'],
  ],
  Trabalhista: [
    [3, 'trabalhista*'], [3, 'clt'], [3, 'tst'], [3, 'trt*'], [3, 'justica do trabalho'], [3, 'vara do trabalho'],
    [3, 'empregado*'], [3, 'empregador*'], [3, 'empregaticio'], [3, 'vinculo de emprego'], [3, 'reclamacao trabalhista'],
    [3, 'hora extra'], [3, 'horas extras'], [3, 'jornada'], [3, 'fgts'], [3, 'verbas rescisorias'], [3, 'aviso previo'],
    [3, 'insalubridade'], [3, 'periculosidade'], [3, 'adicional noturno'], [3, 'sindicato*'], [3, 'sindical'],
    [3, 'convencao coletiva'], [3, 'acordo coletivo'], [3, 'negociacao coletiva'], [3, 'terceirizacao'],
    [3, 'terceirizad*'], [3, 'ministerio publico do trabalho'], [3, 'mpt'], [3, 'assedio moral'], [3, 'ferias'],
    [3, 'decimo terceiro'], [3, 'trabalhador*'], [3, 'trabalhadora*'], [3, 'pejotizacao'], [3, 'reforma trabalhista'],
    [3, 'acidente de trabalho'], [3, 'teletrabalho'], [3, 'justa causa'], [3, 'rescisao indireta'],
    [3, 'estabilidade provisoria'], [3, 'salario*'], [3, 'salarial'],
    [2, 'reclamante'], [2, 'reclamada'], [2, 'reintegracao'], [2, 'greve'], [2, 'assedio sexual'], [2, 'gestante'],
    [2, 'licenca-maternidade'],
    [1, 'trabalho'], [1, 'rescisao'], [1, 'dispensa'], [1, 'demissao'], [1, 'demitid*'], [1, 'estabilidade'],
    [1, 'emprego'], [1, 'previdenciari*'],
  ],
};

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const REGRAS = Object.fromEntries(
  Object.entries(TERMOS).map(([area, termos]) => [
    area,
    termos.map(([peso, termo]) => {
      const prefixo = termo.endsWith('*');
      const corpo = escaparRegex(prefixo ? termo.slice(0, -1) : termo);
      return [peso, new RegExp(`(?<![a-z0-9])${corpo}${prefixo ? '[a-z0-9]*' : '(?![a-z0-9])'}`, 'g')];
    }),
  ]),
);

function pontuar(texto, regras, maximo) {
  let pontos = 0;
  for (const [peso, regex] of regras) pontos += peso * Math.min(maximo, (texto.match(regex) || []).length);
  return pontos;
}

// Área pelo assunto: conta termos típicos no título (vale mais) e no texto.
// Devolve { area, pontos, duvida } — duvida=true quando a escolha não é clara.
export function classificarArea(titulo, texto) {
  const t = normalizar(titulo);
  const c = normalizar(texto);
  const pontos = Object.fromEntries(AREAS.map((a) => [a, pontuar(t, REGRAS[a], 2) * 3 + pontuar(c, REGRAS[a], 4)]));
  const [primeira, segunda] = [...AREAS].sort((a, b) => pontos[b] - pontos[a]);
  const duvida = pontos[primeira] < 6 || pontos[segunda] >= pontos[primeira] * 0.7;
  return { area: primeira, pontos, duvida };
}

// "Tributário", "TRABALHISTA", "empresarial" … → nome oficial da área.
export function areaPorNome(nome) {
  const n = normalizar(nome);
  if (/tribut/.test(n)) return 'Tributário';
  if (/trabalh/.test(n)) return 'Trabalhista';
  if (/empresa/.test(n)) return 'Empresarial';
  return '';
}

// Área indicada pelo caminho do arquivo: pasta ou arquivo cujo nome começa
// pela área ("Tributário/…", "Notícias - Trabalhista/…", "Empresarial 01.txt").
const NOME_DE_AREA = /^(?:noticias\s*[-–_]?\s*)?(tributari[oa]|trabalhista|empresarial)(?![a-z])/;

function areaPelaOrigem(origem) {
  for (const parte of String(origem).split(/[\\/]/)) {
    const area = normalizar(parte.trim()).match(NOME_DE_AREA);
    if (area) return areaPorNome(area[1]);
  }
  return '';
}

// ---------------------------------------------------------------- matérias

// Um .txt pode trazer várias matérias separadas por uma linha "=====" ou "-----".
const SEPARADOR = /^\s*(?:={5,}|-{5,}|_{5,}|\*{5,})\s*$/m;

export function separarMaterias(texto) {
  return String(texto)
    .replace(/\r\n?/g, '\n')
    .split(SEPARADOR)
    .map((parte) => parte.trim())
    .filter(Boolean);
}

const ROTULO = /^(t[ií]tulo|autor(?:a|es|as)?|por|link(?:\s+de\s+acesso)?|url|fonte|data|[áa]rea)\s*:\s*(.*)$/i;
const SO_URL = /^<?(https?:\/\/[^\s<>]+?)>?[.,;]?$/i;
const URL_NO_TEXTO = /https?:\/\/[^\s<>"]+[^\s<>".,;)]/i;

// Linhas soltas que vêm junto ao copiar a página (botões, créditos de imagem).
const LIXO = new Set(
  [
    'compartilhar', 'compartilhe', 'imprimir', 'facebook', 'twitter', 'x', 'linkedin', 'whatsapp', 'telegram', 'e-mail',
    'email', 'copiar link', 'link copiado', 'salvar', 'ouvir', 'ouca', 'ouvir materia', 'leia tambem', 'leia mais',
    'spacca', 'freepik', 'reproducao', 'divulgacao', 'publicidade', 'continua apos a publicidade', 'assine', 'newsletter',
  ].map(normalizar),
);

const FONTES = [
  [/(^|\.)jota\.info$/, 'JOTA'],
  [/(^|\.)migalhas\.com\.br$/, 'Migalhas'],
  [/(^|\.)valor\.globo\.com$/, 'Valor Econômico'],
];

// Nome do portal para "Por: Fulano (JOTA)"; ConJur e desconhecidos ficam sem.
export function fonteDoLink(link) {
  try {
    const host = new URL(link).hostname.toLowerCase();
    return FONTES.find(([re]) => re.test(host))?.[1] || '';
  } catch {
    return '';
  }
}

export function linkValido(link) {
  try {
    return ['http:', 'https:'].includes(new URL(link).protocol);
  } catch {
    return false;
  }
}

function limparTitulo(titulo) {
  return titulo
    .replace(/\s+[-|–—]\s+(conjur|consultor juridico|jota|migalhas|valor economico)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Por Fulano de Tal" / "Por: Fulano, 25/08/2026" → { autor, data }.
function autorDaLinha(linha) {
  const m = linha.match(/^por:?\s+(.+)$/i);
  if (!m) return null;
  const [autor, ...resto] = m[1].split(/\s+[|–—]\s+|\s+-\s+|,\s*(?=\d)/);
  const nome = autor.trim();
  if (!/^\p{Lu}/u.test(nome) || nome.length > 100 || /[.!?;:]$/.test(nome) || nome.split(/\s+/).length > 15) return null;
  return { autor: nome, data: acharData(resto.join(' ')) };
}

// Lê uma matéria em texto livre. Aceita rótulos opcionais no começo
// ("Título:", "Autor:", "Link:", "Data:", "Área:"); sem eles, usa a 1ª linha
// como título, "Por …" como autor, e a linha que for só um endereço como link.
export function interpretarMateria(textoBruto, origem = '') {
  const linhas = String(textoBruto)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.trim());
  const usada = linhas.map(() => false);
  const m = { titulo: '', autor: '', link: '', data: '', areaRotulo: '' };

  const aplicarRotulo = (linha) => {
    const r = linha.match(ROTULO);
    if (!r) return false;
    const chave = normalizar(r[1]);
    const valor = r[2].trim();
    if (chave === 'titulo') m.titulo ||= limparTitulo(valor);
    else if (chave.startsWith('autor') || chave === 'por') m.autor ||= valor;
    else if (chave.startsWith('link') || chave === 'url' || chave === 'fonte') m.link ||= valor.match(URL_NO_TEXTO)?.[0] || '';
    else if (chave === 'data') m.data ||= acharData(valor);
    else if (chave === 'area') m.areaRotulo ||= areaPorNome(valor);
    return true;
  };

  const naoVazias = linhas.flatMap((l, i) => (l ? [[l, i]] : []));

  // Cabeçalho: as primeiras linhas curtas, antes do primeiro parágrafo longo.
  for (const [linha, i] of naoVazias.slice(0, 8)) {
    if (linha.length > 200) break;
    const url = linha.match(SO_URL);
    const autor = !m.autor && !ROTULO.test(linha) ? autorDaLinha(linha) : null;
    if (aplicarRotulo(linha)) usada[i] = true;
    else if (url) {
      m.link ||= url[1];
      usada[i] = true;
    } else if (autor) {
      m.autor = autor.autor;
      m.data ||= autor.data;
      usada[i] = true;
    } else if (linhaSoDeData(linha)) {
      m.data ||= acharData(linha);
      usada[i] = true;
    } else if (!m.titulo) {
      m.titulo = limparTitulo(linha);
      usada[i] = true;
    }
  }

  // Rodapé: link colado no fim ("Link de Acesso: …" ou só o endereço).
  for (const [linha, i] of naoVazias.slice(-4)) {
    if (usada[i]) continue;
    const url = linha.match(SO_URL);
    if (url) {
      m.link ||= url[1];
      usada[i] = true;
    } else if (/^(link(\s+de\s+acesso)?|url|fonte)\s*:/i.test(linha) && aplicarRotulo(linha)) {
      usada[i] = true;
    }
  }

  // Corpo: o resto, sem lixo de página e sem linhas em branco repetidas.
  const corpo = [];
  for (const [i, linha] of linhas.entries()) {
    if (usada[i] || LIXO.has(normalizar(linha))) continue;
    if (!linha && (!corpo.length || !corpo.at(-1))) continue;
    corpo.push(linha);
  }
  while (corpo.length && !corpo.at(-1)) corpo.pop();
  const texto = corpo.join('\n');

  const fonte = fonteDoLink(m.link);
  if (m.autor && fonte && !m.autor.includes('(')) m.autor = `${m.autor} (${fonte})`;

  const automatica = classificarArea(m.titulo, texto);
  const areaFixa = m.areaRotulo || areaPelaOrigem(origem);
  return {
    titulo: m.titulo,
    autor: m.autor,
    link: m.link,
    data: m.data,
    texto,
    area: areaFixa || automatica.area,
    areaConferir: !areaFixa && automatica.duvida,
    origem,
  };
}

export function contarPalavras(texto) {
  return (String(texto).match(/\S+/g) || []).length;
}

// Parágrafos do texto integral: blocos separados por linha em branco; dentro
// de um bloco, cada quebra de linha é mantida. Sem linhas em branco, cada
// linha é um parágrafo. Devolve [[linha, linha…], …].
export function paragrafos(texto) {
  const blocos = [];
  let atual = [];
  for (const linha of String(texto).replace(/\r\n?/g, '\n').split('\n')) {
    const l = linha.trim();
    if (l) atual.push(l);
    else if (atual.length) {
      blocos.push(atual);
      atual = [];
    }
  }
  if (atual.length) blocos.push(atual);
  return blocos.length > 1 ? blocos : blocos.flatMap((b) => b.map((l) => [l]));
}

// Data mais frequente entre as matérias (empate: a mais recente).
export function dataPredominante(materias) {
  const contagem = new Map();
  for (const { data } of materias) if (data) contagem.set(data, (contagem.get(data) || 0) + 1);
  return [...contagem].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] || '';
}

// ---------------------------------------------------------------- e-mail

export function assunto(area, data) {
  return `Notícias - ${area} - ${formatarData(data, '.')}`;
}

export function nomeArquivo(area, data) {
  return `EMAIL_NOTICIAS_${normalizar(area).toUpperCase()}_${formatarData(data, '-')}.html`;
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// HTML do e-mail de uma área, no modelo do escritório (estilos inline, que o
// Outlook mantém). Cada parágrafo vira um <p> próprio: o Outlook ignora
// "white-space:pre-line" e juntaria o texto todo num bloco só.
export function montarEmail({ area, data, materias }) {
  const h = [
    '<meta charset="utf-8">',
    `<div style="font-family:'Calibri Light',Calibri,sans-serif; font-size:11pt; color:#000000; line-height:1.35;">`,
    '',
    `<p style="font-family:Calibri,sans-serif; font-weight:bold; margin:0 0 12pt 0;">${esc(assunto(area, data))}</p>`,
    '',
    '<p style="font-family:Calibri,sans-serif; font-weight:bold; margin:0 0 4pt 0;">Sumário</p>',
  ];
  materias.forEach((m, i) => {
    h.push(`<p style="margin:0 0 2pt 0;"><a href="#materia-${i + 1}" style="color:#000000; text-decoration:none;">${i + 1}. ${esc(m.titulo)}</a></p>`);
  });
  materias.forEach((m, i) => {
    const n = i + 1;
    h.push('', `<!-- ===================== MATÉRIA ${n} ===================== -->`, `<div id="materia-${n}">`);
    h.push(
      `<p style="font-family:Calibri,sans-serif; font-weight:bold; text-align:center; margin:18pt 0 ${m.autor ? 4 : 12}pt 0;"><a name="materia-${n}"></a>${esc(m.titulo)}</p>`,
    );
    if (m.autor) h.push(`<p style="text-align:center; margin:0 0 12pt 0;">Por: ${esc(m.autor)}</p>`);
    for (const p of paragrafos(m.texto)) h.push(`<p style="text-align:justify; margin:0 0 8pt 0;">${p.map(esc).join('<br>')}</p>`);
    if (linkValido(m.link)) {
      h.push(`<p style="margin:12pt 0 18pt 0;"><strong>Link de Acesso:</strong> <a href="${esc(m.link)}">${esc(m.link)}</a></p>`);
    }
    h.push('</div>', '<p style="margin:0 0 10pt 0;">&nbsp;</p>');
  });
  h.push('', '</div>', '');
  return h.join('\n');
}

// Versão em texto simples (vai junto na área de transferência).
export function montarTexto({ area, data, materias }) {
  const partes = [assunto(area, data), '', 'Sumário', ...materias.map((m, i) => `${i + 1}. ${m.titulo}`)];
  for (const m of materias) {
    partes.push('', '', m.titulo);
    if (m.autor) partes.push(`Por: ${m.autor}`);
    partes.push('', ...paragrafos(m.texto).map((p) => `${p.join('\n')}\n`));
    if (linkValido(m.link)) partes.push(`Link de Acesso: ${m.link}`);
  }
  return `${partes.join('\n').trim()}\n`;
}
