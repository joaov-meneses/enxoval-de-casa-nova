# Correção: logs do servidor sem senhas, tokens e dados pessoais

Data: 2026-11-08. Estado: implementado na branch `fix/logs-servidor-sem-segredos`, ainda não integrado.

## O defeito

O log HTTP do servidor (`server/httpLogging.ts`) gravava o corpo da requisição e da resposta, a query string e todos os cabeçalhos, sem redação (só rotas de documentos eram protegidas). Esses logs seguem para o PostHog Logs (`server/posthogLogs.ts`) sem depender de consentimento. Na prática, iam para o log:

- senha e tokens de `POST /api/auth/login`, cadastro, troca e redefinição de senha e aceite de convite;
- `authorization`, `cookie` e `set-cookie`;
- tokens de `/preferencias?token=` e `/pesquisa?token=`, e e-mails em query;
- o corpo das respostas (inclusive o que o servidor devolve de dados pessoais);
- campos de erros (`detail` e `query` do Postgres, `body` do parser de JSON, que contém o corpo bruto).

O captador de exceções (`server/errorTracking.ts`) enviava ao PostHog `query`, `body` e `headers` da requisição pelo mesmo motivo.

O teste `tests/logging.mjs` exigia esse comportamento (`assert.equal(echoLog.req.body.password, 'original-password')`).

## Desde quando

- Corpo da requisição e da resposta no log: commit `fab6769`, 2026-10-20 (`git log -S"payload(req.body)"`).
- Módulo e envio ao PostHog Logs: commit `b1e325e`, 2026-10-18.
- Portanto, os registros afetados cobrem de 2026-10-18 (envio) / 2026-10-20 (corpo) até o deploy desta correção. Considere a janela a partir de 2026-10-18 para ser conservador.

## O que mudou

- Novo `server/logRedaction.ts`, usado por `httpLogging.ts`, `logger.ts` (serializador de erros), `posthogLogs.ts` e `errorTracking.ts`.
- Corpo de requisição e de resposta não são mais registrados. Sai só o metadado: nomes das chaves, tipos e tamanho em bytes.
- Cabeçalhos `authorization`, `cookie`, `set-cookie`, `x-api-key` e `proxy-authorization` saem como `[redigido]`, assim como qualquer cabeçalho com nome sensível.
- A URL é registrada com os nomes dos parâmetros de query e os valores `[redigido]`. O objeto `query` também só leva nomes.
- Em qualquer profundidade, chaves sensíveis viram `[redigido]` (password, senha, token, secret, authorization, cookie, pix, cpf, cnpj, document, card, email, telefone, endereço e similares). No envio ao PostHog isso é reaplicado em todo registro, como última barreira.
- Erros mantêm mensagem, pilha, código e causas, mas `detail`, `query`, `parameters`, `body` e afins viram `[redigido]`. A mensagem do erro de JSON inválido (que cita um trecho do corpo) é trocada por texto fixo.
- Testes atualizados: `tests/logging.mjs` (agora exige o contrário, com cenários de login, cadastro, redefinição de senha, aceite de convite e `/preferencias?token=`), `tests/posthog-logs.mjs` e `tests/error-tracking.mjs`.

## O que se perde

- Painéis ou buscas que dependam de valores do corpo, da query ou de cabeçalhos (por exemplo, filtrar por e-mail ou por `req.query.x`).
- Diagnóstico por `err.detail` e `err.query` do Postgres: a causa (mensagem, código, pilha) continua, o valor do dado não.
- Valores de `req.params` com chave sensível.

## Como validar

```
npm run lint
npm run build
npm run test:logging
npm run test:posthog-logs
npm run test:error-tracking
npm run test:password-policy
# com Postgres:
npm run test:session-db
npm run test:invitations-db
npm run test:password-reset-db
```

Em produção, depois do deploy: faça um login com senha de teste e procure no PostHog Logs por esse valor; não deve haver resultado.

## Ação do dono

1. Apagar no PostHog Logs (e, se houver, no armazenamento de exceções do PostHog) os registros antigos desde 2026-10-18.
2. Incluir este incidente na avaliação da LGPD (dados pessoais e credenciais em logs de terceiro, sem consentimento).
3. Considerar a troca das senhas e a invalidação dos tokens de redefinição, convite e preferências que ainda estejam válidos.
4. Atualizar o texto da página de privacidade (`src/components/PrivacyPage.tsx`), hoje com a frase que admite senhas e tokens nos registros, e `docs/logs.md` e `docs/analytics.md`, em outra branch.
