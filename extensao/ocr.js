// OCR dos prints, para quando a página não tem o texto da matéria (texto em
// imagem, embaralhado de propósito…). Usa o Tesseract.js com o modelo de
// português, tudo dentro da extensão: nada sai do computador.
// Só para páginas da extensão (o service worker não pode criar o "worker" do OCR).

const pasta = (arquivo) => chrome.runtime.getURL(`terceiros/tesseract/${arquivo}`);
let script = null;
let trabalhador = null;
let encerrar = null;

function carregarScript() {
  script ??= new Promise((pronto, falha) => {
    if (globalThis.Tesseract) return pronto();
    const el = document.createElement('script');
    el.src = pasta('tesseract.min.js');
    el.onload = () => pronto();
    el.onerror = () => falha(new Error('não foi possível carregar o OCR'));
    document.head.append(el);
  });
  return script;
}

async function obterTrabalhador() {
  clearTimeout(encerrar);
  await carregarScript();
  trabalhador ??= globalThis.Tesseract.createWorker('por', 1, {
    workerPath: pasta('worker.min.js'),
    corePath: pasta('tesseract-core-simd-lstm.wasm.js'),
    langPath: chrome.runtime.getURL('terceiros/tesseract'),
    workerBlobURL: false,
    cacheMethod: 'none',
  }).then(async (w) => {
    await w.setParameters({ preserve_interword_spaces: '1' });
    return w;
  });
  try {
    return await trabalhador;
  } catch (e) {
    trabalhador = null;
    throw e;
  }
}

// Libera a memória do OCR um tempo depois do último uso.
export function encerrarOcrDepois(ms = 60_000) {
  clearTimeout(encerrar);
  encerrar = setTimeout(async () => {
    const w = trabalhador;
    trabalhador = null;
    if (w) (await w.catch(() => null))?.terminate();
  }, ms);
}

// Lê um print. Devolve a largura da imagem e as linhas, com a posição em
// pixels da imagem e as palavras com a confiança do OCR (0 a 100).
export async function lerImagem(blob) {
  const w = await obterTrabalhador();
  const bitmap = await createImageBitmap(blob);
  // letra de tela é pequena para o OCR: ampliar ajuda a não errar
  const k = bitmap.width < 1800 ? 2 : 1;
  const tela = document.createElement('canvas');
  tela.width = Math.round(bitmap.width * k);
  tela.height = Math.round(bitmap.height * k);
  const g = tela.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, tela.width, tela.height);
  const largura = bitmap.width;
  bitmap.close();
  const { data } = await w.recognize(tela, {}, { blocks: true, text: false });
  const linhas = [];
  let paragrafo = 0;
  for (const bloco of data.blocks || []) {
    for (const par of bloco.paragraphs || []) {
      paragrafo++;
      for (const l of par.lines || []) {
        linhas.push({
          x: l.bbox.x0 / k,
          y: l.bbox.y0 / k,
          w: (l.bbox.x1 - l.bbox.x0) / k,
          h: (l.bbox.y1 - l.bbox.y0) / k,
          paragrafo,
          palavras: (l.words || []).map((p) => ({
            texto: p.text,
            confianca: p.confidence,
            x0: p.bbox.x0 / k,
            x1: p.bbox.x1 / k,
            simbolos: (p.symbols || []).map((s) => ({ texto: s.text, confianca: s.confidence, x0: s.bbox.x0 / k, x1: s.bbox.x1 / k })),
          })),
        });
      }
    }
  }
  return { largura, linhas };
}
