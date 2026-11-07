// Integração PostgreSQL em schema descartável; não acessa Stripe, Railway ou e-mail reais.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { checkBilling, listBillingCases, reviewBillingCase, REQUIRED_BILLING_EVENTS } from '../server/billingOperations.ts';
import { getPool } from '../server/database.ts';
import { migrateDatabase } from '../server/migrations.ts';

if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL local para o teste.');
const connection = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname)) throw new Error('Este teste exige PostgreSQL local.');
const control = new pg.Pool({ connectionString: connection.toString() });
const schema = `casamia_ops_test_${randomUUID().replaceAll('-', '')}`;
let created = false;
const note = 'Conferência sintética concluída, sem operação financeira.';
try {
  await control.query(`CREATE SCHEMA "${schema}"`); created = true;
  connection.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = connection.toString();
  process.env.STRIPE_SECRET_KEY = 'rk_test_sensitive_marker';
  process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
  process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
  process.env.STRIPE_PRICE_PASS = 'price_pass';
  process.env.STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_test';
  process.env.NFSE_NACIONAL_ENVIRONMENT = 'homologacao';
  process.env.MAIL_DRIVER = 'memory';
  process.env.LOG_LEVEL = 'silent';
  await migrateDatabase();
  const db = getPool();
  const kind = 'invoice.payment_failed';
  const seed = (environment, source, event = 'evt_current') => db.query(`INSERT INTO billing_risk_cases
    (environment,kind,source_id,last_event_id,last_event_created) VALUES ($1,$2,$3,$4,123)`, [environment, kind, source, event]);
  await seed('homologacao', 'in_review'); await seed('producao', 'in_other_environment');
  await db.query(`INSERT INTO billing_refund_cases(environment,charge_id,currency,last_event_id,last_event_created)
    VALUES ('homologacao','ch_review','brl','evt_refund',123)`);

  const list = await listBillingCases('homologacao');
  assert.equal(list.readOnly, true); assert.equal(list.cases.length, 2); assert.equal(list.hasMore, false);
  assert(list.cases.every(row => row.environment === 'homologacao'));
  assert(list.cases.every(row => !('review_note' in row) && !('customer_id' in row)));
  assert.equal((await listBillingCases('homologacao', 'refund')).cases.length, 1);
  await assert.rejects(() => listBillingCases('production'));
  await assert.rejects(() => listBillingCases('homologacao', 'anything'));

  await assert.rejects(() => reviewBillingCase('producao', kind, 'in_review', 'evt_current', note));
  await assert.rejects(() => reviewBillingCase('homologacao', kind, 'in_review', 'evt_stale', note));
  for (const invalidNote of ['curta', 'x'.repeat(1001)])
    await assert.rejects(() => reviewBillingCase('homologacao', kind, 'in_review', 'evt_current', invalidNote));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM billing_operation_audit')).rows[0].n, 0);

  const concurrent = await Promise.allSettled([1, 2].map(() => reviewBillingCase('homologacao', kind, 'in_review', 'evt_current', note)));
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1, 'somente um operador confirma o mesmo evento');
  assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM billing_operation_audit WHERE action='review_billing_case'")).rows[0].n, 1);
  assert.equal((await listBillingCases('homologacao', kind)).cases.length, 0);
  assert.equal((await listBillingCases('producao', kind)).cases.length, 1);

  // Um evento posterior reabre a pendência; uma leitura antiga não pode encerrar o caso atual.
  await db.query(`UPDATE billing_risk_cases SET last_event_id='evt_new',review_status='pending',reviewed_at=NULL WHERE source_id='in_review'`);
  await assert.rejects(() => reviewBillingCase('homologacao', kind, 'in_review', 'evt_current', note));
  assert.equal((await listBillingCases('homologacao', kind)).cases[0].last_event_id, 'evt_new');
  await reviewBillingCase('homologacao', kind, 'in_review', 'evt_new', note);
  await reviewBillingCase('homologacao', 'refund', 'ch_review', 'evt_refund', note);
  await assert.rejects(() => reviewBillingCase('homologacao', 'refund', 'ch_review', 'evt_refund', note));

  const fake = {
    accounts: { retrieve: async () => ({ id: 'acct_synthetic', country: 'BR', charges_enabled: true, payouts_enabled: true, details_submitted: true }) },
    paymentMethodConfigurations: { list: async () => ({ data: [{ id: 'pmc_test', active: true, livemode: false, pix: { available: true, display_preference: { value: 'on' } } }] }) },
    webhookEndpoints: { list: async function* () { yield { url: 'https://example.invalid/api/billing/webhook', status: 'enabled', enabled_events: [...REQUIRED_BILLING_EVENTS] }; } },
    prices: { retrieve: async id => ({ active: true, currency: 'brl', livemode: false, type: id === 'price_pass' ? 'one_time' : 'recurring', recurring: { interval: 'month', interval_count: 1 } }) },
    billingPortal: { configurations: { retrieve: async () => ({ active: true, livemode: false, features: {
      subscription_cancel: { enabled: true, mode: 'immediately' }, invoice_history: { enabled: true }, payment_method_update: { enabled: true }
    } }), list: async () => ({ data: [] }) } }
  };
  const check = await checkBilling(fake, 'https://example.invalid/api/billing/webhook');
  assert.equal(check.portal.active, true); assert.equal(check.portal.modeMatches, true);
  assert.equal(check.environment.modeMatches, true); assert(check.prices.every(price => price.valid));
  assert.deepEqual(check.webhook.missingEvents, []);
  assert.equal(JSON.stringify(check).includes('sensitive_marker'), false, 'diagnóstico não revela chave');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  const mismatch = await checkBilling(fake, 'https://example.invalid/api/billing/webhook');
  assert.equal(mismatch.environment.modeMatches, false); assert(mismatch.prices.every(price => !price.valid));
  delete process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  assert.equal((await checkBilling(fake)).portal.found, false);
  console.log('Operações: fila isolada, validação, concorrência, evento atual, auditoria e diagnóstico sanitizado passaram.');
} finally {
  await getPool().end().catch(() => {});
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
