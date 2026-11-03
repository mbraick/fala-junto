# Fala Junto

Prancha de Comunicação Aumentativa e Alternativa (CAA) gratuita, de código aberto e em português do Brasil. Ela foi pensada para crianças com autismo e funciona em tablets e celulares Android como app instalado (PWA), inclusive sem internet.

## O que o app faz

- **Vocabulário pronto:** prancha inicial com 45 quadros e 15 pastas (Pessoas, Comida, Bebidas, Sentimentos, Brincar, Lugares, Corpo, Rotina, Ações, Perguntas, Conversa, Descrever, Objetos, Cores e Números), com cerca de 750 quadros no total, escolhidos para crianças de 4 a 13 anos.
- **Pasta Objetos:** 300 objetos coloridos em 10 pranchas (animais, frutas, casa, brinquedos, transportes, roupas, natureza, escola…), para procurar e apontar.
- **Jogo “Cadê?”:** o app pergunta em voz alta e a criança toca na figura certa, com comemoração no acerto, dica depois de 2 erros e dificuldade ajustável (4 a 30 figuras).
- **Modo foco:** destaca as palavras que estão sendo ensinadas, sem esconder o resto.
- **Palavras relacionadas:** depois de um toque, sugere palavras ligadas (ex.: comer → com fome, mais, acabou) para montar frases mais rápido.
- **Dicas para pais e terapeutas:** guia curto de modelagem e uso nas rotinas, dentro do app.
- **Criar figura com IA:** texto pronto para o Image Playground (Apple), ChatGPT ou Gemini; a figura criada é escolhida da galeria.
- **Menu lateral fixo** com as pastas, para chegar a qualquer tema com um toque.
- **Cores por tipo de palavra** (chave Fitzgerald modificada): pessoas em amarelo, ações em verde, descrição em azul, social em rosa, "não"/urgente em vermelho, perguntas em roxo, coisas em laranja e pastas em cinza.
- **Frase e voz:** o usuário monta a frase tocando nos quadros, e o app fala usando a voz em português do próprio aparelho, com velocidade e tom ajustáveis.
- **Edição protegida por PIN:** criar, editar, mover e excluir quadros e pranchas. As imagens podem vir da biblioteca, de uma foto ou da galeria, de um emoji ou da busca online no ARASAAC.
- **Varredura por acionador:** com 1 acionador (destaque automático) ou 2 acionadores (avançar e selecionar). Acionadores Bluetooth funcionam como teclado (Espaço e Enter), e há opção de tocar em qualquer lugar da tela para selecionar.
- **Pensado para autistas não verbais:**
  - **Ocultar quadros:** o vocabulário é liberado aos poucos sem mudar o lugar das palavras, o que preserva o planejamento motor.
  - **Segurar para ativar** e **ignorar toques repetidos**, contra toques acidentais e estereotipias.
  - **Fala direta:** cada toque fala na hora, para quem está começando.
  - **Voz gravada por quadro:** por exemplo, a voz da mãe ou de um irmão.
  - **Primeiro → Depois**, um quadro visual de rotina que ajuda nas transições.
  - **Encontrar palavra:** mostra o caminho até a palavra, piscando cada pasta, para o adulto modelar.
  - **Relatório de uso** local, com as palavras mais usadas e os toques por dia, exportável em CSV para a fonoaudióloga.
- **Importar e exportar** no formato Open Board (.obf para uma prancha, .obz para o backup completo), compatível com CoughDrop, LibreAAC e outros apps.
- **Funciona offline**, e os dados ficam só no aparelho: sem conta, sem anúncios e sem coleta de dados.

## Como publicar (grátis)

O app é um site estático. Basta hospedar esta pasta em qualquer endereço com HTTPS.

**Opção 1: GitHub Pages**
1. Crie um repositório no GitHub (ex.: `fala-junto`) e envie todos os arquivos desta pasta.
2. Vá em *Settings → Pages → Branch: main / root* e salve.
3. Em 1 ou 2 minutos o app estará em `https://SEU-USUARIO.github.io/fala-junto/`.

**Opção 2: Netlify ou Cloudflare Pages:** arraste a pasta para a área de deploy.

## Como testar e instalar no Windows (PC)

1. Extraia o `fala-junto.zip`: clique com o botão direito em **Extrair tudo**. Não rode o app de dentro do zip.
2. Dê dois cliques em **`Abrir Fala Junto (Windows).bat`**. Uma janela preta abre e o app aparece no navegador em `http://localhost:8765`.
   - Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**. Isso acontece porque o arquivo veio da internet.
