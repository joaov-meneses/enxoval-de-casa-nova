---
target: home
total_score: 25
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Jeoston Junior\\orca\\workspaces\\enxoval-de-casa-nova\\homologacao\\src\\components\\LandingPage.tsx"
target_fingerprint: "sha256:47d5fb201d1b3726ebe3113c6aea5b94592fb464e63dc6af98c1f011171bf15b"
target_path: "C:\\Users\\Jeoston Junior\\orca\\workspaces\\enxoval-de-casa-nova\\homologacao\\src\\components\\LandingPage.tsx"
timestamp: 2026-10-21T03-46-40Z
slug: src-components-landingpage-tsx
---
Method: dual-agent (A: revisão de design · B: detector + navegador)

# Nova crítica da home do Casa Mia

Nota: 25/36 (69%, Aceitável), antes 23/36. Heurística 7 marcada como n/a.

| # | Heurística | Antes | Agora | Problema principal |
|---|---|---|---|---|
| 1 | Visibilidade do status | 3 | 3 | FAQ começa todo fechado (estado faq sem uso) |
| 2 | Linguagem do usuário | 2 | 3 | Texto segue o glossário; telas mostram "Comprei", "Preciso comprar", "Pendentes" |
| 3 | Controle e liberdade | 3 | 3 | Frase do topo para em 4,5 s |
| 4 | Consistência | 2 | 2 | Telas não mostram as 4 situações reais; com sessão, dois "Acessar meu lar" em Preços |
| 5 | Prevenção de erros | 2 | 3 | Cartão perto do botão; quem clica no Mensal encontra o Passe marcado |
| 6 | Reconhecer em vez de lembrar | 3 | 3 | Benefícios uma vez só; "Primeiro Dia" sem definição |
| 7 | Flexibilidade | n/a | n/a | Página de leitura única |
| 8 | Estética e minimalismo | 2 | 2 | 8.042px desktop, 11.553px celular; mensagens repetidas |
| 9 | Recuperação de erros | 3 | 3 | Falha de sessão cai na versão de visitante |
| 10 | Ajuda | 3 | 3 | FAQ completo, mas com 9 perguntas |
| Total | | 23/36 | 25/36 | Aceitável (69%) |

## O quanto a página é deste produto
Revisão de design: visual autoral (porta em arco, Nino, linho e terracota, telas reais), estrutura ainda de SaaS comum (5 seções com o mesmo trio rótulo + título centralizado + subtítulo).
Detector: código-fonte sem achados. No navegador, 16 sinais caíram para 7, todos intencionais pelo DESIGN.md (5 kicker-above-heading, italic-serif-display, cream-palette). Corrigidos: 6 icon-tile-stack, 2 kicker de seções removidas, 1 straggler. 1 sinal intermitente é falso positivo (selo da extensão do Claude no Chrome).
Navegador: nenhum texto abaixo do AA, nenhum alvo menor que 44px no desktop, imagens com alt, títulos sem pular nível, sem rolagem lateral.

## O que funciona
1. Honestidade comercial: cartão colado ao botão, "2 dias grátis só no Mensal", Chá "em breve", sem promessa de tempo real.
2. Visual autoral e coerente: porta em arco, progresso com cor + número + "Completo", telas reais.
3. Acessibilidade de base: contrastes de 3,9:1 (texto grande) a 6:1, link para pular ao conteúdo, prefers-reduced-motion, barras com rótulo.

## Problemas prioritários
- [P1] Telas do "Como funciona" contradizem o produto: passo-3-conquiste.webp mostra "Comprei", "Preciso comprar", "Economizou R$ 0,00"; passo-2-plano.webp mostra "Pendentes" (vem do app, WorkspaceOverview.tsx:247 e :518). Correção: recapturar com as 4 situações e economia diferente de zero; trocar "Pendentes" por "Na fila" no app. Comando: /impeccable polish.
- [P1] A escolha de plano se perde: Mensal e Passe levam ao mesmo /cadastro; depois do onboarding o Passe vem pré-selecionado. Correção: ?plano=mensal / ?plano=passe respeitado no PlanSelection, ou um botão único "Começar minha lista". Comando: /impeccable clarify.
- [P2] Topo pesado e "Primeiro Dia" sem definição: 4 promessas + 3 benefícios + linha do cartão; o termo aparece ~7 vezes; botão colado à dobra em 682px. Correção: uma frase sobre o casal, um benefício a menos, definir o termo uma vez. Comando: /impeccable clarify.
- [P2] Mensagens repetidas e "Como funciona" longo no celular: "o que um risca…" 2x, "escolhe a assinatura depois" 3x, Nino em três camadas, quatro aparelhos ocupam ~7 telas no celular. Correção: Nino só com a demonstração, cortar o par repetido, recortes das telas no celular, FAQ com 6 perguntas. Comando: /impeccable distill.
- [P3] Ritmo monótono e o "a dois" some depois do topo. Correção: transformar "Da bagunça à calma" numa cena do casal. Comando: /impeccable layout + /impeccable bolder.

## Pontos fracos por perfil
- Quem chega pela primeira vez: não entende "Primeiro Dia", "área Ajuda do Nino" nem "Passe".
- Quem testa os limites: telas com situações antigas e "Economizou R$ 0,00"; clica no Mensal e encontra o Passe marcado; o título "Organizem juntos, no mesmo ritmo" sugere tempo real.
- No celular: topo só com texto; preços a ~13 telas; abaixo de 380px os botões do cabeçalho têm 40px e 12px de texto; o Nino cobre a nota da prévia.
- O casal: "conciliar orçamentos diferentes" ausente; FAQ descreve o Chá em detalhe apesar do "em breve"; o app não registra quem riscou cada item.

## Observações menores
- Dois "Acessar meu lar" em Preços para quem tem sessão.
- Selo "Melhor custo-benefício" alinhado à esquerda num cartão centralizado.
- aria-label numa div sem papel (.cm-nino-demo).
- Evento de analytics start_trial para "Começar minha lista".
- Aviso de cartão em 13,5px cinza logo abaixo de "Sem letras miúdas".

## Perguntas para pensar
1. Por que a única prova visual do "a dois" são duas iniciais na prévia?
2. Quatro celulares de 1.688px explicam mais do que a prévia do topo?
3. Se o Passe é o recomendado e vem pré-selecionado, por que o único "grátis" da página leva ao Mensal?
