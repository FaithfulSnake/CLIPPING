// Guarda as capturas no IndexedDB da extensão, para a página de resultado
// montar o ZIP mesmo depois que o service worker for encerrado.

let conexao = null;

function abrir() {
  conexao ??= new Promise((pronto, falha) => {
    const req = indexedDB.open('clipping-prints', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('sessoes', { keyPath: 'id' });
      req.result.createObjectStore('prints'); // chave: [idDaSessao, indice]
    };
    req.onsuccess = () => pronto(req.result);
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
  return req instanceof IDBRequest ? req.result : undefined;
}

const printsDa = (id) => IDBKeyRange.bound([id, 0], [id, Infinity]);

export const salvarSessao = (sessao) => transacao('sessoes', 'readwrite', (tx) => tx.objectStore('sessoes').put(sessao));

export const lerSessao = (id) => transacao('sessoes', 'readonly', (tx) => tx.objectStore('sessoes').get(id));

export const salvarPrint = (id, indice, blob) =>
  transacao('prints', 'readwrite', (tx) => tx.objectStore('prints').put(blob, [id, indice]));

export const lerPrints = (id) => transacao('prints', 'readonly', (tx) => tx.objectStore('prints').getAll(printsDa(id)));

export const apagarSessao = (id) =>
  transacao(['sessoes', 'prints'], 'readwrite', (tx) => {
    tx.objectStore('sessoes').delete(id);
    tx.objectStore('prints').delete(printsDa(id));
  });

export const marcarBaixado = (id) =>
  transacao('sessoes', 'readwrite', (tx) => {
    const loja = tx.objectStore('sessoes');
    const req = loja.get(id);
    req.onsuccess = () => req.result && loja.put({ ...req.result, baixado: true });
  });

// Mantém só as capturas mais recentes, para não acumular espaço em disco.
export async function apagarAntigas(manter) {
  const sessoes = await transacao('sessoes', 'readonly', (tx) => tx.objectStore('sessoes').getAll());
  sessoes.sort((a, b) => b.data - a.data);
  for (const s of sessoes.slice(manter)) await apagarSessao(s.id);
}
