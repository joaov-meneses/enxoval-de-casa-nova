# Faixas nacionais e pesquisa semanal do catálogo

## Comportamento

- Um ranking de até 250 itens aprovados, ordenado pelo número de **clientes distintos** que os cadastraram. Uma conta com vários enxovais conta uma vez por item. Itens sem uso ainda não consomem consultas.
- O ranking é congelado durante cada ciclo. Primeira semana: posições 1–50; segunda: 51–100; terceira: 101–150; quarta: 151–200; quinta: 201–250. Na semana seguinte, o ranking é atualizado e volta ao começo.
- As semanas vão de segunda a domingo, no fuso `America/Sao_Paulo`. O ciclo leva cinco semanas, e não um mês fixo: normalmente são 200 ou 250 pesquisas no mês. Há um teto adicional de 250 reservas por mês civil, além da franquia real informada pela SerpAPI. Quando acaba qualquer cota, a rotina espera; não compra créditos nem antecipa a renovação.
- Cada item faz somente uma requisição Google Shopping (`gl=br`, `hl=pt`, `no_cache=true`). Não há paginação nem chamadas de detalhes. Uma resposta pode conter várias ofertas. O endpoint de conta, gratuito, é consultado antes do lote para respeitar `plan_searches_left`; créditos extras não são usados.
- Um lock no PostgreSQL impede lotes simultâneos em várias instâncias. A reserva e o avanço do cursor são gravados antes da chamada HTTP. Reiniciar o servidor não repete a pesquisa. Uma resposta perdida pode já ter consumido crédito, então erros/reservas interrompidas também contam conservadoramente no orçamento local e não são refeitos automaticamente. Uma falha para o lote naquele momento, preservando o restante da franquia.

## Como a faixa é calculada

1. **Lojas:** somente preços totais positivos em reais, de produtos novos, com loja e link HTTPS. Parcelas, usados e outras moedas não entram. Não são seguidos links recebidos do provedor. Os resultados são dados para avaliação, nunca instruções.
2. **Jev:** valida se os nomes correspondem ao item de referência, respeitando especificações explícitas, quantidade e tipo. Acessório não é o produto principal. Apenas decisões com confiança de pelo menos 0,85 são aceitas, e a decisão fica em cache no banco. Nome exatamente igual à referência não precisa de IA. O Jev **não recebe nem inventa preços**. Com nomes incertos ou serviço indisponível, os valores desconhecidos ficam de fora.
3. **Amostra de lojas:** cada loja contribui com uma oferta central. Exigem-se pelo menos duas lojas comparáveis; ofertas com mais de 45 dias deixam de ser usadas.
4. **Clientes:** quando não há uma faixa válida das lojas, usam-se os valores informados nos enxovais ou os preços já acompanhados de seus links. Uma conta contribui com um valor central, mesmo tendo vários enxovais. Exigem-se pelo menos **dois clientes distintos**, de qualquer estado. Itens com quantidade maior que um não entram, pois o valor pode ser do conjunto.
5. As fontes **não são misturadas**. Valores extremos são filtrados pela regra do IQR. A média aritmética vai para `mean_cents`; a mediana continua em `p50`. Com menos de cinco amostras, os limites são os valores mínimo e máximo observados; com cinco ou mais, são p10/p90. Uma amostra pequena é apresentada como inicial, não como uma cotação garantida.
6. A faixa pertence ao item do catálogo (`catalog_items.id`), é salva em `catalog_price_stats` com `region=''`, fonte e tamanho da amostra, e vale para todos os estados. Se não houver evidência suficiente, o app mantém a referência genérica já existente. Produtos de uso diferente não herdam a faixa por mera semelhança de preço.

Um item genérico como “Geladeira” reúne versões usuais da categoria; um item que explicita capacidade/tamanho só deve aceitar ofertas compatíveis. Isso é estimativa de categoria, não identificação de SKU. Quantidades, especificações e nomes incertos podem reduzir a amostra disponível.

O planejamento e o cadastro de itens recebem a faixa nacional, média e origem; o preço que a pessoa informou não é sobrescrito. A estimativa inicial do funil de onboarding continua sendo a referência genérica do seu catálogo local.

## Configuração e operação

No ambiente do **servidor**, configurar:

```dotenv
SERPAPI_API_KEY=<configurar como segredo, nunca VITE_ ou no Git>
CATALOG_MARKET_PRICES=on
```

