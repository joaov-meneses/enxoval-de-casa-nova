# Planejamento de compras (`Planejamento` no app)

Responde a três perguntas: **quando** comprar cada item, **quanto** costuma custar em cada fase da mudança e **se o que a pessoa já registrou está dentro do esperado**. Também faz o catálogo respeitar a cidade.

Código: `src/planning/` (lógica pura, sem React nem banco), `src/components/PurchasePlan.tsx` (tela), `src/onboarding/regions.ts` e `catalog.ts` (cidades e catálogo regional). Testes: `npm run test:purchase-plan` (lógica) e `npm run test:planning-db` (API e migração, PostgreSQL).

## Semana de compra

Cada item tem uma **semana de compra** contada a partir da semana da mudança: `-8` é oito semanas antes, `0` é a semana da mudança, `3` é três semanas depois (limites: -52 a 104).

- **Sugerida pelo algoritmo** (`planPurchases`): vale quando `items.buy_week` é nulo. Nada disso é gravado; é recalculado a partir dos itens.
- **Escolhida pela pessoa**: grava `items.buy_week`. Vale mais que a sugestão e nunca é mexida pelo algoritmo. Escolher "Voltar para a sugestão" grava `null`. Dá para escolher na tela Planejamento e dentro do item (campo "Quando comprar").

### Algoritmo (`src/planning/purchasePlan.ts` e `scheduling.ts`)

1. **Necessidade:** uma nota válida do Nino com confiança >= 0,5 define quando o item deve estar em casa. Os níveis 1 a 8 correspondem às semanas de uso 26, 12, 4, 1, 0, 0, 0 e 0. Sem avaliação confiável, usamos o catálogo: primeira noite/semana e essenciais na mudança; opcionais recebem a distribuição de referência por categoria e cômodo.
2. **Antecedência:** da semana de uso são descontados `leadTimeWeeks` (entrega, montagem e instalação; 0–52) e `researchWeeks` (pesquisa; 0–12). Os ajustes do item prevalecem. Sem ajuste, o prazo vem do catálogo ou de uma estimativa de quatro semanas para móveis/eletros grandes, zero para os demais, mais uma semana para pesquisa. O texto identifica a estimativa. O preço do essencial não determina sua antecedência.
3. **Solução temporária:** `hasTemporarySolution` permite que a substituição esteja pronta a partir da semana 4. A antecedência ainda é descontada. Uma semana manual permite escolher outro prazo.
4. **Dependências:** `dependsOnItemId` faz uma compra automática acontecer junto ou depois do item de que depende, para confirmar medidas/compatibilidade. Itens já conquistados não bloqueiam. Datas manuais são preservadas e conflitos são explicados. A API recusa dependências de outro enxoval, de si mesmo e ciclos, inclusive em pedidos concorrentes.
5. **Orçamento:** com data da mudança e `monthlyBudgetCents`, os opcionais procuram o primeiro mês em que suas parcelas ou pagamento à vista cabem junto das compras fixas e parcelas assumidas. Valores ausentes usam a faixa estimada do perfil. Essenciais e semanas manuais não são adiados para esconder um estouro: aparecem conflitos com mês, excesso e itens. A busca termina na semana 104, com conflito quando não há solução. Sem data ou orçamento, permanece a distribuição de referência.
6. **Escolha manual:** `buyWeek` sempre prevalece; `null` restaura a sugestão. Nino, Planejamento, lista e resumo do Meu Lar consomem o mesmo resultado. Novas notas retornadas pelo Nino atualizam o calendário imediatamente.

As semanas sugeridas continuam calculadas, sem gravar datas automáticas. Os ajustes individuais são persistidos no banco. Preços e parcelas podem redistribuir opcionais quando há orçamento mensal; semanas manuais permanecem intactas.

### Oportunidades de preço

`priceOpportunity.ts` compara o preço informado ou acompanhado com a mediana nacional de produtos comparáveis. Só publica um destaque com pelo menos cinco amostras, referência e preço observados há no máximo 14 dias, quantidade 1 e valor pelo menos 5% abaixo da mediana. Produtos indisponíveis ou com leitura falha ficam de fora. Mostra fonte, amostras e atualização; não prevê promoções nem antecipa uma compra por causa do preço.

### Onde ajustar

- **Planejamento:** orçamento mensal, alertas e “Por que esta semana? Ajustar” em cada item. O diálogo mostra uma prévia da data antes de salvar.
- **Lista:** o botão “Comprar até…” abre os detalhes do item com semana, prazos, dependência e solução temporária.
- **Nino:** ordem e data do calendário, com o motivo da sugestão.
- **Meu Lar:** próximas compras, referências favoráveis de preço e acesso ao Planejamento.

