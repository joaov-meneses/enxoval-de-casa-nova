# Operação de pagamentos em produção

Data: 06/11/2026. Estado: procedimento operacional implementado para revisão humana; emissão fiscal real e validação financeira com meio de pagamento real continuam dependentes dos itens descritos abaixo.

## Responsabilidade e acompanhamento

O responsável pela operação deve acompanhar diariamente a Central de ajuda do app, a caixa `contato@devspot.com.br`, a fila de pagamentos e as notificações do Dashboard Stripe. O envio do formulário confirma o registro de uma solicitação; não executa cancelamento, estorno nem regularização de nota fiscal. A designação da pessoa que acompanhará a operação cabe ao responsável pela empresa; este documento não representa contratação ou disponibilidade de atendimento.

O cancelamento comum do Mensal no app é imediato e encerra o acesso do titular e convidados, conforme a confirmação exibida. Conta e dados ficam preservados. Cancelar antes do fim do teste gratuito evita a mensalidade. O Passe é pagamento único para doze meses, sem renovação automática. Cancelar assinatura não devolve um pagamento automaticamente.

## Diagnóstico sem expor credenciais

Execute no ambiente correspondente, usando as variáveis seguras do servidor. Não copie `.env` entre ambientes nem forneça chaves em argumentos ou no chat.

```sh
npm run billing:ops -- check
npm run billing:ops -- list-cases --environment producao
npm run billing:ops -- list-cases --environment homologacao
```

`check` consulta conta, preços, Portal do Cliente, meios de pagamento e webhook. Informa somente o modo da chave, correspondência com production/staging, presença de parâmetros fiscais e resultados booleanos. Não imprime documentos, chaves, certificados ou conteúdo de solicitações. A validação local do certificado/configuração só tem valor quando o comando roda no servidor com os arquivos realmente montados.

`list-cases` é somente leitura e retorna pendências de `invoice.payment_failed`, `charge.dispute.created`, `radar.early_fraud_warning.created`, `checkout.session.async_payment_failed` e reembolsos (`refund`), separadas por ambiente. Não retorna nomes, e-mails, notas ou payloads. Exibe até cem registros com `hasMore`; ao revisar os primeiros e consultar novamente, os próximos aparecem. Filtre um tipo com `--kind` quando necessário.

## Falhas, contestações e avisos de fraude

1. Confira o ambiente, a origem e o último evento no Dashboard Stripe. Use as referências da contratação para localizar a conta legítima; não peça cartão completo, senha ou documento desnecessário.
2. Cobrança recusada: examine a assinatura/fatura, a próxima tentativa e o meio de pagamento. Oriente atualização pelo portal seguro. Não declare um pagamento quitado nem libere acesso com base apenas no retorno do checkout.
3. Pagamento assíncrono falhou: confirme o estado atual da sessão/PaymentIntent. Um caso antigo não autoriza revogar acesso decorrente de outra compra válida.
4. Contestação: confira prazo, motivo, evidências e ações disponíveis no Dashboard. Um alerta ou contestação não prova sozinho fraude. Decida o procedimento com o responsável; não envie reembolso duplicado sobre valor já devolvido/contestado.
5. Aviso de possível fraude: confira cobrança, identidade da contratação e sinais disponíveis na Stripe. O webhook registra o caso para revisão, sem movimentar dinheiro automaticamente.
6. Depois da providência, confira se não chegou evento mais recente. Registre uma nota operacional mínima, sem transcrever dados pessoais ou cartão:

```sh
npm run billing:ops -- review-case --environment producao --kind invoice.payment_failed --source in_EXEMPLO --event evt_EXEMPLO --note "Conferido no Stripe; titular orientado pelo canal de suporte."
```

Use exatamente o `kind`, `source_id` e `last_event_id` retornados na fila. A revisão usa transação e comparação do evento: só um operador encerra a mesma pendência; eventos posteriores exigem nova conferência. A auditoria conserva o identificador do evento revisado junto da nota, mesmo quando outro evento reabre a pendência. A operação não cancela assinatura, acesso ou nota, não cobra nem estorna. Para reembolso, `--kind refund --source ch_EXEMPLO` usa a fila de estornos existente.

## Pedido de arrependimento e reembolso

1. Acompanhe pedidos recebidos pelo formulário e e-mail. A [política publicada](/reembolso) prevê sete dias corridos, devolução integral e sem multa; não exija justificativa. Outros direitos legais permanecem preservados.
2. Confirme a contratação e o titular pelo acesso autenticado ou procedimento proporcional de suporte. Não exponha dados de outro cliente e não use um cartão salvo de terceiros para testes.
3. Quando aplicável, interrompa imediatamente a recorrência na assinatura correta da Stripe e confira o estado final. O formulário, sozinho, não impede a próxima cobrança.
4. Localize o pagamento efetivamente recebido, confira valor, moeda, devoluções existentes e contestações. Providencie o estorno integral devido no Dashboard Stripe e conserve sua referência, evitando repetição. Se não houve cobrança, não há valor a devolver.
5. Confirme o procedimento ao consumidor pelo canal utilizado. O lançamento do crédito depende da instituição/meio de pagamento; acompanhe estorno pendente ou falho até a resolução.
6. Revise o acesso: estorno financeiro não encerra automaticamente o Passe nem substitui cancelamento do Mensal. Confira outras compras/direitos válidos antes de alterar o acesso.
7. Encaminhe a nota fiscal à regularização aplicável, com a contabilidade. O evento de reembolso não cancela NFS-e automaticamente. Não emita nova nota sem conferir se existe documento autorizado.
8. Confira a conciliação e conclua a revisão da pendência somente depois dessas providências. O comando de revisão não executa nenhuma delas.

