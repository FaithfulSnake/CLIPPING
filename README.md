# Ferramentas Fanjas

Extensão do navegador (Chrome/Edge) que reúne ferramentas do escritório. Não precisa executar nada no computador (sem Python, sem cmd).

| Ferramenta | O que faz |
| --- | --- |
| **Prints com rolagem** | Rola a página do topo até o fim, tira um print de cada trecho e baixa um **ZIP** com os prints **numerados na ordem da página**, para transcrição. |
| **Notícias jurídicas** | Recebe os **.txt com o texto integral** das matérias e devolve **um e-mail por área** (Tributário, Empresarial e Trabalhista) no modelo do escritório, **sem resumir**, pronto para colar no Outlook. |

As duas ficam no mesmo ícone: clique nele e escolha a aba da ferramenta.

---

# Prints com rolagem

Há duas formas de usar:

|               | **Extensão** (recomendada)                         | **Sem instalar** (favorito)                                   |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Preparação    | Carregar a pasta uma vez em `chrome://extensions`  | Arrastar um botão para a barra de favoritos                   |
| Para capturar | Ícone da extensão → **Iniciar captura**            | Favorito → **Iniciar captura** → **Permitir** compartilhar a aba |
| Navegadores   | Chrome, Edge (e outros baseados no Chromium)       | Chrome e Edge atualizados                                     |
| Quando usar   | Sempre que a empresa permitir extensões            | Quando o computador bloqueia extensões                        |

## O que vem no ZIP

```
Nome da pasta.zip
└── Nome da pasta/
    ├── 001.png
    ├── 002.png
    ├── 003.png
    ├── …
    └── info.txt      endereço da página, data, quantidade e tamanho dos prints
```

O nome da pasta vem preenchido com o título da página e pode ser trocado antes de iniciar.

## Por que nenhum trecho fica de fora

- **Sobreposição:** cada print repete o final do anterior (padrão: 10% da tela), então nenhuma linha fica cortada entre dois prints.
- **Cabeçalhos e rodapés fixos:** a ferramenta mede a altura do que fica grudado no topo/rodapé (menu do site, aviso de cookies…) e desconta essa altura na rolagem, para o texto que passa por trás deles aparecer no print seguinte. Por padrão, eles também são escondidos a partir do 2º print (o 1º sempre sai como a página é).
- **Carregamento:** depois de cada rolagem espera a página carregar (padrão: 700 ms). Se a página cresce ao chegar no fim ("carregar mais"), continua rolando.
- **Sites com painel interno:** em sistemas e webmails em que só uma parte da tela rola, a ferramenta encontra e rola esse painel. Também funciona com páginas dentro de quadros (iframes) do mesmo site.
- **Página intacta:** rolagem suave e "encaixe" de rolagem são desligados só durante a captura; no fim tudo é restaurado, inclusive a posição em que você estava.

## 1. Extensão (Chrome / Edge)

### Instalar (uma vez)

1. Baixe o arquivo **`ferramentas-fanjas.zip`** (enviado junto com esta ferramenta) **ou**, aqui no GitHub, clique no botão verde **Code → Download ZIP** e use a pasta `extensao` que vem dentro dele.
2. Descompacte: botão direito no arquivo → **Extrair tudo…**.
3. No navegador, abra `chrome://extensions` (no Edge: `edge://extensions`).
4. Ligue o **Modo do desenvolvedor** (canto superior direito; no Edge fica no menu da esquerda).
5. Clique em **Carregar sem compactação** e escolha a pasta descompactada (a que tem o arquivo `manifest.json`).
6. Clique no ícone de quebra-cabeça da barra do navegador e fixe **Ferramentas Fanjas**.

> Já tinha a versão anterior ("Clipping – Prints com rolagem")? Remova-a em `chrome://extensions` e carregue a pasta nova, ou substitua os arquivos da pasta antiga pelos novos e clique no botão de recarregar (↻) da extensão.

> Não apague nem mova a pasta depois de carregar: o navegador usa os arquivos dela.
> Se o "Modo do desenvolvedor" estiver bloqueado, é política da empresa: use a forma **sem instalar** (seção 2).

### Usar

1. Abra a página que vai transcrever (faça login antes, se precisar).
2. Clique no ícone da extensão, na aba **Prints com rolagem**, confira o **nome da pasta** e clique em **Iniciar captura**.
3. Não troque de aba nem minimize a janela até terminar. Se trocar, a captura pausa e continua quando você voltar.
4. Ao terminar, abre uma aba com a prévia de todos os prints e o ZIP é baixado sozinho (o botão **Baixar ZIP** baixa de novo).

