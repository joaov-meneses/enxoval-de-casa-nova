# Termos, reembolso e contato do consumidor

Data: 06/11/2026. Estado: publicado em produção e staging; verificações locais e remotas concluídas, com limite dos controles nativos do Dashboard registrado abaixo.

## O que mudou

- Páginas públicas `/termos` e `/reembolso`, com identidade do fornecedor, planos, cobrança, contato e direitos do consumidor. Fonte dos dados públicos: contrato social fornecido pelo responsável e cadastro Stripe já conferido.
- E-mail oficial `contato@devspot.com.br`, informado pelo responsável, também na política de privacidade. Nenhum telefone foi inventado ou divulgado no app.
- Direito de arrependimento de 7 dias corridos nas contratações online, devolução integral dos valores devidos, sem multa ou retenção de taxas, e independência em relação ao teste gratuito. Outros direitos legais permanecem preservados após esse prazo.
- Formulário de solicitação em `/reembolso`, usando a conta da contratação e a central de ajuda existente (`POST /api/feedback`). Confirmação e protocolo são exibidos somente depois de o servidor registrar o pedido. Não exige justificativa; o campo de informações complementares é opcional. Há alternativa por e-mail para quem não consegue entrar na conta.
- O pedido vai para a gestão como “Pedido de arrependimento e reembolso”. O fluxo não efetua estornos nem cancela pagamentos automaticamente. A equipe processa a demanda e acompanha a devolução no provedor.
- Links de termos, privacidade, reembolso e contato antes do botão de pagamento nos dois planos, preservando o texto sobre teste e renovação do Mensal. O cache mensal ganhou versão `legal-v1` para não reaproveitar sessões sem os links.
- Links no rodapé, metadados SEO, sitemap e nomes de rotas de analytics. A implementação não envia o texto do pedido como evento de produto.

## Base consultada

Texto oficial do [Código de Defesa do Consumidor, artigo 49](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html), e do [Decreto nº 7.962/2013, artigos 2º, 4º e 5º](https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-publicacaooriginal-139266-pe.html). O prazo legal não foi apresentado como limite para todos os demais direitos nem como sinônimo do teste gratuito.

Os controles “Políticas da loja” e “Dados públicos” do Dashboard não possuem operações de alteração expostas nas buscas do MCP utilizado. A integração coloca links e contato no `custom_text.submit.message` das sessões reais, sem declarar que os controles nativos do Dashboard foram ativados. A configuração de Stripe Tax não foi alterada.

## Segurança e operação

O formulário reutiliza autenticação, validação, limites de envio, armazenamento e leitura administrativa da central de ajuda. Não recebe números de cartão ou documentos e não concede autoridade para estornar. Requisições sem sessão retornam erro e exibem a alternativa por e-mail, sem confirmação falsa. O atendimento precisa ser acompanhado pela equipe, inclusive quando o pedido chegar por e-mail. Nenhum e-mail real de teste nem reembolso real foi enviado pelo agente.

As mudanças foram preparadas em worktrees separados para preservar as alterações locais de outras entregas. A versão de produção é baseada no commit que já estava publicado, recebendo somente esta entrega, para não promover alterações alheias.

## Validações locais

