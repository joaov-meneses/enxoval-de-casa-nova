// Teste de integração com PostgreSQL real: situação do item (preciso, ganhei, comprei...), compatibilidade com o
// marcador antigo `checked` e backfill da migração. Usa um schema descartável. Rodar: npm run test:item-status-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import {
  ITEM_STATUSES,
  isDoneStatus,
  sumBought,
  sumItemDiscounts,
  sumPending,
  sumReceived,
} from "../src/itemStatus.ts";

if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL para o teste PostgreSQL.");
const originalUrl = new URL(process.env.DATABASE_URL);
const sslMode = originalUrl.searchParams.get("sslmode");
const ssl =
  process.env.DATABASE_SSL === "true" ||
  (process.env.DATABASE_SSL !== "false" &&
    ["require", "verify-full"].includes(sslMode));
const control = new pg.Pool({
  connectionString: originalUrl.toString(),
  ssl: ssl ? { rejectUnauthorized: false } : undefined,
});
const schema = `larume_item_status_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  process.env.COOKIE_SECURE = "false";
  await migrateDatabase();

  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (path, method = "GET", body) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("enxoval_session="));
    if (setCookie) cookie = setCookie.split(";")[0];
    return {
      status: response.status,
      data: response.status === 204 ? undefined : await response.json(),
    };
  };
  const query = async (sql, params = []) =>
    (await getPool().query(sql, params)).rows;

  const registered = await call("/auth/register", "POST", {
    name: "Cliente Situação",
    email: "situacao@example.invalid",
    password: randomBytes(16).toString("base64url"),
    enxovalName: "Casa de teste",
    plan: {
      categories: [
        { name: "Cozinha", items: [{ name: "Panela", description: "Essencial · 4 un." }] },
      ],
    },
    profile: {
      moment: "casal",
      moveDate: null,
      moveDateAnswered: true,
      state: "SP",
      housing: "apartamento",
      people: 2,
      rooms: ["cozinha"],
      owned: "nada",
      style: "full",
      budget: "unknown",
      worries: [],
      usage: [],
      source: "",
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const enxovalId = registered.data.activeEnxoval.id;
  const [seeded] = registered.data.items;
  assert.equal(seeded.status, "needed", "itens do plano começam como 'Preciso comprar'");
  assert.equal(seeded.checked, false);
  assert.equal(seeded.quantity, 4, "o funil grava a quantidade citada na descrição (4 un.)");

  const create = (body) =>
    call("/items", "POST", { enxovalId, categoryName: "Cozinha", ...body });

  // criar já com situação: "Ganhei" conta como conquistado e entra marcado
  const gift = await create({ name: "Jogo de taças", priceCents: 12000, status: "received" });
  assert.equal(gift.status, 201, JSON.stringify(gift.data));
  assert.equal(gift.data.item.status, "received");
  assert.equal(gift.data.item.checked, true);
  const plain = await create({ name: "Escorredor" });
  assert.equal(plain.data.item.status, "needed", "sem situação informada o padrão é 'Preciso comprar'");
  assert.equal(plain.data.item.checked, false);
  assert.equal((await create({ name: "Inválido", status: "inexistente" })).status, 400);
  console.log("PASS: criação com situação e padrão 'Preciso comprar'.");

  // todas as situações podem ser gravadas e mantêm `checked` coerente
  for (const status of ITEM_STATUSES) {
    const updated = await call(`/items/${plain.data.item.id}`, "PATCH", { status });
    assert.equal(updated.status, 200, `${status}: ${JSON.stringify(updated.data)}`);
    assert.equal(updated.data.status, status);
    assert.equal(updated.data.checked, isDoneStatus(status), `checked coerente em ${status}`);
  }
  assert.equal(
    (await call(`/items/${plain.data.item.id}`, "PATCH", { status: "foo" })).status,
    400,
  );
  const [row] = await query("SELECT status, checked FROM items WHERE id = $1", [plain.data.item.id]);
  assert.deepEqual(row, { status: "discarded", checked: false });
  console.log("PASS: as 7 situações gravam e mantêm `checked` coerente; situação inválida é recusada.");

  // marcador antigo `checked` continua funcionando sem estragar situações já concluídas
  const toggle = (checked) => call(`/items/${gift.data.item.id}`, "PATCH", { checked });
  assert.equal((await toggle(true)).data.status, "received", "marcar não troca 'Ganhei' por 'Comprei'");
  const unchecked = await toggle(false);
  assert.equal(unchecked.data.status, "needed", "desmarcar volta para 'Preciso comprar'");
  assert.equal(unchecked.data.checked, false);
  const rechecked = await toggle(true);
  assert.equal(rechecked.data.status, "bought", "marcar um item pendente vira 'Comprei'");
  assert.equal(rechecked.data.checked, true);
  await call(`/items/${gift.data.item.id}`, "PATCH", { status: "not_needed" });
  assert.equal((await toggle(false)).data.status, "not_needed", "desmarcar não reativa item fora da lista");
  console.log("PASS: compatibilidade com o marcador `checked`.");

  // totais: ganhos não entram em "Já investimos"
  await call(`/items/${gift.data.item.id}`, "PATCH", { status: "received", priceCents: 12000 });
  const bought = await create({ name: "Panela de pressão", priceCents: 30000, status: "bought" });
  await create({ name: "Frigideira", priceCents: 8000 });
  await create({ name: "Peneira", priceCents: 2000, status: "researching" });
  await create({ name: "Item descartado", priceCents: 99900, status: "discarded" });
  const workspace = await call(`/enxovais/${enxovalId}`);
  assert.equal(workspace.status, 200);
  const items = workspace.data.items;
  assert.ok(items.every((i) => ITEM_STATUSES.includes(i.status) && typeof i.checked === "boolean"));
  assert.equal(sumBought(items), 30000, "só 'Comprei' conta como investido");
  assert.equal(sumReceived(items), 12000, "'Ganhei' vira ganho, não investimento");
  assert.equal(sumPending(items), 10000, "pendentes: Preciso comprar + Pesquisando (descartado não conta)");
  assert.ok(bought.data.item.checked);
  console.log("PASS: totais separam investido, ganho e pendente.");

  // desconto/cashback por item: abate do preço, vai para o resumo e fica gravado no item
  const blender = await create({ name: "Liquidificador", priceCents: 20000, discountCents: 5000, status: "bought" });
  assert.equal(blender.status, 201, JSON.stringify(blender.data));
  assert.equal(blender.data.item.discountCents, 5000, "desconto gravado no item");
  const planned = await create({ name: "Air fryer", priceCents: 40000, discountCents: 10000 });
  assert.equal(planned.data.item.discountCents, 10000, "desconto previsto em item ainda a comprar");
  const wonWithDiscount = await create({ name: "Jarra", priceCents: 9000, discountCents: 3000, status: "received" });
  assert.equal(wonWithDiscount.data.item.discountCents, 0, "item ganho nunca guarda desconto: o valor cheio vai para o resumo");
  assert.equal((await create({ name: "Maior que o preço", priceCents: 1000, discountCents: 1001 })).status, 400);
  assert.equal((await create({ name: "Sem preço", discountCents: 100 })).status, 400);
  assert.equal((await create({ name: "Negativo", priceCents: 1000, discountCents: -1 })).status, 400);
  assert.equal((await create({ name: "Fracionado", priceCents: 1000, discountCents: 1.5 })).status, 400);

  const afterDiscounts = (await call(`/enxovais/${enxovalId}`)).data.items;
  assert.equal(sumBought(afterDiscounts), 30000 + (20000 - 5000), "investido = preço - desconto dos comprados");
  assert.equal(sumItemDiscounts(afterDiscounts), 5000 + 10000, "resumo: descontos dos itens comprados e a comprar");
  assert.equal(sumReceived(afterDiscounts), 12000 + 9000, "ganhos entram com o valor cheio");
  assert.equal(sumPending(afterDiscounts), 10000 + (40000 - 10000), "pendentes já com o desconto previsto");

  // editar: o desconto acompanha situação e preço
  const air = planned.data.item.id;
  const reduced = await call(`/items/${air}`, "PATCH", { discountCents: 12000 });
  assert.equal(reduced.data.discountCents, 12000);
  assert.equal((await call(`/items/${air}`, "PATCH", { priceCents: 11000 })).status, 400, "baixar o preço abaixo do desconto é recusado");
  const gifted = await call(`/items/${air}`, "PATCH", { status: "received" });
  assert.equal(gifted.data.discountCents, 0, "virar 'Ganhei' zera o desconto");
  assert.equal((await call(`/items/${air}`, "PATCH", { status: "needed" })).data.discountCents, 0, "voltar não ressuscita o desconto");
  assert.equal((await call(`/items/${air}`, "PATCH", { discountCents: 5000, status: "received" })).data.discountCents, 0, "desconto enviado junto com 'Ganhei' é ignorado");
  const [persisted] = await query("SELECT discount_cents FROM items WHERE id = $1", [air]);
  assert.equal(persisted.discount_cents, 0);
  assert.equal((await call(`/items/${blender.data.item.id}`, "PATCH", { checked: false })).data.discountCents, 5000, "desmarcar compra mantém o desconto previsto");
  console.log("PASS: desconto por item: gravado, validado, zerado para itens ganhos e somado no resumo.");

  // quantidade: só informa quantas unidades há; o preço do item continua sendo o valor dele
  const beforeQuantity = (await call(`/enxovais/${enxovalId}`)).data.items;
  const towels = await create({ name: "Toalhas de banho", priceCents: 5000, quantity: 4, status: "bought", discountCents: 3000 });
  assert.equal(towels.status, 201, JSON.stringify(towels.data));
  assert.equal(towels.data.item.quantity, 4);
  assert.equal((await create({ name: "Sem quantidade" })).data.item.quantity, 1, "padrão é 1 unidade");
  for (const quantity of [0, -2, 1000, 1.5, "3"]) {
    assert.equal((await create({ name: "Quantidade ruim", quantity })).status, 400, `quantidade ${quantity} recusada`);
  }
  assert.equal((await create({ name: "Desconto acima do preço", priceCents: 5000, quantity: 2, discountCents: 5001 })).status, 400, "a quantidade não amplia o limite do desconto: ele não passa do preço");
  const withQuantity = (await call(`/enxovais/${enxovalId}`)).data.items;
  assert.equal(sumBought(withQuantity) - sumBought(beforeQuantity), 5000 - 3000, "investido = preço - desconto, sem multiplicar pela quantidade");
  assert.equal(sumItemDiscounts(withQuantity) - sumItemDiscounts(beforeQuantity), 3000);
  const towelId = towels.data.item.id;
  const fewerTowels = await call(`/items/${towelId}`, "PATCH", { quantity: 1 });
  assert.equal(fewerTowels.status, 200, "mudar a quantidade nunca é bloqueado pelo desconto");
  const moreTowels = await call(`/items/${towelId}`, "PATCH", { quantity: 6 });
  assert.equal(moreTowels.data.quantity, 6);
  assert.equal(moreTowels.data.discountCents, 3000, "mudar a quantidade não mexe no desconto");
  assert.equal(moreTowels.data.priceCents, 5000, "nem no preço");
  const afterQuantity = (await call(`/enxovais/${enxovalId}`)).data.items;
  assert.equal(sumBought(afterQuantity), sumBought(withQuantity), "os totais não dependem da quantidade");
  assert.equal((await call(`/items/${towelId}`, "PATCH", { quantity: 0 })).status, 400);
  assert.equal((await call(`/items/${towelId}`, "PATCH", { checked: false })).data.quantity, 6, "marcar/desmarcar não mexe na quantidade");
  console.log("PASS: quantidade validada e informativa: não altera preço, desconto nem totais.");

  // migração: item antigo marcado (checked = true, status padrão) vira 'Comprei' e a migração é idempotente
  const legacyId = randomUUID();
  const [{ id: userId }] = await query("SELECT id FROM users LIMIT 1");
  const [{ id: categoryId }] = await query("SELECT id FROM categories WHERE enxoval_id = $1 LIMIT 1", [enxovalId]);
  await query(
    "INSERT INTO items (id, user_id, enxoval_id, category_id, name, checked) VALUES ($1, $2, $3, $4, 'Item antigo', true)",
    [legacyId, userId, enxovalId, categoryId],
  );
  await migrateDatabase();
  await migrateDatabase();
  const [legacy] = await query("SELECT status, checked FROM items WHERE id = $1", [legacyId]);
  assert.deepEqual(legacy, { status: "bought", checked: true });
  const [kept] = await query("SELECT status FROM items WHERE id = $1", [gift.data.item.id]);
  assert.equal(kept.status, "received", "migração não mexe em situações já definidas");
  await assert.rejects(
    query("UPDATE items SET status = 'qualquer' WHERE id = $1", [legacyId]),
    /items_status_valid/,
  );
  await assert.rejects(
    query("UPDATE items SET quantity = 0 WHERE id = $1", [legacyId]),
    /items_quantity_valid/,
  );

  // migração da quantidade: roda uma vez e lê "N un." das descrições do funil
  await query("ALTER TABLE items DROP COLUMN quantity");
  const withDescription = async (description) => {
    const itemId = randomUUID();
    await query(
      "INSERT INTO items (id, user_id, enxoval_id, category_id, name, description) VALUES ($1, $2, $3, $4, 'Antigo', $5)",
      [itemId, userId, enxovalId, categoryId, description],
    );
    return itemId;
  };
  const fourId = await withDescription("Essencial · 4 un.");
  const twelveId = await withDescription("Opcional · 12 un.");
  const noneId = await withDescription("Opcional");
  const hugeId = await withDescription("Opcional · 1234 un.");
  await migrateDatabase();
  const quantityOf = async (itemId) => (await query("SELECT quantity FROM items WHERE id = $1", [itemId]))[0].quantity;
  assert.deepEqual(
    [await quantityOf(fourId), await quantityOf(twelveId), await quantityOf(noneId), await quantityOf(hugeId)],
    [4, 12, 1, 1],
    "descrições com N un. viram quantidade; sem número ou fora do limite ficam em 1",
  );
  await query("UPDATE items SET quantity = 2 WHERE id = $1", [fourId]);
  await migrateDatabase();
  assert.equal(await quantityOf(fourId), 2, "a migração não refaz a leitura da descrição nas próximas execuções");
  console.log("PASS: migração converte `checked` em situação, é idempotente e o banco recusa valores inválidos.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
