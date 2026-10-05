// Teste de ponta a ponta: abre o Chromium com a extensão, captura as páginas
// de testes/paginas e confere o ZIP baixado. Também testa a versão sem
// instalar (script colado na página). Uso: npm run e2e
// Variável SALVAR_PRINTS=pasta guarda os ZIPs para conferir os prints à mão.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { carregarPlaywright } = require('../ferramentas/playwright.cjs');

const RAIZ = path.join(__dirname, '..');
const LARGURA = 1280;
const ALTURA = 720;

function servirPaginas() {
  const pasta = path.join(__dirname, 'paginas');
  const servidor = http.createServer((req, res) => {
    const arquivo = path.join(pasta, path.basename(new URL(req.url, 'http://x').pathname));
    if (!fs.existsSync(arquivo)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fs.readFileSync(arquivo));
  });
  return new Promise((pronto) => servidor.listen(0, '127.0.0.1', () => pronto(servidor)));
}

// Cópia da extensão com permissão em todos os sites: no teste automático não
// há clique no ícone para conceder o "activeTab".
function extensaoDeTeste(tmp) {
  const destino = path.join(tmp, 'extensao');
  fs.cpSync(path.join(RAIZ, 'extensao'), destino, { recursive: true });
  const manifesto = JSON.parse(fs.readFileSync(path.join(destino, 'manifest.json'), 'utf8'));
  manifesto.host_permissions = ['<all_urls>'];
  fs.writeFileSync(path.join(destino, 'manifest.json'), JSON.stringify(manifesto, null, 2));
  return destino;
}

