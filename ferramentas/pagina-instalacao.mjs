// Página que ensina a criar o favorito (bookmarklet) da versão sem instalar.
// completo=true gera um documento HTML inteiro (script/instalar-favorito.html);
// completo=false gera só o conteúdo, para publicar como página no claude.ai.

const estilo = `
/* Layout: uma coluna de leitura (~46rem); o botão arrastável fica em destaque logo no primeiro passo. */
:root {
  --fundo: #f4f6f8;
  --superficie: #ffffff;
  --texto: #18212b;
  --suave: #566170;
  --linha: #d9dfe6;
  --acento: #1f4fd1;
  --sobre-acento: #ffffff;
  --acento-suave: #e2e9fb;
  --quadro: rgba(31, 79, 209, 0.12);
  --serifa: 'Source Serif 4', Georgia, 'Times New Roman', serif;
  --sans: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --fundo: #11151a;
    --superficie: #191e25;
    --texto: #e5e9ef;
    --suave: #9aa5b3;
    --linha: #2b323c;
    --acento: #7ea2ff;
    --sobre-acento: #0d1530;
    --acento-suave: #1d2a4d;
    --quadro: rgba(126, 162, 255, 0.16);
    color-scheme: dark;
  }
}
:root[data-theme='dark'] {
  --fundo: #11151a;
  --superficie: #191e25;
  --texto: #e5e9ef;
  --suave: #9aa5b3;
  --linha: #2b323c;
  --acento: #7ea2ff;
  --sobre-acento: #0d1530;
  --acento-suave: #1d2a4d;
  --quadro: rgba(126, 162, 255, 0.16);
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding-inline: 16px;
  background: var(--fundo);
  color: var(--texto);
  font: 16px/1.6 var(--sans);
}
.pagina { max-width: 46rem; margin: 0 auto; padding-block: 40px 64px; display: grid; gap: 40px; }
h1, h2 { font-family: var(--serifa); font-weight: 600; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(1.9rem, 5vw, 2.4rem); line-height: 1.15; }
h2 { font-size: 1.35rem; line-height: 1.3; margin-bottom: 14px; }
p { margin: 0; }
.abertura { display: grid; gap: 10px; }
.abertura p { color: var(--suave); max-width: 62ch; }
.rotulo { font: 500 0.75rem/1 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--acento); }
.cartao { background: var(--superficie); border: 1px solid var(--linha); border-radius: 12px; padding: clamp(18px, 4vw, 28px); }
ol.passos { counter-reset: passo; list-style: none; margin: 0; padding: 0; display: grid; gap: 18px; }
ol.passos > li { counter-increment: passo; display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: 12px; align-items: start; }
ol.passos > li::before {
  content: counter(passo);
  width: 2rem; height: 2rem; border-radius: 50%;
  display: grid; place-items: center;
  font: 500 0.85rem var(--mono);
  background: var(--acento-suave); color: var(--acento);
}
ol.passos > li > div { display: grid; gap: 10px; min-width: 0; }
.favorito {
  justify-self: start;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px 9px 12px; border-radius: 999px;
  background: var(--acento); color: var(--sobre-acento);
  font-weight: 600; text-decoration: none; cursor: grab;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}
.favorito:active { cursor: grabbing; }
.favorito svg { width: 20px; height: 20px; flex: none; }
.secundario { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
button {
  font: inherit; font-weight: 500;
  padding: 7px 14px; border-radius: 8px;
  border: 1px solid var(--linha); background: var(--superficie); color: var(--texto);
  cursor: pointer;
}
button:hover { border-color: var(--acento); }
a:focus-visible, button:focus-visible, textarea:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
.nota { color: var(--suave); font-size: 0.92rem; }
.nota:empty { display: none; }
textarea {
  width: 100%; height: 6.5rem; resize: vertical;
  font: 0.75rem/1.4 var(--mono); color: var(--texto);
  background: var(--fundo); border: 1px solid var(--linha); border-radius: 8px; padding: 8px;
}
kbd {
  font: 500 0.8rem var(--mono);
  padding: 1px 6px; border-radius: 5px;
  border: 1px solid var(--linha); border-bottom-width: 2px; background: var(--superficie);
}
.duas { display: grid; grid-template-columns: minmax(0, 1fr) 13rem; gap: 28px; align-items: center; }
@media (max-width: 620px) { .duas { grid-template-columns: minmax(0, 1fr); } }
.texto-zip { display: grid; gap: 14px; min-width: 0; }
.duas ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 8px; }
.esquema { margin: 0; display: grid; gap: 8px; justify-items: center; }
.folha {
  position: relative; width: 9.5rem; height: 19rem; max-width: 100%;
  background: var(--superficie); border: 1px solid var(--linha); border-radius: 4px;
  background-image: repeating-linear-gradient(to bottom, transparent 0 11px, var(--linha) 11px 14px);
  background-clip: content-box; padding: 10px 14px;
}
.recorte {
  position: absolute; left: -10px; right: -10px; height: 7.6rem;
  border: 2px solid var(--acento); border-radius: 4px; background: var(--quadro);
}
.recorte span {
  position: absolute; right: 6px; top: 4px;
  font: 500 0.7rem var(--mono); color: var(--acento);
}
.esquema figcaption { font-size: 0.85rem; color: var(--suave); text-align: center; max-width: 13rem; }
pre.zip {
  margin: 0; overflow-x: auto;
  font: 0.9rem/1.7 var(--mono);
  background: var(--superficie); border: 1px solid var(--linha); border-radius: 8px; padding: 14px 16px;
}
.lista { margin: 0; padding-left: 1.2rem; display: grid; gap: 8px; }
code { font: 0.9em var(--mono); }
`;

