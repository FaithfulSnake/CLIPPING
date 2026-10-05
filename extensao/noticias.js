import {
  AREAS,
  assunto,
  contarPalavras,
  dataPredominante,
  formatarData,
  interpretarMateria,
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
  avisar.tempo = setTimeout(() => (el.hidden = true), 4000);
}

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
  relatar(adicionarTextos(textos), ignorados);
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

async function copiarEmail(area) {
  const dados = dadosDoEmail(area);
  const html = montarEmail(dados);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([montarTexto(dados)], { type: 'text/plain' }),
      }),
    ]);
    avisar(`E-mail de ${area} copiado. No Outlook, clique no corpo da mensagem e aperte Ctrl+V.`);
  } catch {
    avisar('Não foi possível copiar direto. Use “Abrir em nova aba”, depois Ctrl+A e Ctrl+C.');
  }
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
  const previa = criar('iframe', { class: 'previa', title: `Prévia do e-mail de ${area}`, sandbox: '' });
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
      botao('Abrir no Outlook (Para + Assunto)', () => {
        const para = destinatarios().join(',');
        location.href = `mailto:${para}?subject=${encodeURIComponent(assunto(area, dataDaArea(area)))}`;
        if (!para) avisar('Preencha o campo “Para” para os destinatários virem junto.');
      }),
      botao('Baixar .html', () => {
        const dados = dadosDoEmail(area);
        baixar(new Blob([montarEmail(dados)], { type: 'text/html;charset=utf-8' }), nomeArquivo(area, dados.data));
      }),
      botao('Abrir em nova aba', () => {
        const url = URL.createObjectURL(new Blob([montarEmail(dadosDoEmail(area))], { type: 'text/html;charset=utf-8' }));
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
      c.previa.srcdoc = montarEmail(dados);
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

const zona = $('soltar');
zona.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    $('arquivos').click();
  }
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

$('adicionar-colado').addEventListener('click', () => {
  const texto = $('colar').value.trim();
  if (!texto) return;
  relatar(adicionarTextos([{ origem: '', texto }]));
  $('colar').value = '';
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
