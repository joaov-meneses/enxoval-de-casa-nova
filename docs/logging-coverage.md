# Cobertura de logs

Inventario revisado em 2026-10-19: 71 registros de rotas da API. A cobertura vem do middleware global em server/index.ts, antes do webhook e dos parsers. Novas rotas herdam a mesma instrumentacao. Nao foi executada uma chamada de negocio em cada rota; os testes exercitam o middleware comum com rotas reais locais.

Todas as rotas abaixo registram inicio, resultado ou falha, ID, URL, entrada, contexto, duracao, status e resposta da API.

| Metodo | Rota | Arquivo |
| --- | --- | --- |
| POST | `/api/onboarding/complete` | `server/routes.ts` |
| GET | `/api/health` | `server/routes.ts` |
| GET | `/api/bootstrap` | `server/routes.ts` |
| POST | `/api/auth/register` | `server/routes.ts` |
| POST | `/api/auth/login` | `server/routes.ts` |
| POST | `/api/auth/change-password` | `server/routes.ts` |
| POST | `/api/auth/forgot-password` | `server/routes.ts` |
| POST | `/api/auth/reset-password/check` | `server/routes.ts` |
| POST | `/api/auth/reset-password` | `server/routes.ts` |
| POST | `/api/auth/activity` | `server/routes.ts` |
| POST | `/api/auth/logout` | `server/routes.ts` |
| GET | `/api/enxovais/:id` | `server/routes.ts` |
| POST | `/api/enxovais` | `server/routes.ts` |
| PATCH | `/api/enxovais/:id` | `server/routes.ts` |
| DELETE | `/api/enxovais/:id` | `server/routes.ts` |
| GET | `/api/enxovais/:id/invitations` | `server/routes.ts` |
| POST | `/api/enxovais/:id/invitations` | `server/routes.ts` |
| DELETE | `/api/enxovais/:id/invitations/:invitationId` | `server/routes.ts` |
| DELETE | `/api/enxovais/:id/members/:userId` | `server/routes.ts` |
| POST | `/api/invitations/check` | `server/routes.ts` |
| POST | `/api/invitations/accept` | `server/routes.ts` |
| GET | `/api/categories` | `server/routes.ts` |
| POST | `/api/categories` | `server/routes.ts` |
| PATCH | `/api/categories/order` | `server/routes.ts` |
| PATCH | `/api/categories/:id` | `server/routes.ts` |
| DELETE | `/api/categories/:id` | `server/routes.ts` |
| PATCH | `/api/items/order` | `server/routes.ts` |
| GET | `/api/items` | `server/routes.ts` |
| POST | `/api/items` | `server/routes.ts` |
| PATCH | `/api/items/:id` | `server/routes.ts` |
| DELETE | `/api/items/:id` | `server/routes.ts` |
| POST | `/api/products/extract` | `server/routes.ts` |
| GET | `/api/items/:id/price-history` | `server/routes.ts` |
| GET | `/api/enxovais/:id/savings-summary` | `server/routes.ts` |
| POST | `/api/admin/login` | `server/admin.ts` |
| GET | `/api/admin/session` | `server/admin.ts` |
| POST | `/api/admin/logout` | `server/admin.ts` |
| GET | `/api/admin/users` | `server/admin.ts` |
| POST | `/api/admin/users/:id/reset-password` | `server/admin.ts` |
| PATCH | `/api/admin/users/:id/status` | `server/admin.ts` |
| POST | `/api/billing/webhook` | `server/billing.ts` |
| GET | `/api/billing/plans` | `server/billing.ts` |
| GET | `/api/billing/status` | `server/billing.ts` |
| POST | `/api/billing/pass-notice` | `server/billing.ts` |
| POST | `/api/billing/trial-notice` | `server/billing.ts` |
| POST | `/api/billing/checkout` | `server/billing.ts` |
| POST | `/api/billing/cancel` | `server/billing.ts` |
| POST | `/api/billing/portal` | `server/billing.ts` |
| POST | `/api/billing/sync` | `server/billing.ts` |
| GET | `/api/ai/status` | `server/ai.ts` |
| POST | `/api/ai/assess-item` | `server/ai.ts` |
| POST | `/api/ai/recommend` | `server/ai.ts` |
| POST | `/api/ai/prioritize` | `server/ai.ts` |
| POST | `/api/feedback` | `server/feedback.ts` |
| GET | `/api/admin/feedback` | `server/feedback.ts` |
| PATCH | `/api/admin/feedback/:id` | `server/feedback.ts` |
| GET | `/api/admin/feedback/:id/screenshot` | `server/feedback.ts` |
| GET | `/api/profile` | `server/profile.ts` |
| PATCH | `/api/profile` | `server/profile.ts` |
| POST | `/api/profile/avatar` | `server/profile.ts` |
| DELETE | `/api/profile/avatar` | `server/profile.ts` |
| GET | `/api/profile/avatar` | `server/profile.ts` |
| GET | `/api/catalog/search` | `server/catalog/routes.ts` |
| GET | `/api/admin/catalog/overview` | `server/catalog/routes.ts` |
| GET | `/api/admin/catalog/items` | `server/catalog/routes.ts` |
| PATCH | `/api/admin/catalog/items/:id` | `server/catalog/routes.ts` |
| POST | `/api/admin/catalog/items/:id/merge` | `server/catalog/routes.ts` |
| DELETE | `/api/admin/catalog/items/:id` | `server/catalog/routes.ts` |
| POST | `/api/admin/catalog/items/:id/complete` | `server/catalog/routes.ts` |
| POST | `/api/admin/catalog/items/:id/aliases` | `server/catalog/routes.ts` |
| DELETE | `/api/admin/catalog/aliases/:key` | `server/catalog/routes.ts` |

## Acoes e rotinas

| Area | Cobertura |
| --- | --- |
| Navegacao | URL real, caminho, query e fragmento; carga inicial e History API |
| Interface | Cliques em controles, campos alterados e formularios, incluindo controles de dialogs e administracao |
| API do navegador | Inicio, conclusao, erro HTTP/rede/parser, entrada, resposta, status, duracao e X-Request-Id |
| React | Erros tratados e nao tratados, com component stack |
| E-mail | Inicio, mensagem/destinatario, resposta do provedor, sucesso/simulacao/falha |
| Jev | Dados da pergunta/resposta, cache, falta de configuracao, limite e falhas |
| Scraper | Resultado, camadas/fallbacks, resposta de erro do provedor e falhas de leitura |
| Cache Redis | Leitura, escrita, contador, publicacao e erros completos sem aviso limitado por minuto |
| Banco | Migracoes, pool e inicio/commit/falha das transacoes de withTransaction |
| Precos | Inicio, produto/resultado, falhas por produto, alertas e resumo |
| Catalogo | Inicio, progresso, resumo, erros de resolucao e gravacao de metricas |
| Trial e IPs | Inicio, conclusao e falhas das rotinas |
| CLI e processo | Migracao/catalogo/precos com flush; inicializacao e desligamento |

A cobertura descreve os pontos instrumentados. Nao equivale a gravacao de sessao, de cada tecla, de cada query SQL ou a garantia de entrega remota. Veja [logs.md](logs.md) para configuracao, testes e limites.
