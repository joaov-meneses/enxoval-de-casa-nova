// Validação destrutiva SOMENTE sobre fixtures próprias em staging/Stripe TEST.
// Preparação: node --check scripts/validate-staging-billing.mjs (não acessa serviços).
// Execução autorizada: node scripts/validate-staging-billing.mjs --execute-staging
// Confirmação do Checkout reproduz a fixture oficial da Stripe CLI, sem PAN:
// https://github.com/stripe/stripe-cli/blob/master/pkg/fixtures/triggers/checkout.session.completed.json
// Mensal/trial não é criado: evitar notificações transacionais reais do staging.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import pg from 'pg';
import Stripe from 'stripe';

const PROJECT = 'b0108f6e-16c3-44ff-ad49-e7078aa3945a';
const APP_SERVICE = 'b3a221a4-11d6-4e67-bfe5-b6191ecaf1ba';
const PG_SERVICE = '1727d2a4-7306-4217-84de-cc1bbaa2df4e';
const STAGING = 'https://larume-staging.up.railway.app';
const ACCOUNT = 'acct_1UQcAPIzzRKYM0sE';
const RAILWAY = 'C:/Users/Jeoston Junior/AppData/Roaming/npm/node_modules/@railway/cli/bin/railway.js';
const CLI_VERSION = '1.55.8';
// Digest publicado na release oficial v1.55.8 do stripe/stripe-cli no GitHub.
const CLI_SHA256 = 'd0650b491dcccab3b38ee807b6ee239713a8fff071818d672ec967abea60efed';
const report = { runId: randomUUID(), environment: 'staging', stripeMode: 'test', checks: {}, cleanup: {}, monthly: 'não exercitado: notificações reais do trial não fazem parte desta validação' };
let phase = 'arguments', pool, stripe, temporary, seeded = false, customerId, sessionId, chargeId, paymentIntentId;
const cookieJar = new Map();
const email = `casamia-billing-${report.runId}@example.invalid`;
const password = randomBytes(32).toString('base64url');
const userId = randomUUID();

