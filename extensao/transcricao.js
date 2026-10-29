// Transcrição das matérias: monta a matéria do e-mail de notícias a partir do
// que o leitor achou na página (leitor.js) ou do OCR dos prints, sem resumir,
// reescrever nem completar nada. Só funções puras (testável no Node).
import { acharData, autorComFonte, autorDaLinha, classificarArea, limparTitulo, linhaDeLixo, linhaSoDeData, normalizar } from './noticias-texto.js';

// ---------------------------------------------------------------- texto da página

const mesmoTexto = (a, b) => normalizar(a).replace(/\W+/g, '') === normalizar(b).replace(/\W+/g, '');

// "2026-10-27T08:05:00-03:00" → "2026-10-27" (a data como o site publicou).
export function dataDoSite(valor) {
  const iso = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : acharData(valor);
}

// Blocos → texto integral: um parágrafo por bloco (linha em branco entre eles);
// itens de lista e linhas de tabela seguidos ficam juntos, um por linha.
// Intertítulo vira **…** (negrito no e-mail) e legenda vira _…_ (itálico).
export function textoDosBlocos(blocos) {
  const partes = [];
  let grupo = null;
  for (const b of blocos) {
    const linhas = String(b.texto ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!linhas.length) continue;
    if (b.tipo === 'item' || b.tipo === 'tabela') {
      if (grupo?.tipo === b.tipo) grupo.linhas.push(...linhas);
      else partes.push((grupo = { tipo: b.tipo, linhas: [...linhas] }));
      continue;
    }
    grupo = null;
    if (b.tipo === 'intertitulo') partes.push({ linhas: [`**${linhas.join(' ')}**`] });
    else if (b.tipo === 'legenda') partes.push({ linhas: [`_${linhas.join(' ')}_`] });
    else partes.push({ linhas });
  }
  return partes.map((p) => p.linhas.join('\n')).join('\n\n');
}

// Palavras muito comuns em português (e em inglês, para não confundir uma
// matéria em inglês com texto embaralhado).
const COMUNS = new Set(
  (
    'de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser ' +
    'quando muito há nos já está também só pelo pela até isso ela entre era depois sem mesmo aos ter seus quem nas esse ' +
    'eles estão você tinha foram essa num nem suas às minha têm numa pelos elas havia seja qual será nós lhe deles essas ' +
    'esses pelas este fosse dele sobre após pode podem anos ano lei caso segundo ainda contra the of and to in is that for ' +
    'it on with as was by are be this from'
  ).split(' '),
);

// Texto que o site embaralha de propósito (fonte trocada para não deixar
// copiar): na tela aparece certo, mas as letras da página não formam palavras.
export function pareceEmbaralhado(texto) {
  const palavras = String(texto ?? '').toLocaleLowerCase('pt-BR').match(/\p{L}+/gu) || [];
  if (palavras.length < 25) return false;
  return palavras.filter((p) => COMUNS.has(p)).length / palavras.length < 0.08;
}

export const palavrasDe = (texto) => (String(texto ?? '').match(/\S+/g) || []).length;

// A leitura da página serve, ou é preciso ler os prints com OCR?
// Devolve '' (serve) ou o motivo.
export function motivoParaOcr(leitura) {
  if (!leitura?.ok) return 'a página não deixou ler o texto';
  const texto = (leitura.blocos || []).map((b) => b.texto).join('\n');
  if (palavrasDe(texto) < 25) return 'a página não tem o texto da matéria (pode estar numa imagem)';
  if (pareceEmbaralhado(texto)) return 'o texto da página vem embaralhado';
  return '';
}

function montarMateria({ titulo, autor, link, data, texto, origem, transcricao }) {
  const area = classificarArea(titulo, texto);
  return { titulo, autor: autorComFonte(autor, link), link, data, texto, area: area.area, areaConferir: area.duvida, origem, transcricao };
}

