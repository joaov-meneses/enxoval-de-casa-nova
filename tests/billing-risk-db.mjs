// PostgreSQL descartável e SDK apenas para assinatura; nenhuma chamada à Stripe real.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import Stripe from 'stripe';
import { getPool } from '../server/database.ts';
import { migrateDatabase } from '../server/migrations.ts';
import { handleStripeEvent, registerBillingRoutes, registerBillingWebhook, setStripeClientForTests } from '../server/billing.ts';
import { billingRiskEventKey } from '../server/billingRisk.ts';
import { createLogger, runWithLogger } from '../server/logger.ts';

if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL local para testar risco de cobrança.');
const connection = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname)) throw new Error('Este teste exige PostgreSQL local.');
const control = new pg.Pool({ connectionString: connection.toString() });
const schema = `casamia_risk_test_${randomUUID().replaceAll('-', '')}`;
let server;
let schemaCreated = false;
try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  connection.searchParams.set('options', `-c search_path=${schema}`);
  Object.assign(process.env, { DATABASE_URL: connection.toString(), MAIL_DRIVER: 'memory',
    STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_risk_test',
    STRIPE_PRICE_MONTHLY: 'price_monthly', APP_URL: 'https://casamia.test',
    STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_test_explicit', GA4_MEASUREMENT_ID: '', GA4_API_SECRET: '', POSTHOG_KEY: '' });
  await migrateDatabase();
  const query = async (sql, params = []) => (await getPool().query(sql, params)).rows;
  const alice = randomUUID(), bob = randomUUID();
  await query(`INSERT INTO users(id,name,email,password_hash,plan,stripe_customer_id,stripe_subscription_id,subscription_status)
    VALUES($1,'Alice','alice@example.invalid','unused','monthly','cus_a','sub_a','active'),
      ($2,'Bob','bob@example.invalid','unused','monthly','cus_b','sub_b','active')`, [alice, bob]);
  const usersBefore = await query('SELECT id,plan,pass_expires_at,subscription_status FROM users ORDER BY id');
  let mode = false;
  let wrongSubscription = false;
  let mismatchedMode = false;
  let lookupFails = false;
  let multipleInvoices = false;
  let calls = 0;
  const portals = [];
  const real = new Stripe('sk_test_dummy');
  const invoice = id => ({ id, object: 'invoice', livemode: mode, customer: 'cus_a',
    parent: { type: 'subscription_details', subscription_details: { subscription: wrongSubscription ? 'sub_b' : id === 'in_second' ? 'sub_second' : 'sub_a' } } });
  setStripeClientForTests({
    webhooks: real.webhooks,
    invoices: { retrieve: async id => { calls++; if (lookupFails) throw new Error('provider temporarily unavailable'); return { ...invoice(id), livemode: mismatchedMode ? !mode : mode }; } },
    subscriptions: { retrieve: async id => ({ id, livemode: mode, customer: id === 'sub_b' ? 'cus_b' : 'cus_a' }) },
    disputes: { retrieve: async id => ({ id, livemode: mode, charge: 'ch_a' }) },
    radar: { earlyFraudWarnings: { retrieve: async id => ({ id, livemode: mode, charge: 'ch_a' }) } },
    charges: { retrieve: async id => ({ id, livemode: mode, customer: 'cus_a', payment_intent: 'pi_a' }) },
    paymentIntents: { retrieve: async id => ({ id, livemode: mode, customer: 'cus_a' }) },
    invoicePayments: { list: params => {
      assert.equal(params.payment.type, 'payment_intent'); assert.equal(params.payment.payment_intent, 'pi_a');
      return (async function* () {
        yield { id: 'inpay_1', livemode: mode, payment: { payment_intent: 'pi_a' }, invoice: 'in_a' };
        if (multipleInvoices) yield { id: 'inpay_2', livemode: mode, payment: { payment_intent: 'pi_a' }, invoice: 'in_second' };
      })();
    } },
    checkout: { sessions: { retrieve: async id => ({ id, livemode: mode, customer: 'cus_b', payment_intent: 'pi_b', subscription: null }) } },
    billingPortal: { sessions: { create: async params => { portals.push(params); return { url: 'https://billing.stripe.test/example' }; } } }
  });
  const makeEvent = (type, source, created = 100, id = `evt_${randomUUID()}`) => ({
    id, object: 'event', type, livemode: mode, created,
    data: { object: { id: source, metadata: { userId: bob }, customer: 'cus_b', subscription: 'sub_b' } }
  });
  const load = async (kind, source, environment = 'homologacao') =>
    (await query('SELECT * FROM billing_risk_cases WHERE environment=$1 AND kind=$2 AND source_id=$3', [environment, kind, source]))[0];
  const failed = makeEvent('invoice.payment_failed', 'in_a');
  await handleStripeEvent(failed);
  assert.equal((await load(failed.type, 'in_a')).customer_id, 'cus_a', 'titularidade vem da Stripe canônica, nunca da metadata');
  assert.equal((await load(failed.type, 'in_a')).subscription_id, 'sub_a');
  await query("UPDATE billing_risk_cases SET review_status='reviewed',review_note='Conferido',reviewed_at=now()");
  const priorCalls = calls;
  await handleStripeEvent(failed);
  assert.equal(calls, priorCalls, 'duplicata confirmada não precisa consultar provedor novamente');
  assert.equal((await load(failed.type, 'in_a')).review_status, 'reviewed');
  await handleStripeEvent(makeEvent(failed.type, 'in_a', 99));
  assert.equal((await load(failed.type, 'in_a')).review_status, 'reviewed', 'evento atrasado não reabre revisão');
  await handleStripeEvent(makeEvent(failed.type, 'in_a', 101));
  assert.equal((await load(failed.type, 'in_a')).review_status, 'pending', 'nova ocorrência exige nova revisão');
  await handleStripeEvent(makeEvent('charge.dispute.created', 'dp_a'));
  assert.equal((await load('charge.dispute.created', 'dp_a')).subscription_id, 'sub_a', 'disputa resolve PI -> InvoicePayment -> Invoice -> Subscription');
  await handleStripeEvent(makeEvent('radar.early_fraud_warning.created', 'issfr_a'));
  assert.equal((await load('radar.early_fraud_warning.created', 'issfr_a')).charge_id, 'ch_a');
  multipleInvoices = true;
  await handleStripeEvent(makeEvent('charge.dispute.created', 'dp_multiple'));
  assert.equal((await load('charge.dispute.created', 'dp_multiple')).subscription_id, null, 'pagamento de múltiplas assinaturas não escolhe uma arbitrariamente');
  multipleInvoices = false;
  await handleStripeEvent(makeEvent('checkout.session.async_payment_failed', 'cs_b'));
  assert.equal((await load('checkout.session.async_payment_failed', 'cs_b')).customer_id, 'cus_b');
  assert.equal((await load('checkout.session.async_payment_failed', 'cs_b')).payment_intent_id, 'pi_b');

  const retry = makeEvent('invoice.payment_failed', 'in_retry');
  lookupFails = true;
  await assert.rejects(handleStripeEvent(retry), /temporarily unavailable/);
  assert.equal((await query('SELECT * FROM stripe_events WHERE id=$1', [billingRiskEventKey(retry)])).length, 0);
  lookupFails = false;
  await handleStripeEvent(retry);
  assert.ok(await load(retry.type, 'in_retry'), 'falha temporária permite retentativa com mesmo evento');
  const mismatch = makeEvent('invoice.payment_failed', 'in_mismatch');
  wrongSubscription = true;
  await assert.rejects(handleStripeEvent(mismatch), /CUSTOMER_MISMATCH/);
  wrongSubscription = false;
  assert.equal(await load(mismatch.type, 'in_mismatch'), undefined, 'não registra caso associado a outro titular');
  mismatchedMode = true;
  await assert.rejects(handleStripeEvent(mismatch), /ENVIRONMENT_MISMATCH/);
  mismatchedMode = false;

  // Erro após inserir deduplicação deve desfazer também a marca; a Stripe pode repetir o evento.
  await query(`CREATE FUNCTION fail_risk_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.source_id='in_database_retry' THEN RAISE EXCEPTION 'synthetic database failure'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER fail_risk_insert BEFORE INSERT ON billing_risk_cases FOR EACH ROW EXECUTE FUNCTION fail_risk_insert()`);
  const databaseRetry = makeEvent('invoice.payment_failed', 'in_database_retry');
  await assert.rejects(handleStripeEvent(databaseRetry), /synthetic database failure/);
  assert.equal((await query('SELECT * FROM stripe_events WHERE id=$1', [billingRiskEventKey(databaseRetry)])).length, 0);
  await query('DROP TRIGGER fail_risk_insert ON billing_risk_cases; DROP FUNCTION fail_risk_insert()');
  await handleStripeEvent(databaseRetry);
  assert.ok(await load(databaseRetry.type, 'in_database_retry'));

  mode = true;
  await handleStripeEvent({ ...failed, livemode: true });
  assert.equal((await load(failed.type, 'in_a', 'producao')).last_event_id, failed.id, 'mesmo identificador não cruza ambientes');
  assert.equal((await load(failed.type, 'in_a')).last_event_created, 101);
  assert.deepEqual(await query('SELECT id,plan,pass_expires_at,subscription_status FROM users ORDER BY id'), usersBefore,
    'falha, disputa e suspeita não cancelam nem retiram acesso de nenhuma conta');

  const logLines = [];
  const log = createLogger({ write: line => logLines.push(line) });
  log.level = 'info';
  const app = express();
  app.use((_req, _res, next) => runWithLogger(log, next));
  registerBillingWebhook(app); app.use(express.json());
  const router = express.Router(); registerBillingRoutes(router, { requireUser: async () => ({ id: alice, email: 'alice@example.invalid', isGuest: false }), ensureDefaultEnxoval: async () => 'unused' });
  app.use('/api', router);
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const unsigned = await fetch(base + '/api/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(failed) });
  assert.equal(unsigned.status, 400, 'webhook exige assinatura');
  const invalidEvent = makeEvent('invoice.payment_failed', 'in_unsigned');
  invalidEvent.data.object.customer_email = 'sensitive-event@example.invalid';
  const invalidPayload = JSON.stringify(invalidEvent);
  const invalid = await fetch(base + '/api/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': real.webhooks.generateTestHeaderString({ payload: invalidPayload, secret: 'whsec_wrong' }) }, body: invalidPayload });
  assert.equal(invalid.status, 400);
  assert.equal(await load('invoice.payment_failed', 'in_unsigned', 'producao'), undefined);
  const signedEvent = makeEvent('invoice.payment_failed', 'in_signed');
  signedEvent.data.object.customer_email = 'sensitive-event@example.invalid';
  const signedPayload = JSON.stringify(signedEvent);
  const signed = await fetch(base + '/api/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json',
    'stripe-signature': real.webhooks.generateTestHeaderString({ payload: signedPayload, secret: 'whsec_risk_test' }) }, body: signedPayload });
  assert.equal(signed.status, 200); assert.ok(await load('invoice.payment_failed', 'in_signed', 'producao'));
  assert.ok(logLines.join('').includes('billing.webhook.completed'), 'confere privacidade em logs realmente emitidos');
  assert.equal(logLines.join('').includes('sensitive-event@example.invalid'), false, 'logs não recebem payload pessoal do webhook');
  assert.equal(logLines.join('').includes('stripeEvent\"'), false, 'não registra objeto financeiro completo');
  const portal = await fetch(base + '/api/billing/portal', { method: 'POST' });
  assert.equal(portal.status, 200); assert.equal(portals.at(-1).configuration, 'bpc_test_explicit');
  assert.equal(portals.at(-1).customer, 'cus_a');
  delete process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  assert.equal((await fetch(base + '/api/billing/portal', { method: 'POST' })).status, 200);
  assert.equal(portals.at(-1).configuration, undefined, 'sem variável, preserva portal padrão');
  console.log('PASS: riscos resolvidos pela Stripe, isolados, idempotentes, reprocessáveis e sem revogação; portal e assinatura protegidos.');
} finally {
  setStripeClientForTests(null);
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await getPool().end();
  if (schemaCreated) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
