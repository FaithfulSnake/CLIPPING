import assert from 'node:assert/strict';
import { test } from 'node:test';

const { baixarArquivo, dentroDaPasta, explicarErro, nomeDoCaminho } = await import('../extensao/destino.js');

// chrome.downloads falso. Com "perguntar", o download fica parado e sem nome
// (como com a janela "Salvar como" aberta) até o usuário escolher uma pasta.
function usarDownloadsFalso({ perguntar }) {
  const ouvintes = new Set();
  const itens = new Map();
  let proximo = 1;
  globalThis.chrome = {
    downloads: {
      download: async ({ filename }) => {
        const id = proximo++;
        const item = { id, state: 'in_progress', filename: perguntar ? '' : `/home/fulano/Downloads/${filename}`, exists: true };
        itens.set(id, item);
        setTimeout(
          () => {
            item.state = 'complete';
            if (perguntar) item.filename = `/home/fulano/Documentos/${filename.split('/').pop()}`;
            for (const ouvir of ouvintes) ouvir({ id, state: { current: 'complete' } });
          },
          perguntar ? 1500 : 20,
        );
        return id;
      },
      search: async ({ id }) => (itens.has(id) ? [{ ...itens.get(id) }] : []),
      onChanged: { addListener: (f) => ouvintes.add(f), removeListener: (f) => ouvintes.delete(f) },
    },
  };
}

test('download direto na pasta do pacote, sem janela', async () => {
  usarDownloadsFalso({ perguntar: false });
  let avisos = 0;
  const r = await baixarArquivo(new Blob(['PK']), 'STF outubro/01 - Matéria.zip', { aoPerguntar: () => avisos++ });
  assert.equal(r.perguntou, false);
  assert.equal(avisos, 0);
  assert.equal(r.completo, '/home/fulano/Downloads/STF outubro/01 - Matéria.zip');
  assert.ok(dentroDaPasta(r.completo, 'STF outubro'));
});

test('percebe quando o Chrome abre a janela "Salvar como"', async () => {
  usarDownloadsFalso({ perguntar: true });
  let avisos = 0;
  const r = await baixarArquivo(new Blob(['PK']), 'STF outubro/01 - Matéria.zip', { aoPerguntar: () => avisos++ });
  assert.equal(r.perguntou, true);
  assert.equal(avisos, 1, 'avisa enquanto a janela está aberta');
  assert.equal(r.completo, '/home/fulano/Documentos/01 - Matéria.zip');
  assert.equal(dentroDaPasta(r.completo, 'STF outubro'), false, 'salvo fora da pasta do pacote');
});

test('caminhos do Windows e do Mac', () => {
  assert.ok(dentroDaPasta('C:\\Users\\Ana\\Downloads\\STF outubro\\01 - x.zip', 'STF outubro'));
  assert.equal(dentroDaPasta('C:\\Users\\Ana\\Downloads\\01 - x.zip', 'STF outubro'), false);
  assert.equal(nomeDoCaminho('C:\\Users\\Ana\\Downloads\\STF\\01 - x (1).zip'), '01 - x (1).zip');
  assert.equal(nomeDoCaminho('/Users/ana/Downloads/STF/02 - y.zip'), '02 - y.zip');
  assert.equal(nomeDoCaminho(''), '');
});

test('erros de gravação em português', () => {
  const erro = (name) => Object.assign(new Error('x'), { name });
  assert.match(explicarErro(erro('NotFoundError'), { nome: 'Pacotes' }), /pasta “Pacotes” não foi encontrada/);
  assert.match(explicarErro(erro('NotAllowedError')), /permissão/);
  assert.match(explicarErro(erro('QuotaExceededError')), /espaço/);
  assert.equal(explicarErro(new Error('outro')), 'outro');
});