// Leitura da página (leitor.js) → matéria do e-mail.
export function materiaDaLeitura(leitura, transcricao = { tipo: 'pagina' }) {
  const blocos = (leitura.blocos || []).filter((b) => b.texto?.trim());
  let autor = leitura.autor || '';
  let data = dataDoSite(leitura.data);
  // Linhas de autor e de data no começo do corpo ("Por Fulano | 27/10/2026").
  for (let i = 0; i < Math.min(blocos.length, 6); i++) {
    const t = blocos[i].texto.trim();
    if (t.length > 160 || blocos[i].tipo === 'intertitulo') continue;
    const a = autorDaLinha(t);
    if (a) {
      autor ||= a.autor;
      data ||= a.data;
      blocos.splice(i--, 1);
    } else if (linhaSoDeData(t)) {
      data ||= acharData(t);
      blocos.splice(i--, 1);
    }
  }
  // Legendas e linhas que são só crédito de foto ou botão do site.
  const corpo = blocos.filter((b) => !linhaDeLixo(b.texto));
  // Linha fina logo abaixo do título, se o corpo não começa com ela; ela é um
  // parágrafo (o site pode marcá-la como intertítulo, em <h2>).
  const fina = leitura.subtitulo ? corpo.slice(0, 2).findIndex((b) => mesmoTexto(b.texto, leitura.subtitulo)) : -1;
  if (fina >= 0) corpo[fina] = { ...corpo[fina], tipo: 'paragrafo' };
  else if (leitura.subtitulo) corpo.unshift({ tipo: 'paragrafo', texto: leitura.subtitulo });
  return montarMateria({
    titulo: limparTitulo(leitura.titulo || leitura.tituloPagina || ''),
    autor,
    link: leitura.endereco || '',
    data,
    texto: textoDosBlocos(corpo),
    origem: 'Lida da página (texto exato do site)',
    transcricao,
  });
}

// ---------------------------------------------------------------- OCR

