---
name: analise-referencias-ux
description: Analisa sites de referência enviados pelo usuário e gera um catálogo de ideias de melhoria para o app Casa Mia (layout, design, animações, copy e fluxo), filtradas pelos princípios da marca. Use quando o usuário enviar um link de site para comparar com o app, pedir ideias inspiradas em outros produtos, ou quiser analisar animações e padrões de interface de sites públicos.
---

# Análise de referências de UX

Esta skill observa sites públicos de referência e transforma o que vê em propostas para o Casa Mia. Ela não copia telas, marca ou textos. Cada ideia precisa de uma fonte, um princípio e um status de proposta.

## Acesso ao site

Usar o Claude in Chrome, seguindo a skill `anthropic-skills:chrome-browser`:

1. Carregar as ferramentas com uma única chamada de `ToolSearch`, com `select:` listando tudo que for preciso.
2. Chamar `tabs_context_mcp` no início da sessão.
3. Abrir uma aba nova para cada site com `tabs_create_mcp`. Não reutilizar abas que o usuário não indicou.
4. Fechar as abas criadas ao terminar, a não ser que o usuário peça para mantê-las.
5. Se o site for bloqueado ou a permissão for recusada, registrar isso e seguir em frente. Não contornar.

**Só páginas públicas.** Não fazer login em sites de terceiros nem usar contas do usuário sem pedido explícito. Áreas logadas ficam como "não verificado".

## O que coletar por site

Para cada site, registrar o que for possível observar:

- **Layout:** estrutura da página, grade, espaçamento entre seções, largura do conteúdo, posição da navegação, comportamento em largura de celular quando for possível redimensionar a janela com `resize_window`.
- **Design:** hierarquia tipográfica, família de fontes e tamanhos (lidos dos estilos computados), paleta principal, raios, sombras e estilo de ícones.
- **Componentes:** botões, cards, formulários, listas, estados vazios e mensagens de erro.
- **Animações:** capturar a interação com `gif_creator`, com quadros extras antes e depois de cada ação. Via `javascript_tool`, listar as animações e transições ativas com `document.getAnimations()` e checar se a página respeita `prefers-reduced-motion`. Descrever o movimento como observado: duração aproximada, easing visual, o que anima e o que dispara a animação. Não afirmar valores exatos que não foram lidos.
- **Copy e fluxo:** textos de chamada à ação, mensagens de erro e de sucesso, número de passos em cadastros e formulários, e onde o usuário é pedido para pagar ou assinar.

Preferir `get_page_text` e `read_page` para ler o conteúdo. Usar captura de tela só quando o layout visual for o ponto da análise.

## Filtro da marca

Antes de propor qualquer ideia, comparar com a marca em `docs/branding-casa-mia.md`:

- **Anti-valores (seção 2):** descartar ideias que usem escassez artificial, alertas vermelhos berrantes, banners invasivos ou venda de dados. Muitos sites de varejo usam esses padrões. Marcar a ideia como "conflita com a marca" e não propor.
- **Princípios de UX (seção 6):** priorizar ideias que reforcem a "Regra do Primeiro Dia", o progresso visual concreto, o respeito ao bolso e a ausência de culpa por imprevistos.
- **Tom (seção 5):** se a ideia envolver texto, aplicar o glossário da marca.

## Formato de saída

Para cada site, criar `design/inventario/referencias/<nome-do-site>.md` com:

- **Site e data da análise**, com a URL.
- **Escopo observado**, incluindo o que ficou de fora e por quê.
- **Ideias**, cada uma com:
  - ID (R01, R02...)
  - Tipo: layout, design, animação, copy ou fluxo
  - Observação: o que foi visto, com a captura ou o GIF correspondente
  - Princípio que sustenta a ideia
  - Filtro da marca: "passa" ou "conflita com a marca"
  - Status: sempre "proposta"

Depois, adicionar as ideias que passaram no filtro à seção 8 de `design/inventario/inventario.md`, com o ID de origem, por exemplo `R01`. Capturas e GIFs ficam em `design/inventario/capturas/`, mascarados. Nunca salvar capturas com dados pessoais ou de contas de terceiros.

## Limites a declarar no relatório

- A análise é heurística. Uma ideia vista em um site grande não prova que funciona para o público do Casa Mia.
- Animações são inferidas do que aparece na tela e dos estilos lidos. Não são uma especificação de código.
- Tudo que não foi possível observar fica registrado como "não verificado", com o motivo.
- Validação com pessoas reais continua necessária antes de implementar, conforme a seção 8 de `docs/branding-casa-mia.md`.

## Ao finalizar

Informar, para cada site, quantas ideias passaram no filtro, quantas foram descartadas por conflitar com a marca e o que ficou como não verificado. Não entregar uma lista de ideias sem a fonte e o princípio de cada uma.