function lerZip(arquivo) {
  const saida = execFileSync(
    'python3',
    [
      '-c',
      `import json, struct, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
itens = []
for i in z.infolist():
    dados = z.read(i)
    tam = list(struct.unpack('>II', dados[16:24])) if dados[:8] == b'\\x89PNG\\r\\n\\x1a\\n' else None
    texto = dados.decode('utf-8-sig') if i.filename.endswith('.txt') else None
    itens.append({'nome': i.filename, 'tamanho': tam, 'texto': texto})
print(json.dumps(itens))`,
      arquivo,
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(saida);
}

function guardar(arquivo, nome) {
  if (!process.env.SALVAR_PRINTS) return;
  fs.mkdirSync(process.env.SALVAR_PRINTS, { recursive: true });
  fs.copyFileSync(arquivo, path.join(process.env.SALVAR_PRINTS, nome));
}

// Confere que cada trecho da área que rola apareceu sem estar coberto por
// cabeçalho/rodapé fixo em pelo menos um print.
function conferirCobertura(medidas, alturaTotal) {
  let coberto = 0;
  for (const [i, m] of medidas.entries()) {
    const inicio = i === 0 ? 0 : m.topo + m.ocupadoTopo;
    assert.ok(inicio <= coberto, `trecho ${coberto}..${inicio}px ficou de fora (print ${i + 1})`);
    const fim = i === medidas.length - 1 ? m.topo + m.altura : m.topo + m.altura - m.ocupadoBase;
    coberto = Math.max(coberto, fim);
  }
  assert.ok(coberto >= alturaTotal - 1, `cobriu ${coberto}px de ${alturaTotal}px`);
}

async function main() {
  const { chromium } = carregarPlaywright();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clipping-e2e-'));
  const servidor = await servirPaginas();
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const extensao = extensaoDeTeste(tmp);

  const contexto = await chromium.launchPersistentContext(path.join(tmp, 'perfil'), {
    channel: 'chromium',
    headless: !process.env.VISIVEL,
    // Sem viewport emulada: o print tem o tamanho real da janela, como no uso normal.
    viewport: null,
    acceptDownloads: true,
    // Locale UTF-8: no Linux sem ele o Chromium troca nomes com acento por "download".
    env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    args: [
      `--disable-extensions-except=${extensao}`,
      `--load-extension=${extensao}`,
      `--window-size=${LARGURA},${ALTURA}`,
      '--auto-accept-this-tab-capture',
    ],
  });
  const falhas = [];
  try {
    const sw = contexto.serviceWorkers()[0] || (await contexto.waitForEvent('serviceworker'));
    const idExtensao = new URL(sw.url()).host;
    // As APIs chrome.* aparecem no service worker um instante depois de ele subir.
    while (!(await sw.evaluate(() => Boolean(globalThis.chrome?.windows)))) await new Promise((r) => setTimeout(r, 100));

    // Página de controle numa janela separada: a aba capturada precisa
    // continuar ativa na janela dela.
    const [controle] = await Promise.all([
      contexto.waitForEvent('page', (p) => p.url().includes('popup.html')),
      sw.evaluate(() => chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), type: 'normal' })),
    ]);
    await controle.waitForLoadState();

    async function capturar(arquivo, opcoes = {}) {
      const pagina = await contexto.newPage();
      await pagina.goto(`${base}/${arquivo}`);
      await pagina.waitForTimeout(300);
      const antes = await pagina.evaluate(() => {
        const leitor = document.getElementById('leitor');
        return leitor ? leitor.scrollTop : scrollY;
      });
      const tela = await pagina.evaluate(() => [innerWidth * devicePixelRatio, innerHeight * devicePixelRatio]);
      const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url })).at(-1).id, pagina.url());

      const esperaResultado = contexto.waitForEvent('page', {
        predicate: (p) => p.url().startsWith(`chrome-extension://${idExtensao}/resultado.html`),
        timeout: 120_000,
      });
      const resposta = await controle.evaluate(
        ({ tabId, opcoes }) => chrome.runtime.sendMessage({ tipo: 'iniciar', tabId, pasta: 'Transcrição: teste/1', opcoes }),
        { tabId, opcoes: { espera: 300, ...opcoes } },
      );
      assert.deepEqual(resposta, { ok: true });
      const resultado = await esperaResultado;
      const download = await resultado.waitForEvent('download', { timeout: 60_000 });
      const zip = path.join(tmp, `${arquivo}.zip`);
      await download.saveAs(zip);

      const sessao = await resultado.evaluate(async () => {
        const { lerSessao } = await import('./db.js');
        return lerSessao(new URLSearchParams(location.search).get('sessao'));
      });
      const depois = await pagina.evaluate(() => {
        const leitor = document.getElementById('leitor');
        const cabecalho = document.querySelector('header, h2');
        return {
          topo: leitor ? leitor.scrollTop : scrollY,
          estilosSobrando: [...document.querySelectorAll('[style]')].map((e) => e.getAttribute('style')).filter(Boolean),
          cabecalhoVisivel: cabecalho ? getComputedStyle(cabecalho).opacity : '1',
        };
      });
      await resultado.close();
      await pagina.close();
      return { zip, nomeBaixado: download.suggestedFilename(), itens: lerZip(zip), sessao, antes, depois, tela };
    }

    const casos = [
      {
        nome: 'artigo com cabeçalho grudado, rodapé fixo e carregamento ao rolar',
        arquivo: 'artigo.html',
        alturaTotal: 80 + 200 * 40,
        conferir: (r) => assert.ok(r.sessao.medidas.at(-1).max > 150 * 40, 'carregou as linhas extras do fim'),
      },
      {
        nome: 'mesmo artigo sem esconder elementos fixos',
        arquivo: 'artigo.html',
        opcoes: { esconderFixos: false, formato: 'jpeg', incluirInfo: false },
        alturaTotal: 80 + 200 * 40,
      },
      { nome: 'painel interno com rolagem própria', arquivo: 'painel.html', alturaTotal: 48 + 120 * 36 },
      { nome: 'página dentro de iframe', arquivo: 'quadro.html', alturaTotal: 80 + 200 * 40 },
      { nome: 'página curta', arquivo: 'curta.html', total: 1 },
    ];

    for (const caso of casos) {
      try {
        const r = await capturar(caso.arquivo, caso.opcoes);
        guardar(r.zip, `${caso.arquivo.replace('.html', '')}${caso.opcoes ? '-sem-esconder' : ''}.zip`);
        const ext = caso.opcoes?.formato === 'jpeg' ? 'jpg' : 'png';
        const prints = r.itens.filter((i) => i.nome.endsWith(`.${ext}`));
        assert.equal(r.nomeBaixado, 'Transcrição teste 1.zip');
        assert.equal(r.itens[0].nome, 'Transcrição teste 1/');
        assert.deepEqual(
          prints.map((p) => p.nome),
          prints.map((_, i) => `Transcrição teste 1/${String(i + 1).padStart(3, '0')}.${ext}`),
        );
        assert.equal(prints.length, r.sessao.total);
        if (caso.total) assert.equal(prints.length, caso.total);
        if (ext === 'png') for (const p of prints) assert.deepEqual(p.tamanho, r.tela, 'print do tamanho da área visível');
        const info = r.itens.find((i) => i.nome.endsWith('info.txt'));
        if (caso.opcoes?.incluirInfo === false) assert.equal(info, undefined);
        else assert.match(info.texto, new RegExp(`Quantidade de prints: ${prints.length}`));
        assert.equal(r.sessao.motivo, 'fim');
        if (caso.alturaTotal) conferirCobertura(r.sessao.medidas, caso.alturaTotal);
        assert.equal(r.depois.topo, r.antes, 'voltou para a posição original');
        assert.deepEqual(r.depois.estilosSobrando, [], 'removeu os estilos temporários');
        assert.equal(r.depois.cabecalhoVisivel, '1', 'cabeçalho visível de novo');
        caso.conferir?.(r);
        console.log(`ok   ${caso.nome}: ${prints.length} prints`);
      } catch (e) {
        falhas.push(caso.nome);
        console.log(`FALHA ${caso.nome}\n${e.stack}`);
      }
    }

    // Versão sem instalar: script colado na página + compartilhamento de aba.
    try {
      const pagina = await contexto.newPage();
      await pagina.goto(`${base}/artigo.html`);
      await pagina.addScriptTag({ path: path.join(RAIZ, 'script', 'captura-sem-instalar.js') });
      const painel = pagina.locator('#clipping-prints-painel');
      await painel.locator('input[type=text]').fill('Sem instalar');
      await painel.locator('input[type=number]').nth(1).fill('300');
      const [download] = await Promise.all([
        pagina.waitForEvent('download', { timeout: 120_000 }),
        painel.getByRole('button', { name: 'Iniciar captura' }).click(),
      ]);
      const zip = path.join(tmp, 'sem-instalar.zip');
      await download.saveAs(zip);
      guardar(zip, 'sem-instalar.zip');
      const itens = lerZip(zip);
      const prints = itens.filter((i) => i.nome.endsWith('.png'));
      assert.equal(download.suggestedFilename(), 'Sem instalar.zip');
      assert.ok(prints.length >= 10, `${prints.length} prints`);
      assert.equal(prints[0].nome, 'Sem instalar/001.png');
      assert.equal(prints[0].tamanho[0], await pagina.evaluate(() => innerWidth * devicePixelRatio));
      assert.match(await painel.getByRole('status').textContent(), /Pronto! \d+ prints/);
      console.log(`ok   versão sem instalar: ${prints.length} prints de ${prints[0].tamanho.join('x')}`);
      await pagina.close();

      // O favorito (versão compactada) abre o painel; clicar de novo fecha.
      const favorito = await contexto.newPage();
      await favorito.goto(`${base}/painel.html`);
      const codigo = decodeURIComponent(fs.readFileSync(path.join(RAIZ, 'script', 'bookmarklet.txt'), 'utf8').trim().slice('javascript:'.length));
      await favorito.evaluate(codigo);
      assert.equal(await favorito.locator('#clipping-prints-painel').getByRole('button', { name: 'Iniciar captura' }).count(), 1);
      await favorito.evaluate(codigo);
      assert.equal(await favorito.locator('#clipping-prints-painel').count(), 0);
      console.log('ok   favorito abre e fecha o painel');
      await favorito.close();
    } catch (e) {
      falhas.push('versão sem instalar');
      console.log(`FALHA versão sem instalar\n${e.stack}`);
    }
  } finally {
    await contexto.close();
    servidor.close();
  }
  if (falhas.length) {
    console.log(`\n${falhas.length} falha(s): ${falhas.join('; ')}`);
    process.exit(1);
  }
  console.log('\ntodos os testes de ponta a ponta passaram');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
