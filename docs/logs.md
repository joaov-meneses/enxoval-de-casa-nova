# Logs do servidor

O servidor usa [Pino](https://github.com/pinojs/pino) e [pino-http](https://github.com/pinojs/pino-http). Todas as requisições que chegam ao Express são registradas: API, webhook Stripe, páginas, arquivos estáticos e caminhos inexistentes. A instrumentação vem antes dos parsers, incluindo falhas por JSON inválido e corpo acima do limite.

## Consultar e configurar

Os logs saem em stdout e podem ser consultados no terminal de `npm run dev` ou no coletor da hospedagem. Em desenvolvimento, `pino-pretty` formata horário, nível, contexto e stack em várias linhas. Em produção (`NODE_ENV=production` ou `--production`), cada evento ocupa uma linha JSON para pesquisa e agregação.

Variáveis opcionais em `.env.local`, `.env` ou no ambiente da hospedagem:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | Nível mínimo: `trace`, `debug`, `info`, `warn`, `error`, `fatal`; `silent` desativa |
| `LOG_FORMAT` | Automático por ambiente | `pretty` para leitura humana; `json` para saída estruturada |
| `LOG_SLOW_REQUEST_MS` | `1000` | Tempo a partir do qual a conclusão recebe `warn` e `slow: true` |

Com `LOG_LEVEL=warn`, entradas e conclusões normais são filtradas. Use `info` para acompanhar todas as rotas. O nível `debug` permite eventos adicionais que venham a ser instrumentados; ele não habilita captura de corpos ou consultas SQL.

## Informações disponíveis

- `event`: início (`http.request.started`), conclusão (`http.request.completed`), falha com erro (`http.request.failed`) ou interrupção pelo cliente (`http.request.aborted`). Uma resposta 4xx enviada diretamente pela rota aparece como `completed`, com nível `warn` e mensagem de recusa.
- `reqId`: UUID gerado pelo servidor e devolvido no cabeçalho `X-Request-Id`. Permite relacionar início, eventos internos e conclusão. IDs enviados pelo cliente não são reutilizados.
- `req`: método, caminho sem query string, endereço IP conforme a configuração de proxy do Express, user-agent limitado e tamanho informado do corpo.
- `route`: padrão da rota atendida na conclusão, por exemplo `/api/items/:id`.
- `res`: status HTTP e tamanho da resposta quando disponível.
- `responseTime`: duração em milissegundos, incluindo leitura e processamento do corpo.
- `userId`: identificador interno, quando a autenticação de usuário resolve uma sessão. Não registra nome nem e-mail. Não é preenchido em rotas sem sessão ou na autenticação administrativa separada.
- `err`: tipo, mensagem, stack (incluindo causas), código e status quando disponíveis.
- `service`, `environment`, `pid` e `time`: identificação da aplicação, ambiente, processo e horário ISO.

Respostas 4xx usam `warn`; falhas 5xx usam `error`; requisições lentas e conexões interrompidas usam `warn`. Erros esperados mantêm a resposta pública existente; erros internos devolvem mensagem genérica ao cliente, com detalhes disponíveis no log. Erros que chegam ao middleware ficam associados ao log de conclusão, sem um segundo evento de erro do middleware.

Também há eventos para início do servidor, migrações, porta indisponível, falhas de conexões ociosas do banco, envio de convites, recuperação de senha, notificações da central de ajuda e operações de cobrança. Falhas de webhook incluem o ID e tipo do evento Stripe.

## Envio ao PostHog Logs

O backend envia uma cópia filtrada dos logs pelo protocolo OpenTelemetry/OTLP HTTP para o mesmo projeto usado no Error Tracking. O recurso fica ativo em produção quando há um token público `phc_...` em `POSTHOG_KEY` ou `VITE_POSTHOG_KEY`. Não precisa de chave pessoal, de outro serviço nem de novas variáveis obrigatórias no deploy.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `POSTHOG_LOGS` | Ativo em produção com token | `false` desativa somente o envio remoto; stdout continua funcionando |
| `POSTHOG_LOGS_MAX_PER_MINUTE` | `600` | Teto de registros por minuto e por processo (máximo configurável: `6000`) |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | Host de ingestão; usa `VITE_POSTHOG_HOST` como alternativa. O caminho OTLP é `/i/v1/logs` |
| `POSTHOG_ENABLE_DEV` | `false` | `true` permite envio em desenvolvimento; compartilha a configuração do Error Tracking |

São enviados `warn`, `error` e `fatal` dos eventos conhecidos, incluindo falhas HTTP, banco, Stripe, e-mail, Nino/Jev e rotinas. Em `info`, somente inicialização, migrações, processamento de webhook e resumos das rotinas de catálogo/preços. Sucessos selecionados usam no máximo 20% do teto; avisos e erros podem usar todo o orçamento restante. Requisições normais e eventos de início de requisição ficam somente nos logs locais. Novos eventos precisam entrar explicitamente na lista permitida de `server/posthogLogs.ts`.

O corpo remoto contém somente o nome fixo do evento. Os atributos permitidos são UUID de requisição gerado pelo servidor, método, padrão de rota da API registrado no Express, status, duração, lentidão, tipo/código de erro de listas fechadas, tipo conhecido de evento Stripe e contadores das rotinas. Não envia IP, user-agent, identificação de usuário, URL/caminho real, parâmetros, conteúdo de conversa, corpos, headers, mensagens/stacks de erro nem IDs da Stripe. O recurso OpenTelemetry contém apenas serviço `casamia` e ambiente. Não há coleta automática de console, requisições ou atributos da máquina.

A fila tem até 512 registros, lotes de até 50 e envio a cada 5 segundos ou ao completar um lote. Falhas de transporte não alteram as respostas do app nem geram novos logs recursivos. Não há armazenamento persistente para reenvio: excedentes de volume/fila e lotes com falha podem não chegar ao PostHog; os logs locais continuam disponíveis. O encerramento por SIGTERM/SIGINT espera até 5 segundos por requisições abertas e tenta esvaziar a fila por até 2,5 segundos. Falhas de inicialização também tentam enviar o último log antes de sair.

Os limites de Logs são separados dos limites de exceções do Error Tracking. Esses logs são uma amostra operacional, não uma fonte para contar pagamentos, usuários ou receita.

Depois do deploy, abra [PostHog Logs do projeto](https://us.posthog.com/project/665798/logs), selecione serviço `casamia` e ambiente `production`. Busque `server.listening`, `billing.webhook.failed`, `jev.request.failed` ou `http.request.failed`. O atributo `request.id` corresponde ao `X-Request-Id` da resposta e ao `request_id` da exceção capturada pelo middleware do Express. Mensagens/stacks completas permanecem nos logs locais; exceções sanitizadas e source maps pertencem ao Error Tracking.

Referência: [instalação de Logs com Node.js](https://posthog.com/docs/logs/installation/nodejs).

## Adicionar contexto em novas operações

Dentro de uma rota ou função chamada por ela, use o logger do contexto assíncrono:

```ts
import { getLogger } from './logger.ts';

getLogger().info({ event: 'operation.completed', itemId }, 'Operação concluída.');
getLogger().error({ event: 'operation.failed', err }, 'Não foi possível concluir a operação.');
```

`getLogger()` mantém `reqId` em chamadas assíncronas e, após a resolução da sessão, inclui `userId`. Fora de uma requisição, retorna o logger da aplicação. Passe a instância original do erro em `err` para preservar stack e causas.

## Dados sensíveis

Os logs HTTP não serializam corpos, valores de query strings, cookies, cabeçalhos de autorização, assinaturas Stripe ou cabeçalhos completos das respostas. Erros usam uma lista de campos permitidos para não copiar detalhes SQL, parâmetros, corpos do parser e outras propriedades anexadas. O erro de JSON inválido é substituído por uma mensagem segura, pois o parser pode incluir trechos do corpo na mensagem original.

Há também redação de campos comuns de senha, token e segredo, na raiz e no primeiro nível. Mensagens de erro, caminhos, user-agent e campos personalizados continuam sendo texto: ao adicionar novos eventos, evite colocar credenciais, conteúdo pessoal ou URLs assinadas nesses campos. Rotas futuras com tokens no próprio caminho exigem sanitização explícita.

## Validação

`npm run test:logging` executa um servidor HTTP local sem banco e verifica correlação de chamadas concorrentes, níveis, stacks e causas, rota parametrizada, webhook com corpo cru, respostas 403/404/429/500, JSON inválido, limite de corpo, lentidão, interrupção da conexão e ausência de dados sensíveis conhecidos.

`npm run test:posthog-logs` verifica a lista de campos exportáveis, desligamento por ambiente/token, teto de volume e reinício da janela, falhas de transporte e um fluxo real Pino → Express → OpenTelemetry → coletor HTTP local. Também verifica a correlação com exceções e a ausência de dados sensíveis no payload OTLP, sem enviar eventos de teste ao PostHog.
