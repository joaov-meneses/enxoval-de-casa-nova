import type Stripe from 'stripe';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { getPool, type Queryable } from './database.ts';
import { fiscalConfig, fiscalEnabled, queryNationalInvoice } from './fiscal/provider.ts';
import { materializeFiscalEvent, saveFiscalAuthorization } from './fiscal/service.ts';

export const REQUIRED_BILLING_EVENTS = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
  'invoice.paid', 'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed'] as const;
export const REFUND_EVENTS = new Set(['charge.refunded', 'refund.created', 'refund.updated', 'refund.failed']);
const idOf = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;
const environmentOf = (live: boolean) => live ? 'producao' : 'homologacao';

/** Apenas registra a pendência. Nenhuma chamada externa, estorno ou alteração de acesso no webhook. */
export async function recordRefundEvent(db: Queryable, event: Stripe.Event) {
  if (!REFUND_EVENTS.has(event.type)) return;
  const object = event.data.object as Stripe.Charge | Stripe.Refund;
  const chargeId = object.object === 'charge' ? object.id : idOf(object.charge);
  if (!chargeId) throw new Error('BILLING_REFUND_CHARGE_REQUIRED');
  await db.query(`INSERT INTO billing_refund_cases (environment, charge_id, payment_intent_id, currency, last_event_id, last_event_created)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (environment, charge_id) DO UPDATE SET payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, billing_refund_cases.payment_intent_id),
      last_event_id = EXCLUDED.last_event_id, last_event_created = EXCLUDED.last_event_created,
      review_status = 'pending', reviewed_at = NULL, updated_at = now()
    WHERE billing_refund_cases.last_event_created <= EXCLUDED.last_event_created`,
  [environmentOf(event.livemode === true), chargeId, idOf(object.payment_intent) || null, object.currency, event.id, event.created]);
}

