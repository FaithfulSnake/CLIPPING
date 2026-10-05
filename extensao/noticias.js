import {
  AREAS,
  assunto,
  contarPalavras,
  dataPredominante,
  fonteDoLink,
  formatarData,
  interpretarMateria,
  linkSozinho,
  linkValido,
  montarEmail,
  montarTexto,
  nomeArquivo,
  normalizar,
  separarMaterias,
} from './noticias-texto.js';
import { decodificarTexto, lerZip } from './unzip.js';
import { criarZip } from './zip.js';

const $ = (id) => document.getElementById(id);
const FORA = 'excluir';

// Guarda no armazenamento da extensão (ou do navegador, fora dela).
const armazenamento = {
  async ler(chave) {
    try {
      if (globalThis.chrome?.storage?.local) return (await chrome.storage.local.get(chave))[chave];
      return JSON.parse(localStorage.getItem(chave) ?? 'null') ?? undefined;
    } catch {
      return undefined;
    }
  },
  async gravar(chave, valor) {
    try {
      if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({ [chave]: valor });
      else localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // sem armazenamento: a página continua funcionando, só não lembra depois
    }
  },
};

const estado = { materias: [], datas: {} };
let proximoId = 1;

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let gravacao = null;
function salvar() {
  clearTimeout(gravacao);
  gravacao = setTimeout(() => armazenamento.gravar('noticias', estado), 300);
}

function avisar(texto) {
  const el = $('aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisar.tempo);
  avisar.tempo = setTimeout(() => (el.hidden = true), Math.max(4000, texto.length * 60));
}

// Qualquer falha aparece na tela, em vez de a página parar sem explicação.
addEventListener('error', (ev) => avisar(`Erro: ${ev.message}`));
addEventListener('unhandledrejection', (ev) => avisar(`Erro: ${ev.reason?.message || ev.reason}`));

// ---------------------------------------------------------------- dados

const daArea = (area) => estado.materias.filter((m) => m.area === area);
const dataDaArea = (area) => estado.datas[area] || dataPredominante(daArea(area)) || hoje();
const chaveDuplicada = (m) => (linkValido(m.link) ? m.link.replace(/[#?].*$/, '').replace(/\/+$/, '') : normalizar(m.titulo));

function adicionarTextos(textos) {
  const existentes = new Set(estado.materias.map(chaveDuplicada));
  const novas = [];
  let repetidas = 0;
  for (const { origem, texto } of textos) {
    for (const parte of separarMaterias(texto)) {
      const m = interpretarMateria(parte, origem);
      const chave = chaveDuplicada(m);
      if (chave && existentes.has(chave)) {
        repetidas++;
        continue;
      }
      existentes.add(chave);
      novas.push({ id: proximoId++, ...m });
    }
  }
  estado.materias.push(...novas);
  salvar();
  desenharLista();
  atualizarEmails();
  return { novas, repetidas };
}

function relatar({ novas, repetidas }, ignorados = []) {
  const partes = [];
  if (novas.length) {
    const porArea = AREAS.map((a) => [a, novas.filter((m) => m.area === a).length])
      .filter(([, n]) => n)
      .map(([a, n]) => `${n} ${a}`);
    partes.push(`${novas.length} ${novas.length === 1 ? 'matéria adicionada' : 'matérias adicionadas'} (${porArea.join(', ')}).`);
  } else {
    partes.push('Nenhuma matéria nova.');
  }
  if (repetidas) partes.push(`${repetidas} já estava${repetidas === 1 ? '' : 'm'} na lista.`);
  if (ignorados.length) partes.push(`Ignorados (não são .txt nem .zip): ${ignorados.join(', ')}.`);
  $('relatorio').textContent = partes.join(' ');
}

async function lerArquivos(arquivos) {
  const textos = [];
  const ignorados = [];
  for (const { arquivo, caminho } of arquivos) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const ehZip = /\.zip$/i.test(caminho) || (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3);
    if (ehZip) {
      try {
        for (const item of await lerZip(bytes)) {
          if (/\.txt$/i.test(item.nome) && !/(^|\/)(__MACOSX\/|\.)/.test(item.nome)) {
            textos.push({ origem: `${caminho}/${item.nome}`, texto: decodificarTexto(item.dados) });
          }
        }
      } catch (e) {
        ignorados.push(`${caminho} (${e.message})`);
      }
    } else if (/\.(txt|text)$/i.test(caminho) || arquivo.type === 'text/plain') {
      textos.push({ origem: caminho, texto: decodificarTexto(bytes) });
    } else {
      ignorados.push(caminho);
    }
  }
  textos.sort((a, b) => a.origem.localeCompare(b.origem, 'pt-BR', { numeric: true }));
  const resultado = adicionarTextos(textos);
  relatar(resultado, ignorados);
  await completarPelasAbas(resultado.novas);
}

// Pastas arrastadas: percorre tudo o que há dentro.
async function arquivosDoArrasto(dataTransfer) {
  const entradas = [...dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entradas.length) return [...dataTransfer.files].map((arquivo) => ({ arquivo, caminho: arquivo.name }));
  const lista = [];
  const visitar = async (entrada, caminho) => {
    if (entrada.isFile) {
      const arquivo = await new Promise((ok, falha) => entrada.file(ok, falha));
      lista.push({ arquivo, caminho: `${caminho}${entrada.name}` });
    } else if (entrada.isDirectory) {
      const leitor = entrada.createReader();
      for (;;) {
        const lote = await new Promise((ok, falha) => leitor.readEntries(ok, falha));
        if (!lote.length) break;
        for (const filho of lote) await visitar(filho, `${caminho}${entrada.name}/`);
      }
    }
  };
  for (const entrada of entradas) await visitar(entrada, '');
  return lista;
}

// ---------------------------------------------------------------- colar

// Blocos que não fazem parte do texto da matéria (menus, botões, imagens, "Leia também").
const PULAR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'NAV', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'IMG', 'PICTURE', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME', 'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'HEAD']);
const PARAGRAFO = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'TR', 'DT', 'DD']);
const BLOCO = new Set([...PARAGRAFO, 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'UL', 'OL', 'TABLE', 'TBODY', 'THEAD', 'DL', 'HR', 'ADDRESS', 'CENTER']);

