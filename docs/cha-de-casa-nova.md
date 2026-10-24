# Chá de Casa Nova — Fase 4

Implementado em 24/10/2026. Contrato das rotas: [`housewarming.openapi.yaml`](../postman/contracts/housewarming.openapi.yaml).

## Como usar

1. No enxoval com acesso ativo, abra **Chá de Casa Nova** na navegação do app (`/app/:enxoval/cha`).
2. Quem criou o enxoval define título, mensagem, data opcional e nome do link. Selecione até 500 itens; a seleção começa vazia para evitar publicar dados por acidente.
3. Se quiser receber Pix, cadastre a chave, o tipo, o nome do favorecido e a cidade. Uma chave aleatória preserva CPF, telefone e e-mail. O QR Code não fixa um valor: o convidado escolhe no banco.
4. Marque a publicação e salve. Compartilhe `/cha/:slug`. Alterar o nome do link invalida o anterior; desmarcar a publicação e salvar retira o convite do ar.
5. Convidados reservam um item informando nome, e-mail e recado opcional, ou enviam um recado avulso com nome e mensagem. Os dados dos convidados são visíveis apenas aos moradores.
6. O app mostra as novidades no enxoval e na caixa **Carinho recebido**. Moradores confirmam o recebimento; quem criou o enxoval pode liberar reservas após combinar com o convidado.

## Regras e privacidade

- Uma lista por enxoval. Só o dono edita e publica; membros acompanham as novidades, marcam como lidas e confirmam recebimentos.
- A publicação mostra apenas título, mensagem, data, os itens escolhidos (nome, ambiente e disponibilidade) e os dados necessários ao Pix. Preços, notas particulares, documentos e dados de conta não entram na resposta pública.
- Uma reserva ativa por item, com transação e bloqueio de linha para pedidos concorrentes. O `requestId` do navegador permite repetir o mesmo pedido após falha de rede sem duplicar reserva ou recado.
- Reservar mantém a situação **Pesquisando**. O nome e o recado são ligados ao item por `gift_reservation_id` e preenchem o presente; só o morador passa para **Recebido**. Liberar uma reserva preserva os campos de presente que os moradores editaram manualmente.
- Um item comprado, recebido ou já existente aparece como conquistado e não aceita reserva. Reservas canceladas ficam no histórico privado. A caixa mostra até 100 entradas por vez, com não lidas primeiro; marcar as visíveis como lidas permite acompanhar as demais.
- Retirar um item da seleção o esconde imediatamente e preserva a reserva privada. A exclusão do item, enxoval ou conta elimina os registros vinculados por cascata.
- As páginas não entram no sitemap e recebem `noindex, nofollow`; qualquer pessoa com o link pode acessá-las enquanto publicadas. O acesso público é recusado quando o dono perde o plano ativo, fica inativo ou recebe bloqueio total.
- Rotas públicas mantêm a proteção de origem, bloqueios e limites por IP. Nomes e recados são renderizados como texto. Os slugs são representados como `/cha/:slug` nos eventos de navegação.

## Pix

O código estático segue o [Manual de Padrões para Iniciação do Pix do Banco Central](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf): chave, moeda BRL, favorecido, cidade, referência `***` e CRC16. O QR Code é gerado localmente com `qrcode`; não usamos serviço externo para gerar imagens ou consultar dados bancários.

O Pix do Chá é independente do pagamento de assinaturas pela Stripe. Não confirma a existência ou titularidade da chave, não recebe dinheiro e não marca um presente como recebido por gerar ou copiar um código. O convidado confere o favorecido no banco antes de transferir.

## Operação

As tabelas `housewarming_lists`, `housewarming_items`, `housewarming_reservations` e `housewarming_messages`, a referência no item e os gatilhos são criados de forma idempotente por `migrateDatabase`. Não há nova chave de API ou conta externa a configurar.

As alterações confirmadas no PostgreSQL disparam `NOTIFY housewarming_changed`, inclusive entre instâncias do servidor. Uma conexão `LISTEN` por processo atende todos os fluxos SSE, sem enviar dados pessoais pelos eventos; o cliente refaz a leitura autorizada. Os fluxos enviam batimento a cada 25 segundos, reconectam em até 10 minutos e liberam o assinante quando a página fecha. As telas também consultam a cada 15 segundos enquanto visíveis para tolerar proxies sem SSE, perda de notificação, expiração do plano e falha temporária de conexão. O proxy deve permitir `text/event-stream`, sem buffer.

Notificações são do próprio app. Os e-mails de presente do Chá continuam como trabalho futuro na Fase 5.

## Verificação

- `npm run test:housewarming`: vetor de referência do Pix, validação das chaves, configuração, datas, rotas e exclusão dos convites da indexação.
- `npm run test:housewarming-db`: HTTP real com PostgreSQL em schema descartável; permissões, seleção pública, concorrência, repetição de pedidos, recados, recebimento, cancelamento, expiração, bloqueio e exclusão.
- `npx playwright test tests/housewarming.spec.ts`: fluxos de interface em desktop e celular, com respostas locais controladas. Não executa transferência bancária.
