# Análise de referência: Enxovaly

- **Site:** https://enxovaly.com/
- **Data da análise:** 2026-10-17 (atualizada em 2026-10-20)
- **Tipo de produto:** app de lista de enxoval para bebê (concorrente direto do Casa Mia)

## Escopo observado

- Página inicial completa em desktop (1536 px): hero, seção de funcionamento em quatro passos, recursos (gêmeos, clima, compartilhamento, armário, assistente), comparação "antes e depois", chamada final e FAQ.
- Estilos lidos do DOM com `getComputedStyle`: tipografia, cores, raios e transições.
- Animações listadas com `document.getAnimations()`: 67 animações CSS ativas no carregamento, com durações entre 200 e 560 ms e curvas `cubic-bezier`. Keyframes encontrados: `spin`, `pulse`, `pop-in`, `card-in`, `item-bloom`, `aurora` e `claude-pulse`.
- Verificação de `prefers-reduced-motion`: uma regra desse tipo foi encontrada nas folhas de estilo acessíveis. Não foi verificado o comportamento completo com o recurso ativado.

## Fora do escopo ou não verificado

- **Layout em celular:** não verificado. Tentei redimensionar a janela para 390 px, mas a largura medida continuou em 1536 px, então o teste não é confiável.
- **Áreas logadas, cadastro e app:** não verificado. A análise ficou restrita à página pública, conforme a skill.
- **GIF da interação:** não gravado nesta rodada. As animações foram analisadas pelos dados lidos da página, não pela observação visual frame a frame.
- **Capturas:** não salvas em `design/inventario/capturas/` nesta rodada. As observações são descritivas.

## Dados observados

**Tipografia**
- Títulos (`h1` 60 px, `h2` 42 px): Fraunces, peso 600.
- Texto e interface: Nunito, 16 px no corpo, 14 px nos botões, peso 600 nos botões.
- Rótulos pequenos em caixa alta (`p` 11 px, peso 800): usados como "kicker" acima dos títulos.

**Cores** (valores lidos, não recomendação de paleta)
- Fundo da página: `rgb(250, 248, 245)`.
- Texto principal: `rgb(61, 51, 47)`.
- Destaque roxo: `rgb(107, 73, 144)`.
- Botão secundário: fundo `rgb(244, 236, 250)` com texto roxo.
- Botões de loja: fundo preto com texto branco.

**Forma**
- Botões de loja e de ação com raio de 14 px e 12 px.
- Sem sombras nos elementos principais.

**Transições**
- Durações mais comuns: 0,3 s e 0,2 s, com curva `cubic-bezier(0.23, 1, 0.32, 1)` para entradas e `cubic-bezier(0.4, 0, 0.2, 1)` para transições de estado.

**Observação sobre a marca:** o site usa Fraunces, que também está na identidade do Casa Mia, mas com corpo em Nunito e não em DM Sans. A paleta é diferente da marca do Casa Mia. Nenhuma recomendação de cor vem desta análise.

## Ideias

### R01: Hero com o app em uso
- **Tipo:** layout
- **Observação:** o hero traz um mockup do app dentro de um celular, com cards flutuantes sobre a tela ("Nasce em janeiro", "RN — 12 meses") que mostram o estado real da lista. Não é uma tela estática: mostra progresso e contexto.
- **Princípio:** progresso visual concreto (seção 6 de `docs/branding-casa-mia.md`).
- **Filtro da marca:** passa.
- **Status:** proposta.

### R02: Progresso por categoria com barras e estado "Completo"
- **Tipo:** design
- **Observação:** cada categoria (quarto, vestir, higiene, alimentação, passeio) mostra contagem ("15 de 15 peças"), percentual e barra. Quando completa, aparece o rótulo "Completo" e o item é destacado.
- **Princípio:** progresso visual concreto e celebração de cada conquista. A seção 2 da marca diz que riscar um item barato tem o mesmo valor que riscar um caro.
- **Filtro da marca:** passa.
- **Status:** proposta.

