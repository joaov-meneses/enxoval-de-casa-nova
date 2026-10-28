// semana de compra do item) e a migração que leva as respostas do funil para as colunas.
// Usa um schema descartável. Rodar: npm run test:planning-db
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { strongPassword } from "./strongPassword.mjs";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";

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
const schema = `casamia_planning_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

const profile = (extra = {}) => ({
  moment: "casal",
  moveDate: "2026-12-05",
  moveDateAnswered: true,
  state: "BA",
  city: "salvador",
  housing: "apartamento",
  people: 2,
  rooms: ["cozinha", "quarto"],
  owned: "nada",
  style: "full",
  budget: "lt10",
  worries: [],
  usage: [],
  source: "",
  ...extra,
});

const plan = {
  categories: [
    {
      name: "Quarto",
      items: [
        { name: "Cama (estrutura ou box)", description: "Essencial", priceCategory: 4, priority: "essential", timing: "first_night" },
        { name: "Sachês antimofo para o guarda-roupa", description: "Essencial · Umidade alta aqui: evita mofo nas roupas", priceCategory: 1, priority: "essential", timing: "first_week" },
        { name: "Tapete de quarto", description: "Opcional", priceCategory: 2, priority: "optional", timing: null },
      ],
    },
  ],
};

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
    email: "planejamento@example.invalid",
    password: strongPassword(),
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  // Conta paga: este teste cobre o planejamento, não as travas do plano gratuito (tests/freemium-db.mjs).
  await getPool().query("UPDATE users SET plan = 'monthly' WHERE id = $1", [registered.data.user.id]);

  // 1. O funil leva data, lugar e perfil de gasto para o enxoval, e os dados do catálogo para os itens.
  const funnel = await call("/enxovais", "POST", {
    name: "Casa em Salvador",
    plan,
    profile: profile({ spendingTier: "confortavel" }),
    userName: "Ana",
  });
  assert.equal(funnel.status, 201, JSON.stringify(funnel.data));
  const enxoval = funnel.data.enxoval;
  assert.equal(enxoval.moveDate, "2026-12-05", "a data volta como texto AAAA-MM-DD, sem mudar de dia pelo fuso");
  assert.equal(enxoval.state, "BA");
  assert.equal(enxoval.city, "salvador");
  assert.equal(enxoval.spendingTier, "confortavel");
  const byName = Object.fromEntries(funnel.data.items.map((item) => [item.name, item]));
  assert.deepEqual(
    [byName["Cama (estrutura ou box)"].priceCategory, byName["Cama (estrutura ou box)"].priority, byName["Cama (estrutura ou box)"].timing],
    [4, "essential", "first_night"],
  );
  assert.equal(byName["Sachês antimofo para o guarda-roupa"].timing, "first_week");
  assert.equal(byName["Tapete de quarto"].timing, null);
  assert.equal(byName["Tapete de quarto"].buyWeek, null, "a semana é do algoritmo até a pessoa escolher");
  console.log("PASS: funil grava data, cidade, perfil de gasto e dados do catálogo.");

  // 2. Sem perfil de gasto no pedido, vale o equivalente ao orçamento. Sem data da mudança, a data fica nula.
  const derived = await call("/enxovais", "POST", {
    name: "Orçamento curto",
    plan,
    profile: profile({ moveDate: null, city: null, budget: "gt50" }),
    userName: "Ana",
  });
  assert.equal(derived.status, 201, JSON.stringify(derived.data));
  assert.equal(derived.data.enxoval.spendingTier, "premium");
  assert.equal(derived.data.enxoval.moveDate, null);
  assert.equal(derived.data.enxoval.city, null);
  console.log("PASS: perfil de gasto derivado do orçamento; data e cidade são opcionais.");

  // 3. Respostas inválidas recusam o pedido inteiro, sem criar enxoval pela metade.
  const before = (await query("SELECT count(*)::int AS n FROM enxovais"))[0].n;
  const bad = [
    ["cidade de outro estado", { plan, profile: profile({ state: "SP", city: "salvador" }) }],
    ["cidade desconhecida", { plan, profile: profile({ city: "atlantida" }) }],
    ["perfil de gasto desconhecido", { plan, profile: profile({ spendingTier: "luxo" }) }],
    ["categoria de preço fora de 1 a 4", { plan: { categories: [{ name: "Quarto", items: [{ name: "Cama", description: "", priceCategory: 9 }] }] }, profile: profile() }],
    ["prioridade desconhecida", { plan: { categories: [{ name: "Quarto", items: [{ name: "Cama", description: "", priority: "urgente" }] }] }, profile: profile() }],
    ["prazo desconhecido", { plan: { categories: [{ name: "Quarto", items: [{ name: "Cama", description: "", timing: "amanha" }] }] }, profile: profile() }],
  ];
  for (const [label, body] of bad) {
    const response = await call("/enxovais", "POST", { name: "Inválido", userName: "Ana", ...body });
    assert.equal(response.status, 400, `${label}: ${JSON.stringify(response.data)}`);
  }
  assert.equal((await query("SELECT count(*)::int AS n FROM enxovais"))[0].n, before, "nada ficou pela metade");
  console.log("PASS: cidade, perfil, categoria, prioridade e prazo inválidos são recusados.");

  // 4. Edição do planejamento pelo dono.
  const patch = (body) => call(`/enxovais/${enxoval.id}`, "PATCH", body);
  let updated = await patch({ moveDate: "2027-03-20", spendingTier: "economico" });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.moveDate, "2027-03-20");
  assert.equal(updated.data.spendingTier, "economico");
  assert.equal(updated.data.city, "salvador", "campos não enviados não mudam");

  updated = await patch({ moveDate: null });
  assert.equal(updated.data.moveDate, null, "dá para voltar a 'ainda não sei'");

  for (const moveDate of ["2027-02-31", "20/03/2027", 20270320, "", "2027-13-01"]) {
    assert.equal((await patch({ moveDate })).status, 400, `data ${JSON.stringify(moveDate)}`);
  }
  assert.equal((await patch({ spendingTier: "luxo" })).status, 400);
  assert.equal((await patch({ city: "atlantida" })).status, 400);
  assert.equal((await patch({ state: "bahia" })).status, 400);
  assert.equal((await patch({ city: "sao-paulo" })).status, 400, "a cidade não pode contradizer o estado");

  // Trocar de estado sem informar cidade apaga a cidade antiga; informar as duas juntas vale.
  updated = await patch({ state: "MG" });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.state, "MG");
  assert.equal(updated.data.city, null);
  updated = await patch({ city: "belo-horizonte" });
  assert.equal(updated.data.city, "belo-horizonte");
  updated = await patch({ state: "SP", city: "campinas" });
  assert.deepEqual([updated.data.state, updated.data.city], ["SP", "campinas"]);
  updated = await patch({ city: null });
  assert.equal(updated.data.city, null, "dá para voltar a 'outra cidade'");
  console.log("PASS: dono edita data, perfil, estado e cidade com validação.");

  // 5. Convidado (editor) usa o enxoval, mas não muda o planejamento.
  const ownerCookie = cookie;
  cookie = "";
  const guest = await call("/auth/register", "POST", {
    email: "convidado-planejamento@example.invalid",
    password: strongPassword(),
  });
  assert.equal(guest.status, 201);
  await query(
    "INSERT INTO enxoval_members (enxoval_id, user_id, role) VALUES ($1, $2, 'editor')",
    [enxoval.id, guest.data.user.id],
  );
  assert.equal((await patch({ moveDate: "2027-05-01" })).status, 403);
  assert.equal((await patch({ spendingTier: "premium" })).status, 403);
  assert.equal((await patch({ discountCents: 1000 })).status, 200, "descontos continuam abertos a quem participa");
  cookie = ownerCookie;
  console.log("PASS: convidado não altera o planejamento do dono.");

  // 6. Semana de compra do item: escolha manual, volta ao automático com null, limites.
  const created1 = await call("/items", "POST", {
    enxovalId: enxoval.id,
    categoryName: "Sala de Estar",
    name: "Sofá",
    buyWeek: -6,
  });
  assert.equal(created1.status, 201, JSON.stringify(created1.data));
  assert.equal(created1.data.item.buyWeek, -6);
  const sofaId = created1.data.item.id;

  let item = await call(`/items/${sofaId}`, "PATCH", { buyWeek: 12 });
  assert.equal(item.data.buyWeek, 12);
  item = await call(`/items/${sofaId}`, "PATCH", { buyWeek: 0 });
  assert.equal(item.data.buyWeek, 0, "zero é a semana da mudança, e não 'sem semana'");
  item = await call(`/items/${sofaId}`, "PATCH", { buyWeek: null });
  assert.equal(item.data.buyWeek, null);
  item = await call(`/items/${sofaId}`, "PATCH", { buyWeek: -52 });
  assert.equal(item.data.buyWeek, -52);
  item = await call(`/items/${sofaId}`, "PATCH", { buyWeek: 104 });
  assert.equal(item.data.buyWeek, 104);

  for (const buyWeek of [105, -53, 1.5, "3", true]) {
    const response = await call(`/items/${sofaId}`, "PATCH", { buyWeek });
    assert.equal(response.status, 400, `buyWeek ${JSON.stringify(buyWeek)}`);
  }
  const invalidCreate = await call("/items", "POST", { enxovalId: enxoval.id, categoryName: "Sala de Estar", name: "Mesa", buyWeek: 500 });
  assert.equal(invalidCreate.status, 400);
  assert.equal((await query("SELECT buy_week FROM items WHERE id = $1", [sofaId]))[0].buy_week, 104);

  // Mudar outra coisa do item não apaga a semana escolhida.
  item = await call(`/items/${sofaId}`, "PATCH", { priceCents: 250000 });
  assert.equal(item.data.buyWeek, 104);

  const boot = await call(`/bootstrap`);
  assert.equal(boot.data.activeEnxoval.spendingTier, updated.data.spendingTier);
  assert.equal(boot.data.items.find((entry) => entry.id === sofaId).buyWeek, 104);
  console.log("PASS: semana de compra manual, volta ao automático e limites.");


  const dependencyId = funnel.data.items[0].id;
  const timing = { leadTimeWeeks: 6, researchWeeks: 2, hasTemporarySolution: true, dependsOnItemId: dependencyId };
  item = await call(`/items/${sofaId}`, 'PATCH', timing);
  assert.equal(item.status, 200, JSON.stringify(item.data));
  for (const [key, value] of Object.entries(timing)) assert.equal(item.data[key], value);
  const persisted = await call('/bootstrap');
  for (const [key, value] of Object.entries(timing)) assert.equal(persisted.data.items.find(i => i.id === sofaId)[key], value);
  for (const invalid of [{ leadTimeWeeks: -1 }, { leadTimeWeeks: 53 }, { researchWeeks: 13 }, { researchWeeks: 1.5 }, { leadTimeWeeks: '2' }, { hasTemporarySolution: 1 }, { dependsOnItemId: sofaId }, { dependsOnItemId: randomUUID() }]) {
    assert.equal((await call(`/items/${sofaId}`, 'PATCH', invalid)).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await call(`/items/${dependencyId}`, 'PATCH', { dependsOnItemId: sofaId })).status, 400, 'reject cycles');
  const otherHomeItem = derived.data.items[0].id;
  assert.equal((await call(`/items/${sofaId}`, 'PATCH', { dependsOnItemId: otherHomeItem })).status, 400, 'reject cross-workspace links');
  // Concurrent reverse dependencies must not both succeed.
  await call(`/items/${sofaId}`, 'PATCH', { dependsOnItemId: null });
  const reverse = await Promise.all([
    call(`/items/${sofaId}`, 'PATCH', { dependsOnItemId: dependencyId }),
    call(`/items/${dependencyId}`, 'PATCH', { dependsOnItemId: sofaId })
  ]);
  assert.deepEqual(reverse.map(result => result.status).sort(), [200, 400]);
  await call(`/items/${sofaId}`, 'PATCH', { dependsOnItemId: null });
  await call(`/items/${dependencyId}`, 'PATCH', { dependsOnItemId: null });
  assert.equal((await call(`/items/${sofaId}`, 'PATCH', { leadTimeWeeks: null, researchWeeks: null, hasTemporarySolution: false })).status, 200);
  await assert.rejects(query('UPDATE items SET lead_time_weeks = -1 WHERE id = $1', [sofaId]));
  console.log('PASS: persisted timing, validation, workspace isolation and concurrent cycle rejection.');

  // 7. O banco recusa valores fora do permitido, mesmo sem passar pela API.
  await assert.rejects(query("UPDATE items SET buy_week = 200 WHERE id = $1", [sofaId]));
  await assert.rejects(query("UPDATE items SET price_category = 5 WHERE id = $1", [sofaId]));
  await assert.rejects(query("UPDATE items SET priority = 'x' WHERE id = $1", [sofaId]));
  await assert.rejects(query("UPDATE items SET timing = 'x' WHERE id = $1", [sofaId]));
  await assert.rejects(query("UPDATE enxovais SET spending_tier = 'luxo' WHERE id = $1", [enxoval.id]));
  console.log("PASS: restrições do banco.");

  // 8. Migração: enxovais antigos (só com o perfil em JSON) ganham data, estado e perfil de gasto, uma única vez.
  const legacyId = randomUUID();
  const owner = (await query("SELECT owner_id FROM enxovais WHERE id = $1", [enxoval.id]))[0].owner_id;
  await query("ALTER TABLE enxovais DROP CONSTRAINT enxovais_spending_tier_valid");
  await query("ALTER TABLE enxovais DROP COLUMN move_date, DROP COLUMN state, DROP COLUMN city, DROP COLUMN spending_tier");
  await query(
    "INSERT INTO enxovais (id, name, owner_id, onboarding_profile) VALUES ($1, 'Antigo', $2, $3::jsonb)",
    [legacyId, owner, JSON.stringify({ moveDate: "2026-09-15", state: "RS", budget: "25-50" })],
  );
  const withoutProfile = randomUUID();
  await query("INSERT INTO enxovais (id, name, owner_id) VALUES ($1, 'Sem funil', $2)", [withoutProfile, owner]);
  const noDate = randomUUID();
  await query(
    "INSERT INTO enxovais (id, name, owner_id, onboarding_profile) VALUES ($1, 'Sem data', $2, $3::jsonb)",
    [noDate, owner, JSON.stringify({ moveDate: null, state: "PE", budget: "unknown" })],
  );
  await migrateDatabase();
  const rows = Object.fromEntries(
    (await query("SELECT id, to_char(move_date, 'YYYY-MM-DD') AS move_date, state, city, spending_tier FROM enxovais")).map((row) => [row.id, row]),
  );
  assert.deepEqual(
    [rows[legacyId].move_date, rows[legacyId].state, rows[legacyId].city, rows[legacyId].spending_tier],
    ["2026-09-15", "RS", null, "confortavel"],
  );
  assert.deepEqual([rows[noDate].move_date, rows[noDate].state, rows[noDate].spending_tier], [null, "PE", "equilibrado"]);
  assert.deepEqual([rows[withoutProfile].move_date, rows[withoutProfile].state, rows[withoutProfile].spending_tier], [null, null, "equilibrado"]);

  await query("UPDATE enxovais SET spending_tier = 'premium' WHERE id = $1", [legacyId]);
  await migrateDatabase();
  assert.equal(
    (await query("SELECT spending_tier FROM enxovais WHERE id = $1", [legacyId]))[0].spending_tier,
    "premium",
    "a migração não refaz o preenchimento nas próximas execuções",
  );
  console.log("PASS: migração leva o perfil do funil para as colunas, uma única vez.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