**Atalho:** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> inicia com as últimas opções usadas; apertar de novo para e salva o que já foi capturado. Para trocar a tecla: `chrome://extensions/shortcuts`.

### Opções (no popup, em "Opções")

| Opção                                  | Padrão | Para que serve                                                          |
| -------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Sobreposição entre prints              | 10%    | Quanto do final de um print se repete no próximo                        |
| Espera após cada rolagem               | 700 ms | Aumente em sites lentos ou com muitas imagens                           |
| Limite de prints                       | 400    | Evita rolar para sempre em páginas "infinitas"                          |
| Formato                                | PNG    | PNG é melhor para leitura; JPEG gera arquivos menores                   |
| Esconder cabeçalhos/rodapés fixos      | ligado | Tira menu e avisos fixos a partir do 2º print                           |
| Incluir `info.txt`                     | ligado | Guarda o endereço e a data da captura junto dos prints                  |
| Baixar o ZIP automaticamente           | ligado | Desligado, o ZIP só baixa ao clicar em **Baixar ZIP**                   |

A extensão guarda as 5 capturas mais recentes para baixar de novo; o botão **Apagar** remove uma delas.

## 2. Sem instalar (favorito)

Usa o compartilhamento de aba do próprio navegador (o mesmo das videochamadas) para tirar os prints, então não precisa instalar nada.

### Criar o favorito (uma vez)

- **Mais fácil:** abra a página de instalação ([`script/instalar-favorito.html`](script/instalar-favorito.html), ou o link enviado junto) e arraste o botão **Prints com rolagem** para a barra de favoritos (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> mostra a barra).
- **À mão:** botão direito na barra de favoritos → **Adicionar página…** → nome `Prints com rolagem` → no campo URL cole **todo** o conteúdo de [`script/bookmarklet.txt`](script/bookmarklet.txt).

### Usar

1. Abra a página e clique no favorito: aparece um painel no canto.
2. Confira o nome da pasta e clique em **Iniciar captura**.
3. O navegador pergunta se pode compartilhar **esta aba**: clique em **Permitir** / **Compartilhar**.
4. O painel some durante a captura e o título da aba mostra o progresso. <kbd>Esc</kbd> ou **Parar de compartilhar** interrompe e salva o que já foi capturado.
5. No fim, o ZIP é baixado.

**Alternativa pelo Console:** <kbd>F12</kbd> → aba **Console** → cole todo o conteúdo de [`script/captura-sem-instalar.js`](script/captura-sem-instalar.js) → <kbd>Enter</kbd>. Na primeira vez o Chrome pede para digitar `allow pasting` (ou "permitir colar") antes de colar.

## Dicas

- **Tela cheia** (<kbd>F11</kbd>) deixa os prints maiores e em menor número.
- **Zoom** (<kbd>Ctrl</kbd> + / <kbd>Ctrl</kbd> −): com zoom menor cabe mais texto em cada print, mas a letra fica menor. Para transcrever, 100% costuma ser o melhor.
- Se algum print sair com imagens ainda carregando, aumente a **espera após cada rolagem** (por exemplo, 1500 ms).

## Limitações

- Páginas internas do navegador (`chrome://…`, configurações, loja de extensões) não podem ser capturadas.
- **PDF** aberto no leitor do navegador não rola automaticamente: baixe o PDF.
- Conteúdo dentro de um **quadro (iframe) de outro site** não é rolado. Abra o quadro em uma aba própria (botão direito sobre ele → "Abrir quadro em nova guia", quando existir) e capture lá.
- Só rola na vertical.
- A extensão não funciona no Firefox.

---

# Notícias jurídicas

Substitui a montagem dos e-mails de notícias que antes era feita no chat, com uma diferença: **o e-mail leva a matéria inteira**, não um resumo.

### Usar

1. Clique no ícone da extensão → aba **Notícias jurídicas** → **Abrir Notícias jurídicas** (abre numa aba própria).
2. **Solte os .txt** das matérias na página (ou clique em **Escolher arquivos** / **Escolher pasta**). Também aceita um **.zip** com os .txt e pastas inteiras.
3. **Confira** a lista: cada matéria aparece com a área escolhida pelo assunto, título, autor, link e data. Tudo pode ser corrigido ali mesmo, inclusive o texto. Use **Não incluir** para tirar uma matéria do e-mail e as setas para mudar a ordem.
4. Em **E-mails**, para cada área:
   - **Copiar e-mail para o Outlook** → no Outlook, clique no corpo da mensagem e cole (<kbd>Ctrl</kbd>+<kbd>V</kbd>);
   - **Abrir no Outlook (Para + Assunto)** cria a mensagem já com destinatários e assunto (depois é só colar o corpo);
   - **Baixar .html** salva `EMAIL_NOTICIAS_[ÁREA]_DD-MM-AAAA.html`, e **Baixar todos (.zip)** salva os três.