Contrato incremental: `postman/contracts/purchase-scheduling.openapi.yaml`. Validação: `npm run test:purchase-plan`, `npm run test:planning-db` (schema descartável) e `npx playwright test tests/purchase-scheduling.spec.ts` (320×568, 375×667 e 425×800).

## Períodos e verificador de faixa

| Período | Semanas |
|---|---|
| Antes da mudança | até -1 |
| Primeira semana | 0 |
| Primeiro mês | 1 a 3 |
| Meses 2 e 3 | 4 a 11 |
| Meses 4 a 6 | 12 a 25 |
| Depois dos 6 meses | 26 em diante |

Cada período mostra:

- **Faixa de referência**: soma da faixa de cada item que custa dinheiro (a comprar, pesquisando ou comprado) no perfil de gasto. Itens ganhos ou que a pessoa já tem não entram.
- **Previsto**: soma dos preços (já com desconto) dos itens que têm preço.
- **Já gasto**: soma dos itens comprados. "Alcançou a faixa" quando o gasto chega ao mínimo.
- **Veredito** (`verdictFor`): *Abaixo da faixa*, *Dentro da faixa* ou *Acima da faixa*. Compara o previsto com a faixa **só dos itens que têm preço**, para itens sem preço não fazerem o período parecer barato; quantos ficaram de fora aparece no texto. Sem nenhum preço, mostra *Sem preços ainda*.
- **Atrasado**: a semana do item já passou e ele continua pendente (só com a data da mudança).

## Perfis de gasto (`src/planning/spending.ts`)

| Perfil | Ideia |
|---|---|
| Econômico | O básico bem resolvido |
| Equilibrado | Bom custo-benefício (padrão e base da estimativa do funil) |
| Confortável | Conforto no dia a dia |
| Premium | Qualidade e design |

Cada perfil tem uma faixa por categoria de preço do item (1 a 4). **São valores de referência, não preços de loja**: ficam numa tabela em `spending.ts` e podem ser ajustados lá. O preço de um item é sempre o que a pessoa informa. A tela mostra o total do enxoval em cada perfil para comparar antes de escolher.

No funil, o perfil sugerido é o mais confortável cujo total máximo cabe no orçamento (senão o mais confortável cujo mínimo cabe; sem orçamento, Equilibrado). Quem não é o dono do enxoval vê o planejamento, mas só o dono altera data, lugar e perfil.

## Catálogo por cidade

O **estado** decide o clima geral (`quente`, `ameno`, `frio`). A **cidade** (opcional) acrescenta características locais (`regions.ts`): `umido`, `maresia`, `seco`, `chuvoso`. São generalizações do clima típico, não previsão do tempo. Hoje são as 27 capitais e as maiores cidades de cada estado (capital primeiro na lista); quem mora em outra escolhe "Outra cidade" e recebe o catálogo do estado.

No catálogo (`catalog.ts`), um item pode ter `where` (`ufs`, `cities` ou `trait`) e `note` (o porquê, que vai na descrição do item). Exemplos: sachê antimofo e desumidificador em cidade úmida (Salvador, Recife, Rio), umidificador na estação seca (São Paulo, Belo Horizonte, Brasília), spray anticorrosão no litoral, panela de barro na Bahia e no Espírito Santo, panela de pedra-sabão em Minas, kit tereré em MS e MT. A flag `U` marca o que é melhor já na primeira semana.

- **Funil**: um seletor de cidade aparece abaixo da roleta de estado; a cidade nunca contradiz o estado.
- **Enxovais existentes**: a tela Planejamento tem "sugestões para quem mora em ..." com os itens regionais que ainda não estão na lista, com botão para adicionar.

Não há ajuste de preço por cidade: não temos dados para isso e não vamos inventar.

## Dados

- `enxovais`: `move_date`, `state`, `city`, `spending_tier` (migração preenche de `onboarding_profile` uma única vez).
- `items`: `buy_week` (escolha manual), e, para itens do funil, `price_category`, `priority` e `timing` gravados do catálogo. Nos demais itens o planejamento infere pelo nome (catálogo) ou pelo preço.
- API: `PATCH /api/enxovais/:id` aceita `moveDate`, `spendingTier`, `state`, `city` (só o dono); `POST`/`PATCH /api/items` aceitam `buyWeek`; `POST /api/enxovais` aceita `city` e `spendingTier` no perfil e `priceCategory`, `priority`, `timing` em cada item do plano.
