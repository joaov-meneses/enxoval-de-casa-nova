// banco), várias lojas por item, teto mensal e lembretes de garantia. Usa um schema descartável.
//   npm run test:enxoval-value-db
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { strongPassword } from "./strongPassword.mjs";
import express from "express";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL para o teste PostgreSQL.");
const originalUrl = new URL(process.env.DATABASE_URL);
const sslMode = originalUrl.searchParams.get("sslmode");
const ssl = process.env.DATABASE_SSL === "true" || (process.env.DATABASE_SSL !== "false" && ["require", "verify-full"].includes(sslMode));
const control = new pg.Pool({ connectionString: originalUrl.toString(), ssl: ssl ? { rejectUnauthorized: false } : undefined });
const schema = `casamia_value_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  Object.assign(process.env, {
    DATABASE_URL: originalUrl.toString(),
    COOKIE_SECURE: "false",
    EMAIL_VERIFICATION_REQUIRED: "false",
    MAIL_DRIVER: "memory",
    DOCUMENT_STORAGE: "database",
  });
  const { getPool } = await import("../server/database.ts");
  const { migrateDatabase } = await import("../server/migrations.ts");
  const { registerApiRoutes } = await import("../server/routes.ts");
  const { mailOutbox } = await import("../server/mailer.ts");
  const { sendWarrantyReminders } = await import("../server/workers/warrantyReminders.ts");
  const { todayInBrazil } = await import("../server/itemExtras.ts");
  const { addMonths } = await import("../src/planning/installments.ts");
  await migrateDatabase();
  // Migração idempotente: rodar de novo não pode quebrar nem duplicar ofertas.
  await migrateDatabase();

  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const query = async (sql, params = []) => (await getPool().query(sql, params)).rows;

  /** Um "navegador" por pessoa: cada cliente guarda o próprio cookie de sessão. */
  const client = () => {
    let cookie = "";
    const raw = async (path, init = {}) => {
      const response = await fetch(`${base}/api${path}`, { ...init, headers: { Cookie: cookie, ...(init.headers ?? {}) }, redirect: "manual" });
      const setCookie = response.headers.getSetCookie().find((value) => value.startsWith("enxoval_session="));
      if (setCookie) cookie = setCookie.split(";")[0];
      return response;
    };
    const call = async (path, method = "GET", body) => {
      const response = await raw(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : undefined };
    };
    return { raw, call };
  };
  const signUp = async (person, name) => {
    const result = await person.call("/auth/register", "POST", { name, email: `${name.toLowerCase()}-${randomUUID().slice(0, 6)}@example.invalid`, password: strongPassword() });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    await query("UPDATE users SET plan = 'monthly', name = $2 WHERE id = $1", [result.data.user.id, name]);
    return result.data.user.id;
  };

  const owner = client();
  const partner = client();
  const stranger = client();
  const ownerId = await signUp(owner, "Ana");
  const partnerId = await signUp(partner, "Leo");
  await signUp(stranger, "Bia");

  const workspace = await owner.call("/enxovais", "POST", {
    name: "Casa da Ana e do Léo",
    plan: { categories: [{ name: "Cozinha", items: [{ name: "Panela" }] }] },
    profile: { moment: "casal", moveDate: null, moveDateAnswered: true, state: "SP", housing: "apartamento", people: 2, rooms: ["cozinha"], owned: "nada", style: "full", budget: "unknown", worries: [], usage: [], source: "" },
  });
  assert.equal(workspace.status, 201, JSON.stringify(workspace.data));
  const enxovalId = workspace.data.enxoval.id;
  await query("INSERT INTO enxoval_members (enxoval_id, user_id, role) VALUES ($1, $2, 'editor')", [enxovalId, partnerId]);
  const create = async (body) => {
    const result = await owner.call("/items", "POST", { enxovalId, categoryName: "Cozinha", ...body });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.item;
  };
  const patch = (person, id, body) => person.call(`/items/${id}`, "PATCH", body);

  /* ---------------------------------------------------------- 11.1 parcelas */
  const fridge = await create({ name: "Geladeira", priceCents: 3_000_00 });
  assert.equal(fridge.installments, 1);
  assert.deepEqual(fridge.offers, []);
  assert.equal(fridge.documentCount, 0);
  let saved = await patch(owner, fridge.id, { installments: 10, paymentMethod: "credit", installmentCents: 330_00, firstInstallmentOn: "2026-12-01" });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.installments, 10);
  assert.equal(saved.data.paymentMethod, "credit");
  assert.equal(saved.data.installmentCents, 330_00);
  assert.equal(saved.data.firstInstallmentOn, "2026-12-01");
  assert.equal((await patch(owner, fridge.id, { installments: 30 })).status, 400);
  assert.equal((await patch(owner, fridge.id, { paymentMethod: "cheque" })).status, 400);
  assert.equal((await patch(owner, fridge.id, { firstInstallmentOn: "2027-02-31" })).status, 400);
  // Voltar para à vista apaga o valor de parcela com juros.
  saved = await patch(owner, fridge.id, { installments: 1 });
  assert.equal(saved.data.installmentCents, null);
  // Data da compra: gravada ao passar para Comprado, apagada ao voltar; nunca no futuro.
  saved = await patch(owner, fridge.id, { status: "bought" });
  assert.equal(saved.data.purchasedAt, todayInBrazil());
  saved = await patch(owner, fridge.id, { status: "researching" });
  assert.equal(saved.data.purchasedAt, null);
  assert.equal((await patch(owner, fridge.id, { status: "bought", purchasedAt: addMonths(todayInBrazil(), 1) })).status, 400);
  saved = await patch(owner, fridge.id, { status: "bought", purchasedAt: "2026-01-10", warrantyMonths: 12 });
  assert.equal(saved.data.purchasedAt, "2026-01-10");
  assert.equal(saved.data.warrantyUntil, "2027-01-10", "o fim da garantia sai da data da compra");
  saved = await patch(owner, fridge.id, { warrantyUntil: "2027-06-30", storeName: "  Loja   do bairro " });
  assert.equal(saved.data.warrantyUntil, "2027-06-30");
  assert.equal(saved.data.storeName, "Loja do bairro");
  assert.equal((await patch(owner, fridge.id, { warrantyMonths: 0 })).status, 400);
  const budget = await owner.call(`/enxovais/${enxovalId}`, "PATCH", { monthlyBudgetCents: 1_500_00 });
  assert.equal(budget.status, 200, JSON.stringify(budget.data));
  assert.equal(budget.data.monthlyBudgetCents, 1_500_00);
  assert.equal((await partner.call(`/enxovais/${enxovalId}`, "PATCH", { monthlyBudgetCents: 1_00 })).status, 403, "só o dono define o teto");
  assert.equal((await owner.call(`/enxovais/${enxovalId}`, "PATCH", { monthlyBudgetCents: -5 })).status, 400);
  console.log("PASS: parcelas, meio de pagamento, data da compra, garantia e teto mensal validados e gravados.");

  /* ---------------------------------------------------------- 11.2 responsável */
  const pan = await create({ name: "Jogo de panelas" });
  saved = await patch(partner, pan.id, { assigneeId: partnerId });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.assigneeId, partnerId);
  assert.equal((await patch(owner, pan.id, { assigneeId: randomUUID() })).status, 400, "responsável precisa ser do enxoval");
  const members = (await owner.call(`/enxovais/${enxovalId}`)).data.members;
  assert.equal(members.length, 2);
  assert.ok(members.every((member) => "avatarUrl" in member));
  assert.equal((await owner.call(`/enxovais/${enxovalId}/members/${partnerId}`, "DELETE")).status, 204);
  const [released] = await query("SELECT assignee_id FROM items WHERE id = $1", [pan.id]);
  assert.equal(released.assignee_id, null, "quem sai do enxoval deixa de ser responsável");
  await query("INSERT INTO enxoval_members (enxoval_id, user_id, role) VALUES ($1, $2, 'editor')", [enxovalId, partnerId]);
  console.log("PASS: responsável só entre membros e liberado quando a pessoa sai do enxoval.");

  /* ---------------------------------------------------------- 11.3 presentes */
  const glasses = await create({ name: "Jogo de taças", priceCents: 120_00 });
  saved = await patch(owner, glasses.id, { status: "received", giftFrom: "  Tia   Rosa ", giftMessage: "Para brindar a casa nova!" });
  assert.equal(saved.data.giftFrom, "Tia Rosa");
  assert.equal(saved.data.giftMessage, "Para brindar a casa nova!");
  assert.equal(saved.data.thankedAt, null);
  saved = await patch(partner, glasses.id, { thanked: true });
  assert.ok(saved.data.thankedAt, "agradecimento marcado");
  saved = await patch(owner, glasses.id, { thanked: false });
  assert.equal(saved.data.thankedAt, null);
  assert.equal((await patch(owner, glasses.id, { giftFrom: "x".repeat(121) })).status, 400);
  assert.equal((await patch(owner, glasses.id, { thanked: "sim" })).status, 400);
  console.log("PASS: presente com nome e recado, agradecimento marcado e desmarcado.");

  /* ---------------------------------------------------------- 11.5 lojas */
  const airFryer = await create({ name: "Air fryer", priceCents: 500_00 });
  const offerUrl = (letter) => `https://www.loja-${letter}.example.com/air-fryer?utm_source=teste`;
  let offered = await owner.call(`/items/${airFryer.id}/offers`, "POST", { url: offerUrl("a") });
  assert.equal(offered.status, 201, JSON.stringify(offered.data));
  assert.equal(offered.data.offers.length, 1);
  assert.equal(offered.data.offers[0].isPrimary, true, "a primeira loja vira a principal");
  assert.ok(offered.data.priceTracking, "o item passa a acompanhar o preço da principal");
  offered = await partner.call(`/items/${airFryer.id}/offers`, "POST", { url: offerUrl("b") });
  assert.equal(offered.status, 201);
  assert.equal(offered.data.offers.length, 2);
  assert.equal((await owner.call(`/items/${airFryer.id}/offers`, "POST", { url: offerUrl("b") })).status, 409);
  assert.equal((await stranger.call(`/items/${airFryer.id}/offers`, "POST", { url: offerUrl("z") })).status, 404, "quem não é do enxoval não mexe");
  assert.equal((await owner.call(`/items/${airFryer.id}/offers`, "POST", { url: offerUrl("c") })).status, 201);
  // Mesma loja, outro produto: é outra oferta, não sobrescreve a anterior (limite de 3 lojas por item).
  assert.equal((await owner.call(`/items/${airFryer.id}/offers`, "POST", { url: offerUrl("d") })).status, 400, "até 3 lojas por item");
  const second = offered.data.offers.find((offer) => !offer.isPrimary);
  await query("UPDATE tracked_products SET current_price_cents = 389_00, last_scrape_status = 'ok' WHERE url = $1", [second.url]);
  let promoted = await owner.call(`/items/${airFryer.id}/offers/${second.id}`, "PATCH", { isPrimary: true });
  assert.equal(promoted.status, 200, JSON.stringify(promoted.data));
  assert.equal(promoted.data.offers.find((offer) => offer.isPrimary).id, second.id);
  assert.equal(promoted.data.priceCents, 389_00, "o preço do item segue a loja principal");
  assert.equal(promoted.data.link, second.url);
  assert.equal(promoted.data.priceTracking.domain, "loja-b.example.com");
  assert.equal((await owner.call(`/items/${airFryer.id}/offers/${second.id}`, "PATCH", {})).status, 400);
  // Histórico: as outras lojas aparecem como linhas próprias.
  const firstOffer = promoted.data.offers.find((offer) => offer.domain === "loja-a.example.com");
  await query("UPDATE tracked_products SET current_price_cents = 420_00 WHERE url = $1", [firstOffer.url]);
  await query("INSERT INTO product_price_snapshots (id, tracked_product_id, price_cents, in_stock) SELECT $1, id, 420_00, true FROM tracked_products WHERE url = $2", [randomUUID(), firstOffer.url]);
  const history = await owner.call(`/items/${airFryer.id}/price-history`);
  assert.equal(history.status, 200, JSON.stringify(history.data));
  assert.equal(history.data.offers.find((offer) => offer.domain === "loja-a.example.com").points[0].priceCents, 420_00);
  // Trocar o link do item substitui a loja principal (as outras continuam).
  const relinked = await patch(owner, airFryer.id, { link: offerUrl("g"), trackedProductUrl: offerUrl("g") });
  assert.equal(relinked.status, 200, JSON.stringify(relinked.data));
  assert.equal(relinked.data.offers.length, 3);
  assert.equal(relinked.data.offers.find((offer) => offer.isPrimary).domain, "loja-g.example.com");
  assert.ok(!relinked.data.offers.some((offer) => offer.domain === "loja-b.example.com"));
  const primary = relinked.data.offers.find((offer) => offer.isPrimary);
  const unlinked = await owner.call(`/items/${airFryer.id}/offers/${primary.id}`, "DELETE");
  assert.equal(unlinked.status, 200);
  assert.equal(unlinked.data.priceTracking, null, "sem a principal, o item não acompanha preço");
  assert.equal(unlinked.data.offers.length, 2);
  console.log("PASS: até 3 lojas por item, principal espelhada no item, preço seguindo a principal e histórico por loja.");

  /* ---------------------------------------------------------- 11.4 documentos */
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n");
  const upload = (person, id, body, type, name = "nota.pdf", kind = "invoice") =>
    person.raw(`/items/${id}/documents?kind=${kind}&name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": type }, body });
  let response = await upload(owner, fridge.id, pdf, "application/pdf", "Nota da geladeira.pdf");
  assert.equal(response.status, 201, await response.clone().text());
  const uploaded = await response.json();
  assert.equal(uploaded.document.fileName, "Nota da geladeira.pdf");
  assert.equal(uploaded.document.contentType, "application/pdf");
  assert.equal(uploaded.item.documentCount, 1);
  response = await upload(owner, fridge.id, Buffer.from("<html><script>alert(1)</script></html>"), "image/png", "foto.png");
  assert.equal(response.status, 415, "o tipo é conferido pelo conteúdo, não pelo cabeçalho");
  response = await upload(stranger, fridge.id, pdf, "application/pdf");
  assert.equal(response.status, 404);
  const listed = await partner.call(`/items/${fridge.id}/documents`);
  assert.equal(listed.data.documents.length, 1);
  response = await partner.raw(`/documents/${uploaded.document.id}/file`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  assert.equal((await stranger.raw(`/documents/${uploaded.document.id}/file`)).status, 404, "só quem é do enxoval baixa");
  const house = await owner.call(`/enxovais/${enxovalId}/documents`);
  assert.equal(house.data.documents.length, 1);
  assert.equal(house.data.usedBytes, pdf.length);
  response = await owner.raw(`/enxovais/${enxovalId}/documents.zip`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  const zip = Buffer.from(await response.arrayBuffer());
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from("Cozinha/Geladeira - Nota fiscal - Nota da geladeira.pdf")));
  assert.ok(zip.includes(pdf));
  // Cota da conta: passou do limite, o envio é recusado.
  process.env.DOCUMENT_QUOTA_MB = String((pdf.length * 1.5) / 1024 / 1024);
  response = await upload(owner, glasses.id, pdf, "application/pdf");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "DOCUMENT_QUOTA");
  delete process.env.DOCUMENT_QUOTA_MB;
  const deleted = await partner.call(`/documents/${uploaded.document.id}`, "DELETE");
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.documentCount, 0);
  assert.equal((await query("SELECT COUNT(*)::int AS n FROM item_document_blobs"))[0].n, 0);
  // Apagar o item leva os arquivos junto.
  response = await upload(owner, glasses.id, pdf, "application/pdf", "garantia.pdf", "warranty");
  assert.equal(response.status, 201);
  assert.equal((await owner.call(`/items/${glasses.id}`, "DELETE")).status, 204);
  assert.equal((await query("SELECT COUNT(*)::int AS n FROM item_documents"))[0].n, 0);
  assert.equal((await query("SELECT COUNT(*)::int AS n FROM item_document_blobs"))[0].n, 0);
  console.log("PASS: documentos conferidos pelo conteúdo, só para membros, ZIP, cota da conta e exclusão em cascata.");

  /* ---------------------------------------------------------- lembretes de garantia */
  await query("UPDATE items SET warranty_until = $2::date + 7 WHERE id = $1", [fridge.id, todayInBrazil()]);
  await query("UPDATE users SET warranty_reminders = false WHERE id = $1", [partnerId]);
  mailOutbox.length = 0;
  let summary = await sendWarrantyReminders();
  assert.equal(summary.emails, 1, JSON.stringify(summary));
  assert.equal(mailOutbox.length, 1);
  assert.match(mailOutbox[0].subject, /Geladeira vence em 7 dias/);
  const [ownerRow] = await query("SELECT email FROM users WHERE id = $1", [ownerId]);
  assert.equal(mailOutbox[0].to, ownerRow.email, "quem desligou os avisos no perfil não recebe");
  summary = await sendWarrantyReminders();
  assert.equal(summary.emails, 0, "o mesmo aviso não sai duas vezes");
  // Garantia renovada (outra data de fim) volta a ser avisada, respeitando o limite comum de 1 e-mail por dia.
  await query("UPDATE items SET warranty_until = warranty_until - 1 WHERE id = $1", [fridge.id]);
  assert.equal((await sendWarrantyReminders()).emails, 0, "já recebeu e-mail hoje: o aviso espera a próxima rodada");
  assert.equal((await query("SELECT COUNT(*)::int AS n FROM lifecycle_messages WHERE flow_key = 'warranty'"))[0].n, 1);
  await query("UPDATE lifecycle_messages SET sent_at = sent_at - interval '2 days' WHERE flow_key = 'warranty'");
  assert.equal((await sendWarrantyReminders()).emails, 1);
  console.log("PASS: aviso de garantia 7 dias antes, sem repetir e respeitando a preferência do perfil.");

  console.log("PASS: Fase 11 com PostgreSQL real.");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    const { getPool } = await import("../server/database.ts");
    await getPool().end();
  } catch {
    // Sem pool aberto: nada a fechar.
  }
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
