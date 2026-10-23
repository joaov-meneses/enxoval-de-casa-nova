// Teste de integração com PostgreSQL real (Fase 7): origem e consentimentos gravados no cadastro, motor de ciclo de
// vida (envio, grupo de controle, nunca repetir), central de preferências, descadastro com um clique e opção no
// perfil. Usa um schema descartável. Rodar: npm run test:growth-db
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { registerPreferenceRoutes } from "../server/lifecycle/routes.ts";
import { runLifecycle } from "../server/lifecycle/engine.ts";
import { inHoldout } from "../server/lifecycle/policy.ts";

if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL para o teste PostgreSQL.");
const originalUrl = new URL(process.env.DATABASE_URL);
const sslMode = originalUrl.searchParams.get("sslmode");
const ssl = process.env.DATABASE_SSL === "true" || (process.env.DATABASE_SSL !== "false" && ["require", "verify-full"].includes(sslMode));
const control = new pg.Pool({ connectionString: originalUrl.toString(), ssl: ssl ? { rejectUnauthorized: false } : undefined });
const schema = `casamia_growth_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  process.env.COOKIE_SECURE = "false";
  process.env.MAIL_DRIVER = "memory";
  process.env.APP_URL = "https://app.example.invalid";
  process.env.EMAIL_VERIFICATION_REQUIRED = "false";
  await migrateDatabase();
  await migrateDatabase(); // idempotente

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerPreferenceRoutes(app);
  registerApiRoutes(app);
  server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    const jar = new Map();
    return async (path, method = "GET", body, headers = {}) => {
      const response = await fetch(`${base}/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: [...jar.values()].join("; "), ...headers },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";")[0];
        const [name, value] = pair.split("=");
        if (value) jar.set(name, pair); else jar.delete(name);
      }
      const text = await response.text();
      let data = text;
      try { data = JSON.parse(text); } catch { /* texto */ }
      return { status: response.status, data };
    };
  };
  const query = (sql, params) => getPool().query(sql, params);

  // 1. Cadastro com origem, consentimento de anúncios e de e-mails.
  const ana = client();
  const registered = await ana("/auth/register", "POST", {
    email: "ana@example.invalid", password: "segredo123", emailMarketing: true,
    acquisition: {
      adConsent: true, gaClientId: "1234567890.1700000000",
      touch: { source: "Google", medium: "cpc", campaign: "enxoval-casal-sp-2026q4", gclid: "Cj0KCQ-abc_123", referrerHost: "google.com", landingPath: "/", firstSeenAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), nome: "Ana" },
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const anaId = registered.data.user.id;
  let row = (await query("SELECT * FROM users WHERE id = $1", [anaId])).rows[0];
  assert.equal(row.acq_source, "google");
  assert.equal(row.acq_medium, "cpc");
  assert.equal(row.acq_campaign, "enxoval-casal-sp-2026q4");
  assert.equal(row.acq_channel_group, "paid_search");
  assert.equal(row.acq_gclid, "Cj0KCQ-abc_123");
  assert.equal(row.ga_client_id, "1234567890.1700000000");
  assert.ok(row.ad_consent_at && row.marketing_consent_at && row.acq_first_seen_at);
  assert.equal(row.marketing_consent_source, "cadastro");

  const bia = client();
  const second = await bia("/auth/register", "POST", {
    email: "bia@example.invalid", password: "segredo123",
    acquisition: { adConsent: false, gaClientId: "1.2", touch: { gclid: "Cj0KCQ-abc_999", referrerHost: "l.instagram.com" } },
  });
  assert.equal(second.status, 201);
  const biaId = second.data.user.id;
  row = (await query("SELECT * FROM users WHERE id = $1", [biaId])).rows[0];
  assert.equal(row.acq_gclid, null, "sem consentimento de anúncios, nada de gclid");
  assert.equal(row.ga_client_id, null);
  assert.equal(row.acq_channel_group, "organic_social");
  assert.equal(row.marketing_consent_at, null, "caixa de e-mails desmarcada por padrão");
  const legacy = await client()("/auth/register", "POST", { email: "sem-origem@example.invalid", password: "segredo123" });
  assert.equal(legacy.status, 201, "cadastro sem o corpo novo continua funcionando");
  assert.equal((await query("SELECT acq_channel_group FROM users WHERE id = $1", [legacy.data.user.id])).rows[0].acq_channel_group, "direct");
  console.log("PASS: origem e consentimentos gravados no cadastro.");

  // 2. Motor: Ana (sem enxoval, conta de 3 horas) recebe o L1 uma única vez; Bia não tem consentimento.
  const now = new Date("2026-10-22T13:00:00Z"); // 10h em São Paulo
  await query("UPDATE users SET created_at = $2 WHERE id = $1", [anaId, new Date(now.getTime() - 3 * 3_600_000)]);
  await query("UPDATE users SET created_at = $2 WHERE id = $1", [biaId, new Date(now.getTime() - 3 * 3_600_000)]);
  const sends = [];
  const send = async (message) => { sends.push(message); };
  assert.deepEqual((await runLifecycle({ mode: "off", now, send })).skipped, true);
  const simulated = await runLifecycle({ mode: "simulate", now, send });
  assert.equal(simulated.simulated, 1);
  assert.equal(sends.length, 0, "simulação não envia");
  const first = await runLifecycle({ mode: "send", now, send });
  const holdout = inHoldout(anaId, "funnel_resume");
  const messages = (await query("SELECT * FROM lifecycle_messages WHERE user_id = $1 ORDER BY created_at", [anaId])).rows;
  assert.equal(messages.length, 2);
  assert.equal(messages[0].status, "simulated");
  assert.equal(messages[1].flow_key, "funnel_resume");
  assert.equal(messages[1].step, "2h");
  if (holdout) {
    assert.equal(first.holdout, 1);
    assert.equal(messages[1].status, "holdout");
    assert.equal(sends.length, 0, "grupo de controle não recebe");
  } else {
    assert.equal(first.sent, 1);
    assert.equal(messages[1].status, "sent");
    assert.equal(sends.length, 1);
    assert.equal(sends[0].to, "ana@example.invalid");
    assert.match(sends[0].headers["List-Unsubscribe"], /^<https:\/\/app\.example\.invalid\/api\/preferences\/unsubscribe\?token=/);
    assert.match(sends[0].text, /\/comecar\?utm_source=newsletter/);
  }
  assert.equal((await query("SELECT count(*)::int AS n FROM lifecycle_messages WHERE user_id = $1", [biaId])).rows[0].n, 0);
  const again = await runLifecycle({ mode: "send", now, send });
  assert.equal(again.sent + again.holdout, 0, "o mesmo passo nunca sai duas vezes");
  assert.equal((await runLifecycle({ mode: "send", now: new Date("2026-10-22T02:00:00Z"), send })).sent, 0);
  console.log(`PASS: motor de ciclo de vida (${holdout ? "grupo de controle" : "envio"}, sem repetição, simulação separada).`);

  // 3. Central de preferências e descadastro com um clique.
  const token = (await query("UPDATE users SET preferences_token = COALESCE(preferences_token, 'tok_' || md5(id::text)) WHERE id = $1 RETURNING preferences_token", [anaId])).rows[0].preferences_token;
  const anon = client();
  assert.equal((await anon("/preferences?token=curto")).status, 404);
  let prefs = await anon(`/preferences?token=${token}`);
  assert.deepEqual(prefs.data, { email: "a**@example.invalid", subscribed: true, reminders: true, tips: true, pausedUntil: null });
  prefs = await anon("/preferences", "POST", { token, tips: false, pause: true });
  assert.equal(prefs.data.tips, false);
  assert.ok(prefs.data.pausedUntil);
  assert.equal((await anon("/preferences", "POST", { token, tips: true }, { Origin: "https://evil.example" })).status, 403);
  prefs = await anon("/preferences", "POST", { token, pause: false });
  assert.equal(prefs.data.pausedUntil, null);
  const oneClick = await anon(`/preferences/unsubscribe?token=${token}`, "POST", "List-Unsubscribe=One-Click", { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://mail.provider.example" });
  assert.equal(oneClick.status, 200, "descadastro com um clique aceita POST do provedor");
  assert.ok((await query("SELECT marketing_unsubscribed_at FROM users WHERE id = $1", [anaId])).rows[0].marketing_unsubscribed_at);
  assert.equal((await anon("/preferences/unsubscribe?token=tok_nao_existe_000000000000", "POST", "List-Unsubscribe=One-Click", { "Content-Type": "application/x-www-form-urlencoded" })).status, 200);
  if (!holdout) assert.equal((await query("SELECT count(*)::int AS n FROM lifecycle_events WHERE type = 'unsubscribed'")).rows[0].n, 1);
  prefs = await anon("/preferences", "POST", { token, subscribed: true });
  assert.equal(prefs.data.subscribed, true, "quem já consentiu pode voltar a receber");
  console.log("PASS: central de preferências e descadastro com um clique.");

  // 4. Quem não marcou a caixa liga os e-mails pelo perfil.
  assert.deepEqual((await bia("/profile/marketing")).data, { subscribed: false });
  assert.deepEqual((await bia("/profile/marketing", "PATCH", { subscribed: true })).data, { subscribed: true });
  row = (await query("SELECT marketing_consent_source, marketing_consent_version FROM users WHERE id = $1", [biaId])).rows[0];
  assert.deepEqual(row, { marketing_consent_source: "perfil", marketing_consent_version: "2026-10" });
  assert.deepEqual((await bia("/profile/marketing", "PATCH", { subscribed: false })).data, { subscribed: false });
  assert.equal((await bia("/profile/marketing", "PATCH", {})).status, 400);
  console.log("PASS: opção de e-mails no perfil.");
} finally {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
