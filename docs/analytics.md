# Análise de uso com PostHog

## Configuração

1. No projeto do PostHog, copie o **Project token** público (`phc_...`). Não use uma chave pessoal ou administrativa.
2. Configure `VITE_POSTHOG_KEY` e `VITE_POSTHOG_HOST` no ambiente que executa o build. O host é `https://us.i.posthog.com` para US ou `https://eu.i.posthog.com` para EU.
3. Execute `npm run build` e publique o build. Variáveis `VITE_*` são incorporadas ao JavaScript pelo Vite; alterar só o ambiente do servidor já compilado não muda a configuração.
4. Para validar com `npm run dev`, configure também `VITE_POSTHOG_ENABLE_DEV=true` e reinicie o servidor. Prefira um projeto de desenvolvimento separado.

Sem token, o SDK não é inicializado e nenhum evento é enviado. Desenvolvimento fica desligado por padrão. Rotas `/admin` e suas subrotas também registram diagnósticos operacionais e exceções. Não foi criada nenhuma chave, conta ou painel remoto por esta integração.

## Eventos

| Fluxo | Eventos e propriedades |
| --- | --- |
| Visitas | `$pageview` (`route`), incluindo troca de abas de login/cadastro via History API |
| Cadastro e login | `signup_submit`, `signup_success`, `login_success`, `logout` |
| Onboarding | `onboarding_start` (`resumed`), `step_view` e `step_complete` (`step`, `index`), `onboarding_back` (`step`), `plan_ready` (`items`, `rooms`), `onboarding_submit`, `onboarding_complete` |
| Retorno | `app_opened`, após identificar a conta em `/app`; deduplicado por sessão do SDK nesta aba, inclusive recargas. Foco/visibilidade detectam uma nova sessão com a página aberta |
| Navegação interna | `workspace_viewed` (`view`: `list`, `overview`, `plan`), só quando a tela está liberada pelo controle de assinatura |
| Organização | `workspace_created` (`template`), `environment_created`, `item_created` (`source`: `manual`, `link`, `spreadsheet`; `status`) |
| Compras e planejamento | `item_status_changed` (`status`), `item_purchase_recorded`, `purchase_scheduled`, `planning_updated` |
| Links e preços | `product_imported` (`has_price`), após extrair os dados do link; `price_history_viewed` |
| Colaboração | `invitation_sent`, `invitation_accepted` |
| Assistente | `nino_used` (`feature`: `assess_item`, `recommend`, `prioritize`), quando a API informa disponibilidade |
| Planilhas | `items_imported` (`count`, `failed`, `stopped`), `items_exported` (`format`, `count`) |
| Oferta de planos | `plans_viewed` (`source`: `subscription`, `limit`, `menu`; `reason`, quando disponível) |
| Checkout | `checkout_started` (`plan`), quando a API retorna o endereço; `checkout_failed` (`plan`), em resposta HTTP de erro; `checkout_canceled`, no retorno cancelado |
| Assinatura | `subscription_activated` (`plan`, `trial`), `subscription_canceled`, `billing_portal_opened` |

Eventos de ações da API são enviados após uma resposta bem-sucedida. Alterações de situação contam operações confirmadas, não compras únicas: marcar o mesmo item como comprado novamente gera outro evento. Para ativação de usuários, use **usuários únicos** no funil de `item_created`/`item_purchase_recorded`.

Os eventos DOM `casamia:onboarding` continuam funcionando. Os nomes legados `signup_submit` e `signup_success` desse contrato significam salvar o onboarding e são enviados ao PostHog como `onboarding_submit` e `onboarding_complete`. O cadastro real usa `signup_*` na API de registro. As visualizações iniciais do onboarding têm proteção contra repetição de efeitos do React StrictMode, e `onboarding_start` precede a primeira `step_view`.

## Identificação e privacidade

A resposta autenticada de bootstrap, login, cadastro ou aceite de convite identifica a pessoa pelo ID interno da conta, com `plan` e `is_guest`. Assim, eventos anônimos anteriores podem ser ligados à conta e retornos em outros aparelhos podem ser analisados. Logout, expiração de sessão e troca de conta reiniciam a identidade do navegador.

