// Lê a matéria direto da página: o texto exatamente como o site publica (sem
// OCR, então sem erro em porcentagens, valores, datas e acentos). O corpo da
// matéria é achado com o Readability da Mozilla (o do "Modo de leitura" do
// Firefox), que deixa de fora menus, anúncios, barras laterais e rodapés; por
// cima dele saem os blocos de "Leia também", publicidade e afins dos sites
// brasileiros, e as fotos com a legenda e o crédito delas. Devolve os blocos
// na ordem de leitura (intertítulos, parágrafos, listas, citações, tabelas),
// os dados da matéria e onde ela fica na tela (para o OCR, quando a página não
// tem o texto).
// Injetado pela extensão depois de terceiros/readability/Readability.js e de
// limpeza.js (que tira da cópia da página o que é do site).
(() => {
  if (globalThis.__clippingLeitor) return;
  const { ehLixo, limparMateria } = globalThis.__clippingLimpeza;

  const INVISIVEIS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
  const limpar = (t) => String(t ?? '').replace(INVISIVEIS, '').replace(/\s+/g, ' ').trim();
  const semAcento = (t) =>
    String(t ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  // Linhas que são do site, não da matéria: rótulos de botão (só se a linha
  // for curta, para não levar "Compartilhamento de dados…") e avisos.
  const LIXO_ROTULO = /^(publicidade|anuncio|advertisement|patrocinado|conteudo patrocinado|compartilh\w*|relacionadas|mais lidas|inscreva-se|baixe o app|tempo de leitura)\b/;
  const LIXO_TEXTO =
    /^(leia (tambem|mais)|veja (tambem|mais)|saiba mais|continua (depois|apos) (a|da) publicidade|siga (o|a|nos)\b|receba (as|nossas)? ?noticias|assine (a|o|ja|agora)|\d+ min(utos)? de leitura|ouca (a|esta|este)|ouvir (a |esta )?materia)/;
  // "Leia também: Título de outra matéria" (de qualquer tamanho).
  const CHAMADA = /^(leia|veja) (tambem|mais)\s*[:–-]/;
  const TITULO_LIXO = /^(leia (tambem|mais)|veja (tambem|mais)|saiba mais|mais lidas|relacionadas|noticias relacionadas|ultimas noticias)\b/;
  const CREDITO = /^(foto|fotos|imagem|imagens|ilustra[cç][aã]o|cr[eé]dito|reprodu[cç][aã]o|divulga[cç][aã]o|arquivo)s?\b\s*[:/–-]?/i;

  const PULAR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'NAV', 'ASIDE', 'IMG', 'PICTURE', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME', 'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'CANVAS', 'OBJECT', 'EMBED', 'SOURCE', 'MAP']);
  const CABECALHO = /^H[1-6]$/;
  const BLOCO = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'BLOCKQUOTE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'FIGURE', 'FIGCAPTION', 'HR', 'ADDRESS', 'CENTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

  function visivel(el) {
    try {
      if (el.checkVisibility) return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    } catch {
      return true;
    }
  }

  // Cópia do documento para o Readability (que desmonta o que recebe), sem o
  // que está escondido na página (menus fechados, versões para celular…), e um
  // mapa cópia → página para medir depois onde cada trecho fica na tela.
  function copiar(doc) {
    const copia = doc.cloneNode(true);
    const mapa = new Map();
    const fora = [];
    const pilha = [[doc.documentElement, copia.documentElement]];
    while (pilha.length) {
      const [vivo, clone] = pilha.pop();
      mapa.set(clone, vivo);
      let v = vivo.firstChild;
      let c = clone.firstChild;
      for (; v && c; v = v.nextSibling, c = c.nextSibling) {
        if (v.nodeType === Node.TEXT_NODE) mapa.set(c, v);
        else if (v.nodeType === Node.ELEMENT_NODE) {
          const noCorpo = doc.body?.contains(v) && v.tagName !== 'SCRIPT';
          if (v.id === 'clipping-seletor' || (noCorpo && !visivel(v))) fora.push(c);
          else pilha.push([v, c]);
        }
      }
    }
    for (const c of fora) c.remove();
    const quadros = limparMateria(copia.body, {
      href: (a) => mapa.get(a)?.href || a.getAttribute('href') || '',
      retangulo: (el) => retanguloDe(mapa.get(el)),
      endereco: doc.URL || location.href,
    })
      .map((el) => mapa.get(el))
      .filter(Boolean);
    // Aviso de cookies aberto costuma marcar a página inteira como "aria-hidden":
    // num bloco com muito texto, isso não quer dizer que ele está escondido.
    for (const el of copia.querySelectorAll('[aria-hidden="true"]')) if (el.textContent.length > 1000) el.removeAttribute('aria-hidden');
    return { copia, mapa, quadros };
  }

  // ---------------------------------------------------------------- blocos

  // Quebra de linha no código da página não é quebra no texto (só <br> e o
  // fim de um bloco são), a não ser em trecho que a página mostra assim (<pre>).
  let mapaAtual = null;
  const preformatado = new WeakMap();
  function textoDe(no) {
    const t = no.nodeValue;
    if (!/[\r\n]/.test(t) || no.parentElement?.closest('pre, textarea')) return t;
    const pai = mapaAtual?.get(no)?.parentElement;
    if (pai && !preformatado.has(pai)) {
      try {
        preformatado.set(pai, /^(pre|pre-wrap|pre-line|break-spaces)$/.test(getComputedStyle(pai).whiteSpace));
      } catch {
        preformatado.set(pai, false); // sem estilo: fica como espaço
      }
    }
    return pai && preformatado.get(pai) ? t : t.replace(/[\r\n]+/g, ' ');
  }

  // <sup>o</sup> e <sup>a</sup> são o "º" e o "ª" escritos de outro jeito.
  // marcar(nó) recebe cada nó de texto usado (para medir o bloco na página).
  function textoInline(no, saida, marcar) {
    if (no.nodeType === Node.TEXT_NODE) {
      saida.push(textoDe(no));
      if (no.nodeValue.trim()) marcar?.(no);
      return;
    }
    if (no.nodeType !== Node.ELEMENT_NODE || PULAR.has(no.tagName)) return;
    if (no.tagName === 'BR') {
      saida.push('\n');
      return;
    }
    if (no.tagName === 'SUP') {
      const t = no.textContent.trim();
      if (/^[oOº°]$/.test(t)) return void saida.push('º');
      if (/^[aAª]$/.test(t)) return void saida.push('ª');
    }
    for (const filho of no.childNodes) textoInline(filho, saida, marcar);
  }

  const juntar = (partes) =>
    partes
      .join('')
      .replace(INVISIVEIS, '')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');

  // Parágrafo curto todo em negrito: é intertítulo.
  function soNegrito(el, texto) {
    if (texto.length > 160 || /[.;]$/.test(texto)) return false;
    const fortes = [...el.querySelectorAll('strong, b')].map((b) => limpar(b.textContent)).join(' ');
    return limpar(fortes) === texto;
  }

  // Percorre o corpo da matéria e devolve [{ tipo, texto, no, fim }], na ordem
  // (no e fim: o primeiro e o último nó de texto do bloco).
  // tipo: 'intertitulo' | 'paragrafo' | 'item' | 'citacao' | 'legenda' | 'tabela'.
  function blocosDe(raiz) {
    const limite = Math.max(600, raiz.textContent.length * 0.3);
    const blocos = [];
    let inline = [];
    let primeiroNo = null;
    let ultimoNo = null;
    let tipoAtual = 'paragrafo';
    const marcar = (t) => {
      primeiroNo ??= t;
      ultimoNo = t;
    };
    const fechar = () => {
      const texto = juntar(inline);
      if (texto) blocos.push({ tipo: tipoAtual, texto, no: primeiroNo, fim: ultimoNo });
      inline = [];
      primeiroNo = null;
      ultimoNo = null;
    };
    const visitar = (no, contexto) => {
      if (no.nodeType === Node.TEXT_NODE) {
        if (!no.nodeValue.trim() && !inline.length) return;
        inline.push(textoDe(no));
        if (no.nodeValue.trim()) marcar(no);
        return;
      }
      if (no.nodeType !== Node.ELEMENT_NODE) return;
      const tag = no.tagName;
      if (PULAR.has(tag) || ehLixo(no, limite)) return;
      if (tag === 'BR') {
        inline.push('\n');
        return;
      }
      if (tag === 'SUP' || !BLOCO.has(tag)) {
        textoInline(no, inline, marcar);
        return;
      }
      fechar();
      if (CABECALHO.test(tag) || tag === 'FIGCAPTION') {
        textoInline(no, inline, marcar);
        tipoAtual = tag === 'FIGCAPTION' ? 'legenda' : 'intertitulo';
        fechar();
        tipoAtual = 'paragrafo';
        return;
      }
      if (tag === 'TR') {
        const celulas = [...no.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH').map((c) => limpar(c.innerText ?? c.textContent));
        const textos = [];
        textoInline(no, textos, marcar);
        if (celulas.some(Boolean)) blocos.push({ tipo: 'tabela', texto: celulas.join(' | '), no: primeiroNo, fim: ultimoNo });
        primeiroNo = ultimoNo = null;
        return;
      }
      if (tag === 'LI') {
        const lista = no.parentElement;
        const ordenada = lista?.tagName === 'OL';
        const n = ordenada ? (lista.start || 1) + [...lista.children].filter((c) => c.tagName === 'LI').indexOf(no) : 0;
        tipoAtual = 'item';
        for (const filho of no.childNodes) {
          if (filho.nodeType === Node.ELEMENT_NODE && (filho.tagName === 'UL' || filho.tagName === 'OL')) {
            fechar();
            tipoAtual = 'paragrafo';
            visitar(filho, contexto);
            tipoAtual = 'item';
          } else visitar(filho, contexto);
        }
        if (inline.length) inline.unshift(ordenada ? `${n}. ` : '• ');
        fechar();
        tipoAtual = 'paragrafo';
        return;
      }
      const citacao = tag === 'BLOCKQUOTE' || contexto === 'citacao';
      const antes = tipoAtual;
      if (citacao) tipoAtual = 'citacao';
      for (const filho of no.childNodes) visitar(filho, citacao ? 'citacao' : contexto);
      fechar();
      tipoAtual = antes;
      if (tag === 'P' && blocos.length) {
        const ultimo = blocos.at(-1);
        if (ultimo.no && no.contains(ultimo.no) && ultimo.tipo === 'paragrafo' && soNegrito(no, ultimo.texto)) ultimo.tipo = 'intertitulo';
      }
    };
    for (const filho of raiz.childNodes) visitar(filho, '');
    fechar();
    return blocos;
  }

  // Tira o que é do site: "Leia também" (e os links logo abaixo), avisos de
  // publicidade, botões, créditos de foto sozinhos.
  function filtrar(blocos) {
    const saida = [];
    let pulandoLinks = false;
    for (const b of blocos) {
      const n = semAcento(b.texto);
      if ((b.tipo === 'intertitulo' || n.length < 40) && TITULO_LIXO.test(n)) {
        pulandoLinks = true;
        continue;
      }
      const soLink = b.no && linkInteiro(b.no, b.texto);
      if (pulandoLinks && (soLink || b.tipo === 'item')) continue;
      pulandoLinks = false;
      if ((LIXO_ROTULO.test(n) && n.length < 30) || (LIXO_TEXTO.test(n) && n.length < 60) || CHAMADA.test(n)) continue;
      if (b.tipo === 'legenda' && (CREDITO.test(b.texto) && b.texto.length < 80)) continue;
      saida.push(b);
    }
    return saida;
  }

  // O bloco inteiro é um link (como os itens de "Leia também")?
  function linkInteiro(no, texto) {
    const el = no.nodeType === Node.TEXT_NODE ? no.parentElement : no;
    const bloco = el?.closest('p, li, div, h2, h3, h4') || el;
    const links = [...(bloco?.querySelectorAll?.('a') || [])].map((a) => limpar(a.textContent)).join(' ');
    return Boolean(links) && limpar(links).length >= texto.replace(/^(• |\d+\. )/, '').length - 2;
  }

  // ---------------------------------------------------------------- dados da matéria

  function jsonLd(doc) {
    const itens = [];
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const dados = JSON.parse(s.textContent);
        const fila = Array.isArray(dados) ? [...dados] : [dados];
        while (fila.length) {
          const d = fila.shift();
          if (!d || typeof d !== 'object') continue;
          if (Array.isArray(d['@graph'])) fila.push(...d['@graph']);
          const tipo = [].concat(d['@type'] || []).join(' ');
          if (/Article|NewsArticle|Report|BlogPosting|WebPage/i.test(tipo)) itens.push(d);
        }
      } catch {
        // JSON-LD quebrado: ignora
      }
    }
    return itens.find((d) => /Article|BlogPosting|Report/i.test([].concat(d['@type']).join(' '))) || itens[0] || {};
  }

  const meta = (doc, ...nomes) => {
    for (const nome of nomes) {
      const el = doc.querySelector(`meta[property="${nome}"], meta[name="${nome}"], meta[itemprop="${nome}"]`);
      const v = limpar(el?.getAttribute('content'));
      if (v) return v;
    }
    return '';
  };

  // "Katarina Moraes, Autor no JOTA" → "Katarina Moraes"
  const semRotulo = (nome) => nome.replace(/,?\s+autora?\s+(n[oa]|em|d[oa])\s+.+$/i, '');
  const nomes = (autor) =>
    []
      .concat(autor || [])
      .map((a) => semRotulo(limpar(typeof a === 'string' ? a : a?.name)))
      .filter((a) => a && !/^https?:/i.test(a));

  function juntarNomes(lista) {
    const unicos = [...new Set(lista)];
    return unicos.length > 1 ? `${unicos.slice(0, -1).join(', ')} e ${unicos.at(-1)}` : unicos[0] || '';
  }

  const limparAutor = (t) =>
    semRotulo(limpar(t))
      .replace(/^(por|by)\s*:?\s+/i, '')
      .replace(/\s+[|–—]\s+.*$/, '')
      .replace(/,?\s+\d{1,2}[/.]\d{1,2}[/.]\d{2,4}.*$/, '')
      .trim();

  function dataPublicada(doc, ld, raiz) {
    const candidatos = [
      ld.datePublished,
      meta(doc, 'article:published_time', 'og:published_time', 'datePublished', 'publish-date', 'date', 'dc.date', 'DC.date.issued', 'sailthru.date'),
      doc.querySelector('[itemprop="datePublished"]')?.getAttribute('content') || doc.querySelector('[itemprop="datePublished"]')?.getAttribute('datetime'),
      (raiz?.closest('article') || doc).querySelector('time[datetime]')?.getAttribute('datetime'),
    ];
    return candidatos.map(limpar).find(Boolean) || '';
  }

  // ---------------------------------------------------------------- geometria

  function retanguloDe(no) {
    try {
      if (!no) return null;
      if (no.nodeType === Node.TEXT_NODE) {
        const faixa = no.ownerDocument.createRange();
        faixa.selectNodeContents(no);
        const r = faixa.getBoundingClientRect();
        return r.width || r.height ? r : null;
      }
      const r = no.getBoundingClientRect();
      return r.width || r.height ? r : null;
    } catch {
      return null;
    }
  }

  function retanguloDoBloco(inicio, fim) {
    if (!inicio) return null;
    if (fim && fim !== inicio) {
      try {
        const faixa = inicio.ownerDocument.createRange();
        faixa.setStart(inicio, 0);
        faixa.setEnd(fim, fim.nodeValue.length);
        const r = faixa.getBoundingClientRect();
        if (!faixa.collapsed && (r.width || r.height)) return r;
      } catch {
        // fora de ordem na página: fica o primeiro trecho
      }
    }
    return retanguloDe(inicio);
  }

  function deslocamentoDoQuadro(win) {
    let x = 0;
    let y = 0;
    for (let w = win; w && w !== window && w.frameElement; w = w.parent) {
      const r = w.frameElement.getBoundingClientRect();
      x += r.left + w.frameElement.clientLeft;
      y += r.top + w.frameElement.clientTop;
    }
    return { x, y };
  }

  // ---------------------------------------------------------------- leitura

  function lerDocumento(doc, config) {
    const win = doc.defaultView || window;
    const escolhido = config?.elemento || null;
    let { copia, mapa, quadros } = copiar(doc);
    const ld = jsonLd(doc);
    const copiaDe = (vivo) => {
      for (const [clone, v] of mapa) if (v === vivo) return clone;
      return null;
    };

    let leitura = null;
    // a área escolhida na página: a matéria está dentro dela
    const raizCopia = escolhido ? copiaDe(escolhido) : null;
    try {
      const alvo = raizCopia ? (() => {
        const d = copia.implementation.createHTMLDocument(copia.title);
        for (const m of copia.head.querySelectorAll('meta, title, link[rel="canonical"], script[type="application/ld+json"]')) d.head.append(m.cloneNode(true));
        d.body.append(raizCopia);
        return d;
      })() : copia;
      leitura = new Readability(alvo, { charThreshold: 250, keepClasses: true, serializer: (el) => el }).parse();
    } catch {
      leitura = null;
    }
    let raiz = leitura?.content || null;
    let metodo = 'readability';
    if (!raiz || limpar(raiz.textContent).length < 200) {
      // Sem matéria reconhecida: o bloco da matéria (article, main ou a área
      // escolhida), numa cópia nova (o Readability desmonta a que recebe).
      ({ copia, mapa, quadros } = copiar(doc));
      raiz = (escolhido && copiaDe(escolhido)) || copia.querySelector('article, [itemprop="articleBody"], main, [role="main"]') || copia.body;
      metodo = 'simples';
    }
    mapaAtual = mapa;
    const blocos = filtrar(blocosDe(raiz));

    // onde cada bloco está na página: do primeiro ao último trecho de texto dele
    const desl = deslocamentoDoQuadro(win);
    const rolagem = { x: window.scrollX, y: window.scrollY };
    for (const b of blocos) {
      const r = retanguloDoBloco(mapa.get(b.no), mapa.get(b.fim));
      if (r) b.caixa = { x: r.left + desl.x, y: r.top + desl.y + rolagem.y, w: r.width, h: r.height };
    }
    if (config?.faixaX) {
      // região marcada: só os blocos da coluna dela
      const { x, w } = config.faixaX;
      for (let i = blocos.length - 1; i >= 0; i--) {
        const c = blocos[i].caixa;
        if (c && (c.x + c.w / 2 < x || c.x + c.w / 2 > x + w)) blocos.splice(i, 1);
      }
    }
    const usadas = blocos.map((b) => b.caixa).filter(Boolean);
    let caixa = usadas.length
      ? (() => {
          const x = Math.min(...usadas.map((c) => c.x));
          const y = Math.min(...usadas.map((c) => c.y));
          return { x, y, w: Math.max(...usadas.map((c) => c.x + c.w)) - x, h: Math.max(...usadas.map((c) => c.y + c.h)) - y };
        })()
      : null;

    // imagens dentro da matéria (o OCR não lê o que está nelas)
    const imagens = [];
    if (raiz) {
      for (const img of raiz.querySelectorAll('img, picture, svg, video, canvas, iframe')) {
        const r = retanguloDe(mapa.get(img));
        if (r && r.width > 40 && r.height > 40) imagens.push({ x: r.left + desl.x, y: r.top + desl.y + rolagem.y, w: r.width, h: r.height });
      }
    }
    // e as fotos tiradas com a legenda e o crédito
    for (const vivo of quadros) {
      const r = retanguloDe(vivo);
      const fixo = (() => {
        try {
          return /fixed|sticky/.test(getComputedStyle(vivo).position);
        } catch {
          return true;
        }
      })();
      if (r && !fixo && r.width > 40 && r.height > 20) imagens.push({ x: r.left + desl.x, y: r.top + desl.y + rolagem.y, w: r.width, h: r.height });
    }

    // Quase sem texto: a matéria deve estar numa imagem. A caixa passa a ser o
    // bloco da matéria inteiro e as imagens são o conteúdo (o OCR lê o que há nelas).
    if (blocos.reduce((n, b) => n + (b.texto.match(/\S+/g) || []).length, 0) < 25) {
      const vivo = mapa.get(raiz);
      const r = vivo && vivo !== doc.body && vivo !== doc.documentElement ? retanguloDe(vivo) : null;
      if (r && r.width > 200 && r.height > 100) caixa = { x: r.left + desl.x, y: r.top + desl.y + rolagem.y, w: r.width, h: r.height };
      imagens.length = 0;
    }

    // título: o h1 da página (como aparece), senão os dados da página
    const h1s = [...doc.querySelectorAll('h1')].filter((h) => visivel(h) && limpar(h.textContent).length >= 10);
    const primeiro = blocos.find((b) => b.caixa);
    const h1 = h1s.sort((a, b) => {
      const ya = a.getBoundingClientRect().top;
      const yb = b.getBoundingClientRect().top;
      const alvo = primeiro ? primeiro.caixa.y - rolagem.y : 0;
      const distancia = (y) => (y <= alvo + 5 ? alvo - y : 100000 + y - alvo);
      return distancia(ya) - distancia(yb);
    })[0];
    // o h1 vale se bater com o título da página (senão pode ser a marca do site)
    const dados = [limpar(ld.headline), meta(doc, 'og:title', 'twitter:title'), limpar(doc.title)].filter(Boolean);
    const textoH1 = limpar(h1?.textContent);
    const parecido = (a, b) => {
      const x = semAcento(a);
      const y = semAcento(b);
      if (x.includes(y) || y.includes(x)) return true;
      const pa = new Set(x.split(/\W+/).filter((p) => p.length > 3));
      const pb = y.split(/\W+/).filter((p) => p.length > 3);
      return pb.length > 0 && pb.filter((p) => pa.has(p)).length >= pb.length * 0.6;
    };
    const titulo = (textoH1 && (!dados.length || dados.some((d) => parecido(textoH1, d))) ? textoH1 : '') || dados[0] || textoH1 || limpar(leitura?.title);

    // O que fica acima do título (chapéu, editoria, caminho do site) sai, se for
    // pouca coisa: um h1 fora do lugar não pode levar a matéria junto.
    if (h1) {
      const r = h1.getBoundingClientRect();
      const topoH1 = r.top + desl.y + rolagem.y;
      const acima = blocos.filter((b) => b.caixa && b.caixa.y + b.caixa.h <= topoH1 + 2);
      const contar = (lista) => lista.reduce((n, b) => n + (b.texto.match(/\S+/g) || []).length, 0);
      if (acima.length && contar(acima) <= 30 && contar(acima) < contar(blocos) * 0.2) {
        for (const b of acima) blocos.splice(blocos.indexOf(b), 1);
      }
    }
    while (blocos.length && semAcento(blocos[0].texto) === semAcento(titulo)) blocos.shift();

    // linha fina: o texto logo abaixo do título (h2 ou parágrafo de classe típica)
    let subtitulo = '';
    let caixaSubtitulo = null;
    if (h1) {
      // o h1 pode estar sozinho num bloco (<div class="title"><h1>): a linha fina vem depois do bloco
      let topo = h1;
      while (topo.parentElement && topo.parentElement !== doc.body && limpar(topo.parentElement.textContent) === limpar(h1.textContent)) topo = topo.parentElement;
      let el = topo.nextElementSibling;
      for (let passo = 0; el && passo < 3 && !subtitulo; passo++, el = el.nextElementSibling) {
        const t = limpar(el.innerText ?? el.textContent);
        const classe = typeof el.className === 'string' ? el.className : '';
        const tipico = /sub|linha|fina|lead|resumo|chamada|bigode|desc|excerpt|standfirst|olho|abstract|summary/i.test(classe);
        const autor = /^(por|by)\s+\p{Lu}[\p{L}.'’-]*(\s+(d[aeo]s?|e|\p{Lu}[\p{L}.'’-]*)){0,6}\s*($|[|,·–—-])/u.test(t);
        if (t.length >= 30 && t.length <= 450 && !autor && !ehLixo(el, 600) && (tipico || el.tagName === 'H2' || (el.tagName === 'P' && passo === 0))) {
          subtitulo = t;
          const r = el.getBoundingClientRect();
          caixaSubtitulo = arredondar({ x: r.left + desl.x, y: r.top + desl.y + rolagem.y, w: r.width, h: r.height });
        }
      }
    }

    // assinatura entre o título e o texto ("Por <address>Fulana</address> e <address>Beltrano</address>")
    const assinatura = () => {
      if (!h1) return '';
      // antes do primeiro parágrafo de verdade (a linha fina pode vir antes da assinatura)
      const inicio = mapa.get(blocos.find((x) => x.no && x.tipo === 'paragrafo' && (x.texto.match(/\S+/g) || []).length >= 15)?.no);
      const lista = [...doc.querySelectorAll('[itemprop="author"], [rel="author"], address')]
        .filter((el) => visivel(el) && h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && (!inicio || el.compareDocumentPosition(inicio) & Node.DOCUMENT_POSITION_FOLLOWING))
        .map((el) => limparAutor(el.getAttribute('content') || el.innerText || el.textContent))
        .filter((t) => t && t.length <= 60 && !/^https?:|@/.test(t));
      return juntarNomes(lista);
    };
    const autor = juntarNomes(nomes(ld.author)) || limparAutor(meta(doc, 'author', 'article:author', 'dc.creator', 'parsely-author', 'sailthru.author')) || limparAutor(leitura?.byline) || assinatura();
    const canonico = doc.querySelector('link[rel="canonical"]')?.href || '';
    const endereco = (() => {
      try {
        const c = new URL(canonico);
        return c.hostname.replace(/^www\./, '') === location.hostname.replace(/^www\./, '') ? c.href : location.href;
      } catch {
        return location.href;
      }
    })().replace(/#.*$/, '');

    return {
      metodo,
      titulo,
      subtitulo,
      caixaSubtitulo,
      caixaTitulo: h1 ? (() => {
        const r = h1.getBoundingClientRect();
        return arredondar({ x: r.left + desl.x, y: r.top + desl.y + rolagem.y, w: r.width, h: r.height });
      })() : null,
      autor,
      data: dataPublicada(doc, ld, h1),
      site: meta(doc, 'og:site_name') || location.hostname.replace(/^www\./, ''),
      tituloPagina: limpar(doc.title),
      endereco,
      blocos: blocos.map(({ tipo, texto, caixa: c }) => ({ tipo, texto, caixa: c ? arredondar(c) : null })),
      caixa: caixa ? arredondar(caixa) : null,
      imagens: imagens.map(arredondar),
      janela: { largura: innerWidth, altura: innerHeight, rolagemY: Math.round(rolagem.y), dpr: devicePixelRatio || 1 },
    };
  }

  const arredondar = (c) => ({ x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) });
  const palavras = (r) => r.blocos.reduce((n, b) => n + (b.texto.match(/\S+/g) || []).length, 0);

  // Documentos onde a matéria pode estar: a página e quadros (iframes) grandes do mesmo site.
  function documentos() {
    const docs = [document];
    for (const quadro of document.querySelectorAll('iframe, frame')) {
      try {
        const r = quadro.getBoundingClientRect();
        if (r.width * r.height < innerWidth * innerHeight * 0.3) continue;
        if (quadro.contentDocument?.body) docs.push(quadro.contentDocument);
      } catch {
        // quadro de outro site: não dá para ler
      }
    }
    return docs;
  }

  function lerMelhor(config) {
    let melhor = null;
    for (const doc of config?.elemento ? [config.elemento.ownerDocument] : documentos()) {
      const r = lerDocumento(doc, config);
      if (!melhor || palavras(r) > palavras(melhor)) melhor = r;
    }
    return melhor;
  }

  const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

  // config: { area: true para usar a área escolhida no seletor, faixaX: { x, w } da região marcada }
  async function extrair(config = {}) {
    const elemento = config.area ? globalThis.__clippingPrints?.elementoEscolhido?.() || null : null;
    const opcoes = { elemento, faixaX: config.faixaX || null };
    let r = lerMelhor(opcoes);
    // Partes que só carregam ao rolar: passa rápido pela matéria e lê de novo.
    if (r.caixa && !elemento && r.caixa.y + r.caixa.h > scrollY + innerHeight + 50) {
      const volta = scrollY;
      const fim = Math.min(r.caixa.y + r.caixa.h, (document.scrollingElement || document.documentElement).scrollHeight);
      for (let y = Math.max(scrollY, r.caixa.y - 100), passos = 0; y < fim && passos < 30; y += innerHeight * 0.9, passos++) {
        scrollTo({ top: y, behavior: 'instant' });
        await esperar(120);
      }
      scrollTo({ top: volta, behavior: 'instant' });
      await esperar(80);
      const r2 = lerMelhor(opcoes);
      if (palavras(r2) > palavras(r)) r = r2;
    }
    return { ok: true, ...r, palavras: palavras(r) };
  }

  globalThis.__clippingLeitor = Object.freeze({
    extrair: (config) =>
      extrair(config).catch((e) => ({ ok: false, erro: String(e?.message || e), endereco: location.href, tituloPagina: document.title })),
  });
})();
