# Redesenho de entrar e criar conta (2026-11-06)

Data: 2026-11-06. Branch: `agente/redesenho-login-cadastro` (a partir de `homologacao`). Telas: `/login` e `/cadastro` (`src/components/AuthPage.tsx`, `src/auth.css`).

## O que mudou

- **Desktop (acima de 1023px):** a porta em arco continua, agora em linho tingido com borda areia de 1,5px (sem o azul Azulejo Noturno), com o Nino acenando por cima do cartão. A sombra do cartão passou ao "Respiro de cartão" do `DESIGN.md`. Os arcos do fundo seguem visíveis.
- **Celular e tablet (até 1023px):** sem caixa azul e sem cartão. O formulário fica direto no linho, com gutter de 20px, e o Nino de 72px num pequeno arco no topo (escondido abaixo de 600px de altura). O fundo opaco de `.auth-shell` cobre os arcos do fundo só nesta tela.
- **Posição estável:** a porta é ancorada pelo topo. O `<h1>` nunca desmonta, então trocar entre entrar e criar conta não move o título.
- **Sem abas:** a troca é um link de rodapé ("Criar conta" no login, "Entre por aqui" no cadastro), com `href` real; clique simples troca o painel e a URL via `replaceState`. O e-mail digitado é mantido (a senha não), e o foco vai para o `<h1>`.
- **Validação na interface:** `noValidate`, mensagem junto do campo, `aria-invalid`, `aria-describedby` e foco no primeiro campo inválido. O login aceita e-mail com `@` (contas antigas); o cadastro exige formato `nome@dominio.ext`.
- **Esqueci minha senha** abaixo do campo de senha, com alvo de 44px; mesma ordem de Tab pedida.
- **Envio:** botão com `aria-busy`/`aria-disabled`, texto "Entrando…" ou "Criando sua conta…" e guarda contra duplo clique. Falha de rede ou 5xx mostra "Ops, tropeçamos aqui. Tente de novo em instantes."; 4xx mostra a mensagem do servidor; 409 no cadastro mostra um texto neutro.
- **Cadastro:** sem campo de confirmar senha (o botão de mostrar senha continua). Regras da senha aparecem ao focar ou com senha digitada; sem foco e vazio, uma linha de dica. Aviso "Depois você escolhe: Passe de R$ 99 ou Mensal com 2 dias grátis, com cartão." no lugar do subtítulo. Texto legal com links para `/termos` e `/privacidade` (nova aba) colado ao botão.
- **Tokens:** tudo em `--cm-*` e `color-mix` (nenhum hex ou `rgba` em `auth.css`). Título em 600, campo de 48px com raio 10, foco só com a borda em terracota profundo, erro em `--destructive`, botão com a sombra do `DESIGN.md`.
- **Limpeza:** removidos `AuthShowcase.tsx`, `.auth-showcase*`, `.auth-tabs*`, o aviso de teste do login e a regra `.auth-tabs[data-slot="tabs-list"]` de `shadcn.css`.

## Decisão do opt-in de e-mails

A caixa de lembretes e dicas **fica no cadastro**, desmarcada por padrão e opcional, com o texto atual palavra por palavra (`MARKETING_CONSENT_VERSION` versiona esse texto). Mover para depois do cadastro seria possível pela rota `PATCH /api/profile/marketing`, mas: ela grava `marketing_consent_source = 'perfil'` fixo (e `tests/growth-db.mjs` fixa esse valor), então um consentimento dado no funil teria origem falsa na prova de consentimento; o funil `/comecar` não tem hoje nenhuma superfície de consentimento e contas com enxoval, onboarding concluído ou trial usado nem o veem; e o botão cabe na dobra com a caixa no cadastro. Se o dono quiser mover depois, a rota precisa aceitar a origem `funil` e ganhar teste em `growth-db`.

## Como validar

```
npm ci
npm run lint
npm run build
npm run test:app-routes
npm run test:password-policy
npm run test:analytics
npm run test:lifecycle
npm run test:nino
npx playwright test tests/auth.spec.ts tests/product.spec.ts tests/legal-pages.spec.ts tests/app-routes.spec.ts tests/admin-ui.spec.ts tests/app-critique.spec.ts
DATABASE_URL=... npm run test:growth-db   # Postgres no ar (npm run db:up)
```

Antes de rodar a Playwright, confira que nada responde em `localhost:3000` de outra worktree (a config usa `reuseExistingServer`); do contrário suba o servidor desta worktree em outra porta e use `PLAYWRIGHT_BASE_URL`. No Windows a config usa `channel: "msedge"`. O servidor de desenvolvimento do Vite disputa a porta 24678 com outras worktrees (erros "WebSocket closed without opened" em `product.spec.ts`); rode contra o build (`npm run build` e `npm start`).

