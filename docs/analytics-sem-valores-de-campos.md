# Analytics sem valores de campos (2026-11-08)

Correção de vazamento de dados pessoais nos eventos operacionais `application.*` enviados ao PostHog.

## O defeito

- `application.ui.action` (`src/analytics/operations.ts`) enviava, em todo clique, alteração e envio, o `value` do controle e o `value` de todos os campos do formulário, inclusive `type=password`, e-mail, chave Pix e documentos.
- `captureOperational` enviava `url: window.location.href`, com query e hash (por exemplo `/preferencias?token=...`). O mesmo ocorria no `application.navigation` (`search` e `hash`).
- As chamadas da API (`application.api.*`) levavam `body`, `headers`, `response` e `response_headers`, o que incluía senhas de login e dados de respostas.
- O `before_send` deixava passar qualquer `application.*` com todas as propriedades antes do filtro de `/admin`, então o admin também vazava.

Efeito prático: com PostHog configurado e consentimento de análise, enviar `/login` ou clicar em "Mostrar senha" mandava a senha em texto puro.

## Desde quando

Desde o commit `fab6769` (20/10/2026), presente em `main`, `homologacao` e `develop`.

## O que mudou

- Novo `src/analytics/operationalPrivacy.ts`, com funções puras:
  - `describeControl` / `describeField`: nunca coletam valor, rótulo (`aria-label`) nem texto. Saem só `tag`, `id`, `name` (atributo), `type`, `role`, `data-analytics`, `href` sem query nem hash, `aria-expanded`, `aria-selected` e `checked` (só checkbox e radio). Os campos do formulário viram `{ name, id, type, filled }`. Tudo vem de `getAttribute`, nunca de propriedades como `form.name`, que podem devolver um elemento.
  - `stripUrl`, `cutQueryAndHash` e `apiPathTemplate`: URL sem query nem hash; caminho da API com ids, tokens e e-mails trocados por `:id`.
  - `sanitizeOperational`: lista de permissão (`OPERATIONAL_ALLOWED`) que só aceita `string`, `number`, `boolean` ou `null`. Objetos e arrays são descartados (exceto `fields`, reconstruído campo a campo). Chaves `$` só passam se estiverem em `SDK_PROPERTY_KEYS`. O erro vira `error_name` e `error_code`.
- `captureOperational` envia `url` sem query nem hash e filtra pela lista.
- `application.navigation` envia só `path`.
- `before_send`: eventos `application.*` são descartados em `/admin` e passam de novo pela lista. `$set` e `$set_once` perdem query e hash de `$initial_current_url` e similares e só levam primitivos.
- `src/api.ts` e `src/sessionActivity.ts` já não entregam `body`, `headers`, `response` nem mensagem de erro ao `captureOperational`.

## Dados que o painel operacional deixou de ter

- `application.ui.action`: `value`, `fields[].value`, `label` e `text` (inclusive de botões e links, que podem trazer e-mail de convite, nome de arquivo ou nome de item), query e hash em `href` e `url`. O painel perde o texto do botão clicado; para identificar uma ação, use `id`, `name`, `role` ou o atributo `data-analytics` (ainda não aplicado a nenhum botão).
- `application.navigation`: `search` e `hash`.
- `application.api.started/completed/failed`: `body`, `headers`, `response`, `response_headers`, `input`, `error.message` e `error.stack`. Ficam `path` (sem query, com `:id`), `method`, `http_status`, `duration_ms`, `request_id`, `phase`, `error_name` e `error_code`.
- Qualquer `application.*` em rotas `/admin`.

## `$exception`

`src/api.ts` passava `...input` / `...context` (com `body` da requisição, `response` e `response_headers`) para `captureError`. Todo login com senha errada (401) e toda falha de rede enviava a senha no `$exception`. Os `info` do React também iam inteiros. Além disso, a mensagem do servidor (por exemplo "Este convite é para <e-mail>") ia no `$exception`.