### R03: Animações de entrada e de conclusão, com respeito ao movimento reduzido
- **Tipo:** animação
- **Observação:** 67 animações CSS curtas (200 a 560 ms), com nomes como `pop-in`, `card-in` e `item-bloom`. Há uma regra de `prefers-reduced-motion` presente. Não foi possível confirmar o comportamento completo.
- **Princípio:** o Nino celebra com confetes sutis quando um cômodo é concluído (seção 3 da marca). Movimento curto e opcional reforça esse momento.
- **Filtro da marca:** passa, desde que as animações sejam sutis e desativáveis. Evitar movimento intenso ou em loop.
- **Status:** proposta.

### R04: Página pública de lista para convidados, com "faltam" e o que já foi reservado
- **Tipo:** fluxo
- **Observação:** a lista compartilhada mostra só o que falta, com a quantidade ("2×", "FALTAM"), e indica quem já escolheu ("Vovó reservou o carrinho", "completo"). Não exige cadastro para quem vê a lista.
- **Princípio:** a Página de Chá de Casa Nova da marca (seção 6 e "A Página de Chá de Casa Nova") tem o mesmo objetivo, evitar presentes repetidos.
- **Filtro da marca:** passa. A marca prevê Pix e recados nos presentes, então esta ideia complementa o que já está planejado, não o substitui.
- **Status:** proposta.

### R05: Cadastro de peças por foto, com revisão antes de salvar
- **Tipo:** fluxo
- **Observação:** o usuário fotografa a peça, o app preenche tipo, tamanho e cor, e o usuário confere e salva. O cadastro pode ser feito em sequência. Há também a opção de dizer como a peça chegou (comprada, presente, emprestada).
- **Princípio:** inteligência prática (seção 2 da marca). A IA tira trabalho do usuário sem esconder a decisão final.
- **Filtro da marca:** passa. O Casa Mia usa o Jev para recomendações, não para cadastro por imagem. Esta ideia exigiria um recurso novo e não deve ser tratada como equivalente.
- **Status:** proposta.

### R06: Quantidades sugeridas por categoria
- **Tipo:** fluxo
- **Observação:** o site informa quantas peças de cada categoria são sugeridas ("Quantidades sugeridas pra não comprar demais") e permite ajustar. Mostra a diferença entre a lista genérica e a lista feita para o caso.
- **Princípio:** respeito ao bolso do usuário (seção 6 da marca). A métrica de sucesso é gastar o mínimo para morar bem.
- **Filtro da marca:** passa. Alinha com o planejamento de compras já existente no Casa Mia.
- **Status:** proposta.

### R07: Mensagem de acolhimento na chamada final
- **Tipo:** copy
- **Observação:** o texto final usa frases curtas e tom de acolhimento: "Hoje, a sua única tarefa é baixar o app" e "O enxoval fica com a gente". Não há pressão de tempo nem escassez.
- **Princípio:** acolhimento antes da cobrança (seção 2 da marca).
- **Filtro da marca:** passa. A ideia é o tom, não a frase. Usar o glossário da marca (seção 5), sem copiar o texto.
- **Status:** proposta.

## Atualização de 2026-10-20

Segunda leitura da página pública (desktop, 1536 px, via `get_page_text` e `javascript_tool`). R01 a R07 seguem válidas. Mudanças e itens novos:

- **Estrutura atual:** seção "Enxoval em cena" logo após o hero, depois Como funciona, Recursos, Armário, Lia, comparativo "Da bagunça à calma", chamada final e FAQ (6 perguntas). Menu fixo com âncoras e link "Pular para o conteúdo principal".
- **Animações listadas:** 31 ativas (antes 67). Nomes: `hero-personalization-feed`, `phone-bar-grow`, `hero-list-personalized`, `phone-card-in`, `scan-line`, `card-in`, `item-bloom`, `pulse`, `spin`. Regras de `prefers-reduced-motion` nas folhas acessíveis: 1.
- **Cores e fontes lidas:** fundo `rgb(250, 248, 245)`, texto `rgb(61, 51, 47)`, botão principal `rgb(78, 53, 106)` em pílula, Fraunces 60 px no `h1`, Nunito no corpo. Não são recomendação de paleta.
- **Rodapé:** Artigos, Lista de enxoval, Mala maternidade, Sobre, Metodologia, Imprensa e e-mail de contato.

