// Teste de integração com PostgreSQL real: tudo o que o funil /comecar coleta chega ao banco no cadastro.
// Usa um schema descartável e nunca toca em contas existentes. Rodar: npm run test:onboarding-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { emptyAnswers, generatePlan, toPayload } from "../src/onboarding/plan.ts";

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
const schema = `larume_onboarding_test_${randomUUID().replaceAll("-", "")}`;
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
  app.use(express.json({ limit: "1mb" }));
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body) => {
    const response = await fetch(`${base}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const query = async (sql, params = []) =>
    (await getPool().query(sql, params)).rows;

  /** Monta o pedido como o funil monta: plano gerado + todas as respostas. */
  const funnelRequest = (answers, email) => {
    const plan = generatePlan(answers);
    return {
      plan,
      body: {
        name: answers.name.trim(),
        email,
        password: randomBytes(16).toString("base64url"),
        enxovalName: plan.enxovalName,
        plan: toPayload(plan),
        profile: answers,
      },
    };
  };

  /* ------------------------------------------------------------------ 1. caso completo */
  const full = {
    ...emptyAnswers,
    name: "  Jeoston Araújo  ",
    moment: "casal",
    moveDate: "2027-01-12",
    moveDateAnswered: true,
    state: "BA",
    housing: "apartamento",
    people: 3,
    rooms: ["cozinha", "banheiro", "sala", "quarto", "quartoExtra", "servico", "externa"],
    owned: "algumas",
    style: "full",
    budget: "10-25",
    worries: ["waste", "forget"],
    usage: ["buy", "share"],
    source: "instagram",
  };
  const first = funnelRequest(full, "jeo@example.invalid");
  const registered = await post("/auth/register", first.body);
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const userId = registered.data.user.id;

  // usuário
  const [user] = await query("SELECT name, email, password_hash FROM users WHERE id = $1", [userId]);
  assert.equal(user.name, "Jeoston Araújo", "nome completo, sem espaços nas pontas");
  assert.equal(user.email, "jeo@example.invalid");
  assert.ok(user.password_hash && !user.password_hash.includes(first.body.password), "senha só como hash");

  // enxoval e dono
  const enxovais = await query("SELECT id, name, owner_id, discount_cents FROM enxovais WHERE owner_id = $1", [userId]);
  assert.equal(enxovais.length, 1);
  assert.equal(enxovais[0].name, first.plan.enxovalName);
  assert.equal(enxovais[0].discount_cents, 0);
  const members = await query("SELECT user_id, role FROM enxoval_members WHERE enxoval_id = $1", [enxovais[0].id]);
  assert.deepEqual(members.map((m) => [m.user_id, m.role]), [[userId, "owner"]]);

  // ambientes: mesma ordem e nomes do plano
  const categories = await query(
    "SELECT id, name, sort_order FROM categories WHERE enxoval_id = $1 ORDER BY sort_order",
    [enxovais[0].id],
  );
  assert.deepEqual(
    categories.map((c) => c.name),
    first.plan.categories.map((c) => c.name),
  );
  assert.deepEqual(categories.map((c) => c.sort_order), categories.map((_, i) => i));

  // itens: todos, com nome, descrição (essencial/opcional e quantidade) e ordem; nada marcado nem com preço
  let totalItems = 0;
  for (const [index, planCategory] of first.plan.categories.entries()) {
    const rows = await query(
      "SELECT name, description, sort_order, checked, price_cents, link FROM items WHERE category_id = $1 ORDER BY sort_order",
      [categories[index].id],
    );
    assert.equal(rows.length, planCategory.items.length, planCategory.name);
    assert.deepEqual(
      rows.map((r) => [r.name, r.description]),
      planCategory.items.map((i) => [i.name, i.description]),
      `itens de ${planCategory.name}`,
    );
    assert.deepEqual(rows.map((r) => r.sort_order), rows.map((_, i) => i));
    assert.ok(rows.every((r) => r.checked === false && r.price_cents === null && r.link === ""));
    totalItems += rows.length;
  }
  assert.equal(totalItems, first.plan.stats.total);
  assert.ok(totalItems > 100, "plano real tem centenas de itens, não um item de exemplo");
  const [{ count }] = await query("SELECT count(*)::int AS count FROM items WHERE enxoval_id = $1", [enxovais[0].id]);
  assert.equal(count, totalItems, "nenhum item solto, todos ligados ao enxoval");

  // respostas do funil: todas, exceto o nome (que já está em users.name)
  const [{ onboarding_profile: profile }] = await query(
    "SELECT onboarding_profile FROM enxovais WHERE id = $1",
    [enxovais[0].id],
  );
  assert.deepEqual(profile, {
    v: 1,
    moment: "casal",
    moveDate: "2027-01-12",
    moveDateAnswered: true,
    state: "BA",
    housing: "apartamento",
    people: 3,
    rooms: ["cozinha", "banheiro", "sala", "quarto", "quartoExtra", "servico", "externa"],
    owned: "algumas",
    style: "full",
    budget: "10-25",
    worries: ["waste", "forget"],
    usage: ["buy", "share"],
    source: "instagram",
  });

  // a resposta do cadastro já traz o enxoval pronto (e não vaza o perfil)
  assert.equal(registered.data.enxovais.length, 1);
  assert.equal(registered.data.items.length, totalItems);
  assert.deepEqual(registered.data.categories.map((c) => c.name), first.plan.categories.map((c) => c.name));
  assert.ok(!JSON.stringify(registered.data).includes("onboarding_profile"));
  console.log(`PASS: ${totalItems} itens em ${categories.length} ambientes e o perfil completo foram gravados.`);

  /* ------------------------------------------------------------------ 2. outro conjunto de respostas */
  const lean = {
    ...emptyAnswers,
    name: "Ana",
    moment: "solo",
    moveDate: null,
    moveDateAnswered: true,
    state: "RS",
    housing: "studio",
    people: 1,
    rooms: ["banheiro", "sala"],
    owned: "nada",
    style: "min",
    budget: "gt50",
    worries: ["start", "waste", "forget", "budget", "time"],
    usage: ["buy", "spend", "links", "share"],
    source: "",
  };
  const second = funnelRequest(lean, "ana@example.invalid");
  const secondRegistered = await post("/auth/register", second.body);
  assert.equal(secondRegistered.status, 201);
  const [secondEnxoval] = await query(
    "SELECT name, onboarding_profile FROM enxovais WHERE owner_id = $1",
    [secondRegistered.data.user.id],
  );
  assert.equal(secondEnxoval.name, "Casa de Ana");
  assert.deepEqual(secondEnxoval.onboarding_profile, {
    v: 1,
    moment: "solo",
    moveDate: null,
    moveDateAnswered: true,
    state: "RS",
    housing: "studio",
    people: 1,
    rooms: ["banheiro", "sala"],
    owned: "nada",
    style: "min",
    budget: "gt50",
    worries: ["start", "waste", "forget", "budget", "time"],
    usage: ["buy", "spend", "links", "share"],
    source: "",
  });
  const secondCategories = await query(
    "SELECT name FROM categories WHERE enxoval_id = (SELECT id FROM enxovais WHERE owner_id = $1) ORDER BY sort_order",
    [secondRegistered.data.user.id],
  );
  assert.deepEqual(secondCategories.map((c) => c.name), ["Sala e Quarto", "Banheiro"]);
  console.log("PASS: studio, estilo minimalista, sem data e todas as preocupações e usos foram gravados.");

  /* ------------------------------------------------------------------ 3. o servidor exige o funil */
  const snapshot = async () => ({
    users: (await query("SELECT count(*)::int AS n FROM users"))[0].n,
    enxovais: (await query("SELECT count(*)::int AS n FROM enxovais"))[0].n,
    items: (await query("SELECT count(*)::int AS n FROM items"))[0].n,
  });
  const before = await snapshot();
  const valid = (email) => funnelRequest(full, email).body;
  const rejections = [
    ["e-mail repetido", 409, () => valid("jeo@example.invalid")],
    ["cadastro direto, sem o funil", 400, () => ({ name: "Sem Funil", email: "semfunil@example.invalid", password: "senha-segura" })],
    ["sem respostas", 400, () => ({ ...valid("a1@example.invalid"), profile: undefined })],
    ["sem plano", 400, () => ({ ...valid("a2@example.invalid"), plan: undefined })],
    ["sem nome do enxoval", 400, () => ({ ...valid("a3@example.invalid"), enxovalName: undefined })],
    ["plano com nome de ambiente gigante", 400, () => ({
      ...valid("a4@example.invalid"),
      plan: { categories: [{ name: "x".repeat(200), items: [{ name: "Item", description: "" }] }] },
    })],
    ["plano sem itens", 400, () => ({ ...valid("a5@example.invalid"), plan: { categories: [{ name: "Sala", items: [] }] } })],
    ["momento inválido", 400, () => ({ ...valid("a6@example.invalid"), profile: { ...full, moment: "marte" } })],
    ["estado inválido", 400, () => ({ ...valid("a7@example.invalid"), profile: { ...full, state: "ZZ" } })],
    ["data inexistente", 400, () => ({ ...valid("a8@example.invalid"), profile: { ...full, moveDate: "2026-02-31" } })],
    ["espaço inexistente", 400, () => ({ ...valid("a9@example.invalid"), profile: { ...full, rooms: ["cozinha", "quintal-secreto"] } })],
    ["nenhum espaço", 400, () => ({ ...valid("b1@example.invalid"), profile: { ...full, rooms: [] } })],
    ["orçamento ausente", 400, () => ({ ...valid("b2@example.invalid"), profile: { ...full, budget: null } })],
    ["origem com tipo errado", 400, () => ({ ...valid("b3@example.invalid"), profile: { ...full, source: 123 } })],
  ];
  for (const [label, expected, build] of rejections) {
    const result = await post("/auth/register", build());
    assert.equal(result.status, expected, `${label}: ${JSON.stringify(result.data)}`);
  }
  const direct = await post("/auth/register", rejections[1][2]());
  assert.match(direct.data.error, /funil/, "a mensagem manda a pessoa para o funil");
  assert.deepEqual(await snapshot(), before, "nenhum cadastro recusado deixa usuário, enxoval nem itens");
  console.log(`PASS: ${rejections.length} cadastros recusados (sem funil e com respostas ou plano inválidos) não deixam rastro.`);
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
