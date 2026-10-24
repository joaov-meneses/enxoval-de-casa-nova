# Rotas do aplicativo

A URL identifica o enxoval e a tela. Links continuam exigindo login e participação no enxoval; não concedem acesso público.

| Caminho | Tela |
| --- | --- |
| `/app/:enxovalId` | Meu enxoval, todos os ambientes |
| `/app/:enxovalId/itens/:ambienteId` | Itens de um ambiente |
| `/app/:enxovalId/meu-lar` | Resumo do lar |
| `/app/:enxovalId/plano` | Planejamento de compras |

Os endereços antigos `/app`, `/app/itens/:ambienteId`, `/app/meu-lar` e `/app/plano` continuam funcionando e são normalizados com o enxoval carregado, sem adicionar uma entrada ao histórico. Apenas esses links sem enxoval usam a última seleção do `localStorage` como conveniência. Um ID explícito na URL tem prioridade, inclusive ao recarregar duas abas com enxovais diferentes.

Trocar de enxoval ou de tela atualiza o histórico. Voltar/avançar carrega o contexto correspondente. O servidor mantém a conferência de acesso: se o enxoval foi excluído ou a participação foi removida, o bootstrap escolhe um enxoval acessível e a URL é corrigida. Um ambiente ausente abre todos os ambientes desse enxoval. Respostas atrasadas não substituem uma navegação mais recente; uma falha de rede preserva o contexto carregado e informa o erro.

O login e a confirmação de acesso preservam links diretos. O checkout envia o caminho atual em `returnTo`; o servidor aceita somente rotas locais reconhecidas do app, sem query ou fragmento. Sucesso e cancelamento retornam ao mesmo caminho. O cache mensal distingue caminhos de retorno. A confirmação de pagamento continua a cargo do servidor.

## Organização do código

- `shared/appRoute.ts`: leitura, construção e modelos de rota sem IDs para analytics, além da validação do retorno do checkout. `src/appRoute.ts` reexporta essa interface para o cliente.
- `src/App.tsx`: estrutura comum, navegação, autenticação e limites de carregamento das telas.
- `src/hooks/useWorkspace.tsx`: bootstrap, estado compartilhado, sincronização com o histórico e ações do enxoval.
- `src/routes/ListRoute.tsx`, `OverviewRoute.tsx` e `PlanRoute.tsx`: telas carregadas sob demanda; resumo e planejamento reutilizam os componentes existentes.
- `src/components/WorkspaceDialogs.tsx`: menus e diálogos compartilhados.

## Validação local

```powershell
npm run test:app-routes
npm run test:analytics
npm run lint

# Em um terminal separado, sem publicar recursos nem acessar serviços reais:
postman simulation run postman/simulations/app-routes.sim.yaml --port 4906 --no-history
# Com o app em execução:
npx playwright test tests/app-routes.spec.ts

# Simulação Stripe existente, em outro terminal:
postman simulation run postman/simulations/billing.sim.yaml --port 4910 --no-history
# Usa PostgreSQL local, com schema temporário removido ao concluir:
node --env-file=.env --import tsx tests/checkout-routes-db.mjs
```

O mock de navegação foi construído localmente a partir de `BootstrapData`, `EnxovalWorkspace` e do comportamento de fallback do backend. Os testes do navegador executam o cliente real contra essa simulação. O teste de checkout executa Express, PostgreSQL e o SDK Stripe reais contra o mock Stripe já existente. Não realizam cobrança nem validam a conta Stripe de produção.