function variables(service, environment) {
  // Valores capturados em memória; nunca imprimir stdout/stderr desta chamada.
  return JSON.parse(execFileSync(process.execPath, [RAILWAY, 'variable', 'list', '--project', PROJECT,
    '--service', service, '--environment', environment, '--json'], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe'] }));
}
const dbIdentity = value => { const url = new URL(value); return `${url.hostname}:${url.port || '5432'}${url.pathname}`; };
const idOf = value => typeof value === 'string' ? value : value?.id;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  do { const result = await check(); if (result) return result; await pause(1_000); } while (Date.now() < deadline);
  throw new Error(`timeout:${label}`);
}
async function api(path, method = 'GET', body) {
  assert(path.startsWith('/api/'));
  const response = await fetch(STAGING + path, { method, redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { 'content-type': 'application/json', origin: STAGING,
      cookie: [...cookieJar].map(([key, value]) => `${key}=${value}`).join('; ') },
    body: body === undefined ? undefined : JSON.stringify(body) });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0], separator = pair.indexOf('=');
    cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  assert(response.ok, `app:${path}:${response.status}`);
  return response.json();
}
async function cliBinary() {
  assert.equal(process.platform, 'win32', 'Preparação do CLI neste script suporta Windows somente.');
  temporary = await mkdtemp(join(tmpdir(), 'casamia-stripe-staging-'));
  const response = await fetch(`https://github.com/stripe/stripe-cli/releases/download/v${CLI_VERSION}/stripe_${CLI_VERSION}_windows_x86_64.zip`, { signal: AbortSignal.timeout(60_000) });
  assert(response.ok, 'download oficial do CLI indisponível');
  const archive = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(archive).digest('hex'), CLI_SHA256, 'checksum do CLI divergente');
  const zip = join(temporary, 'stripe.zip'), destination = join(temporary, 'bin');
  await writeFile(zip, archive); await mkdir(destination);
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Expand-Archive -LiteralPath $env:CM_TEST_CLI_ZIP -DestinationPath $env:CM_TEST_CLI_DEST'],
  { env: { ...process.env, CM_TEST_CLI_ZIP: zip, CM_TEST_CLI_DEST: destination }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
  const binary = join(destination, 'stripe.exe');
  const version = execFileSync(binary, ['version'], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert(version.includes(CLI_VERSION), 'CLI instalado difere da versão verificada');
  return binary;
}
async function assertOwnCustomer(id) {
  const customer = await stripe.customers.retrieve(id);
  assert(!customer.deleted && customer.livemode === false && customer.email === email && customer.metadata.userId === userId,
    'cliente não pertence à fixture atual');
  return customer;
}
async function cleanup() {
  if (!seeded || !pool) return;
  const fixture = (await pool.query('SELECT id,email,stripe_customer_id FROM users WHERE id=$1', [userId])).rows[0];
  assert(fixture && fixture.email === email, 'fixture SQL não corresponde ao proprietário esperado');
  customerId ??= fixture.stripe_customer_id;
  // Se o checkout falhar depois de criar o cliente e antes de gravá-lo, buscar pelo e-mail sintético único.
  const ownCustomers = customerId ? [await assertOwnCustomer(customerId)]
    : (await stripe.customers.list({ email, limit: 10 })).data.filter(c => c.metadata.userId === userId && !c.livemode);
  assert(ownCustomers.length <= 1, 'mais de um cliente inesperado; requer revisão limitada à fixture');
  for (const customer of ownCustomers) {
    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 20 });
    for (const session of sessions.data) {
      assert(session.livemode === false && idOf(session.customer) === customer.id);
      if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
      if (session.payment_status === 'paid' && idOf(session.payment_intent)) {
        const intent = await stripe.paymentIntents.retrieve(idOf(session.payment_intent));
        assert(intent.livemode === false && idOf(intent.customer) === customer.id);
        const charge = await stripe.charges.retrieve(idOf(intent.latest_charge));
        assert(!charge.livemode && idOf(charge.customer) === customer.id);
        if (charge.amount_refunded < charge.amount) await stripe.refunds.create({ payment_intent: intent.id,
          amount: charge.amount - charge.amount_refunded, metadata: { casamia_validation_run: report.runId } },
        { idempotencyKey: `casamia-staging-cleanup-${report.runId}-${charge.id}` });
      }
    }
    await stripe.customers.del(customer.id);
  }
  report.cleanup.stripeCustomerDeleted = true;
  // Charge/Refund/Checkout de TEST permanecem como histórico financeiro do provedor.
  report.cleanup.stripeTestFinancialHistoryRetained = true;
  const client = await pool.connect();
  let fiscalLocked = false;
  try {
    // Mesmo lock do worker fiscal: impedir que materialize a fixture enquanto é removida.
    await client.query("SET lock_timeout='15s'");
    await client.query('SELECT pg_advisory_lock(726351912)');
    fiscalLocked = true;
    await client.query('BEGIN');
    const owned = await client.query('SELECT id FROM users WHERE id=$1 AND email=$2 FOR UPDATE', [userId, email]);
    assert.equal(owned.rowCount, 1);
    const issued = await client.query("SELECT id FROM fiscal_invoices WHERE user_id=$1 AND (authorized_xml IS NOT NULL OR status='authorized' OR submitted_at IS NOT NULL)", [userId]);
    assert.equal(issued.rowCount, 0, 'documento fiscal transmitido: preservado para revisão');
    await client.query('DELETE FROM feedback WHERE user_id=$1', [userId]);
    if (sessionId) await client.query("DELETE FROM fiscal_billing_events WHERE environment='homologacao' AND event->'data'->'object'->>'id'=$1", [sessionId]);
    await client.query('DELETE FROM fiscal_attempts WHERE invoice_id IN (SELECT id FROM fiscal_invoices WHERE user_id=$1)', [userId]);
    await client.query('DELETE FROM fiscal_manual_releases WHERE invoice_id IN (SELECT id FROM fiscal_invoices WHERE user_id=$1)', [userId]);
    await client.query("DELETE FROM fiscal_invoices WHERE user_id=$1 AND environment='homologacao'", [userId]);
    if (chargeId) {
      const reviewed = await client.query(`UPDATE billing_refund_cases SET review_status='reviewed', reviewed_at=now(),
        review_note=$2,updated_at=now() WHERE environment='homologacao' AND charge_id=$1 AND review_status='pending'
        RETURNING last_event_id`, [chargeId, `Limpeza da validação sintética ${report.runId}; Stripe TEST e fixture de acesso removida.`]);
      if (reviewed.rowCount) await client.query(`INSERT INTO billing_operation_audit(id,action,environment,source_id,note)
        VALUES($1,'review_refund','homologacao',$2,$3)`, [randomUUID(), chargeId, `Validação sintética ${report.runId}; último evento ${reviewed.rows[0].last_event_id}.`]);
    }
    await client.query('DELETE FROM users WHERE id=$1 AND email=$2', [userId, email]);
    await client.query('COMMIT');
    report.cleanup.syntheticUserAndFeedbackDeleted = true;
    report.cleanup.testRefundReviewAudited = Boolean(chargeId);
    report.cleanup.eventDeduplicationRetained = true;
    report.cleanup.laterTestRefundEventsMayReopenReview = Boolean(chargeId);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { if (fiscalLocked) await client.query('SELECT pg_advisory_unlock(726351912)'); client.release(); }
}

