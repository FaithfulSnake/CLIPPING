// Página "Pacotes de prints": lista os pacotes, os ZIPs de cada um e onde
// estão no disco (pelo histórico de downloads do navegador).
import { lerSessao } from './db.js';
import { criarPacote, excluirPacote, guardarEscolha, lerPacotes, pastaDoPacote, sugerirNomePacote, tirarDoPacote } from './pacotes.js';

const $ = (id) => document.getElementById(id);

function avisar(texto) {
  const el = $('aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisar.tempo);
  avisar.tempo = setTimeout(() => (el.hidden = true), Math.max(4000, texto.length * 60));
}

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

function botao(rotulo, acao, props = {}) {
  const b = criar('button', { type: 'button', textContent: rotulo, ...props });
  b.addEventListener('click', acao);
  return b;
}

const dataHora = (ms) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const quantos = (n) => `${n} ${n === 1 ? 'ZIP' : 'ZIPs'}`;

// Situação de cada ZIP no disco, pelo histórico de downloads do navegador.
async function situacoes(lista) {
  const ids = lista.flatMap((p) => p.itens.map((i) => i.downloadId)).filter(Number.isInteger);
  const mapa = new Map();
  await Promise.all(
    ids.map(async (id) => {
      const [d] = await chrome.downloads.search({ id });
      if (d) mapa.set(id, d);
    }),
  );
  return mapa;
}

// Capturas cujos prints ainda estão guardados na extensão (as 5 mais recentes).
async function guardadas(lista) {
  const ids = [...new Set(lista.flatMap((p) => p.itens.map((i) => i.sessaoId)))];
  const existem = new Set();
  await Promise.all(
    ids.map(async (id) => {
      if (await lerSessao(id)) existem.add(id);
    }),
  );
  return existem;
}

function linhaDoItem(pacote, item, download, temPrints) {
  const status = !download
    ? criar('span', { class: 'status falta', textContent: 'fora do histórico de downloads do navegador' })
    : download.exists
      ? criar('span', { class: 'status ok', textContent: 'na pasta' })
      : criar('span', { class: 'status falta', textContent: 'arquivo apagado ou movido' });
  const titulo = criar('a', { href: item.url, target: '_blank', rel: 'noopener', textContent: item.titulo || item.url });
  return criar('li', { class: 'item' }, [
    criar('div', { class: 'info' }, [
      criar('strong', { textContent: item.arquivo }),
      titulo,
      criar('span', { class: 'suave', textContent: `${item.total} ${item.total === 1 ? 'print' : 'prints'} · ${dataHora(item.data)}` }),
      status,
    ]),
    criar('div', { class: 'acoes' }, [
      botao('Mostrar na pasta', () => chrome.downloads.show(item.downloadId), { disabled: !download?.exists }),
      botao('Ver prints', () => chrome.tabs.create({ url: `resultado.html?sessao=${encodeURIComponent(item.sessaoId)}` }), {
        disabled: !temPrints,
        title: temPrints ? 'Abrir a prévia dos prints' : 'A extensão só guarda os prints das 5 capturas mais recentes',
      }),
      botao('Tirar do pacote', async () => {
        await tirarDoPacote(pacote.id, item.sessaoId);
        avisar(`“${item.arquivo}” saiu da lista do pacote. O arquivo continua na pasta.`);
      }),
    ]),
  ]);
}

function cartao(pacote, escolhido, mapa, comPrints) {
  const itens = [...pacote.itens].sort((a, b) => a.data - b.data);
  const confirmar = criar('p', { class: 'confirmar', hidden: true }, [
    `Tirar “${pacote.nome}” da lista? A pasta e os ZIPs continuam em Downloads.`,
    botao('Excluir', async () => {
      await excluirPacote(pacote.id);
      avisar(`Pacote “${pacote.nome}” excluído da lista. A pasta continua em Downloads.`);
    }, { class: 'perigo' }),
    botao('Cancelar', () => (confirmar.hidden = true)),
  ]);

  const abrirPasta = async () => {
    const salvo = itens.map((i) => mapa.get(i.downloadId)).find((d) => d?.exists);
    if (salvo) chrome.downloads.show(salvo.id);
    else {
      chrome.downloads.showDefaultFolder();
      avisar('Este pacote ainda não tem ZIP salvo, então abri a pasta Downloads. A pasta do pacote aparece quando o primeiro ZIP for salvo.');
    }
  };

  return criar('article', { class: `pacote${escolhido ? ' escolhido' : ''}`, 'data-id': pacote.id }, [
    criar('div', { class: 'cabeca' }, [
      criar('div', {}, [
        criar('div', { class: 'titulo-pacote' }, [
          criar('h2', { textContent: pacote.nome }),
          ...(escolhido ? [criar('span', { class: 'marca', textContent: 'próxima captura' })] : []),
        ]),
        criar('p', { class: 'suave', textContent: `Downloads/${pacote.pasta}/ · ${quantos(itens.length)} · atualizado em ${dataHora(pacote.atualizado)}` }),
      ]),
      criar('div', { class: 'acoes' }, [
        botao('Abrir pasta', abrirPasta),
        escolhido
          ? botao('Deixar de usar', () => guardarEscolha(null))
          : botao('Usar na próxima captura', async () => {
              await guardarEscolha(pacote.id);
              avisar(`A próxima captura vai para “${pacote.nome}”.`);
            }),
        botao('Excluir', () => (confirmar.hidden = false)),
      ]),
    ]),
    confirmar,
    itens.length
      ? criar('ol', { class: 'itens' }, itens.map((i) => linhaDoItem(pacote, i, mapa.get(i.downloadId), comPrints.has(i.sessaoId))))
      : criar('p', { class: 'suave', textContent: 'Nenhum ZIP ainda. Escolha este pacote no popup antes de iniciar a captura.' }),
  ]);
}

let desenhando = null;
async function desenhar() {
  const { lista, escolha } = await lerPacotes();
  const [mapa, comPrints] = await Promise.all([situacoes(lista), guardadas(lista)]);
  $('vazio').hidden = lista.length > 0;
  $('lista').replaceChildren(...lista.map((p) => cartao(p, p.id === escolha, mapa, comPrints)));
}
function redesenhar() {
  clearTimeout(desenhando);
  desenhando = setTimeout(desenhar, 150);
}

// ---------------------------------------------------------------- novo pacote

const atualizarDestinoNovo = () => {
  $('novo-destino').textContent = `Pasta: Downloads/${pastaDoPacote($('novo-nome').value)}/`;
};

$('novo').addEventListener('click', () => {
  $('form-novo').hidden = false;
  $('novo-nome').value ||= sugerirNomePacote('');
  atualizarDestinoNovo();
  $('novo-nome').focus();
  $('novo-nome').select();
});
$('cancelar-novo').addEventListener('click', () => ($('form-novo').hidden = true));
$('novo-nome').addEventListener('input', atualizarDestinoNovo);
$('form-novo').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const antes = (await lerPacotes()).lista.length;
  const pacote = await criarPacote($('novo-nome').value);
  await guardarEscolha(pacote.id);
  const ja = (await lerPacotes()).lista.length === antes;
  avisar(ja ? `Já existia o pacote “${pacote.nome}”: ele foi escolhido para a próxima captura.` : `Pacote “${pacote.nome}” criado e escolhido para a próxima captura.`);
  $('novo-nome').value = '';
  $('form-novo').hidden = true;
});

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === 'local' && mudancas.pacotes) redesenhar();
});
chrome.downloads.onChanged.addListener(redesenhar);

desenhar();
