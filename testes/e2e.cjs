// Teste de ponta a ponta: abre o Chromium com a extensão, captura as páginas
// de testes/paginas e confere os ZIPs salvos na pasta Downloads (com as
// pastas dos pacotes), a ferramenta de notícias e a versão sem instalar.
// Uso: npm run e2e. Variável SALVAR_PRINTS=pasta guarda os ZIPs para conferir à mão;
// SO=nome1,nome2 roda só alguns blocos.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { carregarPlaywright } = require('../ferramentas/playwright.cjs');

const RAIZ = path.join(__dirname, '..');
// SO=pacotes,seletor roda só os blocos com esses nomes.
const SO = process.env.SO ? process.env.SO.split(',') : null;
const rodar = (nome) => !SO || SO.some((s) => nome.includes(s.trim()));
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

// Pasta Downloads do perfil de teste: os downloads acontecem como no uso
// normal (nome real, pastas dos pacotes), sem a interceptação do Playwright.
function prepararPerfil(tmp) {
  const perfil = path.join(tmp, 'perfil');
  const downloads = path.join(tmp, 'downloads');
  fs.mkdirSync(path.join(perfil, 'Default'), { recursive: true });
  fs.mkdirSync(downloads);
  fs.writeFileSync(
    path.join(perfil, 'Default', 'Preferences'),
    JSON.stringify({
      download: { default_directory: downloads, prompt_for_download: false, directory_upgrade: true },
      profile: { default_content_setting_values: { automatic_downloads: 1 } },
    }),
  );
  return { perfil, downloads };
}

function listar(pasta, prefixo = '') {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listar(path.join(pasta, e.name), `${prefixo}${e.name}/`) : [`${prefixo}${e.name}`],
  );
}

