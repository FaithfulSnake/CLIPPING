# Ferramentas Fanjas

Extensão do navegador (Chrome/Edge) que reúne ferramentas do escritório. Não precisa executar nada no computador (sem Python, sem cmd).

| Ferramenta | O que faz |
| --- | --- |
| **Transcrição para o e-mail** | Na página da matéria, clique em **Iniciar captura**: o **texto integral** vai direto para o e-mail de notícias da área, **exatamente como o site publica** (porcentagens, valores, datas e acentos sem erro de leitura), sem menus, anúncios nem “Leia também”. Se a página só mostra o texto como imagem, a extensão lê os prints com **OCR** e marca em amarelo o que precisa ser conferido. |
| **Prints com rolagem** | Rola a página do topo até o fim, tira um print de cada trecho e baixa um **ZIP** com os prints **numerados na ordem da página** (em Configurações → Resultado da captura → ZIP com os prints). |
| **Notícias jurídicas** | Monta **um e-mail por área** (Tributário, Empresarial e Trabalhista) no modelo do escritório, com o **texto integral** das matérias, **sem resumir**, pronto para colar no Outlook. Recebe as matérias transcritas e também texto colado ou arquivos .txt. |

Tudo fica no mesmo ícone: clique nele e escolha a aba (**Captura** ou **Notícias jurídicas**).

---

# Transcrição das matérias

### Usar

