// Página "Pacotes de prints": onde os pacotes são salvos (com o botão Salvar),
// a lista dos pacotes, os ZIPs de cada um (e se continuam no disco) e a
// exportação do pacote inteiro num ZIP só.
import { lerPrints, lerSessao, salvarSessao } from './db.js';
import {
  acesso,
  atualizarIndice,
  baixarArquivo,
  dentroDaPasta,
  existeNaPasta,
  explicarErro,
  gravarIndice,
  gravarNaPasta,
  lerDaPasta,
  lerDestino,
  lerPergunta,
  salvarDestino,
} from './destino.js';
import { zipDoPacote } from './exportar.js';
import { criarPacote, excluirPacote, guardarEscolha, lerPacotes, pastaDoPacote, porNumero, sugerirNomePacote, tirarDoPacote } from './pacotes.js';

const $ = (id) => document.getElementById(id);

let destino = { modo: 'downloads', pasta: null, nome: 'Downloads' }; // o que está salvo
let rascunho = { modo: 'downloads', pasta: null }; // o que está na tela, antes de Salvar

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
const raiz = () => (destino.modo === 'pasta' ? destino.nome : 'Downloads');
const naPastaEscolhida = (item) => item.local === 'pasta' && destino.modo === 'pasta' && item.raiz === destino.nome;

// A captura deixa de ser de um pacote: os prints dela podem ser apagados
// depois (a extensão guarda só as 5 capturas mais recentes fora de pacotes).
async function soltarCaptura(sessaoId) {
  const s = await lerSessao(sessaoId);
  if (!s) return;
  s.pacote = null;
  if (s.salvo) s.salvo = { ...s.salvo, pacoteId: null };
  await salvarSessao(s);
}

// ---------------------------------------------------------------- onde salvar

async function carregarDestino() {
  destino = await lerDestino();
  rascunho = { modo: destino.modo, pasta: destino.pasta };
  await desenharDestino();
}

async function mudouDestino() {
  if (rascunho.modo !== destino.modo) return true;
  if (rascunho.modo !== 'pasta' || rascunho.pasta === destino.pasta) return false;
  return !(await rascunho.pasta.isSameEntry(destino.pasta).catch(() => false));
}

async function desenharDestino() {
  document.querySelector(`input[name="destino"][value="${rascunho.modo}"]`).checked = true;
  $('pasta-linha').hidden = rascunho.modo !== 'pasta';
  $('pasta-nome').textContent = rascunho.pasta ? `Pasta: ${rascunho.pasta.name}` : 'Nenhuma pasta escolhida ainda.';
  $('escolher-pasta').textContent = rascunho.pasta ? 'Trocar pasta…' : 'Escolher pasta…';
  const mudou = await mudouDestino();
  const situacao = !mudou && destino.modo === 'pasta' ? await acesso(destino.pasta) : 'granted';
  $('destino-pendente').hidden = !mudou;
  $('salvar-destino').disabled = !mudou || (rascunho.modo === 'pasta' && !rascunho.pasta);
  $('permitir').hidden = situacao === 'granted';
  if (mudou) {
    $('destino-situacao').textContent = rascunho.modo === 'pasta' && !rascunho.pasta ? 'Escolha a pasta e clique em Salvar.' : 'Clique em Salvar para passar a usar esta opção.';
  } else if (situacao !== 'granted') {
    $('destino-situacao').textContent = 'O Chrome precisa confirmar o acesso à pasta: clique em Permitir acesso.';
  } else {
    $('destino-situacao').textContent = destino.modo === 'pasta' ? `Os pacotes vão para a pasta “${destino.nome}”.` : 'Os pacotes vão para a pasta Downloads.';
  }
  $('pergunta-aviso').hidden = !(rascunho.modo === 'downloads' && (await lerPergunta()));
}

async function escolherPasta() {
  try {
    const pasta = await showDirectoryPicker({ id: 'pacotes-de-prints', mode: 'readwrite', startIn: rascunho.pasta || destino.pasta || 'downloads' });
    rascunho = { modo: 'pasta', pasta };
  } catch (e) {
    if (e.name !== 'AbortError') avisar(`Não foi possível usar essa pasta: ${explicarErro(e)}.`);
  }
  await desenharDestino();
}

