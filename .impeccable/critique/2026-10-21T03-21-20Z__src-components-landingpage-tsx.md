---
target: home
total_score: 23
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Jeoston Junior\\orca\\workspaces\\enxoval-de-casa-nova\\homologacao\\src\\components\\LandingPage.tsx"
target_fingerprint: "sha256:e3ee837635d3512cb55ed3c5007a34ebb98954593a25061ff4fb71d24a071c1a"
target_path: "C:\\Users\\Jeoston Junior\\orca\\workspaces\\enxoval-de-casa-nova\\homologacao\\src\\components\\LandingPage.tsx"
timestamp: 2026-10-21T03-21-20Z
slug: src-components-landingpage-tsx
closed: true
---
Method: dual-agent (A: revisão de design · B: detector + navegador)

# Crítica de design da home do Casa Mia

Nota: 23/36 (64%, Aceitável). Heurísticas 7 marcada como n/a (página de leitura única).

## Notas por heurística

| # | Heurística | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do status | 3 | Enquanto a sessão carrega, o visitante vê "Acessar meu lar" apontando para /app |
| 2 | Linguagem do usuário | 2 | "Ordene por pendentes" (termo proibido); "comprei, ganhei ou já tenho" não bate com as situações reais; "inteligência artificial" é jargão |
| 3 | Controle e liberdade | 3 | A frase do topo gira 12 s antes de parar e só pausa com o mouse |
| 4 | Consistência | 2 | O topo vende o teste; o plano em destaque é o Passe, sem teste; "Cresça quando a casa crescer" sugere degraus inexistentes |
| 5 | Prevenção de erros | 2 | Cartão obrigatório só em Preços; Passe e teste levam ao mesmo cadastro |
| 6 | Reconhecer em vez de lembrar | 3 | Os dois planos repetem a mesma lista de 5 benefícios |
| 7 | Flexibilidade | n/a | Página de leitura única |
| 8 | Estética e minimalismo | 2 | 9.373px no desktop e 13.537px no celular; "lista a dois" aparece 5 vezes |
| 9 | Recuperação de erros | 3 | Falha de sessão cai na versão de visitante |
| 10 | Ajuda | 3 | FAQ honesto, mas sem "Passe ou Mensal?", "depois dos 12 meses?", "quem eu convido paga?" |
| Total | | 23/36 | Aceitável (64%) |

## O quanto a página é deste produto
Revisão de design: hero autoral (porta em arco que se enche de luz, "8 de 12 itens do Primeiro Dia", itens riscados, Nino); depois, 6 de 9 seções repetem rótulo em caixa-alta + título + subtítulo + grade; o casal quase não aparece.
Detector: código-fonte sem achados. No navegador, 16 sinais. Reais: 7 kicker-above-heading (rótulos acima de títulos), 6 icon-tile-stack (cartões de ícone sobre título em #recursos), 1 straggler ("comprar." sozinha no cartão "Um plano do tamanho da sua casa"). Intencionais, do Design System: italic-serif-display (itálico do título) e cream-palette (fundo Linho). Falso positivo: text-occlusion (selo da extensão do Claude no Chrome).
Destaques visíveis na aba [Human] do Chrome.

## Impressão geral
Honesta e calorosa, mas longa demais e com o caráter concentrado no topo. Maior oportunidade: a seção de preços, que contradiz o caminho do teste e é o único trecho insistente.

## O que funciona
1. A prévia com a porta em arco: progresso na silhueta da marca, celebra sem gritar.
2. Honestidade sistemática: cartão avisado 3 vezes, Chá "em breve", exemplo fictício, nenhum depoimento inventado.
3. Os pares "Antes / Com o Casa Mia" e a sugestão do Nino (torradeira): dores concretas, o que mais diferencia de um marketplace.

## Problemas prioritários
- [P1] Preços contradizem o funil e pressionam. Plano em destaque é o Passe (sem teste), selo "72% de desconto", pulso ao carregar fora da tela, mesmo cadastro nos dois botões, listas de benefícios idênticas. Correção: teste como porta principal e Passe como alternativa explicada; benefícios listados uma vez; selo trocado por "Equivale a 3 meses do plano mensal"; sem pulso; /cadastro?plano=pass. Comando: /impeccable clarify, depois /impeccable distill.
- [P1] O cartão obrigatório não aparece onde a pessoa clica. A nota do topo diz "48 horas de acesso completo" sem citar o cartão. Correção: linha sob o botão "Cartão necessário · cancele no app antes de 48 h e nada é cobrado". Comando: /impeccable clarify.
- [P2] Mesmo molde repetido e página longa demais. 6 seções com o mesmo cabeçalho; grade de 6 cartões redundante; "Lavanderia" sozinha na segunda linha da faixa de cômodos. Correção: cortar a grade, levar "cole o link" e "dinheiro à vista" para os passos, juntar a faixa de cômodos ao passo 02, variar a composição. Comando: /impeccable distill e /impeccable layout.
- [P2] O casal não aparece no topo. A frase que gira fala com quem mora sozinho; o texto principal vende "inteligência artificial"; o "a dois" só aparece no passo 04 (~4.000px). Correção: "o lar de vocês dois" na frase; texto principal em "a mesma lista, ao mesmo tempo, sem comprar em dobro"; dois aparelhos riscando o mesmo item. Comando: /impeccable shape e /impeccable clarify.
- [P2] Movimento automático fora das regras do DESIGN.md. Frase gira 12 s; botão do teste dá dois saltos; plano pulsa fora da tela. Viola WCAG 2.2.2 e o DESIGN.md. Correção: troca curta ou frase fixa, sem saltos nem pulsos. Comando: /impeccable quieter.

## Pontos fracos por perfil
- Quem chega pela primeira vez: "Primeiro Dia" não é explicado; telas reais do Como funciona pequenas demais para ler; nada ajuda a escolher entre Passe e Mensal.
- Quem testa os limites: "Cresça quando a casa crescer" e "Dicas do Nino ampliadas" prometem o inexistente; "Escolher o Passe" cai no mesmo cadastro do teste.
- No celular, com uma mão: preço a ~10.650px do topo; alvos de toque menores que 44px (botão "Testar por 2 dias" do cabeçalho com 40px, link da marca com 35px de altura, links do menu com 43px); o Nino cobre o canto da prévia.
- O casal (Ana e Léo): ninguém responde se o parceiro precisa pagar; a única pista aparece em tom negativo no FAQ; "conciliar orçamentos diferentes" não é tratada.

## Observações menores
- "Ordene por pendentes" (HowItWorks.tsx:22) e "comprei, ganhei ou já tenho" (:29) fogem do glossário.
- Estado faq não usado em LandingPage.tsx; o FAQ começa todo fechado.
- CSS morto: .cm-cha* e .cm-carousel* em landing.css.
- "cards fáceis de tocar" é linguagem de interface.
- Aviso de cancelamento repetido três vezes quase igual.
- Contraste: 145 textos passam no AA; o menor é 4,76:1, nos rótulos em caixa-alta.

## Perguntas para pensar
1. Se o casal é o público principal, por que o topo fala primeiro com quem está montando "o seu quarto"?
2. A landing precisa vender duas portas, o teste e o Passe, ou deveria abrir uma só?
3. Se o Nino é o diferencial, por que ele só fala depois de 4.000px?