const icone = `<svg viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="28" fill="currentColor" opacity=".25"/><rect x="24" y="28" width="54" height="66" rx="7" fill="currentColor"/><circle cx="90" cy="90" r="25" fill="currentColor"/><path d="M90 76v26m-11-11 11 11 11-11" stroke="var(--acento)" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const script = `
const favorito = document.getElementById('favorito');
const nota = document.getElementById('nota-copia');
const area = document.getElementById('texto-favorito');
favorito.addEventListener('click', (ev) => {
  ev.preventDefault();
  nota.textContent = 'Arraste o botão (não clique): segure com o mouse e solte em cima da barra de favoritos.';
});
document.getElementById('copiar').addEventListener('click', async () => {
  const texto = favorito.getAttribute('href');
  try {
    await navigator.clipboard.writeText(texto);
    nota.textContent = 'Endereço copiado. Clique com o botão direito na barra de favoritos, escolha "Adicionar página…" e cole no campo URL.';
  } catch {
    area.hidden = false;
    area.value = texto;
    area.focus();
    area.select();
    nota.textContent = 'O texto abaixo já está selecionado: aperte Ctrl+C para copiar.';
  }
});
`;

export function paginaInstalacao(bookmarklet, { completo = true } = {}) {
  const fontes =
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap" />';
  const conteudo = `<main class="pagina">
  <header class="abertura">
    <span class="rotulo">Sem instalar nada</span>
    <h1>Prints com rolagem</h1>
    <p>Um favorito do navegador que rola a página do topo ao fim, tira um print de cada trecho e baixa um ZIP com os prints numerados na ordem, prontos para a transcrição.</p>
  </header>

  <section class="cartao" aria-labelledby="t-criar">
    <h2 id="t-criar">Criar o favorito (só uma vez)</h2>
    <ol class="passos">
      <li><div><p>No Chrome ou no Edge, mostre a barra de favoritos com <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>.</p></div></li>
      <li>
        <div>
          <p>Arraste este botão até a barra de favoritos:</p>
          <a id="favorito" class="favorito" href="${bookmarklet}" title="Arraste para a barra de favoritos">${icone}Prints com rolagem</a>
        </div>
      </li>
      <li>
        <div>
          <p>Se arrastar não funcionar, copie o endereço do favorito e crie-o à mão: botão direito na barra de favoritos, <b>Adicionar página…</b>, nome <b>Prints com rolagem</b> e, no campo URL, cole o que foi copiado.</p>
          <div class="secundario"><button id="copiar" type="button">Copiar endereço do favorito</button></div>
          <p id="nota-copia" class="nota" role="status"></p>
          <textarea id="texto-favorito" readonly hidden aria-label="Endereço do favorito"></textarea>
        </div>
      </li>
    </ol>
  </section>

  <section aria-labelledby="t-usar">
    <h2 id="t-usar">Usar</h2>
    <ol class="passos">
      <li><div><p>Abra a página que vai transcrever (faça login antes, se precisar) e clique no favorito <b>Prints com rolagem</b>. Um painel aparece no canto da página.</p></div></li>
      <li><div><p>Confira o nome da pasta (vem com o título da página) e clique em <b>Iniciar captura</b>.</p></div></li>
      <li><div><p>O navegador pergunta se pode compartilhar esta aba: clique em <b>Permitir</b> ou <b>Compartilhar</b>. É assim que o favorito consegue tirar os prints sem instalar nada.</p></div></li>
      <li><div><p>Espere sem trocar de aba. O painel some durante a captura e o título da aba mostra o progresso. Para parar antes do fim, aperte <kbd>Esc</kbd> ou <b>Parar de compartilhar</b>: o que já foi capturado é salvo.</p></div></li>
      <li><div><p>No fim, o ZIP é baixado sozinho. Se não baixar, use o botão <b>Baixar o ZIP de novo</b> no painel.</p></div></li>
    </ol>
  </section>

  <section aria-labelledby="t-zip">
    <h2 id="t-zip">O que vem no ZIP</h2>
    <div class="duas">
      <div class="texto-zip">
        <pre class="zip">Diário Oficial 05-10-2026.zip