3. Para instalar como programa:
   - **Edge:** clique no ícone de instalar na barra de endereço (ou **⋯ → Aplicativos → Instalar este site como um aplicativo**).
   - **Chrome:** clique no ícone de instalar na barra de endereço (ou **⋮ → Transmitir, salvar e compartilhar → Instalar página como app**).
4. O Fala Junto aparece no Menu Iniciar e pode ser fixado na barra de tarefas. Depois de instalado, ele abre e funciona **mesmo com a janela preta fechada e sem internet**.

No PC, o mouse e o teclado funcionam normalmente. Acionadores USB ou Bluetooth que imitam Espaço e Enter funcionam na varredura. A voz usa as vozes em português instaladas no Windows (ex.: Microsoft Francisca ou Maria). Para incluir mais vozes, vá em *Configurações → Hora e idioma → Fala*.

Para quem já tem o app publicado na internet (GitHub Pages, por exemplo), basta abrir o endereço no Edge ou Chrome e instalar da mesma forma, sem precisar do `.bat`.

## Como instalar no Android

1. Abra o endereço no **Chrome** do tablet ou celular.
2. Toque em **⋮ → Instalar app** (ou "Adicionar à tela inicial").
3. Abra pelo ícone. A partir daí o app funciona sem internet.

Dica: em uso com a criança, ative a **Fixação de tela** do Android (*Configurações → Segurança → Fixar app*) para ela não sair do app sem querer.

## Como instalar no iPhone e iPad

O iOS só instala apps web pelo **Safari** e a partir de um endereço na internet (HTTPS). Por isso, publique antes no GitHub Pages ou Netlify (veja "Como publicar").

1. Abra o endereço no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta para cima) → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra pelo ícone **Fala Junto**. O app abre em tela cheia e funciona sem internet.

Dicas para iPad:
- **Acesso Guiado:** prende a criança no app. Ative em *Ajustes → Acessibilidade → Acesso Guiado* e depois toque 3 vezes no botão lateral dentro do app.
- **Voz melhor:** em *Ajustes → Acessibilidade → Conteúdo Falado → Vozes → Português (Brasil)*, baixe a **Luciana (Aprimorada)** e escolha-a nas configurações do Fala Junto.
- **Backup:** "Exportar tudo (.obz)" abre o menu de compartilhar do iOS. Salve em Arquivos, iCloud Drive ou mande por WhatsApp.
- Requer iOS ou iPadOS 16.4 ou mais recente.

## Publicar na App Store (opcional)

É possível transformar o mesmo código em app da App Store com o **Capacitor** (capacitorjs.com). Isso exige um Mac com Xcode e uma conta Apple Developer (US$ 99/ano), e a Apple costuma pedir recursos que vão além de um site empacotado. Para uso em famílias e escolas, a instalação pelo Safari já resolve.

## Publicar na Google Play (opcional)

Use o [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) ou o [PWABuilder](https://www.pwabuilder.com) para empacotar o endereço publicado como app Android (TWA) e gerar o arquivo `.aab` para a Play Console (taxa única de US$ 25).

## Testar no computador

```
cd fala-junto
python3 -m http.server 8080
# abra http://localhost:8080
```

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html` | Interface e estilos |
| `app.js` | Lógica: grade, voz, edição, varredura, OBF/OBZ, armazenamento |
| `data.js` | Vocabulário padrão e índice da biblioteca de símbolos |
| `symbols.js` | Símbolos SVG embutidos (Mulberry `m-*` e OpenMoji `e-*`) |
| `sw.js` | Service worker (offline) |
| `manifest.webmanifest`, `icon-*.png` | Instalação como app |
| `jszip.min.js` | Leitura e gravação de arquivos .obz |

## Licenças

- **Código do app:** MIT (veja `LICENSE`).
- **Símbolos Mulberry** (símbolos `m-*` em `symbols.js`): © Steve Lee, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), [mulberrysymbols.org](https://mulberrysymbols.org).
- **OpenMoji** (símbolos `e-*` em `symbols.js`): [openmoji.org](https://openmoji.org), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- **ARASAAC** (busca opcional, online): pictogramas de Sergio Palao, propriedade do Governo de Aragão (Espanha), [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/). Só podem ser usados sem fins comerciais.
- **JSZip:** MIT ou GPLv3.

Os símbolos foram escolhidos para o vocabulário em português e não seguem nenhum page set proprietário.