### R08: Comparativo "antes e depois" em lista curta
- **Tipo:** copy
- **Observação:** tabela de duas colunas ("Lista genérica da internet" contra "Lista feita pelo nascimento e clima da sua cidade"), com quatro pares de dor e solução ("Comprar demais por insegurança" / "A quantidade certa de cada peça").
- **Princípio:** respeito ao bolso e acolhimento (seções 2 e 6 da marca). O Casa Mia não tem hoje uma seção que nomeie as dores das personas.
- **Filtro da marca:** passa, desde que as dores venham das personas da seção 8 da marca ("abridor de lata, extensão elétrica" esquecidos, planilha fria) e o tom não culpe quem usa planilha.
- **Status:** proposta.

### R09: Faixa de três benefícios concretos sob o botão do hero
- **Tipo:** copy
- **Observação:** abaixo dos botões há três marcas curtas e específicas ("Por mês do nascimento", "Adaptado ao clima", "Quantidades na medida").
- **Princípio:** clareza imediata do que o produto faz de diferente.
- **Filtro da marca:** passa. A home do Casa Mia tem duas marcas genéricas ("48 horas de acesso completo", "Do seu jeito, no seu tempo"). Trocar por benefícios do produto, por exemplo Primeiro Dia primeiro, quantidades na medida da casa, alerta de repetição.
- **Status:** proposta.

### R10: Prévia de lista por categoria logo abaixo do hero
- **Tipo:** layout
- **Observação:** seção "Seu enxoval, categoria por categoria" com chips de categoria e cartões com contagem e barra, antes de explicar o passo a passo. Mostra o produto antes do texto.
- **Princípio:** progresso visual concreto (seção 6 da marca).
- **Filtro da marca:** passa. O mock "Meu Lar" do hero mostra só um cômodo-resumo; uma faixa com os cômodos (Cozinha, Quarto, Sala...) e o progresso de cada um reforçaria o R02.
- **Status:** proposta.

### R11: Estado "pensando" durante o cálculo do plano
- **Tipo:** animação
- **Observação:** no passo 1, o mock mostra mensagens em sequência ("Analisando o perfil...", "Selecionando as peças da estação...", "Montando o enxoval...") antes do resultado. Há também uma linha de leitura (`scan-line`) na simulação de foto.
- **Princípio:** Nino Pensativo, com pranchetinha, enquanto a IA calcula (seção 3 da marca).
- **Filtro da marca:** passa, se for curto e respeitar `prefers-reduced-motion`. Não inventar espera: mostrar só quando o cálculo realmente leva tempo.
- **Status:** proposta.

### R12: Exemplo de conversa com o assistente na página
- **Tipo:** layout
- **Observação:** um mock de chat mostra pergunta, resposta e item adicionado ("O que ainda falta?" e a resposta com dois itens). Mostra a IA útil, sem texto longo.
- **Princípio:** inteligência prática (seção 2 da marca) e voz do Nino (seção 3).
- **Filtro da marca:** passa com ressalva. O Jev responde com opções tipadas, não com chat livre (seção 4 da marca). O mock do Casa Mia deve mostrar cartões de sugestão do Nino ("Próximo item da Cozinha"), não uma conversa aberta que o app não oferece.
- **Status:** proposta.

### R13: Rodapé com "Metodologia"
- **Tipo:** fluxo
- **Observação:** o rodapé tem links Sobre e Metodologia, que dão transparência sobre como a lista é montada.
- **Princípio:** honestidade e confiança antes do cadastro com cartão.
- **Filtro da marca:** passa. Uma página curta "Como o Nino escolhe" explicaria que as sugestões vêm de regras e catálogo próprio, sem alucinação (seção 4 da marca).
- **Status:** proposta.

### Rodada de 2026-10-20 (complemento)

Releitura da página pública em desktop (1536 px), com texto, estilos computados e `document.getAnimations()`. Duas capturas de tela foram vistas, mas não salvas em disco. Layout em celular continua não verificado.

