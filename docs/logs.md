# Logs completos da aplicacao

O backend usa Pino e pino-http. Toda requisicao que chega ao Express gera inicio e conclusao, falha ou interrupcao, inclusive autenticacao, administracao, webhook, arquivos e rotas inexistentes. O middleware vem antes dos parsers e o registro final registra novamente a requisicao depois do processamento.

## Dados registrados

O registro preserva os dados reais: URL com query, parametros, corpo recebido, headers, IP, conta quando identificada, status, headers e corpo de resposta da API, duracao e contexto personalizado. Binarios da API sao representados integralmente em base64, com tamanho. Corpos de arquivos estaticos nao sao duplicados nos logs. O `reqId` gerado pelo servidor aparece no header `X-Request-Id`, nos logs e no `request_id` das excecoes e das chamadas do navegador.

Erros preservam tipo, mensagem, stack, causas, erros agregados e propriedades adicionais. Nao ha substituicao de mensagens, lista de campos permitidos ou mascaramento de senhas/tokens nos registros de diagnostico. Erros do parser preservam o diagnostico original; a resposta publica continua com a mensagem existente.

Tambem ha registros estruturados de e-mails (conteudo, destinatario, resultado e falha do provedor), cache, chamadas e respostas do Jev, scraping e fallbacks, transacoes, precos por produto, alertas, catalogo, notificacoes do trial, retencao de IPs e encerramento. Os scripts de migracao, catalogo e precos usam o mesmo logger e esvaziam o envio ao terminar.

## PostHog Logs

Com `POSTHOG_KEY` ou `VITE_POSTHOG_KEY` contendo `phc_...`, o backend envia OTLP HTTP para `/i/v1/logs`. O corpo de cada registro e o JSON completo indentado. Atributos indexaveis incluem `event.name`, `request.id`, `user.id`, metodo, rota, status, duracao, `exception.message` e `exception.stacktrace`.

Todos os eventos emitidos pelo logger sao encaminhados: sucessos, avisos, erros e nomes novos. Nao existe amostragem por sucesso nem teto por minuto na aplicacao. `POSTHOG_LOGS_MAX_PER_MINUTE` nao e mais utilizado. O nivel do Pino continua determinando o que e emitido.

| Variavel | Padrao | Uso |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | Nivel minimo do logger; `debug` e `trace` habilitam esses niveis quando usados |
| `LOG_FORMAT` | Automatico | `pretty` em desenvolvimento; `json` em producao |
| `LOG_SLOW_REQUEST_MS` | `1000` | Marca requisicoes lentas com `warn` |
| `POSTHOG_LOGS` | Ativo com token em producao | `false` desativa o envio remoto |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | Host de ingestao; alternativa `VITE_POSTHOG_HOST` |
| `POSTHOG_ENABLE_DEV` | `false` | `true` habilita telemetria do servidor em desenvolvimento |

Consulte [PostHog Logs](https://us.posthog.com/project/665798/logs). Para achar uma acao, filtre por `request.id`, `user.id` ou `event.name` e abra o corpo JSON. Erros tambem aparecem no Error Tracking com mensagem e stack originais.

## Navegador

Eventos `application.navigation`, `application.ui.action` e `application.api.started/completed/failed` aparecem nos eventos do PostHog. Incluem URL real, cliques, alteracoes de campos, envios de formularios e chamadas da API com entrada, resultado, status, duracao e ID de requisicao. As rotas administrativas tambem sao cobertas. Os eventos de produto e Web Vitals mantem seus schemas; os dados completos ficam nos eventos operacionais e excecoes.

`VITE_POSTHOG_KEY` configura o projeto e `VITE_POSTHOG_ENABLE_DEV=true` habilita desenvolvimento. O opt-out e Do Not Track continuam sendo respeitados no navegador. Logs do servidor sao independentes dessa preferencia.

## Cobertura e entrega

[Inventario de rotas e acoes](logging-coverage.md) documenta a cobertura central. Cobertura de instrumentacao nao e garantia de entrega de 100% dos eventos: bloqueadores, opt-out, falta de token, `LOG_LEVEL`, indisponibilidade de rede, limites de ingestao/tamanho e encerramento abrupto podem impedir envio. A fila OTLP e em memoria (512 registros, lotes de 50 a cada 5 segundos), sem persistencia para reenvio. O stdout continua sendo a copia local do backend. Dados omitidos de eventos antigos nao podem ser recuperados por esta alteracao.

## Validacao

- `npm run test:logging`: HTTP real, entrada e resposta completas, erros, causas, parser, correlacao, lentidao e interrupcao.
- `npm run test:posthog-logs`: formato, todos os eventos/sucessos, transporte OTLP local e falhas do exportador.
- `npm run test:error-tracking`: payload real do SDK Node e preservacao de mensagem/contexto.
- `npm run test:analytics` e `npm run test:analytics-browser`: SDK do navegador, excecoes, acoes, dados reais de API e opt-out.

Simulacao Postman local, sem enviar dados ao projeto real:

```powershell
postman simulation run postman/simulations/observability.sim.yaml --port 4900 --output ndjson --no-history
# Em outro terminal:
node --import tsx tests/observability-simulation.mjs
```

O mock foi criado localmente a partir de `postman/contracts/telemetry.openapi.yaml`, um contrato minimo do envelope OTLP usado pelo exportador instalado. O teste executa Express, Pino e o exportador reais; o mock substitui apenas o coletor remoto. Nao verifica o painel nem os limites do PostHog em producao.
