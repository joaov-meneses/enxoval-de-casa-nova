# Aviso de cookies no celular (2026-11-08)

## Problema

Em build com `VITE_POSTHOG_KEY` ou `VITE_GTM_ID`, na primeira visita, o aviso ocupava de 60 a 75% da tela no celular e cobria o botão principal de `/login` e `/cadastro` (medida anterior em `docs/redesenho-login-cadastro-2026-11-06.md`).

## O que mudou

- `src/components/ConsentBanner.tsx`: com o aviso aberto, mede a altura real (`ResizeObserver` e `resize`), grava `--consent-banner-space` e `data-consent-open` no `<html>` e limpa tudo ao decidir ou fechar. Classe `is-customizing` no modo personalizar. Texto do parágrafo encurtado (abaixo).
- `src/consent.css`: até 767px o aviso é uma faixa presa ao rodapé (safe-area, no máximo 40dvh, rola por dentro em zoom alto; no modo personalizar o limite sobe para `100dvh - 16px`). Os três botões ficam lado a lado, com a mesma classe e 44px de altura mínima. `html[data-consent-open]` ganha `scroll-padding-bottom` e o `body` ganha `padding-bottom` iguais ao espaço medido, em todas as larguras. Cores fixas e fallbacks em hex trocados por tokens `--cm-*`. No desktop o cartão é o mesmo.
- Sem overlay: não há motivo legal documentado para bloquear a página (`docs/analytics-funil-e-reengajamento.md` só exige a escolha antes de qualquer cookie ou envio, o que `src/analytics.ts` já garante).
- Não mudaram: `decide`, `saveConsent`, `readConsent`, `CONSENT_VERSION` (`2026-10`), chave `casamia:consent`, categorias, checkboxes desmarcados por padrão, regra do `/admin`, carregamento dos scripts. Sem foco automático e sem tratar Esc.

## Texto legal: antes e depois (para revisão do dono)

Antes: "Usamos cookies essenciais para manter você conectado. Com a sua permissão, também medimos o uso do app (PostHog e Google Analytics) e a origem das visitas de anúncios (Google Ads). Você pode mudar isso quando quiser na política de privacidade."

Depois: "Cookies essenciais mantêm você conectado. Com sua permissão, também medimos o uso do app (PostHog e Google Analytics) e a origem de visitas de anúncios (Google Ads). Mude quando quiser na política de privacidade."

Mesmos fornecedores, finalidades e link. Se o dono preferir o original, basta restaurar o parágrafo: o aviso cresce cerca de uma linha e continua abaixo de 40% em 320x568.

## Medidas (build com chave, sem consentimento, botão depois de rolar)

| Tela | Janela | Aviso (topo-base) | Altura | % da janela | Botão de envio (topo-base) |
| --- | --- | --- | --- | --- | --- |
| `/login` | 375x667 | 462-667 | 205px | 31% | 257-308 |
| `/login` | 320x568 | 363-568 | 205px | 36% | 208-258 |
| `/cadastro` | 375x667 | 462-667 | 205px | 31% | 312-362 |
| `/cadastro` | 320x568 | 363-568 | 205px | 36% | 213-264 |

Antes: aviso de 272-651 (375x667) e 128-552 (320x568), cobrindo o botão. Em 1366x768 o cartão do desktop não cobre o botão de envio de `/login` (coberto por `tests/consent-banner.spec.ts`) e também recebe a reserva de espaço.

## Como validar

1. `npm run lint`.
2. Build com aviso: `VITE_POSTHOG_KEY=phc_medicao_local npm run build`, `npx vite preview --port 3103 --strictPort`, depois `PLAYWRIGHT_BASE_URL=http://localhost:3103 npx playwright test tests/auth.spec.ts tests/consent-banner.spec.ts tests/legal-pages.spec.ts tests/product.spec.ts`.
3. Build comum: `npm run build` e o mesmo comando (os testes do aviso pulam; o último confere que não há reserva de espaço).
4. `npm run test:analytics`.

## Correções da revisão (2026-11-08)

- Botões: `.consent-actions` vira coluna única, com botões de largura total, quando a faixa não comporta os três lado a lado (`@container consent`, limite em `rem`). Com fonte padrão continuam em três colunas. Nenhum botão transborda em 320 px com a raiz em 130% e 200%, e Recusar e Aceitar seguem iguais (mesma largura, 44px ou mais).
- Ações sempre à vista: a faixa é uma coluna flex, e só `.consent-scroll` (texto e categorias, novo `div` em `ConsentBanner.tsx`) rola. Título e botões ficam fixos. O teto é `min(max(40dvh, 15rem), 100dvh - 16px)`: 40dvh com a fonte padrão e mais alto com fonte grande, para os botões caberem.
- Painéis fixos do `/app`: enquanto `html[data-consent-open]` está ativo até 767px, `.casamia-dialog` (bottom sheets, inclusive o rodapé sticky do formulário de item), `.workspace-menu-panel`, `.mobile-bottom-nav`, `.mobile-fab-add`, `.undo-toast-region` e `.subscription-connection-notice` sobem `var(--consent-banner-space)`. O z-index do aviso não mudou. Entre 768 e 1023 px (cartão de 560px) a barra inferior do `/app` ainda pode ficar parcialmente sob o cartão.
- Testes novos em `tests/consent-banner.spec.ts`: fonte em 130% e 200% (320x568) e bottom sheet do `/app` com o aviso aberto.

### Medidas depois das correções (`/login`, build com chave)

| Janela | Fonte | Topo do aviso | Altura | % da janela | Botão de envio (topo-base, rolado) |
| --- | --- | --- | --- | --- | --- |
| 320x568 | padrão | 363 | 205px | 36% | 313-363 |
| 320x568 | 130% | 256 | 312px | 55% | 206-256 |
| 375x667 | padrão | 462 | 205px | 31% | 411-462 |
| 375x667 | 130% | 355 | 312px | 47% | 304-355 |

Modo personalizar: 320x568 ocupa 79% (padrão) e 97% (130%); 375x667, 61% e 98%. Em todos, `scrollWidth - clientWidth` dos botões é 0 e o último botão termina dentro do aviso.

### Teste WCAG a 390 px: baseline

`WCAG accessibility checks on public pages at 390px` é instável e não vem desta branch. Em `homologacao` (`73fd54d`, build com chave) ele falhou na execução completa de `product.spec.ts` e passou 6 de 6 isolado. Nesta branch (build com chave) falhou na execução completa e passou 6 de 6 isolado; no build comum passou na execução completa. Conclusão: falha só sob carga (provavelmente a animação de entrada da landing no axe), com o mesmo comportamento na linha de base. Não foi corrigido aqui.

## Estado

- `npm run lint`: passou. `npm run test:analytics`: 37 passaram.
- Build com chave: `auth`, `consent-banner` e `legal-pages` passaram. Em `product.spec.ts` falhou só `landing navigation, FAQ and entry routes work`, já falho antes (o FAQ mudou).
- Build comum: 60 passaram, 15 pularam (os do aviso). Falharam `landing navigation, FAQ and entry routes work` (pré-existente) e `WCAG accessibility checks on public pages at 390px` (contraste de `.cm-how-step` na landing; instável, ver "Teste WCAG a 390 px: baseline" acima).
- Movimento reduzido: a regra global deixa a transição em 0,00001s, na prática desligada.

## Fica para depois

Barra inferior entre 768 e 1023 px e chave antiga `cm_consent_v1` em `tests/housewarming.spec.ts` (ver `docs/implementacoes-futuras.md`).
