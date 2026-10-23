# Carregamento e verificação de acesso

O app usa a mesma estrutura de carregamento durante a consulta inicial da conta e a primeira verificação da assinatura. O cabeçalho, a lateral e os espaços da lista permanecem no lugar; “Tentar novamente” aparece somente após uma falha. Falha inicial de conexão oferece nova tentativa, sem apresentar login ou checkout como solução.

Depois de confirmado o acesso, consultas por foco da aba e a cada 15 segundos rodam em segundo plano, sem desmontar a lista. Uma falha temporária mantém a tela atual e apresenta um aviso discreto com nova tentativa. A verificação tem prazo de 10 segundos, para não ficar indefinidamente pendente. Uma consulta explícita antes de exportar continua exigindo resposta válida do servidor.

O último status fica apenas em memória, separado por usuário e enxoval. Consultas simultâneas compartilham a mesma requisição. Logout e sessão expirada limpam essa memória; respostas que chegam depois da invalidação são descartadas. A troca de enxoval nunca usa a permissão de outro enxoval. Nada é persistido em localStorage ou sessionStorage para conceder acesso.

`accessAllowed: false` continua mostrando a tela de bloqueio/contratação. Um evento `casamia:subscription-required` invalida imediatamente a verificação anterior. HTTP 401, 403 e 404 removem o status local; falhas de rede e HTTP 5xx preservam o status já confirmado. Os prazos de trial e Passe continuam expirando mesmo sem rede. Confirmar um aviso antigo não restaura uma permissão revogada enquanto a confirmação estava pendente.

O contrato HTTP de `GET /api/billing/status` e as autorizações do servidor permanecem os mesmos. `fetchBillingStatus` aceita um `AbortSignal` opcional no cliente.

## Verificação

Validação desta entrega: 35 cenários de navegador (fluxo de acesso, navegação, paywall, confirmações atrasadas e timeout), 4 testes de estado em memória, lint e build aprovados. A simulação HTTP do Postman registrou as chamadas reais do cliente de assinatura.

```powershell
npm run test:subscription-status
npm run lint
npm run build
```

Para os testes de interface, iniciar a simulação HTTP local e depois o Playwright:

```powershell
# Terminal 1
postman simulation run postman/simulations/subscription-access.sim.yaml --port 4904 --output ndjson --no-history
# Terminal 2
npx playwright test tests/subscription-access.spec.ts tests/subscription-paywall.spec.ts tests/app-routes.spec.ts --output tmp/subscription-access-results
```

O browser executa o cliente HTTP real de assinatura contra o mock do próprio contrato do app no Postman. Os dados de bootstrap são sintéticos. A simulação verifica os estados da interface e não confirma o estado de nenhuma assinatura real na Stripe. Capturas do carregamento em 320 e 1440 px foram inspecionadas visualmente.