// HTML copiado do site → texto com um parágrafo por bloco (linha em branco entre eles).
function textoDeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const linhas = [];
  let atual = '';
  const quebrar = (paragrafo) => {
    const linha = atual.replace(/\s+/g, ' ').trim();
    if (linha) linhas.push(linha);
    atual = '';
    if (paragrafo && linhas.length && linhas.at(-1) !== '') linhas.push('');
  };
  const visitar = (no) => {
    if (no.nodeType === Node.TEXT_NODE) {
      atual += no.nodeValue;
      return;
    }
    if (no.nodeType !== Node.ELEMENT_NODE) return;
    const tag = no.tagName.toUpperCase();
    if (PULAR.has(tag) || no.hidden || no.getAttribute('aria-hidden') === 'true') return;
    if (tag === 'BR') return quebrar(false);
    const bloco = BLOCO.has(tag);
    const paragrafo = PARAGRAFO.has(tag);
    if (bloco) quebrar(paragrafo);
    if ((tag === 'TD' || tag === 'TH') && atual.trim()) atual += ' | ';
    for (const filho of no.childNodes) visitar(filho);
    if (bloco) quebrar(paragrafo);
  };
  visitar(doc.body);
  quebrar(false);
  while (linhas.at(-1) === '') linhas.pop();
  return linhas.join('\n');
}

// Prefere o HTML (separa melhor os parágrafos e tira imagens e menus), a não
// ser que ele perca texto em relação à versão simples.
function textoDoColado(texto, html) {
  if (!html) return texto;
  let convertido = '';
  try {
    convertido = textoDeHtml(html);
  } catch {
    return texto;
  }
  const tamanho = (t) => t.replace(/\s+/g, '').length;
  return tamanho(convertido) >= tamanho(texto) * 0.6 ? convertido : texto;
}

