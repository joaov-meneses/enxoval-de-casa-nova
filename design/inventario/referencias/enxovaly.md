# Análise de referência: Enxovaly

- **Site:** https://enxovaly.com/
- **Data da análise:** 2026-10-17
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

## Descartado

Nenhuma ideia foi descartada por conflitar com a marca. Não foram encontrados padrões de escassez artificial, alertas vermelhos ou banners invasivos na página pública.

**Observação de negócio, não de UX:** o site informa que não há versão gratuita e que o acesso depende de assinatura. Isso difere do modelo freemium do Casa Mia (seção 10 da marca). Não é uma proposta de UX e não entra no inventário.

## Limites

- Análise heurística, baseada na página pública em desktop.
- Animações inferidas dos dados lidos da página, não de uma especificação de código.
- Uma ideia vista em um concorrente não prova que funciona para o público do Casa Mia. Validar com pessoas reais, conforme a seção 8 de `docs/branding-casa-mia.md`.
