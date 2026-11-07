# Black Friday 2026 na Stripe

Data: 06/11/2026.

## Estado

Promoção criada e consultada novamente pelo MCP oficial da Stripe na conta Casa Mia `acct_1UQc9xIsGJ6k3UsS`, com `livemode=true`. Alteração de produção autorizada pelo responsável.

Produção e staging da Railway foram configurados e publicados separadamente, conforme solicitação do responsável. Produção usa uma chave restrita LIVE; staging mantém a chave de teste. Ambos os deployments concluíram com `SUCCESS`, e a assinatura dos webhooks foi validada nos processos publicados. Nenhum arquivo `.env` foi alterado e nenhuma credencial foi incluída nesta documentação.

## Ambientes da Railway

| Ambiente | Conta Stripe | URL do app | Webhook | Deployment |
| --- | --- | --- | --- | --- |
| production | `acct_1UQc9xIsGJ6k3UsS`, LIVE | `https://enxoval-de-casa-nova-production.up.railway.app` | `we_1UYdu9IsGJ6k3UsS3w3optPN` | `973f5ab0-d971-4f1d-a0cd-bd7ef1198dd3` |
| staging | `acct_1UQcAPIzzRKYM0sE`, teste | `https://larume-staging.up.railway.app` | `we_1URKKDIzzRKYM0sEenreJiYF` | `57849971-210c-4f0d-9d78-6d4917d1bdbc` |

