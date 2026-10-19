// Integração PostgreSQL: trial sem limites, bloqueio de acesso herdado do titular e fundadores preservados.
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

  // Sem plano ativo, a conta existe, mas não acessa o produto.
  const owner = person();
  const ownerUser = await register(owner, "dona@example.invalid");
  assert.equal(ownerUser.plan, 'free');
  expectLimit(await owner('/enxovais', 'POST', {name: 'Bloqueado'}), 'SUBSCRIPTION_REQUIRED', 'sem cartão');
  await query("UPDATE users SET plan = 'monthly', subscription_status = 'trialing', trial_used = true, trial_started_at = now(), trial_ends_at = now() + interval '48 hours' WHERE id = $1", [ownerUser.id]);
  const created1 = await owner('/enxovais', 'POST', {name: 'Casa', useDefaultTemplate: true});
  assert.equal(created1.status, 201, JSON.stringify(created1.data));
  const enxovalId = created1.data.enxoval.id;
  assert.ok(created1.data.categories.length > 2, 'trial não corta o modelo');
  assert.equal((await owner('/enxovais', 'POST', {name: 'Praia', useDefaultTemplate: false})).status, 201);
  const categoryId = created1.data.categories[0].id;
  for (let n = 0; n < 11; n++) assert.equal((await owner('/items', 'POST', {enxovalId, categoryId, name: `Item extra ${n}`})).status, 201);

  // A assinatura do convidado não substitui a do titular do enxoval.
  const editor = person();
  const editorUser = await register(editor, 'editor@example.invalid');
  await query("UPDATE users SET plan = 'monthly', subscription_status = 'active' WHERE id = $1", [editorUser.id]);
  await query("INSERT INTO enxoval_members (enxoval_id, user_id, role) VALUES ($1, $2, 'editor')", [enxovalId, editorUser.id]);
  assert.equal((await editor(`/enxovais/${enxovalId}`)).status, 200);
  await query("UPDATE users SET subscription_cancel_at_period_end = true WHERE id = $1", [ownerUser.id]);
  expectLimit(await editor(`/enxovais/${enxovalId}`), 'SUBSCRIPTION_REQUIRED', 'cancelamento agendado bloqueia convidado');
  await query("UPDATE users SET subscription_cancel_at_period_end = false, trial_ends_at = now() - interval '1 second' WHERE id = $1", [ownerUser.id]);
  expectLimit(await owner(`/enxovais/${enxovalId}`), 'SUBSCRIPTION_REQUIRED', '48 horas encerradas');
  expectLimit(await editor('/categories', 'POST', {enxovalId, name: 'Varanda'}), 'SUBSCRIPTION_REQUIRED', 'convidado sem acesso após expiração');
  await query("UPDATE users SET subscription_status = 'active' WHERE id = $1", [ownerUser.id]);
  assert.equal((await editor('/categories', 'POST', {enxovalId, name: 'Varanda'})).status, 201);

  // O onboarding mantém todos os ambientes e itens durante o trial.
  const answers = {...emptyAnswers, name: 'Funil', moment: 'casal', moveDate: '2027-01-12', moveDateAnswered: true,
    state: 'BA', housing: 'apartamento', people: 3, rooms: ['cozinha','banheiro','sala','quarto','servico'],
    owned: 'algumas', style: 'full', budget: '10-25', worries: ['waste'], usage: ['buy'], source: 'instagram'};
  const plan = generatePlan(answers);
  const funnel = person();
  const funnelUser = await register(funnel, 'funil@example.invalid');
  await query("UPDATE users SET plan = 'monthly', subscription_status = 'trialing', trial_ends_at = now() + interval '48 hours' WHERE id = $1", [funnelUser.id]);
  const fromPlan = await funnel('/enxovais', 'POST', {name: plan.enxovalName, plan: toPayload(plan), profile: answers, userName: 'Funil'});
  assert.equal(fromPlan.status, 201, JSON.stringify(fromPlan.data));
  assert.deepEqual(fromPlan.data.categories.map(c => c.name), plan.categories.map(c => c.name));
  assert.equal(fromPlan.data.items.length, plan.categories.reduce((total, c) => total + c.items.length, 0));

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

  console.log("PASS: trial sem limites, bloqueio após cancelamento/expiração, convidados herdam acesso e contas fundadoras preservadas.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
