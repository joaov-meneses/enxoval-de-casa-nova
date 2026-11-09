# Validação completa da prontidão Stripe

Data de consolidação: 08/11/2026. Destino: homologacao. Os testes de banco foram executados em série, em schemas descartáveis locais; nenhuma credencial foi registrada.

## Comandos Node e verificações locais

A rodada inicial executou todos os 43 scripts Node `test:*` (o script de navegador é registrado separadamente), lint, build, dois novos testes de cobrança e a verificação documental. As 11 verificações afetadas foram repetidas no merge de homologacao. O código de aplicação desse merge é equivalente ao usado na rodada de navegador final; as diferenças posteriores são documentação, script protegido de staging e fixtures dos testes.

| Comando | Resultado final | Base da execução final | Duração (s) |
| --- | --- | --- | --- |
| `npm run lint` | Passou | `a4b7676` | 21 |
| `npm run build` | Passou | `a4b7676` | 11 |
| `npm run test:housewarming` | Passou | `472964b` | 3 |
| `npm run test:housewarming-db` | Passou | `472964b` | 37 |
| `npm run test:analytics` | Passou | `472964b` | 2 |
| `npm run test:app-routes` | Passou | `472964b` | 1 |
| `npm run test:lifecycle` | Passou | `472964b` | 15 |
| `npm run test:growth-db` | Passou | `472964b` | 35 |
| `npm run test:analytics-browser` | Passou | `472964b` | 45 |
| `npm run test:logging` | Passou | `a4b7676` | 3 |
| `npm run test:posthog-logs` | Passou | `a4b7676` | 8 |
| `npm run test:fiscal-billing-db` | Passou | `a4b7676` | 43 |
| `npm run test:enxoval-value` | Passou | `472964b` | 6 |
| `npm run test:enxoval-value-db` | Passou | `472964b` | 35 |
| `npm run test:admin-api` | Passou | `472964b` | 52 |
| `npm run test:onboarding-db` | Passou | `472964b` | 83 |
| `npm run test:item-status-db` | Passou | `472964b` | 55 |
| `npm run test:password-reset-db` | Passou | `472964b` | 31 |
| `npm run test:password-policy` | Passou | `472964b` | 1 |
| `npm run test:invitations-db` | Passou | `472964b` | 35 |
| `npm run test:product-scraper` | Passou | `472964b` | 4 |
| `npm run test:purchase-plan` | Passou | `472964b` | 1 |
| `npm run test:planning-db` | Passou | `472964b` | 37 |
| `npm run test:feedback-db` | Passou | `a4b7676` | 29 |
| `npm run test:environment-name-db` | Passou | `472964b` | 33 |
| `npm run test:price-tracking-db` | Passou | `472964b` | 50 |
| `npm run test:room-suggestions` | Passou | `472964b` | 1 |
| `npm run test:jev` | Passou | `472964b` | 5 |
| `npm run test:nino` | Passou | `472964b` | 1 |
| `npm run test:jev-check` | Passou | `472964b` | 2 |
| `npm run test:ai-db` | Passou | `472964b` | 37 |
| `npm run test:catalog` | Passou | `472964b` | 5 |
| `npm run test:catalog-pricing` | Passou | `472964b` | 17 |
| `npm run test:catalog-pricing-db` | Passou | `472964b` | 44 |
| `npm run test:catalog-db` | Passou | `472964b` | 33 |
| `npm run test:billing-db` | Passou | `a4b7676` | 30 |
| `npm run test:session-db` | Passou | `472964b` | 28 |
| `npm run test:subscription-status` | Passou | `472964b` | 1 |
| `npm run test:trust-db` | Passou | `a4b7676` | 40 |
| `npm run test:profile-db` | Passou | `472964b` | 30 |
| `npm run test:freemium-db` | Passou | `a4b7676` | 42 |
| `npm run test:item-images-db` | Passou | `472964b` | 37 |
| `npm run test:shared-cache` | Passou | `472964b` | 7 |
| `npm run test:error-tracking` | Passou | `472964b` | 8 |
| `npm run test:fiscal-provider` | Passou | `472964b` | 2 |
| `node --import tsx tests/billing-risk-db.mjs` | Passou | `a4b7676` | 33 |
| `node --import tsx tests/billing-operations-db.mjs` | Passou | `a4b7676` | 8 |
| `npm run documents:check` | Passou | `472964b` | 4 |

### Falhas iniciais do executor e correções

- `test:logging` e `test:posthog-logs`: primeira tentativa falhou (exit 1), pois `LOG_LEVEL=silent` removia os registros que as próprias suites verificavam. Repetidas com nível apropriado, ambas passaram sem alterar o produto.
- Novos testes de risco/operação: primeira chamada usou `npm exec -- node`, que tentou resolver um pacote em vez de executar o Node já instalado; ambas terminaram com exit 1. Corrigida a chamada para o executável real (`node --import tsx ...`), os dois testes passaram, incluindo concorrência, rollback e auditoria do evento revisado.
- Os arquivos de log finais dessas quatro verificações contêm as repetições aprovadas; os JSONs preservam os estados iniciais e a fase de repetição.
- `npm ci` passou nos worktrees isolados e na restauração do checkout principal. O npm reportou 35 achados preexistentes de dependências; nenhuma dependência ou lockfile foi alterado nesta entrega.
- Builds passaram com aviso de chunks maiores que 500 kB. `git diff --check` passou.

## Navegador

A tentativa inicial com Vite de desenvolvimento foi interrompida por problemas do executor e preservada em `tmp/stripe-validation/attempt-vite-dev-20261108` no worktree de validação. Havia CPU saturada, carregamento frio de módulos e um build local com `NODE_ENV=test`, inadequado para os testes de prontidão offline/StrictMode. Essa tentativa parcial não é contada como execução completa.

Duas fixtures estavam defasadas: senhas novas incompatíveis com a política forte e a expectativa de animação em ícones da landing que foram tornados estáticos intencionalmente. Foram corrigidos somente os testes; senhas válidas mantêm o cenário de confirmação divergente, e o contrato Animate UI passou a exercitar o botão real de login. Os 6 cenários admin e os 3 cenários de ícones passaram isoladamente e o diff foi revisado de forma independente. Não houve alteração de produto, política, asserts de segurança ou tolerâncias.

A suíte definitiva de 247 cenários foi iniciada contra o build de produção servido por preview local, sem banco nem chaves Stripe no ambiente. A execução foi interrompida quando os agentes atingiram o limite de uso. Antes da interrupção, foram observados cenários aprovados e expectativas antigas no onboarding que ainda precisam de correção e nova execução. O resultado completo e o complemento de 320/375/425 px permanecem pendentes.

## Provedor Stripe TEST e staging publicado

`node scripts/validate-staging-billing.mjs --execute-staging`: passou em 08/11/2026. O pagamento TEST de R$ 99,00 no checkout criado pelo app foi confirmado pela Stripe, entregue por webhook, convertido em 12 meses de Passe e estornado integralmente. Portal, protocolo de atendimento e revisão operacional também passaram; fixtures foram removidas e auditoria/deduplicação preservadas. O script prova o acesso por SQL antes da consulta de status que pode reconciliar pagamentos. A sessão efetivamente paga oferecia cartão/Pix e campo promocional.

Não houve compra ou estorno LIVE, repasse bancário nem emissão de NFS-e real. O Mensal com trial foi coberto localmente, sem criar nova assinatura remota que enviasse notificações reais. Evidências e limites em [Prontidão Stripe em homologacao](prontidao-stripe-homologacao.md).