function aplicarLink(m, url) {
  m.link = url;
  const fonte = fonteDoLink(url);
  if (m.autor && fonte && !m.autor.includes('(')) m.autor = `${m.autor} (${fonte})`;
}

// Link pela aba aberta da matéria: a aba cujo título contém o título copiado.
async function linkPelasAbas(titulo) {
  const alvo = normalizar(titulo).replace(/\s+/g, ' ').trim();
  if (alvo.length < 15 || !globalThis.chrome?.tabs?.query) return '';
  let abas = [];
  try {
    abas = await chrome.tabs.query({});
  } catch {
    return '';
  }
  const achadas = abas.filter((a) => /^https?:/i.test(a.url || '') && normalizar(a.title).replace(/\s+/g, ' ').includes(alvo));
  achadas.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return achadas[0]?.url.replace(/#.*$/, '') || '';
}

async function completarPelasAbas(materias) {
  let mudou = false;
  for (const m of materias) {
    if (linkValido(m.link)) continue;
    const url = await linkPelasAbas(m.titulo);
    if (!url) continue;
    aplicarLink(m, url);
    mudou = true;
  }
  if (!mudou) return;
  salvar();
  desenharLista();
  atualizarEmails();
}

// Link colado sozinho: vai para a matéria mais recente que ainda não tem link.
function colocarLink(url) {
  const alvo = [...estado.materias].sort((a, b) => b.id - a.id).find((m) => !linkValido(m.link));
  if (!alvo) {
    avisar(
      estado.materias.length
        ? 'Todas as matérias já têm link. Para trocar, cole no campo “Link” da matéria.'
        : 'Cole primeiro o texto da matéria; o link vem depois.',
    );
    return;
  }
  aplicarLink(alvo, url);
  salvar();
  desenharLista();
  atualizarEmails();
  destacar(alvo.id);
  avisar(`Link colocado na matéria ${estado.materias.indexOf(alvo) + 1}: ${alvo.titulo || '(sem título)'}`);
}

async function receberColagem({ texto = '', html = '', arquivos = [] }) {
  if (arquivos.length) {
    await lerArquivos(arquivos.map((arquivo) => ({ arquivo, caminho: arquivo.name })));
    return;
  }
  const link = linkSozinho(texto);
  if (link) {
    colocarLink(link);
    return;
  }
  const conteudo = textoDoColado(texto, html);
  if (!conteudo.trim()) {
    avisar('A área de transferência está vazia. Copie a matéria no site (Ctrl+C) e tente de novo.');
    return;
  }
  const resultado = adicionarTextos([{ origem: '', texto: conteudo }]);
  relatar(resultado);
  if (!resultado.novas.length) return;
  await completarPelasAbas(resultado.novas);
  const m = resultado.novas.at(-1);
  destacar(m.id);
  avisar(
    `Matéria adicionada em ${m.area === FORA ? 'Não incluir' : m.area}: ${m.titulo || '(sem título)'}.` +
      (linkValido(m.link) ? '' : ' Falta o link: copie o endereço da página e cole aqui.'),
  );
}

async function colarDoBotao() {
  try {
    let texto = '';
    let html = '';
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
      if (item.types.includes('text/plain')) texto = await (await item.getType('text/plain')).text();
    }
    await receberColagem({ texto, html });
  } catch {
    $('zona-colar').focus();
    avisar('O navegador não deixou ler a área de transferência. Clique na área tracejada e aperte Ctrl+V.');
  }
}

// ---------------------------------------------------------------- lista

function criar(tag, props = {}, filhos = []) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (chave === 'class') el.className = valor;
    else if (chave in el) el[chave] = valor;
    else el.setAttribute(chave, valor);
  }
  el.append(...filhos);
  return el;
}