for (const radio of document.querySelectorAll('input[name="destino"]')) {
  radio.addEventListener('change', async () => {
    rascunho = { modo: radio.value, pasta: rascunho.pasta ?? destino.pasta };
    if (radio.value === 'pasta' && !rascunho.pasta) await escolherPasta(); // o clique já abre a escolha
    else await desenharDestino();
  });
}
$('escolher-pasta').addEventListener('click', escolherPasta);

$('permitir').addEventListener('click', async () => {
  if ((await acesso(destino.pasta, true)) !== 'granted') avisar('O Chrome não deu acesso à pasta. Tente de novo ou escolha a pasta outra vez.');
  await desenharDestino();
  redesenhar();
});

$('salvar-destino').addEventListener('click', async () => {
  const novo = { ...rascunho };
  if (novo.modo === 'pasta' && (await acesso(novo.pasta, true)) !== 'granted') {
    avisar('Sem permissão para gravar nessa pasta: permita o acesso ou escolha outra pasta.');
    return;
  }
  await salvarDestino(novo);
  await carregarDestino();
  if (destino.modo === 'pasta') {
    // pacotes ainda vazios já ganham a pasta principal, com o índice
    for (const p of (await lerPacotes()).lista.filter((p) => !p.itens.length)) await gravarIndice(destino.pasta, p).catch(() => {});
    avisar(`Salvo. Os próximos ZIPs vão direto para a pasta “${destino.nome}”, cada pacote na pasta dele. Os já salvos continuam onde estão.`);
  } else {
    avisar('Salvo. Os próximos ZIPs vão para a pasta Downloads, cada pacote na pasta dele.');
  }
  $('destino-situacao').textContent = `Configuração salva. ${$('destino-situacao').textContent}`;
  redesenhar();
});

// ---------------------------------------------------------------- lista

// Situação de um ZIP no disco: na pasta escolhida (se der para ver) ou pelo
// histórico de downloads do navegador.
async function situacao(pacote, item, permitido) {
  if (item.local === 'pasta') {
    if (!naPastaEscolhida(item)) return { texto: `na pasta “${item.raiz}”, escolhida antes`, tipo: 'neutro' };
    if (!permitido) return { texto: 'sem acesso à pasta agora (clique em Permitir acesso, acima)', tipo: 'falta' };
    return (await existeNaPasta(destino.pasta, pacote.pasta, item.arquivo)) ? { texto: 'na pasta do pacote', tipo: 'ok' } : { texto: 'arquivo apagado ou movido', tipo: 'falta' };
  }
  const [d] = Number.isInteger(item.downloadId) ? await chrome.downloads.search({ id: item.downloadId }) : [];
  if (!d) return { texto: 'fora do histórico de downloads do navegador', tipo: 'falta' };
  if (!d.exists) return { texto: 'arquivo apagado ou movido', tipo: 'falta' };
  if (!dentroDaPasta(d.filename, pacote.pasta)) return { texto: `salvo fora da pasta do pacote: ${d.filename}`, tipo: 'falta', download: d };
  return { texto: 'na pasta do pacote', tipo: 'ok', download: d };
}

async function situacoes(lista) {
  const permitido = destino.modo === 'pasta' && (await acesso(destino.pasta)) === 'granted';
  const mapa = new Map();
  await Promise.all(lista.flatMap((p) => p.itens.map(async (i) => mapa.set(`${p.id}|${i.sessaoId}`, await situacao(p, i, permitido)))));
  return mapa;
}

// Capturas cujos prints ainda estão guardados na extensão.
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

