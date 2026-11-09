# Prontidão Stripe para produção

Data: 06/11/2026. Estado: auditoria somente de leitura; nenhuma cobrança, cancelamento ou devolução real executada.

## Estado conferido

- MCP `GetAccountsAccount`: passou. Conta Casa Mia LIVE com `charges_enabled=true`, `payouts_enabled=true`, cadastro enviado e listas de requisitos atuais/futuros vazias. Há conta bancária padrão BRL cadastrada; nenhum repasse real foi validado.
- MCP `GetBillingPortalConfigurations` com `active=true`: passou, lista vazia. Não há configuração ativa do Portal do Cliente LIVE; o app possui botão e endpoint para abrir esse portal.
- SDK Stripe com credencial obtida em memória da Railway: consultas passaram. Webhook de produção habilitado, apontando para `/api/billing/webhook`, com os onze eventos documentados. Preços LIVE ativos: Mensal R$ 29,90 e Passe R$ 99,00. Nenhum segredo foi impresso.
- Variáveis Railway de produção: chave LIVE, URL de produção e avisos da central para contato@devspot.com.br confirmados. `STRIPE_PIX_ENABLED=false`.
- A configuração de meios de pagamento agora retorna Pix disponível e preferência `on`, diferentemente da consulta anterior. O app ainda não oferece Pix em produção porque a variável permanece desligada. Isso não impede vendas no cartão; habilitar Pix no Passe exige atualização e validação próprias.
- O perfil público Stripe já possui contato@devspot.com.br, mas também contém telefone, site e descrição de serviços da Devspot. Confirmar/remover o telefone antigo e adequar site/descrição ao produto Casa Mia. Não foram alterados nesta auditoria.

## Cancelamento e reembolso

Leitura de `server/billing.ts`, `server/billingOperations.ts`, `src/components/ProfileDialog.tsx` e `src/components/LegalPage.tsx`:

- Mensal: o titular cancela diretamente no app. A API cancela imediatamente na Stripe; o app encerra o acesso do titular e convidados, preservando conta/dados. A confirmação já avisa esse efeito. No teste gratuito, cancelar antes do término evita a cobrança. O cancelamento não emite reembolso automaticamente.
- Passe: pagamento único, doze meses de acesso, sem renovação automática. Cancelamento do Mensal não remove um Passe válido.
- Pedido de arrependimento/reembolso: política de sete dias publicada, integral e sem multa; formulário registra protocolo e encaminha para a central. A equipe deve efetuar o cancelamento da assinatura, quando aplicável, e o estorno no Stripe. O envio do formulário não executa nenhuma dessas operações financeiras.
- Eventos de reembolso são registrados para revisão; não revogam acesso nem cancelam documento fiscal automaticamente. Cancelar assinatura e devolver dinheiro são ações distintas, também na [documentação Stripe](https://docs.stripe.com/billing/subscriptions/cancel).

## Itens para fechar antes da abertura ampla

1. Ativar/configurar o Portal do Cliente LIVE, incluindo cartão, faturas e política de cancelamento coerente com o app.
2. Completar tratamento de `invoice.payment_failed`, `charge.dispute.created` e `radar.early_fraud_warning.created`: não constam na lista de eventos nem têm tratamento específico nas rotas revisadas. Já existem os eventos de ciclo da assinatura, pagamentos confirmados e reembolsos; não confundir isso com cobertura de falhas/risco.
3. Validar uma compra real autorizada, liberação por webhook, notificação de atendimento, cancelamento e devolução. As validações anteriores criaram/expiraram sessões sem concluir compra; não comprovam o ciclo financeiro real.
4. Definir quem acompanha a central e executa imediatamente as providências do arrependimento; automação financeira ainda não existe.
5. Confirmar emissão fiscal e procedimento de regularização das notas com a contabilidade. A automação fiscal permanece sem homologação real; Stripe Tax não substitui emissão de NFS-e.
6. Promover os commits já publicados pelo fluxo oficial de branches. A entrega anterior fez deployments pontuais de branches isolados; publicar main/develop sem incorporar esses commits pode remover as políticas.

Os controles nativos de políticas da loja não foram ativados pelo agente; os links e o contato estão no texto da integração de Checkout. A auditoria não executou testes de código porque não alterou a implementação; os testes da entrega anterior estão em [Políticas do consumidor](politicas-consumidor.md).
