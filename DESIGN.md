---
name: Casa Mia
description: Enxoval da casa nova, item por item, organizado na prancheta do Nino.
colors:
  linho: "#f8f3eb"
  cafe-tostado: "#2f2a26"
  terracota-artesanal: "#c2603f"
  terracota-profundo: "#a34c30"
  terracota-queimado: "#8a3f27"
  salvia: "#5b6e50"
  salvia-clara: "#93a386"
  salvia-chip: "#e3e9da"
  salvia-chip-texto: "#3f4d38"
  azulejo-noturno: "#244b66"
  areia: "#d8c9b3"
  areia-escura: "#958571"
  areia-suave: "#f2ece5"
  linho-tingido: "#f0e8dc"
  cartao: "#ffffff"
  cartao-quente: "#fbf8f4"
  linha: "#e7ded1"
  apoio: "#6f6358"
  apoio-forte: "#635b52"
  hover-quente: "#f2e8dc"
  hover-quente-texto: "#8b4329"
  trilho-progresso: "#f4f0ea"
  destrutivo: "#b42318"
  preco-caiu-fundo: "#e6efd8"
  preco-caiu: "#3f5a1f"
  preco-subiu-fundo: "#f7e4de"
  preco-subiu: "#9a3a22"
  menor-preco-fundo: "#fbe7c9"
  menor-preco: "#8a4a0b"
typography:
  display:
    fontFamily: "Fraunces Variable, Fraunces, ui-serif, Georgia, serif"
    fontSize: "clamp(34px, 4.7vw, 58px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.025em"
    fontVariation: "'SOFT' 100"
  headline:
    fontFamily: "Fraunces Variable, Fraunces, ui-serif, Georgia, serif"
    fontSize: "clamp(28px, 3.6vw, 42px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontVariation: "'SOFT' 100"
  title:
    fontFamily: "Fraunces Variable, Fraunces, ui-serif, Georgia, serif"
    fontSize: "clamp(24px, 2.6vw, 32px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
    fontVariation: "'SOFT' 100"
  card-title:
    fontFamily: "Fraunces Variable, Fraunces, ui-serif, Georgia, serif"
    fontSize: "19px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.2px"
  lead:
    fontFamily: "Nunito Variable, Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: "Nunito Variable, Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Nunito Variable, Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.25
  meta:
    fontFamily: "Nunito Variable, Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
  eyebrow:
    fontFamily: "Nunito Variable, Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.14em"
rounded:
  tag: "4px"
  button-app: "7px"
  item: "8px"
  field: "10px"
  card-app: "11px"
  base: "12px"
  button: "14px"
  frame: "18px"
  card: "24px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "14px"
  "5": "20px"
  "6": "28px"
  "7": "48px"
components:
  button-primary:
    backgroundColor: "{colors.terracota-profundo}"
    textColor: "{colors.cartao}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 22px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.terracota-queimado}"
    textColor: "{colors.cartao}"
  button-secondary:
    backgroundColor: "{colors.cartao}"
    textColor: "{colors.terracota-profundo}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 22px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.linho-tingido}"
    textColor: "{colors.terracota-queimado}"
  button-app:
    backgroundColor: "{colors.terracota-profundo}"
    textColor: "{colors.cartao}"
    rounded: "{rounded.button-app}"
    padding: "13px 23px"
    height: "50px"
  card-landing:
    backgroundColor: "{colors.cartao-quente}"
    textColor: "{colors.cafe-tostado}"
    rounded: "{rounded.card}"
    padding: "30px 26px 28px"
  card-app:
    backgroundColor: "{colors.cartao}"
    textColor: "{colors.cafe-tostado}"
    rounded: "{rounded.card-app}"
    padding: "20px 21px"
  item-row:
    backgroundColor: "{colors.cartao}"
    textColor: "{colors.salvia}"
    rounded: "{rounded.item}"
    padding: "17px 18px"
  chip-room:
    backgroundColor: "{colors.salvia-chip}"
    textColor: "{colors.salvia-chip-texto}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "6px 11px"
  input:
    textColor: "{colors.cafe-tostado}"
    rounded: "{rounded.field}"
    padding: "4px 12px"
    height: "36px"
---

# Design System: Casa Mia

## Overview

**Creative North Star: "A prancheta do Nino"**

O Casa Mia é uma lista organizada com afeto. A interface se comporta como a pranchetinha que o Nino carrega: papel claro de linho, anotações em café tostado, o traço terracota que marca o que importa e o risco que celebra cada item conquistado. A ordem é a forma de cuidado: nada grita, tudo tem lugar, e o próximo passo está sempre visível.