1. Abra a matéria no site (faça login antes, se o site pedir).
2. Clique no ícone da extensão, aba **Captura**, e em **Iniciar captura** (ou <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
3. Em um ou dois segundos abre a página **Notícias jurídicas** com a matéria já no e-mail da área (Tributário, Empresarial ou Trabalhista), com título, autor, data e link. Confira e use **Copiar e-mail para o Outlook**.
4. Próxima matéria: abra e repita. Cada uma entra separada, com o título e o texto integral dela, no e-mail da área; a ordem pode ser trocada na lista.

### Por que não tem erro de leitura

A extensão não “lê” a imagem da tela: ela pega o texto que o próprio site manda para o navegador, letra por letra. **20,5%**, **R$ 1.234.567,89**, **§ 2º**, **2ª Turma**, **31/12/2025** e **nº 0801234-56.2025.8.10.0001** chegam exatamente assim, sem trocar vírgula por ponto nem “ª” por “º”. Nada é resumido, reescrito nem completado.

Para achar o corpo da matéria e deixar de fora **menus, anúncios, banners, barras laterais, “Leia também”, botões de compartilhar, newsletter, comentários e rodapé**, ela usa o Readability (o mesmo do “Modo de leitura” do Firefox) e filtros próprios para os portais brasileiros. Ficam **intertítulos** (em negrito no e-mail), **listas**, **tabelas** e **citações**. A linha fina (o texto logo abaixo do título) entra como primeiro parágrafo, e a assinatura (“Por Fulano | data”) vira o autor e a data da matéria.

**Fotos e vídeos saem com a legenda e o crédito deles** (“Foto: Fulano”, “Reprodução / YouTube”, “(Imagem: Arte Migalhas)”). Também saem as chamadas do site no meio do texto (“assine a newsletter”, “siga no WhatsApp”, “teste grátis”) e os links de navegação, como “Mais recente / Próxima”. Isso é feito **pela estrutura da página** (o quadro da foto, a linha colada nela, a caixa da chamada), **nunca por palavra**: “mais recente”, “próxima” ou “foto” no meio de um parágrafo continuam lá. Bloco com link para o documento do caso (acórdão em PDF, site do tribunal) nunca é tirado.

### Quando entra o OCR

Só quando a página **não tem o texto** da matéria: ele está numa imagem, ou o site embaralha as letras de propósito para não deixar copiar. Aí a extensão tira os prints só da coluna da matéria e lê com o **Tesseract** (embutido na extensão: nada sai do computador). Os prints são juntados pela posição exata de cada um na página, então a parte repetida entre um print e o seguinte não sai duplicada.

Toda palavra em que o OCR não tem certeza, e todo número, porcentagem, valor, “º”, “ª” e “§” que não foi lido com confiança alta, fica **marcado entre ⟦ ⟧ no texto e em amarelo no e-mail**, para você conferir (o link **Ver os prints** abre as imagens) em vez de a extensão adivinhar. Depois de conferir, apague os ⟦ ⟧. Ao copiar um e-mail com trechos ainda marcados, a extensão avisa.

### Configurações da transcrição

Em **Configurações**, no popup (gravadas só ao clicar em **Salvar**):

- **Resultado da captura:** *Texto da matéria no e-mail de notícias* (padrão), *ZIP com os prints* (o funcionamento de antes) ou *Os dois*.
- **Leitura do texto:** *Texto da página, com OCR só quando faltar* (padrão) ou *Sempre OCR dos prints* (para um site que mostre o texto errado na página).

### Limites da transcrição

- Entra o que o site mostra para você: em matéria com paywall, faça login antes.
- PDF aberto no leitor do navegador e conteúdo em quadro (iframe) de outro site não são lidos direto.
- Se a extensão pegar a parte errada da página, use **Área do print → Marcar uma região** sobre a coluna da matéria (só o que estiver nela entra). Se a matéria rola numa parte própria da tela (coluna lateral, painel), use **Área de rolagem → Escolher na página** e clique nela.
- O OCR leva alguns segundos por print e sempre pede a conferência dos trechos em amarelo.

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
- **Sites com painel interno:** em sistemas e webmails em que só uma parte da tela rola, a ferramenta encontra e rola esse painel. Também funciona com páginas dentro de quadros (iframes) do mesmo site. Se ela escolher a parte errada (por exemplo, uma coluna lateral), dá para **escolher na página** qual parte rola (veja abaixo).
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
2. Em **Configurações → Resultado da captura**, escolha **ZIP com os prints** (ou **Os dois**) e clique em **Salvar**. Depois, no ícone da extensão, aba **Captura**, confira o **nome da pasta** e escolha o **pacote** (veja abaixo).
3. Clique em **Iniciar captura**. Não troque de aba nem minimize a janela até terminar. Se trocar, a captura pausa e continua quando você voltar.
4. Ao terminar, abre uma aba com a prévia de todos os prints e o ZIP é salvo sozinho (o botão **Baixar ZIP**, ou **Salvar no pacote**, salva de novo).

**Atalho:** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> inicia com as últimas opções e o último pacote escolhido; apertar de novo para e salva o que já foi capturado. Para trocar a tecla: `chrome://extensions/shortcuts`.

### Escolher a parte que rola e a área do print

As duas opções ficam em **Configurações** e vêm desligadas (o padrão continua automático e com a tela inteira):

- **Área de rolagem → Escolher na página antes de capturar:** para sites em que o texto fica numa coluna lateral ou num painel fora do centro. Ao clicar em **Iniciar captura**, a própria página mostra em azul a parte que rola sob o mouse; clique nela. **Automático** deixa a extensão decidir e **Usar a mesma de antes** repete a escolha feita da última vez naquele site.
- **Área do print:**
  - **Tela inteira** (padrão): cada print é a área visível inteira.
  - **Só a área que rola:** cada print é recortado na parte que rola (sem menus e colunas em volta).
  - **Marcar uma região na página antes de capturar:** arraste para desenhar um retângulo; cada print fica só com o que estiver dentro dele. <kbd>Enter</kbd> confirma, <kbd>Esc</kbd> cancela, **Tela inteira** desiste do recorte e **Usar a mesma de antes** repete a última região marcada naquele site (com a janela do mesmo tamanho).

Com o recorte, a rolagem anda a altura da área recortada (menos a sobreposição), então nada do que passa por ela fica de fora.

### Pacotes de prints

Para juntar os ZIPs de várias matérias (por exemplo, todas as de um site no mesmo dia), use **pacotes**. Cada pacote é uma **pasta principal com o nome dele**, com os ZIPs **numerados na ordem das matérias** e um **Índice do pacote.txt** que identifica o pacote e lista o que tem dentro (página, endereço, data e quantidade de prints de cada matéria):

```
Pacotes de prints/                 ← a pasta escolhida para os pacotes (ou Downloads)
└── STF 21-10-2026/                ← o pacote
    ├── 01 - STF afasta ICMS sobre transferências.zip
    ├── 02 - Reforma tributária regras de transição.zip
    ├── …
    └── Índice do pacote.txt
```

- **Antes de cada captura**, o popup pergunta o **pacote**: *Sem pacote* (o ZIP fica solto em Downloads, como antes), um dos pacotes que já existem (com quantos ZIPs cada um tem) ou **Novo pacote…**, que já sugere um nome com o site e a data (“ConJur 07-10-2026”). Embaixo aparece o caminho exato, já com o número: “Vai para: Pacotes de prints/STF 21-10-2026/03 - Matéria.zip”.
- A escolha fica marcada para a próxima captura, então na sequência de matérias do mesmo site é só clicar em **Iniciar captura**.
- **Depois de salvar**, a página do resultado mostra onde o ZIP ficou e deixa **mover o ZIP para outro pacote** (ou criar um novo ali mesmo). A cópia que ficou no lugar antigo é apagada e o índice dos dois pacotes é atualizado.
- **Gerenciar pacotes** (no popup ou no resultado) abre a lista de pacotes: os ZIPs de cada um e se ainda estão na pasta, **Exportar pacote (.zip)**, **Ver prints**, **Tirar do pacote**, **Usar na próxima captura** e **Excluir**. Tirar e excluir só mexem na lista (e no índice); os arquivos continuam na pasta.
- **Exportar pacote (.zip)** junta o pacote inteiro num ZIP só: a pasta principal do pacote com o índice e **uma pasta para cada matéria**, já com os prints dentro (sem ZIP dentro de ZIP). Bom para mandar para alguém ou guardar.

#### Onde salvar os pacotes

Fica no topo de **Gerenciar pacotes** e só muda ao clicar em **Salvar**:

- **Uma pasta escolhida por você** (recomendado): clique em **Escolher pasta…** e crie/escolha uma pasta só para os pacotes, como `Documentos/Pacotes de prints` (o Chrome não deixa escolher a pasta Downloads ou Documentos inteira). A extensão grava **direto** nela, sem a janela “Salvar como”, e cada pacote ganha a pasta principal dele assim que é criado. De vez em quando (por exemplo, depois de reabrir o navegador) o Chrome pede para confirmar o acesso: clique em **Permitir**.
- **Pasta Downloads do navegador** (padrão): o Chrome cria a pasta de cada pacote dentro de Downloads.

> Se o Chrome estiver configurado para **perguntar onde salvar cada arquivo** (`chrome://settings/downloads`), ele abre a janela “Salvar como” a cada ZIP e a pasta do pacote não é criada sozinha na pasta Downloads. A extensão percebe isso e avisa; a solução é escolher uma pasta para os pacotes (acima) ou desligar essa opção do Chrome.

### Configurações (no popup)

As mudanças valem para a próxima captura assim que você mexe, mas só ficam **gravadas ao clicar em Salvar** (enquanto isso aparece “não salvas”). **Voltar às opções padrão** põe o padrão na tela; clique em Salvar para manter.

| Opção                                  | Padrão      | Para que serve                                                       |
| -------------------------------------- | ----------- | -------------------------------------------------------------------- |
| Resultado da captura                   | Texto no e-mail | **ZIP com os prints** para receber o ZIP, ou **Os dois**         |
| Leitura do texto                       | Texto da página | **Sempre OCR dos prints** só para sites que mostram o texto errado |
| Área de rolagem                        | Automática  | **Escolher na página** para colunas laterais ou painéis fora do centro |
| Área do print                          | Tela inteira | Recortar os prints na área que rola ou numa região marcada           |
| Sobreposição entre prints              | 10%         | Quanto do final de um print se repete no próximo                     |
| Espera após cada rolagem               | 700 ms      | Aumente em sites lentos ou com muitas imagens                        |
| Limite de prints                       | 400         | Evita rolar para sempre em páginas "infinitas"                       |
| Formato                                | PNG         | PNG é melhor para leitura; JPEG gera arquivos menores                |
| Esconder cabeçalhos/rodapés fixos      | ligado      | Tira menu e avisos fixos a partir do 2º print                        |
| Incluir `info.txt`                     | ligado      | Guarda o endereço, a data e o pacote da captura junto dos prints     |
| Baixar o ZIP automaticamente           | ligado      | Desligado, o ZIP só é salvo ao clicar em **Baixar ZIP**              |

A extensão guarda os prints das 5 capturas mais recentes fora de pacotes, para salvar de novo; os das matérias em pacotes ficam guardados para **Ver prints** e **Exportar pacote** até o pacote sair da lista. O botão **Apagar** remove uma captura.

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
- Com **região marcada**, entra no print o que passa por ela enquanto a página rola: o começo da página que fica acima da região (no topo) e o final que fica abaixo dela (no fim) não passam por ela. Para pegar tudo, marque a região de cima a baixo da área de leitura.
- A extensão não funciona no Firefox.

---

# Notícias jurídicas

Substitui a montagem dos e-mails de notícias que antes era feita no chat, com uma diferença: **o e-mail leva a matéria inteira**, não um resumo.

### Usar

1. Clique no ícone da extensão → aba **Notícias jurídicas** → **Abrir Notícias jurídicas** (abre numa aba própria).
2. **Copie e cole cada matéria:** no site, selecione a matéria do título até o fim e copie (<kbd>Ctrl</kbd>+<kbd>C</kbd>); volte na aba de notícias e aperte <kbd>Ctrl</kbd>+<kbd>V</kbd> (ou clique em **Colar da área de transferência**). Cada colagem vira uma matéria.
3. **Link:** é achado sozinho pela aba aberta da matéria. Se ficar faltando, copie o endereço da página e cole na aba de notícias: ele vai para a última matéria sem link.
4. **Confira** a lista: área (escolhida pelo assunto), título, autor, link e data. Tudo pode ser corrigido ali mesmo, inclusive o texto. **Não incluir** tira uma matéria do e-mail; as setas mudam a ordem.
5. Em **E-mails**, para cada área:
   - a prévia aparece logo abaixo dos botões, e **Pré-visualizar** mostra o e-mail inteiro em tela cheia;
   - **Copiar e-mail para o Outlook** → no Outlook, clique no corpo da mensagem e cole (<kbd>Ctrl</kbd>+<kbd>V</kbd>);
   - **Abrir no Outlook (Para + Assunto)** cria a mensagem já com destinatários e assunto;
   - **Baixar .html** salva `EMAIL_NOTICIAS_[ÁREA]_DD-MM-AAAA.html`, e **Baixar todos (.zip)** salva os três.

O campo **Para** é preenchido uma vez e fica salvo só no seu navegador (os endereços não vão no código, que é público, nem dentro do e-mail). A lista também fica salva: se fechar a aba sem querer, as matérias continuam lá até você clicar em **Limpar tudo**.

Ainda dá para usar arquivos: em **Importar arquivos .txt ou .zip** (ou soltando os arquivos na página). Cada .txt é uma matéria; valem .zip e pastas com o nome da área (`Tributário/`, `Trabalhista/`…).

**Sem a extensão:** o arquivo [`script/noticias-sem-instalar.html`](script/noticias-sem-instalar.html) é a mesma ferramenta num arquivo só. Baixe e abra com dois cliques no Chrome ou no Edge. Só não acha o link pela aba aberta (cole o endereço da página).

### O e-mail gerado

Segue o modelo do escritório (estilos dentro do próprio HTML, que o Outlook preserva):

- **Assunto** e primeira linha: `Notícias - [Área] - DD.MM.AAAA`, com a data das matérias (a mais frequente; se houver matéria de outro dia, a lista avisa). A data pode ser trocada em cada e-mail.
- **Sumário** numerado, com link para cada matéria.
- Para cada matéria: **título** centralizado em negrito, **`Por: autor`** (só quando houver autor; matérias do JOTA e do Migalhas ganham o nome do portal entre parênteses), **texto integral** justificado, um parágrafo por parágrafo da matéria, e **`Link de Acesso:`**.
- Calibri Light 11 no texto e Calibri nos títulos.

### Como a ferramenta lê a matéria

- **título**: a primeira linha; chapéus curtos acima dele ("OPINIÃO", "Notícias", "TRIBUTÁRIO") são ignorados, e um chapéu com o nome da área já define a área;
- **autor**: a linha "Por Fulano de Tal";
- **link**: a aba aberta com o mesmo título, a linha que for só um endereço `https://…` ou o endereço colado depois;
- **data**: a primeira data do cabeçalho ("05/10/2026", "5 de outubro de 2026, 8h05"…);
- **área**: pelo assunto (termos como ICMS, Carf, CLT, TST, recuperação judicial, sócios…). Quando não dá para ter certeza, a matéria aparece com o aviso **confira a área**.

Ao colar do site, menus, botões ("Compartilhar", "WhatsApp"), imagens e seus créditos ("Spacca") e quadros "Leia também" ficam de fora. Para não depender de adivinhação, o texto pode começar com rótulos (todos opcionais): `Título:`, `Autor:`, `Link:`, `Data:` e `Área:`.

Os avisos da lista ajudam a conferir antes de enviar: **sem link**, **confira a área**, **matéria de outra data** e **texto curto** (quando parece ter vindo só um trecho da matéria).

### Permissões da extensão

Além do necessário para os prints, a extensão pede para **gerenciar downloads** (salvar os ZIPs na pasta do pacote e mostrá-los na pasta), **ler a área de transferência** (botão "Colar" das notícias) e **ver os títulos e endereços das abas abertas** (para achar o link da matéria sozinha). A pasta escolhida para os pacotes só é acessada depois que você a escolhe e o Chrome confirma o acesso. O OCR roda dentro da extensão (por isso ela pede para rodar WebAssembly). Nada sai do seu computador.

## Para quem for mexer no código

```
extensao/            a extensão (Manifest V3)
  manifest.json
  background.js      controla a captura (service worker)
  pagina.js          roda dentro da página: escolhe o que rolar, mede cabeçalhos/rodapés fixos e o recorte
  leitor.js          roda dentro da página: acha o corpo da matéria e devolve o texto exato em blocos
  transcricao.js     monta a matéria do e-mail a partir da leitura da página ou do OCR (funções puras)
  transcrever.js, ocr.js   na página de notícias: recebe as capturas e lê os prints com o Tesseract
  terceiros/         Readability (Mozilla) e Tesseract.js com o modelo de português, com as licenças
  seletor.js         escolha na página antes da captura (parte que rola e região do print)
  comum.js           laço de captura, nomes de arquivo e info.txt (compartilhado com o favorito)
  zip.js             gera o ZIP (sem bibliotecas externas)
  db.js, opcoes.js   armazenamento das capturas e das opções
  popup.*            janela do ícone (abas das ferramentas e escolha do pacote)
  resultado.*        página com a prévia dos prints, onde o ZIP foi salvo e mover de pacote
  pacotes.js         pacotes de prints: nomes aceitos pelo Chrome, numeração, índice e a lista guardada
  destino.js         onde gravar: pasta escolhida (File System Access) ou Downloads, e o aviso do "Salvar como"
  exportar.js        ZIP de uma captura e ZIP do pacote inteiro
  pacotes.html/.css, gerenciador.js   página "Pacotes de prints"
  noticias.html/.css página da ferramenta Notícias jurídicas
  noticias.js        página: colar, lista, prévia, copiar (fonte do noticias-pagina.js)
  noticias-pagina.js gerado: script único da página (funciona até aberta direto do arquivo)
  noticias-texto.js  leitura da matéria, área pelo assunto e montagem do e-mail
  unzip.js           leitura de .zip e da codificação dos .txt
script/
  fonte/painel.js    painel da versão sem instalar
  captura-sem-instalar.js, bookmarklet.txt, instalar-favorito.html,
  noticias-sem-instalar.html                                          gerados (não editar)
ferramentas/         geradores (script, ícones, pacote da extensão)
testes/              testes unitários e de ponta a ponta (páginas e matérias fictícias de exemplo)
```

Comandos (precisam do Node.js 20+; os de ponta a ponta precisam do Playwright com Chromium):

```sh
npm test            # testes unitários
npm run e2e         # abre o Chromium com a extensão: transcrição e OCR, capturas (seletor, recorte, pacotes) e os e-mails de notícias
SO=pacotes npm run e2e   # só os blocos com esses nomes (separados por vírgula)
npm run gerar       # regenera os arquivos gerados depois de mudar extensao/ ou script/fonte/
npm run empacotar   # gera dist/ferramentas-fanjas.zip para distribuir a extensão
node ferramentas/gerar-icones.cjs   # regenera os PNGs a partir de extensao/icones/icone.svg
```