function avisosDe(m) {
  const avisos = [];
  if (!m.titulo.trim()) avisos.push('sem título');
  if (!m.link.trim()) avisos.push('sem link');
  else if (!linkValido(m.link)) avisos.push('link inválido');
  if (m.areaConferir && m.area !== FORA) avisos.push('confira a área');
  if (m.area !== FORA && m.data && m.data !== dataDaArea(m.area)) {
    avisos.push(`matéria de ${formatarData(m.data, '/')}, e-mail de ${formatarData(dataDaArea(m.area), '/')}`);
  }
  if (contarPalavras(m.texto) < 80) avisos.push('texto curto: confira se é a matéria inteira');
  return avisos;
}

function atualizarAvisos() {
  for (const m of estado.materias) {
    const el = document.querySelector(`[data-id="${m.id}"] .avisos`);
    if (!el) continue;
    const avisos = avisosDe(m);
    el.replaceChildren(...avisos.map((a) => criar('span', { class: 'chip', textContent: a })));
    el.hidden = !avisos.length;
  }
}

function mover(id, delta) {
  const i = estado.materias.findIndex((m) => m.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= estado.materias.length) return;
  [estado.materias[i], estado.materias[j]] = [estado.materias[j], estado.materias[i]];
  salvar();
  desenharLista();
  atualizarEmails();
  document.querySelector(`[data-id="${id}"] [data-mover="${delta}"]`)?.focus();
}

function cartao(m, posicao) {
  const campo = (rotulo, entrada, classe = '') => criar('label', { class: `campo ${classe}` }, [criar('span', { textContent: rotulo }), entrada]);
  const editar = (chave) => (ev) => {
    m[chave] = ev.target.value;
    salvar();
    atualizarAvisos();
    atualizarEmails();
  };

  const area = criar('select', { class: 'area', 'aria-label': 'Área' }, [
    ...AREAS.map((a) => criar('option', { value: a, textContent: a })),
    criar('option', { value: FORA, textContent: 'Não incluir' }),
  ]);
  area.value = m.area;
  area.addEventListener('change', () => {
    m.area = area.value;
    m.areaConferir = false;
    salvar();
    desenharLista();
    atualizarEmails();
  });

  const titulo = criar('input', { type: 'text', value: m.titulo, placeholder: 'Título da matéria' });
  titulo.addEventListener('input', editar('titulo'));
  const autor = criar('input', { type: 'text', value: m.autor, placeholder: 'sem autor: a linha “Por:” não aparece' });
  autor.addEventListener('input', editar('autor'));
  const link = criar('input', { type: 'url', value: m.link, placeholder: 'https://…', spellcheck: false });
  link.addEventListener('input', editar('link'));
  const data = criar('input', { type: 'date', value: m.data });
  data.addEventListener('input', editar('data'));
  const texto = criar('textarea', { value: m.texto, rows: 14, spellcheck: false });
  const resumoTexto = criar('summary', { textContent: `Texto integral · ${contarPalavras(m.texto)} palavras` });
  texto.addEventListener('input', (ev) => {
    editar('texto')(ev);
    resumoTexto.textContent = `Texto integral · ${contarPalavras(m.texto)} palavras`;
  });

  const botao = (rotulo, titulo, acao, extra = {}) => {
    const b = criar('button', { type: 'button', textContent: rotulo, title: titulo, 'aria-label': titulo, ...extra });
    b.addEventListener('click', acao);
    return b;
  };

  return criar('li', { class: `materia${m.area === FORA ? ' fora' : ''}`, 'data-id': m.id, 'data-area': m.area }, [
    criar('div', { class: 'cabeca' }, [
      criar('span', { class: 'numero', textContent: String(posicao) }),
      area,
      criar('div', { class: 'acoes' }, [
        botao('↑', 'Subir', () => mover(m.id, -1), { 'data-mover': '-1', disabled: posicao === 1 }),
        botao('↓', 'Descer', () => mover(m.id, 1), { 'data-mover': '1', disabled: posicao === estado.materias.length }),
        botao('Remover', 'Remover esta matéria', () => {
          estado.materias = estado.materias.filter((x) => x.id !== m.id);
          salvar();
          desenharLista();
          atualizarEmails();
        }),
      ]),
    ]),
    campo('Título', titulo, 'largo'),
    criar('div', { class: 'linha' }, [campo('Por', autor), campo('Link', link, 'link'), campo('Data', data, 'data')]),
    criar('p', { class: 'avisos' }),
    criar('details', { class: 'texto' }, [resumoTexto, texto, criar('p', { class: 'suave origem', textContent: m.origem ? `Arquivo: ${m.origem}` : 'Texto colado' })]),
  ]);
}