// Palavra que o OCR pode ter lido errado: confiança abaixo da de uma leitura
// limpa (o Tesseract dá 95–96 para quase toda palavra certa; palavras
// juntadas, como "amulta" no lugar de "a multa", ficam perto de 90), ou
// número, porcentagem, moeda e símbolos (que mudam o sentido) sem confiança alta.
const RISCO = /[0-9%$§ºª°€£¥@#&*+=<>/\\|~^]/;
export function palavraDuvidosa(p) {
  if (p.confianca < 91) return true;
  if (/[ºª°§]/.test(p.texto) && p.confianca < 97) return true;
  if (RISCO.test(p.texto) && p.confianca < 93) return true;
  return (p.simbolos || []).some((s) => s.confianca < 70);
}

// Texto de uma linha do OCR, com os trechos duvidosos entre ⟦ ⟧.
export function textoDaLinha(palavras) {
  const saida = [];
  let duvida = [];
  const fechar = () => {
    if (duvida.length) saida.push(`⟦${duvida.join(' ')}⟧`);
    duvida = [];
  };
  for (const p of palavras) {
    const t = String(p.texto ?? '').trim();
    if (!t) continue;
    if (palavraDuvidosa(p)) duvida.push(t);
    else {
      fechar();
      saida.push(t);
    }
  }
  fechar();
  return saida.join(' ');
}

// Limites entre um print e o seguinte, no meio da parte repetida (sobreposição):
// assim cada linha vem do print em que ela aparece inteira, uma vez só.
export function limitesEntrePrints(prints) {
  const limites = [];
  for (let i = 0; i + 1 < prints.length; i++) {
    const a = prints[i];
    const b = prints[i + 1];
    const fimA = a.topoDoc + a.altura - a.ocupadoBase;
    const inicioB = b.topoDoc + b.ocupadoTopo;
    limites.push(inicioB < fimA ? (inicioB + fimA) / 2 : fimA);
  }
  return limites;
}

const dentro = (x, y, c, folga = 0) => x >= c.x - folga && x <= c.x + c.w + folga && y >= c.y - folga && y <= c.y + c.h + folga;

// prints: [{ topoDoc, altura, ocupadoTopo, ocupadoBase, linhas: [{ y, h, x, w, palavras, paragrafo }] }]
// com y/x já na página (px CSS). Devolve as linhas na ordem, sem repetição,
// só da matéria (dentro da caixa dela e fora das imagens, quando se sabe onde estão).
export function juntarLinhas(prints, { caixa = null, imagens = [] } = {}) {
  const limites = limitesEntrePrints(prints);
  const linhas = [];
  prints.forEach((p, i) => {
    const de = i === 0 ? -Infinity : limites[i - 1];
    const ate = i === prints.length - 1 ? Infinity : limites[i];
    for (const l of p.linhas) {
      const cy = l.y + l.h / 2;
      const cx = l.x + l.w / 2;
      if (cy < de || cy >= ate) continue;
      // por baixo de cabeçalho/rodapé fixo (o que aparece ali é do site)
      if (cy - p.topoDoc < p.ocupadoTopo || cy - p.topoDoc > p.altura - p.ocupadoBase) continue;
      if (caixa && !dentro(cx, cy, caixa, 12)) continue;
      if (imagens.some((im) => dentro(cx, cy, im))) continue;
      linhas.push({ ...l, print: i });
    }
  });
  return linhas.sort((a, b) => a.y - b.y || a.x - b.x);
}

const mediana = (valores) => {
  const v = [...valores].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};

// Espaço a partir do qual começa outro parágrafo: o meio do maior salto entre
// os espaços (os de entre linhas são parecidos; os de entre parágrafos, bem
// maiores). Sem salto claro, nenhum espaço separa parágrafos.
export function limiteDeParagrafo(espacos, altura) {
  const v = [...espacos].sort((a, b) => a - b);
  let melhor = null;
  for (let i = 1; i < v.length; i++) {
    const [a, b] = [v[i - 1], v[i]];
    if (b - a >= altura * 0.3 && b >= a * 1.4 + 2 && (!melhor || b - a > melhor.salto)) melhor = { salto: b - a, meio: (a + b) / 2 };
  }
  return melhor ? melhor.meio : Infinity;
}

// Linhas → parágrafos. Começa parágrafo novo quando o espaço até a linha
// anterior é de parágrafo, ou quando a anterior acaba bem antes da margem com
// ponto final. Palavra quebrada no fim da linha ("trans-" + "ferência") é
// juntada e marcada para conferir.
export function textoDoOcr(linhas) {
  const altura = mediana(linhas.map((l) => l.h)) || 16;
  const espacos = [];
  for (let i = 1; i < linhas.length; i++) espacos.push(Math.max(0, linhas[i].y - (linhas[i - 1].y + linhas[i - 1].h)));
  const normal = mediana(espacos);
  const limite = limiteDeParagrafo(espacos, altura);
  const direita = Math.max(0, ...linhas.map((l) => l.x + l.w));
  const esquerda = Math.min(Infinity, ...linhas.map((l) => l.x));
  const largura = direita - esquerda;
  const paragrafos = [];
  let atual = [];
  let anterior = null;
  for (const l of linhas) {
    const texto = textoDaLinha(l.palavras);
    if (anterior) {
      const espaco = l.y - (anterior.y + anterior.h);
      const curta = anterior.x + anterior.w < direita - largura * 0.12 && /[.!?:”"»)]$/.test(atual.at(-1) || '');
      if ((espaco > limite || (curta && espaco >= normal - 2)) && atual.length) {
        paragrafos.push(atual);
        atual = [];
      }
    }
    if (texto) atual.push(texto);
    anterior = l;
  }
  if (atual.length) paragrafos.push(atual);
  return paragrafos.map(juntarTextos).join('\n\n');
}

// Linhas de um parágrafo → uma linha só. Palavra quebrada no fim da linha é
// juntada e marcada para conferir: "trans-" + "ferência" perde o hífen;
// "Sefaz-" + "MA" (o hífen é da palavra) fica com ele.
function juntarTextos(textos) {
  return textos.reduce((junto, linha) => {
    if (!junto) return linha;
    // (a palavra de antes e a de depois podem já estar dentro de um trecho marcado)
    const quebra = junto.match(/(\S+)-(⟧?)$/);
    const marcada = linha.startsWith('⟦');
    const corpo = marcada ? linha.slice(1) : linha;
    if (quebra && /^[\p{L}\d]/u.test(corpo)) {
      const [primeira, ...depois] = corpo.split(' ');
      const palavra = `${quebra[1]}${/^\p{Ll}/u.test(corpo) ? '' : '-'}${primeira}`.replace(/[⟦⟧]/g, '');
      const abertoAntes = quebra[2] && !quebra[1].startsWith('⟦');
      let seguinte = depois.join(' ');
      if (marcada && !primeira.endsWith('⟧') && seguinte) seguinte = `⟦${seguinte}`;
      return [junto.slice(0, -quebra[0].length) + (abertoAntes ? `${palavra}⟧` : `⟦${palavra}⟧`), seguinte].filter(Boolean).join(' ');
    }
    return `${junto} ${linha}`;
  }, '');
}

const MARCADOR = /^(• |\d+\. )/;
const SIMBOLO_DE_LISTA = /^[•·*«»▪●○◦‣⁃–-]$/;

// Quando a página diz onde está cada bloco da matéria (parágrafo, intertítulo,
// legenda…), cada linha do OCR vai para o bloco onde ela aparece. O que não
// cai em bloco nenhum (título, botões, anúncios no meio) é do site e fica de fora.
export function textoPorBlocos(linhas, blocos) {
  const grupos = blocos.map(() => []);
  for (const l of linhas) {
    const i = blocos.findIndex((b) => b.caixa && dentro(l.x + l.w / 2, l.y + l.h / 2, b.caixa, 4));
    if (i >= 0) grupos[i].push(l);
  }
  return blocos
    .map((b, i) => {
      const ordem = grupos[i].sort((a, c) => a.y - c.y || a.x - c.x);
      const marcador = b.tipo === 'item' ? b.texto?.match(MARCADOR)?.[0] || '• ' : '';
      const textos = ordem.map((l, j) => {
        let palavras = l.palavras;
        // o marcador do item ("•", "3.") lido pelo OCR sai: ele vem da página
        if (marcador && j === 0 && palavras.length && (SIMBOLO_DE_LISTA.test(palavras[0].texto) || palavras[0].texto === marcador.trim())) palavras = palavras.slice(1);
        return textoDaLinha(palavras);
      });
      const texto = juntarTextos(textos.filter(Boolean));
      return { ...b, texto: texto ? marcador + texto : '' };
    })
    .filter((b) => b.texto.trim());
}

// Título: o da página, a não ser que o lido na tela seja outro (texto embaralhado).
function tituloDoOcr(daPagina, lido) {
  const limpo = lido.replace(/[⟦⟧]/g, '').trim();
  if (!daPagina || !limpo) return daPagina || limpo;
  const palavras = (t) => normalizar(t).match(/\p{L}{3,}/gu) || [];
  const naPagina = new Set(palavras(daPagina));
  const doOcr = palavras(limpo);
  return doOcr.length && doOcr.filter((p) => naPagina.has(p)).length >= doOcr.length * 0.5 ? daPagina : limpo;
}

// Prints lidos com OCR → matéria do e-mail. Os dados da página (título, link,
// data), quando a leitura conseguiu achá-los, vão junto.
export function materiaDoOcr({ prints, leitura = null, titulo = '', endereco = '', sessao = null }) {
  const transcricao = { tipo: 'ocr', sessao };
  const origem = 'Lida dos prints por OCR: confira os trechos em amarelo';
  const blocos = (leitura?.blocos || []).filter((b) => b.caixa);
  if (blocos.length && palavrasDe(blocos.map((b) => b.texto).join(' ')) >= 25) {
    // a página tem os blocos (com o texto embaralhado, ou OCR pedido): bloco a bloco
    const linhas = juntarLinhas(prints, { imagens: leitura.imagens || [] });
    const extras = [
      leitura.caixaTitulo && { tipo: 'titulo', texto: '', caixa: leitura.caixaTitulo },
      leitura.caixaSubtitulo && { tipo: 'subtitulo', texto: '', caixa: leitura.caixaSubtitulo },
    ].filter(Boolean);
    const lidos = textoPorBlocos(linhas, [...extras, ...blocos]);
    const m = materiaDaLeitura(
      {
        ...leitura,
        titulo: tituloDoOcr(leitura.titulo, lidos.find((b) => b.tipo === 'titulo')?.texto || ''),
        subtitulo: lidos.find((b) => b.tipo === 'subtitulo')?.texto || '',
        blocos: lidos.filter((b) => b.tipo !== 'titulo' && b.tipo !== 'subtitulo'),
      },
      transcricao,
    );
    return { ...m, origem };
  }
  const linhas = juntarLinhas(prints, { caixa: leitura?.caixa || null, imagens: leitura?.imagens || [] });
  const paragrafos = textoDoOcr(linhas).split('\n\n').filter(Boolean);
  let tituloFinal = limparTitulo(leitura?.titulo || titulo || '');
  let autor = leitura?.autor || '';
  let data = dataDoSite(leitura?.data);
  if (!tituloFinal && paragrafos.length) tituloFinal = paragrafos.shift().replace(/[⟦⟧]/g, '');
  // título, autor e data lidos pelo OCR no começo não se repetem no corpo
  for (let i = 0; i < Math.min(paragrafos.length, 4); i++) {
    const p = paragrafos[i].replace(/[⟦⟧]/g, '');
    const a = p.length <= 160 && autorDaLinha(p);
    if (mesmoTexto(p, tituloFinal)) paragrafos.splice(i--, 1);
    else if (a) {
      autor ||= a.autor;
      data ||= a.data;
      paragrafos.splice(i--, 1);
    } else if (p.length <= 80 && linhaSoDeData(p)) {
      data ||= acharData(p);
      paragrafos.splice(i--, 1);
    }
  }
  return montarMateria({ titulo: tituloFinal, autor, link: leitura?.endereco || endereco, data, texto: paragrafos.join('\n\n'), origem, transcricao });
}
