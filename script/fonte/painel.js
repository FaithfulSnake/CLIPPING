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
