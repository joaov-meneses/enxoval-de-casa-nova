# Correção: logs do servidor sem senhas, tokens e dados pessoais

Data: 2026-11-08. Estado: implementado na branch `fix/logs-servidor-sem-segredos`, ainda não integrado.

## O defeito

O log HTTP do servidor (`server/httpLogging.ts`) gravava o corpo da requisição e da resposta, a query string e todos os cabeçalhos, sem redação (só rotas de documentos eram protegidas). Esses logs seguem para o PostHog Logs (`server/posthogLogs.ts`) sem depender de consentimento. Na prática, iam para o log:

- senha e tokens de `POST /api/auth/login`, cadastro, troca e redefinição de senha e aceite de convite;
- `authorization`, `cookie` e `set-cookie`;
- tokens de `/preferencias?token=` e `/pesquisa?token=`, e e-mails em query;
- o corpo das respostas (inclusive o que o servidor devolve de dados pessoais);
- campos de erros (`detail` e `query` do Postgres, `body` do parser de JSON, que contém o corpo bruto).

Também iam para o log, sem passar pelo log HTTP:

- **E-mails transacionais** (`server/mailer.ts`): cada envio e o modo simulado registravam `to`, `subject`, `text`, `html` e `headers`. Isso levava ao PostHog Logs o endereço de e-mail, o nome da pessoa e os links com token: redefinição de senha (`/redefinir-senha#token`), convite (`/convite#token`), verificação de e-mail, `/preferencias?token=`, `List-Unsubscribe` e o texto da central de ajuda. A resposta do provedor (que pode repetir o endereço) também era gravada.
- **Endereços IP e user-agent** (`req.ip`, `req.ips`, `x-forwarded-for`, `x-real-ip`, `user-agent`) e `referer`/`origin` com query.
- Metadados de imagem de perfil (`exif`, `xmp`, `iptc`, Buffers) e alguns logs manuais com objetos inteiros (alertas de preço com e-mail e itens, lembretes de garantia com e-mail, perguntas e respostas da IA, valores do cache compartilhado).

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

### Segunda rodada (revisão)

- A redação agora roda em todo registro, no próprio logger (`hooks.streamWrite` em `server/logger.ts`), antes do stdout e do PostHog. Nenhum log manual sai sem ela.
- A lista de chaves sensíveis passou a comparar o nome inteiro ou o último segmento do nome (camelCase, snake_case), sem substring. Entraram `name`, `nome`, `to`, `from`, `replyTo`, `subject`, `text`, `html`, `message`, `note`, `recado`, `comment`, `cep`, `rua`, `endereco`, `address`, `bairro`, `cidade`, `location`, `phone`, `telefone`, `chave`, `pixKey`, `ip`, `ips` e `userAgent`. Identificadores (`id`, `*Id`, `*_id`) e nomes como `stripeSessionId`, `documentId`, `inputTokens`, `emailType`, `pixels` e `cardinality` continuam visíveis. O `msg` do log e o `message`, `name` e `type` de um erro (texto do código) não são apagados.
- E-mail: o log leva só o domínio do destinatário, o tamanho do assunto, do texto e do HTML (bytes), a contagem de cabeçalhos e o id do provedor. O erro do provedor deixou de repetir o corpo da resposta.
- `x-forwarded-for`, `x-real-ip`, `user-agent`, `req.ip` e `req.ips` não são mais registrados (o IP continua sendo usado para limitar tentativas). `referer` e `origin` saem sem query e sem hash.
- Buffers (inclusive `{type:'Buffer', data}`) viram `[binário N bytes]`; `Date` vira ISO; a imagem de perfil registra só largura, altura, formato e tamanho.
- Erro de JSON inválido vai ao `captureException` como um erro novo com a mensagem fixa, sem o trecho do corpo.
- Query com nome de parâmetro que pareça valor (`@`, mais de 24 caracteres, só dígitos) é registrada só como contagem.
- O corpo da resposta passou a registrar só tipo e tamanho (sem ler o conteúdo).
- O servidor agora envia `Referrer-Policy: strict-origin-when-cross-origin` (feito em `server/index.ts`), para a query de `/preferencias` e `/pesquisa` não vazar no `Referer` para outros domínios.
- Logs manuais reduzidos a ids e contagens: alertas de preço, lembretes de garantia, IA (Jev), cache compartilhado, resposta do provedor do scraper e busca de título do catálogo.

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
3. Invalidar os tokens de redefinição de senha e de convite emitidos desde 18/10 que ainda estejam válidos (recomendado: os links completos, com token, ficaram no PostHog Logs). Considere também os tokens de verificação de e-mail, preferências e pesquisa, e a troca de senhas digitadas em login desde 18/10.
4. Registrar na avaliação da LGPD que também foram para o PostHog Logs endereços de e-mail, nomes e IPs.
5. Revisar o novo 4º parágrafo da página de privacidade (`src/components/PrivacyPage.tsx`), atualizado no merge em homologacao para descrever os registros técnicos sem corpos, senhas, tokens, cookies, valores de query, IPs nem conteúdo de e-mail. É texto legal.

## Estado

Integrado em `homologacao` em 2026-11-08, depois de duas rodadas de revisão. A segunda revisão confirmou resolvidos os vazamentos concretos (e-mail com token, Referer, IP, user-agent, EXIF, JSON inválido no `captureException`) e não encontrou chamada atual que vaze dado real com frequência.

## Pendências conhecidas (revisão de 2026-11-08)

- **`tax_id` e CPF:** a regra que preserva chaves terminadas em `id` deixa passar `tax_id`/`taxId`, e `tax_ids[].value` também passa. Um erro de pagamento da Stripe com `billing_details.tax_id` levaria o CPF ao log. Gravidade baixa a média.
- **Nomes de chave e texto livre:** a busca pelo último segmento do nome deixa passar compostos e plurais. Passam:
  - compostos como `phoneNumber`, `cardNumber`, `passwordHash`, `tokenHash`, `secretKey`, `privateKey`, `zipCode`, `postalCode`, `nomeCompleto`, `enderecoCompleto`, `whatsapp`, `session` e `sid`;
  - plurais como `emails`, `messages`, `tokens` e `passwords`;
  - links fora de `*url`/`*href`, como `resetLink`.

  O texto de `msg` e as strings em arrays não são redigidos: `priceTrackerWorker.ts:195` registra a URL do produto com query, e `productScraper.ts:1033/1037` registra o `trail` de URLs. Avaliar uma lista de permissão por evento e a redação de URLs dentro de strings. Gravidade média para o objetivo.
- **Custo:** a redação roda de forma síncrona em toda linha e é refeita em `formatLog` quando o PostHog está ligado (cerca de 80 µs por linha HTTP e cerca de 3 ms em objetos grandes). Remover a segunda passagem e o cálculo duplicado de `segments()`. Gravidade baixa.
- **Falsos positivos novos:** `name`, `from`, `to`, `text` e `location` no último segmento redigem `itemName`, `storeName`, `fileName`, `eventName` e o booleano `customFrom`. `catalog.resolve.failed` perdeu o nome do item que serve para depurar. Gravidade baixa.
- O `tests/observability-simulation.mjs` foi atualizado, mas só rodou com um coletor falso, porque o simulador do Postman (porta 4900) não estava disponível.
