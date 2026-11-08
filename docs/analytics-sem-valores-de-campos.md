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
  - `describeControl` / `describeField`: nunca coletam valor. Campos viram `{ name, id, type, filled }` (`checked` só em checkbox e radio). `text` só para botões e links, limitado a 80 caracteres; não é coletado de input, textarea, select nem form. `href` sem query nem hash.
  - `stripUrl`: origem mais caminho, sem query, hash ou credenciais.
  - `sanitizeOperational`: lista de propriedades permitidas (`OPERATIONAL_ALLOWED`). Propriedade nova não entra sem ser adicionada ali.
- `captureOperational` envia `url` sem query nem hash e filtra pela lista.
- `application.navigation` envia só `path`.
- `before_send`: eventos `application.*` são descartados em `/admin` e passam de novo pela lista, mais `scrubSdkProperties`. Campos de transporte do SDK (`token`, `distinct_id`, `uuid`, `$...`) são preservados.

## Dados que o painel operacional deixou de ter

- `application.ui.action`: `value`, `fields[].value`, `text` de campos e formulários, query/hash em `href` e `url`.
- `application.navigation`: `search` e `hash`.
- `application.api.started/completed/failed`: `body`, `headers`, `response`, `response_headers` e `input`. Ficam `path`, `method`, `http_status`, `duration_ms`, `request_id`, `phase` e `error` (`name`, `message`, `code`, `stack`, com limite de tamanho). O `path` perde query string.
- Qualquer `application.*` em rotas `/admin`.

## Fora do escopo (pendente)

`captureError` ainda envia o contexto da API (`body`, `response`) em `$exception`, e `docs/analytics.md` descreve que exceções preservam o payload. Avaliar em uma próxima entrega se o contexto de `$exception` também deve ser filtrado.

## Como validar

- `npm run lint`, `npm run build`
- `npm run test:analytics` (cobre `describeControl` com senha, e-mail, Pix, checkbox e textarea, `stripUrl`, `sanitizeOperational`, e o descarte em `/admin`)
- `npm run test:logging`, `npm run test:posthog-logs`
- `npm run test:analytics-browser` (Playwright; espera que `RAW_FORM_VALUE` e `PRIVATE_*` não apareçam em `application.*`). Não foi executado nesta entrega.

## Ação do dono do projeto (não feita aqui)

Nada foi alterado no PostHog. Dados já enviados antes desta correção precisam de decisão do dono:

1. Apagar os eventos `application.ui.action` antigos (e avaliar `application.api.*` e `application.navigation`, que também continham corpo, resposta e query).
2. Avaliar se há dever de comunicação a titulares e à ANPD conforme a LGPD (credenciais e dados pessoais foram transmitidos a um operador terceiro sem necessidade). Considerar a troca de senhas dos usuários afetados.
3. Conferir a retenção e a exportação desses eventos (inclusive em destinos conectados ao PostHog).

Estado: corrigido na branch `fix/analytics-sem-valores-de-campos`, aguardando revisão e integração.
