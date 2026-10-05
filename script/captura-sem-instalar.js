// Clipping – Prints com rolagem (versão sem instalar).
// ARQUIVO GERADO por ferramentas/gerar-script.mjs a partir de extensao/ e script/fonte/: não edite à mão.
// Uso: abra a página, aperte F12, vá em "Console", cole todo este texto e aperte Enter.
(() => {
'use strict';
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

// Funções compartilhadas pela extensão e pelo script sem instalação.
// Sem APIs do Chrome aqui: este arquivo também é embutido no bookmarklet.

const OPCOES_PADRAO = Object.freeze({
  sobreposicao: 10, // % da área visível repetida do print anterior
  espera: 700, // ms após cada rolagem, para a página terminar de carregar
  limite: 400, // máximo de prints (evita rolar para sempre em páginas infinitas)
  formato: 'png',
  esconderFixos: true,
  incluirInfo: true,
  baixarAuto: true,
});

function normalizarOpcoes(o = {}) {
  const p = OPCOES_PADRAO;
  const numero = (v, min, max, padrao) => {
    if (v === '' || v == null) return padrao;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  const booleano = (v, padrao) => (typeof v === 'boolean' ? v : padrao);
  return {
    sobreposicao: numero(o.sobreposicao, 0, 50, p.sobreposicao),
    espera: numero(o.espera, 200, 10000, p.espera),
    limite: numero(o.limite, 1, 2000, p.limite),
    formato: o.formato === 'jpeg' ? 'jpeg' : 'png',
    esconderFixos: booleano(o.esconderFixos, p.esconderFixos),
    incluirInfo: booleano(o.incluirInfo, p.incluirInfo),
    baixarAuto: booleano(o.baixarAuto, p.baixarAuto),
  };
}

const NOMES_RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

// Transforma o título da página num nome de pasta/arquivo válido no Windows.
function limparNome(nome, padrao = 'prints') {
  let s = String(nome ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = Array.from(s).slice(0, 100).join('').replace(/[. ]+$/, '').trim();
  if (!s) return padrao;
  return NOMES_RESERVADOS.test(s) ? `${s}_` : s;
}

// 001.png, 002.png… (mais dígitos se passar de 999 prints).
function nomePrint(numero, total, formato) {
  const casas = Math.max(3, String(total).length);
  return `${String(numero).padStart(casas, '0')}.${formato === 'jpeg' ? 'jpg' : 'png'}`;
}

function avisoMotivo(sessao) {
  switch (sessao.motivo) {
    case 'parado':
      return 'A captura foi interrompida antes do fim da página.';
    case 'limite':
      return `O limite de ${sessao.total} prints foi atingido antes do fim da página. Aumente o limite nas opções e capture de novo.`;
    case 'erro':
      return `A captura parou antes do fim da página: ${sessao.mensagemErro || 'erro desconhecido'}.`;
    default:
      return '';
  }
}

function textoInfo(sessao) {
  const linhas = [
    `Página: ${sessao.titulo || '(sem título)'}`,
    `Endereço: ${sessao.url || ''}`,
    `Capturado em: ${new Date(sessao.data).toLocaleString('pt-BR')}`,
    `Quantidade de prints: ${sessao.total}`,
  ];
  if (sessao.largura) linhas.push(`Tamanho de cada print: ${sessao.largura} x ${sessao.altura} pixels`);
  linhas.push(
    '',
    `Cada print repete o final do anterior (cerca de ${sessao.sobreposicao}% da tela, mais a altura`,
    'de cabeçalhos/rodapés fixos), para que nenhum trecho da página fique de fora.',
  );
  const aviso = avisoMotivo(sessao);
  if (aviso) linhas.push('', `ATENÇÃO: ${aviso}`);
  return `﻿${linhas.join('\r\n')}\r\n`;
}

const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

// O laço de captura: rola do topo ao fim e tira um print por trecho.
//   pagina(metodo, arg)  chama a API de pagina.js (direto ou via extensão)
//   tirarPrint()         devolve um Blob com o print da tela (ou null = parar)
//   antesDoPrint()       espera a aba estar visível, etc.
//   aoCapturar(blob, n, porcento, medidas)
//   deveParar()          true quando o usuário pede para parar
// Devolve { total, motivo: 'fim'|'parado'|'limite'|'erro', erro }.
async function capturarComRolagem({ opcoes, pagina, tirarPrint, antesDoPrint, aoCapturar, deveParar }) {
  let total = 0;
  let motivo = 'fim';
  let erro = null;
  let alvo = 0;
  let anterior = -1;
  try {
    await pagina('iniciar');
    for (;;) {
      if (deveParar()) {
        motivo = 'parado';
        break;
      }
      if (total >= opcoes.limite) {
        motivo = 'limite';
        break;
      }
      await pagina('rolarPara', alvo);
      await esperar(total === 0 ? opcoes.espera + 300 : opcoes.espera);
      if (antesDoPrint) await antesDoPrint();
      if (deveParar()) {
        motivo = 'parado';
        break;
      }
      const m = await pagina('prepararPrint', opcoes.esconderFixos && total > 0);
      if (total > 0 && m.topo <= anterior) break; // a página não rola mais
      const blob = await tirarPrint();
      if (!blob) {
        motivo = 'parado';
        break;
      }
      total++;
      const porcento = m.max > 0 ? Math.min(100, Math.round((m.topo / m.max) * 100)) : 100;
      await aoCapturar(blob, total, porcento, m);
      anterior = m.topo;

      if (m.topo >= m.max - 1) {
        // Chegou ao fim; dá tempo para conteúdo carregado sob demanda aumentar a página.
        await esperar(opcoes.espera);
        if ((await pagina('maximo')) <= m.topo + 1) break;
      }
      // Próxima posição: avança a área visível menos o que fica coberto por
      // cabeçalho/rodapé fixo e menos a sobreposição escolhida.
      const repetido = Math.round((m.altura * opcoes.sobreposicao) / 100);
      const passo = m.altura - m.ocupadoTopo - m.ocupadoBase - repetido;
      alvo = m.topo + Math.max(Math.round(m.altura * 0.2), passo);
    }
  } catch (e) {
    motivo = 'erro';
    erro = e;
  } finally {
    try {
      await pagina('finalizar');
    } catch {
      // a página pode ter sido fechada ou recarregada
    }
  }
  return { total, motivo, erro };
}

// Gera um arquivo ZIP sem compressão ("stored"). PNG e JPEG já são
// comprimidos, então comprimir de novo só gastaria tempo. Os nomes vão em
// UTF-8, então acentos no nome da pasta aparecem certos no Windows.

const TABELA_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataHoraDos(d) {
  const ano = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// entradas: [{ nome: 'pasta/' }, { nome: 'pasta/001.png', dados: Uint8Array }, ...]
// Nomes terminados em "/" são pastas. Devolve um Blob.
function criarZip(entradas, quando = new Date()) {
  if (entradas.length > 0xffff) throw new Error('Arquivos demais para um único ZIP.');
  const { hora, data } = dataHoraDos(quando);
  const utf8 = new TextEncoder();
  const locais = [];
  const centrais = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    const nome = utf8.encode(entrada.nome);
    const dados = entrada.dados || new Uint8Array(0);
    const ehPasta = entrada.nome.endsWith('/');
    const crc = crc32(dados);
    if (deslocamento + 30 + nome.length + dados.length > 0xffffffff) {
      throw new Error('O ZIP passaria de 4 GB. Diminua o limite de prints ou use JPEG.');
    }

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão necessária
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    locais.push(local, nome, dados);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // criado por: MS-DOS, versão 2.0
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, data, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, dados.length, true);
    central.setUint32(24, dados.length, true);
    central.setUint16(28, nome.length, true);
    central.setUint32(38, ehPasta ? 0x10 : 0, true); // atributo de pasta do DOS
    central.setUint32(42, deslocamento, true);
    centrais.push(central, nome);

    deslocamento += 30 + nome.length + dados.length;
  }

  const tamanhoCentral = centrais.reduce((soma, parte) => soma + parte.byteLength, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, entradas.length, true);
  fim.setUint16(10, entradas.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  return new Blob([...locais, ...centrais, fim], { type: 'application/zip' });
}

// Painel da versão sem instalar. Roda na própria página (colado no Console
// ou aberto pelo favorito) e tira os prints pelo compartilhamento de aba do
// navegador (getDisplayMedia). ferramentas/gerar-script.mjs embute antes
// deste trecho: extensao/pagina.js, extensao/comum.js e extensao/zip.js.

function abrirPainel() {
  const ID = 'clipping-prints-painel';
  const existente = document.getElementById(ID);
  if (existente) {
    if (!existente.dataset.capturando) existente.remove(); // abrir de novo fecha o painel
    return;
  }
  const api = globalThis.__clippingPrints;
  const padrao = normalizarOpcoes();
  const espera = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

  const criar = (tag, estilo = {}, props = {}, filhos = []) => {
    const el = document.createElement(tag);
    Object.assign(el.style, estilo);
    Object.assign(el, props);
    el.append(...filhos);
    return el;
  };
  const texto = { fontSize: '13px', lineHeight: '1.45', color: '#1f2937' };
  const campo = {
    font: 'inherit',
    color: '#1f2937',
    background: '#f9fafb',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '6px 8px',
    boxSizing: 'border-box',
  };
  const botao = {
    font: 'inherit',
    fontWeight: '600',
    width: '100%',
    padding: '8px 10px',
    marginTop: '10px',
    borderRadius: '6px',
    border: '1px solid #2563eb',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
  };

  // Estilos só por CSSOM (el.style): funciona mesmo em sites com CSP rígida.
  const host = criar('div', {}, { id: ID });
  host.style.all = 'initial';
  Object.assign(host.style, { position: 'fixed', top: '16px', right: '16px', zIndex: '2147483647' });
  const raiz = host.attachShadow({ mode: 'open' });

  const inPasta = criar('input', { ...campo, width: '100%' }, { type: 'text', value: limparNome(document.title), maxLength: 100 });
  const inSobre = criar('input', { ...campo, width: '64px', textAlign: 'right' }, { type: 'number', min: 0, max: 50, value: padrao.sobreposicao });
  const inEspera = criar('input', { ...campo, width: '72px', textAlign: 'right' }, { type: 'number', min: 200, max: 10000, step: 100, value: padrao.espera });
  const chkFixos = criar('input', { margin: '2px 0 0' }, { type: 'checkbox', checked: padrao.esconderFixos });
  const chkInfo = criar('input', { margin: '2px 0 0' }, { type: 'checkbox', checked: padrao.incluirInfo });
  const btIniciar = criar('button', botao, { type: 'button', textContent: 'Iniciar captura' });
  const btBaixar = criar('button', { ...botao, background: '#fff', color: '#2563eb', display: 'none' }, { type: 'button', textContent: 'Baixar o ZIP de novo' });
  const status = criar('p', { ...texto, margin: '10px 0 0', display: 'none' }, { role: 'status' });
  const fechar = criar(
    'button',
    { font: '20px/1 system-ui, sans-serif', border: '0', background: 'none', color: '#6b7280', cursor: 'pointer', padding: '0 2px' },
    { type: 'button', textContent: '×', title: 'Fechar' },
  );
  const linha = (rotulo, entrada, sufixo) =>
    criar('label', { ...texto, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', margin: '6px 0' }, {}, [
      rotulo,
      criar('span', {}, {}, [entrada, sufixo || '']),
    ]);
  const caixa = (entrada, rotulo) =>
    criar('label', { ...texto, display: 'flex', gap: '6px', alignItems: 'flex-start', margin: '6px 0' }, {}, [entrada, rotulo]);

  const cartao = criar(
    'div',
    {
      ...texto,
      fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      width: '300px',
      boxSizing: 'border-box',
      padding: '14px 16px 16px',
      background: '#fff',
      border: '1px solid #d1d5db',
      borderRadius: '10px',
      boxShadow: '0 10px 30px rgba(0,0,0,.25)',
    },
    {},
    [
      criar('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }, {}, [
        criar('strong', { fontSize: '15px' }, { textContent: 'Prints com rolagem' }),
        fechar,
      ]),
      criar('label', { display: 'grid', gap: '4px', fontWeight: '500' }, {}, ['Nome da pasta e do ZIP', inPasta]),
      linha('Sobreposição entre prints', inSobre, ' %'),
      linha('Espera após cada rolagem', inEspera, ' ms'),
      caixa(chkFixos, 'Esconder cabeçalhos e rodapés fixos a partir do 2º print'),
      caixa(chkInfo, 'Incluir info.txt com o endereço da página'),
      btIniciar,
      btBaixar,
      status,
      criar('p', { fontSize: '12px', lineHeight: '1.4', color: '#6b7280', margin: '10px 0 0' }, {
        textContent:
          'O navegador vai perguntar se pode compartilhar esta aba: clique em “Permitir”/“Compartilhar”. ' +
          'Não troque de aba durante a captura. Para parar antes do fim, aperte Esc ou “Parar de compartilhar”.',
      }),
    ],
  );
  raiz.append(cartao);
  document.documentElement.append(host);

  const mostrarStatus = (msg, erro = false) => {
    status.textContent = msg;
    status.style.display = msg ? 'block' : 'none';
    status.style.color = erro ? '#b91c1c' : '#1f2937';
  };

  fechar.addEventListener('click', () => host.remove());

  let ultimoZip = null;
  const baixar = () => {
    const url = URL.createObjectURL(ultimoZip.blob);
    const a = document.createElement('a'); // fora do documento: o site não intercepta o clique
    a.href = url;
    a.download = ultimoZip.nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  btBaixar.addEventListener('click', baixar);

  async function compartilharAba() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('este navegador não permite captura de tela por script. Use o Chrome ou o Edge atualizado.');
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      // Sem "max" o Chrome reduz o vídeo ao tamanho da tela; assim sai na resolução real da aba.
      video: { displaySurface: 'browser', frameRate: { ideal: 15 }, width: { max: 8192 }, height: { max: 8192 } },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'exclude',
    });
    const [trilha] = stream.getVideoTracks();
    const encerrar = () => stream.getTracks().forEach((t) => t.stop());
    const superficie = trilha.getSettings().displaySurface;
    if (superficie && superficie !== 'browser') {
      encerrar();
      throw new Error('escolha compartilhar ESTA ABA (não a tela inteira nem uma janela).');
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    return { trilha, video, encerrar };
  }

  function printDoVideo(video) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return new Promise((pronto, falha) =>
      canvas.toBlob((blob) => (blob ? pronto(blob) : falha(new Error('falha ao gerar a imagem'))), 'image/png'),
    );
  }

  btIniciar.addEventListener('click', async () => {
    const opcoes = normalizarOpcoes({
      sobreposicao: inSobre.value,
      espera: inEspera.value,
      esconderFixos: chkFixos.checked,
      incluirInfo: chkInfo.checked,
      formato: 'png',
    });
    const pasta = limparNome(inPasta.value || document.title);
    inPasta.value = pasta;
    host.dataset.capturando = '1';
    btIniciar.disabled = true;
    btBaixar.style.display = 'none';
    mostrarStatus('Aguardando você permitir o compartilhamento da aba…');

    let captura;
    try {
      captura = await compartilharAba();
    } catch (e) {
      delete host.dataset.capturando;
      btIniciar.disabled = false;
      mostrarStatus(
        e.name === 'NotAllowedError'
          ? 'O compartilhamento não foi permitido. Clique em “Iniciar captura” de novo e escolha “Permitir”.'
          : `Não foi possível compartilhar a aba: ${e.message}`,
        true,
      );
      return;
    }

    host.style.display = 'none'; // o painel não pode aparecer nos prints
    const tituloOriginal = document.title;
    const prints = [];
    let parar = false;
    const aoTeclar = (ev) => {
      if (ev.key === 'Escape') parar = true;
    };
    addEventListener('keydown', aoTeclar, true);
    captura.trilha.addEventListener('ended', () => {
      parar = true;
    });

    const resultado = await capturarComRolagem({
      opcoes,
      pagina: async (metodo, arg) => api[metodo](arg),
      antesDoPrint: async () => {
        if (!document.hidden) return;
        while (document.hidden && !parar) await espera(500);
        await espera(opcoes.espera);
      },
      tirarPrint: async () => (captura.trilha.readyState === 'ended' ? null : printDoVideo(captura.video)),
      aoCapturar: (blob, n, porcento) => {
        prints.push(blob);
        document.title = `(${n} prints · ${porcento}%) ${tituloOriginal}`;
      },
      deveParar: () => parar,
    });

    const largura = captura.video.videoWidth;
    const altura = captura.video.videoHeight;
    removeEventListener('keydown', aoTeclar, true);
    captura.encerrar();
    document.title = tituloOriginal;
    host.style.display = '';
    delete host.dataset.capturando;
    btIniciar.disabled = false;

    if (!prints.length) {
      mostrarStatus(`Nenhum print foi capturado${resultado.erro ? `: ${resultado.erro.message}` : '.'}`, true);
      return;
    }

    mostrarStatus('Montando o ZIP…');
    const sessao = {
      pasta,
      titulo: tituloOriginal,
      url: location.href,
      data: Date.now(),
      total: prints.length,
      formato: 'png',
      largura,
      altura,
      sobreposicao: opcoes.sobreposicao,
      motivo: resultado.motivo,
      mensagemErro: resultado.erro?.message,
    };
    const entradas = [{ nome: `${pasta}/` }];
    for (const [i, blob] of prints.entries()) {
      entradas.push({ nome: `${pasta}/${nomePrint(i + 1, prints.length, 'png')}`, dados: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (opcoes.incluirInfo) entradas.push({ nome: `${pasta}/info.txt`, dados: new TextEncoder().encode(textoInfo(sessao)) });
    try {
      ultimoZip = { blob: criarZip(entradas, new Date(sessao.data)), nome: `${pasta}.zip` };
    } catch (e) {
      mostrarStatus(`Não foi possível montar o ZIP: ${e.message}`, true);
      return;
    }
    baixar();
    const aviso = avisoMotivo(sessao);
    mostrarStatus(`Pronto! ${prints.length} prints baixados em “${ultimoZip.nome}”.${aviso ? ` Atenção: ${aviso}` : ''}`, Boolean(aviso));
    btBaixar.style.display = 'block';
  });
}

abrirPainel();
})();
