import { emptyAnswers, generatePlan, toPayload } from "../src/onboarding/plan.ts";
// Teste de integração com PostgreSQL real: assinatura pela Stripe (checkout, portal, webhook assinado, idempotência,
// eventos fora de ordem, cancelamento e fundadores). A Stripe é substituída por um cliente falso; a conferência da
// assinatura do webhook usa a implementação real. Usa um schema descartável. Rodar: npm run test:billing-db
import { mailOutbox } from "../server/mailer.ts";
import { sendTrialNotifications } from "../server/workers/trialNotifications.ts";
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
  process.env.MAIL_DRIVER = "memory";
  await migrateDatabase();

  const real = new Stripe("sk_test_dummy");
  const calls = { customers: [], checkouts: [], portals: [], cancelled: [] };
  let listed = [];
  let listedSessions = [];
  let retrievedSession = null;
  let retrievedSubscription = null;
  let canceledSubscription = null;
  setStripeClientForTests({
    webhooks: real.webhooks,
    prices: { retrieve: async id => ({id, active:true, unit_amount:id==='price_passe'?9900:3990, currency:'brl', type:id==='price_passe'?'one_time':'recurring', recurring:id==='price_passe'?null:{interval:'month',interval_count:1}}) },
    customers: {
      create: async (params) => {
        calls.customers.push(params);
        return { id: `cus_${calls.customers.length}` };
      },
    },
    checkout: {
      sessions: {
        list: async ({customer}) => ({ data: listedSessions.filter(session => session.customer === customer) }),
        retrieve: async () => retrievedSession,
        create: async (params) => {
          calls.checkouts.push(params);
          return { id: `cs_mock_${calls.checkouts.length}`, expires_at: Math.floor(Date.now()/1000) + 86400, url: "https://checkout.stripe.test/sessao" };
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
      list: async ({customer}) => ({ data: listed.filter(subscription => subscription.customer === customer) }),
      retrieve: async () => retrievedSubscription,
      cancel: async (id) => {
        calls.cancelled.push(id);
        const known = listed.find(subscription => subscription.id === id) ?? (canceledSubscription?.id === id ? canceledSubscription : null);
        return known ? {...known, status: "canceled"} : { id };
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
    return async (path, method = "GET", body, headers = {}) => {
      const response = await fetch(`${base}/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
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
    items: { data: [{ price: { id: priceId, unit_amount: 3990, currency: "brl" }, current_period_end: 1893456000 }] },
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
  const offers = await owner('/billing/plans');
  assert.equal(offers.status, 200);
  assert.deepEqual(offers.data.offers.map(({id,amount})=>({id,amount})), [{id:'pass',amount:9900},{id:'monthly',amount:3990}]);
  assert.equal(user.plan, "free");
  const passRow = async () => (await query("SELECT pass_expires_at FROM users WHERE id = $1", [user.id]))[0].pass_expires_at;
  const months = (from, to) => Math.round((to - from) / (30.44 * 24 * 3600 * 1000));
  const passSession = (id, extra = {}) => ({
    id,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_total: 8900, currency: "brl",
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
  assert.ok(calls.checkouts[0].success_url.endsWith("&session_id={CHECKOUT_SESSION_ID}"));
  assert.match(calls.checkouts[0].success_url, /^https:\/\/casamia\.test\/app\?assinatura=sucesso/);

  assert.equal(calls.checkouts[0].subscription_data.trial_period_days, 2);
  assert.equal(calls.checkouts[0].payment_method_collection, "always");
  assert.equal(Object.hasOwn(calls.checkouts[0], 'payment_method_types'), false, 'a API atual exige métodos dinâmicos do Dashboard');
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
  assert.deepEqual(billed.monthlyPrice,{amount:3990,currency:'brl'});
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
  assert.equal((await owner("/enxovais", "POST", { name: "Terceiro", useDefaultTemplate: false })).data.code, "SUBSCRIPTION_REQUIRED", "de volta às travas do gratuito");

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
  assert.deepEqual(withPass.passPayment, {amount:8900,currency:'brl',sessionId:'cs_1'});
  assert.equal(withPass.passNotice, 'cs_1');
  assert.equal((await owner('/billing/pass-notice','POST',{sessionId:'cs_other'})).status,403);
  assert.equal((await owner('/billing/pass-notice','POST',{sessionId:'cs_1'})).status,204);
  assert.equal((await owner('/billing/status')).data.passNotice,null,'confirmação do Passe não se repete');
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
  assert.equal((await owner("/enxovais", "POST", { name: "Quarto", useDefaultTemplate: false })).data.code, "SUBSCRIPTION_REQUIRED", "Passe vencido volta às travas");
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

  // Trial de 48 horas: acesso integral, avisos duráveis e bloqueio herdado pelos convidados.
  const trialOwner = person();
  const trialUser = await register(trialOwner, "trial@example.invalid");
  const start = Math.floor(Date.now() / 1000);
  const trialSub = subscription(trialUser.id, "cus_trial", "price_mensal", "trialing", {
    id: "sub_trial", trial_start: start, trial_end: start + 48 * 3600
  });
  assert.equal((await trialOwner('/enxovais', 'POST', {name: 'Sem cartão'})).data.code, 'SUBSCRIPTION_REQUIRED');
  await send('customer.subscription.created', trialSub);
  assert.equal((await trialOwner('/billing/status')).data.accessAllowed, true);
  assert.equal((await trialOwner('/billing/status')).data.trialUsed, true);
  assert.equal((await trialOwner('/billing/status')).data.trialNotice,'started');
  assert.equal((await trialOwner('/billing/trial-notice','POST',{kind:'started',subscriptionId:'sub_other'})).status,403);
  assert.equal((await trialOwner('/billing/trial-notice','POST',{kind:'started',subscriptionId:'sub_trial'})).status,204);
  assert.equal((await trialOwner('/billing/status')).data.trialNotice,null,'não repete o modal inicial');
  assert.equal(mailOutbox.filter(m => m.to === 'trial@example.invalid').length, 1);
  await sendTrialNotifications();
  assert.equal(mailOutbox.filter(m => m.to === 'trial@example.invalid').length, 1, 'não repete aviso inicial');
  const house = await trialOwner('/enxovais', 'POST', {name: 'Trial', useDefaultTemplate: false});
  assert.equal(house.status, 201, JSON.stringify(house.data));
  const houseId = house.data.enxoval.id;
  for (let n = 0; n < 3; n++) assert.equal((await trialOwner('/categories', 'POST', {enxovalId: houseId, name: `Ambiente ${n}`})).status, 201);
  const guest = person();
  const guestUser = await register(guest, 'convidado-trial@example.invalid');
  await query('UPDATE users SET is_guest = true WHERE id = $1', [guestUser.id]);
  await query("INSERT INTO enxoval_members (enxoval_id, user_id, role) VALUES ($1, $2, 'editor')", [houseId, guestUser.id]);
  assert.equal((await guest(`/enxovais/${houseId}`)).status, 200);
  assert.equal((await guest(`/billing/status?enxovalId=${houseId}`)).data.accessAllowed, true);
  await query("UPDATE users SET trial_ends_at = now() + interval '23 hours' WHERE id = $1", [trialUser.id]);
  await sendTrialNotifications(); await sendTrialNotifications();
  assert.equal((await trialOwner('/billing/status')).data.trialNotice,'ending');
  assert.equal((await guest(`/billing/status?enxovalId=${houseId}`)).data.trialNotice,null,'convidado não recebe avisos de cobrança do titular');
  assert.equal((await trialOwner('/billing/trial-notice','POST',{kind:'ending',subscriptionId:'sub_trial'})).status,204);
  assert.equal((await trialOwner('/billing/status')).data.trialNotice,null,'lembrete de término aparece uma única vez');
  assert.equal(mailOutbox.filter(m => m.to === 'trial@example.invalid').length, 2, 'um lembrete 24h antes, sem duplicação');
  assert.match(mailOutbox.at(-1).text, /automaticamente/);
  assert.match(mailOutbox.at(-1).text, /Cancelar assinatura/);
  await query("UPDATE users SET trial_ends_at = now() - interval '1 second' WHERE id = $1", [trialUser.id]);
  assert.equal((await guest(`/enxovais/${houseId}`)).data.code, 'SUBSCRIPTION_REQUIRED', 'expiração bloqueia sem depender do webhook');
  await send('customer.subscription.updated', {...trialSub, status: 'active'}, start + 1);
  assert.equal((await guest(`/enxovais/${houseId}`)).status, 200, 'pagamento ativa o acesso');
  await send('customer.subscription.deleted', {...trialSub, status: 'canceled'}, start + 2);
  for (const call of [trialOwner, guest]) {
    assert.equal((await call(`/enxovais/${houseId}`)).data.code, 'SUBSCRIPTION_REQUIRED');
    assert.equal((await call(`/items?enxovalId=${houseId}`)).data.code, 'SUBSCRIPTION_REQUIRED');
    assert.equal((await call('/items', 'POST', {enxovalId: houseId, name: 'Importado'})).data.code, 'SUBSCRIPTION_REQUIRED');
    const bootstrap = (await call('/bootstrap')).data;
    assert.deepEqual(bootstrap.items, []); assert.deepEqual(bootstrap.categories, []);
    assert.equal(bootstrap.enxovais.length, 1, 'mantém o vínculo e a conta');
  }
  assert.equal((await query('SELECT count(*)::int AS n FROM categories WHERE enxoval_id = $1', [houseId]))[0].n, 3, 'preserva os dados');
  const reactivation = await trialOwner('/billing/checkout', 'POST', {plan: 'monthly'}, {Origin: base});
  assert.equal(reactivation.status, 200);
  assert.equal(calls.checkouts.at(-1).subscription_data.trial_period_days, undefined, 'não repete trial após cancelar');

  // O retorno usa a mesma origem da sessão no desenvolvimento, mesmo com APP_URL diferente.
  const checkoutCount = calls.checkouts.length;
  await trialOwner('/billing/checkout', 'POST', {plan: 'monthly'}, {Origin: base});
  assert.equal(calls.checkouts.length, checkoutCount, 'reutiliza o checkout aberto para evitar dois trials');
  assert.ok(calls.checkouts.at(-1).success_url.startsWith(`${base}/app?`));
  assert.equal((await trialOwner('/bootstrap')).status, 200, 'checkout não encerra a sessão');
  canceledSubscription = {...trialSub, status: 'trialing'};
  await send('customer.subscription.updated', {...trialSub, id: 'sub_cancel_api'}, start + 3);
  canceledSubscription.id = 'sub_cancel_api';
  assert.equal((await guest('/billing/cancel', 'POST')).status, 403);
  assert.equal((await trialOwner('/billing/cancel', 'POST')).status, 200);
  assert.equal((await trialOwner('/billing/status')).data.accessAllowed, false, 'cancelamento bloqueia antes do webhook');
  assert.equal((await guest(`/enxovais/${houseId}`)).data.code, 'SUBSCRIPTION_REQUIRED');

  // Retorno aprovado abre o enxoval padrão sem novo login e sem depender do webhook.
  const returnCall = person();
  const returnUser = await register(returnCall, 'retorno@example.invalid');
  assert.equal((await returnCall('/bootstrap')).data.user.onboardingCompleted,false);
  const onboardingAnswers = {...emptyAnswers,name:'Retorno',moment:'casal',moveDate:'2027-01-12',moveDateAnswered:true,state:'BA',housing:'apartamento',people:3,rooms:['cozinha','banheiro','sala','quarto','servico'],owned:'algumas',style:'full',budget:'10-25',worries:['waste'],usage:['buy'],source:'instagram'};
  const onboardingPlan = generatePlan(onboardingAnswers);
  const legacyCompletion = await returnCall('/enxovais','POST',{name:'Enxoval de Casa Nova',plan:toPayload(onboardingPlan),profile:onboardingAnswers,userName:'Retorno'});
  assert.equal(legacyCompletion.status,202,'tela antiga salva o rascunho sem bloqueio de assinatura');
  assert.equal(legacyCompletion.data.requiresCheckout,true);
  assert.equal((await query('SELECT count(*)::int AS n FROM enxovais WHERE owner_id = $1',[returnUser.id]))[0].n,0,'compatibilidade não libera enxoval antes do pagamento');
  assert.equal((await returnCall('/onboarding/complete','POST',{name:'Enxoval de Casa Nova',plan:toPayload(onboardingPlan),profile:onboardingAnswers,userName:'Retorno'})).status,200);
  assert.equal((await returnCall('/bootstrap')).data.user.onboardingCompleted,true,'salva conclusão antes do cartão');
  assert.equal((await returnCall('/bootstrap')).data.user.plan,'free','onboarding não inicia trial');
  assert.equal((await query('SELECT count(*)::int AS n FROM enxovais WHERE owner_id = $1',[returnUser.id]))[0].n,0,'nenhum acesso ao enxoval antes da confirmação');
  await query("UPDATE users SET stripe_customer_id = 'cus_return' WHERE id = $1", [returnUser.id]);
  retrievedSubscription = subscription(returnUser.id, 'cus_return', 'price_mensal', 'trialing', {id:'sub_return',trial_start:start,trial_end:start+172800});
  retrievedSession = {id:'cs_test_return', mode:'subscription', status:'open',payment_status:'no_payment_required',customer:'cus_return',client_reference_id:returnUser.id,subscription:'sub_return'};
  assert.equal((await returnCall('/billing/sync','POST',{sessionId:'cs_test_return',prepareWorkspace:true})).status,409,'não libera checkout incompleto');
  assert.equal((await query('SELECT count(*)::int AS n FROM enxovais WHERE owner_id = $1',[returnUser.id]))[0].n,0);
  retrievedSession = {...retrievedSession,status:'complete',client_reference_id:user.id};
  assert.equal((await returnCall('/billing/sync','POST',{sessionId:'cs_test_return',prepareWorkspace:true})).status,403,'recusa checkout de outra conta');
  retrievedSession.client_reference_id = returnUser.id;
  const returned = await returnCall('/billing/sync','POST',{sessionId:'cs_test_return',prepareWorkspace:true});
  assert.equal(returned.status,200,JSON.stringify(returned.data));
  assert.equal(returned.data.accessAllowed,true,'cartão cadastrado em trial libera acesso');
  const defaultId = returned.data.enxovalId;
  assert.ok(defaultId);
  const defaultBootstrap = await returnCall(`/bootstrap?enxovalId=${defaultId}`);
  assert.equal(defaultBootstrap.status,200,'sessão de login preservada');
  assert.equal(defaultBootstrap.data.activeEnxoval.name,'Enxoval de Casa Nova');
  assert.equal(defaultBootstrap.data.items.length,onboardingPlan.categories.reduce((total,c) => total+c.items.length,0),'preserva todos os itens do onboarding após cadastrar cartão');
  const repeated = await Promise.all([1,2].map(() => returnCall('/billing/sync','POST',{sessionId:'cs_test_return',prepareWorkspace:true})));
  assert.ok(repeated.every(result => result.data.enxovalId === defaultId));
  assert.equal((await query('SELECT count(*)::int AS n FROM enxovais WHERE owner_id = $1',[returnUser.id]))[0].n,1,'retorno concorrente não duplica enxoval');

  // Recupera checkout aprovado mesmo sem webhook e sem parâmetros de retorno na URL.
  const recoveryCall = person();
  const recoveryUser = await register(recoveryCall,'recuperacao@example.invalid');
  await query("UPDATE users SET stripe_customer_id = 'cus_recovery' WHERE id = $1",[recoveryUser.id]);
  listed = [subscription(recoveryUser.id,'cus_recovery','price_mensal','trialing',{id:'sub_recovery',trial_start:start,trial_end:start+172800})];
  listedSessions = [{id:'cs_paid_recovery',customer:'cus_recovery',mode:'payment',payment_status:'paid',client_reference_id:recoveryUser.id,metadata:{plan:'pass',userId:recoveryUser.id}}];
  const recovered = await recoveryCall('/bootstrap');
  assert.equal(recovered.status,200,JSON.stringify(recovered.data));
  assert.equal(recovered.data.user.plan,'pass','bootstrap recupera o Passe aprovado');
  assert.equal((await recoveryCall('/billing/status')).data.accessAllowed,true);
  const recoveryExpiry = (await query('SELECT pass_expires_at FROM users WHERE id = $1',[recoveryUser.id]))[0].pass_expires_at;
  await recoveryCall('/bootstrap');
  assert.deepEqual((await query('SELECT pass_expires_at FROM users WHERE id = $1',[recoveryUser.id]))[0].pass_expires_at,recoveryExpiry,'recarregar não estende o Passe');

  // Sem todas as chaves da Stripe o app avisa que a assinatura não está disponível.
  delete process.env.STRIPE_PRICE_MONTHLY;
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
