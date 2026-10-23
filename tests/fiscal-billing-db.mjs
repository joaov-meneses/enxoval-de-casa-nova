// Pré-requisito: postman simulation run postman/simulations/billing.sim.yaml --port 4910 --no-history
// PostgreSQL isolado, SDK Stripe e transporte HTTP reais; certificado sintético, sem emissão real.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import express from 'express';
import pg from 'pg';
import Stripe from 'stripe';
import { getPool } from '../server/database.ts';
import { migrateDatabase } from '../server/migrations.ts';
import { registerApiRoutes } from '../server/routes.ts';
import { registerBillingWebhook, setStripeClientForTests } from '../server/billing.ts';
import { runFiscalInvoices } from '../server/fiscal/service.ts';
import { fiscalConfig, fiscalDocumentUrl, validTaxDocument } from '../server/fiscal/provider.ts';
import { reconcileBilling, reviewRefund, enqueueMissingFiscal, syncFiscalInvoice } from '../server/billingOperations.ts';

const simulation = process.env.BILLING_SIMULATION_URL || 'http://127.0.0.1:4910';
const connection = new URL(process.env.DATABASE_URL);
const control = new pg.Pool({ connectionString: connection.toString(), ssl: process.env.DATABASE_SSL === 'true' || connection.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : undefined });
const schema = `casamia_fiscal_test_${randomUUID().replaceAll('-', '')}`;
let server;
let created = false;
const taxConfig = { cnpj: '04252011000110', municipio: '2905701', municipioPrestacao: '2905701', serie: '40000', primeiroNumero: '1',
  opSimpNac: '3', regApTribSN: '1', regEspTrib: '0', cTribNac: '010701', descricao: 'Servi?o de teste', tribISSQN: '1', tpRetISSQN: '1', pTotTribSN: '6.00' };
