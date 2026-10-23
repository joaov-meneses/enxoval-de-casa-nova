# Análise de uso com PostHog

## Configuração

1. No projeto do PostHog, copie o **Project token** público (`phc_...`). Não use uma chave pessoal ou administrativa.
2. Configure `VITE_POSTHOG_KEY` e `VITE_POSTHOG_HOST` no ambiente que executa o build. O host é `https://us.i.posthog.com` para US ou `https://eu.i.posthog.com` para EU.
3. Execute `npm run build` e publique o build. Variáveis `VITE_*` são incorporadas ao JavaScript pelo Vite; alterar só o ambiente do servidor já compilado não muda a configuração.
4. Para validar com `npm run dev`, configure também `VITE_POSTHOG_ENABLE_DEV=true` e reinicie o servidor. Prefira um projeto de desenvolvimento separado.

Sem token, o SDK não é inicializado e nenhum evento é enviado. Com token, **nada é capturado antes do consentimento** (seção abaixo). Desenvolvimento fica desligado por padrão. Rotas `/admin` e suas subrotas também registram diagnósticos operacionais e exceções. Não foi criada nenhuma chave, conta ou painel remoto por esta integração.

## Consentimento (LGPD)

O aviso `src/components/ConsentBanner.tsx` aparece em todas as páginas (menos `/admin`) enquanto a pessoa não decide, sempre que o build tem PostHog ou Tag Manager configurado. **Recusar**, **Personalizar** e **Aceitar tudo** têm o mesmo peso visual. A escolha fica em `localStorage` (`casamia:consent`, com versão; mudar `CONSENT_VERSION` em `src/analytics/consent.ts` pede a escolha de novo) e pode ser revista pelo botão **Mudar preferências** em `/privacidade` ou pelo link **Preferências de privacidade** no rodapé da landing.

| Categoria | Cobre | Padrão |
| --- | --- | --- |
| Essenciais | Sessão, segurança, identificador do aparelho | Sempre ligados |
| Análise de uso | PostHog (eventos, identificadores, `$pageview`, exceções e diagnósticos do navegador) e GA4 (`analytics_storage`) | Desligado até aceitar |
| Anúncios | Google Ads (`ad_storage`, `ad_user_data`, `ad_personalization`), `gclid`/`fbclid` e conversões enviadas pelo servidor | Desligado até aceitar |