Tamanhos verificados em `tests/auth.spec.ts`: 320x568, 375x667, 425x800 e 1366x768. Manual: abrir `/login` e `/cadastro` nesses tamanhos e em 1024px.

## Estado

- `npm run lint`, `npm run build`, `test:app-routes`, `test:password-policy`, `test:analytics`, `test:lifecycle`, `test:nino` e `test:growth-db`: passaram.
- `tests/auth.spec.ts`: 41 testes passaram (sem rolagem horizontal; botão de entrar inteiro na dobra nos quatro tamanhos; botão de criar conta inteiro na dobra em 375x667, 425x800 e 1366x768).
- **Medida em 320x568 em `/cadastro`:** a base do botão "Criar minha conta" fica em 560px de uma janela de 568px, dentro da dobra com 8px de folga (sem o Nino, que some abaixo de 600px de altura). Com as regras da senha abertas o botão sai da dobra; a exigência vale para o estado inicial.
- Falhas pré-existentes, iguais na linha de base de `homologacao` (`ef831c0`): 31 testes do funil antigo em `tests/onboarding.spec.ts` (esperam `/comecar` sem sessão e botões que não existem mais) e `landing navigation, FAQ and entry routes work` em `tests/product.spec.ts` (o FAQ mudou). O teste de `onboarding.spec.ts` sobre o login foi reescrito e passa.
- `tests/admin-ui.spec.ts`, "temporary password requires a new password" (320, 390 e 1440px): falha porque a senha de teste `SenhaPessoalTeste123` tem a sequência "123", recusada pela política de senha; é a tela de troca obrigatória, que esta entrega não alterou.
- Capturas do inventário (`T02-login*.webp`, `T03-cadastro*.webp`) estão defasadas e precisam ser refeitas.

### Primeiro acesso: aviso de cookies e dobra (medido em 2026-11-08)

As medidas acima têm o consentimento já semeado. O aviso (`.consent-banner`, `position: fixed`, rodapé) só existe em builds com `VITE_POSTHOG_KEY` ou `VITE_GTM_ID`; medido com `VITE_POSTHOG_KEY=phc_medicao_local npm run build`, sem consentimento, em px a partir do topo da janela:

| Tela | Janela | Aviso (topo-base) | Botão de envio (topo-base) |
| --- | --- | --- | --- |
| `/login` | 375x667 | 272-651 | 462-513 |
| `/login` | 320x568 | 128-552 | 381-431 |
| `/cadastro` | 375x667 | 272-651 | 594-644 |
| `/cadastro` | 320x568 | 128-552 | 509-560 |

**Limitação conhecida:** no primeiro acesso o aviso cobre o botão de envio nos quatro casos (o ponto central do botão cai dentro do aviso) até a pessoa escolher uma opção do aviso. Em 320x568 o aviso ocupa 424px dos 568px. O aviso e o funil não foram alterados; a medida fica registrada em `tests/auth.spec.ts` ("primeiro acesso com o aviso de cookies"), que pula em builds sem chave de análise.

## Correções da revisão (2026-11-08)

- **Erro de campo anunciado:** a mensagem do campo fica sempre montada com `role="alert"` e só recebe texto no envio; vazia, some (`:empty`). Anuncia mesmo com o campo já focado (digitar "nome" no e-mail e apertar Enter). `aria-invalid` e `aria-describedby` continuam.
- **Título focado sem linha de foco:** seletor `.auth-shell .auth-heading h1[tabindex="-1"]:focus-visible`, com especificidade para vencer `focus.css`, sem `!important`.
- **Foco da caixa de e-mails no cadastro:** o rótulo ganha a linha interna de 2px em terracota profundo via `:has(input:focus-visible)`, só dentro de `.auth-shell .auth-form`; o respiro de 6px 8px é compensado por margem negativa e não muda a dobra. `/preferencias` não é afetada.
- **Testes:** `/signup` com sessão e sem enxovais termina em `/comecar` (`tests/onboarding.spec.ts`), além do caso sem sessão que leva a `/cadastro`; cor do foco do campo (`rgb(163, 76, 48)`) após a transição de 0,2s, também em `/esqueci-senha` e `/admin/login`; `/preferencias` com API simulada.

## Pendências

Registradas em `docs/implementacoes-futuras.md`: 409 do cadastro ainda revela conta existente na resposta de rede (correção é no servidor); aceite dos Termos de Uso não é gravado; origem do consentimento caso o opt-in vá ao funil. Também: "Começar grátis" em `HousewarmingPage.tsx` ficou como está; `FeatureCarousel.tsx` continua órfão; a troca de modo em `/app/...` faz `replaceState` para `/login` ou `/cadastro`, como antes.