O campo **Para** é preenchido uma vez e fica salvo só no seu navegador (os endereços não vão no código, que é público, nem dentro do e-mail). A lista também fica salva: se fechar a aba sem querer, as matérias continuam lá até você clicar em **Limpar tudo**.

### O e-mail gerado

Segue o modelo do escritório (estilos dentro do próprio HTML, que o Outlook preserva):

- **Assunto** e primeira linha: `Notícias - [Área] - DD.MM.AAAA`, com a data das matérias (a mais frequente; se houver matéria de outro dia, a lista avisa). A data pode ser trocada em cada e-mail.
- **Sumário** numerado, com link para cada matéria.
- Para cada matéria: **título** centralizado em negrito, **`Por: autor`** (só quando houver autor; matérias do JOTA e do Migalhas ganham o nome do portal entre parênteses), **texto integral** justificado, um parágrafo por parágrafo da matéria, e **`Link de Acesso:`**.
- Calibri Light 11 no texto e Calibri nos títulos.

### Como preparar os .txt

Basta copiar a matéria do site e colar num .txt (Bloco de Notas). A ferramenta reconhece sozinha:

- **título**: a primeira linha;
- **autor**: a linha "Por Fulano de Tal";
- **link**: a linha que for só um endereço `https://…`, no começo ou no fim (ou `Link de Acesso: https://…`);
- **data**: a primeira data do cabeçalho ("05/10/2026", "5 de outubro de 2026, 8h05"…);
- **área**: pelo assunto (termos como ICMS, Carf, CLT, TST, recuperação judicial, sócios…). Quando não dá para ter certeza, a matéria aparece com o aviso **confira a área**.

Botões e créditos copiados junto ("Compartilhar", "WhatsApp", "Spacca"…) são removidos. Para não depender de adivinhação, o .txt pode começar com rótulos (todos opcionais):

```
Título: STF decide que…
Autor: Fulano de Tal
Link: https://www.conjur.com.br/…
Data: 05/10/2026
Área: Tributário

(texto integral da matéria)
```

Outras formas aceitas: pastas com o nome da área (`Tributário/`, `Empresarial/`, `Trabalhista/`), arquivo começando pelo nome da área (`Trabalhista - 01.txt`) e várias matérias num só .txt, separadas por uma linha `=====`. Arquivos em UTF-8, ANSI ou "Unicode" do Bloco de Notas funcionam.

Os avisos da lista ajudam a conferir antes de enviar: **sem link**, **confira a área**, **matéria de outra data** e **texto curto** (quando o .txt parece ter só um trecho da matéria).

## Para quem for mexer no código

```
extensao/            a extensão (Manifest V3)
  manifest.json
  background.js      controla a captura (service worker)
  pagina.js          roda dentro da página: escolhe o que rolar e mede cabeçalhos/rodapés fixos
  comum.js           laço de captura, nomes de arquivo e info.txt (compartilhado com o favorito)
  zip.js             gera o ZIP (sem bibliotecas externas)
  db.js, opcoes.js   armazenamento das capturas e das opções
  popup.*            janela do ícone (abas das ferramentas)
  resultado.*        página com a prévia dos prints e o botão de baixar
  noticias.*         ferramenta Notícias jurídicas (página)
  noticias-texto.js  leitura dos .txt, área pelo assunto e montagem do e-mail
  unzip.js           leitura de .zip e da codificação dos .txt
script/
  fonte/painel.js    painel da versão sem instalar
  captura-sem-instalar.js, bookmarklet.txt, instalar-favorito.html   gerados (não editar)
ferramentas/         geradores (script, ícones, pacote da extensão)
testes/              testes unitários e de ponta a ponta (páginas e matérias fictícias de exemplo)
```

Comandos (precisam do Node.js 20+; os de ponta a ponta precisam do Playwright com Chromium):

```sh
npm test            # testes unitários
npm run e2e         # abre o Chromium com a extensão: captura testes/paginas e monta os e-mails de testes/noticias
npm run gerar       # regenera script/ depois de mudar extensao/ ou script/fonte/
npm run empacotar   # gera dist/ferramentas-fanjas.zip para distribuir a extensão
node ferramentas/gerar-icones.cjs   # regenera os PNGs a partir de extensao/icones/icone.svg
```
