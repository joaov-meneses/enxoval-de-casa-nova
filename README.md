# Casa Mia

> Sua casa, item por item. Seu lar começa com um plano.

O Casa Mia ajuda quem está montando a casa nova a planejar o enxoval por ambiente, acompanhar o que já foi conquistado, controlar o orçamento e dividir a lista com quem vai morar junto. É um aplicativo React + Express com persistência em PostgreSQL.

A estratégia de marca, o tom de voz, a paleta e o modelo de negócio estão em [docs/branding-casa-mia.md](docs/branding-casa-mia.md). O roteiro do que ainda falta construir está em [docs/implementacoes-futuras.md](docs/implementacoes-futuras.md).

## Sumário

- [Rotas](#rotas)
- [Executar localmente](#executar-localmente)
- [Compartilhamento: convidados e donos](#compartilhamento-convidados-e-donos)
- [Esqueci minha senha](#esqueci-minha-senha-link-por-e-mail)
- [Administração de usuários](#administração-de-usuários)
- [Importar por link e acompanhar preços](#importar-por-link-e-acompanhar-preços)
- [Experiência do produto](#experiência-do-produto)
- [Identidade visual](#identidade-visual)
- [Validação](#validação)
- [Build e execução em produção](#build-e-execução-em-produção)
- [Escopo comercial desta versão](#escopo-comercial-desta-versão)

## Rotas

| Rota | O que é |
|---|---|
| `/` | Landing page com recursos, planos e perguntas frequentes |
| `/login` e `/cadastro` | A mesma tela, com as abas "Entrar" e "Criar conta" (`/cadastro` abre na segunda). `/login?cadastro=1` vai para `/cadastro` e `/signup` vai para `/comecar` |
| `/comecar` | Funil pós-cadastro: exige conta e nenhum enxoval ainda. Pergunta o nome e algumas perguntas curtas, monta o plano e cria o primeiro enxoval já com ele. Detalhes em [docs/onboarding-funil.md](docs/onboarding-funil.md) |
| `/app` | Aplicativo conectado à conta |
| `/convite#token=…` | Aceite de convite para participar de um enxoval |
| `/esqueci-senha` e `/redefinir-senha` | Recuperação de senha por e-mail |
| `/privacidade` | Política de privacidade |
| `/admin` | Gestão de usuários (acesso administrativo separado das contas de clientes) |

O produto exige conta e servidor completo, com PostgreSQL: não existe modo de demonstração nem prévia sem banco.

## Executar localmente

Pré-requisitos: Node.js e Docker.

1. Copie `.env.example` para `.env` e troque `POSTGRES_PASSWORD` (a mesma senha vai em `DATABASE_URL`).
2. Suba o PostgreSQL: `npm run db:up`. Para localhost sem HTTPS, use `COOKIE_SECURE=false`.
3. Instale as dependências com `npm install` e rode `npm run dev`. O servidor aplica as migrações existentes antes de iniciar e responde em `http://localhost:3000`.

### PostgreSQL com Docker

[docker-compose.yml](docker-compose.yml) define o serviço `db` (`postgres:16-alpine`, container `casamia_db`), acessível só em `127.0.0.1` na porta **5433**, para não conflitar com outros Postgres locais na 5432. Os dados ficam no volume `casamia_casamia_pgdata`.

| Comando | O que faz |
|---|---|
| `npm run db:up` | Sobe o banco e espera ficar saudável |
| `npm run db:migrate` | Aplica as migrações manualmente (o `npm run dev` já faz isso) |
| `npm run db:psql` | Abre o `psql` no container (aceita argumentos: `npm run db:psql -- -c "\dt"`) |
| `npm run db:logs` | Acompanha os logs |
| `npm run db:down` | Para e remove o container, mantendo os dados |
| `docker compose down -v` | Para e **apaga os dados** do volume |

### Variáveis de ambiente

Todas estão documentadas em [.env.example](.env.example). As principais:

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão do banco usada pela API |
| `PORT` | Porta do servidor (padrão 3000) |
| `COOKIE_SECURE` | Cookies seguros; em produção ficam ligados por padrão |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | Habilitam o `/admin` (senha com 12 caracteres ou mais) |
| `APP_URL` | Endereço público do app, usado nos links dos e-mails |
| `RESEND_API_KEY` / `MAIL_FROM` | Envio de e-mails (convites e recuperação de senha) pelo [Resend](https://resend.com) |

## Compartilhamento: convidados e donos

Compartilhar um enxoval é feito por convite: o dono informa o e-mail, a pessoa recebe a mensagem (Resend) e só entra no enxoval ao aceitar pelo link.

- **Quem convida:** só o dono convida, cancela convites pendentes e remove participantes (`POST/GET/DELETE /api/enxovais/:id/invitations` e `DELETE /api/enxovais/:id/members/:userId`). O convite vale por 7 dias; reenviar para o mesmo e-mail troca o link anterior.
- **Aceite:** `/convite#token=…` (o token fica no fragmento da URL e só o hash vai para o banco). Quem não tem conta define nome e senha e nasce como **conta de convidado** (`users.is_guest`). Quem já tem conta entra nela e aceita, sem perder nem misturar o enxoval próprio.
- **Permissões do convidado:** edita itens e ambientes do enxoval compartilhado como o dono (os dados são ligados a `enxoval_id`, então todos veem as mesmas alterações). Não cria enxovais, não convida, não remove ninguém e não renomeia nem exclui o enxoval.
- **Remover um participante (dono):** no diálogo "Convidar pessoa", em "Quem participa", cada convidado tem o botão "Remover", com confirmação em dois toques. Dá para remover um ou vários, um de cada vez. Vale no desktop e no mobile (menu do enxoval → "Convidar pessoas").
- **Sair do enxoval (convidado):** o botão "Sair do enxoval" fica no cabeçalho do desktop e no menu do enxoval no mobile, com confirmação. Usa o mesmo `DELETE /api/enxovais/:id/members/:userId`, que aceita o próprio convidado removendo a si mesmo. O dono não pode sair; para encerrar o enxoval, ele o exclui.
- **O que acontece depois:** tanto remover quanto sair tira a linha de `enxoval_members`. Se o convidado ainda participa de outro enxoval, o app abre esse outro. Uma conta de convidado sem nenhum outro enxoval vê a tela "sem acesso". Quando o dono remove a pessoa, as sessões dela caem na hora; quando ela mesma sai, a sessão continua. Quem tem enxoval próprio segue com o dele normalmente.
- **Troca de enxoval:** o seletor (barra lateral no desktop, menu no mobile) separa "Meus enxovais" de "Compartilhados comigo". O último aberto é lembrado no aparelho.
- **Sem cobrança ainda:** como não há assinatura implementada, "conta avulsa" hoje significa ter enxoval próprio. Quando o pagamento existir, basta promover `is_guest` para `false` na compra.

## Esqueci minha senha (link por e-mail)

Na tela de login, **Esqueci minha senha** leva a `/esqueci-senha`. A pessoa informa o e-mail e recebe um link para `/redefinir-senha`, onde cria uma nova senha (8 a 128 caracteres).

- **Segurança:** o link vale 1 hora e serve uma única vez. Só o hash do token fica no banco (`password_reset_tokens`), e o token vai no fragmento da URL (`#token=…`), que o navegador não envia ao servidor nem a outros sites e que é apagado da barra de endereço ao abrir a página. Um novo pedido invalida o link anterior, e um intervalo mínimo de 1 minuto por conta evita enxurrada de e-mails. A resposta do pedido é sempre a mesma, exista ou não conta com aquele e-mail, e contas inativas não recebem link. Ao redefinir, todas as sessões da conta são encerradas e a pessoa recebe um e-mail de aviso. Um reset feito pelo administrador também invalida links pendentes.
- **Envio:** pelo Resend, via API HTTP, com `RESEND_API_KEY` e `MAIL_FROM` no servidor. Sem essas variáveis, em desenvolvimento o e-mail aparece no console do servidor; em produção nada é enviado e o log traz um aviso (o link é um segredo e não vai para os logs). O remetente de teste `onboarding@resend.dev` só entrega para o e-mail dono da conta Resend; para enviar a qualquer pessoa, verifique um domínio no Resend e use um remetente desse domínio.
- **`APP_URL`:** endereço público do app (por exemplo, `https://casamia.up.railway.app`), usado para montar o link. É obrigatório em produção e nunca é lido do cabeçalho `Host`, para ninguém conseguir fazer o servidor enviar um link para outro domínio.
- **Railway:** configure `APP_URL`, `RESEND_API_KEY` e `MAIL_FROM` como variáveis do serviço. A chave nunca deve ser commitada.

## Administração de usuários

Configure no `.env` local e nas variáveis do serviço que hospeda o backend:

```dotenv
ADMIN_LOGIN="seu-login-de-gestao"
ADMIN_PASSWORD="sua-senha-administrativa-com-12-ou-mais-caracteres"
```

Reinicie o servidor depois de alterar. As credenciais ficam só no backend; não use prefixo `VITE_`. Sem os dois valores, ou com senha menor que 12 caracteres, o acesso administrativo fica desabilitado. A identidade administrativa é separada das contas de clientes, não cria enxoval e não aparece na listagem de usuários. Alterar as credenciais invalida as sessões administrativas anteriores.

- **Gestão:** abra `/admin` ou use **Acesso administrativo** no login. Dá para buscar por nome ou e-mail, filtrar ativos, inativos e troca de senha pendente, ver cadastro, último acesso e quantidade de enxovais, e desativar ou reativar contas. "Inativo" significa conta desativada pelo administrador.
- **Recuperar um acesso:** encontre a conta ativa, clique em **Redefinir senha** e confirme. Copie a senha temporária exibida e envie diretamente à pessoa: ela aparece só nessa resposta, não é guardada em texto puro nem enviada por e-mail. Se fechar a janela sem copiar, gere outra. A senha vale 24 horas, e gerar outra invalida a anterior. O reset substitui o hash, marca `must_change_password` e encerra todas as sessões da pessoa.
- **Primeiro acesso com a senha temporária:** a pessoa vê a tela de nova senha e confirmação (8 a 128 caracteres). Enquanto a troca estiver pendente, a API bloqueia as operações e não devolve os dados do enxoval. Ao concluir, a flag e a expiração são removidas, as sessões temporárias são revogadas e uma nova sessão é criada.
- **Desativar uma conta:** bloqueia o login e revoga as sessões, preservando listas e itens. Reativar não recupera sessões antigas, e contas inativas precisam ser reativadas antes de gerar senha temporária.
- **Sessão do admin:** cookie HTTP-only (`casamia_admin_session`) com duração de 8 horas e token guardado como hash. As rotas que alteram dados exigem JSON e rejeitam origens externas. Os logins têm limite de tentativas por IP em cada processo (10 para admin e 15 para clientes a cada 15 minutos).

## Importar por link e acompanhar preços

No modal de novo item, "Importar por link" lê o endereço de um produto de loja (`POST /api/products/extract`) e preenche nome, foto, preço (normal e no Pix), voltagem e ambiente sugerido. O preço do dia vira o preço de referência do item; depois a rotina de preços guarda o histórico e a linha do item mostra quanto ficou mais barato ou mais caro, o selo "Menor preço em 60 dias" e o histórico em gráfico. A visão geral ganha o "Termômetro de economia".

- **Leitor (`server/services/productScraper.ts`):** lê a página em camadas e para na primeira que funcionar: (1) API do Mercado Livre (`MERCADOLIVRE_CLIENT_ID` e `MERCADOLIVRE_CLIENT_SECRET`); (2) leitura direta imitando o Chrome (`impit`: TLS, HTTP/2 e cabeçalhos de navegador, sem JavaScript), que resolve lojas que barram o cliente HTTP do Node, como a Amazon; (3) desbloqueador pago opcional (`SCRAPER_API_KEY`, ZenRows ou ScraperAPI: navegador real e proxy residencial), chamado só quando a camada 2 foi barrada ou voltou sem preço, com teto diário (`SCRAPER_API_DAILY_LIMIT`); (4) o nome tirado do próprio link (resultado `partial`: o formulário preenche só o nome e pede o preço). Do HTML, os dados saem de JSON-LD (schema.org), OpenGraph e heurísticas. Só acessa endereços públicos (bloqueia localhost, redes privadas e link-local, a cada redirecionamento). **Sem `SCRAPER_API_KEY`, Magalu, Casas Bahia, Leroy, Shopee e o Mercado Livre não são lidos** (desafios de Akamai/Cloudflare e página-casca): para eles a chave do desbloqueador é necessária. Os logs `[scraper] loja camada=resultado` mostram onde cada leitura parou.
- **Catálogo compartilhado (`server/catalog.ts`):** a manutenção (`server/workers/catalogMaintenanceWorker.ts`) roda sozinha uma vez por dia em produção (a primeira, 5 minutos após a subida; `CATALOG_MAINTENANCE=off` desliga, `=on` liga em desenvolvimento): liga itens ao catálogo e recalcula as faixas de preço. `CATALOG_PRECOMPUTE_URGENCY=on` inclui o pré-cálculo de urgência com o Jev, que só gasta com itens ainda sem nota. Para rodar uma vez: `npm run catalog:maintain` (`-- --urgency` inclui o pré-cálculo). Itens novos aguardam aprovação em **Catálogo de itens** no `/admin`.
- **Rotina (`server/workers/priceTrackerWorker.ts`):** a cada 12 horas relê os produtos que ainda estão em itens a comprar, com pausa de 2 a 4 segundos entre lojas, grava um ponto no histórico quando o preço muda (ou passa 1 dia) e envia um e-mail por pessoa quando um item chega ao preço-alvo ou ao menor preço do histórico. Liga sozinha em produção; em desenvolvimento use `PRICE_TRACKER=on`. Para rodar uma vez: `npm run track-prices` (`-- --force` relê tudo).
- **API:** `GET /api/items/:id/price-history`, `GET /api/enxovais/:id/savings-summary`; `POST` e `PATCH /api/items` aceitam `trackedProductUrl`, `initialPriceCents`, `targetPriceCents`, `selectedVariation`, `imageUrl`, `priceBasis` e `priceAlertEnabled`.

## Experiência do produto

**Organização**
- Itens agrupados por ambiente, com visão geral de progresso, total investido, descontos e cashback e estimativa dos itens pendentes.
- Cada item tem uma situação, filtrável na lista: **Preciso comprar** (padrão), **Pesquisando**, **Comprei**, **Ganhei**, **Já tenho**, **Não preciso** e **Descartei**. Comprei, Ganhei e Já tenho contam como conquistados; Não preciso e Descartei saem do progresso e dos totais. Só **Comprei** entra em "Já investimos". O valor cheio dos itens **Ganhei** soma-se aos descontos no cartão "Descontos e cashback" e nunca entra em "Já investimos". As situações ficam em `items.status`; `checked` segue gravado, derivado da situação.
- **Quantidade** de 1 a 999 (padrão 1, com botões − e +). É só informativa: não multiplica o preço nem altera resumos ou descontos.
- **Desconto ou cashback** por item, no cadastro, na edição ou no diálogo "Descontos e cashback". O valor é abatido do preço e o servidor valida que não passe do preço do item. O desconto geral antigo do enxoval (`enxovais.discount_cents`) continua somando no resumo até ser removido no diálogo.
- Busca sem distinção de acentos, filtros e ordenação por nome, alterações recentes ou "Minha ordem". Nesta última, sem busca nem filtros, as alças reordenam os itens do ambiente; ambientes também podem ser arrastados. As alças aceitam as setas do teclado e a ordem é persistida.
- Lápis junto aos nomes para renomear o enxoval e os ambientes. A data de adição vem de `created_at` e permanece após editar.
- Importação de itens por CSV ou XLSX, com modelos em `public/modelos/casamia-modelo-importacao.*` (gerados por `scripts/generate-import-templates.ts`), e exportação CSV do enxoval completo ou de um ambiente, em português, UTF-8 e separador `;`, com proteção contra células interpretadas como fórmulas. A exportação por ambiente inclui todos os itens, independentemente dos filtros ativos.

**Telas e dispositivos**
- Landing page, login e cadastro adaptados para celular, tablet e computador.
- **Desktop:** menu lateral com enxovais e ambientes, cabeçalho com convites, descontos e saída, painel financeiro e ações de edição e exportação.
- **Celular:** ambientes horizontais, gesto de deslizar entre ambientes, puxar para atualizar, cabeçalho compacto ao rolar, botão de adição e navegação inferior. O ícone de menu (área de toque de 44 px) abre um painel pela direita com troca e criação de enxovais, convites, lista de ambientes e, para o convidado, a opção de sair. Renomear e excluir o enxoval aparecem só para o dono.

**Acessibilidade**
- Diálogos com foco controlado, Escape para fechar e retorno ao botão de origem. As confirmações de exclusão começam com foco em "Cancelar".
- Dropdowns próprios com navegação por teclado, seleção por toque e Escape para fechar as opções antes do diálogo.
- Respeito à preferência de movimento reduzido.

## Identidade visual

O Casa Mia ("minha casa", em italiano) tem como mascote o **Nino**, uma casinha-chaveiro prestativa. O manual completo, com posicionamento, voz e microcopy, está em [docs/branding-casa-mia.md](docs/branding-casa-mia.md).

| Papel | Cor | Hex |
|---|---|---|
| Fundo | Creme Acolhedor | `#FBF3E6` |
| Texto e títulos | Café Tostado | `#3B2A20` |
| Primária | Terracota Artesanal | `#C2603F` |
| Apoio e sucesso | Oliva Natural | `#5C6643` |
| Acento | Azulejo Noturno | `#244B66` |

Tipografia: **Fraunces** nos títulos e na assinatura, **Nunito** na interface (Google Fonts, com fontes locais de fallback). Os tokens de cor ficam em `src/index.css`.

| Arquivo | O que é |
|---|---|
| `src/components/Brand.tsx` | Logo da interface: o Nino acenando ao lado de "Casa Mia" |
| `src/components/Nino.tsx` | Mascote Nino com a arte final, em duas poses: acenando (`wave`) e com prancheta e trena (`think`) |
| `public/brand/nino.{png,webp}` | Arte-base do Nino acenando, com fundo transparente. É a fonte do logo e dos ícones |
| `public/brand/nino-plan.{png,webp}` | Nino com a prancheta e a trena (seção "Conheça o Nino") |
| `public/brand/nino-logo.{png,webp}` | Versão leve do Nino acenando (224 px), usada no cabeçalho e no funil |
| `public/favicon.ico`, `favicon-*.png`, `apple-touch-icon.png`, `icon-maskable-512x512.png` | Ícones derivados do Nino |
| `public/site.webmanifest` | Manifesto do app instalável |
| `public/images/casamia-home.webp` | Fotografia da landing, do login e da imagem de compartilhamento |
| `scripts/generate-brand-assets.ts` | Gera o logo leve, os favicons e os ícones a partir de `public/brand/nino.png` (`npx tsx scripts/generate-brand-assets.ts`) |
| `src/product.css`, `src/landing.css`, `src/onboarding.css` | Estilos do aplicativo, da landing e do funil |

O produto não depende de URLs externas de imagens.

## Validação

```sh
npm run lint
npm run build
npm run test:e2e
npm run test:admin-api
npm run test:onboarding-db
npm run test:item-status-db
npm run test:password-reset-db
npm run test:invitations-db
npm run test:product-scraper
npm run test:price-tracking-db
```

- **`test:e2e` (Playwright):** verifica as páginas públicas (landing, login e funil `/comecar`) em várias larguras, os formulários de autenticação com API simulada, o funil de onboarding, o painel administrativo e a acessibilidade com axe. Os testes do aplicativo logado (itens, ambientes, importação e exportação) dependiam do antigo modo de demonstração, foram removidos e precisam ser reescritos. No Windows usa o Microsoft Edge instalado; em outros sistemas, rode `npx playwright install chromium`. Os testes iniciam `npm run dev` (que precisa do PostgreSQL, via `npm run db:up`) ou reaproveitam um servidor já ativo na porta 3000.
- **Testes `*-db` e `test:admin-api`:** rodam contra o PostgreSQL real, cada um em um schema descartável, com contas fictícias e e-mail em memória (`MAIL_DRIVER=memory`), sem tocar nos dados existentes. O usuário do banco precisa de permissão para criar schemas.
  - `test:admin-api`: permissões, reset de senha, troca obrigatória, expiração, revogação de sessões e status das contas.
  - `test:onboarding-db`: cadastro e criação do primeiro enxoval com o plano do funil.
  - `test:item-status-db`: situação dos itens, desconto, quantidade e migração do campo antigo `checked`.
  - `test:password-reset-db`: fluxo completo de recuperação de senha.
  - `test:product-scraper`: leitor de produtos com HTML de exemplo (sem internet): preços, JSON-LD, OpenGraph, Pix, voltagem, Mercado Livre e proteção contra endereços internos.
  - `test:price-tracking-db`: itens ligados a links, histórico, rotina de preços com e-mails, resumo de economia e permissões.
  - `test:invitations-db`: convites, aceite, permissões do convidado, remoção pelo dono, saída do convidado, reenvio, expiração e falha do provedor de e-mail.
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) roda lint, build e os testes de banco com um PostgreSQL de serviço.

## Build e execução em produção

```sh
npm run build
npm start
```

`npm start` serve o build de produção e a API. Configure a conexão do banco e cookies HTTPS para esse ambiente. Nada é publicado automaticamente.

## Escopo comercial desta versão

Os planos e preços da landing page são **ilustrativos**. Não existem cobrança, checkout, assinatura nem limites de plano aplicados. A recuperação de senha pode ser feita pela própria pessoa, por e-mail, ou assistida pelo administrador. Confirmação de e-mail no cadastro, pagamentos, o motor de IA e a página pública de Chá de Casa Nova ainda não estão implementados: o plano para isso está em [docs/implementacoes-futuras.md](docs/implementacoes-futuras.md).