function linhaDoItem(pacote, item, sit, temPrints) {
  const titulo = criar('a', { href: item.url, target: '_blank', rel: 'noopener', textContent: item.titulo || item.url });
  return criar('li', { class: 'item' }, [
    criar('div', { class: 'info' }, [
      criar('strong', { textContent: item.arquivo }),
      titulo,
      criar('span', { class: 'suave', textContent: `${item.total} ${item.total === 1 ? 'print' : 'prints'} · ${dataHora(item.data)}` }),
      criar('span', { class: `status ${sit.tipo}`, textContent: sit.texto }),
    ]),
    criar('div', { class: 'acoes' }, [
      ...(item.local === 'pasta' ? [] : [botao('Mostrar na pasta', () => chrome.downloads.show(item.downloadId), { disabled: !sit.download })]),
      botao('Ver prints', () => chrome.tabs.create({ url: `resultado.html?sessao=${encodeURIComponent(item.sessaoId)}` }), {
        disabled: !temPrints,
        title: temPrints ? 'Abrir a prévia dos prints' : 'Os prints desta captura não estão mais guardados na extensão',
      }),
      botao('Tirar do pacote', async () => {
        const atualizado = await tirarDoPacote(pacote.id, item.sessaoId);
        if (atualizado) await atualizarIndice(destino, atualizado, item.local === 'pasta' ? 'pasta' : 'downloads');
        await soltarCaptura(item.sessaoId);
        avisar(`“${item.arquivo}” saiu do pacote e do índice. O arquivo continua na pasta: apague-o se não precisar mais dele.`);
      }),
    ]),
  ]);
}

// Um ZIP com o pacote inteiro. Na pasta escolhida ele fica ao lado da pasta do
// pacote; senão vai para Downloads.
async function exportar(pacote, b) {
  b.disabled = true;
  avisar(`Montando o ZIP do pacote “${pacote.nome}”…`);
  try {
    const naPasta = destino.modo === 'pasta' && (await acesso(destino.pasta, true)) === 'granted';
    const { blob, faltando } = await zipDoPacote(pacote, async (item) => {
      const sessao = await lerSessao(item.sessaoId);
      if (sessao) {
        const prints = await lerPrints(item.sessaoId);
        if (prints.length) return { sessao, prints };
      }
      // sem os prints guardados: usa o ZIP que está na pasta do pacote
      if (naPasta && naPastaEscolhida(item)) {
        try {
          return { zip: await (await lerDaPasta(destino.pasta, pacote.pasta, item.arquivo)).arrayBuffer() };
        } catch {
          return null;
        }
      }
      return null;
    });
    const arquivo = `${pacote.pasta}.zip`;
    let onde;
    if (naPasta) {
      await gravarNaPasta(destino.pasta, '', arquivo, blob);
      onde = `${destino.nome}/${arquivo}`;
    } else {
      const { completo } = await baixarArquivo(blob, arquivo);
      onde = completo || `Downloads/${arquivo}`;
    }
    const fora = faltando.length
      ? ` ${faltando.length === 1 ? 'Ficou de fora 1 matéria' : `Ficaram de fora ${faltando.length} matérias`} (os prints não estão mais guardados na extensão): ${faltando.map((f) => f.arquivo).join(', ')}.`
      : '';
    avisar(`ZIP do pacote salvo em ${onde}: a pasta “${pacote.pasta}” com o índice e uma pasta para cada matéria.${fora}`);
  } catch (e) {
    avisar(`Não foi possível exportar o pacote: ${explicarErro(e, destino)}.`);
  } finally {
    b.disabled = false;
  }
}