- **PostHog:** inicia com `opt_out_capturing_by_default`, `opt_out_persistence_by_default` e `persistence: 'memory'`: antes da escolha nada é enviado nem gravado no aparelho. Ao aceitar, liga a persistência (`localStorage+cookie`) e `opt_in_capturing()`; ao recusar, `opt_out_capturing()`. Como `posthog.reset()` (logout, sessão expirada) devolve o SDK ao opt-out padrão, o consentimento é reaplicado logo depois. `VITE_POSTHOG_COOKIELESS=on_reject` liga o modo sem cookies do PostHog para quem recusa (exige ativar o modo no projeto).
- **Google:** ver [GA4 e Tag Manager](#ga4-e-tag-manager).
- O atalho antigo `setAnalyticsOptOut` grava no mesmo consentimento (recusar análise também recusa anúncios).

## GA4 e Tag Manager

Configure `VITE_GTM_ID` (`GTM-XXXX`) antes do build; desenvolvimento só carrega com `VITE_GTM_ENABLE_DEV=true`. O dataLayer sobe com **Consent Mode v2** em `denied` (`ads_data_redaction` ligado) e o script `gtm.js` **só é baixado depois** que a pessoa aceita análise ou anúncios; cada mudança no aviso envia `consent update`.

O app envia ao dataLayer apenas (código em `src/analytics/google.ts`):

| Evento do app | Evento no dataLayer |
| --- | --- |
| `$pageview` (rota sem identificadores) | `page_view` com `page_path` e `page_location` |
| `signup_success` | `sign_up` (`method: email`) |
| `onboarding_start` / `onboarding_complete` | `tutorial_begin` / `tutorial_complete` |
| `workspace_created` | `enxoval_created` (conversão de qualidade) |
| `checkout_started` | `begin_checkout` |
| `subscription_activated` | `subscription_activated` |
| `invitation_accepted` | `join_group` |

No contêiner: crie a tag do GA4 com acionadores de **evento personalizado** para esses nomes, desligue "mudanças no histórico" nas medições aprimoradas (o `page_view` é manual), ligue a retenção de 14 meses e a regra de tráfego interno. `purchase` não sai do navegador: o servidor envia com o valor pago (abaixo).

### Conversão de compra pelo servidor

Com `GA4_MEASUREMENT_ID` e `GA4_API_SECRET` no servidor, o webhook da Stripe envia `purchase` (valor, moeda, `transaction_id` = sessão do checkout) pelo Measurement Protocol (`server/googleConversions.ts`), uma vez por sessão. Só sai para quem deu consentimento de anúncios no cadastro (`users.ad_consent_at`) e tem o `client_id` do GA4 guardado (`users.ga_client_id`). Nunca envia nome ou e-mail. Assinaturas com teste grátis (valor zero) não geram conversão no checkout.

## Primeiro toque (origem do cadastro)

`src/analytics/firstTouch.ts` roda em toda página (menos `/admin`) antes dos redirecionamentos:

- `cm_first_touch` (`localStorage`, 90 dias, nunca sobrescrito no prazo): UTMs (`source`, `medium`, `campaign`, `content`, `term` no formato combinado), domínio de origem e página de entrada (sem query nem fragmento). `cm_last_touch` guarda a última visita com campanha.
- `gclid`/`fbclid` ficam só no `sessionStorage` e só seguem para a conta com consentimento de anúncios.

O cadastro (`POST /api/auth/register`) e a conta criada por convite enviam o objeto opcional `acquisition`. O servidor valida de novo (`shared/acquisition.ts`: campos e formatos fechados), calcula o **grupo de canal** com uma regra única (`paid_search`, `paid_social`, `email`, `organic_search`, `organic_social`, `referral`, `direct`) e grava em `users.acq_*` (`acq_channel_group`, `acq_source`, `acq_medium`, `acq_campaign`, `acq_content`, `acq_term`, `acq_referrer_host`, `acq_landing_path`, `acq_first_seen_at`, e, com consentimento de anúncios, `acq_gclid`, `acq_fbclid`, `ga_client_id`). No `identify`, o PostHog recebe uma vez (`$set_once`) `initial_channel_group`, `initial_source`, `initial_medium` e `initial_campaign`.

Convenção de UTM para links da equipe: ver seção 5.1 de [analytics-funil-e-reengajamento.md](analytics-funil-e-reengajamento.md).

## Proxy próprio (`/ingest`)

O servidor repassa `/ingest/*` ao PostHog (`server/ingestProxy.ts`), com limite de 1 MB e de taxa, sem repassar o IP do visitante. Para usar: `VITE_POSTHOG_HOST=/ingest` e `VITE_POSTHOG_UI_HOST=https://us.posthog.com` no build; `POSTHOG_PROXY_HOST` (padrão `https://us.i.posthog.com`; use `https://eu.i.posthog.com` na região EU) no servidor. `POSTHOG_PROXY=off` desliga a rota. O servidor (`POSTHOG_HOST`) continua falando direto com o PostHog.

## E-mails de ciclo de vida

Motor em `server/lifecycle/` (regras puras em `policy.ts`, decisão e envio em `engine.ts`), rodando a cada 15 minutos (`server/workers/lifecycleWorker.ts`) ou sob demanda (`npm run lifecycle [-- --simulate]`). Quem decide é o Postgres; o PostHog só mede.

- **Modo:** `LIFECYCLE_MODE=off` (padrão), `simulate` (registra quem receberia, sem enviar; não bloqueia o envio real depois) ou `send`.
- **Consentimento próprio:** caixa desmarcada no cadastro ("Quero receber por e-mail lembretes da mudança e dicas…"), opção **E-mails do Casa Mia** no perfil para quem já tinha conta (`PATCH /api/profile/marketing`). Grava `marketing_consent_at`, `marketing_consent_source` (`cadastro`, `perfil`) e `marketing_consent_version`.
- **Fluxos:** L3 contagem regressiva da mudança (T-12, T-8, T-4, T-1 semanas, semana da mudança e T+1; recomeça se a data mudar), L2 primeiro valor (+1, +3 e +7 dias sem item comprado), L1 retomar o funil (+2 h, +1 dia e +4 dias sem enxoval) e L6 ausência (21, 45 e 90 dias sem acesso). Prioridade L3 > L2 > L1 > L6.
- **Limites:** 1 e-mail por dia e 2 por semana por pessoa, das 8h às 20h no fuso da conta (`users.timezone`), nunca o mesmo passo duas vezes (`lifecycle_messages`), supressão em `email_suppressions`, conta ativa e e-mail verificado.
- **Grupo de controle:** 10% das pessoas elegíveis de cada fluxo (hash estável da conta) ficam de fora (`status = 'holdout'`), para medir o efeito real.
- **Descadastro:** todo e-mail leva `List-Unsubscribe` + `List-Unsubscribe-Post` (um clique, `POST /api/preferences/unsubscribe`) e o link para `/preferencias` (sem login, por token): lembretes da mudança, dicas e novidades, pausar 30 dias, cancelar tudo. O "Cancelar" do rodapé pede confirmação na página, para verificadores de link não descadastrarem ninguém.
- **Remetente:** `MARKETING_MAIL_FROM` (subdomínio próprio recomendado); sem ele, usa `MAIL_FROM`.
- **Medição:** `lifecycle_email_sent` (`flow_key`, `step`, `template_version`, `locale`, `holdout`) vai ao PostHog pelo servidor, identificado só pelo UUID da conta. Os links levam `utm_source=newsletter&utm_medium=email&utm_campaign=lifecycle-<fluxo>&utm_content=<passo>`.

## Eventos

| Fluxo | Eventos e propriedades |
| --- | --- |
| Visitas | `$pageview` (`route`), incluindo troca de abas de login/cadastro via History API |
| Cadastro e login | `signup_submit`, `signup_success`, `login_success`, `logout` |
| Onboarding | `onboarding_start` (`resumed`), `step_view` e `step_complete` (`step`, `index`), `onboarding_back` (`step`), `plan_ready` (`items`, `rooms`), `onboarding_submit`, `onboarding_complete` |
| Retorno | `app_opened`, após identificar a conta em `/app` ou numa sub-rota do app; deduplicado por sessão do SDK nesta aba, inclusive recargas. Foco/visibilidade detectam uma nova sessão com a página aberta |
| Navegação interna | `workspace_viewed` (`view`: `list`, `overview`, `plan`), só quando a tela está liberada pelo controle de assinatura |
| Organização | `workspace_created` (`template`), `environment_created`, `item_created` (`source`: `manual`, `link`, `spreadsheet`; `status`) |
| Compras e planejamento | `item_status_changed` (`status`), `item_purchase_recorded`, `purchase_scheduled`, `planning_updated` |
| Links e preços | `product_imported` (`has_price`), após extrair os dados do link; `price_history_viewed` |
| Colaboração | `invitation_sent`, `invitation_accepted` |
| Assistente | `nino_used` (`feature`: `assess_item`, `recommend`, `prioritize`), quando a API informa disponibilidade |
| Planilhas | `items_imported` (`count`, `failed`, `stopped`, `catalog_applied`: sugestões do catálogo aceitas), `items_exported` (`format`, `count`) |
| Oferta de planos | `plans_viewed` (`source`: `subscription`, `limit`, `menu`; `reason`, quando disponível) |
| Checkout | `checkout_started` (`plan`), quando a API retorna o endereço; `checkout_failed` (`plan`), em resposta HTTP de erro; `checkout_canceled`, no retorno cancelado |
| Assinatura | `subscription_activated` (`plan`, `trial`), `subscription_canceled`, `billing_portal_opened` |

Eventos de ações da API são enviados após uma resposta bem-sucedida. Alterações de situação contam operações confirmadas, não compras únicas: marcar o mesmo item como comprado novamente gera outro evento. Para ativação de usuários, use **usuários únicos** no funil de `item_created`/`item_purchase_recorded`.

Os eventos DOM `casamia:onboarding` continuam funcionando. Os nomes legados `signup_submit` e `signup_success` desse contrato significam salvar o onboarding e são enviados ao PostHog como `onboarding_submit` e `onboarding_complete`. O cadastro real usa `signup_*` na API de registro. As visualizações iniciais do onboarding têm proteção contra repetição de efeitos do React StrictMode, e `onboarding_start` precede a primeira `step_view`.

## Identificação e privacidade

Com consentimento de análise, a resposta autenticada de bootstrap, login, cadastro ou aceite de convite identifica a pessoa pelo ID interno da conta, com `plan` e `is_guest`. Assim, eventos anônimos anteriores podem ser ligados à conta e retornos em outros aparelhos podem ser analisados. Logout, expiração de sessão e troca de conta reiniciam a identidade do navegador.

Os eventos de produto usam apenas propriedades explícitas de cada esquema e metadados de Web Analytics com rotas e campanhas conhecidas. Os diagnósticos operacionais `application.*` e as exceções preservam os dados reais, incluindo URLs, conteúdo de campos, entradas e respostas da API. Esses registros podem conter dados pessoais e credenciais presentes na operação.

O autocapture nativo do SDK, gravação de sessões, heatmaps, pesquisas e feature flags estão desligados. A aplicação registra cliques, alterações de campos e formulários por listeners próprios. Web Vitals captura métricas de desempenho, e Error Tracking captura exceções conforme as seções abaixo. A configuração desativa o uso de IP para geolocalização no PostHog; como em qualquer requisição de rede, o serviço ainda recebe a conexão do navegador. O SDK respeita Do Not Track. A página `/privacidade` permite desativar ou reativar a análise neste navegador quando a integração está configurada; a preferência é mantida pelo SDK.

## Web Analytics

### Páginas e saídas

`$pageview` e os eventos de produto recebem `$pathname`, `$host` e `$current_url` reconstruídos. Somente as rotas públicas de `PUBLIC_ROUTES` e as sub-rotas do app são permitidas; qualquer outra vira `/other`. As sub-rotas chegam como modelo, sem identificador: `/app` (todos os ambientes), `/app/itens/:ambiente` (um ambiente), `/app/meu-lar` (visão geral) e `/app/plano` (planejamento); caminho desconhecido dentro do app vira `/app`. Query strings, fragmentos, credenciais e títulos não são enviados. Hosts locais/IPs são representados como `localhost`. O SDK envia `$pageleave` no encerramento da página; a integração também registra a saída da rota anterior nas navegações via History API. O caminho da página anterior é sanitizado, preservando as informações numéricas de duração e rolagem. A recuperação de uma página do cache de voltar/avançar inicia uma nova visualização.

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

`npm run test:lifecycle` cobre a origem do cadastro, o grupo de canal, as regras do motor de ciclo de vida, os e-mails, o proxy e a conversão de compra. `npm run test:growth-db` (PostgreSQL real) cobre cadastro com origem e consentimentos, envio, grupo de controle, não repetição, preferências, descadastro com um clique e a opção do perfil.

`npm run test:analytics` verifica consentimento antes da captura, Tag Manager com Consent Mode, `$set_once` do primeiro toque, esquemas, remoção de metadados sensíveis, eventos da API, confirmação de assinatura, inicialização condicional, navegação, identidade, sessões, deduplicação entre recargas, opt-out e tolerância a falhas do SDK/armazenamento. Usa um SDK substituto e não envia dados externos.

`npm run test:analytics-browser` inicia um Vite isolado e usa o SDK real em um navegador Playwright (Edge no Windows). Intercepta localmente todo o tráfego de análise e simula a API, sem precisar de banco ou token real. Confere que nada é enviado nem gravado antes do aviso de consentimento, os eventos enviados depois do aceite, a remoção de dados privados e a persistência da recusa após recarregar a página. Se o `.env` local tiver `VITE_POSTHOG_TRAFFIC_TYPE=test`, rode com `VITE_POSTHOG_TRAFFIC_TYPE=internal`.

Com as variáveis configuradas, faça um cadastro de teste, percorra o onboarding, abra um plano, adicione um item e marque-o como comprado. Confira os eventos no PostHog e valide que não contêm dados pessoais nem tokens. Essa verificação depende do token e do projeto reais.
