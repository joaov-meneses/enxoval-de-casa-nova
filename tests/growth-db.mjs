// Teste de integração com PostgreSQL real (Fase 7): origem e consentimentos gravados no cadastro, motor de ciclo de
// vida (envio, grupo de controle, nunca repetir), central de preferências, descadastro com um clique e opção no
// perfil; resumo de atrasos, webhooks do Resend, volta ao app, pesquisa, campanhas e monitor de rotinas.
// Usa um schema descartável. Rodar: npm run test:growth-db
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { registerPreferenceRoutes } from "../server/lifecycle/routes.ts";
import { runLifecycle } from "../server/lifecycle/engine.ts";
import { inHoldout } from "../server/lifecycle/policy.ts";
import { handleResendEvent, registerResendWebhook } from "../server/lifecycle/tracking.ts";

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

  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("segredo-webhook").toString("base64")}`;
  const app = express();
  registerResendWebhook(app);
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
    email: "ana@example.invalid", password: "segredo-7", emailMarketing: true,
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
    email: "bia@example.invalid", password: "segredo-7",
    acquisition: { adConsent: false, gaClientId: "1.2", touch: { gclid: "Cj0KCQ-abc_999", referrerHost: "l.instagram.com" } },
  });
  assert.equal(second.status, 201);
  const biaId = second.data.user.id;
  row = (await query("SELECT * FROM users WHERE id = $1", [biaId])).rows[0];
  assert.equal(row.acq_gclid, null, "sem consentimento de anúncios, nada de gclid");
  assert.equal(row.ga_client_id, null);
  assert.equal(row.acq_channel_group, "organic_social");
  assert.equal(row.marketing_consent_at, null, "caixa de e-mails desmarcada por padrão");
  const legacy = await client()("/auth/register", "POST", { email: "sem-origem@example.invalid", password: "segredo-7" });
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

  // 5. L4 resumo de atrasos com o planejamento real, id do provedor, webhooks, volta ao app e supressão.
  const carla = client();
  const carlaReg = await carla("/auth/register", "POST", { email: "carla@example.invalid", password: "segredo-7", emailMarketing: true });
  assert.equal(carlaReg.status, 201);
  const carlaId = carlaReg.data.user.id;
  assert.equal((await query("SELECT count(*)::int AS n FROM user_activity_days WHERE user_id = $1", [carlaId])).rows[0].n, 1,
    "o login conta como dia de uso");
  const enxovalId = randomUUID();
  const kitchenId = randomUUID();
  const moveDate = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  await query("INSERT INTO enxovais (id, name, owner_id, move_date, created_at) VALUES ($1, 'Casa', $2, $3, $4)",
    [enxovalId, carlaId, moveDate, new Date(now.getTime() - 30 * 86_400_000)]);
  await query("INSERT INTO categories (id, user_id, name, enxoval_id) VALUES ($1, $2, 'Cozinha', $3)", [kitchenId, carlaId, enxovalId]);
  for (const name of ["Geladeira", "Fogão"]) {
    await query("INSERT INTO items (id, user_id, category_id, name, enxoval_id, status) VALUES ($1, $2, $3, $4, $5, 'researching')",
      [randomUUID(), carlaId, kitchenId, name, enxovalId]);
  }
  const carlaSends = [];
  const carlaRun = await runLifecycle({ mode: "send", now, send: async (message) => { carlaSends.push(message); return { providerMessageId: "re_carla_1" }; } });
  const carlaMessage = (await query("SELECT * FROM lifecycle_messages WHERE user_id = $1", [carlaId])).rows[0];
  assert.equal(carlaMessage.flow_key, "overdue", "a geladeira passou da semana sugerida (cerca de 8 semanas antes)");
  assert.equal(carlaMessage.step, "wk:2026-10-19");
  const carlaHoldout = inHoldout(carlaId, "overdue");
  if (carlaHoldout) {
    assert.equal(carlaRun.holdout, 1);
  } else {
    assert.equal(carlaMessage.provider_message_id, "re_carla_1");
    const mail = carlaSends.find((message) => message.to === "carla@example.invalid");
    assert.match(mail.subject, /^(1 item passou|\d+ itens passaram) da semana de compra$/);
    assert.match(mail.text, /Atrasados:\n- (Geladeira|Fogão)/);
    assert.match(mail.text, new RegExp(`lm=${carlaMessage.id}`));

    let result = await handleResendEvent({ type: "email.delivered", created_at: now.toISOString(), data: { email_id: "re_carla_1", to: ["carla@example.invalid"] } }, "evt_1");
    assert.equal(result.recorded, true);
    result = await handleResendEvent({ type: "email.delivered", data: { email_id: "re_carla_1" } }, "evt_1");
    assert.equal(result.recorded, false, "o mesmo evento reenviado não conta duas vezes");
    await handleResendEvent({ type: "email.clicked", data: { email_id: "re_carla_1" } }, "evt_2");
    const returned = await carla("/lifecycle/returned", "POST", { messageId: carlaMessage.id });
    assert.deepEqual(returned.data, { recorded: true });
    assert.deepEqual((await ana("/lifecycle/returned", "POST", { messageId: carlaMessage.id })).data, { recorded: false },
      "só a dona da mensagem conta a volta");
    const types = (await query("SELECT type FROM lifecycle_events WHERE message_id = $1 ORDER BY type", [carlaMessage.id])).rows.map((r) => r.type);
    assert.deepEqual(types, ["clicked", "delivered", "returned"]);
    const { frequencyGate } = await import("../server/lifecycle/frequency.ts");
    const gate = await frequencyGate(["Carla@example.invalid", "bia@example.invalid"]);
    assert.deepEqual(gate.deferred, ["Carla@example.invalid"], "quem recebeu hoje espera; o alerta de preço segue a mesma regra");
    assert.equal(gate.allowed.get("bia@example.invalid"), biaId);
  }
  // Webhook pela rota HTTP: assinatura obrigatória; rejeição definitiva suprime o endereço.
  const body = JSON.stringify({ type: "email.bounced", data: { email_id: "re_outro", to: ["carla@example.invalid"], bounce: { type: "Permanent" } } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v1,${createHmac("sha256", Buffer.from("segredo-webhook")).update(`evt_3.${timestamp}.${body}`).digest("base64")}`;
  const unsigned = await fetch(`${base}/api/webhooks/resend`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.equal(unsigned.status, 400);
  const signed = await fetch(`${base}/api/webhooks/resend`, {
    method: "POST", body,
    headers: { "Content-Type": "application/json", "svix-id": "evt_3", "svix-timestamp": timestamp, "svix-signature": signature },
  });
  assert.equal(signed.status, 200);
  assert.equal((await query("SELECT reason FROM email_suppressions WHERE email = 'carla@example.invalid'")).rows[0]?.reason, "bounce");
  console.log(`PASS: resumo de atrasos (${carlaHoldout ? "grupo de controle" : "envio, webhooks e volta ao app"}) e supressão por rejeição.`);

  // 6. Pesquisa de pós-mudança pelo token, sem login.
  const survey = await anon(`/survey?token=${token}`);
  assert.deepEqual(survey.data, { email: "a**@example.invalid", score: null, comment: "" });
  assert.equal((await anon("/survey", "POST", { token, score: 11 })).status, 400);
  assert.equal((await anon("/survey", "POST", { token, score: 9, comment: "Ótimo" })).data.score, 9);
  assert.equal((await anon("/survey", "POST", { token, score: 10 })).data.score, 10, "responder de novo atualiza");
  assert.equal((await query("SELECT count(*)::int AS n FROM survey_responses WHERE user_id = $1", [anaId])).rows[0].n, 1);
  console.log("PASS: pesquisa de pós-mudança.");

  // 7. Campanha por segmento: estimativa, simulação, envio com grupo de controle e limite; painel e rotinas.
  process.env.LIFECYCLE_MODE = "send";
  const { estimateAudience, sendCampaign } = await import("../server/lifecycle/campaigns.ts");
  const { lifecycleReport, listCampaigns } = await import("../server/lifecycle/report.ts");
  const estimate = await estimateAudience("all");
  assert.equal(estimate.eligible, 1, "Ana entra; Carla foi suprimida e Bia não consentiu");
  const campaignSends = [];
  const campaign = await sendCampaign(
    { name: "Teste", segment: "all", subject: "Novidade", body: "Oi", ctaLabel: "Ver", ctaPath: "/app" },
    { send: async (message) => { campaignSends.push(message); return { providerMessageId: "re_campaign" }; } },
  );
  assert.equal(campaign.audience, 1);
  assert.equal(campaign.sent + campaign.holdout + campaign.deferred, 1);
  const campaigns = await listCampaigns();
  assert.equal(campaigns[0].name, "Teste");
  assert.equal(campaigns[0].status, "sent");
  if (campaign.sent) assert.match(campaignSends[0].html, /utm_campaign=lifecycle-campaign/);
  const report = await lifecycleReport();
  assert.ok(report.flows.some((flow) => flow.flow === "overdue"));
  assert.equal(report.survey.responses, 1);
  assert.equal(report.survey.nps, 100);
  delete process.env.LIFECYCLE_MODE;
  const { listJobs, registerJob, trackJob } = await import("../server/jobMonitor.ts");
  registerJob("teste_ok", 60_000);
  registerJob("teste_falha", 60_000);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await trackJob("teste_ok", async () => 7), 7);
  await assert.rejects(trackJob("teste_falha", async () => { throw new Error("quebrou"); }), /quebrou/);
  const jobs = Object.fromEntries((await listJobs()).map((job) => [job.job, job]));
  assert.ok(jobs.teste_ok.last_succeeded_at);
  assert.equal(jobs.teste_falha.last_error, "quebrou");
  assert.equal(jobs.teste_ok.stale, false);
  console.log("PASS: campanha por segmento, painel de ciclo de vida e monitor de rotinas.");
} finally {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
