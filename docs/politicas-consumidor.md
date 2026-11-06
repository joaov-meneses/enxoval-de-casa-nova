# Termos, reembolso e contato do consumidor

Data: 06/11/2026. Estado: implementação e testes locais concluídos; publicação e conferência remota descritas ao final desta entrega.

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