/** Diagnóstico sanitizado: não inclui chaves, documentos pessoais nem URLs de checkout. */
export async function checkBilling(stripe: Stripe, webhookUrl?: string) {
  const account = await stripe.accounts.retrieve(null);
  const configurations = await stripe.paymentMethodConfigurations.list({ limit: 100 });
  const endpoints = [];
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) endpoints.push(endpoint);
  const expectedUrl = webhookUrl || (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/billing/webhook` : null);
  const endpoint = endpoints.find(e => e.url === expectedUrl);
  const prices = [];
  for (const plan of ['MONTHLY', 'PASS']) {
    const id = process.env[`STRIPE_PRICE_${plan}`];
    if (!id) { prices.push({ plan: plan.toLowerCase(), valid: false }); continue; }
    const price = await stripe.prices.retrieve(id);
    prices.push({ plan: plan.toLowerCase(), valid: price.active && price.currency === 'brl' &&
      (plan === 'PASS' ? price.type === 'one_time' : price.recurring?.interval === 'month' && price.recurring.interval_count === 1), livemode: price.livemode });
  }
  let fiscalConfigurationValid = false;
  try { fiscalConfig(); fiscalConfigurationValid = true; } catch { /* Somente presença/validade; nunca revelar template/token. */ }
  return { account: { id: account.id, country: account.country, chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted },
    prices, pix: configurations.data.filter(c => c.active).map(c => ({ configurationId: c.id, livemode: c.livemode,
      available: c.pix?.available === true, enabled: c.pix?.display_preference.value === 'on' })),
    monthly: 'card', webhook: { found: !!endpoint, enabled: endpoint?.status === 'enabled',
      missingEvents: REQUIRED_BILLING_EVENTS.filter(type => !endpoint?.enabled_events.includes('*') && !endpoint?.enabled_events.includes(type)) },
    fiscal: { enabled: fiscalEnabled(), configurationValid: fiscalConfigurationValid } };
}

/** Cria somente objetos de teste, usando os cenários Pix documentados pela Stripe. */
export async function validateTestPix(stripe: Stripe) {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Validação permitida somente com chave sk_test_.');
  const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_PASS || '');
  if (price.livemode || !price.active || price.currency !== 'brl' || price.type !== 'one_time') throw new Error('Preço de teste do Passe inválido.');
  const session = await stripe.checkout.sessions.create({ mode: 'payment', line_items: [{ price: price.id, quantity: 1 }],
    allowed_payment_method_types: ['card', 'pix'], payment_method_options: { pix: { expires_after_seconds: 3600 } },
    success_url: `${(process.env.APP_URL || 'https://example.com').replace(/\/$/, '')}/?billing=success`, metadata: { purpose: 'billing-readiness-test' } });
  try {
    if (!session.payment_method_types.includes('pix')) throw new Error('Pix ausente no Checkout de teste.');
  } finally { await stripe.checkout.sessions.expire(session.id); }
  const intents = [];
  for (const scenario of ['succeed_immediately', 'expire_immediately']) {
    const intent = await stripe.paymentIntents.create({ amount: 100, currency: 'brl', allowed_payment_method_types: ['pix'], confirm: true,
      payment_method_data: { type: 'pix', billing_details: { name: 'Teste de integração', email: `${scenario}@example.com` } },
      payment_method_options: { pix: { expires_after_seconds: 60 } }, metadata: { purpose: 'billing-readiness-test' } });
    intents.push({ scenario, id: intent.id, status: intent.status, errorCode: intent.last_payment_error?.code });
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    let pending = false;
    for (const item of intents) {
      const intent = await stripe.paymentIntents.retrieve(item.id);
      item.status = intent.status; item.errorCode = intent.last_payment_error?.code;
      if (item.scenario === 'succeed_immediately' ? intent.status !== 'succeeded' : !intent.last_payment_error) pending = true;
    }
    if (!pending) break;
    await delay(1000);
  }
  if (intents[0].status !== 'succeeded' || intents[1].status !== 'requires_payment_method' || !intents[1].errorCode)
    throw new Error(`Validação Pix inconclusiva; consulte os intents ${intents.map(i => i.id).join(', ')} no Dashboard antes de repetir.`);
  return { checkoutId: session.id, checkoutExpired: true, intents };
}

export interface ReconcileOptions { since: number; until: number; refreshFiscal?: boolean }
export async function reconcileBilling(stripe: Stripe, options: ReconcileOptions) {
  const { since, until } = options;
  if (!Number.isInteger(since) || !Number.isInteger(until) || since >= until || since < 0) throw new Error('Intervalo de conciliação inválido.');
  const created = { gte: since, lt: until };
  const db = getPool();
  const payments = [];
  async function compare(sourceId: string, amount: number, currency: string | null, live: boolean, customerId?: string) {
    const row = (await db.query(`SELECT id, amount_cents, status, reference, model, provider, dps_id FROM fiscal_invoices WHERE environment = $1 AND source_id = $2`,
      [environmentOf(live), sourceId])).rows[0];
    const mapped = customerId ? (await db.query('SELECT id FROM users WHERE stripe_customer_id = $1 LIMIT 1', [customerId])).rowCount! > 0 : false;
    payments.push({ sourceId, amountCents: amount, currency, environment: environmentOf(live), accountMapped: mapped,
      fiscalId: row?.id || null, fiscalStatus: row?.status || null,
      issue: currency !== 'brl' ? 'currency_unsupported' : !row ? 'missing_fiscal_invoice' : row.amount_cents !== amount ? 'amount_mismatch' : null });
    // Consulta apenas; cancelamento remoto não é inferido a partir do estorno financeiro.
    if (row && options.refreshFiscal) {
      const config = fiscalConfig();
      if (config.environment !== environmentOf(live) || config.model !== row.model) throw new Error('Modelo/ambiente da nota difere da configuração fiscal.');
      if (row.provider !== 'national' || !row.dps_id) return;
      const remote = await queryNationalInvoice(config, row.dps_id);
      Object.assign(payments.at(-1)!, { providerStatus: remote?.status || 'not_found',
        providerMismatch: !remote || (row.status !== 'authorized' && row.status !== 'cancelled') });
    }
  }
  for await (const session of stripe.checkout.sessions.list({ created, limit: 100 })) {
    if (session.mode === 'payment' && session.payment_status === 'paid' && session.metadata?.plan === 'pass' && session.amount_total! > 0)
      await compare(session.id, session.amount_total!, session.currency, session.livemode, idOf(session.customer));
  }
  // O filtro considera criação da fatura; informar início que abranja também a criação das faturas pagas no período.
  for await (const invoice of stripe.invoices.list({ created, status: 'paid', limit: 100 })) {
    if (invoice.amount_paid > 0 && invoice.parent?.subscription_details)
      await compare(invoice.id, invoice.amount_paid, invoice.currency, invoice.livemode, idOf(invoice.customer));
  }
  const refunds = [];
  for await (const refund of stripe.refunds.list({ created, limit: 100 })) {
    const chargeId = idOf(refund.charge);
    if (!chargeId) throw new Error('BILLING_REFUND_CHARGE_REQUIRED');
    const charge = await stripe.charges.retrieve(chargeId);
    const intentId = idOf(refund.payment_intent);
    const sources: string[] = [];
    if (intentId) {
      for await (const session of stripe.checkout.sessions.list({ payment_intent: intentId, limit: 100 })) {
        if (session.mode === 'payment' && session.metadata?.plan === 'pass') sources.push(session.id);
      }
      for await (const payment of stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: intentId }, limit: 100 })) {
        const id = idOf(payment.invoice); if (id) sources.push(id);
      }
    }
    const notes = sources.length ? (await db.query('SELECT id, source_id, status FROM fiscal_invoices WHERE environment = $1 AND source_id = ANY($2::text[])',
      [environmentOf(charge.livemode), sources])).rows : [];
    const review = (await db.query('SELECT review_status, reviewed_at FROM billing_refund_cases WHERE environment = $1 AND charge_id = $2',
      [environmentOf(charge.livemode), chargeId])).rows[0];
    refunds.push({ refundId: refund.id, chargeId, amountCents: refund.amount, currency: refund.currency, status: refund.status,
      chargeAmountCents: charge.amount, chargeRefundedCents: charge.amount_refunded, fullyRefunded: charge.refunded,
      sourceIds: [...new Set(sources)], fiscalInvoices: notes, reviewStatus: review?.review_status || 'unrecorded',
      action: refund.status === 'succeeded' ? 'fiscal_and_access_review' : refund.status === 'failed' || refund.status === 'canceled' ? 'verify_failed_refund' : 'wait_for_refund_confirmation' });
  }
  const pendingReviews = (await db.query("SELECT charge_id, environment, last_event_id FROM billing_refund_cases WHERE review_status = 'pending' ORDER BY updated_at")).rows;
  return { since, until, readOnly: true, periodBasis: 'creation_time', payments, refunds, pendingReviews };
}

export async function reviewRefund(environment: string, chargeId: string, eventId: string, note: string) {
  if (!['homologacao', 'producao'].includes(environment) || !/^ch_[a-zA-Z0-9_]+$/.test(chargeId) || !/^evt_[a-zA-Z0-9_]+$/.test(eventId) || note.trim().length < 15 || note.length > 1000)
    throw new Error('Informe ambiente, charge, último evento conferido e nota operacional de 15 a 1000 caracteres.');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`UPDATE billing_refund_cases SET review_status = 'reviewed', review_note = $4, reviewed_at = now(), updated_at = now()
      WHERE environment = $1 AND charge_id = $2 AND last_event_id = $3 RETURNING charge_id`, [environment, chargeId, eventId, note.trim()]);
    if (!result.rowCount) throw new Error('Pendência não encontrada ou atualizada por outro evento. Execute novamente a conciliação.');
    await client.query('INSERT INTO billing_operation_audit (id, action, environment, source_id, note) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), 'review_refund', environment, chargeId, note.trim()]);
    await client.query('COMMIT');
    return { reviewed: chargeId };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

/** Recuperação fiscal explícita de UM pagamento conferido, sem conceder/cancelar acesso ou movimentar dinheiro. */
export async function enqueueMissingFiscal(stripe: Stripe, sourceId: string, reason: string, paidAt?: number) {
  if (!fiscalEnabled()) throw new Error('Habilite e valide a configuração fiscal antes de enfileirar uma nota.');
  const config = fiscalConfig();
  if (reason.trim().length < 15 || reason.length > 1000) throw new Error('Informe motivo operacional de 15 a 1000 caracteres.');
  let object: Stripe.Checkout.Session | Stripe.Invoice;
  let type: 'checkout.session.completed' | 'invoice.paid';
  let created: number;
  if (/^cs_[a-zA-Z0-9_]+$/.test(sourceId)) {
    object = await stripe.checkout.sessions.retrieve(sourceId);
    if (object.mode !== 'payment' || object.metadata?.plan !== 'pass' || object.payment_status !== 'paid' || !object.amount_total || object.currency !== 'brl') throw new Error('Passe sem pagamento confirmado em BRL.');
    if (!Number.isInteger(paidAt) || paidAt! < object.created || paidAt! > Math.floor(Date.now() / 1000)) throw new Error('Informe --paid-at com a data efetiva do Pix/cartão conferida na Stripe.');
    type = 'checkout.session.completed'; created = paidAt!;
  } else if (/^in_[a-zA-Z0-9_]+$/.test(sourceId)) {
    object = await stripe.invoices.retrieve(sourceId);
    if (object.status !== 'paid' || object.amount_paid <= 0 || object.currency !== 'brl' || !object.parent?.subscription_details || !object.status_transitions.paid_at) throw new Error('Mensalidade sem pagamento confirmado em BRL.');
    type = 'invoice.paid'; created = object.status_transitions.paid_at;
  } else throw new Error('Informe uma sessão cs_... do Passe ou fatura in_... do Mensal.');
  if (environmentOf(object.livemode) !== config.environment) throw new Error('Ambiente Stripe incompatível com a emissão fiscal.');
  const intents: string[] = [];
  if (object.object === 'checkout.session') {
    const id = idOf(object.payment_intent); if (id) intents.push(id);
  } else {
    for await (const payment of stripe.invoicePayments.list({ invoice: object.id, limit: 100 })) {
      const id = idOf(payment.payment.payment_intent); if (id) intents.push(id);
    }
  }
  if (!intents.length) throw new Error('Pagamento sem PaymentIntent verificável; encaminhe à conciliação manual.');
  for (const id of intents) {
    const intent = await stripe.paymentIntents.retrieve(id);
    const chargeId = idOf(intent.latest_charge);
    if (!chargeId) throw new Error('Pagamento sem cobrança verificável.');
    const charge = await stripe.charges.retrieve(chargeId);
    if (!charge.paid || charge.amount_refunded > 0 || charge.disputed) throw new Error('Pagamento estornado, contestado ou não confirmado; exige orientação contábil.');
    for await (const refund of stripe.refunds.list({ charge: chargeId, limit: 100 })) {
      if (refund.status !== 'failed' && refund.status !== 'canceled') throw new Error('Pagamento possui estorno em andamento ou concluído; exige orientação contábil.');
    }
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if ((await client.query('SELECT id FROM fiscal_invoices WHERE environment = $1 AND source_id = $2', [config.environment, sourceId])).rowCount)
      throw new Error('Pagamento já possui registro fiscal. Use fiscal:run --retry somente se aplicável.');
    const customerId = idOf(object.customer);
    const mapped = customerId ? (await client.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId])).rows : [];
    if (!mapped.length) throw new Error('Cliente Stripe sem conta correspondente.');
    if (object.object === 'checkout.session' && !mapped.some(user => user.id === (object.client_reference_id || object.metadata?.userId)))
      throw new Error('Titular do Checkout difere da conta associada ao cliente Stripe.');
    await materializeFiscalEvent(client, { id: `manual_${randomUUID()}`, type, created, livemode: object.livemode, data: { object } } as Stripe.Event);
    const row = (await client.query('SELECT id FROM fiscal_invoices WHERE environment = $1 AND source_id = $2', [config.environment, sourceId])).rows[0];
    if (!row) throw new Error('Não foi possível associar o pagamento à conta fiscal.');
    await client.query('INSERT INTO billing_operation_audit (id, action, environment, source_id, note) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), 'enqueue_fiscal', config.environment, sourceId, reason.trim()]);
    await client.query('COMMIT');
    return { queued: row.id, sourceId, environment: config.environment };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

/** Recupera autorização já realizada no emissor sem reenviar DPS. Cancelamento requer evento fiscal próprio. */
export async function syncFiscalInvoice(id: string) {
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id)) throw new Error('Informe o UUID da nota.');
  const config = fiscalConfig();
  const db = getPool();
  const row = (await db.query("SELECT dps_id FROM fiscal_invoices WHERE id = $1 AND environment = $2 AND model = $3 AND provider='national'",
    [id, config.environment, config.model])).rows[0];
  if (!row) throw new Error('Nota não encontrada no modelo/ambiente configurado.');
  const remote = await queryNationalInvoice(config, row.dps_id);
  if (!remote) throw new Error('Emissor ainda não retornou a nota.');
  await saveFiscalAuthorization(db, id, remote);
  return { id, providerStatus: remote.status };
}
