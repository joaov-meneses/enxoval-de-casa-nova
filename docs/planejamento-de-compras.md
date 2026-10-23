# Planejamento de compras (`Planejamento` no app)

Responde a três perguntas: **quando** comprar cada item, **quanto** costuma custar em cada fase da mudança e **se o que a pessoa já registrou está dentro do esperado**. Também faz o catálogo respeitar a cidade.

Código: `src/planning/` (lógica pura, sem React nem banco), `src/components/PurchasePlan.tsx` (tela), `src/onboarding/regions.ts` e `catalog.ts` (cidades e catálogo regional). Testes: `npm run test:purchase-plan` (lógica) e `npm run test:planning-db` (API e migração, PostgreSQL).

## Semana de compra

Cada item tem uma **semana de compra** contada a partir da semana da mudança: `-8` é oito semanas antes, `0` é a semana da mudança, `3` é três semanas depois (limites: -52 a 104).

- **Sugerida pelo algoritmo** (`planPurchases`): vale quando `items.buy_week` é nulo. Nada disso é gravado; é recalculado a partir dos itens.
- **Escolhida pela pessoa**: grava `items.buy_week`. Vale mais que a sugestão e nunca é mexida pelo algoritmo. Escolher "Voltar para a sugestão" grava `null`. Dá para escolher na tela Planejamento e dentro do item (campo "Quando comprar").

### Algoritmo (`src/planning/purchasePlan.ts`)

1. **Semana-base** por necessidade e prazo de entrega:
   - primeira noite (`timing = first_night`): semana -1;
   - essencial: categoria de preço 4 → -8 (entrega e montagem), 3 → -5, 1 e 2 → -2 (essencial que também é `first_week` vai para no máximo a semana 0);
   - opcional com `first_week` (por exemplo antimofo em clima úmido): semana 0;
   - opcional comum: semana 4 (cat. 1), 5, 9 ou 16 (cat. 4), mais um atraso por cômodo (quarto, banheiro e cozinha 0; eletro e serviço 1; sala 2; escritório 3; quarto extra 4; varanda 6).
2. **Semanas manuais** ficam como estão e já contam no gasto da semana.
3. **Essenciais e itens com prazo** não se mexem.
4. **Opcionais são distribuídos**: do mais urgente ao menos, cada um vai para a primeira semana a partir da sua semana-base em que o gasto de referência ainda cabe num teto semanal (total dos opcionais ÷ 16 semanas, nunca menor que o maior item). Limite: semana 40.

O resultado só depende dos itens, dos ambientes, das semanas manuais e do perfil de gasto. **Preço e situação não entram**: comprar um item ou informar um preço nunca remaneja o resto da lista.

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
