// Teste de integração com PostgreSQL real: itens ligados a links de lojas, histórico de preços, rotina de
// acompanhamento (com avisos por e-mail) e resumo de economia. Usa um schema descartável.
// Rodar: npm run test:price-tracking-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";

process.env.MAIL_DRIVER = "memory";
const { getPool } = await import("../server/database.ts");
const { migrateDatabase } = await import("../server/migrations.ts");
const { registerApiRoutes } = await import("../server/routes.ts");
const { rememberPreview } = await import("../server/services/productScraper.ts");
const { runPriceTracker } = await import("../server/workers/priceTrackerWorker.ts");
const { mailOutbox } = await import("../server/mailer.ts");

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
const schema = `casamia_price_tracking_test_${randomUUID().replaceAll("-", "")}`;
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
  const makeClient = () => {
    let cookie = "";
    return async (path, method = "GET", body) => {
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
  };
  const query = async (sql, params = []) =>
    (await getPool().query(sql, params)).rows;

  const call = makeClient();
  const register = await call("/auth/register", "POST", {
    email: "precos@example.invalid",
    password: randomBytes(16).toString("base64url"),
  });
  assert.equal(register.status, 201, JSON.stringify(register.data));
  // O acompanhamento pressupõe acesso ativo; o bloqueio por assinatura tem testes próprios.
  await query("UPDATE users SET plan = 'monthly', subscription_status = 'active' WHERE id = $1", [register.data.user.id]);
  const workspace = await call("/enxovais", "POST", { name: "Casa de teste", useDefaultTemplate: false });
  assert.equal(workspace.status, 201, JSON.stringify(workspace.data));
  const enxovalId = workspace.data.enxoval.id;

  // --- leitura de links: exige login e recusa endereços internos
  assert.equal((await makeClient()("/products/extract", "POST", { url: "https://loja.com.br/p" })).status, 401);
  const local = await call("/products/extract", "POST", { url: "http://127.0.0.1:3000/api/health" });
  assert.equal(local.status, 400, "endereço local é recusado");
  assert.equal((await call("/products/extract", "POST", {})).status, 400);
  console.log("PASS: /products/extract exige login e recusa endereços internos.");

  // --- criar item a partir do link (a leitura recente do formulário semeia o produto)
  const productUrl = "https://www.loja-teste.com.br/air-fryer-4l";
  rememberPreview({
    url: productUrl,
    domain: "loja-teste.com.br",
    title: "Air Fryer 4L Preta",
    imageUrl: "https://img.loja-teste.com.br/af.jpg",
    priceCents: 40000,
    pixPriceCents: 36000,
    currency: "BRL",
    inStock: true,
  });
  const create = (body) =>
    call("/items", "POST", { enxovalId, categoryName: "Cozinha", ...body });
  const first = await create({
    name: "Air Fryer",
    priceCents: 40000,
    trackedProductUrl: `${productUrl}?utm_source=whatsapp#avaliacoes`,
    initialPriceCents: 40000,
    targetPriceCents: 30000,
    selectedVariation: "220V",
    imageUrl: "https://img.loja-teste.com.br/af.jpg",
  });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const item = first.data.item;
  assert.equal(item.link, `${productUrl}`, "o link do item vira o do produto acompanhado (sem rastreio)");
  assert.equal(item.selectedVariation, "220V");
  assert.ok(!Object.hasOwn(item, "imageUrl"));
  assert.equal(item.priceTracking.initialPriceCents, 40000);
  assert.equal(item.priceTracking.currentPriceCents, 40000);
  assert.equal(item.priceTracking.targetPriceCents, 30000);
  assert.equal(item.priceTracking.priceBasis, "regular");
  assert.equal(item.priceTracking.isLowestIn60d, false, "um único ponto no histórico não é destaque");
  assert.equal((await query("SELECT count(*)::int AS n FROM product_price_snapshots"))[0].n, 1, "produto novo grava o primeiro ponto do histórico");

  const second = await create({ name: "Air Fryer reserva", priceCents: 40000, trackedProductUrl: productUrl });
  assert.equal(second.status, 201);
  assert.equal(second.data.item.priceTracking.initialPriceCents, 40000, "sem preço de referência, usa o preço do item");
  assert.equal((await query("SELECT count(*)::int AS n FROM tracked_products"))[0].n, 1, "o mesmo link não duplica o produto");
  assert.equal((await query("SELECT count(*)::int AS n FROM product_price_snapshots"))[0].n, 1, "produto já existente não grava novo ponto");

  assert.equal((await create({ name: "Sem leitura", trackedProductUrl: "http://10.0.0.1/p" })).status, 400, "link interno não é acompanhado");
  assert.equal((await create({ name: "Alvo ruim", trackedProductUrl: productUrl, targetPriceCents: -1 })).status, 400);
  assert.equal((await create({ name: "Base ruim", priceBasis: "boleto" })).status, 400);
  const manual = await create({ name: "Panela", priceCents: 9000 });
  assert.equal(manual.data.item.priceTracking, null, "item sem link não acompanha preço");
  console.log("PASS: criação de itens a partir do link, sem duplicar produtos e validando os campos.");

  // --- rodada de acompanhamento: preço cai abaixo do alvo e do menor histórico
  const noSleep = async () => undefined;
  let nextPrice = { priceCents: 28000, pixPriceCents: 25000 };
  const scrape = async (url) => ({ url, domain: "loja-teste.com.br", title: "Air Fryer 4L Preta", currency: "BRL", inStock: true, ...nextPrice });
  mailOutbox.length = 0;
  const firstRun = await runPriceTracker({ force: true, sleep: noSleep, scrape });
  assert.deepEqual(
    { checked: firstRun.checked, updated: firstRun.updated, failed: firstRun.failed, alertsSent: firstRun.alertsSent },
    { checked: 1, updated: 1, failed: 0, alertsSent: 1 },
  );
  assert.equal(mailOutbox.length, 1, "um e-mail por pessoa, mesmo com dois itens");
  assert.match(mailOutbox[0].text, /Air Fryer caiu para R\$\s28\d,00/);
  assert.match(mailOutbox[0].text, /Air Fryer reserva/);
  assert.equal(mailOutbox[0].to, "precos@example.invalid");

  const afterDrop = await call(`/enxovais/${enxovalId}`);
  const tracked = afterDrop.data.items.find((entry) => entry.id === item.id);
  assert.equal(tracked.priceTracking.currentPriceCents, 28000);
  assert.equal(tracked.priceTracking.lowestPriceCents60d, 28000);
  assert.equal(tracked.priceTracking.isLowestIn60d, true, "preço caiu e é o menor dos últimos 60 dias");
  assert.equal(tracked.priceTracking.status, "ok");
  assert.equal((await query("SELECT lowest_price_cents, highest_price_cents FROM tracked_products"))[0].lowest_price_cents, 28000);

  // mesma leitura de novo: nem novo ponto no histórico nem novo e-mail
  const repeat = await runPriceTracker({ force: true, sleep: noSleep, scrape });
  assert.equal(repeat.alertsSent, 0, "o mesmo preço não é avisado duas vezes");
  assert.equal((await query("SELECT count(*)::int AS n FROM product_price_snapshots"))[0].n, 2, "preço igual (e recente) não repete o ponto");

  // novo recorde de baixa: avisa de novo
  nextPrice = { priceCents: 26000, pixPriceCents: 24000 };
  const record = await runPriceTracker({ force: true, sleep: noSleep, scrape });
  assert.equal(record.alertsSent, 1);
  assert.equal((await query("SELECT count(*)::int AS n FROM product_price_snapshots"))[0].n, 3);

  // sem --force, produto lido há pouco não é relido
  const idle = await runPriceTracker({ sleep: noSleep, scrape });
  assert.equal(idle.checked, 0, "produto lido há menos de 12 horas não é relido");

  // falha da loja: guarda o motivo, não derruba a rodada nem apaga o preço
  const failing = await runPriceTracker({
    force: true,
    sleep: noSleep,
    scrape: async () => {
      throw new Error("sem conexão");
    },
  });
  assert.equal(failing.failed, 1);
  const [product] = await query("SELECT current_price_cents, last_scrape_status FROM tracked_products");
  assert.deepEqual(product, { current_price_cents: 26000, last_scrape_status: "failed" });
  console.log("PASS: rodada de preços atualiza, avisa uma vez por preço e tolera falhas.");

  // --- itens de produto só são relidos enquanto estão por comprar
  await call(`/items/${item.id}`, "PATCH", { status: "bought" });
  await call(`/items/${second.data.item.id}`, "PATCH", { status: "bought" });
  assert.equal((await runPriceTracker({ force: true, sleep: noSleep, scrape })).checked, 0, "itens comprados deixam de ser acompanhados");
  await call(`/items/${item.id}`, "PATCH", { status: "needed" });
  await call(`/items/${second.data.item.id}`, "PATCH", { status: "needed" });

  // --- histórico e resumo de economia
  const history = await call(`/items/${item.id}/price-history`);
  assert.equal(history.status, 200, JSON.stringify(history.data));
  assert.deepEqual(history.data.points.map((point) => point.priceCents), [40000, 28000, 26000]);
  assert.equal(history.data.points[1].pixPriceCents, 25000);
  assert.equal(history.data.initialPriceCents, 40000);
  assert.equal(history.data.targetPriceCents, 30000);
  assert.equal(history.data.url, productUrl);
  assert.equal((await call(`/items/${manual.data.item.id}/price-history`)).status, 404, "item manual não tem histórico");

  const savings = await call(`/enxovais/${enxovalId}/savings-summary`);
  assert.equal(savings.status, 200);
  assert.deepEqual(savings.data, {
    trackedItemsCount: 2,
    totalInitialCents: 80000,
    totalCurrentCents: 52000,
    totalSavingsCents: 28000,
    totalIncreaseCents: 0,
    itemsWithDropsCount: 2,
    itemsAtLowestPriceCount: 2,
  });
  console.log("PASS: histórico de preços e resumo de economia.");

  // --- editar o acompanhamento
  const pix = await call(`/items/${item.id}`, "PATCH", { priceBasis: "pix", initialPriceCents: 36000, targetPriceCents: null, priceAlertEnabled: false });
  assert.equal(pix.status, 200, JSON.stringify(pix.data));
  assert.equal(pix.data.priceTracking.priceBasis, "pix");
  assert.equal(pix.data.priceTracking.currentPriceCents, 24000, "acompanhando o Pix, compara com o preço no Pix");
  assert.equal(pix.data.priceTracking.priceAlertEnabled, false);
  assert.equal(pix.data.priceTracking.targetPriceCents, null);
  const unlinked = await call(`/items/${second.data.item.id}`, "PATCH", { trackedProductUrl: null });
  assert.equal(unlinked.data.priceTracking, null, "desligar o acompanhamento mantém o item");
  assert.equal((await call(`/items/${item.id}`, "PATCH", { targetPriceCents: 1.5 })).status, 400);
  console.log("PASS: edição do acompanhamento (Pix, aviso, alvo e desligar).");

  // --- outra pessoa não vê o histórico nem o resumo
  const stranger = makeClient();
  const strangerAccount = await stranger("/auth/register", "POST", { email: "outra@example.invalid", password: randomBytes(16).toString("base64url") });
  assert.equal(strangerAccount.status, 201, JSON.stringify(strangerAccount.data));
  await query("UPDATE users SET plan = 'monthly', subscription_status = 'active' WHERE id = $1", [strangerAccount.data.user.id]);
  assert.equal((await stranger(`/items/${item.id}/price-history`)).status, 404);
  assert.equal((await stranger(`/enxovais/${enxovalId}/savings-summary`)).status, 404);
  console.log("PASS: histórico e resumo só aparecem para quem participa do enxoval.");

  // --- migração repetida não mexe nos dados de preço
  await query("UPDATE items SET initial_price_cents = 123 WHERE id = $1", [manual.data.item.id]);
  await migrateDatabase();
  assert.equal((await query("SELECT initial_price_cents FROM items WHERE id = $1", [manual.data.item.id]))[0].initial_price_cents, 123);
  console.log("PASS: migração é idempotente.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