if (!process.argv.includes('--execute-staging')) {
  console.log('Preparado. Execute somente após revisão: node scripts/validate-staging-billing.mjs --execute-staging');
} else {
  try {
    phase = 'guards';
    const app = variables(APP_SERVICE, 'staging'), database = variables(PG_SERVICE, 'staging');
    const productionDatabase = variables(PG_SERVICE, 'production'); // Só leitura de configuração; nunca conecta em produção.
    assert.equal(app.APP_URL?.replace(/\/$/, ''), STAGING);
    assert(/^(sk|rk)_test_/.test(app.STRIPE_SECRET_KEY || ''), 'chave Stripe deve ser TEST');
    assert.equal(app.NFSE_NACIONAL_ENABLED === 'true', false, 'emissão fiscal precisa estar desligada');
    assert(!app.FEEDBACK_TO_EMAIL?.trim(), 'avisos reais da central precisam estar sem destinatário em staging');
    assert.notEqual(dbIdentity(database.DATABASE_PUBLIC_URL), dbIdentity(productionDatabase.DATABASE_PUBLIC_URL), 'banco de staging coincide com produção');
    assert.equal(dbIdentity(app.DATABASE_URL), dbIdentity(database.DATABASE_URL), 'app não aponta para PostgreSQL de staging');
    stripe = new Stripe(app.STRIPE_SECRET_KEY, { maxNetworkRetries: 1, timeout: 30_000 });
    assert.equal((await stripe.accounts.retrieve()).id, ACCOUNT, 'conta Stripe TEST diferente da esperada');
    const price = await stripe.prices.retrieve(app.STRIPE_PRICE_PASS);
    assert(price.active && !price.livemode && price.type === 'one_time' && price.currency === 'brl');
    const endpoint = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find(e => e.url === STAGING + '/api/billing/webhook');
    assert(endpoint?.status === 'enabled' && !endpoint.livemode, 'webhook de staging não está habilitado');
    for (const type of ['checkout.session.completed', 'charge.refunded', 'refund.created', 'refund.updated'])
      assert(endpoint.enabled_events.includes(type) || endpoint.enabled_events.includes('*'), `evento ausente:${type}`);
    const binary = await cliBinary();
    pool = new pg.Pool({ connectionString: database.DATABASE_PUBLIC_URL, max: 2, connectionTimeoutMillis: 15_000,
      ssl: /sslmode=(require|verify-full)/.test(database.DATABASE_PUBLIC_URL) ? { rejectUnauthorized: true } : undefined });
    assert((await pool.query("SELECT to_regclass('public.billing_refund_cases') AS cases")).rows[0].cases, 'schema de cobrança indisponível');
    report.checks.guards = true;
    phase = 'synthetic-user';
    const salt = randomBytes(16).toString('hex');
    const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    await pool.query(`INSERT INTO users(id,name,email,password_hash,email_verified_at,onboarding_completed_at,marketing_consent_at)
      VALUES($1,'Validação sintética de cobrança',$2,$3,now(),now(),NULL)`, [userId, email, hash]);
    seeded = true;
    phase = 'login-checkout';
    await api('/api/auth/login', 'POST', { email, password });
    await api('/api/billing/checkout', 'POST', { plan: 'pass', returnTo: '/app' });
    customerId = (await pool.query('SELECT stripe_customer_id FROM users WHERE id=$1', [userId])).rows[0].stripe_customer_id;
    await assertOwnCustomer(customerId);
    const session = (await stripe.checkout.sessions.list({ customer: customerId, limit: 10 })).data
      .find(s => s.metadata?.userId === userId && s.metadata?.plan === 'pass' && s.status === 'open');
    assert(session && !session.livemode && session.mode === 'payment' && session.amount_total === price.unit_amount);
    sessionId = session.id;
    report.checks.checkoutCreatedByApp = true;
    phase = 'official-cli-confirm';
    const fixture = { _meta: { template_version: 0 }, fixtures: [
      { name: 'payment_page', path: `/v1/payment_pages/${sessionId}`, method: 'get' },
      { name: 'payment_method', path: '/v1/payment_methods', method: 'post', params: {
        type: 'card', card: { token: 'tok_visa' }, metadata: { casamia_validation_run: report.runId },
        billing_details: { email, name: 'Validação sintética Casa Mia', address: { country: 'BR', postal_code: '01001000' } } } },
      { name: 'payment_page_confirm', path: `/v1/payment_pages/${sessionId}/confirm`, method: 'post', params: {
        payment_method: '${payment_method:id}', expected_amount: session.amount_total } }
    ] };
    const fixtureFile = join(temporary, 'fixture.json');
    await writeFile(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
    execFileSync(binary, ['fixtures', fixtureFile, '--config', join(temporary, 'config.toml')],
      { env: { ...process.env, STRIPE_API_KEY: app.STRIPE_SECRET_KEY, XDG_CONFIG_HOME: join(temporary, 'config') },
        timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2_000_000 });
    const paid = await until(async () => {
      const current = await stripe.checkout.sessions.retrieve(sessionId);
      assert(!current.livemode && idOf(current.customer) === customerId);
      return current.status === 'complete' && current.payment_status === 'paid' ? current : null;
    }, 'checkout-paid');
    paymentIntentId = idOf(paid.payment_intent);
    report.checks.testPaymentCompleted = true;
    phase = 'real-test-webhook';
    // Não consultar status/bootstrap/sync enquanto aguarda: essas rotas podem recuperar
    // um pagamento direto na Stripe e esconder uma falha de concessão pelo webhook.
    const granted = await until(async () => (await pool.query(`SELECT u.pass_expires_at
      FROM users u WHERE u.id=$1 AND u.email=$2 AND u.stripe_customer_id=$3
      AND u.pass_expires_at > now() AND u.billing_snapshot->'passPayment'->>'sessionId'=$4
      AND EXISTS (SELECT 1 FROM stripe_events e JOIN fiscal_billing_events f ON f.event_id=e.id
        WHERE f.environment='homologacao' AND f.event->'data'->'object'->>'id'=$4
        AND e.type='checkout.session.completed')`, [userId, email, customerId, sessionId])).rows[0], 'access-by-webhook');
    const months = (new Date(granted.pass_expires_at).getTime() - Date.now()) / 86_400_000;
    assert(months > 360 && months < 370, 'Passe não concedeu doze meses');
    // Somente depois da prova SQL, confirmar o que a API apresenta ao cliente.
    const status = await api('/api/billing/status');
    assert(status.plan === 'pass' && status.accessAllowed);
    assert.equal(Date.parse(status.passExpiresAt), new Date(granted.pass_expires_at).getTime());
    report.checks.realTestWebhookAndTwelveMonths = true;
    phase = 'portal-and-refund-request';
    const portal = await api('/api/billing/portal', 'POST');
    assert.equal(new URL(portal.url).hostname, 'billing.stripe.com');
    const feedback = await api('/api/feedback', 'POST', { kind: 'other', area: 'account', contactOk: true,
      title: 'Pedido de arrependimento e reembolso', description: `Solicito cancelamento e reembolso. Validação sintética ${report.runId}, sem cliente real.` });
    assert.equal((await pool.query('SELECT id FROM feedback WHERE id=$1 AND user_id=$2', [feedback.id, userId])).rowCount, 1);
    report.checks.portalAndRefundProtocol = true;
    phase = 'test-refund';
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    assert(!intent.livemode && idOf(intent.customer) === customerId && intent.status === 'succeeded');
    chargeId = idOf(intent.latest_charge);
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId, metadata: { casamia_validation_run: report.runId } },
      { idempotencyKey: `casamia-staging-refund-${report.runId}` });
    await until(async () => (await stripe.refunds.retrieve(refund.id)).status === 'succeeded', 'refund-succeeded');
    await until(async () => (await pool.query("SELECT charge_id FROM billing_refund_cases WHERE environment='homologacao' AND charge_id=$1 AND review_status='pending'", [chargeId])).rowCount === 1, 'refund-webhook');
    // Esperar os dois eventos esperados de uma devolução imediata antes de limpar a fixture.
    const refundEvents = await until(async () => {
      const events = (await stripe.events.list({ types: ['refund.created', 'refund.updated', 'charge.refunded'], limit: 100 })).data
        .filter(e => !e.livemode && (e.type === 'charge.refunded' ? e.data.object.id === chargeId : e.data.object.id === refund.id));
      return events.some(e => e.type === 'refund.created') && events.some(e => e.type === 'charge.refunded') ? events : null;
    }, 'refund-events-created');
    await until(async () => (await pool.query('SELECT count(*)::int AS n FROM stripe_events WHERE id=ANY($1::text[])',
      [refundEvents.map(e => e.id)])).rows[0].n === refundEvents.length, 'refund-events-delivered');
    const after = await api('/api/billing/status');
    assert(after.plan === 'pass' && after.accessAllowed, 'estorno não pode revogar automaticamente o acesso');
    report.checks.testRefundAndPendingReview = true;
    report.checks.noAutomaticAccessRevocation = true;
    report.passed = true;
  } catch {
    report.passed = false; report.failedPhase = phase; process.exitCode = 1;
  } finally {
    try { await cleanup(); } catch { report.cleanup.failed = true; process.exitCode = 1; }
    await pool?.end();
    cookieJar.clear();
    if (temporary) {
      const target = resolve(temporary), inside = relative(resolve(tmpdir()), target);
      if (inside && !inside.startsWith('..') && !isAbsolute(inside) && basename(target).startsWith('casamia-stripe-staging-'))
        await rm(target, { recursive: true, force: true });
      else { report.cleanup.temporaryPathRejected = true; process.exitCode = 1; }
    }
    // Somente resultado sanitizado. Não imprimir erros SDK/CLI, chaves, cookies, senhas ou URLs de sessão.
    console.log(JSON.stringify(report, null, 2));
  }
}