function desenharLista() {
  const lista = $('lista');
  lista.replaceChildren(...estado.materias.map((m, i) => cartao(m, i + 1)));
  $('vazio').hidden = estado.materias.length > 0;
  const contagem = AREAS.map((a) => [a, daArea(a).length]).filter(([, n]) => n);
  const fora = daArea(FORA).length;
  $('resumo-lista').textContent = estado.materias.length
    ? `${contagem.map(([a, n]) => `${a}: ${n}`).join(' · ')}${fora ? ` · fora do e-mail: ${fora}` : ''}`
    : '';
  atualizarAvisos();
}

function destacar(id) {
  const el = document.querySelector(`#lista [data-id="${id}"]`);
  if (!el) return;
  const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: suave ? 'smooth' : 'auto' });
  el.classList.add('nova');
  setTimeout(() => el.classList.remove('nova'), 2500);
}

// ---------------------------------------------------------------- e-mails

function destinatarios() {
  return $('destinatarios')
    .value.split(/[;,\s]+/)
    .filter((e) => e.includes('@'));
}

function dadosDoEmail(area) {
  return { area, data: dataDaArea(area), materias: daArea(area) };
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function copiarTexto(texto, mensagem) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(mensagem);
  } catch {
    avisar('Não foi possível copiar. Selecione o texto e use Ctrl+C.');
  }
}

// Plano B para copiar: seleciona o e-mail desenhado na página e usa o "copiar" do navegador.
function copiarPorSelecao(html) {
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;background:#fff';
  caixa.innerHTML = html;
  document.body.append(caixa);
  const faixa = document.createRange();
  faixa.selectNodeContents(caixa);
  const selecao = getSelection();
  selecao.removeAllRanges();
  selecao.addRange(faixa);
  const ok = document.execCommand('copy');
  selecao.removeAllRanges();
  caixa.remove();
  return ok;
}

async function copiarEmail(area) {
  const dados = dadosDoEmail(area);
  const html = montarEmail(dados);
  const pronto = `E-mail de ${area} copiado. No Outlook, clique no corpo da mensagem e aperte Ctrl+V.`;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([montarTexto(dados)], { type: 'text/plain' }),
      }),
    ]);
    avisar(pronto);
  } catch {
    avisar(copiarPorSelecao(html) ? pronto : 'Não foi possível copiar. Abra “Pré-visualizar”, selecione o e-mail e use Ctrl+C.');
  }
}

// Desenha o e-mail dentro de um "shadow DOM": isolado do visual desta página
// e sem iframe, funciona igual dentro e fora da extensão.
function desenharPrevia(caixa, html) {
  let raiz = caixa.shadowRoot;
  if (!raiz) {
    raiz = caixa.attachShadow({ mode: 'open' });
    raiz.addEventListener('click', (ev) => {
      const link = ev.target.closest?.('a[href]');
      if (!link) return;
      ev.preventDefault();
      const destino = link.getAttribute('href');
      if (destino.startsWith('#')) raiz.querySelector(`[id="${CSS.escape(destino.slice(1))}"]`)?.scrollIntoView({ block: 'start' });
      else window.open(destino, '_blank', 'noopener');
    });
  }
  raiz.innerHTML = html;
}

