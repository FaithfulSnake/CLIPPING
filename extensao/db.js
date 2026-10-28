// Guarda as capturas no IndexedDB da extensão, para a página de resultado
// montar o ZIP mesmo depois que o service worker for encerrado. Também guarda
// ajustes que não cabem no chrome.storage (como a pasta escolhida para os pacotes).

let conexao = null;

function abrir() {
  conexao ??= new Promise((pronto, falha) => {
    const req = indexedDB.open('clipping-prints', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessoes')) db.createObjectStore('sessoes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prints')) db.createObjectStore('prints'); // chave: [idDaSessao, indice]
      if (!db.objectStoreNames.contains('ajustes')) db.createObjectStore('ajustes');
    };
    req.onsuccess = () => {
      // outra página abrindo uma versão nova do banco: libera esta conexão
      req.result.onversionchange = () => {
        req.result.close();
        conexao = null;
      };
      pronto(req.result);
    };
    req.onerror = () => falha(req.error);
  });
  return conexao;
}

async function transacao(lojas, modo, operacao) {
  const db = await abrir();
  const tx = db.transaction(lojas, modo);
  const concluida = new Promise((pronto, falha) => {
    tx.oncomplete = pronto;
    tx.onerror = tx.onabort = () => falha(tx.error);
  });
  const req = operacao(tx);
  await concluida;
  if (req instanceof IDBRequest) return req.result;
  return typeof req === 'function' ? req() : undefined;
}

const printsDa = (id) => IDBKeyRange.bound([id, 0], [id, Infinity]);

export const salvarSessao = (sessao) => transacao('sessoes', 'readwrite', (tx) => tx.objectStore('sessoes').put(sessao));

export const lerSessao = (id) => transacao('sessoes', 'readonly', (tx) => tx.objectStore('sessoes').get(id));

export const lerSessoes = () => transacao('sessoes', 'readonly', (tx) => tx.objectStore('sessoes').getAll());

export const salvarPrint = (id, indice, blob) =>
  transacao('prints', 'readwrite', (tx) => tx.objectStore('prints').put(blob, [id, indice]));

export const lerPrints = (id) => transacao('prints', 'readonly', (tx) => tx.objectStore('prints').getAll(printsDa(id)));

export const apagarSessao = (id) =>
  transacao(['sessoes', 'prints'], 'readwrite', (tx) => {
    tx.objectStore('sessoes').delete(id);
    tx.objectStore('prints').delete(printsDa(id));
  });

// Muda alguns campos de uma captura já gravada.
export const atualizarSessao = (id, mudancas) =>
  transacao('sessoes', 'readwrite', (tx) => {
    const loja = tx.objectStore('sessoes');
    const req = loja.get(id);
    req.onsuccess = () => req.result && loja.put({ ...req.result, ...mudancas });
  });

// Pega a transcrição de uma captura para fazer (numa transação só: se a página
// de notícias estiver aberta em duas abas, só uma faz). Uma que ficou "fazendo"
// há mais de 5 minutos (aba fechada no meio) pode ser pega de novo.
export const pegarTranscricao = (id) =>
  transacao('sessoes', 'readwrite', (tx) => {
    const loja = tx.objectStore('sessoes');
    const req = loja.get(id);
    let pegou = false;
    req.onsuccess = () => {
      const s = req.result;
      const largada = s?.transcricao === 'fazendo' && Date.now() - (s.desde || 0) > 5 * 60_000;
      if (s && (s.transcricao === 'pendente' || largada)) {
        loja.put({ ...s, transcricao: 'fazendo', desde: Date.now() });
        pegou = true;
      }
    };
    return () => pegou;
  });

// Mantém só as capturas mais recentes, para não acumular espaço em disco.
// As que estão em pacote ficam guardadas (servem para exportar o pacote), e
// as que ainda esperam a transcrição também.
export async function apagarAntigas(manter) {
  const sessoes = await transacao('sessoes', 'readonly', (tx) => tx.objectStore('sessoes').getAll());
  const soltas = sessoes.filter((s) => !s.pacote && s.transcricao !== 'pendente' && s.transcricao !== 'fazendo').sort((a, b) => b.data - a.data);
  for (const s of soltas.slice(manter)) await apagarSessao(s.id);
}

export const lerAjuste = (chave) => transacao('ajustes', 'readonly', (tx) => tx.objectStore('ajustes').get(chave));

export const gravarAjuste = (chave, valor) => transacao('ajustes', 'readwrite', (tx) => tx.objectStore('ajustes').put(valor, chave));