Os eventos de produto usam apenas propriedades explícitas de cada esquema e metadados de Web Analytics com rotas e campanhas conhecidas. Os diagnósticos operacionais `application.*` e as exceções preservam os dados reais, incluindo URLs, conteúdo de campos, entradas e respostas da API. Esses registros podem conter dados pessoais e credenciais presentes na operação.

O autocapture nativo do SDK, gravação de sessões, heatmaps, pesquisas e feature flags estão desligados. A aplicação registra cliques, alterações de campos e formulários por listeners próprios. Web Vitals captura métricas de desempenho, e Error Tracking captura exceções conforme as seções abaixo. A configuração desativa o uso de IP para geolocalização no PostHog; como em qualquer requisição de rede, o serviço ainda recebe a conexão do navegador. O SDK respeita Do Not Track. A página `/privacidade` permite desativar ou reativar a análise neste navegador quando a integração está configurada; a preferência é mantida pelo SDK.

## Web Analytics

### Páginas e saídas

`$pageview` e os eventos de produto recebem `$pathname`, `$host` e `$current_url` reconstruídos. Somente as rotas públicas de `PUBLIC_ROUTES` são permitidas; qualquer outra vira `/other`. Query strings, fragmentos, credenciais e títulos não são enviados. Hosts locais/IPs são representados como `localhost`. O SDK envia `$pageleave` no encerramento da página; a integração também registra a saída da rota anterior nas navegações via History API. O caminho da página anterior é sanitizado, preservando as informações numéricas de duração e rolagem. A recuperação de uma página do cache de voltar/avançar inicia uma nova visualização.

O autocapture continua desligado. A taxa de rejeição nativa deve ser interpretada com essa limitação, pois ela também usa eventos de autocapture em sua definição. Para avaliar intenção, prefira as metas e os cliques explícitos.

### Origem e campanhas

As propriedades `utm_source`, `utm_medium` e `utm_campaign` usam vocabulários controlados. Fontes reconhecidas incluem Instagram, Facebook, WhatsApp, Google, Bing, TikTok, YouTube, LinkedIn, newsletter, e-mail e parceiros. Referrers desses serviços são reduzidos ao domínio canônico; não guardamos o caminho, query ou fragmento de origem. Outros referrers viram `other`; navegação sem origem externa vira `$direct`.

Campanhas permitidas por padrão: `launch`, `bio`, `trial`, `enxoval` e `casa-nova`. Acrescente códigos em `VITE_POSTHOG_CAMPAIGNS` antes do build. Valores desconhecidos viram `other`, inclusive se parecem e-mails, nomes ou tokens. `utm_term`, `utm_content` e identificadores como `gclid`/`fbclid` são descartados. Os dados sanitizados da primeira entrada ficam em `sessionStorage` e acompanham as conversões na mesma sessão do SDK, inclusive após recarregar ou mudar de página. A desativação da análise apaga essa atribuição local.

Exemplo de link de divulgação:

```text
https://SEU-DOMINIO/?utm_source=instagram&utm_medium=social&utm_campaign=bio
```

### Metas e cliques

As metas usam eventos de sucesso reais, já implementados: `signup_success`, `onboarding_complete` e `subscription_activated`. O último confirma acesso a um plano, incluindo teste grátis; não representa receita ou cobrança confirmada. Bloqueadores e opt-out podem impedir a coleta do navegador. A fonte financeira continua sendo Stripe/backend.

No projeto PostHog 665798 foram criadas as ações reutilizáveis:

