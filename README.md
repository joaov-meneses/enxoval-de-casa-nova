# Larume

Seu lar começa com um plano. Aplicativo React + Express para planejar um enxoval por ambiente, organizar compras e compartilhar listas, com persistência em PostgreSQL.

## Visualizar localmente, sem banco

```sh
npm install
npm run dev:preview
```

Abra **http://localhost:3000**.

- `/`: landing page com recursos, exemplos de planos e perguntas frequentes.
- `/login`: entrada com a nova identidade visual. `/signup` redireciona para `/comecar`.
- `/comecar`: única porta de cadastro. Faz perguntas curtas, monta o plano de enxoval e cria a conta já com ele. Detalhes em [docs/onboarding-funil.md](docs/onboarding-funil.md).
- `/demo`: aplicativo interativo com um enxoval de exemplo. Permite criar, editar, concluir e remover itens, criar enxovais e ambientes, reordenar ambientes e itens, registrar descontos e exportar CSV.
- `/app`: aplicativo conectado à conta.

O comando `dev:preview` **não conecta ao banco nem executa migrações**. A demonstração salva apenas os dados de exemplo em `localStorage`, na chave `larume.demo.v1`, sem salvar senhas. Esses dados são independentes da conta real. Convites não são enviados pela demonstração. Login e cadastro precisam do servidor completo; na prévia, o formulário explica essa condição.

## Executar com contas e persistência real

1. Copie `.env.example` para `.env` e troque `POSTGRES_PASSWORD` (e a mesma senha em `DATABASE_URL`).
2. Suba o PostgreSQL local com Docker: `npm run db:up`. Para localhost sem HTTPS, use `COOKIE_SECURE=false`.
3. Execute `npm run dev`. O servidor aplica as migrações existentes antes de iniciar.

### PostgreSQL com Docker

[docker-compose.yml](docker-compose.yml) define o serviço `db` (`postgres:16-alpine`, container `larume_db`), acessível só em `127.0.0.1` na porta **5433** (evita conflito com outros Postgres locais na 5432). Os dados ficam no volume `larume_larume_pgdata`.

| Comando | O que faz |
|---|---|
| `npm run db:up` | Sobe o banco e espera ficar saudável |
| `npm run db:migrate` | Aplica as migrações manualmente (o `npm run dev` já faz isso) |
| `npm run db:psql` | Abre o `psql` no container (aceita argumentos: `npm run db:psql -- -c "\dt"`) |
| `npm run db:logs` | Acompanha os logs |
| `npm run db:down` | Para e remove o container, mantendo os dados |
| `docker compose down -v` | Para e **apaga os dados** do volume |

O fluxo de autenticação e a API PostgreSQL originais foram preservados. Compartilhar um enxoval adiciona como membro uma pessoa que já possui conta, usando seu e-mail; convites não enviam e-mail (o e-mail só é usado na recuperação de senha).

## Esqueci minha senha (link por e-mail)

Na tela de login, **Esqueci minha senha** leva a `/esqueci-senha`. A pessoa informa o e-mail e recebe um link para `/redefinir-senha`, onde cria uma nova senha (8 a 128 caracteres).