try {
  for (const route of ['national', 'v1']) assert.equal((await fetch(`${simulation}/${route}/test/reset`, { method: 'POST', signal: AbortSignal.timeout(10_000) })).status, 200);
  await control.query(`CREATE SCHEMA "${schema}"`); created = true;
  connection.searchParams.set('options', `-c search_path=${schema}`);
  Object.assign(process.env, { DATABASE_URL: connection.toString(), COOKIE_SECURE: 'false', EMAIL_VERIFICATION_REQUIRED: 'false',
    APP_URL: 'https://casamia.test', MAIL_DRIVER: 'memory', STRIPE_SECRET_KEY: 'sk_test_simulation', STRIPE_WEBHOOK_SECRET: 'whsec_fiscal_test',
    STRIPE_PRICE_MONTHLY: 'price_monthly', STRIPE_PRICE_PASS: 'price_pass', STRIPE_PIX_ENABLED: 'true',
    NFSE_NACIONAL_ENABLED: 'true', NFSE_NACIONAL_ENVIRONMENT: 'homologacao', NFSE_NACIONAL_ISSUER_ENABLED: 'true',
    NFSE_NACIONAL_CERT_PATH: 'tests/fixtures/nfse/test-cert.pem', NFSE_NACIONAL_KEY_PATH: 'tests/fixtures/nfse/test-key.pem',
    NFSE_NACIONAL_ALLOW_LOCAL_SIMULATION: 'true', NFSE_NACIONAL_BASE_URL: `${simulation}/national`,
    NFSE_NACIONAL_REQUIRE_ADDRESS: 'false', NFSE_NACIONAL_TAX_CONFIG: JSON.stringify(taxConfig),
    NFSE_NACIONAL_ISSUE_ON: 'payment_confirmed', NFSE_NACIONAL_COMPETENCE: 'payment_date', NFSE_NACIONAL_ACCOUNTING_REFERENCE: 'Orientação contábil fictícia de teste',
    GA4_MEASUREMENT_ID: '', GA4_API_SECRET: '', POSTHOG_KEY: '', VITE_POSTHOG_KEY: '' });
  await migrateDatabase();
  const endpoint = new URL(simulation);
  const stripe = new Stripe('sk_test_simulation', { host: endpoint.hostname, port: Number(endpoint.port), protocol: 'http', maxNetworkRetries: 0 });
  setStripeClientForTests(stripe);
  const app = express(); registerBillingWebhook(app); app.use(express.json()); registerApiRoutes(app);
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const query = async (sql, values = []) => (await getPool().query(sql, values)).rows;
  function person() {
    let cookie = '';
    return async (path, method = 'GET', body) => {
      const response = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
      const session = response.headers.getSetCookie().find(value => value.startsWith('enxoval_session='));
      if (session) cookie = session.split(';')[0];
      return { status: response.status, headers: response.headers, data: response.status === 204 ? null : response.headers.get('content-type')?.includes('application/xml') ? await response.text() : await response.json() };
    };
  }
  let eventId = 0;
  async function event(type, object, id = `evt_fiscal_${++eventId}`, secret = 'whsec_fiscal_test', created = Math.floor(Date.now() / 1000)) {
    const payload = JSON.stringify({ id, object: 'event', type, created, data: { object } });
    return fetch(`${base}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'Stripe-Signature': stripe.webhooks.generateTestHeaderString({ payload, secret }) }, body: payload });
  }
  const owner = person(); const stranger = person();
  const signup = await owner('/auth/register', 'POST', { email: 'fiscal@example.invalid', password: 'Senha-segura-123456789' });
  assert.equal(signup.status, 201); const userId = signup.data.user.id;
  assert.equal((await stranger('/auth/register', 'POST', { email: 'outro-fiscal@example.invalid', password: 'Senha-segura-123456789' })).status, 201);
  assert.equal((await person()('/billing/fiscal')).status, 401);
  const offers = await owner('/billing/plans');
  assert.deepEqual(offers.data.offers.find(offer => offer.id === 'pass').paymentMethods, ['card', 'pix']);
  assert.deepEqual(offers.data.offers.find(offer => offer.id === 'monthly').paymentMethods, ['card']);
  assert.equal((await owner('/billing/checkout', 'POST', { plan: 'pass' })).status, 200);
  assert.equal((await owner('/billing/checkout', 'POST', { plan: 'monthly' })).status, 200);
  const stripeRequests = await (await fetch(`${simulation}/v1/test/requests`)).json();
  const checkouts = stripeRequests.filter(request => request.path === '/checkout/sessions').map(request => new URLSearchParams(request.body));
  const passCheckout = checkouts.find(body => body.get('mode') === 'payment');
  const monthlyCheckout = checkouts.find(body => body.get('mode') === 'subscription');
  assert.deepEqual(passCheckout.getAll('allowed_payment_method_types[0]'), ['card']);
  assert.equal(passCheckout.get('allowed_payment_method_types[1]'), 'pix');
  assert.equal(passCheckout.get('payment_method_options[pix][expires_after_seconds]'), '3600');
  assert.equal(monthlyCheckout.get('allowed_payment_method_types[0]'), 'card');
  assert.equal(monthlyCheckout.has('allowed_payment_method_types[1]'), false);
  assert.equal(monthlyCheckout.get('subscription_data[trial_period_days]'), '2');
  assert.equal(passCheckout.get('custom_fields[0][key]'), 'fiscal_document');
  assert.equal(passCheckout.get('billing_address_collection'), 'required');
  const pass = { id: 'cs_pix_paid', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 8900, currency: 'brl',
    client_reference_id: userId, customer: 'cus_simulation', metadata: { userId, plan: 'pass' },
    customer_details: { name: 'Pessoa de Teste', email: 'fiscal@example.invalid' },
    custom_fields: [{ key: 'fiscal_document', type: 'numeric', numeric: { value: '52998224725' } }] };
  assert.equal((await event('checkout.session.completed', { ...pass, payment_status: 'unpaid' })).status, 200);
  await runFiscalInvoices();
  assert.equal((await query('SELECT id FROM fiscal_invoices')).length, 0);
  assert.equal((await event('checkout.session.async_payment_succeeded', pass, 'evt_paid')).status, 200);
  assert.equal((await event('checkout.session.async_payment_succeeded', pass, 'evt_paid')).status, 200);
  assert.equal((await event('checkout.session.completed', pass)).status, 200);
  assert.equal((await query('SELECT id FROM fiscal_invoices')).length, 0, 'webhook só grava inbox');
  assert.equal((await runFiscalInvoices()).authorized, 1);
  assert.equal((await query('SELECT id FROM fiscal_invoices')).length, 1, 'deduplica por pagamento e evento');
  assert.equal((await event('checkout.session.async_payment_succeeded', { ...pass, id: 'cs_forged' }, undefined, 'wrong-secret')).status, 400);
  await query("UPDATE users SET stripe_subscription_id='sub_fiscal' WHERE id=$1", [userId]);
  const now = Math.floor(Date.now()/1000);
  const invoice = { id: 'in_first', object: 'invoice', status: 'paid', amount_paid: 2990, currency: 'brl', customer: 'cus_simulation',
    customer_name: 'Pessoa de Teste', customer_email: 'fiscal@example.invalid', status_transitions: { paid_at: now },
    lines: { has_more: false, data: [{ period: { start: now-3600, end: now+86400 } }] },
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_fiscal', metadata: { userId } } } };
  await event('checkout.session.completed', { ...pass, id: 'cs_monthly', mode: 'subscription', metadata: { userId, plan: 'monthly' } });
  await event('invoice.paid', { ...invoice, id: 'in_trial', amount_paid: 0 });
  await event('invoice.paid', invoice); await event('invoice.paid', invoice);
  await event('invoice.paid', { ...invoice, id: 'in_renewal' });
  const concurrent = await Promise.all([runFiscalInvoices(), runFiscalInvoices()]);
  assert.equal(concurrent.reduce((sum,r)=>sum+r.authorized,0),2, 'lock coordena workers concorrentes');
  assert.equal((await query('SELECT id FROM fiscal_invoices')).length,3);
  const fiscal = await owner('/billing/fiscal');
  assert.match(fiscal.headers.get('cache-control'), /no-store/);
  assert.equal(fiscal.data.invoices.length,3);
  const authorizedId = (await query("SELECT id FROM fiscal_invoices WHERE source_id='in_first'"))[0].id;
  assert.equal((await stranger('/billing/fiscal')).data.invoices.length,0);
  assert.equal((await stranger(`/billing/fiscal/${authorizedId}/xml`)).status,404);
  const ownXml = await owner(`/billing/fiscal/${authorizedId}/xml`);
  assert.equal(ownXml.status,200); assert.match(ownXml.data,/<NFSe /); assert.match(ownXml.headers.get('cache-control'),/no-store/);
  const download = await fetch(`${base}/api/billing/fiscal/${authorizedId}/xml`);
  assert.equal(download.status,401);
  let requests = await (await fetch(`${simulation}/national/test/requests`)).json();
  const posts = () => requests.filter(r=>r.method==='POST');
  assert.equal(posts().length,3);
  const posted = typeof posts()[0].body === 'string' ? JSON.parse(posts()[0].body) : posts()[0].body;
  assert.deepEqual(Object.keys(posted),['dpsXmlGZipB64']);
  const xml = gunzipSync(Buffer.from(posted.dpsXmlGZipB64,'base64')).toString('utf8');
  assert.match(xml,/<vServ>89.00<\/vServ>/); assert.match(xml,/<CPF>52998224725<\/CPF>/);
  const doc = new DOMParser().parseFromString(xml,'text/xml');
  const verifier = new SignedXml({ publicCert: fiscalConfig().cert, getCertFromKeyInfo: () => null });
  verifier.loadSignature(doc.getElementsByTagName('Signature')[0]);
  assert.equal(verifier.checkSignature(xml),true,'assinatura criptográfica válida');
  assert.equal(verifier.checkSignature(xml.replace('89.00','99.00')),false,'alteração invalida assinatura');
  async function mode(value) { await fetch(`${simulation}/national/test/mode`, { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:value}) }); }
  const due = () => query('UPDATE fiscal_invoices SET next_attempt_at=now()');
  for (const failure of ['unavailable','html-error','accepted-error','accepted-timeout','malformed-success']) {
    await mode(failure);
    process.env.NFSE_NACIONAL_TIMEOUT_MS = failure === 'accepted-timeout' ? '150' : '15000';
    const source = `in_${failure}`;
    assert.equal((await event('invoice.paid',{...invoice,id:source})).status,200);
    assert.equal((await runFiscalInvoices()).failed,1,failure);
    const failed = (await query('SELECT * FROM fiscal_invoices WHERE source_id=$1',[source]))[0];
    assert.equal(failed.status,'processing');
    assert.ok(failed.error_code);
    const saved = failed.payload;
    await mode('normal'); process.env.NFSE_NACIONAL_TIMEOUT_MS='15000'; await due();
    assert.equal((await runFiscalInvoices()).authorized,1,`recuperação ${failure}`);
    const recovered = (await query('SELECT * FROM fiscal_invoices WHERE source_id=$1',[source]))[0];
    assert.equal(recovered.dps_id,failed.dps_id);
    if (saved) assert.deepEqual(recovered.payload,saved,'reutiliza os mesmos bytes após falha ambígua');
    requests = await (await fetch(`${simulation}/national/test/requests`)).json();
    const issued = posts().filter(r=> {
      const body = typeof r.body==='string'?JSON.parse(r.body):r.body;
      return gunzipSync(Buffer.from(body.dpsXmlGZipB64,'base64')).toString().includes(failed.dps_id);
    });
    assert.equal(issued.length,1,`nenhum POST duplicado: ${failure}`);
  }
  assert.equal((await owner('/billing/status')).data.accessAllowed,true,'falha fiscal conserva acesso pago');
  await mode('normal');
  // Mesmo com emissão/configuração inválida, pagamento e obrigação sobrevivem.
  process.env.NFSE_NACIONAL_TAX_CONFIG='invalid-json';
  assert.equal((await event('checkout.session.async_payment_succeeded',{...pass,id:'cs_invalid_config'})).status,200);
  assert.equal((await runFiscalInvoices()).skipped,true);
  assert.equal((await query("SELECT error_code FROM fiscal_invoices WHERE source_id='cs_invalid_config'"))[0].error_code,'FISCAL_CONFIGURATION');
  process.env.NFSE_NACIONAL_TAX_CONFIG=JSON.stringify(taxConfig); await due(); await runFiscalInvoices();
  // Conta desconhecida: registra pendência sem erro no webhook, recupera após associação.
  await event('invoice.paid',{...invoice,id:'in_out_of_order',customer:'cus_later'});
  await runFiscalInvoices();
  assert.equal((await query("SELECT error_code FROM fiscal_billing_events WHERE event->'data'->'object'->>'id'='in_out_of_order'"))[0].error_code,'FISCAL_BILLING_ACCOUNT_NOT_READY');
  await query("UPDATE users SET stripe_customer_id='cus_later' WHERE id=$1",[userId]);
  await query('UPDATE fiscal_billing_events SET next_attempt_at=now()'); await runFiscalInvoices();
  assert.equal((await query("SELECT status FROM fiscal_invoices WHERE source_id='in_out_of_order'"))[0].status,'authorized');
  await query("UPDATE users SET stripe_customer_id='cus_simulation',fiscal_profile='{}'::jsonb WHERE id=$1",[userId]);
  await event('invoice.paid',{...invoice,id:'in_missing',customer_name:null}); await runFiscalInvoices();
  assert.equal((await query("SELECT status FROM fiscal_invoices WHERE source_id='in_missing'"))[0].status,'needs_data');
  assert.equal((await owner('/billing/fiscal/profile','PUT',{name:'Pessoa de Teste',document:'11111111111'})).status,400);
  assert.equal((await owner('/billing/fiscal/profile','PUT',{name:'Pessoa de Teste',document:'52998224725'})).status,200);
  assert.equal((await runFiscalInvoices()).authorized,1);
  process.env.NFSE_NACIONAL_REQUIRE_ADDRESS='true';
  await event('invoice.paid',{...invoice,id:'in_address'}); await runFiscalInvoices();
  assert.equal((await query("SELECT status FROM fiscal_invoices WHERE source_id='in_address'"))[0].status,'needs_data');
  const address = { logradouro:'Rua de Teste',numero:'123',bairro:'Centro',codigo_municipio:'3550308',uf:'SP',cep:'01001000' };
  assert.equal((await owner('/billing/fiscal/profile','PUT',{name:'Pessoa de Teste',document:'52998224725',address})).status,200);
  assert.equal((await runFiscalInvoices()).authorized,1);
  await mode('rejected');
  await event('invoice.paid',{...invoice,id:'in_rejected'}); await runFiscalInvoices();
  const rejected = (await query("SELECT * FROM fiscal_invoices WHERE source_id='in_rejected'"))[0];
  assert.equal(rejected.status,'rejected'); assert.equal((await runFiscalInvoices()).processed,0);
  await mode('normal');
  process.env.NFSE_NACIONAL_TAX_CONFIG=JSON.stringify({...taxConfig,descricao:'Descrição corrigida após rejeição definitiva'});
  execFileSync(process.execPath,['--import','tsx','server/workers/runFiscalInvoices.ts','--retry',rejected.id,'--reason','Correção contábil conferida para teste.'],{env:{...process.env,LOG_LEVEL:'silent'}});
  const corrected = (await query('SELECT * FROM fiscal_invoices WHERE id=$1',[rejected.id]))[0];
  assert.equal(corrected.status,'authorized'); assert.equal(corrected.dps_id,rejected.dps_id);
  assert.match(corrected.payload.xml,/Descrição corrigida/);
  process.env.NFSE_NACIONAL_TAX_CONFIG=JSON.stringify(taxConfig);
  assert.throws(()=>execFileSync(process.execPath,['--import','tsx','server/workers/runFiscalInvoices.ts','--retry',authorizedId,'--reason','Tentativa de reemissão indevida.'],{env:{...process.env,LOG_LEVEL:'silent'}}));
  // Emissão no fim do período e competência independentes da data do worker.
  process.env.NFSE_NACIONAL_ISSUE_ON='period_end'; process.env.NFSE_NACIONAL_COMPETENCE='period_start';
  await event('invoice.paid',{...invoice,id:'in_later'}); await runFiscalInvoices();
  const later = (await query("SELECT *,competence::text FROM fiscal_invoices WHERE source_id='in_later'"))[0];
  assert.equal(later.status,'pending'); assert.equal(later.payload,null);
  assert.equal(later.issue_at.getTime(),(now+86400)*1000);
  assert.equal(later.competence,new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date((now-3600)*1000)));
  process.env.NFSE_NACIONAL_ISSUE_ON='manual';
  await event('invoice.paid',{...invoice,id:'in_manual'}); await runFiscalInvoices();
  const manual = (await query("SELECT * FROM fiscal_invoices WHERE source_id='in_manual'"))[0];
  assert.equal(manual.issue_at,null);
  execFileSync(process.execPath,['--import','tsx','server/workers/runFiscalInvoices.ts','--release',manual.id,'--competence','2026-10-01','--reason','Competência e emissão autorizadas para teste.'],{env:{...process.env,LOG_LEVEL:'silent'}});
  assert.equal((await query('SELECT status FROM fiscal_invoices WHERE id=$1',[manual.id]))[0].status,'authorized');
  assert.equal((await query('SELECT reason FROM fiscal_manual_releases WHERE invoice_id=$1',[manual.id])).length,1);
  process.env.NFSE_NACIONAL_ENABLED='false';
  await event('invoice.paid',{...invoice,id:'in_disabled'}); await runFiscalInvoices();
  assert.equal((await query("SELECT status FROM fiscal_invoices WHERE source_id='in_disabled'"))[0].status,'pending','desligar envio não perde obrigação');
  // Origem anterior não é redirecionada para a SEFIN ao migrar.
  await query("UPDATE fiscal_invoices SET provider='legacy_focus',issue_at=now() WHERE source_id='in_disabled'");
  process.env.NFSE_NACIONAL_ENABLED='true'; process.env.NFSE_NACIONAL_ISSUE_ON='payment_confirmed'; process.env.NFSE_NACIONAL_COMPETENCE='payment_date';
  await runFiscalInvoices();
  assert.equal((await query("SELECT status FROM fiscal_invoices WHERE source_id='in_disabled'"))[0].status,'pending');
  assert.equal(validTaxDocument('04252011000110'),true); assert.equal(validTaxDocument('00000000000000'),false);
  assert.equal(fiscalDocumentUrl('javascript:alert(1)',fiscalConfig()),null);
  process.env.NFSE_NACIONAL_ENVIRONMENT='producao'; assert.throws(()=>fiscalConfig());
  process.env.NFSE_NACIONAL_ENVIRONMENT='homologacao';
  await syncFiscalInvoice(authorizedId);
  assert.equal((await query('SELECT status FROM fiscal_invoices WHERE id=$1',[authorizedId]))[0].status,'authorized');
  const refund = {id:'re_partial',object:'refund',charge:'ch_refund',payment_intent:'pi_refund',amount:2000,currency:'brl',status:'succeeded'};
  await event('refund.updated',refund,'evt_refund'); await event('refund.updated',refund,'evt_refund');
  assert.equal((await query('SELECT * FROM billing_refund_cases')).length,1);
  await reviewRefund('homologacao','ch_refund','evt_refund','Conferido com a contabilidade; ajuste fiscal separado.');
  assert.equal((await query('SELECT review_status FROM billing_refund_cases'))[0].review_status,'reviewed');
  const before = (await query('SELECT count(*)::int AS total FROM fiscal_invoices'))[0].total;
  const backfill = {...pass,id:'cs_backfill',livemode:false,created:now-60,payment_intent:'pi_backfill'};
  const fixtures = {pageSize:1,sessions:[{...pass,livemode:false,payment_intent:'pi_refund'},backfill],invoices:[{...invoice,livemode:false}],
    refunds:[refund],charges:[{id:'ch_refund',object:'charge',livemode:false,amount:8900,amount_refunded:2000,refunded:false},
      {id:'ch_backfill',object:'charge',livemode:false,amount:8900,amount_refunded:0,paid:true,disputed:false}],
    intents:[{id:'pi_backfill',object:'payment_intent',latest_charge:'ch_backfill'}],invoicePayments:[]};
  await fetch(`${simulation}/v1/test/fixtures`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fixtures)});
  const report = await reconcileBilling(stripe,{since:now-3600,until:now+3600,refreshFiscal:true});
  assert.equal(report.readOnly,true); assert.equal(report.payments.length,3);
  assert.equal(report.payments.find(p=>p.sourceId===backfill.id).issue,'missing_fiscal_invoice');
  const queued = await enqueueMissingFiscal(stripe,backfill.id,'Conciliação conferida pela contabilidade.',now);
  assert.equal((await query('SELECT source_id FROM fiscal_invoices WHERE id=$1',[queued.queued]))[0].source_id,backfill.id);
  await assert.rejects(()=>enqueueMissingFiscal(stripe,backfill.id,'Conciliação conferida pela contabilidade.',now),/já possui/);
  assert.equal((await query('SELECT count(*)::int AS total FROM fiscal_invoices'))[0].total,before+1);
  console.log('PASS: Stripe, inbox, DPS assinada/XSD, deduplicação, concorrência, recuperação após timeout/5xx, falhas fiscais sem bloqueio, política contábil, dados fiscais, isolamento, estornos e conciliação.');
} finally {
  setStripeClientForTests(null);
  if (server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
