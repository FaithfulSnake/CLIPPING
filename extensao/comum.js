// Funções compartilhadas pela extensão e pelo script sem instalação.
// Sem APIs do Chrome aqui: este arquivo também é embutido no bookmarklet.

export const OPCOES_PADRAO = Object.freeze({
  sobreposicao: 10, // % da área visível repetida do print anterior
  espera: 700, // ms após cada rolagem, para a página terminar de carregar
  limite: 400, // máximo de prints (evita rolar para sempre em páginas infinitas)
  formato: 'png',
  esconderFixos: true,
  incluirInfo: true,
  baixarAuto: true,
});

export function normalizarOpcoes(o = {}) {
  const p = OPCOES_PADRAO;
  const numero = (v, min, max, padrao) => {
    if (v === '' || v == null) return padrao;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  const booleano = (v, padrao) => (typeof v === 'boolean' ? v : padrao);
  return {
    sobreposicao: numero(o.sobreposicao, 0, 50, p.sobreposicao),
    espera: numero(o.espera, 200, 10000, p.espera),
    limite: numero(o.limite, 1, 2000, p.limite),
    formato: o.formato === 'jpeg' ? 'jpeg' : 'png',
    esconderFixos: booleano(o.esconderFixos, p.esconderFixos),
    incluirInfo: booleano(o.incluirInfo, p.incluirInfo),
    baixarAuto: booleano(o.baixarAuto, p.baixarAuto),
  };
}

const NOMES_RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

// Transforma o título da página num nome de pasta/arquivo válido no Windows.
export function limparNome(nome, padrao = 'prints') {
  let s = String(nome ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = Array.from(s).slice(0, 100).join('').replace(/[. ]+$/, '').trim();
  if (!s) return padrao;
  return NOMES_RESERVADOS.test(s) ? `${s}_` : s;
}

// 001.png, 002.png… (mais dígitos se passar de 999 prints).
export function nomePrint(numero, total, formato) {
  const casas = Math.max(3, String(total).length);
  return `${String(numero).padStart(casas, '0')}.${formato === 'jpeg' ? 'jpg' : 'png'}`;
}

export function avisoMotivo(sessao) {
  switch (sessao.motivo) {
    case 'parado':
      return 'A captura foi interrompida antes do fim da página.';
    case 'limite':
      return `O limite de ${sessao.total} prints foi atingido antes do fim da página. Aumente o limite nas opções e capture de novo.`;
    case 'erro':
      return `A captura parou antes do fim da página: ${sessao.mensagemErro || 'erro desconhecido'}.`;
    default:
      return '';
  }
}

export function textoInfo(sessao) {
  const linhas = [
    `Página: ${sessao.titulo || '(sem título)'}`,
    `Endereço: ${sessao.url || ''}`,
    `Capturado em: ${new Date(sessao.data).toLocaleString('pt-BR')}`,
    `Quantidade de prints: ${sessao.total}`,
  ];
  if (sessao.largura) linhas.push(`Tamanho de cada print: ${sessao.largura} x ${sessao.altura} pixels`);
  linhas.push(
    '',
    `Cada print repete o final do anterior (cerca de ${sessao.sobreposicao}% da tela, mais a altura`,
    'de cabeçalhos/rodapés fixos), para que nenhum trecho da página fique de fora.',
  );
  const aviso = avisoMotivo(sessao);
  if (aviso) linhas.push('', `ATENÇÃO: ${aviso}`);
  return `﻿${linhas.join('\r\n')}\r\n`;
}

const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

// O laço de captura: rola do topo ao fim e tira um print por trecho.
//   pagina(metodo, arg)  chama a API de pagina.js (direto ou via extensão)
//   tirarPrint()         devolve um Blob com o print da tela (ou null = parar)
//   antesDoPrint()       espera a aba estar visível, etc.
//   aoCapturar(blob, n, porcento, medidas)
//   deveParar()          true quando o usuário pede para parar
// Devolve { total, motivo: 'fim'|'parado'|'limite'|'erro', erro }.
export async function capturarComRolagem({ opcoes, pagina, tirarPrint, antesDoPrint, aoCapturar, deveParar }) {
  let total = 0;
  let motivo = 'fim';
  let erro = null;
  let alvo = 0;
  let anterior = -1;
  try {
    await pagina('iniciar');
    for (;;) {
      if (deveParar()) {
        motivo = 'parado';
        break;
      }
      if (total >= opcoes.limite) {
        motivo = 'limite';
        break;
      }
      await pagina('rolarPara', alvo);
      await esperar(total === 0 ? opcoes.espera + 300 : opcoes.espera);
      if (antesDoPrint) await antesDoPrint();
      if (deveParar()) {
        motivo = 'parado';
        break;
      }
      const m = await pagina('prepararPrint', opcoes.esconderFixos && total > 0);
      if (total > 0 && m.topo <= anterior) break; // a página não rola mais
      const blob = await tirarPrint();
      if (!blob) {
        motivo = 'parado';
        break;
      }
      total++;
      const porcento = m.max > 0 ? Math.min(100, Math.round((m.topo / m.max) * 100)) : 100;
      await aoCapturar(blob, total, porcento, m);
      anterior = m.topo;

      if (m.topo >= m.max - 1) {
        // Chegou ao fim; dá tempo para conteúdo carregado sob demanda aumentar a página.
        await esperar(opcoes.espera);
        if ((await pagina('maximo')) <= m.topo + 1) break;
      }
      // Próxima posição: avança a área visível menos o que fica coberto por
      // cabeçalho/rodapé fixo e menos a sobreposição escolhida.
      const repetido = Math.round((m.altura * opcoes.sobreposicao) / 100);
      const passo = m.altura - m.ocupadoTopo - m.ocupadoBase - repetido;
      alvo = m.topo + Math.max(Math.round(m.altura * 0.2), passo);
    }
  } catch (e) {
    motivo = 'erro';
    erro = e;
  } finally {
    try {
      await pagina('finalizar');
    } catch {
      // a página pode ter sido fechada ou recarregada
    }
  }
  return { total, motivo, erro };
}