- `npm ci` nos dois worktrees: passou. O npm informou 35 vulnerabilidades já presentes na árvore instalada; nenhuma dependência ou lockfile foi alterado nesta entrega.
- `npm run lint`: passou.
- `npm run build`: passou; aviso de chunks maiores que 500 kB, sem falha de compilação.
- `npm run test:app-routes`: passou, 4 testes.
- `npm run test:analytics`: passou, 27 testes.
- `npm run test:lifecycle`: passou, 19 testes, incluindo metadados e sitemap das novas páginas.
- `node --import tsx tests/billing-db.mjs`, com `DATABASE_URL` local injetada sem imprimir a credencial: passou. Confirmou os links e o contato nas sessões dos dois planos, preservando o trial de 48 horas, sem chamadas à Stripe real.
- `node --import tsx tests/feedback-db.mjs`, em seguida e com schema descartável: passou. Confirmou autenticação, persistência, confirmação, leitura administrativa e limites da central de ajuda.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3177 npx playwright test tests/legal-pages.spec.ts`: passou, 5 cenários. Conferiu 320, 375 e 425 px, ausência de rolagem horizontal, contato, protocolo após sucesso e erro sem sessão. As imagens geradas em `test-results/` foram inspecionadas; o botão recebeu estilo terracota após a primeira revisão visual, e os testes passaram novamente.
- `git diff --check`: a primeira execução apontou terminações de linha nas duas âncoras novas do rodapé; corrigidas, a execução seguinte passou.
- A primeira tentativa de criar o branch `homologacao/politicas-consumidor-producao` foi recusada porque o branch `homologacao` já existe. O worktree de produção foi criado como `fix/politicas-consumidor-producao`, sem alterar o branch existente.

## Como validar

1. Abrir `/termos`, `/reembolso` e `/privacidade` sem login e conferir o contato oficial e a navegação entre as políticas.
2. Em uma conta de teste, enviar o formulário de reembolso sem preencher a informação opcional; conferir protocolo e registro em Administração → Central de ajuda. Não enviar pedidos sintéticos em produção.
3. Sem sessão, conferir a orientação de login e a alternativa por e-mail.
4. Abrir novos checkouts do Mensal e do Passe e conferir links para as páginas do próprio ambiente antes de pagar. Não realizar pagamento real apenas para essa conferência.

## Publicação e conferência remota

Estado final em 06/11/2026: publicado em produção e staging, com as três páginas públicas disponíveis e a integração de Checkout atualizada.

| Ambiente | Commit publicado | Deployment Railway | Estado |
| --- | --- | --- | --- |
| staging | `3303537721a8f23f2fbf5d6b67f4e0feffcc44a9` | `3ac3c839-abd2-4d41-ad31-82dcd9e64ea2` | SUCCESS |
| production | `dfcf68e5653502e42121c3c66a74813e38f7fd5c` | `cc6d4a21-b724-42b7-8507-f14dc8a11218` | SUCCESS |

- Produção: [Termos](https://enxoval-de-casa-nova-production.up.railway.app/termos), [Reembolso](https://enxoval-de-casa-nova-production.up.railway.app/reembolso) e [Privacidade](https://enxoval-de-casa-nova-production.up.railway.app/privacidade).
- Staging: as mesmas rotas em `https://larume-staging.up.railway.app`.
- Deployments pontuais dos branches `feat/politicas-consumidor` e `fix/politicas-consumidor-producao`. Não houve merge nem push direto em main, develop ou homologacao. Os branches de origem configurados na Railway permanecem main e develop; a promoção dos commits pelo fluxo normal ainda precisa ocorrer antes de uma publicação posterior desses branches, para preservar esta entrega.
- `FEEDBACK_TO_EMAIL=contato@devspot.com.br` configurado e publicado em produção. Pedidos registrados na central usam o transporte Resend existente para avisar a equipe. Em staging, o destinatário de aviso permanece sem configuração para não encaminhar solicitações de teste ao contato real; os registros administrativos continuam disponíveis.
- Leitura sanitizada das variáveis confirmou chave LIVE em production e TEST em staging, sem registrar credenciais.

Validações remotas executadas:

- `PLAYWRIGHT_BASE_URL=https://larume-staging.up.railway.app npx playwright test tests/legal-pages.spec.ts`: passou, 5 cenários.
- `PLAYWRIGHT_BASE_URL=https://enxoval-de-casa-nova-production.up.railway.app npx playwright test tests/legal-pages.spec.ts`: passou, 5 cenários; resultado final `test-results/.last-run.json` com `status=passed` e nenhuma falha. As submissões da interface foram interceptadas pelo teste, sem criar pedidos reais.
- Script Node com GET das três páginas, `/api/health` e sitemap nos dois ambientes: passou; HTTP 200, canonicals corretos e novas políticas no sitemap.
- POST anônimo real em `/api/feedback`, nos dois ambientes: passou, HTTP 401 antes do registro; nenhum pedido ou e-mail foi criado.
- SDK Stripe com sessões de validação Mensal/Passe nos dois ambientes: passou; mensagens confirmaram links do próprio ambiente, contato, prazo de 7 dias e preservação do trial. As quatro sessões foram expiradas imediatamente, sem compra concluída.
- `node --import tsx scripts/check-document-storage.mjs` com banco local: passou, `driver=database`, `documents=0`, `missingBlobs=0` e `localReceiptModel=true`.

Limite do controle nativo Stripe: a tentativa de alterar o perfil público com `accounts.update` retornou HTTP 400 porque esse método só altera contas conectadas, não a própria conta. Os seletores nativos de “Políticas da loja” e “Dados públicos” não foram ativados pelo agente. O contato e os links estão publicados nas páginas e no texto anterior ao pagamento das novas sessões de Checkout, pela integração. Nenhuma alteração de Stripe Tax foi feita.
