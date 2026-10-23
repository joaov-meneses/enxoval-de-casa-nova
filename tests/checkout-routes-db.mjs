// Real Express/PostgreSQL/Stripe SDK against the existing local Postman Stripe mock.
// Start billing.sim.yaml on 4910, then run with DATABASE_URL pointing at local PostgreSQL.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import Stripe from 'stripe';

const connection = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(connection.hostname), 'This test requires local PostgreSQL.');
const simulation = process.env.BILLING_SIMULATION_URL || 'http://127.0.0.1:4910';
Object.assign(process.env, {
  COOKIE_SECURE: 'false', EMAIL_VERIFICATION_REQUIRED: 'false', APP_URL: 'https://casamia.test',
  MAIL_DRIVER: 'memory', STRIPE_SECRET_KEY: 'sk_test_simulation', STRIPE_PRICE_MONTHLY: 'price_monthly',
  STRIPE_PRICE_PASS: 'price_pass', NFSE_NACIONAL_ENABLED: 'false',
  POSTHOG_KEY: '', VITE_POSTHOG_KEY: '', POSTHOG_ENABLE_DEV: 'false', POSTHOG_LOGS: 'false',
  GA4_MEASUREMENT_ID: '', GA4_API_SECRET: '', REDIS_URL: '',
});
const { getPool } = await import('../server/database.ts');
const { migrateDatabase } = await import('../server/migrations.ts');
const { registerApiRoutes } = await import('../server/routes.ts');
const { setStripeClientForTests } = await import('../server/billing.ts');
const control = new pg.Pool({ connectionString: connection.toString(), ssl: false });
const schema = `casamia_checkout_routes_${randomUUID().replaceAll('-', '')}`;
let server;
let created = false;
try {
  assert.equal((await fetch(`${simulation}/v1/test/reset`, { method: 'POST' })).status, 200);
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  connection.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = connection.toString();
  process.env.DATABASE_SSL = 'false';
  await migrateDatabase();
  const endpoint = new URL(simulation);
  setStripeClientForTests(new Stripe('sk_test_simulation', {
    host: endpoint.hostname, port: Number(endpoint.port), protocol: 'http', maxNetworkRetries: 0,
  }));
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';
  const call = async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body),
    });
    const session = response.headers.getSetCookie().find(value => value.startsWith('enxoval_session='));
    if (session) cookie = session.split(';')[0];
    const data = await response.json();
    return { status: response.status, data };
  };
  assert.equal((await call('/auth/register', { email: 'checkout-route@example.invalid', password: 'Local-test-password-123' })).status, 201);
  for (const returnTo of ['/app/home/plano', '/app/home/plano', '/app/other/itens/office', 'https://evil.invalid/app']) {
    const result = await call('/billing/checkout', { plan: 'monthly', returnTo });
    assert.equal(result.status, 200, JSON.stringify(result.data));
  }
  assert.equal((await call('/billing/checkout', { plan: 'pass' })).status, 200);
  const requests = await (await fetch(`${simulation}/v1/test/requests`)).json();
  const checkouts = requests.filter(request => request.path === '/checkout/sessions').map(request => new URLSearchParams(request.body));
  const monthly = checkouts.filter(body => body.get('mode') === 'subscription');
  assert.equal(monthly.length, 3, 'same path reuses the session; changed paths create a different return target');
  for (const [index, path] of ['/app/home/plano', '/app/other/itens/office', '/app'].entries()) {
    assert.equal(monthly[index].get('success_url'), `https://casamia.test${path}?assinatura=sucesso&plano=monthly&session_id={CHECKOUT_SESSION_ID}`);
    assert.equal(monthly[index].get('cancel_url'), `https://casamia.test${path}?assinatura=cancelada`);
  }
  const pass = checkouts.find(body => body.get('mode') === 'payment');
  assert.equal(pass.get('cancel_url'), 'https://casamia.test/app?assinatura=cancelada');
  assert.equal(requests.filter(request => request.path === '/customers').length, 1);
  console.log('PASS: real checkout preserves workspace/screen, caches by return path and rejects external redirects (local Postman simulation).');
} finally {
  setStripeClientForTests(null);
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
