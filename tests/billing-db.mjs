// Teste de integração com PostgreSQL real: assinatura pela Stripe (checkout, portal, webhook assinado, idempotência,
// eventos fora de ordem, cancelamento e fundadores). A Stripe é substituída por um cliente falso; a conferência da
// assinatura do webhook usa a implementação real. Usa um schema descartável. Rodar: npm run test:billing-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import Stripe from "stripe";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { registerBillingWebhook, setStripeClientForTests } from "../server/billing.ts";

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
const schema = `casamia_billing_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  process.env.COOKIE_SECURE = "false";
  process.env.APP_URL = "https://casamia.test";
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_teste";
  process.env.STRIPE_PRICE_MONTHLY = "price_mensal";
  process.env.STRIPE_PRICE_PASS = "price_passe";
  await migrateDatabase();

  const real = new Stripe("sk_test_dummy");
  const calls = { customers: [], checkouts: [], portals: [], cancelled: [] };
  let listed = [];
  let listedSessions = [];
  setStripeClientForTests({
    webhooks: real.webhooks,
    customers: {
      create: async (params) => {
        calls.customers.push(params);
        return { id: `cus_${calls.customers.length}` };
      },
    },
    checkout: {
      sessions: {
        list: async () => ({ data: listedSessions }),
        create: async (params) => {
          calls.checkouts.push(params);
          return { url: "https://checkout.stripe.test/sessao" };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params) => {
          calls.portals.push(params);
          return { url: "https://billing.stripe.test/portal" };
        },
      },
    },
    subscriptions: {
      list: async () => ({ data: listed }),
      cancel: async (id) => {
        calls.cancelled.push(id);
        return { id };
      },
    },
  });

  const app = express();
  registerBillingWebhook(app);
  app.use(express.json({ limit: "1mb" }));
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const query = async (sql, params = []) =>
    (await getPool().query(sql, params)).rows;

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

  let eventCount = 0;
  const subscription = (userId, customer, priceId, status, extra = {}) => ({
    id: "sub_1",
    object: "subscription",
    customer,
    status,
    cancel_at_period_end: false,
    metadata: { userId },
    items: { data: [{ price: { id: priceId }, current_period_end: 1893456000 }] },
    ...extra,
  });
  const send = async (type, object, createdAt = Math.floor(Date.now() / 1000), id = `evt_${++eventCount}`, secret = "whsec_teste") => {
    const payload = JSON.stringify({ id, object: "event", type, created: createdAt, data: { object } });
    const header = real.webhooks.generateTestHeaderString({ payload, secret });
    const response = await fetch(`${base}/api/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": header },
      body: payload,
    });
    return response.status;
  };
  const planOf = async (email) => (await query("SELECT plan FROM users WHERE email = $1", [email]))[0].plan;

  const owner = person();
  const user = await register(owner, "dona@example.invalid");
  assert.equal(user.plan, "free");
  const passRow = async () => (await query("SELECT pass_expires_at FROM users WHERE id = $1", [user.id]))[0].pass_expires_at;
  const months = (from, to) => Math.round((to - from) / (30.44 * 24 * 3600 * 1000));
  const passSession = (id, extra = {}) => ({
    id,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    client_reference_id: user.id,
    customer: "cus_1",
    metadata: { userId: user.id, plan: "pass" },
    ...extra,
  });

  // Sem sessão, nada de cobrança.
  assert.equal((await person()("/billing/checkout", "POST", { plan: "monthly" })).status, 401);

  // Checkout: plano inválido (inclusive os antigos) é recusado.
  for (const plan of ["founder", "annual", "semiannual", "price_mensal"])
    assert.equal((await owner("/billing/checkout", "POST", { plan })).status, 400, plan);

  // Mensal: assinatura com o preço certo; o cliente da Stripe é criado uma vez só.
  const monthly = await owner("/billing/checkout", "POST", { plan: "monthly" });
  assert.equal(monthly.status, 200, JSON.stringify(monthly.data));
  assert.equal(monthly.data.url, "https://checkout.stripe.test/sessao");
  assert.equal(calls.checkouts[0].mode, "subscription");
  assert.equal(calls.checkouts[0].line_items[0].price, "price_mensal");
  assert.equal(calls.checkouts[0].client_reference_id, user.id);
  assert.equal(calls.checkouts[0].subscription_data.metadata.userId, user.id);
  assert.equal(calls.checkouts[0].customer, "cus_1");
  assert.match(calls.checkouts[0].success_url, /^https:\/\/casamia\.test\/\?assinatura=sucesso/);

  // Passe: pagamento único, sem dados de assinatura, com o preço do Passe.
  const pass = await owner("/billing/checkout", "POST", { plan: "pass" });
  assert.equal(pass.status, 200, JSON.stringify(pass.data));
  assert.equal(calls.checkouts[1].mode, "payment");
  assert.equal(calls.checkouts[1].line_items[0].price, "price_passe");
  assert.equal(calls.checkouts[1].metadata.plan, "pass");
  assert.equal(calls.checkouts[1].subscription_data, undefined, "o Passe não é assinatura");
  assert.equal(calls.customers.length, 1, "o cliente da Stripe é reaproveitado");
  assert.equal(await planOf("dona@example.invalid"), "free", "abrir o checkout não muda o plano");

  // Com cliente na Stripe, o portal abre.
  assert.equal((await owner("/billing/portal", "POST")).data.url, "https://billing.stripe.test/portal");

  // Webhook: assinatura falsa ou ausente é recusada e não muda nada.
  assert.equal(await send("customer.subscription.created", subscription(user.id, "cus_1", "price_mensal", "active"), undefined, undefined, "whsec_outro"), 400);
  const semHeader = await fetch(`${base}/api/billing/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(semHeader.status, 400);
  assert.equal(await planOf("dona@example.invalid"), "free");

  // Assinatura mensal ativa libera o plano e guarda a renovação.
  const t0 = Math.floor(Date.now() / 1000);
  assert.equal(await send("customer.subscription.created", subscription(user.id, "cus_1", "price_mensal", "active"), t0), 200);
  assert.equal(await planOf("dona@example.invalid"), "monthly");
  const billed = (await owner("/billing/status")).data;
  assert.equal(billed.plan, "monthly");
  assert.equal(billed.status, "active");
  assert.equal(billed.canManage, true);
  assert.equal(billed.passExpiresAt, null);
  assert.equal(billed.renewsAt, new Date(1893456000 * 1000).toISOString());
  assert.equal((await owner("/bootstrap")).data.user.plan, "monthly");

  // Já assinante: novo checkout mensal é recusado.
  const again = await owner("/billing/checkout", "POST", { plan: "monthly" });
  assert.equal(again.status, 409);
  assert.equal(again.data.code, "ALREADY_SUBSCRIBED");

  // Com o plano pago, as travas do gratuito saem.
  assert.equal((await owner("/enxovais", "POST", { name: "Casa", useDefaultTemplate: false })).status, 201);
  assert.equal((await owner("/enxovais", "POST", { name: "Praia", useDefaultTemplate: false })).status, 201, "assinante cria mais de um enxoval");

  // Evento repetido (mesmo id) é ignorado; evento atrasado não desfaz um mais novo.
  const dup = "evt_repetido";
  assert.equal(await send("customer.subscription.updated", subscription(user.id, "cus_1", "price_mensal", "past_due"), t0 + 10, dup), 200);
  assert.equal(await planOf("dona@example.invalid"), "monthly", "pagamento atrasado mantém o plano (a Stripe ainda tenta cobrar)");
  assert.equal(await send("customer.subscription.updated", subscription(user.id, "cus_1", "price_mensal", "canceled"), t0 + 10, dup), 200);
  assert.equal(await planOf("dona@example.invalid"), "monthly", "o mesmo evento não é aplicado duas vezes");
  assert.equal(await send("customer.subscription.updated", subscription(user.id, "cus_1", "price_mensal", "canceled"), t0 + 5), 200);
  assert.equal(await planOf("dona@example.invalid"), "monthly", "evento atrasado não desfaz o mais novo");

  // Cancelamento agendado fica visível; o encerramento volta ao gratuito sem apagar nada.
  await send("customer.subscription.updated", subscription(user.id, "cus_1", "price_mensal", "active", { cancel_at_period_end: true }), t0 + 20);
  assert.equal((await owner("/billing/status")).data.cancelAtPeriodEnd, true);
  await send("customer.subscription.deleted", subscription(user.id, "cus_1", "price_mensal", "canceled"), t0 + 30);
  assert.equal(await planOf("dona@example.invalid"), "free");
  assert.equal((await query("SELECT COUNT(*)::int AS n FROM enxovais WHERE owner_id = $1", [user.id]))[0].n, 2, "os enxovais continuam");
  assert.equal((await owner("/enxovais", "POST", { name: "Terceiro", useDefaultTemplate: false })).data.code, "LIMIT_REACHED_ENXOVAIS", "de volta às travas do gratuito");

  // Assinatura sem pagamento concluído não libera nada; preço desconhecido também não.
  await send("customer.subscription.created", subscription(user.id, "cus_1", "price_mensal", "incomplete"), t0 + 40);
  assert.equal(await planOf("dona@example.invalid"), "free");
  await send("customer.subscription.created", subscription(user.id, "cus_1", "price_qualquer", "active"), t0 + 41);
  assert.equal(await planOf("dona@example.invalid"), "free");

  // Passe: pagamento não concluído não libera; pago libera 12 meses a partir da compra, uma vez por sessão.
  assert.equal(await send("checkout.session.completed", passSession("cs_pendente", { payment_status: "unpaid" })), 200);
  assert.equal(await passRow(), null, "Pix pendente não libera");
  assert.equal(await send("checkout.session.completed", passSession("cs_1")), 200);
  const firstExpiry = await passRow();
  assert.equal(months(new Date(), firstExpiry), 12, "o Passe vale 12 meses");
  assert.equal(await planOf("dona@example.invalid"), "free", "users.plan não guarda o Passe");
  const withPass = (await owner("/billing/status")).data;
  assert.equal(withPass.plan, "pass");
  assert.equal(withPass.passExpiresAt, firstExpiry.toISOString());
  assert.equal((await owner("/bootstrap")).data.user.plan, "pass");
  assert.equal((await owner("/enxovais", "POST", { name: "Sítio", useDefaultTemplate: false })).status, 201, "Passe libera as travas");
  // O mesmo pagamento chegando de novo (outro evento, ou pelo pagamento assíncrono) não soma outros 12 meses.
  assert.equal(await send("checkout.session.async_payment_succeeded", passSession("cs_1")), 200);
  assert.deepEqual(await passRow(), firstExpiry, "cada pagamento vale uma vez só");
  assert.equal(calls.cancelled.length, 0, "sem mensal ativo, nada a cancelar");

  // Com o Passe em vigor, o mensal não se vende; comprar outro Passe soma 12 meses ao que resta.
  const blocked = await owner("/billing/checkout", "POST", { plan: "monthly" });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, "PASS_ACTIVE");
  assert.equal(await send("checkout.session.completed", passSession("cs_2")), 200);
  assert.equal(months(firstExpiry, await passRow()), 12, "o segundo Passe soma 12 meses ao que restava");

  // Passe vencido: a conta volta ao plano da assinatura (aqui, gratuito) e as travas voltam, sem rotina de expiração.
  await query("UPDATE users SET pass_expires_at = now() - interval '1 day' WHERE id = $1", [user.id]);
  assert.equal((await owner("/billing/status")).data.plan, "free");
  assert.equal((await owner("/bootstrap")).data.user.plan, "free");
  assert.equal((await owner("/enxovais", "POST", { name: "Quarto", useDefaultTemplate: false })).data.code, "LIMIT_REACHED_ENXOVAIS", "Passe vencido volta às travas");
  assert.equal((await owner("/billing/status")).data.passExpiresAt, null);

  // Comprar o Passe com o mensal ativo cancela o mensal na Stripe; o cancelamento não tira o Passe.
  await send("customer.subscription.created", subscription(user.id, "cus_1", "price_mensal", "active"), t0 + 50);
  assert.equal(await planOf("dona@example.invalid"), "monthly");
  assert.equal(await send("checkout.session.completed", passSession("cs_3")), 200);
  assert.deepEqual(calls.cancelled, ["sub_1"], "o mensal ativo é cancelado ao ativar o Passe");
  await send("customer.subscription.deleted", subscription(user.id, "cus_1", "price_mensal", "canceled"), t0 + 60);
  assert.equal(await planOf("dona@example.invalid"), "free");
  assert.equal((await owner("/billing/status")).data.plan, "pass", "cancelar o mensal não tira o Passe em vigor");

  // Sync na volta do checkout: lê pagamentos e assinatura direto na Stripe, sem esperar o webhook.
  await query("UPDATE users SET pass_expires_at = NULL WHERE id = $1", [user.id]);
  listed = [];
  listedSessions = [passSession("cs_sync"), passSession("cs_sync_aberta", { payment_status: "unpaid" }), passSession("cs_mensal", { mode: "subscription", metadata: { userId: user.id, plan: "monthly" } })];
  assert.equal((await owner("/billing/sync", "POST")).data.plan, "pass");
  const syncedExpiry = await passRow();
  assert.equal(months(new Date(), syncedExpiry), 12);
  await owner("/billing/sync", "POST");
  assert.deepEqual(await passRow(), syncedExpiry, "o sync repetido não soma de novo");
  listedSessions = [];
  listed = [subscription(user.id, "cus_1", "price_mensal", "active")];
  await owner("/billing/sync", "POST");
  assert.equal(await planOf("dona@example.invalid"), "monthly", "o sync também lê a assinatura");

  // Evento de uma assinatura sem conta correspondente não derruba o webhook; eventos não tratados são ignorados.
  assert.equal(await send("customer.subscription.created", subscription(randomUUID(), "cus_desconhecido", "price_mensal", "active")), 200);
  assert.equal(await send("checkout.session.completed", passSession("cs_fantasma", { client_reference_id: randomUUID(), metadata: { plan: "pass" } })), 200);
  assert.equal(await send("charge.succeeded", { id: "ch_1" }), 200);

  // Fundadores têm tudo liberado: não assinam e nunca são rebaixados.
  const founderCall = person();
  const founder = await register(founderCall, "fundador@example.invalid");
  await query("UPDATE users SET plan = 'founder' WHERE id = $1", [founder.id]);
  assert.equal((await founderCall("/billing/checkout", "POST", { plan: "monthly" })).status, 409);
  assert.equal((await founderCall("/billing/checkout", "POST", { plan: "pass" })).status, 409);
  await send("customer.subscription.deleted", subscription(founder.id, "cus_f", "price_mensal", "canceled"));
  assert.equal(await planOf("fundador@example.invalid"), "founder");

  // Sem todas as chaves da Stripe o app avisa que a assinatura não está disponível.
  delete process.env.STRIPE_PRICE_PASS;
  assert.equal((await owner("/billing/status")).data.available, false);

  console.log("PASS: checkout, portal e webhook assinado da Stripe controlam o plano da conta (idempotente, fora de ordem, cancelamento, fundadores).");
} finally {
  setStripeClientForTests(null);
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