async function main() {
  const { chromium } = carregarPlaywright();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clipping-e2e-'));
  const servidor = await servirPaginas();
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const extensao = extensaoDeTeste(tmp);
  const { perfil, downloads } = prepararPerfil(tmp);

  const limparDownloads = () => {
    fs.rmSync(downloads, { recursive: true, force: true });
    fs.mkdirSync(downloads);
  };
  // Espera o arquivo aparecer em Downloads (com o download terminado).
  const esperarArquivo = async (relativo, tempo = 60_000) => {
    const alvo = path.join(downloads, relativo);
    let tamanho = -1;
    for (const fim = Date.now() + tempo; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
      if (!fs.existsSync(alvo)) continue;
      const atual = fs.statSync(alvo).size;
      if (atual > 0 && atual === tamanho) return alvo;
      tamanho = atual;
    }
    throw new Error(`não apareceu em Downloads: ${relativo} (tem: ${listar(downloads).join(', ') || 'nada'})`);
  };
  const esperarSumir = async (relativo, tempo = 20_000) => {
    for (const fim = Date.now() + tempo; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
      if (!fs.existsSync(path.join(downloads, relativo))) return;
    }
    throw new Error(`continua em Downloads: ${relativo}`);
  };

  const contexto = await chromium.launchPersistentContext(perfil, {
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
    const cdp = await contexto.newCDPSession(contexto.pages()[0] || (await contexto.newPage()));
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });

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
        { tabId, opcoes: { espera: 300, resultado: 'zip', ...opcoes } },
      );
      assert.deepEqual(resposta, { ok: true });
      const resultado = await esperaResultado;
      const zip = path.join(tmp, `${arquivo}.zip`);
      fs.copyFileSync(await esperarArquivo('Transcrição teste 1.zip'), zip);
      await resultado.waitForFunction(() => document.getElementById('destino-texto').textContent.startsWith('Salvo em'));
      const destino = await resultado.textContent('#destino-texto');

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
      return { zip, destino, itens: lerZip(zip), sessao, antes, depois, tela };
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

    for (const caso of casos.filter(() => rodar('capturas'))) {
      try {
        limparDownloads();
        const r = await capturar(caso.arquivo, caso.opcoes);
        guardar(r.zip, `${caso.arquivo.replace('.html', '')}${caso.opcoes ? '-sem-esconder' : ''}.zip`);
        const ext = caso.opcoes?.formato === 'jpeg' ? 'jpg' : 'png';
        const prints = r.itens.filter((i) => i.nome.endsWith(`.${ext}`));
        assert.equal(r.destino, 'Salvo em Downloads/Transcrição teste 1.zip');
        assert.deepEqual(listar(downloads), ['Transcrição teste 1.zip']);
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

    // O popup de verdade abre sobre a aba da página; aqui ele abre numa janela
    // própria, então a "aba ativa" que ele consulta é trocada pela da página.
    const erros = [];
    const popupPara = async (tabId) => {
      const [popup] = await Promise.all([
        contexto.waitForEvent('page', (p) => p.url() === 'about:blank'),
        sw.evaluate(() => chrome.windows.create({ url: 'about:blank' })),
      ]);
      popup.on('pageerror', (e) => erros.push(e.message));
      await popup.addInitScript((id) => {
        if (!location.pathname.endsWith('/popup.html')) return;
        const consultar = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = (filtro, ...resto) =>
          filtro?.active && filtro?.currentWindow ? chrome.tabs.get(id).then((aba) => [aba]) : consultar(filtro, ...resto);
      }, tabId);
      await popup.goto(`chrome-extension://${idExtensao}/popup.html`);
      await popup.waitForFunction(() => document.querySelectorAll('input[name="pacote"]').length >= 2);
      return popup;
    };
    const abrirAlvo = async (arquivo) => {
      const pagina = await contexto.newPage();
      pagina.on('pageerror', (e) => erros.push(e.message));
      await pagina.goto(`${base}/${arquivo}`);
      const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url })).at(-1).id, pagina.url());
      return { pagina, tabId };
    };
    const esperarResultado = () => contexto.waitForEvent('page', { predicate: (p) => p.url().includes('/resultado.html'), timeout: 120_000 });
    const iniciarPeloPopup = async (popup) => {
      const [resultado] = await Promise.all([esperarResultado(), popup.click('#iniciar')]);
      resultado.on('pageerror', (e) => erros.push(e.message));
      return resultado;
    };
    const dadosDaSessao = (resultado) =>
      resultado.evaluate(async () => {
        const { lerSessao } = await import('./db.js');
        return lerSessao(new URLSearchParams(location.search).get('sessao'));
      });
    // Espera um arquivo de texto em Downloads ficar com o conteúdo esperado.
    const esperarTexto = async (relativo, padrao, tempo = 20_000) => {
      const alvo = path.join(downloads, relativo);
      let texto = '';
      for (const fim = Date.now() + tempo; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
        texto = fs.existsSync(alvo) ? fs.readFileSync(alvo, 'utf8').replace(/^﻿/, '') : '';
        if (padrao.test(texto)) return texto;
      }
      throw new Error(`${relativo} não ficou como esperado (${padrao}): ${texto || 'não existe'}`);
    };
    const dpr = await controle.evaluate(() => devicePixelRatio);

    // Configurações: o que muda na tela vale para a captura, mas só fica gravado ao clicar em Salvar.
    if (rodar('configurações')) try {
      const alvo = await abrirAlvo('curta.html');
      const popup = await popupPara(alvo.tabId);
      const marcado = (nome) => popup.$eval(`input[name="${nome}"]:checked`, (r) => r.value);
      const gravadas = () => popup.evaluate(async () => (await chrome.storage.local.get('opcoes')).opcoes ?? null);
      assert.equal(await marcado('areaRolagem'), 'auto', 'rolagem automática por padrão');
      assert.equal(await marcado('recorte'), 'tela', 'tela inteira por padrão');
      assert.equal(await marcado('resultado'), 'email', 'o padrão é o texto no e-mail de notícias');
      assert.equal(await marcado('leitura'), 'auto');
      assert.equal(await popup.isVisible('#modo-email'), true);
      assert.equal(await popup.isHidden('#campo-pacote'), true, 'pacote é só do ZIP');
      assert.equal(await popup.isDisabled('#salvar'), true);
      await popup.click('#configuracoes summary');
      await popup.check('input[name="recorte"][value="area"]');
      assert.equal(await popup.isVisible('#nao-salvas'), true);
      assert.equal(await popup.isEnabled('#salvar'), true);
      assert.match(await popup.textContent('#situacao-config'), /não salvas/);
      await popup.reload();
      await popup.waitForFunction(() => document.querySelectorAll('input[name="pacote"]').length >= 2);
      assert.equal(await marcado('recorte'), 'tela', 'sem Salvar, nada é gravado');
      assert.equal(await gravadas(), null);

      await popup.click('#configuracoes summary');
      await popup.check('input[name="areaRolagem"][value="escolher"]');
      assert.match(await popup.textContent('#dica-escolha'), /clicar na parte que deve rolar/);
      await popup.fill('#espera', '450');
      await popup.click('#salvar');
      assert.equal(await popup.textContent('#situacao-config'), 'Configurações salvas.');
      assert.equal(await popup.isHidden('#nao-salvas'), true);
      assert.equal(await popup.isDisabled('#salvar'), true);
      assert.deepEqual([(await gravadas()).areaRolagem, (await gravadas()).espera, (await gravadas()).recorte], ['escolher', 450, 'tela']);
      await popup.reload();
      await popup.waitForFunction(() => document.querySelectorAll('input[name="pacote"]').length >= 2);
      assert.equal(await marcado('areaRolagem'), 'escolher');

      // "Voltar às opções padrão" só põe o padrão na tela; o Salvar grava.
      await popup.click('#configuracoes summary');
      await popup.click('#restaurar');
      assert.equal(await marcado('areaRolagem'), 'auto');
      assert.equal(await popup.isVisible('#nao-salvas'), true);
      assert.equal((await gravadas()).areaRolagem, 'escolher');
      await popup.click('#salvar');
      assert.deepEqual([(await gravadas()).areaRolagem, (await gravadas()).espera, (await gravadas()).recorte, (await gravadas()).resultado], ['auto', 700, 'tela', 'email']);
      assert.deepEqual(erros, []);
      console.log('ok   configurações: novas opções desligadas por padrão e gravadas só com Salvar');
      await popup.close();
      await alvo.pagina.close();
    } catch (e) {
      falhas.push('configurações');
      console.log(`FALHA configurações\n${e.stack}`);
    }

    // Seletor: clicar na coluna da direita (que rola sozinha) e capturar só ela.
    if (rodar('seletor')) try {
      limparDownloads();
      const alvo = await abrirAlvo('lateral.html');
      const resposta = await controle.evaluate(
        (tabId) => chrome.runtime.sendMessage({ tipo: 'iniciar', tabId, pasta: 'Coluna lateral', opcoes: { espera: 300, resultado: 'zip', areaRolagem: 'escolher', recorte: 'area' } }),
        alvo.tabId,
      );
      assert.deepEqual(resposta, { ok: true, escolhendo: true });
      await alvo.pagina.bringToFront();
      await alvo.pagina.waitForSelector('#clipping-seletor');
      const coluna = await alvo.pagina.evaluate(() => {
        const t = document.getElementById('texto');
        return { largura: t.clientWidth, altura: t.clientHeight, total: t.scrollHeight };
      });
      await alvo.pagina.mouse.move(1000, 400);
      const [resultado] = await Promise.all([esperarResultado(), alvo.pagina.mouse.click(1000, 400)]);
      const zip = await esperarArquivo('Coluna lateral.zip');
      guardar(zip, 'coluna-lateral.zip');
      const itens = lerZip(zip);
      const prints = itens.filter((i) => i.nome.endsWith('.png'));
      const sessao = await dadosDaSessao(resultado);
      assert.ok(prints.length >= 5, `${prints.length} prints`);
      assert.equal(prints.length, sessao.total);
      for (const p of prints) {
        assert.ok(Math.abs(p.tamanho[0] - coluna.largura * dpr) <= 1 && Math.abs(p.tamanho[1] - coluna.altura * dpr) <= 1, `print ${p.tamanho} do tamanho da coluna`);
      }
      conferirCobertura(sessao.medidas, coluna.total);
      assert.equal(sessao.motivo, 'fim');
      assert.match(itens.find((i) => i.nome.endsWith('info.txt')).texto, /Área do print: só uma parte da tela/);
      const depois = await alvo.pagina.evaluate(() => ({
        rolagens: [document.getElementById('indice').scrollTop, document.getElementById('texto').scrollTop],
        seletor: document.querySelectorAll('#clipping-seletor').length,
      }));
      assert.deepEqual(depois, { rolagens: [0, 0], seletor: 0 });
      assert.deepEqual(erros, []);
      console.log(`ok   seletor: coluna da direita escolhida na página, ${prints.length} prints de ${prints[0].tamanho.join('x')}`);
      await resultado.close();
      await alvo.pagina.close();
    } catch (e) {
      falhas.push('seletor');
      console.log(`FALHA seletor\n${e.stack}`);
    }

    // Recorte: marcar uma região da tela; cada print é só ela, rolando até o fim.
    if (rodar('região')) try {
      limparDownloads();
      const alvo = await abrirAlvo('artigo.html');
      const resposta = await controle.evaluate(
        (tabId) => chrome.runtime.sendMessage({ tipo: 'iniciar', tabId, pasta: 'Região marcada', opcoes: { espera: 300, resultado: 'zip', recorte: 'regiao' } }),
        alvo.tabId,
      );
      assert.deepEqual(resposta, { ok: true, escolhendo: true });
      await alvo.pagina.bringToFront();
      await alvo.pagina.waitForSelector('#clipping-seletor');
      await alvo.pagina.mouse.move(100, 150);
      await alvo.pagina.mouse.down();
      await alvo.pagina.mouse.move(700, 500, { steps: 8 });
      await alvo.pagina.mouse.up();
      const [resultado] = await Promise.all([esperarResultado(), alvo.pagina.keyboard.press('Enter')]);
      const zip = await esperarArquivo('Região marcada.zip');
      guardar(zip, 'regiao-marcada.zip');
      const prints = lerZip(zip).filter((i) => i.nome.endsWith('.png'));
      const sessao = await dadosDaSessao(resultado);
      assert.ok(prints.length > 10, `${prints.length} prints`);
      for (const p of prints) assert.deepEqual(p.tamanho, [600 * dpr, 350 * dpr]);
      assert.equal(sessao.motivo, 'fim');
      for (const [i, m] of sessao.medidas.entries()) {
        const a = sessao.medidas[i - 1];
        if (a) assert.ok(m.topo + m.ocupadoTopo <= a.topo + a.altura - a.ocupadoBase, `buraco entre os prints ${i} e ${i + 1}`);
      }
      assert.ok(sessao.medidas.at(-1).topo >= sessao.medidas.at(-1).max - 1, 'rolou até o fim');
      assert.ok(sessao.medidas.at(-1).max > 150 * 40, 'carregou as linhas extras do fim');
      assert.deepEqual(erros, []);
      console.log(`ok   região marcada: ${prints.length} prints de ${prints[0].tamanho.join('x')}`);
      await resultado.close();
      await alvo.pagina.close();
    } catch (e) {
      falhas.push('região marcada');
      console.log(`FALHA região marcada\n${e.stack}`);
    }

    // Pacotes na pasta Downloads: escolhidos no popup antes da captura, cada
    // pacote é uma pasta com os ZIPs numerados e o "Índice do pacote.txt".
    if (rodar('pacotes')) try {
      limparDownloads();
      // pacotes são do ZIP: configurações salvas com "Resultado: ZIP com os prints"
      await controle.evaluate(() => chrome.storage.local.set({ opcoes: { resultado: 'zip' } }));
      const opcoesDoPopup = (popup) =>
        popup.$$eval('.opcao-pacote', (linhas) =>
          linhas.map((l) => ({ nome: l.querySelector('span').textContent, detalhe: l.querySelector('small')?.textContent || '', marcado: l.querySelector('input').checked })),
        );
      const salvo = (resultado) => resultado.waitForFunction(() => document.getElementById('destino-texto').textContent.startsWith('Salvo'));
      const INDICE_STF = 'STF outubro/Índice do pacote.txt';

      // 1ª matéria: ainda não há pacotes; cria "STF outubro" no próprio popup.
      const alvo1 = await abrirAlvo('curta.html');
      const popup1 = await popupPara(alvo1.tabId);
      assert.deepEqual(await opcoesDoPopup(popup1), [
        { nome: 'Sem pacote', detalhe: 'ZIP solto em Downloads', marcado: true },
        { nome: 'Novo pacote…', detalhe: '', marcado: false },
      ]);
      await popup1.click('text=Novo pacote…');
      assert.match(await popup1.inputValue('#novo-pacote'), /^127\.0\.0\.1 \d{2}-\d{2}-\d{4}$/, 'sugere site e data');
      await popup1.fill('#novo-pacote', 'STF outubro');
      assert.equal(await popup1.textContent('#pacote-destino'), 'Vai para: Downloads/STF outubro/01 - Página curta.zip');
      const resultado1 = await iniciarPeloPopup(popup1);
      const zip1 = await esperarArquivo('STF outubro/01 - Página curta.zip');
      await salvo(resultado1);
      assert.equal(await resultado1.textContent('#destino-texto'), 'Salvo no pacote “STF outubro”: Downloads/STF outubro/01 - Página curta.zip');
      assert.match(await resultado1.textContent('#estado'), /ZIP nº 1 do pacote “STF outubro”/);
      assert.match(lerZip(zip1).find((i) => i.nome.endsWith('info.txt')).texto, /\r\nPacote: STF outubro\r\n/);
      assert.match(await esperarTexto(INDICE_STF, /Matérias: 1\r\n/), /^Pacote: STF outubro\r\n[\s\S]*\r\n01 - Página curta\.zip\r\n {4}Página: Página curta\r\n/);
      await popup1.close();
      await resultado1.close();

      // 2ª matéria do mesmo site: o popup já vem com o pacote marcado e o número segue.
      const alvo2 = await abrirAlvo('materia.html');
      const popup2 = await popupPara(alvo2.tabId);
      assert.deepEqual(await opcoesDoPopup(popup2), [
        { nome: 'Sem pacote', detalhe: 'ZIP solto em Downloads', marcado: false },
        { nome: 'STF outubro', detalhe: '1 ZIP', marcado: true },
        { nome: 'Novo pacote…', detalhe: '', marcado: false },
      ]);
      const titulo2 = 'Juíza reconhece créditos de PIS e Cofins sobre fretes de exportação - ConJur';
      assert.equal(await popup2.textContent('#pacote-destino'), `Vai para: Downloads/STF outubro/02 - ${titulo2}.zip`);
      const resultado2 = await iniciarPeloPopup(popup2);
      await esperarArquivo(`STF outubro/02 - ${titulo2}.zip`);
      await esperarTexto(INDICE_STF, /Matérias: 2\r\n[\s\S]*01 - Página curta\.zip[\s\S]*02 - Juíza/);
      await popup2.close();

      // No resultado: mover o ZIP para um pacote novo; ele sai do pacote anterior.
      await salvo(resultado2);
      await resultado2.selectOption('#pacote-select', 'novo');
      await resultado2.fill('#pacote-novo', 'Outro pacote');
      await resultado2.click('#mover');
      await esperarArquivo(`Outro pacote/01 - ${titulo2}.zip`);
      await esperarSumir(`STF outubro/02 - ${titulo2}.zip`);
      await resultado2.waitForFunction(() => /cópia que estava no lugar anterior foi apagada/.test(document.getElementById('estado').textContent));
      assert.equal(await resultado2.textContent('#destino-texto'), `Salvo no pacote “Outro pacote”: Downloads/Outro pacote/01 - ${titulo2}.zip`);
      await esperarTexto(INDICE_STF, /Matérias: 1\r\n/);
      await esperarTexto('Outro pacote/Índice do pacote.txt', /Matérias: 1\r\n[\s\S]*01 - Juíza/);
      const arquivos = [`Outro pacote/01 - ${titulo2}.zip`, 'Outro pacote/Índice do pacote.txt', 'STF outubro/01 - Página curta.zip', INDICE_STF];
      assert.deepEqual(listar(downloads).sort(), arquivos);
      // Salvar de novo no mesmo pacote troca o arquivo, sem criar uma cópia "(1)".
      await resultado2.click('#baixar');
      await resultado2.waitForFunction(() => {
        const t = document.getElementById('estado').textContent;
        return /ZIP nº 1 do pacote “Outro pacote”/.test(t) && !/cópia/.test(t);
      });
      assert.deepEqual(listar(downloads).sort(), arquivos);
      await resultado2.close();

      // Gerenciador: situação de cada ZIP, exportar o pacote, tirar ZIP e excluir pacote.
      const gerenciador = await contexto.newPage();
      gerenciador.on('pageerror', (e) => erros.push(e.message));
      await gerenciador.goto(`chrome-extension://${idExtensao}/pacotes.html`);
      await gerenciador.waitForFunction(() => document.querySelectorAll('.pacote').length === 2 && document.querySelector('.status'));
      assert.equal(await gerenciador.$eval('input[name="destino"]:checked', (r) => r.value), 'downloads', 'pasta Downloads por padrão');
      const cartoes = () =>
        gerenciador.$$eval('.pacote', (cs) =>
          cs.map((c) => ({
            nome: c.querySelector('h2').textContent,
            pasta: c.querySelector('.caminho').textContent.split(' · ')[0],
            proxima: Boolean(c.querySelector('.marca')),
            itens: [...c.querySelectorAll('.item')].map((i) => `${i.querySelector('strong').textContent} (${i.querySelector('.status').textContent})`),
          })),
        );
      assert.deepEqual(await cartoes(), [
        { nome: 'Outro pacote', pasta: 'Downloads/Outro pacote/', proxima: false, itens: [`01 - ${titulo2}.zip (na pasta do pacote)`] },
        { nome: 'STF outubro', pasta: 'Downloads/STF outubro/', proxima: true, itens: ['01 - Página curta.zip (na pasta do pacote)'] },
      ]);
      if (process.env.SALVAR_PRINTS) await gerenciador.screenshot({ path: path.join(process.env.SALVAR_PRINTS, 'pacotes.png'), fullPage: true });
      const stf = gerenciador.locator('.pacote', { hasText: 'STF outubro' });
      await stf.getByRole('button', { name: 'Exportar pacote (.zip)' }).click();
      const exportado = lerZip(await esperarArquivo('STF outubro.zip'));
      assert.deepEqual(
        exportado.map((i) => i.nome),
        ['STF outubro/', INDICE_STF, 'STF outubro/01 - Página curta/', 'STF outubro/01 - Página curta/001.png', 'STF outubro/01 - Página curta/info.txt'],
      );
      assert.match(exportado[1].texto, /Matérias: 1\r\n\r\n01 - Página curta\/\r\n/);
      await gerenciador.waitForFunction(() => /ZIP do pacote salvo em/.test(document.getElementById('aviso').textContent));

      await stf.getByRole('button', { name: 'Tirar do pacote' }).click();
      await gerenciador.waitForFunction(() => [...document.querySelectorAll('.pacote')].some((c) => c.textContent.includes('Nenhum ZIP ainda')));
      await esperarTexto(INDICE_STF, /Matérias: 0\r\n/);
      const outro = gerenciador.locator('.pacote', { hasText: 'Outro pacote' });
      await outro.getByRole('button', { name: 'Excluir' }).first().click();
      await outro.locator('.confirmar').getByRole('button', { name: 'Excluir' }).click();
      await gerenciador.waitForFunction(() => document.querySelectorAll('.pacote').length === 1);
      assert.deepEqual(listar(downloads).sort(), [...arquivos, 'STF outubro.zip'].sort(), 'os arquivos continuam');

      // Nomes difíceis (invisíveis, ponto no começo, ".lnk") ainda viram downloads aceitos.
      const recusados = await gerenciador.evaluate(async () => {
        const { nomeNoPacote, nomeSolto, pastaDoPacote } = await import('./pacotes.js');
        const url = URL.createObjectURL(new Blob(['PK'], { type: 'application/zip' }));
        const falhas = [];
        for (const [pasta, nome] of [['.oculto', 'x​y'], ['pasta.lnk', 'CON'], ['a~b', '.zip'], ['  ', '  '], ['Título: “1/2”?', 'teste.local']]) {
          for (const caminho of [`${pastaDoPacote(pasta)}/${nomeNoPacote(1, nome)}`, nomeSolto(nome)]) {
            try {
              await chrome.downloads.download({ url, filename: caminho, saveAs: false });
            } catch (e) {
              falhas.push(`${caminho}: ${e.message}`);
            }
          }
        }
        return falhas;
      });
      assert.deepEqual(recusados, []);
      assert.deepEqual(erros, []);
      console.log('ok   pacotes: pasta do pacote em Downloads, ZIPs numerados, índice, mover, exportar e gerenciador');
      await gerenciador.close();
      await alvo1.pagina.close();
      await alvo2.pagina.close();
    } catch (e) {
      falhas.push('pacotes');
      console.log(`FALHA pacotes\n${e.stack}`);
    }

    // Pasta escolhida para os pacotes: a extensão grava direto nela, sem a
    // janela "Salvar como". No teste, uma pasta do armazenamento do navegador
    // faz o papel da pasta escolhida na janela do sistema.
    if (rodar('pasta escolhida')) try {
      limparDownloads();
      await controle.evaluate(() => chrome.storage.local.set({ opcoes: { resultado: 'zip' } }));
      const gerenciador = await contexto.newPage();
      gerenciador.on('pageerror', (e) => erros.push(e.message));
      await gerenciador.goto(`chrome-extension://${idExtensao}/pacotes.html`);
      const listarPasta = () =>
        gerenciador.evaluate(async () => {
          const saida = [];
          const andar = async (dir, prefixo) => {
            for await (const [nome, h] of dir.entries()) {
              if (h.kind === 'directory') await andar(h, `${prefixo}${nome}/`);
              else saida.push(`${prefixo}${nome}`);
            }
          };
          await andar(await (await navigator.storage.getDirectory()).getDirectoryHandle('Pacotes de prints'), '');
          return saida.sort();
        });
      const copiarDaPasta = async (caminho, destino) => {
        const base64 = await gerenciador.evaluate(async (caminho) => {
          let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Pacotes de prints');
          const partes = caminho.split('/');
          for (const p of partes.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
          const bytes = new Uint8Array(await (await (await dir.getFileHandle(partes.at(-1))).getFile()).arrayBuffer());
          let s = '';
          for (const b of bytes) s += String.fromCharCode(b);
          return btoa(s);
        }, caminho);
        fs.writeFileSync(destino, Buffer.from(base64, 'base64'));
        return destino;
      };
      await gerenciador.evaluate(async () => {
        const { salvarDestino } = await import('./destino.js');
        const raiz = await navigator.storage.getDirectory();
        await salvarDestino({ modo: 'pasta', pasta: await raiz.getDirectoryHandle('Pacotes de prints', { create: true }) });
      });
      const situacao = 'Os pacotes vão para a pasta “Pacotes de prints”.';
      await gerenciador.reload();
      await gerenciador.waitForFunction((t) => document.getElementById('destino-situacao').textContent === t, situacao);
      assert.equal(await gerenciador.$eval('input[name="destino"]:checked', (r) => r.value), 'pasta');
      assert.equal(await gerenciador.textContent('#pasta-nome'), 'Pasta: Pacotes de prints');
      // Trocar a opção na tela não muda nada até clicar em Salvar.
      await gerenciador.check('input[name="destino"][value="downloads"]');
      await gerenciador.waitForFunction(() => !document.getElementById('destino-pendente').hidden);
      assert.equal(await gerenciador.isEnabled('#salvar-destino'), true);
      await gerenciador.reload();
      await gerenciador.waitForFunction((t) => document.getElementById('destino-situacao').textContent === t, situacao);
      assert.equal(await gerenciador.$eval('input[name="destino"]:checked', (r) => r.value), 'pasta', 'sem Salvar, continua a pasta escolhida');

      // Pacote criado aqui já ganha a pasta principal, com o índice.
      await gerenciador.click('#novo');
      await gerenciador.fill('#novo-nome', 'TST novembro');
      assert.equal(await gerenciador.textContent('#novo-destino'), 'Pasta: Pacotes de prints/TST novembro/');
      await gerenciador.click('#form-novo button[type=submit]');
      await gerenciador.waitForFunction(() => /A pasta “Pacotes de prints\/TST novembro” foi criada/.test(document.getElementById('aviso').textContent));
      assert.deepEqual(await listarPasta(), ['TST novembro/Índice do pacote.txt']);

      const alvo = await abrirAlvo('curta.html');
      const popup = await popupPara(alvo.tabId);
      assert.equal(await popup.textContent('#pacote-destino'), 'Vai para: Pacotes de prints/TST novembro/01 - Página curta.zip');
      const resultado = await iniciarPeloPopup(popup);
      await resultado.waitForFunction(() => document.getElementById('destino-texto').textContent.startsWith('Salvo'));
      assert.equal(await resultado.textContent('#destino-texto'), 'Salvo no pacote “TST novembro”: Pacotes de prints/TST novembro/01 - Página curta.zip');
      assert.deepEqual(await listarPasta(), ['TST novembro/01 - Página curta.zip', 'TST novembro/Índice do pacote.txt']);
      assert.deepEqual(listar(downloads), [], 'nada foi para Downloads');
      const itens = lerZip(await copiarDaPasta('TST novembro/01 - Página curta.zip', path.join(tmp, 'pasta-escolhida.zip')));
      assert.deepEqual(itens.map((i) => i.nome), ['Página curta/', 'Página curta/001.png', 'Página curta/info.txt']);
      assert.match(itens[2].texto, /Pacote: TST novembro/);
      const indice = fs.readFileSync(await copiarDaPasta('TST novembro/Índice do pacote.txt', path.join(tmp, 'indice.txt')), 'utf8');
      assert.match(indice, /^﻿Pacote: TST novembro\r\n[\s\S]*Matérias: 1\r\n\r\n01 - Página curta\.zip\r\n/);

      const tst = gerenciador.locator('.pacote', { hasText: 'TST novembro' });
      await gerenciador.waitForFunction(() => [...document.querySelectorAll('.pacote .status')].some((s) => s.textContent === 'na pasta do pacote'));
      assert.equal(await tst.locator('.caminho').textContent().then((t) => t.split(' · ')[0]), 'Pacotes de prints/TST novembro/');
      assert.equal(await tst.getByRole('button', { name: 'Mostrar na pasta' }).count(), 0);
      // Exportar: o ZIP do pacote fica ao lado da pasta dele. Sem os prints
      // guardados na extensão, ele usa o ZIP que está na pasta.
      const esperado = ['TST novembro/', 'TST novembro/Índice do pacote.txt', 'TST novembro/01 - Página curta/', 'TST novembro/01 - Página curta/001.png', 'TST novembro/01 - Página curta/info.txt'];
      for (const vez of ['com os prints guardados', 'só com o ZIP da pasta']) {
        if (vez === 'só com o ZIP da pasta') {
          await resultado.evaluate(async () => (await import('./db.js')).apagarSessao(new URLSearchParams(location.search).get('sessao')));
        }
        await gerenciador.evaluate(() => (document.getElementById('aviso').textContent = ''));
        await tst.getByRole('button', { name: 'Exportar pacote (.zip)' }).click();
        await gerenciador.waitForFunction(() => /ZIP do pacote salvo em Pacotes de prints\/TST novembro\.zip/.test(document.getElementById('aviso').textContent));
        const exportado = lerZip(await copiarDaPasta('TST novembro.zip', path.join(tmp, 'tst.zip')));
        assert.deepEqual(exportado.map((i) => i.nome), esperado, vez);
        assert.equal(exportado[3].tamanho.length, 2, vez);
      }

      // O ZIP tirado do pacote continua na pasta: o próximo ganha outro número, sem cair em cima dele.
      await resultado.close(); // a aba da página volta a ser a ativa da janela dela
      await popup.close();
      await tst.getByRole('button', { name: 'Tirar do pacote' }).click();
      await gerenciador.waitForFunction(() => document.querySelector('.pacote')?.textContent.includes('Nenhum ZIP ainda'));
      const popup2 = await popupPara(alvo.tabId);
      await popup2.waitForFunction(() => document.getElementById('pacote-destino').textContent.includes('/02 - '));
      assert.equal(await popup2.textContent('#pacote-destino'), 'Vai para: Pacotes de prints/TST novembro/02 - Página curta.zip');
      const resultado2 = await iniciarPeloPopup(popup2);
      await resultado2.waitForFunction(() => document.getElementById('destino-texto').textContent.startsWith('Salvo'));
      assert.equal(await resultado2.textContent('#destino-texto'), 'Salvo no pacote “TST novembro”: Pacotes de prints/TST novembro/02 - Página curta.zip');
      assert.deepEqual(await listarPasta(), ['TST novembro.zip', 'TST novembro/01 - Página curta.zip', 'TST novembro/02 - Página curta.zip', 'TST novembro/Índice do pacote.txt']);
      const indice2 = fs.readFileSync(await copiarDaPasta('TST novembro/Índice do pacote.txt', path.join(tmp, 'indice2.txt')), 'utf8');
      assert.match(indice2, /Matérias: 1\r\n\r\n02 - Página curta\.zip\r\n/);
      await resultado2.close();
      await popup2.close();
      assert.deepEqual(listar(downloads), []);
      assert.deepEqual(erros, []);
      console.log('ok   pasta escolhida: pasta do pacote criada na hora, ZIP e índice gravados direto, exportação');
      await gerenciador.evaluate(async () => (await import('./destino.js')).salvarDestino({ modo: 'downloads' }));
      await gerenciador.close();
      await alvo.pagina.close();
    } catch (e) {
      falhas.push('pasta escolhida');
      console.log(`FALHA pasta escolhida\n${e.stack}`);
    }

    // Transcrição: o texto integral vai direto para o e-mail de notícias, como o
    // site publica (sem OCR), sem menus, anúncios, "Leia também" e comentários.
    const paginaNoticias = async () => {
      const aberta = contexto.pages().find((p) => p.url().includes('/noticias.html'));
      if (aberta) return aberta;
      const p = await contexto.waitForEvent('page', { predicate: (x) => x.url().includes('/noticias.html'), timeout: 120_000 });
      p.on('pageerror', (e) => erros.push(e.message));
      return p;
    };
    const materiasSalvas = (pagina) => pagina.evaluate(async () => (await chrome.storage.local.get('noticias')).noticias?.materias || []);
    const esperarMaterias = async (pagina, n) => {
      await pagina.waitForFunction((n) => document.querySelectorAll('#lista > li').length >= n, n, { timeout: 120_000 });
      await pagina.waitForTimeout(500); // a lista é gravada logo depois
      return materiasSalvas(pagina);
    };
    // Texto integral da matéria de testes/paginas/conjur.html, como a página publica.
    const TEXTO_CONJUR = [
      'Por 3 votos a 2, a 2ª Turma manteve a cobrança e afastou a multa de R$ 1.234.567,89 aplicada à distribuidora.',
      'A 2ª Turma do Supremo Tribunal Federal decidiu, nesta segunda-feira (27/10), que a alíquota do ICMS sobre energia elétrica pode chegar a 20,5% nos estados que aprovaram lei específica até 31/12/2025. O placar foi de 3 votos a 2.',
      'O caso envolvia a Distribuidora Maranhense de Energia S.A., autuada em R$ 1.234.567,89 pela Secretaria de Fazenda (Sefaz-MA). A empresa sustentava que a alíquota de 17% era o teto previsto no artigo 155, § 2º, inciso III, da Constituição, e que a diferença de 3,5 pontos percentuais violaria o princípio da seletividade.',
      '**Entenda o caso**',
      'Segundo a relatora, ministra Cármen Lúcia, a Lei Complementar nº 194/2022 não impede a cobrança acima de 17% quando há lei estadual anterior. “É constitucional a cobrança, desde que respeitada a anterioridade nonagesimal”, afirmou.',
      'Os ministros também fixaram os seguintes pontos:',
      '• a multa de 75% fica afastada;\n• os juros seguem a taxa Selic (−0,25 p.p. em relação ao mês anterior);\n• o processo nº 0801234-56.2025.8.10.0001 volta à 1ª instância.',
      '“A seletividade não é um teto rígido”, escreveu o ministro André Mendonça no voto vencedor.',
      'Ficaram vencidos os ministros Edson Fachin e Dias Toffoli, para quem a cobrança acima de 17% exige lei complementar nova. A decisão vale a partir de 1º/1/2027.',
      'RE 1.234.567\nClique aqui para ler o acórdão',
    ].join('\n\n');
    // testes/paginas/valor.html: legendas e créditos de foto, chamadas e links de
    // navegação saem; as armadilhas ("mais recente", "Foto:" no meio do texto,
    // itálico que é da matéria, tabela com legenda, link do acórdão) ficam.
    const TEXTO_VALOR = [
      'Decisão vale para lucros apurados até 2025 e pode ser estendida a outras empresas do grupo',
      'A 4ª Turma do Tribunal Regional Federal da 3ª Região (TRF-3) afastou a retenção de 10% de Imposto de Renda na fonte (IRRF) sobre os dividendos distribuídos por uma holding a seus sócios, prevista na Lei nº 15.270, de 2025. A decisão vale para os lucros apurados até 31/12/2025.',
      'Segundo o relator, a cobrança sobre a parcela que excede R$ 50 mil por mês viola a anterioridade. A decisão mais recente do STF sobre o tema, de 2024, ainda não foi publicada; a próxima sessão está marcada para 5/11.',
      '**Destaque da decisão**',
      'O advogado Alessandro Prado, do escritório Prado Advogados, afirma que a decisão pode ser estendida às demais empresas do grupo. “O ponto mais frágil da lei é a retenção sobre lucros já apurados”, diz.',
      '“A lei não pode alcançar lucros de exercícios encerrados”, escreveu a relatora.',
      'Atualização: a Fazenda Nacional informou que vai recorrer.',
      'A Receita Federal estima que a retenção renda R$ 25,2 bilhões por ano. Foto: em 2026, o valor efetivamente arrecadado foi de 12,3% a menos que o previsto.',
      '“É uma vitória dos contribuintes”, disse o advogado.',
      'Ano | Retenção\n2025 | 0%\n2026 | 10%',
      '_Fonte: Receita Federal_',
      'Leia a parte 1 da série Leia a parte 2 da série',
      'Clique aqui para ler o acórdão',
      'Processo 5001234-56.2026.4.03.6100',
    ].join('\n\n');
    if (rodar('transcrição')) try {
      limparDownloads();
      await controle.evaluate(() => chrome.storage.local.remove(['opcoes', 'noticias']));
      const alvo = await abrirAlvo('conjur.html');
      const popup = await popupPara(alvo.tabId);
      assert.equal(await popup.isVisible('#modo-email'), true, 'o popup avisa que o texto vai para o e-mail');
      const [noticias] = await Promise.all([paginaNoticias(), popup.click('#iniciar')]);
      const [m1] = await esperarMaterias(noticias, 1);
      assert.deepEqual(
        { titulo: m1.titulo, autor: m1.autor, data: m1.data, area: m1.area, link: m1.link, tipo: m1.transcricao?.tipo },
        { titulo: 'STF fixa alíquota de 20,5% do ICMS sobre energia', autor: 'Mariana Duarte', data: '2026-10-27', area: 'Tributário', link: `${base}/conjur.html`, tipo: 'pagina' },
      );
      assert.equal(m1.texto, TEXTO_CONJUR, 'texto integral exato, na ordem, sem nada do site');
      await noticias.waitForFunction(() => /entrou no e-mail de Tributário/.test(document.getElementById('transcricoes').textContent));

      // 2ª matéria com a página de notícias já aberta: chega nela.
      const alvo2 = await abrirAlvo('jota.html');
      await controle.evaluate((tabId) => chrome.runtime.sendMessage({ tipo: 'iniciar', tabId, pasta: 'x', opcoes: {} }), alvo2.tabId);
      const m2 = (await esperarMaterias(noticias, 2))[1];
      assert.deepEqual(
        { titulo: m2.titulo, autor: m2.autor, data: m2.data, area: m2.area },
        { titulo: 'TST: gerente de banco tem direito a 7ª e 8ª horas como extras', autor: 'Carla Menezes e Rafael Souza', data: '2026-10-26', area: 'Trabalhista' },
      );
      assert.ok(m2.texto.startsWith('Para a SDI-1, cargo de confiança exige fidúcia especial, o que não ficou provado no caso\n\n'), 'linha fina');
      assert.ok(m2.texto.includes('\n\n**O que estava em jogo**\n\n'), 'intertítulo em negrito no site');
      assert.ok(m2.texto.includes('o valor — R$ 3.150,00 por mês — não basta') && m2.texto.includes('(E-RR-1000123-45.2019.5.02.0011).'));
      for (const lixo of ['Anúncio', 'Relacionadas', 'Reforma trabalhista completa', 'cookies', 'Assine', 'assine', 'JOTA Principal']) assert.ok(!m2.texto.includes(lixo), lixo);
      for (const lixo of ['Leia também', 'Publicidade', 'Mais lidas', 'Comentários', 'Compartilhar', 'newsletter', 'Revista Consultor', 'ICMS STF', 'TRIBUTÁRIO', 'Cármen Lúcia durante', 'Sampaio']) {
        assert.ok(!m1.texto.includes(lixo), lixo);
      }

      // O e-mail da área: intertítulo em negrito, sem a legenda da foto; copiar leva o HTML.
      const previa = await noticias.$eval('.email[data-area="Tributário"] .previa', (c) => c.shadowRoot.innerHTML);
      assert.match(previa, /font-weight:bold; margin:12pt 0 6pt 0;">Entenda o caso<\/p>/);
      assert.doesNotMatch(previa, /Cármen Lúcia durante a sessão|Fellipe Sampaio/);
      assert.match(previa, /alíquota do ICMS sobre energia elétrica pode chegar a 20,5% nos estados/);
      if (process.env.SALVAR_PRINTS) {
        await noticias.setViewportSize({ width: 1280, height: 1600 });
        await noticias.screenshot({ path: path.join(process.env.SALVAR_PRINTS, 'transcricao.png') });
      }

      // "Os dois": o ZIP dos prints e a matéria no e-mail.
      const alvo3 = await abrirAlvo('materia.html');
      await controle.evaluate((tabId) => chrome.runtime.sendMessage({ tipo: 'iniciar', tabId, pasta: 'Os dois', opcoes: { espera: 300, resultado: 'ambos' } }), alvo3.tabId);
      await esperarArquivo('Os dois.zip');
      const m3 = (await esperarMaterias(noticias, 3))[2];
      assert.equal(m3.titulo, 'Juíza reconhece créditos de PIS e Cofins sobre fretes de exportação');
      assert.equal(m3.autor, 'Mariana Duarte');
      assert.ok(!/Spacca|TRIBUTÁRIO/.test(m3.texto), 'crédito da ilustração e chapéu fora');

      // Valor: fotos com legenda e crédito, chamadas, "Mais recente / Próxima" e o quadro do Google saem; o resto fica igual.
      const alvo4 = await abrirAlvo('valor.html');
      await controle.evaluate((tabId) => chrome.runtime.sendMessage({ tipo: 'iniciar', tabId, pasta: 'x', opcoes: {} }), alvo4.tabId);
      const m4 = (await esperarMaterias(noticias, 4))[3];
      assert.deepEqual(
        { titulo: m4.titulo, autor: m4.autor, data: m4.data, area: m4.area },
        { titulo: 'TRF-3 afasta retenção de 10% de IR sobre dividendos', autor: 'Beatriz Lima e Arthur Prado', data: '2026-10-23', area: 'Tributário' },
      );
      assert.equal(m4.texto, TEXTO_VALOR, 'texto integral exato, sem legenda, crédito, chamada nem navegação');
      const previa4 = await noticias.$eval('.email[data-area="Tributário"] .previa', (c) => c.shadowRoot.innerHTML);
      assert.match(previa4, /font-style:italic; margin:0 0 8pt 0;">Fonte: Receita Federal<\/p>/, 'legenda de tabela em itálico');
      assert.deepEqual(erros, []);
      console.log('ok   transcrição: texto exato da página no e-mail (ConJur, JOTA, Valor), sem legendas de foto, anúncios, chamadas e menus; "os dois" com ZIP');
      for (const p of [popup, alvo.pagina, alvo2.pagina, alvo3.pagina, alvo4.pagina]) await p.close();
      for (const p of contexto.pages().filter((x) => x.url().includes('/resultado.html'))) await p.close();
    } catch (e) {
      falhas.push('transcrição');
      console.log(`FALHA transcrição\n${e.stack}`);
    }

    // OCR: tudo o que não ficou marcado para conferir (⟦ ⟧) tem de estar
    // exatamente igual ao original, parágrafo por parágrafo.
    const conferirOcr = (lidos, fonte) => {
      assert.equal(lidos.length, fonte.length, `${lidos.length} parágrafos, eram ${fonte.length}:\n${lidos.join('\n\n')}`);
      const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const [i, lido] of lidos.entries()) {
        const padrao = lido
          .split(/(⟦[^⟧]*⟧)/)
          .map((parte) => (parte.startsWith('⟦') ? '[\\s\\S]+?' : escapar(parte).replace(/\s+/g, '\\s+')))
          .join('');
        assert.match(fonte[i], new RegExp(`^${padrao}$`), `parágrafo ${i + 1}: o que não está marcado tem de ser igual ao original\n  lido:     ${lido}\n  original: ${fonte[i]}`);
      }
    };
    // Página que só mostra o texto como imagem.
    if (rodar('ocr')) try {
      const alvo = await abrirAlvo('imagem.html');
      const fonte = await alvo.pagina.evaluate(() => globalThis.PARAGRAFOS);
      const antes = contexto.pages().find((p) => p.url().includes('/noticias.html'));
      const n = antes ? (await materiasSalvas(antes)).length : 0;
      const [noticias] = await Promise.all([
        paginaNoticias(),
        controle.evaluate((tabId) => chrome.runtime.sendMessage({ tipo: 'iniciar', tabId, pasta: 'x', opcoes: { espera: 300 } }), alvo.tabId),
      ]);
      const m = (await esperarMaterias(noticias, n + 1)).at(-1);
      assert.equal(m.transcricao?.tipo, 'ocr');
      assert.deepEqual({ titulo: m.titulo, autor: m.autor, area: m.area }, { titulo: 'Sefaz-MA publica nova tabela do ICMS', autor: 'Ana Lima', area: 'Tributário' });
      const lidos = m.texto.split('\n\n');
      conferirOcr(lidos, fonte);
      for (const lixo of ['Publicidade', 'newsletter', 'Portal de Teste', 'Legislação']) assert.ok(!m.texto.includes(lixo), lixo);
      const conferir = (m.texto.match(/⟦/g) || []).length;
      const cartaoOcr = noticias.locator(`#lista > li[data-id="${m.id}"]`);
      assert.match(await cartaoOcr.locator('.origem').textContent(), /OCR[\s\S]*Ver os prints/);
      if (conferir) assert.match(await cartaoOcr.locator('.avisos').textContent(), /para conferir/);
      const andamento = await noticias.$$eval('#transcricoes li', (l) => l.map((x) => x.textContent));
      assert.match(andamento[0], /^Pronto: “Sefaz-MA publica nova tabela do ICMS” entrou no e-mail de Tributário/);
      assert.ok(!andamento.some((t) => /Lendo os prints/.test(t)), 'o andamento vira "Pronto" no mesmo lugar');
      assert.deepEqual(erros, []);
      console.log(`ok   OCR: página só com imagem, ${lidos.length} parágrafos iguais ao original fora dos ${conferir} trechos marcados para conferir`);
      await alvo.pagina.close();

      // "Sempre OCR" numa página normal: as linhas vão para os blocos da página,
      // então sai a mesma estrutura do texto da página, sem os botões e anúncios.
      await noticias.evaluate(() => chrome.storage.local.remove('noticias'));
      await noticias.reload();
      const alvo2 = await abrirAlvo('conjur.html');
      await controle.evaluate((tabId) => chrome.runtime.sendMessage({ tipo: 'iniciar', tabId, pasta: 'x', opcoes: { espera: 300, leitura: 'ocr' } }), alvo2.tabId);
      const [m2] = await esperarMaterias(noticias, 1);
      assert.equal(m2.transcricao?.tipo, 'ocr');
      assert.deepEqual({ titulo: m2.titulo, autor: m2.autor, data: m2.data }, { titulo: 'STF fixa alíquota de 20,5% do ICMS sobre energia', autor: 'Mariana Duarte', data: '2026-10-27' });
      conferirOcr(m2.texto.split('\n\n'), TEXTO_CONJUR.split('\n\n'));
      console.log(`ok   OCR pedido numa página normal: estrutura da página, ${(m2.texto.match(/⟦/g) || []).length} trechos marcados, o resto igual ao original`);
      await alvo2.pagina.close();
      await noticias.close();
    } catch (e) {
      falhas.push('OCR');
      console.log(`FALHA OCR\n${e.stack}`);
    }

    await controle.close();

    // Versão sem instalar: script colado na página + compartilhamento de aba.
    if (rodar('sem instalar')) try {
      const pagina = await contexto.newPage();
      await pagina.goto(`${base}/artigo.html`);
      await pagina.addScriptTag({ path: path.join(RAIZ, 'script', 'captura-sem-instalar.js') });
      const painel = pagina.locator('#clipping-prints-painel');
      await painel.locator('input[type=text]').fill('Sem instalar');
      await painel.locator('input[type=number]').nth(1).fill('300');
      await painel.getByRole('button', { name: 'Iniciar captura' }).click();
      const zip = await esperarArquivo('Sem instalar.zip', 120_000);
      guardar(zip, 'sem-instalar.zip');
      const itens = lerZip(zip);
      const prints = itens.filter((i) => i.nome.endsWith('.png'));
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

    // Ferramenta de notícias: .txt soltos + .zip do Windows com pasta da área.
    if (rodar('notícias')) try {
      // começa com a lista vazia (os blocos de transcrição deixam matérias nela)
      for (const p of contexto.pages().filter((x) => x.url().includes('/noticias.html'))) await p.close();
      await sw.evaluate(() => chrome.storage.local.remove('noticias'));
      const pasta = path.join(__dirname, 'noticias');
      const zipNoticias = path.join(tmp, 'noticias.zip');
      execFileSync('python3', [
        '-c',
        `import sys, zipfile
class Info(zipfile.ZipInfo):
    def _encodeFilenameFlags(self):
        return self.filename.encode('cp850'), self.flag_bits & ~0x800
with zipfile.ZipFile(sys.argv[1], 'w') as z:
    i = Info('Empresarial/05 - marca.txt')
    i.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(i, open(sys.argv[2], 'rb').read())`,
        zipNoticias,
        path.join(pasta, 'Empresarial', '05 - marca.txt'),
      ]);
      const pagina = await contexto.newPage();
      await pagina.goto(`chrome-extension://${idExtensao}/noticias.html`);
      await pagina.setInputFiles('#arquivos', [
        ...['01 - stf icms.txt', '02 - tst gerente.txt', '03 - stj recuperacao.txt', '04 - varias.txt'].map((f) => path.join(pasta, f)),
        zipNoticias,
      ]);
      await pagina.waitForFunction(() => document.querySelectorAll('#lista > li').length === 6);
      assert.match(await pagina.textContent('#relatorio'), /^6 matérias adicionadas \(2 Tributário, 2 Empresarial, 2 Trabalhista\)\.$/);
      assert.deepEqual(
        await pagina.$$eval('#lista > li', (lis) => lis.map((li) => li.dataset.area)),
        ['Tributário', 'Trabalhista', 'Empresarial', 'Tributário', 'Trabalhista', 'Empresarial'],
      );
      const avisosMotorista = await pagina.textContent('#lista > li:nth-child(5) .avisos');
      assert.match(avisosMotorista, /matéria de 04\/10\/2026, e-mail de 05\/10\/2026/);
      assert.match(await pagina.textContent('#lista > li:nth-child(4) .avisos'), /sem link/);

      await pagina.waitForFunction(() => document.querySelectorAll('.email:not([hidden])').length === 3);
      assert.deepEqual(await pagina.$$eval('.email:not([hidden]) .assunto', (els) => els.map((e) => e.textContent)), [
        'Notícias - Tributário - 05.10.2026',
        'Notícias - Empresarial - 05.10.2026',
        'Notícias - Trabalhista - 05.10.2026',
      ]);

      const emailTrib = pagina.locator('.email[data-area="Tributário"]');
      await emailTrib.getByRole('button', { name: 'Baixar .html' }).click();
      const baixado = await esperarArquivo('EMAIL_NOTICIAS_TRIBUTARIO_05-10-2026.html');
      const html = fs.readFileSync(baixado, 'utf8');
      assert.match(html, /1\. STF afasta ICMS[\s\S]*2\. Reforma tributária/);
      assert.ok(html.includes('A decisão tem repercussão geral e deverá ser observada pelos demais tribunais'), 'texto integral');
      assert.equal((html.match(/<div id="materia-/g) || []).length, 2);
      guardar(baixado, 'EMAIL_NOTICIAS_TRIBUTARIO.html');

      // "Copiar e-mail para o Outlook" põe o HTML na área de transferência.
      await pagina.evaluate(() => {
        const original = navigator.clipboard.write.bind(navigator.clipboard);
        navigator.clipboard.write = async (itens) => {
          globalThis.copiado = await (await itens[0].getType('text/html')).text();
          return original(itens);
        };
      });
      await pagina.locator('.email[data-area="Trabalhista"]').getByRole('button', { name: 'Copiar e-mail para o Outlook' }).click();
      await pagina.waitForFunction(() => !document.getElementById('aviso').hidden);
      assert.match(await pagina.textContent('#aviso'), /E-mail de Trabalhista copiado/);
      assert.match(await pagina.evaluate(() => globalThis.copiado), /Notícias - Trabalhista - 05\.10\.2026[\s\S]*Por: Carla Menezes \(JOTA\)/);

      // Tirar uma matéria do e-mail e conferir que a escolha fica salva.
      await pagina.selectOption('#lista > li:nth-child(4) select.area', 'excluir');
      await pagina.waitForFunction(() => /1 matéria ·/.test(document.querySelector('.email[data-area="Tributário"] .cabeca-email').textContent));
      await pagina.waitForTimeout(500);
      await pagina.reload();
      await pagina.waitForFunction(() => document.querySelectorAll('#lista > li').length === 6);
      assert.equal(await pagina.$eval('#lista > li:nth-child(4)', (li) => li.dataset.area), 'excluir');

      if (process.env.SALVAR_PRINTS) {
        await pagina.setViewportSize({ width: 1280, height: 900 });
        await pagina.screenshot({ path: path.join(process.env.SALVAR_PRINTS, 'noticias.png'), fullPage: true });
      }
      await pagina.click('#baixar-todos');
      assert.deepEqual(
        lerZip(await esperarArquivo('EMAILS_NOTICIAS_05-10-2026.zip')).map((i) => i.nome),
        ['EMAIL_NOTICIAS_TRIBUTARIO_05-10-2026.html', 'EMAIL_NOTICIAS_EMPRESARIAL_05-10-2026.html', 'EMAIL_NOTICIAS_TRABALHISTA_05-10-2026.html'],
      );
      console.log('ok   notícias: 6 matérias de .txt e .zip viram 3 e-mails (baixar, copiar, salvar)');
      await pagina.close();
    } catch (e) {
      falhas.push('notícias');
      console.log(`FALHA notícias\n${e.stack}`);
    }

    // Notícias por colagem: copiar a matéria no site (Ctrl+C) e colar (Ctrl+V).
    if (rodar('notícias por colagem')) try {
      const erros = [];
      const site = await contexto.newPage();
      await site.goto(`${base}/materia.html`);
      const pagina = await contexto.newPage();
      pagina.on('pageerror', (e) => erros.push(e.message));
      await pagina.goto(`chrome-extension://${idExtensao}/noticias.html`);
      await pagina.evaluate(() => chrome.storage.local.remove('noticias'));
      await pagina.reload();

      await site.bringToFront();
      await site.evaluate(() => {
        const faixa = document.createRange();
        faixa.selectNodeContents(document.getElementById('materia'));
        getSelection().removeAllRanges();
        getSelection().addRange(faixa);
      });
      await site.keyboard.press('Control+C');
      await pagina.bringToFront();
      await pagina.focus('#zona-colar');
      await pagina.keyboard.press('Control+V');
      await pagina.waitForFunction(() => document.querySelector('#lista > li input[type=url]')?.value);
      const lida = await pagina.$eval('#lista > li', (li) => ({
        area: li.querySelector('select').value,
        titulo: li.querySelector('.campo.largo input').value,
        autor: li.querySelector('.linha input').value,
        link: li.querySelector('input[type=url]').value,
        data: li.querySelector('input[type=date]').value,
        texto: li.querySelector('textarea').value,
      }));
      assert.deepEqual(
        { ...lida, texto: undefined },
        {
          area: 'Tributário',
          titulo: 'Juíza reconhece créditos de PIS e Cofins sobre fretes de exportação',
          autor: 'Mariana Duarte',
          link: `${base}/materia.html`,
          data: '2026-10-05',
          texto: undefined,
        },
      );
      assert.equal(lida.texto.split('\n\n').length, 4, 'quatro parágrafos');
      assert.match(lida.texto, /^A 4ª Vara Federal de Curitiba/);
      assert.match(lida.texto, /A Fazenda Nacional sustentava que a exportação não gera/);
      assert.doesNotMatch(lida.texto, /Spacca|Leia também|Compartilhar|WhatsApp|Imprimir|TRIBUTÁRIO/);

      // Matéria sem aba aberta: fica sem link; colar o endereço sozinho completa.
      const colar = (texto, html = '') =>
        pagina.evaluate(
          ([texto, html]) => {
            const dados = new DataTransfer();
            dados.setData('text/plain', texto);
            if (html) dados.setData('text/html', html);
            document.getElementById('zona-colar').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dados, bubbles: true, cancelable: true }));
          },
          [texto, html],
        );
      await colar(fs.readFileSync(path.join(__dirname, 'noticias', '03 - stj recuperacao.txt'), 'utf8').replace(/https:\S+\n?$/, ''));
      await pagina.waitForFunction(() => document.querySelectorAll('#lista > li').length === 2);
      assert.equal(await pagina.$eval('#lista > li:nth-child(2) input[type=url]', (i) => i.value), '');
      await colar('https://www.conjur.com.br/2026-out-05/stj-admite-creditos-socios-plano-recuperacao/');
      await pagina.waitForFunction(() => document.querySelector('#lista > li:nth-child(2) input[type=url]').value);
      assert.match(await pagina.textContent('#aviso'), /Link colocado na matéria 2/);

      // Botão "Colar da área de transferência".
      await pagina.evaluate((t) => navigator.clipboard.writeText(t), fs.readFileSync(path.join(__dirname, 'noticias', '02 - tst gerente.txt'), 'utf8'));
      await pagina.click('#colar-botao');
      await pagina.waitForFunction(() => document.querySelectorAll('#lista > li').length === 3);

      // Pré-visualização na página e em tela cheia.
      await pagina.waitForFunction(() =>
        document.querySelector('.email[data-area="Tributário"] .previa')?.shadowRoot?.textContent.includes('Notícias - Tributário - 05.10.2026'),
      );
      await pagina.locator('.email[data-area="Trabalhista"]').getByRole('button', { name: 'Pré-visualizar' }).click();
      assert.equal(await pagina.$eval('#dialogo', (d) => d.open), true);
      const cheia = await pagina.$eval('#dialogo-corpo', (c) => c.shadowRoot.textContent);
      assert.match(cheia, /Notícias - Trabalhista - 05\.10\.2026[\s\S]*Por: Carla Menezes \(JOTA\)[\s\S]*Ficaram vencidos três ministros/);
      if (process.env.SALVAR_PRINTS) await pagina.screenshot({ path: path.join(process.env.SALVAR_PRINTS, 'previa.png') });
      await pagina.click('#dialogo-fechar');
      assert.equal(await pagina.$eval('#dialogo', (d) => d.open), false);
      assert.deepEqual(erros, []);
      console.log('ok   notícias: colar do site (Ctrl+V), link pela aba, link colado, botão colar e pré-visualização');
      await site.close();
      await pagina.close();
    } catch (e) {
      falhas.push('notícias por colagem');
      console.log(`FALHA notícias por colagem\n${e.stack}`);
    }

    // Versão de notícias num arquivo só, aberta direto do disco (sem a extensão).
    if (rodar('notícias sem instalar')) try {
      const erros = [];
      const pagina = await contexto.newPage();
      pagina.on('pageerror', (e) => erros.push(e.message));
      await pagina.goto(`file://${path.join(RAIZ, 'script', 'noticias-sem-instalar.html')}`);
      await pagina.evaluate((texto) => {
        const dados = new DataTransfer();
        dados.setData('text/plain', texto);
        document.getElementById('zona-colar').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dados, bubbles: true, cancelable: true }));
      }, fs.readFileSync(path.join(__dirname, 'noticias', '01 - stf icms.txt'), 'utf8'));
      await pagina.waitForFunction(() =>
        document.querySelector('.email[data-area="Tributário"] .previa')?.shadowRoot?.textContent.includes('STF afasta ICMS'),
      );
      assert.deepEqual(erros, []);
      console.log('ok   notícias sem instalar: funciona aberta direto do arquivo');
      await pagina.close();
    } catch (e) {
      falhas.push('notícias sem instalar');
      console.log(`FALHA notícias sem instalar\n${e.stack}`);
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
