# Desempenho da lista — 23/10/2026

## Alterações

- Cabeçalho de altura fixa; o gesto de rolagem escreve uma variável CSS somente no cabeçalho, sem atualizar o estado do workspace.
- Atualização por gesto com indicador independente do React. O listener bloqueante existe apenas durante um gesto iniciado no topo; múltiplos dedos, cancelamento e interação em uma janela não atualizam a lista.
- Linhas memorizadas, callbacks estáveis e comparação dos valores do planejamento e das sugestões de presentes. A alça de reordenação mantém sua identidade.
- Ícones frequentes das linhas e alças usam a geometria SVG existente sem controles de animação. As animações de confirmação permanecem.
- Desfoques das barras e sobreposições foram substituídos por fundos sólidos ou semitransparentes.
- Os estados que escondem o botão flutuante ficam no próprio botão, sem seletores `:has()` no workspace nem atributos no `body`.

## Medição inicial

Comparação entre o commit `7777e75` e o código local, usando builds de produção, Edge headless em Windows e viewport de 375 × 640. As duas versões receberam os mesmos dados sintéticos, com todas as chamadas de API interceptadas. Nenhuma conta ou dado persistido foi alterado.

Cada lista rolou 2.400 px para baixo e voltou, em passos de 25 px por quadro. Contadores temporários foram inseridos diretamente nas funções `App` e `ItemRow` durante o build; eles não fazem parte do produto. Commits do React não equivalem a renderizações do app inteiro, portanto a contagem da sessão anterior não serve para essa comparação.

| Métrica | 21 itens antes | 21 itens depois | 196 itens antes | 196 itens depois |
| --- | ---: | ---: | ---: | ---: |
| Renderizações do App ao rolar | 6 | 0 | 4 | 0 |
| Renderizações acumuladas das linhas ao rolar | 126 | 0 | 784 | 0 |
| Maior intervalo entre quadros | 26 ms | 17 ms | 114 ms | 17 ms |
| Quadros acima de 50 ms | 0 | 0 | 2 | 0 |
| Tempo acumulado em tarefas longas na rolagem | 0 ms | 0 ms | 355 ms | 0 ms |
| Abertura do editor, mediana de cinco tentativas | 52 ms | 61 ms | 84 ms | 111 ms |

A melhora na rolagem se repetiu nas execuções. **Não houve ganho comprovado na abertura do editor**: a última comparação ficou mais lenta, conforme a tabela. Ela continua montando os campos e controles do formulário e fazendo recálculos de estilo; essas alterações não eliminam esse custo. As medições variaram entre execuções e não permitem extrapolar tempos para um celular real. Não há redução de renderizações globais ao abrir a janela: em ambas as versões o App renderizou zero vezes e somente a linha aberta renderizou uma vez.

Os resultados brutos da comparação estão em `tmp/performance/before-final.json`. O experimento adicional com ícones animados ficou separado dos números acima.

## Validação

- TypeScript (`npm run lint`) e builds de produção passaram.
- Sete cenários de interação passaram: atualização por gesto e suas condições de cancelamento, conclusão com erro e movimento reduzido em celular e desktop, dimensões e reordenação dos ambientes, cancelamento da conclusão e painéis no modo de movimento reduzido.
- Dois testes antigos de animação falharam tanto no build anterior quanto no atual: um acessa uma animação já encerrada (`getAnimations()[0]`); outro ainda espera `stats-card-reveal`, substituída por transições. Eles não foram tratados como regressões destas alterações.
- A instalação PWA, um aparelho físico e a produção publicada não foram utilizados nesta validação.

As medições acima foram feitas localmente, antes da publicação destas alterações.

## Revalidação após os ajustes de CSS — 23/10/2026, 23:06

A comparação foi repetida com os arquivos atuais, incluindo o fundo do cabeçalho e a faixa de ambientes que alcança as bordas da tela. Os hashes dos arquivos de desempenho foram conferidos antes e depois: eles não mudaram durante a execução. Foram mantidos o mesmo commit de referência, os dados sintéticos, o navegador, o viewport, o percurso de rolagem e as cinco aberturas por lista.

| Métrica | 21 itens antes | 21 itens atuais | 196 itens antes | 196 itens atuais |
| --- | ---: | ---: | ---: | ---: |
| Renderizações do App ao rolar | 6 | 0 | 4 | 0 |
| Renderizações acumuladas das linhas ao rolar | 126 | 0 | 784 | 0 |
| Maior intervalo entre quadros | 26 ms | 18 ms | 107 ms | 18 ms |
| Quadros acima de 50 ms | 0 | 0 | 2 | 0 |
| Tempo acumulado em tarefas longas na rolagem | 0 ms | 0 ms | 366 ms | 0 ms |
| Abertura do editor, mediana de cinco tentativas | 51 ms | 65 ms | 88 ms | 109 ms |

A melhora na rolagem foi confirmada no estado atual. A abertura do editor continua sem melhoria comprovada e ficou mais lenta nesta comparação. O pedido de implementar as alterações propostas e repetir a medição está concluído; os números não sustentam afirmar que o gargalo da abertura foi resolvido.

O build e o TypeScript passaram. Os dois testes diretamente afetados pelos últimos ajustes de CSS também passaram: altura do cabeçalho e condições do gesto de atualização; dimensões, alcance e ausência de transbordamento dos ambientes de 320 a 1023 px. Não houve erros JavaScript nos cenários da medição.

Resultados e hashes: `tmp/performance/current-comparison.json`. Reprodução, a partir da raiz do workspace: `node tmp/performance/workspace-performance.mjs before current`. O script e os builds são artefatos locais de validação, fora dos arquivos do produto.
