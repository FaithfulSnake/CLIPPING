import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPCOES_PADRAO, capturarComRolagem, limparNome, nomePrint, normalizarOpcoes, textoInfo } from '../extensao/comum.js';

test('limparNome gera nomes válidos no Windows', () => {
  assert.equal(limparNome('Diário Oficial: edição 12/2026 | Seção 1'), 'Diário Oficial edição 12 2026 Seção 1');
  assert.equal(limparNome('  título com ponto final.  '), 'título com ponto final');
  assert.equal(limparNome('CON'), 'CON_');
  assert.equal(limparNome(''), 'prints');
  assert.equal(limparNome(undefined), 'prints');
  assert.equal(limparNome('a'.repeat(300)).length, 100);
  assert.equal(Array.from(limparNome('😀'.repeat(150))).length, 100, 'não corta emoji pela metade');
});

test('nomePrint numera com zeros à esquerda na ordem', () => {
  assert.equal(nomePrint(1, 12, 'png'), '001.png');
  assert.equal(nomePrint(12, 12, 'jpeg'), '012.jpg');
  assert.equal(nomePrint(7, 1500, 'png'), '0007.png');
});

test('normalizarOpcoes aplica limites e padrões', () => {
  assert.deepEqual(normalizarOpcoes(), { ...OPCOES_PADRAO });
  const o = normalizarOpcoes({ sobreposicao: '90', espera: '', limite: '0', formato: 'gif', esconderFixos: false });
  assert.equal(o.sobreposicao, 50);
  assert.equal(o.espera, OPCOES_PADRAO.espera);
  assert.equal(o.limite, 1);
  assert.equal(o.formato, 'png');
  assert.equal(o.esconderFixos, false);
});

test('textoInfo inclui endereço, quantidade e aviso de captura incompleta', () => {
  const t = textoInfo({ titulo: 'Pág', url: 'https://x.y', data: 0, total: 3, sobreposicao: 10, motivo: 'limite' });
  assert.match(t, /Endereço: https:\/\/x\.y\r\n/);
  assert.match(t, /Quantidade de prints: 3/);
  assert.match(t, /ATENÇÃO: O limite de 3 prints/);
});

// Simula uma página de 3000px com área visível de 800px e cabeçalho fixo de 100px.
function paginaFalsa({ altura = 800, total = 3000, cabecalho = 100, cresceAoFim = 0 } = {}) {
  let topo = 0;
  let max = total - altura;
  let cresceu = false;
  const chamadas = [];
  const pagina = async (metodo, arg) => {
    chamadas.push(metodo);
    if (metodo === 'rolarPara') topo = Math.max(0, Math.min(max, arg));
    if (metodo === 'maximo') {
      if (cresceAoFim && !cresceu) {
        cresceu = true;
        max += cresceAoFim;
      }
      return max;
    }
    if (metodo === 'prepararPrint') return { topo, max, altura, ocupadoTopo: cabecalho, ocupadoBase: 0 };
    return undefined;
  };
  return { pagina, chamadas, topoAtual: () => topo };
}

const rapido = { ...OPCOES_PADRAO, espera: 0 };

test('capturarComRolagem cobre a página inteira sem deixar trecho de fora', async () => {
  const p = paginaFalsa();
  const medidas = [];
  const r = await capturarComRolagem({
    opcoes: rapido,
    pagina: p.pagina,
    tirarPrint: async () => 'print',
    aoCapturar: (_b, _n, _pct, m) => medidas.push(m),
    deveParar: () => false,
  });
  assert.equal(r.motivo, 'fim');
  assert.equal(r.total, medidas.length);
  // Cada trecho só é "visto" fora do cabeçalho fixo: [topo + 100, topo + 800].
  let coberto = 0;
  for (const [i, m] of medidas.entries()) {
    const inicio = i === 0 ? m.topo : m.topo + m.ocupadoTopo;
    assert.ok(inicio <= coberto, `buraco antes do print ${i + 1}`);
    coberto = Math.max(coberto, m.topo + m.altura);
  }
  assert.equal(coberto, 3000);
  assert.equal(p.chamadas.at(-1), 'finalizar');
});

test('capturarComRolagem continua quando a página cresce ao chegar no fim', async () => {
  const p = paginaFalsa({ cresceAoFim: 1500 });
  const r = await capturarComRolagem({
    opcoes: rapido,
    pagina: p.pagina,
    tirarPrint: async () => 'print',
    aoCapturar: () => {},
    deveParar: () => false,
  });
  assert.equal(r.motivo, 'fim');
  assert.equal(p.topoAtual(), 3700);
});

test('capturarComRolagem respeita limite, pedido de parada e erros', async () => {
  const limite = await capturarComRolagem({
    opcoes: { ...rapido, limite: 2 },
    pagina: paginaFalsa().pagina,
    tirarPrint: async () => 'print',
    aoCapturar: () => {},
    deveParar: () => false,
  });
  assert.deepEqual([limite.total, limite.motivo], [2, 'limite']);

  let n = 0;
  const parado = await capturarComRolagem({
    opcoes: rapido,
    pagina: paginaFalsa().pagina,
    tirarPrint: async () => 'print',
    aoCapturar: () => n++,
    deveParar: () => n >= 1,
  });
  assert.deepEqual([parado.total, parado.motivo], [1, 'parado']);

  const p = paginaFalsa();
  const comErro = await capturarComRolagem({
    opcoes: rapido,
    pagina: p.pagina,
    tirarPrint: async () => {
      throw new Error('falhou');
    },
    aoCapturar: () => {},
    deveParar: () => false,
  });
  assert.equal(comErro.motivo, 'erro');
  assert.equal(comErro.erro.message, 'falhou');
  assert.equal(p.chamadas.at(-1), 'finalizar', 'restaura a página mesmo com erro');
});

test('página sem rolagem gera um único print', async () => {
  const r = await capturarComRolagem({
    opcoes: rapido,
    pagina: paginaFalsa({ total: 800 }).pagina,
    tirarPrint: async () => 'print',
    aoCapturar: () => {},
    deveParar: () => false,
  });
  assert.deepEqual([r.total, r.motivo], [1, 'fim']);
});