Manter o Jev configurado (`TYPESAFE_API_KEY`). Ligar a pesquisa em apenas um ambiente por conta SerpAPI, normalmente produção. Staging e produção com bancos separados não compartilham o orçamento local; não ligar os dois com a mesma franquia.

- `CATALOG_PRICE_MIN_CUSTOMERS`: padrão 2, nunca menor que 2.
- `CATALOG_MIN_SAMPLES`: continua controlando a promoção de novos nomes para revisão, não a amostra de preços.
- `SERPAPI_TIMEOUT_MS`: padrão 20 segundos por requisição. Erros não expõem chave, URL autenticada ou corpo do provedor nos logs.
- `SERPAPI_BASE_URL`: padrão `https://serpapi.com`; somente simulações locais devem substituí-lo. HTTP é permitido apenas em loopback.
- `npm run catalog:market`: verifica cotas e processa o lote permitido; não há opção de furar o orçamento.
- O lote é executado **toda segunda-feira às 06h, em `America/Sao_Paulo`**, por um timer para o próximo horário fixo, sem verificações horárias de banco ou de saldo. Se o servidor iniciar depois do horário da semana, faz uma única recuperação do lote pendente; as reservas já gravadas impedem repetições. Semanas antigas não são acumuladas em um lote maior. `job_runs` monitora `catalog_market_prices` com intervalo semanal. A execução manual por `npm run catalog:market` continua disponível e respeita as mesmas cotas.
- `npm run catalog:refresh`: atualiza vínculos e agregados de clientes; a rotina do catálogo continua rodando a cada seis horas.

A migração cria `catalog_price_name_checks`, `catalog_market_rotation`, `catalog_market_searches`, `catalog_market_offers` e acrescenta média/fonte aos agregados. Agregados antigos, que contavam enxovais em vez de clientes, são invalidados uma única vez e recalculados. As tabelas de faixa pública não guardam identidade de cliente.

## Contrato e validação

- Contrato de dependência e metadados da faixa: `postman/contracts/catalog-pricing.openapi.yaml`.
- Documentação oficial: [Google Shopping](https://serpapi.com/google-shopping-api), [campos das ofertas](https://serpapi.com/shopping-results), [conta e franquia](https://serpapi.com/account-api).
- A descoberta Orbit encontrou `urn:orbit:endpoint:v1:1I2v952xK93qa0gMLp7pqLqSXatAiY91JDvZiBOIptbVNQEHuWqjqujvapE0t:serpapi:google-shopping-api`. Seu guia sugeria `key`, mas a documentação oficial exige `api_key`; a implementação e o contrato seguem a documentação oficial.
- Mocks próprios derivados dessas respostas e do envelope do SDK Jev instalado. A busca por mocks publicados do proprietário foi omitida porque a CLI está sem login. Não houve publicação em workspace Postman.

Para reproduzir localmente com PostgreSQL configurado, em dois terminais:

```powershell
postman simulation run postman/simulations/catalog-pricing.sim.yaml --port 4912 --output ndjson
```

```powershell
npm run test:catalog-pricing
npm run test:catalog-pricing-db
npm run test:catalog-db
```

O teste integrado cria e remove um schema isolado. Executa os clientes HTTP reais contra os dois membros da simulação: SerpAPI e Jev. Verifica deduplicação por cliente e loja, rejeição de acessórios, expiração, fallback, cinco lotes sem repetição, reinício do ciclo, execução concorrente, limites semanal/mensal e do provedor, respostas vazias, 401, 429, 500 JSON/HTML, timeout e confiança baixa. Os logs da simulação confirmam as chamadas. São dados sintéticos: isso não prova o acesso de uma conta real nem a qualidade das ofertas reais.

O acesso à conta SerpAPI real foi validado em 24/10/2026 pela consulta gratuita de saldo: havia 250 buscas restantes no plano. A pesquisa automática permanece desligada enquanto `CATALOG_MARKET_PRICES` não for `on`. Nenhum teste de pesquisa utiliza créditos reais. O uso do Jev tem seu próprio custo e respeita o cache e `JEV_DAILY_LIMIT` existentes.

Foi feita também uma consulta sintética ao Jev real com a referência “Geladeira”: “Refrigerador frost free 400 litros” foi aceito com confiança 0,96, e “Filtro de reposicao para geladeira” foi rejeitado com confiança 1. Essa evidência verifica a conexão e esse caso específico de classificação; não comprova a qualidade de todos os títulos de lojas. Nenhuma pesquisa SerpAPI real foi feita durante a implementação.
