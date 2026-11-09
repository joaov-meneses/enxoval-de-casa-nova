# Checkout Stripe com a marca Casa Mia

Data: 06/11/2026.

## Estado da entrega

Marca salva e consultada novamente pelo MCP oficial da Stripe na conta de produção Casa Mia `acct_1UQc9xIsGJ6k3UsS`. Novas sessões LIVE do Mensal e do Passe confirmaram a marca e o campo de código promocional. Não houve pagamento nem assinatura concluída.

O link apresentado pelo responsável corresponde ao agrupamento `casamia_validation_kxqnmvaz`, criado durante a validação dos ambientes. As duas sessões anteriores estavam expiradas e tinham recebido o desconto diretamente, sem `allow_promotion_codes`. O backend do app já envia `allow_promotion_codes: true` em `server/billing.ts`.

## Configuração aplicada

| Campo | Valor |
| --- | --- |
| Fundo do Checkout | Linho, `#f8f3eb` |
| Botão | Terracota profundo, `#a34c30` |
| Cor principal da marca | Terracota artesanal, `#c2603f` |
| Cor secundária | Linho, `#f8f3eb` |
| Fonte do Checkout | Nunito |
| Bordas | Arredondadas, `default` nas configurações e `rounded` nas sessões |
| Ícone | Nino oficial, a partir de `public/favicon-512x512.png` |
| Códigos promocionais | `allow_promotion_codes: true` nas novas amostras e no código existente do app |

O PNG original tem 512 x 512 pixels e foi enviado à Files API com propósito `business_icon`, retornando `file_1UYe9EIsGJ6k3UsS0MT55S5T`. A arte não foi redesenhada ou modificada.

A atualização de marca foi feita pela operação MCP `UpdateBrandSettings`, disponibilizada pela Stripe para `/v1/_unstable/settings/brand`. As cores foram enviadas no formato RGB exigido pela operação. `checkout_use_brand_colors=false` permite usar o fundo e o botão específicos do Checkout. O contraste secundário exigido pela operação foi calculado reduzindo a luminosidade HSL da cor principal em um ponto percentual: `#bf5e3d`.

Essas configurações pertencem à conta e também podem aparecer em outras superfícies hospedadas, conforme o uso de cada campo pela Stripe. O nome empresarial retornado nas sessões continua sendo DEVSPOT TECNOLOGIA LTDA. Nenhuma alteração de cadastro jurídico foi realizada.

## Amostras e validação

Foram criadas duas novas sessões no mesmo `integration_identifier` do link apresentado, sem aplicar previamente um desconto, para conferir o campo de cupom:

- Mensal: `cs_live_b1Ab64wbbQywYzIiaDwGRSe25WnVeKY0UGSihybzRLva0JVjPzXtV3JmNE`. Teste de 48 horas preservado, com total inicial de zero e coleta de cartão.
- Passe: `cs_live_b1UfP5AE33ACj8lNEYczBqsZAt0R4xsI0MS8T8QQo5VpszqRvOwX6AGwZ4`. Pagamento único de R$ 99,00 antes de informar o código.

As duas sessões foram expiradas imediatamente em `finally`. Não são links de venda e não têm vínculo com um usuário do app. Consultas GET posteriores pelo MCP confirmaram `status=expired`, `livemode=true`, `allow_promotion_codes=true` e todos os campos de marca esperados. O código `BLACKFRIDAY`, criado na entrega anterior, continua oferecendo os valores descritos em [Black Friday 2026](black-friday-2026.md).

Comandos e operações executados:

- `GetBrandSettings` antes e depois de `UpdateBrandSettings`: passaram; fundo, botão, fonte, borda e ícone salvos foram confirmados.
- `node -` com SDK Stripe e credencial obtida da variável segura da Railway: passou no upload do ícone, na criação das duas sessões e na expiração de ambas. As respostas das sessões confirmaram os parâmetros de marca herdados da conta.
- `GetCheckoutSessionsSession` nas duas amostras: passou; confirmou novamente a marca e o campo de desconto.
- `git diff --check -- docs/implementacoes-futuras.md design/inventario/inventario.md`: passou.
- `npm run documents:check`: passou, com `driver=database`, `documents=0`, `missingBlobs=0` e `localReceiptModel=true`.

Não foi necessário alterar código do app nem realizar outro deployment. Não há operação de configuração/publicação do editor Checkout Studio exposta nas buscas realizadas no MCP; a mudança foi aplicada às configurações de marca e conferida nas sessões pela API, sem simular uma edição salva no editor.

## Como validar

1. Recarregar o Checkout Studio e consultar as novas amostras do agrupamento de validação.
2. Abrir uma nova sessão pelo fluxo autenticado do app. Sessões antigas mantêm o retrato da configuração com que foram criadas.
3. Conferir fundo linho, botão terracota, Nunito, ícone do Nino e campo de código promocional.
4. Informar `BLACKFRIDAY` e conferir os valores antes de qualquer pagamento real.

A conferência visual nas larguras de 320, 375 e 425 pixels não foi executada: o acesso ao navegador estava indisponível. Os parâmetros foram verificados pela API. Não houve mudança de Stripe Tax ou da configuração fiscal.

## Políticas do consumidor

Em 06/11/2026, a integração recebeu links para termos, privacidade e reembolso, com contato@devspot.com.br e direito de arrependimento de 7 dias. A atualização de código foi publicada nos dois ambientes. Estado, testes e limite dos controles nativos do Dashboard estão em [Políticas do consumidor](politicas-consumidor.md). A verificação móvel dessa entrega cobre as páginas do app, não uma renderização do checkout hospedado pela Stripe.