function cartao(pacote, escolhido, mapa, comPrints) {
  const itens = [...pacote.itens].sort(porNumero);
  const confirmar = criar('p', { class: 'confirmar', hidden: true }, [
    `Tirar “${pacote.nome}” da lista? A pasta e os ZIPs continuam no disco.`,
    botao(
      'Excluir',
      async () => {
        await excluirPacote(pacote.id);
        for (const i of pacote.itens) await soltarCaptura(i.sessaoId);
        avisar(`Pacote “${pacote.nome}” excluído da lista. A pasta continua no disco.`);
      },
      { class: 'perigo' },
    ),
    botao('Cancelar', () => (confirmar.hidden = true)),
  ]);

  const abrirPasta = async () => {
    const salvo = itens.map((i) => mapa.get(`${pacote.id}|${i.sessaoId}`)?.download).find((d) => d?.exists && dentroDaPasta(d.filename, pacote.pasta));
    if (salvo) chrome.downloads.show(salvo.id);
    else {
      chrome.downloads.showDefaultFolder();
      avisar('Abri a pasta Downloads: a pasta do pacote aparece lá quando o primeiro ZIP for salvo nela.');
    }
  };

  return criar('article', { class: `pacote${escolhido ? ' escolhido' : ''}`, 'data-id': pacote.id }, [
    criar('div', { class: 'cabeca' }, [
      criar('div', {}, [
        criar('div', { class: 'titulo-pacote' }, [
          criar('h2', { textContent: pacote.nome }),
          ...(escolhido ? [criar('span', { class: 'marca', textContent: 'próxima captura' })] : []),
        ]),
        criar('p', { class: 'suave caminho', textContent: `${raiz()}/${pacote.pasta}/ · ${quantos(itens.length)} · atualizado em ${dataHora(pacote.atualizado)}` }),
      ]),
      criar('div', { class: 'acoes' }, [
        ...(destino.modo === 'pasta' ? [] : [botao('Abrir pasta', abrirPasta)]),
        botao('Exportar pacote (.zip)', (ev) => exportar(pacote, ev.currentTarget), {
          disabled: !itens.length,
          title: 'Um ZIP só com a pasta do pacote, o índice e uma pasta para cada matéria',
        }),
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
      ? criar('ol', { class: 'itens' }, itens.map((i) => linhaDoItem(pacote, i, mapa.get(`${pacote.id}|${i.sessaoId}`), comPrints.has(i.sessaoId))))
      : criar('p', { class: 'suave', textContent: 'Nenhum ZIP ainda. Escolha este pacote no popup antes de iniciar a captura.' }),
  ]);
}

async function mostrarEspaco() {
  try {
    const { usage } = await navigator.storage.estimate();
    $('espaco').textContent =
      usage >= 1e6
        ? `Os prints das matérias em pacotes ficam guardados na extensão, para “Ver prints” e “Exportar pacote” (${Math.round(usage / 1e6)} MB agora). Excluir um pacote da lista libera esse espaço nas próximas capturas.`
        : '';
  } catch {
    // sem estimativa: nada a mostrar
  }
}

let desenhando = null;
async function desenhar() {
  const { lista, escolha } = await lerPacotes();
  const [mapa, comPrints] = await Promise.all([situacoes(lista), guardadas(lista)]);
  $('vazio').hidden = lista.length > 0;
  $('lista').replaceChildren(...lista.map((p) => cartao(p, p.id === escolha, mapa, comPrints)));
  mostrarEspaco();
}
function redesenhar() {
  clearTimeout(desenhando);
  desenhando = setTimeout(desenhar, 150);
}

// ---------------------------------------------------------------- novo pacote

const atualizarDestinoNovo = () => {
  $('novo-destino').textContent = `Pasta: ${raiz()}/${pastaDoPacote($('novo-nome').value)}/`;
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
  // na pasta escolhida, a pasta principal do pacote já é criada agora
  let pasta = '';
  if (destino.modo === 'pasta' && (await acesso(destino.pasta, true)) === 'granted') {
    try {
      await gravarIndice(destino.pasta, pacote);
      pasta = ` A pasta “${destino.nome}/${pacote.pasta}” foi criada.`;
    } catch (e) {
      pasta = ` Não deu para criar a pasta agora (${explicarErro(e, destino)}); ela será criada no primeiro ZIP.`;
    }
  }
  avisar(
    ja
      ? `Já existia o pacote “${pacote.nome}”: ele foi escolhido para a próxima captura.${pasta}`
      : `Pacote “${pacote.nome}” criado e escolhido para a próxima captura.${pasta}`,
  );
  $('novo-nome').value = '';
  $('form-novo').hidden = true;
});

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === 'local' && mudancas.pacotes) redesenhar();
});
chrome.downloads.onChanged.addListener(redesenhar);
// arquivos apagados ou movidos no Explorador aparecem ao voltar para esta aba
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) redesenhar();
});

await carregarDestino();
await desenhar();
if (location.hash === '#destino') {
  $('destino').scrollIntoView({ block: 'start' });
  $('destino').classList.add('destacado');
  setTimeout(() => $('destino').classList.remove('destacado'), 4000);
}
