// Gera os PNGs dos ícones a partir de extensao/icones/icone.svg.
// Uso: node ferramentas/gerar-icones.cjs (precisa do Playwright instalado).
const fs = require('node:fs');
const path = require('node:path');
const { carregarPlaywright } = require('./playwright.cjs');

(async () => {
  const { chromium } = carregarPlaywright();
  const pasta = path.join(__dirname, '..', 'extensao', 'icones');
  const svg = fs.readFileSync(path.join(pasta, 'icone.svg'), 'utf8');
  const navegador = await chromium.launch();
  for (const tamanho of [16, 32, 48, 128]) {
    const pagina = await navegador.newPage({ viewport: { width: tamanho, height: tamanho } });
    await pagina.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${tamanho}px;height:${tamanho}px}</style>${svg}`,
    );
    await pagina.screenshot({ path: path.join(pasta, `icone-${tamanho}.png`), omitBackground: true });
    await pagina.close();
  }
  await navegador.close();
})();
