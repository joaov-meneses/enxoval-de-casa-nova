// Teste de integração com PostgreSQL real: travas do plano gratuito (1 enxoval, 2 ambientes, 5 itens por
// ambiente), corte do conteúdo inicial, limites herdados do dono e contas antigas viram fundadoras.
// Usa um schema descartável. Rodar: npm run test:freemium-db
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
const schema = `casamia_freemium_test_${randomUUID().replaceAll("-", "")}`;
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
  const query = async (sql, params = []) =>
    (await getPool().query(sql, params)).rows;

  /** Cada pessoa tem a própria sessão. */
  const person = () => {
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
  const register = async (call, email) => {
    const result = await call("/auth/register", "POST", { email, password: randomBytes(16).toString("base64url") });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.user;
  };
  const expectLimit = (result, code, label) => {
    assert.equal(result.status, 403, `${label}: ${JSON.stringify(result.data)}`);
    assert.equal(result.data.code, code, label);
    assert.ok(result.data.error, `${label}: a recusa explica o motivo`);
  };

  // Conta nova nasce no plano gratuito.
  const owner = person();
  const ownerUser = await register(owner, "dona@example.invalid");
  assert.equal(ownerUser.plan, "free", "conta nova nasce no plano gratuito");

  // O modelo padrão entra cortado: os 2 primeiros ambientes, com até 5 itens cada.
  const created1 = await owner("/enxovais", "POST", { name: "Casa", useDefaultTemplate: true });
  assert.equal(created1.status, 201, JSON.stringify(created1.data));
  const enxovalId = created1.data.enxoval.id;
  assert.equal(created1.data.categories.length, 2, "o modelo padrão entra com 2 ambientes");
  for (const category of created1.data.categories) {
    const count = created1.data.items.filter((item) => item.categoryId === category.id).length;
    assert.ok(count <= 5, `${category.name}: ${count} itens, acima do limite`);
  }

  // Segundo enxoval é recusado.
  expectLimit(await owner("/enxovais", "POST", { name: "Casa de praia", useDefaultTemplate: false }), "LIMIT_REACHED_ENXOVAIS", "segundo enxoval");

  // Terceiro ambiente é recusado; repetir o nome de um ambiente existente não conta como novo.
  const [first, second] = created1.data.categories;
  expectLimit(await owner("/categories", "POST", { enxovalId, name: "Varanda" }), "LIMIT_REACHED_ENVIRONMENTS", "terceiro ambiente");
  const same = await owner("/categories", "POST", { enxovalId, name: first.name });
  assert.equal(same.status, 201, "ambiente já existente continua acessível");
  assert.equal(same.data.id, first.id);
  expectLimit(
    await owner("/items", "POST", { enxovalId, name: "Rede", categoryName: "Varanda" }),
    "LIMIT_REACHED_ENVIRONMENTS",
    "item que criaria um ambiente novo",
  );

  // Enche o primeiro ambiente até 5 e esvazia o segundo.
  const itemsIn = async (categoryId) =>
    (await query("SELECT id FROM items WHERE category_id = $1 ORDER BY sort_order", [categoryId])).map((row) => row.id);
  await query("DELETE FROM items WHERE category_id = $1", [second.id]);
  while ((await itemsIn(first.id)).length < 5) {
    const added = await owner("/items", "POST", { enxovalId, name: `Item ${randomUUID().slice(0, 6)}`, categoryId: first.id });
    assert.equal(added.status, 201, JSON.stringify(added.data));
  }
  expectLimit(await owner("/items", "POST", { enxovalId, name: "Sexto", categoryId: first.id }), "LIMIT_REACHED_ITEMS", "sexto item");

  // Mover um item para o ambiente cheio também é recusado; editar sem mudar de ambiente segue livre.
  const loose = await owner("/items", "POST", { enxovalId, name: "Solto", categoryId: second.id });
  assert.equal(loose.status, 201, JSON.stringify(loose.data));
  const looseId = loose.data.item.id;
  expectLimit(await owner(`/items/${looseId}`, "PATCH", { categoryId: first.id }), "LIMIT_REACHED_ITEMS", "mover para ambiente cheio");
  assert.equal((await owner(`/items/${looseId}`, "PATCH", { categoryId: second.id, name: "Solto 2" })).status, 200, "mesmo ambiente não conta");

  // Remover um item libera a vaga.
  const [firstItem] = await itemsIn(first.id);
  assert.equal((await owner(`/items/${firstItem}`, "DELETE")).status, 204);
  assert.equal((await owner(`/items/${looseId}`, "PATCH", { categoryId: first.id })).status, 200, "vaga liberada aceita o item movido");

  // Quem é convidado herda os limites de quem é dono do enxoval.
  const editor = person();
  const editorUser = await register(editor, "editor@example.invalid");
  await query("UPDATE users SET plan = 'annual' WHERE id = $1", [editorUser.id]);
  await query("INSERT INTO enxoval_members (enxoval_id, user_id, role) VALUES ($1, $2, 'editor')", [enxovalId, editorUser.id]);
  expectLimit(await editor("/categories", "POST", { enxovalId, name: "Varanda" }), "LIMIT_REACHED_ENVIRONMENTS", "convidado com plano pago no enxoval de conta gratuita");

  // Plano pago libera tudo.
  await query("UPDATE users SET plan = 'monthly' WHERE id = $1", [ownerUser.id]);
  assert.equal((await owner("/categories", "POST", { enxovalId, name: "Varanda" })).status, 201, "plano pago cria o terceiro ambiente");
  assert.equal((await owner("/items", "POST", { enxovalId, name: "Sexto", categoryId: first.id })).status, 201, "plano pago cria o sexto item");
  assert.equal((await owner("/enxovais", "POST", { name: "Casa de praia", useDefaultTemplate: false })).status, 201, "plano pago cria outro enxoval");

  // O plano do funil entra cortado para a conta gratuita.
  const answers = {
    ...emptyAnswers,
    name: "Funil",
    moment: "casal",
    moveDate: "2027-01-12",
    moveDateAnswered: true,
    state: "BA",
    housing: "apartamento",
    people: 3,
    rooms: ["cozinha", "banheiro", "sala", "quarto", "servico"],
    owned: "algumas",
    style: "full",
    budget: "10-25",
    worries: ["waste"],
    usage: ["buy"],
    source: "instagram",
  };
  const plan = generatePlan(answers);
  assert.ok(plan.categories.length > 2, "o plano de teste precisa passar do limite");
  const funnel = person();
  await register(funnel, "funil@example.invalid");
  const fromPlan = await funnel("/enxovais", "POST", { name: plan.enxovalName, plan: toPayload(plan), profile: answers, userName: "Funil" });
  assert.equal(fromPlan.status, 201, JSON.stringify(fromPlan.data));
  assert.deepEqual(
    fromPlan.data.categories.map((category) => category.name),
    plan.categories.slice(0, 2).map((category) => category.name),
    "entram os 2 primeiros ambientes do plano",
  );
  for (const category of fromPlan.data.categories) {
    const names = fromPlan.data.items.filter((item) => item.categoryId === category.id).map((item) => item.name);
    const expected = plan.categories.find((planned) => planned.name === category.name).items.slice(0, 5).map((item) => item.name);
    assert.deepEqual(names, expected, `${category.name}: entram os 5 primeiros itens`);
  }

  // Contas que já existiam antes do freemium viram fundadoras uma única vez; as novas continuam gratuitas.
  await query("ALTER TABLE users DROP COLUMN plan");
  await migrateDatabase();
  const plans = await query("SELECT DISTINCT plan FROM users");
  assert.deepEqual(plans.map((row) => row.plan), ["founder"], "contas existentes viram fundadoras");
  const late = person();
  assert.equal((await register(late, "depois@example.invalid")).plan, "free", "conta criada depois da migração nasce gratuita");
  await migrateDatabase();
  assert.equal((await query("SELECT plan FROM users WHERE email = 'depois@example.invalid'"))[0].plan, "free", "a migração não refaz a promoção");
  await assert.rejects(query("UPDATE users SET plan = 'vip'"), /users_plan_valid/, "o banco recusa planos desconhecidos");

  console.log("PASS: plano gratuito limita enxovais, ambientes e itens; conteúdo inicial entra cortado; contas antigas viram fundadoras.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
