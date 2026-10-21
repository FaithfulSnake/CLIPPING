// Seletor na própria página, antes da captura (opções "Escolher na página"
// e "Marcar uma região"). Passo 1: destaca a área que rola sob o mouse e o
// clique escolhe. Passo 2: arrastar desenha a região do print. Ao confirmar,
// pede ao service worker para começar. Injetado pela extensão junto com
// pagina.js (mesmo "mundo isolado", então usa a API dela diretamente).
(() => {
  if (globalThis.__clippingSeletor) return;

  const AZUL = '#2563eb';
  const FONTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const prints = () => globalThis.__clippingPrints;
  const formatar = (n) => Math.round(n).toLocaleString('pt-BR');
  let aberto = null;

  // Estilos só por CSSOM (el.style): funciona mesmo em sites com CSP rígida.
  function criar(tag, props = {}, estilos = {}, filhos = []) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    Object.assign(el.style, estilos);
    el.append(...filhos);
    return el;
  }

  function botao(texto, principal, acao) {
    const b = criar(
      'button',
      { type: 'button', textContent: texto },
      {
        font: `600 13px ${FONTE}`,
        padding: '7px 12px',
        borderRadius: '6px',
        cursor: 'pointer',
        border: `1px solid ${principal ? AZUL : '#cbd5e1'}`,
        background: principal ? AZUL : '#ffffff',
        color: principal ? '#ffffff' : '#1f2937',
      },
    );
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      acao();
    });
    return b;
  }

  function avisoRapido(texto) {
    const el = criar('div', { textContent: texto }, {
      all: 'initial',
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: '#1f2937',
      color: '#ffffff',
      font: `14px ${FONTE}`,
      padding: '10px 16px',
      borderRadius: '8px',
      boxShadow: '0 6px 20px rgba(0,0,0,.3)',
    });
    document.documentElement.append(el);
    setTimeout(() => el.remove(), 3000);
  }

  // O que foi escolhido da última vez neste site (área e região).
  async function lerLembranca() {
    try {
      const { lembrancasSeletor } = await chrome.storage.local.get('lembrancasSeletor');
      return lembrancasSeletor?.[location.host] || {};
    } catch {
      return {};
    }
  }

  async function gravarLembranca(dados) {
    try {
      const { lembrancasSeletor = {} } = await chrome.storage.local.get('lembrancasSeletor');
      lembrancasSeletor[location.host] = { ...(lembrancasSeletor[location.host] || {}), ...dados, quando: Date.now() };
      await chrome.storage.local.set({ lembrancasSeletor });
    } catch {
      // sem armazenamento: só não lembra na próxima vez
    }
  }

  async function abrir(pedido) {
    aberto?.fechar();
    const passos = [];
    if (pedido.opcoes.areaRolagem === 'escolher') passos.push('rolagem');
    if (pedido.opcoes.recorte === 'regiao') passos.push('regiao');
    const lembranca = await lerLembranca();

    const host = criar('div', { id: 'clipping-seletor' });
    host.style.all = 'initial';
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483647' });
    const raiz = host.attachShadow({ mode: 'open' });
    const veu = criar('div', {}, { position: 'fixed', inset: '0', cursor: 'crosshair', touchAction: 'none' });
    const caixa = criar('div', {}, {
      position: 'fixed',
      display: 'none',
      boxSizing: 'border-box',
      border: `3px solid ${AZUL}`,
      background: 'rgba(37,99,235,.10)',
      boxShadow: '0 0 0 100vmax rgba(15,23,42,.38)',
      pointerEvents: 'none',
    });
    const etiqueta = criar('div', {}, {
      position: 'fixed',
      display: 'none',
      background: AZUL,
      color: '#ffffff',
      font: `600 13px ${FONTE}`,
      padding: '4px 8px',
      borderRadius: '4px',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    });
    const passoTexto = criar('span', {}, { display: 'block', fontSize: '12px', color: '#64748b', letterSpacing: '.04em', textTransform: 'uppercase' });
    const titulo = criar('strong', {}, { display: 'block', fontSize: '16px', margin: '2px 0' });
    const ajuda = criar('span', {}, { display: 'block', color: '#475569' });
    const botoes = criar('div', {}, { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' });
    const barra = criar(
      'div',
      { role: 'dialog', ariaLabel: 'Escolha antes da captura' },
      {
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'max-content',
        maxWidth: 'min(640px, calc(100vw - 32px))',
        boxSizing: 'border-box',
        background: '#ffffff',
        color: '#1f2937',
        font: `14px/1.45 ${FONTE}`,
        padding: '12px 16px',
        borderRadius: '10px',
        border: '1px solid #cbd5e1',
        boxShadow: '0 10px 30px rgba(0,0,0,.3)',
        cursor: 'default',
      },
      [passoTexto, titulo, ajuda, botoes],
    );
    raiz.append(veu, caixa, etiqueta, barra);
    document.documentElement.append(host);

    let passo = -1;
    let area; // undefined = passo de rolagem não feito; null = automático
    let retangulo = null;
    let atual = null; // área sob o mouse (passo 1)
    let arrasto = null; // ponto inicial (passo 2)
    let quadroPendente = false;

    const mostrarCaixa = (r, texto) => {
      if (!r) {
        caixa.style.display = etiqueta.style.display = 'none';
        return;
      }
      Object.assign(caixa.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      etiqueta.textContent = texto;
      // no canto de baixo, dentro da caixa: não fica atrás da barra de instruções
      const baixo = Math.min(innerHeight, r.y + r.h);
      Object.assign(etiqueta.style, { display: 'block', left: `${Math.max(4, r.x + 6)}px`, top: `${Math.max(4, baixo - 34)}px` });
    };

    const textoDaArea = (d) =>
      !d.rola ? 'Aqui nada rola: a captura terá 1 print' : d.pagina ? `A página inteira · ${formatar(d.conteudo)} px de altura` : `Esta área rola · ${formatar(d.conteudo)} px de conteúdo`;

    const fechar = () => {
      removeEventListener('keydown', teclas, true);
      host.remove();
      aberto = null;
    };

    const cancelar = () => {
      fechar();
      prints()?.escolherArea(null);
      avisoRapido('Captura cancelada.');
    };

    async function concluir() {
      const memoria = {};
      if (area) memoria.rolagem = prints().lembranca(area);
      if (retangulo) memoria.regiao = { ...retangulo, largura: innerWidth, altura: innerHeight };
      prints().escolherArea(area || null);
      fechar();
      await gravarLembranca(memoria);
      try {
        const resposta = await chrome.runtime.sendMessage({
          tipo: 'iniciar',
          pasta: pedido.pasta,
          opcoes: pedido.opcoes,
          pacoteId: pedido.pacoteId,
          selecao: { rolagemEscolhida: Boolean(area), recorte: retangulo },
        });
        if (resposta?.erro) avisoRapido(resposta.erro);
      } catch (e) {
        avisoRapido(`Não foi possível iniciar: ${e.message}`);
      }
    }

    function avancar() {
      passo++;
      if (passo >= passos.length) {
        concluir();
        return;
      }
      if (passos[passo] === 'rolagem') passoRolagem();
      else passoRegiao();
    }

    const numeroDoPasso = () => (passos.length > 1 ? `Passo ${passo + 1} de ${passos.length}` : 'Antes de capturar');

    // ---------------------------------------------------------- passo 1

    function passoRolagem() {
      const anterior = prints().areaLembrada(lembranca.rolagem);
      passoTexto.textContent = numeroDoPasso();
      titulo.textContent = 'Clique na parte da página que deve rolar';
      ajuda.textContent = 'Passe o mouse: a área destacada em azul é a que vai rolar durante a captura. Esc cancela.';
      botoes.replaceChildren(
        ...(anterior
          ? [
              botao('Usar a mesma de antes', true, () => {
                area = anterior;
                avancar();
              }),
            ]
          : []),
        botao('Automático', false, () => {
          area = null;
          avancar();
        }),
        botao('Cancelar', false, cancelar),
      );
      if (anterior) mostrarCaixa(anterior.retangulo, `Escolhida da última vez · ${textoDaArea(anterior)}`);
      atual = null;
    }

    // ---------------------------------------------------------- passo 2

    function passoRegiao() {
      const mesmaTela = (r) => r && Math.abs(r.largura - innerWidth) <= 2 && Math.abs(r.altura - innerHeight) <= 2;
      const anterior = mesmaTela(lembranca.regiao) ? lembranca.regiao : null;
      passoTexto.textContent = numeroDoPasso();
      titulo.textContent = 'Arraste para marcar a área do print';
      ajuda.textContent = 'Cada print vai ter só o que estiver dentro do retângulo. Enter confirma, Esc cancela.';
      const confirmar = botao('Confirmar', true, () => retangulo && avancar());
      const atualizarConfirmar = () => {
        confirmar.disabled = !retangulo;
        confirmar.style.opacity = retangulo ? '1' : '.5';
      };
      botoes.replaceChildren(
        confirmar,
        ...(anterior
          ? [
              botao('Usar a mesma de antes', false, () => {
                retangulo = { x: anterior.x, y: anterior.y, w: anterior.w, h: anterior.h };
                avancar();
              }),
            ]
          : []),
        botao('Tela inteira', false, () => {
          retangulo = null;
          avancar();
        }),
        botao('Cancelar', false, cancelar),
      );
      // Começa com a área escolhida no passo 1 (se não for a página inteira).
      retangulo = area && !area.pagina ? { ...area.retangulo } : null;
      mostrarCaixa(retangulo, retangulo ? `Área escolhida · ${formatar(retangulo.w)} × ${formatar(retangulo.h)} px · arraste para mudar` : '');
      atualizarConfirmar();
      passoRegiao.atualizarConfirmar = atualizarConfirmar;
    }

    // ---------------------------------------------------------- mouse e teclado

    veu.addEventListener('pointermove', (ev) => {
      if (passos[passo] === 'rolagem') {
        if (quadroPendente) return;
        quadroPendente = true;
        const { clientX: x, clientY: y } = ev;
        requestAnimationFrame(() => {
          quadroPendente = false;
          atual = prints().areaNoPonto(x, y, host);
          mostrarCaixa(atual.retangulo, textoDaArea(atual));
        });
      } else if (passos[passo] === 'regiao' && arrasto) {
        const x = Math.max(0, Math.min(innerWidth, ev.clientX));
        const y = Math.max(0, Math.min(innerHeight, ev.clientY));
        retangulo = { x: Math.min(arrasto.x, x), y: Math.min(arrasto.y, y), w: Math.abs(x - arrasto.x), h: Math.abs(y - arrasto.y) };
        mostrarCaixa(retangulo, `${formatar(retangulo.w)} × ${formatar(retangulo.h)} px`);
        // a barra sai da frente quando o retângulo chega perto dela
        barra.style.top = retangulo.y < 140 ? 'auto' : '12px';
        barra.style.bottom = retangulo.y < 140 ? '12px' : 'auto';
      }
    });

    veu.addEventListener('pointerdown', (ev) => {
      if (passos[passo] !== 'regiao' || ev.button !== 0) return;
      veu.setPointerCapture(ev.pointerId);
      arrasto = { x: ev.clientX, y: ev.clientY };
      retangulo = null;
      passoRegiao.atualizarConfirmar?.();
    });

    veu.addEventListener('pointerup', () => {
      if (passos[passo] !== 'regiao' || !arrasto) return;
      arrasto = null;
      if (retangulo && (retangulo.w < 20 || retangulo.h < 20)) {
        retangulo = null;
        mostrarCaixa(null);
      } else if (retangulo) {
        mostrarCaixa(retangulo, `${formatar(retangulo.w)} × ${formatar(retangulo.h)} px · Enter confirma`);
      }
      passoRegiao.atualizarConfirmar?.();
    });

    veu.addEventListener('click', (ev) => {
      if (passos[passo] !== 'rolagem') return;
      area = atual || prints().areaNoPonto(ev.clientX, ev.clientY, host);
      avancar();
    });

    function teclas(ev) {
      if (ev.key === 'Escape') cancelar();
      else if (ev.key === 'Enter') {
        if (passos[passo] === 'regiao' && retangulo) avancar();
        else if (passos[passo] === 'rolagem') {
          const anterior = prints().areaLembrada(lembranca.rolagem);
          if (!anterior) return;
          area = anterior;
          avancar();
        } else return;
      } else return;
      ev.preventDefault();
      ev.stopPropagation();
    }
    addEventListener('keydown', teclas, true);

    aberto = { fechar };
    if (passos.length) avancar();
    else concluir();
  }

  globalThis.__clippingSeletor = Object.freeze({
    // Não espera a escolha terminar: quem começa a captura é o próprio seletor.
    abrir(pedido) {
      abrir(pedido);
    },
  });
})();