- **Segurança:** o link vale 1 hora e serve uma única vez. Só o hash do token fica no banco (`password_reset_tokens`), e o token vai no fragmento da URL (`#token=…`), que o navegador não envia ao servidor nem a outros sites, e que é apagado da barra de endereço ao abrir a página. Um novo pedido invalida o link anterior, e um intervalo mínimo de 1 minuto por conta evita enxurrada de e-mails. A resposta do pedido é sempre a mesma, exista ou não conta com aquele e-mail, e contas inativas não recebem link. Ao redefinir, todas as sessões da conta são encerradas e a pessoa recebe um e-mail de aviso. Um reset feito pelo administrador também invalida links pendentes.
- **Envio:** pelo [Resend](https://resend.com), via API HTTP, com `RESEND_API_KEY` e `MAIL_FROM` no servidor (veja `.env.example`). Sem essas variáveis, em desenvolvimento o e-mail aparece no console do servidor; em produção nada é enviado e o log traz um aviso (o link é um segredo e não vai para os logs). O remetente de teste `onboarding@resend.dev` só entrega para o e-mail dono da conta Resend; para enviar a qualquer pessoa, verifique um domínio no Resend e use um remetente desse domínio.
- **`APP_URL`:** endereço público do app (ex.: `https://larume.up.railway.app`), usado para montar o link. É obrigatório em produção e nunca é lido do cabeçalho `Host`, para ninguém conseguir fazer o servidor enviar um link para outro domínio.
- **Railway:** configure `APP_URL`, `RESEND_API_KEY` e `MAIL_FROM` como variáveis do serviço. A chave nunca deve ser commitada.
- O teste `npm run test:password-reset-db` cobre o fluxo no PostgreSQL real, com o e-mail em memória (`MAIL_DRIVER=memory`), sem enviar nada.

## Gestão de usuários e recuperação de senha pelo administrador

No `.env` local e nas variáveis do serviço que hospeda o backend, configure:

```dotenv
ADMIN_LOGIN="seu-login-de-gestao"
ADMIN_PASSWORD="sua-senha-administrativa-com-12-ou-mais-caracteres"
```

Reinicie o servidor depois de alterar a configuração. As credenciais ficam apenas no backend; não use prefixo `VITE_`. Sem os dois valores, ou com senha menor que 12 caracteres, o acesso administrativo fica desabilitado. A identidade administrativa é separada das contas de clientes, não cria um enxoval e não aparece na listagem de usuários. Alterar as credenciais invalida as sessões administrativas anteriores.

Abra `/admin` ou use **Acesso administrativo** no login. A gestão permite buscar por nome/e-mail, filtrar ativos, inativos e troca de senha pendente, consultar cadastro/último acesso/quantidade de enxovais e desativar ou reativar contas. “Inativo” significa conta desativada pelo administrador; contas existentes começam ativas. O último acesso começa a ser registrado com esta atualização.

Para recuperar um acesso, encontre a conta ativa, clique em **Redefinir senha** e confirme. Copie a senha temporária exibida e envie diretamente à pessoa. Ela aparece somente nessa resposta, não é persistida em texto puro nem enviada por e-mail. Fechando a janela sem copiá-la, gere outra. A senha temporária vale 24 horas; gerar outra invalida a anterior. O reset substitui o hash, marca `must_change_password` e encerra todas as sessões do cliente.

Ao entrar com a senha temporária, a pessoa vê a tela de nova senha e confirmação (8 a 128 caracteres). Enquanto a troca estiver pendente, a API bloqueia as operações e não retorna os dados do enxoval no bootstrap. A conclusão remove a flag e a expiração, revoga as sessões temporárias e cria uma nova sessão. Desativar uma conta bloqueia login e revoga sessões, preservando listas e itens; reativar não recupera sessões antigas. Contas inativas precisam ser reativadas antes de gerar uma senha temporária.

O admin usa sessão própria em cookie HTTP-only, com duração de 8 horas e token armazenado como hash. As rotas mutáveis exigem JSON e rejeitam origens externas; os logins possuem limite de tentativas por IP em cada processo (10 para admin, 15 para clientes a cada 15 minutos). As novas colunas e a tabela de sessões administrativas são criadas automaticamente pelo servidor completo. A prévia sem banco não habilita a gestão real.

## Experiência do produto

- Identidade Larume com a casa, os tecidos dobrados e o ramo da referência escolhida, versões para favicon e ícones de tela inicial.
- Paleta de areia, madeira, off-white e verde suave; tipografia DM Sans e Playfair Display, com Cormorant Garamond na assinatura Larume.
- Landing page, login e cadastro adaptados para celular, tablet e computador.
- Navegação por ambientes e visão geral com progresso, total investido, descontos e cashback e estimativa dos itens pendentes.
- Cada item tem uma situação, escolhida ao adicionar ou ao editar e filtrável na lista: **Preciso comprar** (padrão), **Pesquisando**, **Comprei**, **Ganhei**, **Já tenho**, **Não preciso** e **Descartei**. Comprei, Ganhei e Já tenho contam como conquistados; Não preciso e Descartei saem do progresso e dos totais. Só **Comprei** entra em “Já investimos” (menos o desconto manual do enxoval). O valor cheio dos itens **Ganhei** soma-se aos descontos no cartão “Descontos e cashback” e nunca entra em “Já investimos”. Cada item tem uma **quantidade** (1 a 999, padrão 1, com botões − e + e sem aceitar zero) para não repetir o mesmo item na lista. Ela é só informativa: não multiplica o preço, que continua sendo o valor do item, e não altera resumos nem descontos (o CSV traz a coluna Quantidade). A migração preenche a quantidade uma única vez a partir de descrições do funil como “4 un.”, e novos planos do funil já gravam a quantidade. Cada item aceita um **desconto ou cashback** (cadastro e edição do item, ou o diálogo “Descontos e cashback”, que só subtrai e vincula o valor a um ambiente e item): o valor é abatido do preço, soma-se ao resumo e fica visível ao abrir o item. O campo fica desabilitado em Ganhei, Já tenho, Não preciso e Descartei, e o servidor valida que o desconto não passe do preço do item. O desconto geral antigo do enxoval (`enxovais.discount_cents`), sem item vinculado, continua somando no resumo até ser removido no diálogo. O marcador de check continua alternando entre Preciso comprar e Comprei. As situações ficam na coluna `items.status`, que a migração preenche a partir do antigo `checked` (marcado vira Comprei); `checked` segue gravado e é derivado da situação.
- No celular: ambientes horizontais, gesto de deslizar entre ambientes, puxar para atualizar, cabeçalho compacto ao rolar, botão de adição e navegação inferior.
- O cabeçalho mobile usa apenas o ícone do menu, com área de toque de 44 px. Na visão geral, os ambientes e o total gasto ficam fora do cabeçalho; voltam na lista de itens.
- A navegação inferior destaca a opção ativa com um fundo verde suave e borda arredondada. Compartilhar recebe o destaque enquanto sua janela está aberta.
- O ícone de menu abre um painel pela direita com convites, descontos e criação de ambientes. No mobile, também reúne seleção/criação de enxovais e a lista vertical de ambientes; no desktop, esses controles ficam na barra lateral. Renomear e excluir o enxoval aparecem apenas para o dono; excluir mantém a confirmação. O painel tem rolagem independente, bloqueia a interação com o fundo e devolve o foco ao botão ao fechar.
- No computador: menu lateral, painel financeiro e ações de edição, convite e exportação.
- Busca sem distinção de acentos, filtros e ordenação por nome, alterações recentes ou “Minha ordem”. Nesta última, sem busca/filtros, as alças reordenam os itens do ambiente. Ambientes podem ser arrastados na barra lateral, na faixa mobile e na lista vertical do menu. As alças também aceitam as setas pelo teclado; a ordem é persistida nos campos existentes.
- Lápis junto aos nomes permite renomear o enxoval e os ambientes. Nome ou seta do item expande a edição na própria lista; o lápis continua abrindo o modal. A data de adição vem de `created_at` e permanece após editar. Dados antigos da demonstração sem essa data não recebem uma data inventada.
- Dropdowns com o visual da Larume, navegação por teclado, seleção por toque e Escape para fechar as opções antes de fechar o diálogo.
- Exportação CSV do enxoval completo ou do ambiente, em português, UTF-8 e separador `;`, com proteção de células que poderiam ser interpretadas como fórmulas. A exportação por ambiente inclui todos os seus itens, independentemente dos filtros ativos.
- Diálogos com foco controlado, Escape para fechar e retorno ao botão de origem.
- Adição, edição, filtros, convites e confirmações usam o mesmo componente de diálogo e a paleta da Larume. As confirmações de exclusão começam com foco em Cancelar; formulários longos têm rolagem própria em telas pequenas.
- Respeito à preferência de movimento reduzido no CSS.

## Validação

```sh
npm run lint
npm run test:e2e
npm run build
npm run test:admin-api
npm run test:onboarding-db
npm run test:item-status-db
npm run test:password-reset-db
```

A suíte Playwright verifica os fluxos principais, persistência e exportação da demonstração, formulários de autenticação com API simulada, gestos e navegação mobile, foco dos diálogos e verificações automatizadas de acessibilidade com axe. As quatro telas principais são verificadas nas larguras 320, 390, 768, 1024 e 1440 px.

No Windows, os testes usam o Microsoft Edge instalado. Em outros sistemas, instale o navegador de teste com `npx playwright install chromium`. Quando não há servidor local, os testes iniciam o modo de prévia, sem migração de banco; se já há um servidor na porta 3000, ele é reutilizado. As alterações dos testes ficam na demonstração ou em respostas de API simuladas. Os testes de login e cadastro verificam a integração do frontend com respostas simuladas, não a conexão real com PostgreSQL.

`npm run test:item-status-db` verifica no PostgreSQL real a criação e a troca de situação dos itens, o desconto por item, a quantidade (validação e migração), a compatibilidade com `checked`, a separação entre investido, ganho e pendente e a migração do campo antigo, também em um schema descartável.

`npm run test:admin-api` verifica o backend real com o PostgreSQL configurado. Cria e remove um schema isolado com contas fictícias, sem consultar ou modificar contas existentes. O usuário do banco precisa de permissão para criar schemas. Verifica permissões, reset, troca obrigatória, expiração, revogação de sessões, status das contas, nomes/ordem de ambientes e itens, preservação da data de adição e das listas.

## Build e execução

```sh
npm run build
npm start
```

`npm start` serve o build de produção e a API. Configure a conexão do banco e cookies HTTPS para esse ambiente. Nada é publicado automaticamente.

## Escopo comercial desta versão

Os planos e preços da landing page são **ilustrativos**, conforme a proposta visual. Não existem cobrança, checkout, assinatura ou limites de plano aplicados. A recuperação de senha pode ser feita pela própria pessoa, por e-mail (veja “Esqueci minha senha”), ou assistida pelo administrador. Confirmação de e-mail no cadastro e pagamentos não estão implementados.

## Arquivos de identidade

- `src/components/Brand.tsx`: símbolo e assinatura da marca usados na interface, com versões horizontal, vertical e compacta.
- `public/brand/larume-symbol.webp`: símbolo otimizado com transparência; o PNG original também está nessa pasta.
- `public/brand/larume-symbol-white.webp`: versão branca com relevo suave, usada sobre a fotografia do login e cadastro, com o nome à direita.
- `public/brand/larume-logo.png`: assinatura vertical com símbolo e nome Larume, em PNG transparente.
- `public/larume-*.png`: ícones para navegador, tela inicial e modo maskable. Os arquivos padrão `favicon.ico` e `apple-touch-icon.png` também usam a nova marca.
- `public/images/larume-home.webp`: fotografia original criada para a landing page e otimizada em WebP.
- `src/product.css`: estilos da identidade, páginas públicas e aplicativo.

A logo foi adaptada da referência enviada usando a ferramenta integrada de geração de imagens e conferida visualmente na interface, em fundo claro e escuro. A assinatura é texto real na interface para manter a grafia Larume e a legibilidade em diferentes telas. Detalhes de identidade e o prompt estão em `docs/larume-brand.md`.

A fotografia foi criada para este projeto; o produto não depende de URLs externas de imagens. As fontes usam Google Fonts, com fontes locais de fallback. A demonstração lê os dados das chaves anteriores `larumi.demo.v1` e `morada.demo.v1` quando necessário e passa a persistir em `larume.demo.v1`, preservando as listas já criadas no navegador.
