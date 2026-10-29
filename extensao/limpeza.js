// O que é do site, não da matéria, sai pela estrutura da página (nunca por
// palavra): anúncios e caixas de "Leia também", de compartilhar e afins;
// chamadas no meio do texto ("assine", "siga no WhatsApp"); fotos e vídeos com
// a legenda e o crédito deles; links soltos de navegação ("Mais recente /
// Próxima"). Bloco com link para o documento do caso (decisão em PDF, site do
// tribunal) nunca sai.
// Usado na leitura da página (leitor.js, injetado antes dele) e no HTML colado
// na página de notícias. Script clássico que também pode ser importado como módulo.
(() => {
  if (globalThis.__clippingLimpeza) return;

  // Classes e ids de blocos que não são a matéria (anúncios, "Leia também", redes sociais…).
  const LIXO_CLASSE =
    /(^|[\s_-])(ads?|adv|advert\w*|anuncio\w*|publicidade\w*|propaganda|patrocin\w*|banner\w*|dfp|gpt|adsense|outbrain|taboola|newsletter\w*|assine|paywall|leia-?tambem|veja-?tambem|leia-?mais|saiba-?mais|relacionad\w*|recomendad\w*|mais-?lidas|ultimas-?noticias|compartilh\w*|share\w*|social\w*|redes-?sociais|comentarios?|comments?|tags|breadcrumbs?|menu|rodape|footer|sidebar|barra-?lateral|cookies?|lgpd|modal|popup)([\s_-]|$)/i;
  // Chamadas do site no meio da matéria ("assine", "siga no WhatsApp", "Próxima
  // matéria"…) e controles do tocador de áudio, pela classe ou id.
  const PROMO_CLASSE = /(^|[\s_-])(cta|promo\w*|passador\w*|paginac\w*|pagination|post-?navigation|disclosure\w*|player\w*)([\s_-]|$)/i;
  // Legenda e crédito de foto, pela classe (só saem se estão ao lado de uma foto).
  const LEGENDA_CLASSE = /caption|legenda|(^|[\s_-])(credit\w*|credito\w*|img-info|image-info|foto-info|photo-info)([\s_-]|$)/i;
  // Linha de crédito colada numa foto que não tem classe nenhuma: começa com o
  // crédito ("Foto: Fulano", "Reprodução / YouTube") ou termina nele ("… — Foto: Fulano", "… (Imagem: Arte)").
  const LINHA_DE_CREDITO =
    /^\(?\s*(fotos?|imagens?|ilustra[cç][aã]o|arte|cr[eé]ditos?|reprodu[cç][aã]o|divulga[cç][aã]o)\s*([:/–—-]|$)|[—–|-]\s*(fotos?|imagens?|cr[eé]ditos?)\s*:[^.;:]{1,80}$|\(\s*(fotos?|imagens?|cr[eé]ditos?)\s*:[^()]{1,80}\)\s*$/i;
  const MIDIA = 'img, picture, video, iframe, svg, canvas, embed, object';
  // Link para o documento do caso (decisão em PDF, site do tribunal ou do
  // governo): o bloco com um desses é da matéria ("Clique aqui para ler a decisão").
  // Página de uma editoria ou de um tema do site.
  const EDITORIA = /\/(tags?|categor(ia|ias|y|ies)|areas?-do-direito|editorias?|secao|secoes|topicos?|temas?|assuntos?)\//i;
  const DOCUMENTO = /\.(pdf|docx?|odt|rtf)([?#]|$)|\/wp-content\/uploads\/|\/dl\/|download|\.jus\.br|\.gov\.br|\.leg\.br|\.mp\.br|\.def\.br|planalto/i;

  const INVISIVEIS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
  const limpar = (t) => String(t ?? '').replace(INVISIVEIS, '').replace(/\s+/g, ' ').trim();
  const tamanho = (el) => limpar(el.textContent).length;
  const classeDe = (el) => `${typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || ''} ${el.id || ''}`;

  // Bloco do site no meio da matéria (anúncio, "Leia também"…), pela classe ou id.
  // Um bloco grande não é tirado (é a matéria com uma classe infeliz, como "has-share").
  const ehLixo = (el, limite) => {
    if (!LIXO_CLASSE.test(classeDe(el)) && el.getAttribute?.('role') !== 'complementary') return false;
    return el.textContent.length < limite;
  };

  // raiz: o corpo da cópia da página (ou do HTML colado), que é alterado.
  // opcoes.href(a): endereço do link; opcoes.retangulo(el): tamanho na tela
  // (null quando não se sabe); opcoes.endereco: endereço da página ('' quando
  // não se sabe). Devolve os quadros de foto tirados.
  function limparMateria(raiz, { href = (a) => a.href || a.getAttribute('href') || '', retangulo = () => null, endereco = '' } = {}) {
    const levaADocumento = (el) => [...el.querySelectorAll('a[href]'), ...(el.matches('a[href]') ? [el] : [])].some((a) => DOCUMENTO.test(href(a)));
    // Anúncios e caixas do site saem antes (o Readability às vezes troca o
    // bloco por um <p> sem a classe). Só blocos pequenos, e não o que tem a
    // assinatura ou a data da matéria (só os botões que estão junto com ela).
    const assinatura = (el) => el.querySelector('h1, address, time, [itemprop="author"], [itemprop="datePublished"], [rel="author"]');
    for (const el of [...raiz.querySelectorAll('*')]) {
      if (!el.isConnected) continue;
      const anuncio = /^div-gpt-ad|^google_ads/i.test(el.id) || el.matches('ins.adsbygoogle, [data-ad], [data-ad-slot], [data-google-query-id]');
      const chamada = PROMO_CLASSE.test(classeDe(el)) && tamanho(el) < 400 && !assinatura(el) && !levaADocumento(el);
      if (anuncio || chamada || (ehLixo(el, 600) && !assinatura(el) && el.querySelectorAll('p').length < 3)) el.remove();
    }
    const quadros = tirarFotos(raiz, retangulo, levaADocumento);
    // Rótulo de editoria ou de tema que é só um link para a página dela
    // ("Trabalhista" → …/areas-do-direito/trabalhista/).
    const soLinks = (el, links) => links.length && limpar(links.map((a) => a.textContent).join(' ')).length >= tamanho(el) - 2;
    for (const el of [...raiz.querySelectorAll('div, section, p, span, ul, li')]) {
      if (!el.isConnected || el.textContent.length > 300 || tamanho(el) > 40) continue;
      const links = [...el.querySelectorAll('a[href]')];
      if (soLinks(el, links) && links.every((a) => EDITORIA.test(href(a)))) el.remove();
    }
    // Links soltos para outras matérias do site ("Mais recente", "Próxima: …"),
    // sem nenhum texto fora deles. Lista e parágrafo não entram nessa conta.
    // Sem o endereço da página (HTML colado), o site é o mais citado nos links.
    endereco ||= siteDosLinks([...raiz.querySelectorAll('a[href]')].map(href));
    if (endereco) {
      const aqui = endereco.replace(/[?#].*$/, '');
      const host = (h) => h.replace(/^www\./, '');
      const outraMateria = (link) => {
        try {
          const u = new URL(link, aqui);
          return host(u.hostname) === host(new URL(aqui).hostname) && u.href.replace(/[?#].*$/, '') !== aqui && !DOCUMENTO.test(u.href);
        } catch {
          return false;
        }
      };
      for (const el of [...raiz.querySelectorAll('div, section, footer, header')]) {
        if (!el.isConnected || el.textContent.length > 3000) continue;
        const t = tamanho(el);
        if (!t || t > 300) continue;
        const links = [...el.querySelectorAll('a[href]')];
        if (links.length >= 2 && links.length <= 6 && soLinks(el, links) && links.every((a) => outraMateria(href(a)))) el.remove();
      }
    }
    return quadros;
  }

  // O site que aparece em pelo menos 3 links (o mais citado), ou ''.
  function siteDosLinks(links) {
    const contagem = new Map();
    for (const link of links) {
      try {
        const u = new URL(link);
        if (/^https?:$/.test(u.protocol) && !DOCUMENTO.test(u.href)) contagem.set(u.hostname, (contagem.get(u.hostname) || 0) + 1);
      } catch {
        // link quebrado: não conta
      }
    }
    const [host, n] = [...contagem].sort((x, y) => y[1] - x[1])[0] || [];
    return n >= 3 ? `https://${host}/` : '';
  }

  // Fotos e vídeos com a legenda e o crédito deles: o quadro da foto, a
  // legenda colada nela.
  function tirarFotos(raiz, retangulo, levaADocumento) {
    // foto ou vídeo de verdade, não ícone: pelo tamanho na tela ou no código
    const grande = (m) => {
      const r = retangulo(m);
      if (r) return r.width >= 100 && r.height >= 60;
      const w = parseFloat(m.getAttribute('width'));
      const h = parseFloat(m.getAttribute('height'));
      if (w || h) return (w || 100) >= 100 && (h || 60) >= 60;
      return m.tagName.toLowerCase() !== 'svg';
    };
    const temMidia = (el) => (el.matches(MIDIA) && grande(el)) || [...el.querySelectorAll(MIDIA)].some(grande);
    const soMidia = (el) => tamanho(el) === 0 && temMidia(el);
    // o elemento de antes e o de depois, pulando os vazios (<p></p>)
    const vizinho = (el, lado) => {
      let v = el[lado];
      while (v && tamanho(v) === 0 && !temMidia(v)) v = v[lado];
      return v;
    };
    const coladoNaFoto = (el) => [vizinho(el, 'previousElementSibling'), vizinho(el, 'nextElementSibling')].some((v) => v && soMidia(v));
    // a legenda (ou o bloco pequeno em volta dela) está ao lado da foto ou com ela dentro
    const juntoDaFoto = (el) => {
      if (temMidia(el)) return true;
      for (let no = el, nivel = 0; no && no !== raiz && nivel < 3; no = no.parentElement, nivel++) {
        if (nivel > 0 && tamanho(no) > 600) break;
        if ((nivel > 0 && temMidia(no)) || coladoNaFoto(no)) return true;
      }
      return false;
    };
    const italico = (el) => {
      const partes = [...el.querySelectorAll('em, i, small')].filter((x) => !x.parentElement.closest('em, i, small') || !el.contains(x.parentElement.closest('em, i, small')));
      return limpar(partes.map((x) => x.textContent).join(' ')).length >= tamanho(el) - 1;
    };
    const quadros = [];
    // decide tudo antes de tirar: o parágrafo que vem depois de uma legenda
    // tirada não passa a contar como "colado na foto"
    const tirar = (lista) => {
      for (const el of lista) {
        if (!el.isConnected) continue;
        quadros.push(el);
        el.remove();
      }
    };
    // <figure> com foto ou vídeo: a foto, a legenda e o crédito saem juntos
    // (figure sem foto, como a de uma tabela, fica)
    const figuras = [...raiz.querySelectorAll('figure')].filter(temMidia);
    tirar(figuras.flatMap((fig) => (tamanho(fig) <= 600 ? [fig] : [...fig.querySelectorAll('figcaption')])));
    // legenda e crédito pela classe ("wp-caption-text", "img-legenda", "image-credit"…), ao lado de uma foto
    const pelaClasse = [...raiz.querySelectorAll('[class], [id]')].filter(
      (el) => LEGENDA_CLASSE.test(classeDe(el)) && tamanho(el) <= 400 && !levaADocumento(el) && juntoDaFoto(el),
    );
    // linha sem classe colada na foto: crédito ("Foto: …") antes ou depois dela,
    // ou a linha toda em itálico logo depois dela (ou com a foto dentro). Uma
    // citação em itálico (entre aspas, recuada ou em <blockquote>) é da matéria.
    const citacao = (el, t) => /^["“«'‘]/.test(t) || Boolean(el.closest('blockquote')) || /(padding|margin)-left\s*:\s*[1-9]/i.test(el.getAttribute('style') || '');
    const soltas = [...raiz.querySelectorAll('p, div, center')].filter((el) => {
      if (el.textContent.length > 2000) return false;
      const t = limpar(el.textContent);
      if (!t || t.length > 200 || levaADocumento(el)) return false;
      const antes = vizinho(el, 'previousElementSibling');
      const depoisDaFoto = temMidia(el) || Boolean(antes && soMidia(antes));
      return (LINHA_DE_CREDITO.test(t) && (depoisDaFoto || coladoNaFoto(el))) || (depoisDaFoto && italico(el) && !citacao(el, t));
    });
    tirar([...pelaClasse, ...soltas]);
    return quadros;
  }

  globalThis.__clippingLimpeza = Object.freeze({ ehLixo, limparMateria });
})();