```sh
npm run billing:ops -- reconcile --since 2026-11-01T00:00:00-03:00 --until 2026-12-01T00:00:00-03:00
npm run billing:ops -- review-case --environment producao --kind refund --source ch_EXEMPLO --event evt_EXEMPLO --note "Estorno conferido; acesso e tratamento fiscal revisados separadamente."
```

A conciliação consulta por data de criação dos objetos Stripe; escolha início que cubra também a criação da fatura paga no período. `--refresh-fiscal` só deve ser usado com certificado e configuração válidos, pois faz consultas ao emissor. O comando não envia pagamentos nem realiza reembolsos.

## Situação fiscal e procedimento provisório

A decisão versionada é integração direta com SEFIN Nacional, mantendo Stripe nos pagamentos. FocusNFe foi removida. Isso não representa homologação nem habilitação fiscal do CNPJ.

O diagnóstico de 06/11 encontrou production e staging sem certificado/chave, tributação, série/primeiro número e referência contábil configurados. O responsável informou ainda não possuir aprovação/procedimento contábil. A busca no repositório encontrou apenas certificados sintéticos de teste, não um A1 real utilizável.

A configuração segura mantém `NFSE_NACIONAL_ENABLED=false`, `NFSE_NACIONAL_ISSUER_ENABLED=false` e `NFSE_NACIONAL_ISSUE_ON=manual`. `NFSE_NACIONAL_ENVIRONMENT=producao` em production e `homologacao` em staging permitem materializar a fila do ambiente correto sem transmitir documentos. Não inserir referência contábil fictícia para desbloquear emissão.

Antes de vender com operação fiscal definida, o responsável precisa obter da contabilidade: enquadramento/habilitação do emitente; emissor oficial aplicável; códigos/tributação; série e primeiro número livres; momento e competência; procedimento de cancelamento/substituição. Se a emissão for manual no emissor autorizado, concilie cada pagamento com seu XML e referência e preserve evidências fora do fluxo automático; não acione `--release`, `enqueue-fiscal` ou transmissão sem conferir se o documento já foi emitido externamente. A integração atual não importa automaticamente documentos emitidos manualmente em outro portal.

Para automatizar, disponibilize A1/cadeia e chave privada por armazenamento seguro no servidor, homologue em produção restrita e confira a autorização/XML antes de ativar produção. Stripe Tax não substitui a emissão brasileira de NFS-e. Os requisitos detalhados estão em [Pagamentos e notas fiscais](pagamentos-e-notas-fiscais.md).

## Validação financeira real

Os testes automatizados usam Stripe simulada ou modo TEST, banco descartável e certificados sintéticos. Não comprovam cobrança, repasse bancário nem emissão fiscal real.

Para a validação final de produção, o titular precisa disponibilizar um meio de pagamento real autorizado e concluir a autenticação exigida pelo banco. Não usar cartão de cliente, dados fictícios ou um pagamento salvo sem autorização. Confira compra, webhook, acesso e cancelamento/estorno previstos, e acompanhe confirmação financeira. Não há no repositório um meio de pagamento real autorizado para essa execução. As sessões de validação LIVE criadas anteriormente foram expiradas sem pagamento.

## Testes e publicação

- `npm ci` na worktree `stripe-operacoes`: passou; npm informou 35 vulnerabilidades existentes (1 moderada, 33 altas, 1 crítica). Nenhuma dependência/lockfile foi alterada. Uma tentativa inicial no diretório errado (`homologacao`) falhou com `EPERM` ao remover `lightningcss.win32-x64-msvc.node` em uso; a coordenação foi avisada para conferir as dependências daquela worktree, sem encerrar serviços do usuário.
- `npm run lint`: passou.
- `npm run build`: passou; aviso de chunks acima de 500 kB, sem falha. O pós-build removeu os source maps públicos conforme a configuração existente.
- `node --check tests/billing-operations-db.mjs` e `git diff --check`: passaram.
- Novo teste: `node --import tsx tests/billing-operations-db.mjs`, em PostgreSQL local e schema descartável. Cobre isolamento de ambiente, fila sanitizada, tipo/nota inválidos, evento antigo, revisão concorrente com um vencedor e auditoria, reabertura por evento novo, reembolsos e diagnóstico com cliente Stripe falso. Execução e resultados ficam no registro final da entrega.
- Dependência: schema de `billing_risk_cases` e ampliação da ação auditada `review_billing_case`, entregues no módulo de risco da mesma mudança.
- O código deve seguir `develop → homologacao → main`, com revisão e testes. Deploy pontual de branch não substitui a incorporação dos commits às branches oficiais.