### R14: Cena ilustrada do ambiente com título sobreposto na rolagem
- **Tipo:** layout
- **Observação:** abaixo do hero há uma cena isométrica do quarto do bebê (berço, armário, poltrona, bolsa, carrinho) em um cartão largo de cantos arredondados. O título "O que você precisa para o quartinho" fica sobre a cena enquanto a página rola, e a navegação é uma pílula translúcida fixa no topo. A cena mostra as categorias da lista como objetos, em vez de uma lista de texto.
- **Princípio:** progresso visual concreto (seção 6 da marca). A casa do Nino poderia ser essa cena: cômodos que se acendem conforme os itens são riscados.
- **Filtro da marca:** passa. Exige ilustração própria, no estilo do Nino, não a arte do site.
- **Status:** proposta.

### R15: Chips flutuantes de contexto sobre o mockup
- **Tipo:** design
- **Observação:** o hero tem cartões pequenos sobrepostos ao celular ("Verão", "RN — 12 meses") que mostram as variáveis usadas para montar a lista. Animação de 9 s, linear, em repetição (`hero-personalization-feed`), e barras de progresso que crescem em 1,4 s (`phone-bar-grow`).
- **Princípio:** transparência de como a lista foi montada reforça confiança na inteligência prática (seção 2). No Casa Mia, os chips seriam metragem, moradores e orçamento.
- **Filtro da marca:** passa. O movimento em loop de 9 s deve parar com `prefers-reduced-motion`.
- **Status:** proposta.

### R16: Assistente de conversa que registra o que chegou
- **Tipo:** fluxo
- **Observação:** a assistente (Lia) aceita texto ou foto ("ganhei 3 bodies tamanho P"), cadastra a peça e mostra um cartão de confirmação com o que foi adicionado. Também lembra o que falta ("faltam só 2 itens") e oferece adicionar à lista com um toque.
- **Princípio:** acolhimento e inteligência prática. O Nino já é a voz do app; registrar presentes por mensagem encaixa com a matriz de mensagens ("Ao receber presentes de amigos").
- **Filtro da marca:** passa, mas é recurso novo e não cabe no modelo tipado do Jev (`Choice`, `Score`, `Noul`) sem decisão técnica.
- **Status:** proposta.

### R17: Tabela "antes e depois" na página de vendas
- **Tipo:** copy
- **Observação:** seção "Da bagunça à calma" compara lado a lado a lista genérica da internet com a lista própria: "caçar dica em mil abas" vs. "tudo por categoria", "será que falta algo?" vs. "progresso em tempo real". Cada dor vira um benefício em uma linha.
- **Princípio:** as dores da persona "Primeiro Lar" (seção 8 da marca) já estão descritas e podem virar a comparação com planilhas e blogs.
- **Filtro da marca:** passa, desde que o tom compare sem culpar o usuário.
- **Status:** proposta.

### R18: Seção "o que serve agora e o que espera"
- **Tipo:** design
- **Observação:** o armário agrupa por tamanho com rótulos "serve agora", "logo logo", "na gaveta". Transforma estoque em um calendário implícito.
- **Princípio:** Regra do Primeiro Dia (seção 6 da marca): separar o que é para a primeira semana do que pode esperar.
- **Filtro da marca:** passa. Equivalente no Casa Mia: "Dia 1", "Primeiro mês", "Depois".
- **Status:** proposta.

**Dados lidos nesta rodada:** `--ease-out-strong: cubic-bezier(.23, 1, .32, 1)` e `--ease-in-out-strong: cubic-bezier(.77, 0, .175, 1)` como variáveis CSS; botão com raio de 12 px; Fraunces 60 px (h1) e 42 px (h2), peso 600; 14 seções; uma regra `prefers-reduced-motion`.

## Descartado

Nenhuma ideia foi descartada por conflitar com a marca. Não foram encontrados padrões de escassez artificial, alertas vermelhos ou banners invasivos na página pública.

**Observação de negócio, não de UX:** o site informa que não há versão gratuita e que o acesso depende de assinatura. Isso difere do modelo freemium do Casa Mia (seção 10 da marca). Não é uma proposta de UX e não entra no inventário.

## Limites

- Análise heurística, baseada na página pública em desktop.
- Animações inferidas dos dados lidos da página, não de uma especificação de código.
- Uma ideia vista em um concorrente não prova que funciona para o público do Casa Mia. Validar com pessoas reais, conforme a seção 8 de `docs/branding-casa-mia.md`.
