// Roda dentro da página que vai ser capturada: é injetado pela extensão e
// também embutido no script sem instalação. Expõe globalThis.__clippingPrints,
// que rola a página e mede o quanto da área visível está coberto por
// cabeçalhos/rodapés fixos (para nenhum trecho de texto ficar escondido).
(() => {
  if (globalThis.__clippingPrints) return;

  // Uma área com rolagem própria (painel interno) só é usada se ocupar pelo
  // menos esta fração da tela.
  const AREA_MINIMA = 0.15;
  // Cabeçalhos/rodapés fixos: só contam se estiverem neste trecho do topo ou
  // da base da área visível e não forem mais altos que metade dela.
  const FAIXA_BORDA = 0.25;
  // Nunca considerar mais que isto da área visível como coberto.
  const COBERTURA_MAXIMA = 0.6;

  let estado = null;

  // Percorre todos os elementos, inclusive dentro de shadow DOM aberto.
  function* elementos(raiz) {
    const pilha = [raiz];
    while (pilha.length) {
      for (const el of pilha.pop().querySelectorAll('*')) {
        yield el;
        if (el.shadowRoot) pilha.push(el.shadowRoot);
      }
    }
  }

  function ehAncestral(a, b) {
    for (let n = b; n; n = n.parentNode || n.host) if (n === a) return true;
    return false;
  }

  function areaVisivel(r, win) {
    const w = Math.min(r.right, win.innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, win.innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function rolarJanelaPara(win, y) {
    win.scrollTo({ top: y, left: win.scrollX, behavior: 'instant' });
  }

  function rolagemJanela(win) {
    const doc = win.document;
    const raiz = () => doc.scrollingElement || doc.documentElement;
    return {
      tipo: win === window ? 'janela' : 'quadro',
      win,
      doc,
      el: null,
      topo: () => win.scrollY,
      rolar: (y) => rolarJanelaPara(win, y),
      maximo: () => Math.max(0, raiz().scrollHeight - raiz().clientHeight),
      regiao: () => ({ top: 0, left: 0, bottom: raiz().clientHeight, right: raiz().clientWidth }),
      alvosEstilo: [doc.documentElement, doc.body].filter(Boolean),
    };
  }

  function rolagemElemento(el) {
    const win = el.ownerDocument.defaultView;
    return {
      tipo: 'elemento',
      win,
      doc: el.ownerDocument,
      el,
      topo: () => el.scrollTop,
      rolar: (y) => el.scrollTo({ top: y, left: el.scrollLeft, behavior: 'instant' }),
      maximo: () => Math.max(0, el.scrollHeight - el.clientHeight),
      regiao: () => {
        const r = el.getBoundingClientRect();
        const top = r.top + el.clientTop;
        const left = r.left + el.clientLeft;
        return {
          top: Math.max(0, top),
          left: Math.max(0, left),
          bottom: Math.min(win.innerHeight, top + el.clientHeight),
          right: Math.min(win.innerWidth, left + el.clientWidth),
        };
      },
      alvosEstilo: [el],
    };
  }

  // Quanto a janela consegue rolar (0 se overflow:hidden no html/body impede).
  function alcanceJanela(win) {
    const raiz = win.document.scrollingElement || win.document.documentElement;
    if (!raiz) return 0;
    const alcance = raiz.scrollHeight - raiz.clientHeight;
    if (alcance < 1) return 0;
    const y = win.scrollY;
    if (y > 0) return alcance;
    rolarJanelaPara(win, 1);
    const rolou = win.scrollY > 0;
    rolarJanelaPara(win, y);
    return rolou ? alcance : 0;
  }

  // Decide o que rolar: a página em si ou, em sites que rolam um painel
  // interno (ou um quadro/iframe do mesmo site), o maior desses painéis.
  function acharRolagem() {
    if (alcanceJanela(window) > innerHeight * 0.25) return rolagemJanela(window);

    let melhor = null;
    let melhorArea = 0;
    const considerar = (r, area) => {
      if (area > melhorArea) {
        melhor = r;
        melhorArea = area;
      }
    };
    (function varrer(doc, nivel) {
      const win = doc.defaultView;
      for (const el of elementos(doc)) {
        if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
          let interno = null;
          try {
            interno = el.contentDocument;
          } catch {
            // quadro de outro domínio: inacessível
          }
          if (!interno?.documentElement || nivel >= 3) continue;
          const area = areaVisivel(el.getBoundingClientRect(), win);
          if (!area) continue;
          if (alcanceJanela(interno.defaultView) > 20) considerar(rolagemJanela(interno.defaultView), area);
          varrer(interno, nivel + 1);
        } else if (el.scrollHeight - el.clientHeight > 20) {
          const oy = win.getComputedStyle(el).overflowY;
          if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
            considerar(rolagemElemento(el), areaVisivel(el.getBoundingClientRect(), win));
          }
        }
      }
    })(document, 0);

    if (melhor && melhorArea >= innerWidth * innerHeight * AREA_MINIMA) return melhor;
    return rolagemJanela(window);
  }

  // Elementos fixos/grudados (position fixed/sticky) em faixa no topo ou na
  // base da área visível. "presa" = está realmente parada na borda (fixed,
  // ou sticky já grudado), ou seja, não é conteúdo no fluxo normal do texto.
  function faixas(sc) {
    const reg = sc.regiao();
    const h = reg.bottom - reg.top;
    const lista = [];
    if (h <= 0) return { reg, h, lista };
    for (const el of elementos(sc.doc)) {
      const cs = sc.win.getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0) continue;
      if (sc.el && ehAncestral(el, sc.el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= reg.left || r.left >= reg.right) continue;
      const t = Math.max(r.top, reg.top);
      const b = Math.min(r.bottom, reg.bottom);
      if (b - t < 1 || b - t > h / 2) continue;
      let lado;
      if (t - reg.top <= h * FAIXA_BORDA && t - reg.top <= reg.bottom - b) lado = 'topo';
      else if (reg.bottom - b <= h * FAIXA_BORDA) lado = 'base';
      else continue;
      let presa = cs.position === 'fixed';
      if (!presa) {
        const deslocamento = parseFloat(lado === 'topo' ? cs.top : cs.bottom);
        const distancia = lado === 'topo' ? r.top - (reg.top + deslocamento) : reg.bottom - deslocamento - r.bottom;
        presa = Number.isFinite(deslocamento) && Math.abs(distancia) < 2;
      }
      lista.push({ el, lado, t, b, presa });
    }
    return { reg, h, lista };
  }

  // Aplica um estilo !important guardando o valor original para restaurar.
  function definirEstilo(el, prop, valor) {
    let salvos = estado.estilos.get(el);
    if (!salvos) estado.estilos.set(el, (salvos = new Map()));
    if (!salvos.has(prop)) salvos.set(prop, [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, valor, 'important');
  }

  function restaurarEstilos() {
    const restaurar = (el, prop, [valor, prioridade]) => {
      if (valor) el.style.setProperty(prop, valor, prioridade);
      else el.style.removeProperty(prop);
    };
    // Primeiro tudo menos "transition", para os elementos reaparecerem de uma
    // vez em vez de com animação; depois a transição original.
    for (const [el, salvos] of estado.estilos) {
      for (const [prop, salvo] of salvos) if (prop !== 'transition') restaurar(el, prop, salvo);
      if (salvos.has('transition')) el.ownerDocument.defaultView.getComputedStyle(el).opacity; // aplica antes de religar a transição
    }
    for (const [el, salvos] of estado.estilos) if (salvos.has('transition')) restaurar(el, 'transition', salvos.get('transition'));
  }

  // Espera o navegador pintar a tela (com limite, caso a aba esteja oculta).
  function aguardarPintura() {
    return new Promise((pronto) => {
      const limite = setTimeout(pronto, 300);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          clearTimeout(limite);
          pronto();
        }),
      );
    });
  }

  function exigirEstado() {
    if (!estado) throw new Error('Captura não iniciada nesta página.');
    return estado;
  }

  const api = {
    iniciar() {
      if (estado) api.finalizar();
      const sc = acharRolagem();
      estado = { sc, topoOriginal: sc.topo(), estilos: new Map() };
      for (const el of sc.alvosEstilo) {
        definirEstilo(el, 'scroll-behavior', 'auto');
        definirEstilo(el, 'scroll-snap-type', 'none');
      }
      const reg = sc.regiao();
      return { tipo: sc.tipo, max: sc.maximo(), altura: Math.round(reg.bottom - reg.top) };
    },

    rolarPara(y) {
      const { sc } = exigirEstado();
      sc.rolar(y);
      return sc.topo();
    },

    maximo() {
      return exigirEstado().sc.maximo();
    },

    // Prepara a tela para um print e devolve as medidas usadas para calcular
    // a próxima rolagem. Com esconder=true, oculta cabeçalhos/rodapés presos
    // na borda (o 1º print sempre sai com eles, então nada se perde).
    async prepararPrint(esconder) {
      const { sc } = exigirEstado();
      if (esconder) {
        for (const f of faixas(sc).lista) {
          if (!f.presa) continue;
          definirEstilo(f.el, 'transition', 'none');
          definirEstilo(f.el, 'opacity', '0');
        }
      }
      const { reg, h, lista } = faixas(sc);
      let topo = 0;
      let base = 0;
      for (const f of lista) {
        if (f.lado === 'topo') topo = Math.max(topo, f.b - reg.top);
        else base = Math.max(base, reg.bottom - f.t);
      }
      if (topo + base > h * COBERTURA_MAXIMA) {
        const k = (h * COBERTURA_MAXIMA) / (topo + base);
        topo *= k;
        base *= k;
      }
      await aguardarPintura();
      return {
        topo: sc.topo(),
        max: sc.maximo(),
        altura: Math.round(h),
        ocupadoTopo: Math.ceil(topo),
        ocupadoBase: Math.ceil(base),
      };
    },

    finalizar() {
      if (!estado) return;
      restaurarEstilos();
      estado.sc.rolar(estado.topoOriginal);
      estado = null;
    },
  };

  globalThis.__clippingPrints = Object.freeze(api);
})();
