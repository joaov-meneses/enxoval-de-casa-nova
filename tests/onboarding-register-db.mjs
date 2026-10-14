// Teste de integração com PostgreSQL real: o cadastro cria só a conta, e o funil /comecar monta o
// primeiro enxoval depois, já autenticado, em POST /enxovais. Usa um schema descartável e nunca toca
// em contas existentes. Rodar: npm run test:onboarding-db
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
  // Uma única sessão "atual": cada registro bem-sucedido a troca pela conta recém-criada, e as
  // chamadas seguintes (como criar o enxoval do funil) já saem autenticadas com ela.
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
  const post = (path, body) => call(path, "POST", body);
  const get = (path) => call(path, "GET");
  const query = async (sql, params = []) =>
    (await getPool().query(sql, params)).rows;

  /** Registra a conta (sem plano) e, já autenticado, cria o enxoval do funil (com plano). */
  const registerAndBuildPlan = async (answers, email) => {
    const plan = generatePlan(answers);
    const password = randomBytes(16).toString("base64url");
    // O cadastro não pede o nome: ele vem do funil, junto do plano.
    const registered = await post("/auth/register", { email, password });
    if (registered.status !== 201) return { registered, plan };
    const workspace = await post("/enxovais", {
      name: plan.enxovalName,
      plan: toPayload(plan),
      profile: answers,
      userName: answers.name,
    });
    return { registered, workspace, plan };
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
  const first = await registerAndBuildPlan(full, "jeo@example.invalid");
  assert.equal(first.registered.status, 201, JSON.stringify(first.registered.data));
  assert.equal(first.registered.data.enxovais.length, 0, "o cadastro não cria enxoval nenhum");
  assert.equal(first.registered.data.user.name, "jeo", "sem nome no cadastro, a conta usa o começo do e-mail até o funil");
  assert.equal(first.workspace.status, 201, JSON.stringify(first.workspace.data));
  const userId = first.registered.data.user.id;

  // usuário
  const [user] = await query("SELECT name, email, password_hash FROM users WHERE id = $1", [userId]);
  assert.equal(user.name, "Jeoston Araújo", "nome completo, sem espaços nas pontas");
  assert.equal(user.email, "jeo@example.invalid");
  assert.ok(user.password_hash, "senha só como hash");

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

  // a resposta de POST /enxovais já traz o enxoval pronto (e não vaza o perfil)
  assert.equal(first.workspace.data.items.length, totalItems);
  assert.deepEqual(first.workspace.data.categories.map((c) => c.name), first.plan.categories.map((c) => c.name));
  assert.ok(!JSON.stringify(first.workspace.data).includes("onboarding_profile"));
  // depois de montado o plano, o bootstrap já abre direto nele (sem precisar escolher)
  const afterFirst = await get("/bootstrap");
  assert.equal(afterFirst.data.enxovais.length, 1);
  assert.equal(afterFirst.data.activeEnxoval.id, enxovais[0].id);
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
  const second = await registerAndBuildPlan(lean, "ana@example.invalid");
  assert.equal(second.registered.status, 201);
  assert.equal(second.workspace.status, 201);
  const [secondEnxoval] = await query(
    "SELECT name, onboarding_profile FROM enxovais WHERE owner_id = $1",
    [second.registered.data.user.id],
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
    [second.registered.data.user.id],
  );
  assert.deepEqual(secondCategories.map((c) => c.name), ["Sala e Quarto", "Banheiro"]);
  console.log("PASS: studio, estilo minimalista, sem data e todas as preocupações e usos foram gravados.");

  /* -------------------------------------------------------- 3. cadastro simples, sem plano nenhum */
  const plainPassword = randomBytes(16).toString("base64url");
  const plain = await post("/auth/register", {
    name: "Sem Funil",
    email: "semfunil@example.invalid",
    password: plainPassword,
  });
  assert.equal(plain.status, 201, JSON.stringify(plain.data));
  assert.equal(plain.data.enxovais.length, 0, "cadastro simples não cria nenhum enxoval");
  const plainBootstrap = await get("/bootstrap");
  assert.equal(plainBootstrap.data.enxovais.length, 0, "continua sem enxoval até passar pelo funil");
  const [plainUser] = await query("SELECT id FROM users WHERE email = $1", ["semfunil@example.invalid"]);
  const [{ n: plainEnxovais }] = await query(
    "SELECT count(*)::int AS n FROM enxovais WHERE owner_id = $1",
    [plainUser.id],
  );
  assert.equal(plainEnxovais, 0);
  console.log("PASS: cadastro sem plano cria só a conta, sem nenhum enxoval.");

  /* ------------------------------------------------------------- 4. cadastro recusa e-mail repetido */
  const dupe = await post("/auth/register", { name: "Duplicado", email: "jeo@example.invalid", password: "senha-segura" });
  assert.equal(dupe.status, 409, JSON.stringify(dupe.data));
  const [{ n: jeoAccounts }] = await query("SELECT count(*)::int AS n FROM users WHERE email = $1", ["jeo@example.invalid"]);
  assert.equal(jeoAccounts, 1, "e-mail repetido não duplica a conta");

  /* --------------------------------------------- 5. POST /enxovais exige um plano e respostas válidos */
  // Conta descartável só para ter uma sessão autenticada e testar as rejeições do endpoint.
  const rejectAccount = await post("/auth/register", {
    name: "Rejeicoes",
    email: "rejeicoes@example.invalid",
    password: "senha-segura",
  });
  assert.equal(rejectAccount.status, 201);
  const rejectUserId = rejectAccount.data.user.id;

  const validPlanBody = () => ({
    name: generatePlan(full).enxovalName,
    plan: toPayload(generatePlan(full)),
    profile: full,
  });
  const rejections = [
    ["sem nome do enxoval", () => ({ ...validPlanBody(), name: undefined })],
    ["plano com nome de ambiente gigante", () => ({
      ...validPlanBody(),
      plan: { categories: [{ name: "x".repeat(200), items: [{ name: "Item", description: "" }] }] },
    })],
    ["plano sem itens", () => ({ ...validPlanBody(), plan: { categories: [{ name: "Sala", items: [] }] } })],
    ["sem respostas, com plano", () => ({ ...validPlanBody(), profile: undefined })],
    ["nome de uma letra", () => ({ ...validPlanBody(), userName: "A" })],
    ["nome gigante", () => ({ ...validPlanBody(), userName: "x".repeat(41) })],
    ["momento inválido", () => ({ ...validPlanBody(), profile: { ...full, moment: "marte" } })],
    ["estado inválido", () => ({ ...validPlanBody(), profile: { ...full, state: "ZZ" } })],
    ["data inexistente", () => ({ ...validPlanBody(), profile: { ...full, moveDate: "2026-02-31" } })],
    ["espaço inexistente", () => ({ ...validPlanBody(), profile: { ...full, rooms: ["cozinha", "quintal-secreto"] } })],
    ["nenhum espaço", () => ({ ...validPlanBody(), profile: { ...full, rooms: [] } })],
    ["orçamento ausente", () => ({ ...validPlanBody(), profile: { ...full, budget: null } })],
    ["origem com tipo errado", () => ({ ...validPlanBody(), profile: { ...full, source: 123 } })],
  ];
  for (const [label, build] of rejections) {
    const result = await post("/enxovais", build());
    assert.equal(result.status, 400, `${label}: ${JSON.stringify(result.data)}`);
  }
  const [{ n: rejectedEnxovais }] = await query(
    "SELECT count(*)::int AS n FROM enxovais WHERE owner_id = $1",
    [rejectUserId],
  );
  assert.equal(rejectedEnxovais, 0, "nenhuma das rejeições deixou um enxoval pela metade");
  console.log(`PASS: ${rejections.length} planos recusados em POST /enxovais (plano ou respostas inválidos) não deixam rastro.`);

  // depois de tudo isso, o mesmo usuário ainda consegue montar o plano normalmente
  const finalAttempt = await post("/enxovais", validPlanBody());
  assert.equal(finalAttempt.status, 201, JSON.stringify(finalAttempt.data));
  console.log("PASS: depois das rejeições, um plano válido ainda é aceito na mesma conta.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
