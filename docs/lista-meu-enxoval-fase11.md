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

* Tabela `item_documents` (referência) e `item_document_blobs` (bytes, só no modo banco). `DOCUMENT_STORAGE=database` funciona também em produção, com cota por conta e backups do PostgreSQL. S3/R2 é opcional para escala: `DOCUMENT_STORAGE=s3` exige o bucket completo; download por URL assinada (SigV4, 5 min). Exclusões do bucket entram em `storage_deletions` (gatilho) e o worker as aplica.
* Rotas: `POST/GET /api/items/:id/documents`, `GET /api/documents/:id/file`, `DELETE /api/documents/:id`, `GET /api/enxovais/:id/documents` e `/documents.zip` (ZIP por ambiente e item).
* Regras: até 10 MB por arquivo e 20 por item, cota por conta (`DOCUMENT_QUOTA_MB`), tipo conferido pelos primeiros bytes (PDF, JPG, PNG, WebP, HEIC), só membros baixam, tudo sai com o item, o enxoval ou a conta.
* Garantia: `warranty_months`, `warranty_until` (calculada pela data da compra, editável) e `store_name`. Atalho "N garantias vencem em 30 dias" e painel **Documentos da casa** no Meu Lar.
* Lembretes: `server/workers/warrantyReminders.ts`, a cada hora, avisa 30 e 7 dias antes (uma vez por pessoa, item e data de fim). Respeita "Avisar antes de a garantia vencer" no perfil, a pausa e a categoria "lembretes".
* Cada lembrete leva `lm` no link do app. O UUID é gerado antes de montar o e-mail e gravado na mesma transação do lembrete. A volta só é atribuída à conta destinatária e é deduplicada em `lifecycle_events`, inclusive se a pessoa precisar entrar antes.
* **Ler nota:** na foto de uma nota fiscal, o botão abre uma prévia editável de loja, data e total. Tesseract e o modelo português rodam localmente no servidor, sem enviar a imagem a uma IA externa. O total só vira preço quando a pessoa confirma que corresponde ao item; a compra só é alterada ao salvar a ficha. PDFs continuam disponíveis para armazenamento e preenchimento manual.
* Limites do OCR: um processamento por instância, 45 segundos por tentativa, até 25 milhões de pixels e `RECEIPT_READ_DAILY_LIMIT` tentativas por pessoa/dia de Brasília (padrão 20, máximo 200). A prévia fica em `item_documents.receipt_preview`; reler a prévia não gasta a cota. Conteúdo, bytes, cookies e URLs assinadas dos documentos não entram nos logs HTTP.
* `npm run documents:check` verifica o driver, cota, presença dos bytes no banco e modelo OCR instalado, sem imprimir credenciais. O comando não comprova os backups ou a configuração de um ambiente remoto; execute-o no ambiente que será publicado.

## Várias lojas por item (11.5)

* Tabela `item_offers` (até 3 por item); a principal é espelhada em `items.tracked_product_id`. Tornar principal muda o link e o preço do item para o último preço lido da loja.
* Rotas: `POST /api/items/:id/offers`, `PATCH /api/items/:id/offers/:offerId` (`isPrimary: true`) e `DELETE`.
* Selo "N lojas · a partir de R$ X", seção **Lojas** com "Mais barato" e "Tornar principal", histórico com uma linha por loja. A rotina de preços relê todas as lojas dos itens a comprar; o atalho "baixou de preço" e o alerta consideram qualquer loja e dizem em qual.

## Modo loja (11.6)

* Rota `/app/:enxoval/loja` (e `/loja/:ambiente`), pelo menu do enxoval ou pelo botão "Estou na loja" da lista no celular.
* Só pendentes, letra grande, alvos de 56 px, busca, chips por ambiente, "Vale a pena?" (meta, menor preço online e faixa do perfil) e "Comprei" compacto (valor e parcelas), com desfazer.
* Sinal ruim: retrato do enxoval e fila de alterações no IndexedDB (`src/storeOffline.ts`), enviada quando a rede volta ("N alterações aguardando conexão"). Compras offline levam a data em que foram registradas, mesmo se sincronizadas outro dia. Sem conexão ao abrir, o app usa o retrato salvo.
* O build gera `store-offline-assets.json` e versiona o service worker pelo hash dos arquivos. A instalação pré-carrega a entrada do app, `App`, `OfflineStore`, `StoreRoute` e suas dependências/CSS. Nenhuma resposta da API é guardada no cache. O modo loja informa quando o retrato e a casca estão prontos; abra-o uma vez com internet antes de ir à loja.
* Wake Lock é solicitada quando o modo loja está visível e liberada ao ocultar/sair, inclusive quando a permissão só responde depois da saída. Se o navegador recusar ou não suportar a API, o modo loja continua funcionando.

## Testes

```bash
npm run test:enxoval-value       # funções puras: parcelas, atalhos, ZIP, URL assinada, fila offline
npm run test:enxoval-value-db    # PostgreSQL real: campos, responsável, presentes, lojas, documentos e lembretes
npx playwright test tests/enxoval-value.spec.ts   # interface em 375 e 1440 px
npm run test:logging            # inclui privacidade dos documentos
npm run documents:check         # somente leitura da configuração/consistência do ambiente
```

O teste `tests/documents-offline.spec.ts` usa o build de produção e um servidor HTTP de fixtures (sem contas reais):

```powershell
npx vite build
node tests/support/store-offline-server.mjs
# Em outro terminal:
$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:4176"
npx playwright test tests/documents-offline.spec.ts
```

Para exercitar o driver S3 sem um bucket real:

```powershell
postman simulation run postman/simulations/documents.sim.yaml --port 4902 --output ndjson --no-history
# Em outro terminal:
$env:DOCUMENTS_S3_SIM_URL="http://127.0.0.1:4902/documents"
npm run test:enxoval-value-db
```

O mock local foi construído para os PUT/GET/DELETE usados por `objectStorage.ts`; a simulação testa HTTP real da aplicação, download assinado, exclusão e falha do armazenamento, sem provisionar infraestrutura. Não comprova um bucket de produção. Contrato da leitura: `postman/contracts/item-receipts.openapi.yaml`.

### Evidências e validação em aparelhos físicos

Em 24/10/2026, passaram OCR real com imagem sintética, persistência/permissões no PostgreSQL, retorno atribuído ao lembrete e revisão do formulário em 320, 375 e 425 px. Abertura offline por service worker, compra, recarga e sincronização foram verificadas em Chromium com perfil Android e WebKit com perfil iPhone. No WebKit foi interrompida a conexão com a origem de teste, devido ao [bug do Playwright com `setOffline`](https://github.com/microsoft/playwright/issues/42775).

**Android e iPhone físicos: pendentes.** Em cada aparelho, registrar modelo, versão do sistema/navegador e resultado:

1. Abrir o modo loja com internet e esperar “Disponível para abrir sem conexão”.
2. Ativar modo avião, fechar e reabrir o app na rota do modo loja.
3. Registrar uma compra com valor/parcelas e conferir que permanece após recarregar.
4. Restaurar a rede e verificar uma única atualização no servidor, com a data original da compra.
5. Alternar aplicativos, bloquear/desbloquear a tela e conferir a liberação/retomada da Wake Lock quando suportada. Conferir uso normal quando a API é recusada.
6. Repetir no navegador e, quando disponível, como app instalado. Verificar também câmera de notas e aviso de pouco armazenamento.
