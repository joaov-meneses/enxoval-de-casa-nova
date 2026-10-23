# Lista "Meu enxoval": mais valor (Fase 11)

Seis frentes que mantêm o app útil antes e depois da mudança. Pendências de operação ficam em [`implementacoes-futuras.md`](./implementacoes-futuras.md).

## Parcelas e fluxo mensal (11.1)

* Item: `installments` (1 a 24), `first_installment_on`, `purchased_at` (gravada ao passar para Comprado, apagada ao voltar para Pesquisando, nunca no futuro), `payment_method` e `installment_cents` (só com juros). Enxoval: `monthly_budget_cents` (só o dono).
* "Comprei" pergunta parcelas e meio de pagamento; o formulário do item tem os mesmos campos ("Pretendo parcelar em" para pendentes).
* Planejamento → **Parcelas por mês**: barras mês a mês (assumidas + previsão dos pendentes pela semana de compra), linha do teto, meses acima do teto marcados e tabela. Cálculo em `src/planning/installments.ts`.
* Meu Lar → "Seu dinheiro": comprometido nos próximos 3 meses e última parcela. "Já investimos" continua sendo o valor total.
* Exportação: colunas Parcelas, Valor da parcela, Primeira parcela e Meio de pagamento (a importação as ignora).

## Quem compra o quê (11.2)

* `items.assignee_id`, validado entre os membros do enxoval; um gatilho no banco libera os itens de quem sai do enxoval.
* Avatar na linha, campo "Quem vai comprar", atalho "Meus itens (N)" e filtro "Meus itens / Sem responsável / De [nome]" (só em enxoval dividido). O próximo passo prefere itens da própria pessoa ou sem responsável.
* Ao abrir o app, aviso quando um item que estava com a pessoa foi conquistado por outra pessoa do enxoval.
* Foto dos participantes: `GET /api/enxovais/:id/members/:userId/avatar`.

## Presentes e agradecimentos (11.3)

* `gift_from` (até 120), `gift_message` (até 500), `thanked_at` (`thanked: true|false` no PATCH).
* "Recebido" pergunta de quem foi e o recado (com sugestão dos nomes já usados). Selos "de Tia Rosa" e "Agradecer"; o diálogo marca como agradecido ou abre o WhatsApp com a mensagem pronta (sem guardar telefone).
* Meu Lar → **Presentes**: quem deu o quê, total em valor e CSV.

## Comprovantes e garantias (11.4)

* Tabela `item_documents` (referência) e `item_document_blobs` (bytes, só no modo banco). Driver em `server/objectStorage.ts`: `DOCUMENT_STORAGE=s3` exige o bucket completo; download por URL assinada (SigV4, 5 min). Exclusões do bucket entram em `storage_deletions` (gatilho) e o worker as aplica.
* Rotas: `POST/GET /api/items/:id/documents`, `GET /api/documents/:id/file`, `DELETE /api/documents/:id`, `GET /api/enxovais/:id/documents` e `/documents.zip` (ZIP por ambiente e item).
* Regras: até 10 MB por arquivo e 20 por item, cota por conta (`DOCUMENT_QUOTA_MB`), tipo conferido pelos primeiros bytes (PDF, JPG, PNG, WebP, HEIC), só membros baixam, tudo sai com o item, o enxoval ou a conta.
* Garantia: `warranty_months`, `warranty_until` (calculada pela data da compra, editável) e `store_name`. Atalho "N garantias vencem em 30 dias" e painel **Documentos da casa** no Meu Lar.
* Lembretes: `server/workers/warrantyReminders.ts`, a cada hora, avisa 30 e 7 dias antes (uma vez por pessoa, item e data de fim). Respeita "Avisar antes de a garantia vencer" no perfil, a pausa e a categoria "lembretes".

## Várias lojas por item (11.5)

* Tabela `item_offers` (até 3 por item); a principal é espelhada em `items.tracked_product_id`. Tornar principal muda o link e o preço do item para o último preço lido da loja.
* Rotas: `POST /api/items/:id/offers`, `PATCH /api/items/:id/offers/:offerId` (`isPrimary: true`) e `DELETE`.
* Selo "N lojas · a partir de R$ X", seção **Lojas** com "Mais barato" e "Tornar principal", histórico com uma linha por loja. A rotina de preços relê todas as lojas dos itens a comprar; o atalho "baixou de preço" e o alerta consideram qualquer loja e dizem em qual.

## Modo loja (11.6)

* Rota `/app/:enxoval/loja` (e `/loja/:ambiente`), pelo menu do enxoval ou pelo botão "Estou na loja" da lista no celular.
* Só pendentes, letra grande, alvos de 56 px, busca, chips por ambiente, "Vale a pena?" (meta, menor preço online e faixa do perfil) e "Comprei" compacto (valor e parcelas), com desfazer.
* Sinal ruim: retrato do enxoval e fila de alterações no IndexedDB (`src/storeOffline.ts`), enviada quando a rede volta ("N alterações aguardando conexão"). Sem conexão ao abrir, o app usa o retrato salvo. Service worker (`public/sw.js`, só em produção) guarda a casca do app e os arquivos do build. Wake Lock mantém a tela ligada.

## Testes

```bash
npm run test:enxoval-value       # funções puras: parcelas, atalhos, ZIP, URL assinada, fila offline
npm run test:enxoval-value-db    # PostgreSQL real: campos, responsável, presentes, lojas, documentos e lembretes
npx playwright test tests/enxoval-value.spec.ts   # interface em 375 e 1440 px
```