A densidade é de lista, não de painel. Linhas de item, cômodos e progresso aparecem em superfícies quase planas, separadas por bordas finas de areia, com respiro generoso entre grupos. A landing ganha mais escala e calor (títulos em Fraunces grande, o Nino como personagem, telas reais do app), mas fala a mesma língua de papel, traço e check.

Os componentes são artesanais e táteis no comportamento: cantos macios, alvos de toque grandes, o botão que sobe no hover e encolhe ao toque, o check que se preenche de sálvia e risca o nome. Textura de material e contornos de costura ainda não existem no código; se entrarem, devem nascer dos mesmos tokens e continuar discretos.

**Key Characteristics:**
- Linho (#f8f3eb) como papel de fundo, branco para cartões, café tostado para o texto.
- Uma única ação forte por tela, em terracota profundo; o terracota oficial fica para marca e áreas grandes.
- Conquista em sálvia e sempre com redundância: check preenchido mais nome riscado mais número escrito.
- Superfícies quase planas: a borda separa, a sombra só respira.
- Fraunces com SOFT 100 nos títulos, Nunito em toda a interface e nos números.
- O Nino é o único personagem; a interface não ganha ilustrações concorrentes.

## Colors

Uma paleta de barro e linho: neutros quentes e levemente rosados, um terracota em três intensidades, sálvia para conquistas e um único azul profundo para informação.

### Primary
- **Terracota Profundo** (`terracota-profundo`): fundo do botão principal, links, textos em terracota, itálico de destaque nos títulos e anel de foco. É o terracota que passa no contraste com texto branco.
- **Terracota Queimado** (`terracota-queimado`): hover e estado pressionado do botão principal e dos botões de apoio.
- **Terracota Artesanal** (`terracota-artesanal`): a cor da marca, do Nino e do logo. Só em áreas grandes, ilustração, barras de progresso de destaque e texto a partir de 24px (como os números "01" a "04" do Como funciona).

### Secondary
- **Sálvia** (`salvia`): status concluído, texto de conquista, ícones de check nas listas de benefícios e barra de cômodo completo na landing.
- **Sálvia Clara** (`salvia-clara`): círculo do item conquistado e preenchimento das barras de progresso no app.
- **Sálvia de Chip** (`salvia-chip`) com **texto** (`salvia-chip-texto`): etiquetas de cômodo e de semana.

### Tertiary
- **Azulejo Noturno** (`azulejo-noturno`): informação, links de apoio e selos informativos (como a situação "Pesquisando"). Nunca compete com o botão principal.

### Neutral
- **Linho** (`linho`): fundo de todas as páginas.
- **Café Tostado** (`cafe-tostado`): texto principal e títulos.
- **Apoio** (`apoio`) e **Apoio Forte** (`apoio-forte`): texto secundário no app e na landing, respectivamente.
- **Cartão** (`cartao`): cartões, diálogos, linhas de item e campos.
- **Cartão Quente** (`cartao-quente`): cartões da landing, um branco que ainda pertence ao linho.
- **Areia Suave** (`areia-suave`) e **Linho Tingido** (`linho-tingido`): faixas de seção, fundos de ícone, hover de botões de apoio.
- **Linha** (`linha`): bordas de cartão e divisores. **Areia** (`areia`) é a cor-base de onde saem os tons de areia; **Areia Escura** (`areia-escura`) é a borda de campo, a 3,2:1 sobre o linho.
- **Hover Quente** (`hover-quente`) com **texto** (`hover-quente-texto`): hover de itens de menu e botões do shadcn.
- **Trilho de Progresso** (`trilho-progresso`): o trilho vazio das barras.

### Etiquetas de preço
Sempre em pares de fundo e texto: `preco-caiu-fundo`/`preco-caiu`, `preco-subiu-fundo`/`preco-subiu` (salmão, nunca vermelho), `menor-preco-fundo`/`menor-preco`. `destrutivo` só aparece em ação destrutiva confirmada e erro de formulário, sempre com texto.

### Named Rules
**The Mistura de Base Rule.** No código, cada tom é um `color-mix` das cores-base de `src/index.css` (`--cm-bg`, `--cm-text`, `--cm-primary`, `--cm-primary-dark`, `--cm-success`, `--cm-accent`, `--cm-olive-soft`, `--cm-sand`, `--cm-action`, `--cm-action-hover`). Recolorir é mudar só a base. Nunca redefina uma cor-base a partir dela mesma num escopo menor: o ciclo invalida todas as variáveis que dependem dela.

**The Terracota Certo Rule.** Texto branco só sobre `terracota-profundo` ou `terracota-queimado`. `terracota-artesanal` dá 4,2:1 com branco e 3,8:1 sobre o linho: é cor de marca, não de botão nem de texto pequeno.

**The Conquista Redundante Rule.** Nenhum estado depende só de cor: o item conquistado é riscado, o progresso tem número escrito, o cômodo completo diz "Completo".

## Typography

**Display Font:** Fraunces Variable, com eixo SOFT em 100 (fallback ui-serif, Georgia)
**Body Font:** Nunito Variable (fallback ui-sans-serif, system-ui)

**Character:** uma serifada quente de pontas arredondadas, que conversa com o desenho do Nino, sobre uma sans redonda e compacta que deixa listas e preços fáceis de ler. Os dois pesos de voz nunca trocam de papel.

### Hierarchy
- **Display** (600, clamp 34–58px, 1,08): só o título do herói da landing. Uma palavra pode ir em itálico terracota profundo ("*item por item.*").
- **Headline** (600, clamp 28–42px, 1,15): títulos de seção da landing.
- **Title** (600, clamp 24–32px, 1,15): títulos de passo e de bloco.
- **Card Title** (500, 19px, 1,3): títulos de cartão no app (Planejamento).
- **Lead** (400, 18px, 1,65): texto de apoio do herói, até cerca de 560px de largura.
- **Body** (400, 15px, 1,6): texto corrido da interface; na landing, parágrafos de seção vão a 17px.
- **Label** (700, 15px; 14px no pequeno e 16px no grande): rótulos de botão.
- **Meta** (600, 12px, 1,4, algarismos tabulares): etiquetas, metadados do item, legendas.
- **Eyebrow** (800, 12px, 0,14em, caixa-alta, terracota profundo): só na landing, acima de títulos de seção.

### Named Rules
**The SOFT Rule.** A Fraunces é sempre carregada com `SOFT@100` na URL do Google Fonts; sem o eixo, as pontas voltam retas e o título deixa de parecer o Nino.

**The Números em Nunito Rule.** Preços, quantidades e percentuais ficam em Nunito com `tabular-nums`. A Fraunces não tem algarismos tabulares e nunca entra em colunas de valores.

## Layout

- **Contêiner:** `min(1160px, 100% - 40px)` na landing, centralizado; seções internas limitam texto a 560–660px e grades de cartão a 1060px.
- **Ritmo vertical:** seções com `clamp(48px, 7vw, 88px)` de respiro em cima e embaixo; cabeçalho de seção centralizado com 40px até o conteúdo.
- **Faixas:** o fundo alterna entre linho, cartão quente (Como funciona) e areia suave (Nino), sempre com borda `linha` em cima e embaixo, para a página ter capítulos sem sombras.
- **Escala de espaço:** 4, 8, 12, 14, 20, 28 e 48px (tokens `spacing`). Gutter de 20px no celular e 48px no desktop do app.
- **Pontos de quebra observados:** 359/380px (cabeçalho compacto), 400 e 480px (celular), 600–640px, 767/768px, 860/920px (menu vira gaveta, grades viram uma coluna) e 1023/1024px no app.
- **Cabeçalho da landing:** no topo é transparente e alinhado ao conteúdo; ao rolar vira uma barra de vidro em pílula (desktop) ou faixa (celular).

## Elevation & Depth

O sistema é quase plano. A separação vem da borda `linha` de 1px e da alternância de tons de fundo; a sombra é um respiro curto e quente, nunca uma camada estrutural. Elevação de verdade só aparece em resposta a estado (hover de cartão, plano em destaque) e em molduras de imagem.

### Shadow Vocabulary
- **Respiro de cartão** (`box-shadow: 0 1px 2px #422d240d, 0 10px 24px -18px #3b2a2040`): cartões e listas da landing em repouso.
- **Cartão elevado** (`box-shadow: 0 18px 36px -20px #3b2a2059`): hover de cartão e o plano em destaque.
- **Quase nada** (`box-shadow: 0 1px 2px rgba(66,45,36,0.05)`): cartões do Planejamento no app.
- **Moldura** (`box-shadow: 0 24px 48px -28px rgba(59,42,32,0.45)`): telas do app e imagens de destaque na landing.
- **Botão principal** (`box-shadow: 0 2px 6px #873c2526`): o leve peso do botão terracota.

### Named Rules
**The Borda Primeiro Rule.** Se dois elementos precisam se separar, use a borda `linha` ou um tom de fundo antes de pensar em sombra. Halos coloridos sem deslocamento são decoração e não entram.

## Shapes

Cantos macios em toda parte, escalando com o tamanho do objeto: etiqueta de situação 4px, botão do app 7px, linha de item 8px, campos e Select 10px, cartão do Planejamento 11px, diálogos 12px, botão da landing 14px, moldura de imagem 18px, cartão da landing 24px, plano de preço 28px e painel de fechamento 32px. Pílulas (999px) ficam para chips de cômodo, etiquetas de preço, selos e o círculo de conquista. A porta em arco do Nino é a única silhueta de assinatura e aparece na prévia do app e no progresso.

### Named Rules
**The Canto Proporcional Rule.** Quanto maior a superfície, maior o raio; nunca um raio grande em elemento pequeno nem canto vivo em cartão.

## Components

### Buttons
Artesanais e táteis: sobem no hover, encolhem para 98% ao pressionar, nunca brilham.
- **Shape:** 14px na landing (`button`), 7px no app (`button-app`).
- **Primary:** terracota profundo com texto branco e leve sombra; 44px de altura (40px no pequeno, 54px no grande). No app, 50px (42px no pequeno).
- **Hover / Focus:** hover em terracota queimado; foco com contorno sólido de 3px em terracota profundo, 4px de distância.
- **Secondary:** fundo branco, contorno de 1,5px e texto em terracota profundo; hover em linho tingido. É o mesmo para "Entrar", "Ver como funciona" e o plano não destacado, para nunca sumir no linho.
- **Navegação da landing:** links em pílula cujo preenchimento terracota "varre" da esquerda para a direita no hover.

### Chips
- **Style:** chip de cômodo em sálvia de chip com texto sálvia escuro, pílula, 12–13px em peso 700; na landing, chips de cômodo em linho tingido com ícone terracota.
- **State:** situação do item em etiquetas de 4px: Pesquisando (azulejo sobre azul claro), Comprado, Recebido e Já tenho (tons de sálvia e areia).

### Cards / Containers
- **Corner Style:** 24px na landing, 11px no app.
- **Background:** cartão quente na landing, cartão branco no app.
- **Shadow Strategy:** respiro de cartão em repouso; cartão elevado no hover (ver Elevation & Depth).
- **Border:** 1px `linha`; o plano em destaque usa 2px terracota artesanal.
- **Internal Padding:** 30/26/28px na landing, 20/21px no app.

### Inputs / Fields
- **Style:** `Input` do shadcn: fundo transparente (herda o cartão ou o linho), borda `areia-escura`, raio 10px, 36px de altura e 12px de respiro lateral. O rótulo fica acima do campo.
- **Focus:** contorno sólido de 2px em terracota profundo, 2px de distância (regra global de `src/product.css`), somado ao anel do shadcn.
- **Error:** texto e borda em `destrutivo`, sempre com mensagem.

### Navigation
- **Landing:** marca à esquerda, links no centro, ação à direita; abaixo de 920px os links vão para uma gaveta e a ação principal continua visível (abaixo de 400px, só o ícone da casa).
- **App:** abas e menu do shadcn com hover em `hover-quente`.

### Linha de item (signature)
O coração do produto. Fundo branco, borda `linha` de 1px, raio 8px, 17×18px de respiro. À esquerda, o círculo de conquista de 23px; ao conquistar, ele se preenche de sálvia clara com check branco, o nome é riscado e o fundo esquenta levemente. Etiquetas de cômodo, quantidade e preço em `meta`; o valor fica à direita.

### Progresso por cômodo (signature)
Trilho fino (4–8px) em `trilho-progresso` com a fração escrita ao lado ("9 de 14 itens"). No app o preenchimento é sálvia clara; na landing, terracota profundo, virando sálvia quando o cômodo chega a 100%.

## Do's and Don'ts

### Do:
- **Do** usar uma única ação terracota profunda por tela; o resto é botão de apoio branco com contorno.
- **Do** separar superfícies com a borda `linha` (#e7ded1) e tons de fundo antes de recorrer a sombra.
- **Do** escrever todo tom novo como `color-mix` das cores-base de `src/index.css`.
- **Do** manter texto a 4,5:1 (3:1 a partir de 24px) e foco visível em 3px terracota profundo.
- **Do** usar a arte oficial do Nino (`public/brand/`) sem redesenhar, recolorir ou adicionar acessórios.
- **Do** limitar movimento automático a menos de 5 s e respeitar `prefers-reduced-motion`; transições de 150 a 300ms.

### Don't:
- **Don't** usar `terracota-artesanal` (#c2603f) como fundo de botão com texto branco ou em texto abaixo de 24px.
- **Don't** usar vermelho para orçamento ou preço: "acima da faixa" é salmão (`preco-subiu-fundo`).
- **Don't** usar emoji ou glifos como ícone: ícones são Lucide em traço, 16px dentro de botões.
- **Don't** colocar a Fraunces em colunas de valores nem trocar a Nunito por DM Sans.
- **Don't** criar cartões com borda colorida grossa de um lado só nem halos coloridos sem deslocamento.
- **Don't** deixar animação em loop infinito chamando atenção (CTA pulando, plano pulsando).