| Meta | Ação |
| --- | --- |
| Cadastro concluído | [395646](https://us.posthog.com/project/665798/data-management/actions/395646) |
| Onboarding concluído | [395647](https://us.posthog.com/project/665798/data-management/actions/395647) |
| Acesso ao plano ativado | [395648](https://us.posthog.com/project/665798/data-management/actions/395648) |

Em `/web`, clique em **Add conversion goal** e selecione uma dessas ações para ver a meta na visão nativa. A seleção ativa dessa tela não foi alterada pela integração: o MCP disponível não expõe essa preferência e não havia navegador conectado. As três ações e os gráficos salvos já estão configurados no servidor.

`landing_cta_clicked` recebe somente `action` e `position` de listas fixas. Cobre iniciar teste, entrar, abrir o app, ver preços, como funciona, Nino e lista de presentes; distingue cabeçalho, navegação, hero, preços, chamada final e rodapé. Não coleta texto do botão, elementos DOM ou href. O dashboard [Casa Mia — Visão do produto](https://us.posthog.com/project/665798/dashboard/2227629) inclui o funil landing → clique para iniciar teste → cadastro → onboarding, com janela de 7 dias, as metas por dia e cliques para iniciar teste por posição.

### Desempenho

`capture_performance` coleta LCP, INP, CLS e FCP via `$web_vitals`. A integração preserva valores numéricos e identificadores técnicos; remove entradas brutas, atribuição de elementos DOM e URLs de recursos. Métricas atrasadas conservam a rota sanitizada da página que as produziu. Web Vitals nao inclui gravacao de sessao, conteudo ou payloads de rede; os registros operacionais completos sao descritos abaixo. `VITE_POSTHOG_WEB_VITALS=false` desliga a captura. A disponibilidade de cada métrica depende do navegador, do carregamento e das interações reais; sem interação pode não haver INP. A medição usa a navegação inicial da página, sem ativar APIs experimentais de navegação SPA.

### Equipe e testes

Todos os novos eventos recebem `app_environment` (`production`, `development` ou `test`) e `traffic_type` (`external`, `internal` ou `test`). Desenvolvimento e hosts locais são internos automaticamente. Builds de QA podem usar `VITE_POSTHOG_TRAFFIC_TYPE=test`. Para marcar só o navegador da equipe em produção, execute uma vez no console do domínio:

```js
localStorage.setItem('casamia:analytics:traffic', 'internal');
```

Remova essa chave para voltar ao comportamento padrão. Não é necessário enviar nomes ou e-mails. O projeto exclui `traffic_type` interno/teste por padrão, preservando a exclusão por coorte que já existia. Os gráficos do dashboard também foram atualizados para respeitar o filtro. É uma separação para análise, não uma regra que descarta eventos na ingestão. Eventos históricos sem essa marcação não são reclassificados automaticamente.

Todas as opções `VITE_*` exigem novo build e publicação. A configuração remota de ações, filtros e gráficos já foi salva; a nova coleta só começa com a publicação do aplicativo. Os testes interceptam a telemetria e não criam visitas ou conversões artificiais no projeto real.

## Error Tracking

Com o token configurado, o navegador captura erros nao tratados, rejeicoes de promises, erros de renderizacao do React e falhas da API, incluindo 4xx e rotas administrativas. Cancelamentos AbortError geram registro operacional, sem excecao manual adicional. `VITE_POSTHOG_ERROR_TRACKING=false` desliga a captura de excecoes; opt-out e Do Not Track continuam valendo no navegador.

O servidor usa `posthog-node` com `POSTHOG_KEY` (alternativa `VITE_POSTHOG_KEY`) e `POSTHOG_HOST`. Em producao fica ativo com token; em desenvolvimento exige `POSTHOG_ENABLE_DEV=true`. `POSTHOG_ERROR_TRACKING=false` desliga excecoes do servidor. O middleware encaminha os erros recebidos, incluindo 4xx e administracao, com contexto e ID da requisicao. As respostas publicas da API permanecem iguais.

Excecoes preservam integralmente o payload produzido pelo SDK: mensagem, tipo, causas, mecanismo, frames, caminhos, source context e propriedades diagnosticas. Nao ha omissao ou mascaramento textual. Eventos operacionais `application.*` tambem preservam dados reais de navegacao, cliques, campos, formularios e chamadas da API. Os eventos de produto e Web Vitals continuam com seus schemas. Consulte [logs.md](logs.md) e [logging-coverage.md](logging-coverage.md) para detalhes e limites de entrega.

### Source maps no build

`npm run build` gera mapas ocultos do frontend e um mapa externo do bundle do servidor. O `postbuild` executa `scripts/posthog-sourcemaps.mjs`:

- Sem `POSTHOG_UPLOAD_SOURCEMAPS=true`, remove os mapas do diretório público e não faz upload.
- Com essa opção, exige `POSTHOG_CLI_PROJECT_ID` e `POSTHOG_CLI_API_KEY`, injeta os IDs nos bundles e envia os mapas e os bundles correspondentes ao PostHog. Use uma chave pessoal com os escopos `error tracking write` e `organization read`, somente no ambiente de build. `POSTHOG_CLI_HOST` usa o host de administração (`https://us.posthog.com`), não o host de ingestão.
- Uma falha no envio reprova o build. Os `.map` são removidos mesmo em caso de falha, para não serem publicados pelo Express. Publique os bundles resultantes dessa mesma execução, pois contêm os IDs usados pelo PostHog.

As variáveis `VITE_*` precisam estar configuradas antes do build. As variáveis do servidor são lidas em runtime. A integração não altera configurações remotas, cria chaves nem publica uma versão do aplicativo.

Referências: [captura de exceções](https://posthog.com/docs/error-tracking/capture), [Node/Express](https://posthog.com/docs/error-tracking/installation/node) e [source maps pela CLI](https://posthog.com/docs/error-tracking/upload-source-maps/cli).

`npm run test:error-tracking` cobre preservacao dos dados originais, middleware Express, erros esperados e administrativos e o payload do SDK Node real com transporte local. `npm run test:analytics` cobre o filtro do navegador e o desligamento da captura. `npm run test:analytics-browser` verifica o SDK JavaScript real, incluindo exceções e opt-out, interceptando as requisições sem enviar dados ao PostHog.

Para evitar duplicar a confirmação do mesmo checkout na aba, guardamos apenas localmente uma lista limitada de chaves de deduplicação no `sessionStorage`. O evento de conversao usa metadados limitados; o contexto operacional da chamada preserva o ID real do checkout. A deduplicação é uma conveniência do cliente, não um registro financeiro.

## Painéis sugeridos

- **Aquisição:** `$pageview` (rota `/`) → `signup_success` → `onboarding_start` → `onboarding_complete`.
- **Abandono:** funil de `step_view` por `step`, usando os nomes e a ordem das etapas exibidas em `/comecar`.
- **Ativação:** `onboarding_complete` → `subscription_activated` → `item_created` → `item_purchase_recorded`. Analise a janela de conversão conforme o ciclo de compra do enxoval.
- **Retenção:** usuários de `app_opened` que retornam semanalmente; complemente com retorno a `item_status_changed` para medir atualização da lista.
- **Recursos:** usuários únicos por `workspace_viewed`, `product_imported`, `price_history_viewed`, `invitation_sent` e `nino_used`.
- **Conversão:** `plans_viewed` → `checkout_started` → `subscription_activated`, segmentado por plano e `trial`. Um teste mensal ativado não é uma cobrança confirmada.

`subscription_activated` exige que `/api/billing/sync` confirme acesso em um plano pago; o parâmetro `assinatura=sucesso` sozinho não gera conversão. Esta instrumentação mede o retorno do usuário ao app, não cobre pagamentos cujo navegador nunca retorna, renovações nem conversão posterior de teste em cobrança. Para receita e conciliação, a fonte de verdade continua sendo Stripe/backend; seria necessária instrumentação adicional nos webhooks para cobrir esses casos.

## Validação

`npm run test:analytics` verifica esquemas, remoção de metadados sensíveis, eventos da API, confirmação de assinatura, inicialização condicional, navegação, identidade, sessões, deduplicação entre recargas, opt-out e tolerância a falhas do SDK/armazenamento. Usa um SDK substituto e não envia dados externos.

`npm run test:analytics-browser` inicia um Vite isolado e usa o SDK real em um navegador Playwright (Edge no Windows). Intercepta localmente todo o tráfego de análise e simula a API, sem precisar de banco ou token real. Confere os eventos enviados, a remoção de dados privados e a persistência do opt-out após recarregar a página.

Com as variáveis configuradas, faça um cadastro de teste, percorra o onboarding, abra um plano, adicione um item e marque-o como comprado. Confira os eventos no PostHog e valide que não contêm dados pessoais nem tokens. Essa verificação depende do token e do projeto reais.
