# Prontidão Stripe — entrega em homologacao

Data: 06/11/2026. Estado: código integrado em branch de preparação, revisão de segurança concluída e validação completa em andamento. Destino solicitado pelo responsável: **somente homologacao**, sem promoção para main.

## Escopo entregue

- Eventos de falha de fatura, falha assíncrona do Checkout, contestação e alerta de fraude geram casos operacionais duráveis. Referências são consultadas na Stripe antes da transação; metadata não decide titularidade. Eventos antigos, duplicados e revisões concorrentes têm proteção explícita.
- CLI de diagnóstico, listagem e revisão, com auditoria do evento exato conferido e isolamento TEST/LIVE. Os procedimentos estão em [Operação de pagamentos](operacao-pagamentos-producao.md).
- Portal do Cliente utiliza a configuração explícita do ambiente quando informada. Cancelamento permanece imediato, conforme a confirmação do app. O pedido de reembolso continua registrando solicitação/protocolo; a equipe executa o estorno e revisa acesso e nota fiscal separadamente.
- Logs `billing.webhook.*` preservam identificador, tipo e modo, sem guardar payload financeiro ou exceção bruta do SDK no log.
- CI inclui os novos testes e cobrança/atendimento/fiscal, com gatilhos para os três destinos do fluxo Git. Nenhum push direto em main foi feito.

## Configuração externa conferida

| Item | Produção | Staging |
| --- | --- | --- |
| Conta/chave | LIVE, conta habilitada, sem requisitos pendentes | TEST |
| Portal | `bpc_1UYyoAIsGJ6k3UsSQu44JsYm`, padrão ativo | `bpc_1URvdSIzzRKYM0sEC2tmFC7D`, ativo |
| Recursos do Portal | cartão, faturas e cancelamento imediato sem proração | os mesmos recursos |
| Pix | disponível na Stripe; variável preparada como `true`, sem deploy novo em produção nesta entrega | variável `true`, aplicar/conferir no deploy de staging |
| Fiscal | ambiente `producao`, emissão/habilitação desligadas, momento manual | ambiente `homologacao`, emissão/habilitação desligadas, momento manual |

As variáveis Railway foram gravadas com `skipDeploys`: staging recebe a configuração no deploy desta entrega; produção aguarda uma futura publicação autorizada. A configuração do Portal na Stripe já está ativa, independentemente de deploy.

Os portais foram criados/conferidos pela API e duas sessões de Portal foram criadas com clientes sintéticos, depois excluídos. Sessões de checkout Mensal/Passe foram criadas nas duas contas e imediatamente expiradas: Mensal com cartão e teste de 48 horas; Passe com cartão/Pix; cupom permitido e links legais presentes. Nenhuma compra foi concluída.

A chave restrita de produção e a chave de teste permitem leitura dos recursos exigidos pelo novo tratamento: disputas, alertas de fraude, InvoicePayments, faturas e assinaturas. A conferência não registrou dados dos clientes.

## Revisão e validação

Exploração, planejamento, implementação em duas worktrees, revisão e testes independentes seguiram a receita `entregar-mudanca`. A revisão encontrou um P2: o histórico não conservava o evento exato revisado após a reabertura do caso. A correção inclui o identificador na nota de auditoria, preserva o texto operacional e acrescenta testes. Rerevisão: nenhum achado restante no escopo da mudança.

Os agentes implementadores executaram `npm ci`, lint, build e verificações de diff/sintaxe. O agente de eventos também executou, em série e com schema PostgreSQL descartável, os testes de risco e cobrança existentes. Todos passaram. Os resultados da suíte independente completa, integração em homologacao e deploy são registrados ao final deste documento.

Uma tentativa inicial de `npm ci` do agente de operações usou o checkout principal por engano e falhou em um binário ocupado. As dependências desse checkout foram restauradas com `npm ci` a partir do lockfile, e o servidor local foi reiniciado; `/api/health` retornou HTTP 200. O lockfile e os arquivos locais do responsável permaneceram preservados.

## Dependências externas e limites

- A busca no repositório encontrou integração direta com SEFIN Nacional, schemas, fila, assinatura XML e certificados **sintéticos de teste**. Não encontrou A1 real, habilitação do emitente, tributação/série/numeração nem orientação contábil aprovada. O responsável confirmou não possuir um procedimento fiscal. Não é possível habilitar emissão real usando fixtures ou parâmetros presumidos. Ver [Pagamentos e notas fiscais](pagamentos-e-notas-fiscais.md).
- O acesso ao navegador continua indisponível (`browser access host is unavailable`). O MCP não oferece a edição dos dados públicos da própria conta. O e-mail já está correto, mas telefone/site/descrição públicos devem ser conferidos no Dashboard quando esse acesso estiver disponível; os links legais já existem no checkout pela integração.
- O plugin GitHub retornou HTTP 403 ao tentar abrir um PR, e `gh` não está autenticado. Com a orientação posterior de integrar somente em homologacao, a entrega usará o Git por SSH autorizado; não depende de PR nem de alteração em main.
- Não foi executada compra, repasse bancário, cancelamento ou estorno **real**. O fechamento financeiro LIVE exige um meio de pagamento do titular no checkout hospedado e autenticação bancária; a autorização de testar não fornece esse meio de pagamento. A entrega atual permanece em homologacao.

## Como validar a operação

1. Conferir `/api/health`, `/termos`, `/privacidade`, `/reembolso` e os planos no domínio de staging.
2. Executar `npm run billing:ops -- check` com as variáveis do ambiente, sem exibir credenciais.
3. Em conta de teste, abrir o Portal e os checkouts; conferir Mensal/cartão e Passe/cartão/Pix, cupom, links e condições de cancelamento.
4. Rodar os testes de banco em série e acompanhar casos da central e `list-cases`. Um pedido registrado não representa um estorno executado.
5. Antes de qualquer lançamento financeiro/fiscal real, resolver as dependências externas acima.