function abrirPrevia(area) {
  const dados = dadosDoEmail(area);
  $('dialogo').dataset.area = area;
  $('dialogo-titulo').textContent = assunto(area, dados.data);
  desenharPrevia($('dialogo-corpo'), montarEmail(dados));
  $('dialogo').showModal();
  $('dialogo-corpo').scrollTop = 0;
}

const cartoesEmail = {};

function cartaoEmail(area) {
  const data = criar('input', { type: 'date', 'aria-label': `Data do e-mail de ${area}` });
  data.addEventListener('input', () => {
    if (data.value) estado.datas[area] = data.value;
    else delete estado.datas[area];
    salvar();
    atualizarEmails();
    atualizarAvisos();
  });
  const assuntoEl = criar('output', { class: 'assunto' });
  const contagem = criar('span', { class: 'suave' });
  const previa = criar('div', { class: 'previa', role: 'region', 'aria-label': `Prévia do e-mail de ${area}`, tabindex: '0' });
  const botao = (rotulo, acao, classe = '') => {
    const b = criar('button', { type: 'button', textContent: rotulo, class: classe });
    b.addEventListener('click', acao);
    return b;
  };

  const el = criar('article', { class: 'email', 'data-area': area }, [
    criar('div', { class: 'cabeca-email' }, [criar('h3', { textContent: area }), contagem]),
    criar('div', { class: 'linha' }, [
      criar('label', { class: 'campo data' }, [criar('span', { textContent: 'Data do e-mail' }), data]),
      criar('div', { class: 'campo largo' }, [
        criar('span', { textContent: 'Assunto' }),
        criar('div', { class: 'copiavel' }, [assuntoEl, botao('Copiar', () => copiarTexto(assunto(area, dataDaArea(area)), 'Assunto copiado.'))]),
      ]),
    ]),
    criar('div', { class: 'botoes' }, [
      botao('Copiar e-mail para o Outlook', () => copiarEmail(area), 'primario'),
      botao('Pré-visualizar', () => abrirPrevia(area)),
      botao('Abrir no Outlook (Para + Assunto)', () => {
        const para = destinatarios().join(',');
        location.href = `mailto:${para}?subject=${encodeURIComponent(assunto(area, dataDaArea(area)))}`;
        if (!para) avisar('Preencha o campo “Para” para os destinatários virem junto.');
      }),
      botao('Baixar .html', () => {
        const dados = dadosDoEmail(area);
        baixar(new Blob([montarEmail(dados)], { type: 'text/html;charset=utf-8' }), nomeArquivo(area, dados.data));
      }),
    ]),
    previa,
  ]);
  return { el, data, assuntoEl, contagem, previa };
}

let atualizacao = null;
function atualizarEmails() {
  clearTimeout(atualizacao);
  atualizacao = setTimeout(() => {
    let algum = false;
    for (const area of AREAS) {
      cartoesEmail[area] ??= cartaoEmail(area);
      const c = cartoesEmail[area];
      const dados = dadosDoEmail(area);
      const n = dados.materias.length;
      if (!c.el.isConnected) $('emails').append(c.el);
      c.el.hidden = !n;
      if (!n) continue;
      algum = true;
      if (document.activeElement !== c.data) c.data.value = dados.data;
      c.assuntoEl.textContent = assunto(area, dados.data);
      c.contagem.textContent = `${n} ${n === 1 ? 'matéria' : 'matérias'} · ${nomeArquivo(area, dados.data)}`;
      desenharPrevia(c.previa, montarEmail(dados));
      if ($('dialogo').open && $('dialogo').dataset.area === area) desenharPrevia($('dialogo-corpo'), montarEmail(dados));
    }
    $('baixar-todos').hidden = !algum;
    $('emails').dataset.vazio = algum ? '' : 'sim';
  }, 150);
}

// ---------------------------------------------------------------- eventos