└─ Diário Oficial 05-10-2026/
   ├─ 001.png
   ├─ 002.png
   ├─ 003.png
   ├─ …
   └─ info.txt   (endereço, data e nº de prints)</pre>
        <ul>
          <li>Cada print repete um pedaço do final do anterior, então nenhuma linha fica cortada entre dois prints.</li>
          <li>Cabeçalhos e rodapés fixos do site são descontados (e escondidos a partir do 2º print), para não cobrirem o texto.</li>
          <li>Depois de cada rolagem ele espera a página carregar, inclusive conteúdo que só aparece ao rolar.</li>
        </ul>
      </div>
      <figure class="esquema">
        <div class="folha" aria-hidden="true">
          <div class="recorte" style="top: 0"><span>001</span></div>
          <div class="recorte" style="top: 5.7rem"><span>002</span></div>
          <div class="recorte" style="top: 11.4rem"><span>003</span></div>
        </div>
        <figcaption>Os prints se sobrepõem um pouco ao descer a página.</figcaption>
      </figure>
    </div>
  </section>

  <section aria-labelledby="t-dicas">
    <h2 id="t-dicas">Dicas e limites</h2>
    <ul class="lista">
      <li>Tela cheia (<kbd>F11</kbd>) deixa os prints maiores e em menor número.</li>
      <li>Funciona no Chrome e no Edge atualizados, no computador. O PDF aberto no leitor do navegador não rola sozinho: nesse caso, baixe o PDF.</li>
      <li>Se o site bloquear o painel, use a extensão (mais completa), que está no repositório <code>CLIPPING</code>, pasta <code>extensao</code>.</li>
    </ul>
  </section>
</main>`;

  if (!completo) {
    return `<title>Prints com Rolagem</title>\n${fontes}\n<style>${estilo}</style>\n${conteudo}\n<script>${script}</script>\n`;
  }
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Prints com Rolagem</title>
<!-- ARQUIVO GERADO por ferramentas/gerar-script.mjs: não edite à mão. -->
${fontes}
<style>${estilo}</style>
</head>
<body>
${conteudo}
<script>${script}</script>
</body>
</html>
`;
}