- `captureError` filtra o contexto por `ERROR_CONTEXT_ALLOWED`: `path` (com `:id`), `method`, `http_status`, `request_id`, `phase`, `error_source`, `duration_ms` e `componentStack`.
- Falhas da API capturam um erro novo de mensagem fixa, `ApiError <status> <método> <caminho com :id>` (nome `ApiError`), no lugar do original. Falha de rede usa status 0. No `response.parse` o erro operacional leva só o nome (`SyntaxError`). A mensagem real continua na tela da pessoa.
- `src/main.tsx` passa só `error_source` e `componentStack`.
- O `before_send` de `$exception` usa lista de permissão (`allowExceptionProperties`): mantém `$exception_*` do SDK, transporte (`token`, `distinct_id`), chaves do SDK (`$session_id`, `$device_id`, `$lib`, `$browser`, `$os`...), `$initial_*` e o contexto permitido. O resto é descartado, só primitivos passam, e `$current_url`, `$pathname`, `$referrer` e `$initial_*` saem sem query nem hash.
- Slugs: o slug do Chá (`/api/public/housewarming/<slug>`, `/cha/<slug>`) e a chave de alias do catálogo viram `:slug` e `:key`, e ids viram `:id`, em `application.api.*`, `application.navigation`, na mensagem fixa do `ApiError` e em `$pathname`/`$current_url` do `$exception` (rota-modelo, como o `$pageview`). Rotas públicas com texto livre encontradas em `src/`: só o slug do Chá e o alias do catálogo.
- Rejeição não tratada: o SDK captura sozinho um `ApiError` que ninguém tratou, com o texto do servidor. `request()` registra a mensagem mostrada na tela (`rememberApiError`) e o `before_send` troca o `value` de qualquer item `ApiError` de `$exception_list` pela mensagem fixa (ou por `ApiError`, se não houver registro).
- Chaves `$exception_*`: só `$exception_list`, `$exception_level`, `$exception_fingerprint` e `$exception_types`. `$exception_values`, `$exception_steps`, `$exception_message` e `$exception_source` (texto livre) saem. Cada item de `$exception_list` mantém `type`, `value`, `mechanism` (`type`, `handled`, `synthetic`) e `stacktrace` com `filename` sem query, `function`, `lineno`, `colno` (mais `in_app`, `platform` e `chunk_id`, que só descrevem o frame). Contexto de código (`context_line`, `vars`) sai. `$initial_*` passa pelo mesmo filtro de `$set` (sem `utm_*`, `gclid` e similares).
- O que o `$exception` perdeu: `body`, `headers`, `input`, `response`, `response_headers`, qualquer propriedade extra, `$set`, e a mensagem original dos erros de API. Erros que não são de API (por exemplo um `TypeError` do React) ainda levam a própria mensagem.

## Como validar

- `npm run lint`, `npm run build`
- `npm run test:analytics` (cobre `describeControl` com senha, e-mail, Pix, checkbox, textarea, `aria-label` com e-mail e `form.name` sombreado por um elemento; `sanitizeOperational`; `$exception` por lista de permissão; `$set`; e o descarte em `/admin`). Entra no CI (`.github/workflows/ci.yml`).
- `npm run test:error-tracking`, `npm run test:logging`, `npm run test:posthog-logs`
- `npm run test:analytics-browser` (SDK real no Edge/Chromium; o servidor Vite usa porta livre e HMR desligado). Não entra no CI, que não instala navegador.

## Texto legal

`src/components/PrivacyPage.tsx` dizia que os registros operacionais preservavam "os dados reais". Foi reescrito para dizer que só saem metadados da interação, sem valores digitados, conteúdo, mensagens do servidor nem URL com parâmetros, e que erros técnicos do navegador que não vêm da API ainda podem levar a mensagem e a pilha de erro do código, sem dados digitados. O parágrafo dos registros do servidor não foi alterado aqui. É texto legal: precisa de revisão do dono antes de ir para produção.

## Ação do dono do projeto (não feita aqui)

Nada foi alterado no PostHog. Dados já enviados antes desta correção precisam de decisão do dono:

1. Apagar os eventos antigos que continham dados digitados: `application.ui.action`, `application.api.*` (corpo e resposta), `application.navigation` (query e hash) e os `$exception` com `error_source=api`.
2. Avaliar se há dever de comunicação a titulares e à ANPD conforme a LGPD (credenciais e dados pessoais foram transmitidos a um operador terceiro sem necessidade). Considerar a troca de senhas dos usuários afetados.
3. Conferir a retenção e a exportação desses eventos (inclusive em destinos conectados ao PostHog).

Estado: corrigido na branch `fix/analytics-sem-valores-de-campos`, aguardando revisão e integração.