Foram gravadas, em cada ambiente, as variáveis `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_PASS`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PIX_ENABLED` e `APP_URL`. As atualizações foram enviadas juntas por ambiente via `railway api`, usando JSON pela entrada padrão, sem imprimir segredos. Os deployments reutilizaram os artefatos existentes; não publicaram alterações locais de código.

O webhook LIVE foi criado apontando para `/api/billing/webhook` da URL de produção, com API `2026-09-30.endive` e os 11 eventos de `REQUIRED_BILLING_EVENTS`. Seu segredo foi enviado diretamente para a Railway. O endpoint e o segredo de staging foram preservados.

O Pix LIVE está indisponível na configuração de meios de pagamento consultada: `available=false`, preferência `off`. Por isso, `STRIPE_PIX_ENABLED=false` em produção, que oferece cartão nos dois planos. Staging mantém Pix habilitado para o Passe e cartão nos dois planos. O cadastro LIVE retornou pagamentos e repasses habilitados.

## Configuração entregue

- Código público: `BLACKFRIDAY`.
- Cupom: `casamia-blackfriday-2026-30-once`.
- ID do código promocional: `promo_1UYdkmIsGJ6k3UsSmhFmLgcq`.
- Desconto de 30%, duração `once`, aplicado apenas à primeira cobrança da assinatura ou ao pagamento único do Passe.
- Resgate disponível até 30/11/2026 inclusive, em Brasília. `redeem_by` e `expires_at`: `1796094000`, correspondente a 01/12/2026 às 00:00, UTC-03:00.
- Restrito aos dois produtos da tabela. Sem a restrição adicional `first_time_transaction`.
- Preços base e assinaturas existentes preservados. O desconto depende de informar o código no Checkout; não foi configurada aplicação automática.
- A promoção equivalente foi criada também na conta de teste de staging: `promo_1UYdv6IzzRKYM0sEAXCd43AR`, código `BLACKFRIDAY`, com a mesma duração e expiração. O cupom e os IDs dos produtos têm os mesmos identificadores nas duas contas, mas são objetos isolados por conta e modo.

| Plano | Produto | Preço | Valor original | Com o código |
| --- | --- | --- | --- | --- |
| Casa Mia Mensal | `prod_VSF5ppsyL7bDOG` | `price_1UUASZIsGJ6k3UsSlE06Dbe4` | R$ 29,90/mês | R$ 20,93 na primeira cobrança; depois R$ 29,90/mês |
| Passe da Casa Nova | `prod_VSF5RCtK8cd8lp` | `price_1UUASZIsGJ6k3UsS0Q7romTF` | R$ 99,00, pagamento único | R$ 69,30, pagamento único |

O backend já cria sessões com `allow_promotion_codes: true` em `server/billing.ts`; não foi necessário alterar código da aplicação.

## Validações executadas

- MCP Stripe: consultas posteriores à criação passaram. Cupom válido, código ativo, conta de produção e restrição aos dois produtos confirmados. Nova consulta aos preços confirmou 2990 e 9900 centavos.
- `railway variable list --service 'Casa Mia' --environment production --project b0108f6e-16c3-44ff-ad49-e7078aa3945a --json`, com saída capturada e resumida sem imprimir credenciais: passou; chave identificada como teste e ambos os preços configurados.
- Simulação por `node -` com SDK Stripe, chave de teste, cliente sintético, assinatura com 48 horas de teste e cupom `once`: passou na execução final. A fatura inicial foi de zero, o desconto continuou na assinatura e a prévia da próxima fatura mostrou subtotal 2990, desconto 897 e total 2093 centavos. Não houve cobrança real. Assinatura sintética cancelada e cliente/cupom de teste removidos ao final.
- Duas preparações anteriores da simulação falharam e foram limpas: `collection_method=send_invoice` exigiu e-mail válido; depois, sem meio de pagamento, a prévia retornou `invoice_upcoming_none`, pois a assinatura estava configurada para cancelar ao fim do teste. A execução final usou o meio de pagamento sintético oficial `pm_card_visa` para permitir a prévia sem envio de e-mails nem cobrança real.
- A primeira configuração do cupom de staging por `node -` falhou ao ler `applies_to.products`, porque `applies_to` não veio expandido na resposta. A execução seguinte consultou o cupom com `expand: ['applies_to']`, confirmou a restrição aos dois produtos e concluiu sem duplicar o cupom.
- `railway api` com `variableCollectionUpsert`: passou nos dois ambientes. Uma nova leitura confirmou os valores salvos sem exibir as credenciais.
- `railway redeploy --service b3a221a4-11d6-4e67-bfe5-b6191ecaf1ba --environment production --project b0108f6e-16c3-44ff-ad49-e7078aa3945a --yes --json` e o mesmo comando com `--environment staging`: passaram. `railway status --json`, com saída resumida, confirmou `SUCCESS` nos dois deployments da tabela.
- Validação por `node -` com SDK Stripe: passou para Mensal e Passe em LIVE e teste. Sessões de Checkout foram criadas com `BLACKFRIDAY`, retornando 2093 e 6930 centavos, e expiradas imediatamente em `finally`. Não houve pagamento, assinatura concluída nem envio de e-mail. Produção aceitou cartão; o Passe de staging aceitou cartão/Pix.
- Validação HTTP por `node -`: passou nos dois ambientes publicados. `/api/health` retornou 200; evento sintético `configuration.check`, assinado com o segredo de cada ambiente, retornou 200 com `received=true`; o mesmo corpo sem assinatura retornou 400. Esse tipo de evento é ignorado antes das operações de banco do handler, sem alterar assinaturas ou acesso.
- Revisão independente do subagente via MCP: passou para webhook, eventos, cupom e promoção LIVE; nenhum resgate registrado.
- `npm run documents:check`: passou, com `driver=database`, `documents=0`, `missingBlobs=0` e `localReceiptModel=true`.

## Como validar no Dashboard

1. Selecionar a conta de produção Casa Mia e abrir o catálogo de produtos e cupons.
2. Localizar `BLACKFRIDAY` e confirmar 30%, duração única, validade e os dois produtos elegíveis.
3. Conferir os preços base de R$ 29,90 e R$ 99,00.
4. Abrir o Checkout de cada plano no ambiente desejado e informar `BLACKFRIDAY`. Confirmar os valores da tabela antes de qualquer pagamento real. Para novos assinantes do Mensal, o teste de 48 horas continua vigente e o desconto é preservado para a primeira cobrança após o teste.

Os testes confirmam a prévia da primeira cobrança após o trial, os valores das sessões Stripe e a configuração dos webhooks nos processos publicados. Não foram executados pagamento real, renovação real nem uma compra pelo fluxo autenticado completo do app. A configuração fiscal não foi alterada; qualquer adoção de Stripe Tax exige avaliar as inscrições fiscais aplicáveis.