$('escolher-arquivos').addEventListener('click', () => $('arquivos').click());
$('escolher-pasta').addEventListener('click', () => $('pasta').click());
for (const id of ['arquivos', 'pasta']) {
  $(id).addEventListener('change', async (ev) => {
    const arquivos = [...ev.target.files].map((arquivo) => ({ arquivo, caminho: arquivo.webkitRelativePath || arquivo.name }));
    ev.target.value = '';
    await lerArquivos(arquivos);
  });
}

const zona = $('zona-colar');
$('colar-botao').addEventListener('click', colarDoBotao);
document.addEventListener('paste', (ev) => {
  if (ev.target.closest?.('input, textarea, select, [contenteditable="true"]') || !ev.clipboardData) return;
  ev.preventDefault();
  receberColagem({
    texto: ev.clipboardData.getData('text/plain'),
    html: ev.clipboardData.getData('text/html'),
    arquivos: [...ev.clipboardData.files],
  });
});

$('dialogo-fechar').addEventListener('click', () => $('dialogo').close());
$('dialogo-copiar').addEventListener('click', () => copiarEmail($('dialogo').dataset.area));
$('dialogo').addEventListener('click', (ev) => {
  if (ev.target === $('dialogo')) $('dialogo').close(); // clique fora do conteúdo
});

document.addEventListener('dragover', (ev) => {
  if (!ev.dataTransfer?.types.includes('Files')) return;
  ev.preventDefault();
  zona.classList.add('ativa');
});
document.addEventListener('dragleave', (ev) => {
  if (!ev.relatedTarget) zona.classList.remove('ativa');
});
document.addEventListener('drop', async (ev) => {
  if (!ev.dataTransfer?.types.includes('Files')) return;
  ev.preventDefault();
  zona.classList.remove('ativa');
  await lerArquivos(await arquivosDoArrasto(ev.dataTransfer));
});

$('adicionar-colado').addEventListener('click', async () => {
  const texto = $('colar').value.trim();
  if (!texto) return;
  const resultado = adicionarTextos([{ origem: '', texto }]);
  relatar(resultado);
  $('colar').value = '';
  await completarPelasAbas(resultado.novas);
  if (resultado.novas.length) destacar(resultado.novas.at(-1).id);
});

$('limpar').addEventListener('click', () => {
  if (!estado.materias.length) return;
  if (!confirm('Tirar todas as matérias da lista? Os destinatários continuam salvos.')) return;
  estado.materias = [];
  estado.datas = {};
  salvar();
  desenharLista();
  atualizarEmails();
  $('relatorio').textContent = '';
});

$('destinatarios').addEventListener('input', () => armazenamento.gravar('noticiasPara', $('destinatarios').value));
document.querySelector('[data-copiar="destinatarios"]').addEventListener('click', () => {
  const lista = destinatarios();
  if (!lista.length) return avisar('Preencha os destinatários primeiro.');
  copiarTexto(lista.join('; '), 'Destinatários copiados.');
});

$('baixar-todos').addEventListener('click', () => {
  const entradas = AREAS.filter((a) => daArea(a).length).map((area) => {
    const dados = dadosDoEmail(area);
    return { nome: nomeArquivo(area, dados.data), dados: new TextEncoder().encode(montarEmail(dados)) };
  });
  const datas = [...new Set(AREAS.filter((a) => daArea(a).length).map(dataDaArea))].sort();
  baixar(criarZip(entradas), `EMAILS_NOTICIAS_${formatarData(datas.at(-1), '-')}.zip`);
});

async function iniciar() {
  const [salvo, para] = await Promise.all([armazenamento.ler('noticias'), armazenamento.ler('noticiasPara')]);
  if (salvo?.materias) {
    estado.materias = salvo.materias;
    estado.datas = salvo.datas || {};
    proximoId = Math.max(0, ...estado.materias.map((m) => m.id)) + 1;
  }
  $('destinatarios').value = para || '';
  desenharLista();
  atualizarEmails();
}

iniciar();
