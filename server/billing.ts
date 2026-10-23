import { getLogger } from './logger.ts';
import { checkoutReturnPath } from '../shared/appRoute.ts';
// Pagamentos pela Stripe: assinatura mensal e Passe da Casa Nova (pagamento único, 12 meses sem renovação). O plano da
// conta só muda aqui, pelos eventos assinados da Stripe (webhook), nunca por algo que o app envie. A assinatura vive em
// users.plan; o Passe vive em users.pass_expires_at (ver effectivePlanSql). Sem as chaves, o app segue no plano gratuito.
import express from 'express';
import { sendTrialNotifications } from './workers/trialNotifications.ts';
import type { Request, RequestHandler, Router } from 'express';
import Stripe from 'stripe';
import type { PoolClient } from 'pg';
import { getPool, withTransaction, type Queryable } from './database.ts';
import { effectivePlanSql } from './freemium.ts';
import { appBaseUrl, canDeliverMail, isProductionServer } from './mailer.ts';
import { asyncHandler, HttpError } from './security.ts';
import { PAID_PLAN_OFFERS, PASS_MONTHS } from '../src/plans.ts';
import type { AuthUser } from '../src/types.ts';
import { sendPurchaseConversion } from './googleConversions.ts';
import { enqueueFiscalEvent } from './fiscal/service.ts';
import { recordRefundEvent, REFUND_EVENTS } from './billingOperations.ts';
import { fiscalEnabled } from './fiscal/provider.ts';
import { registerFiscalRoutes } from './fiscal/routes.ts';

type PaidPlan = 'monthly' | 'pass';
const PAID_PLANS: PaidPlan[] = ['monthly', 'pass'];

const PRICE_ENV: Record<PaidPlan, string> = {
  monthly: 'STRIPE_PRICE_MONTHLY',
  pass: 'STRIPE_PRICE_PASS'
};

/** Situações da assinatura em que a pessoa mantém o plano pago (past_due: a Stripe ainda tenta cobrar de novo). */
const ACTIVE_STATUSES = new Set<string>(['active', 'trialing', 'past_due']);
/** Situações que encerram o acesso pago. `incomplete` (primeiro pagamento pendente) não muda nada ainda. */
const ENDED_STATUSES = new Set<string>(['canceled', 'unpaid', 'incomplete_expired', 'paused']);

const UNAVAILABLE = 'As assinaturas ainda não estão disponíveis. Tente novamente em breve.';

export function isBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTHLY);
}

let stripeClient: Stripe | null = null;
let stripeOverride: Stripe | null = null;

/** Só para testes: troca o cliente da Stripe por um falso. */
export function setStripeClientForTests(client: unknown) {
  stripeOverride = client as Stripe | null;
}

export function getStripe(): Stripe {
  if (stripeOverride) return stripeOverride;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, UNAVAILABLE, 'BILLING_UNAVAILABLE');
  stripeClient ??= new Stripe(key);
  return stripeClient;
}

function priceIdFor(plan: PaidPlan) {
  const id = process.env[PRICE_ENV[plan]];
  if (!id) throw new HttpError(503, UNAVAILABLE, 'BILLING_UNAVAILABLE');
  return id;
}

function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === 'string' && (PAID_PLANS as string[]).includes(value);
}

interface BillingPrice { amount: number; currency: string }
interface BillingUserRow {
  billing_snapshot: { monthlyPrice?: BillingPrice; passPayment?: BillingPrice & { sessionId: string } };
  pass_notice_seen_session_id: string | null;
  /** Plano em vigor (já considera a validade do Passe). */
  plan: string;
  pass_expires_at: Date | null;
  email: string;
  trial_started_at: Date | null;
  trial_ends_at: Date | null;
  trial_used: boolean;
  trial_intro_seen_subscription_id: string | null;
  trial_ending_seen_subscription_id: string | null;
  is_guest: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_renews_at: Date | null;
  subscription_cancel_at_period_end: boolean;
}

async function loadBillingRow(userId: string, db: Queryable = getPool()) {
  const result = await db.query<BillingUserRow>(`
    SELECT ${effectivePlanSql()} AS plan, billing_snapshot, pass_notice_seen_session_id, trial_started_at, trial_ends_at, trial_used, trial_intro_seen_subscription_id, trial_ending_seen_subscription_id, pass_expires_at, email, is_guest, stripe_customer_id, stripe_subscription_id,
           subscription_status, subscription_renews_at, subscription_cancel_at_period_end
    FROM users WHERE id = $1
  `, [userId]);
  if (!result.rows[0]) throw new HttpError(401, 'Faça login para continuar.');
  return result.rows[0];
}

/** Fim do período já pago. Nas versões novas da API ele vive no item da assinatura. */
function periodEnd(subscription: Stripe.Subscription): Date | null {
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const seconds = subscription.items?.data?.[0]?.current_period_end ?? legacy;
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

function customerIdOf(subscription: Stripe.Subscription) {
  return typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
}

/**
 * Aplica o estado de uma assinatura mensal à conta. `eventAt` evita que um evento atrasado desfaça um mais novo;
 * `authoritative` (leitura direta na Stripe) dispensa essa checagem, pois já é o estado atual. Só mexe em users.plan:
 * o Passe é independente, então cancelar o mensal não tira um Passe em vigor. Fundadores mantêm o plano.
 */
async function applySubscription(client: PoolClient, subscription: Stripe.Subscription, eventAt: Date, authoritative = false) {
  const customerId = customerIdOf(subscription);
  const metadataUserId = subscription.metadata?.userId;
  const found = await client.query<{ id: string; plan: string; subscription_event_at: Date | null }>(`
    SELECT id, plan, subscription_event_at FROM users
    WHERE ($1::text IS NOT NULL AND stripe_customer_id = $1) OR ($2::text IS NOT NULL AND id::text = $2)
    ORDER BY (stripe_customer_id = $1::text) DESC NULLS LAST
    LIMIT 1
    FOR UPDATE
  `, [customerId, metadataUserId ?? null]);
  const user = found.rows[0];
  if (!user) return { applied: false as const, reason: 'user-not-found' };
  if (!authoritative && user.subscription_event_at && user.subscription_event_at > eventAt) return { applied: false as const, reason: 'stale' };

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const isMonthly = Boolean(priceId) && priceId === process.env[PRICE_ENV.monthly];
  let nextPlan: string = user.plan;
  if (user.plan !== 'founder') {
    if (subscription.cancel_at_period_end) nextPlan = 'free';
    else if (ACTIVE_STATUSES.has(subscription.status) && isMonthly) nextPlan = 'monthly';
    else if (ENDED_STATUSES.has(subscription.status)) nextPlan = 'free';
  }

  await client.query(`
    UPDATE users
    SET plan = $2,
        stripe_customer_id = COALESCE($3, stripe_customer_id),
        stripe_subscription_id = $4,
        subscription_status = $5,
        subscription_renews_at = $6,
        subscription_cancel_at_period_end = $7,
        subscription_event_at = GREATEST($8, subscription_event_at),
        trial_started_at = COALESCE(trial_started_at, $9),
        trial_ends_at = COALESCE($10, trial_ends_at),
        trial_used = trial_used OR $9::timestamptz IS NOT NULL,
        billing_snapshot = billing_snapshot || $11::jsonb
    WHERE id = $1
  `, [
    user.id, nextPlan, customerId, subscription.id, subscription.status, periodEnd(subscription),
    Boolean(subscription.cancel_at_period_end), eventAt,
    subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
    subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    JSON.stringify(isMonthly && typeof subscription.items?.data?.[0]?.price?.unit_amount === 'number' ? {
      monthlyPrice: { amount: subscription.items.data[0].price.unit_amount, currency: subscription.items.data[0].price.currency }
    } : {})
  ]);
  await client.query('DELETE FROM billing_checkouts WHERE user_id = $1', [user.id]);
  return { applied: true as const, userId: user.id, plan: nextPlan };
}

/**
 * Libera (ou estende) o Passe de uma sessão de checkout paga. Cada sessão vale uma vez só, mesmo que a Stripe mande
 * `completed` e `async_payment_succeeded`, ou que o sync passe por ela de novo. O Passe começa na data da compra; se
 * ainda houver Passe em vigor, os 12 meses somam ao que resta. Devolve a assinatura mensal a cancelar, se houver.
 */
async function grantPass(client: PoolClient, session: Stripe.Checkout.Session) {
  if (session.mode !== 'payment' || session.metadata?.plan !== 'pass' || session.payment_status !== 'paid') return null;
  const userId = session.client_reference_id ?? session.metadata?.userId;
  if (!userId) return null;
  const fresh = await client.query(
    "INSERT INTO stripe_events (id, type) VALUES ($1, 'pass') ON CONFLICT (id) DO NOTHING", [`pass:${session.id}`]);
  if (fresh.rowCount === 0) return null;
  const granted = await client.query<{ plan: string; stripe_subscription_id: string | null; subscription_status: string | null }>(`
    UPDATE users
    SET pass_expires_at = GREATEST(COALESCE(pass_expires_at, now()), now()) + make_interval(months => $2::int),
        billing_snapshot = billing_snapshot || $3::jsonb
    WHERE id::text = $1
    RETURNING plan, stripe_subscription_id, subscription_status
  `, [userId, PASS_MONTHS, JSON.stringify({ passPayment: { sessionId: session.id, amount: session.amount_total ?? null, currency: session.currency ?? null } })]);
  const row = granted.rows[0];
  if (!row) {
    getLogger().warn({ event: 'billing.account_not_found', stripeSessionId: session.id }, 'Stripe: pagamento do Passe de uma conta que não existe.');
    return null;
  }
  return row.plan === 'monthly' && row.stripe_subscription_id && row.subscription_status && ACTIVE_STATUSES.has(row.subscription_status)
    ? row.stripe_subscription_id
    : null;
}

/** Quem compra o Passe deixa de pagar o mensal: a assinatura é cancelada na Stripe (o cancelamento volta pelo webhook). */
async function cancelMonthly(subscriptionId: string | null) {
  if (!subscriptionId) return;
  try {
    const canceled = await getStripe().subscriptions.cancel(subscriptionId);
    if (canceled.status) await withTransaction(client => applySubscription(client, canceled, new Date(), true));
  } catch (err) {
    getLogger().error({ event: 'billing.cancellation_failed', subscriptionId, err }, 'Stripe: não foi possível cancelar o mensal ao ativar o Passe.');
  }
}

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
]);
const CHECKOUT_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

/** Processa um evento já verificado. Cada evento (id) é aplicado uma única vez. */
export async function handleStripeEvent(event: Stripe.Event) {
  const isSubscription = SUBSCRIPTION_EVENTS.has(event.type);
  const isInvoice = event.type === 'invoice.paid';
  const isRefund = REFUND_EVENTS.has(event.type);
  if (!isSubscription && !CHECKOUT_EVENTS.has(event.type) && !isInvoice && !isRefund) return;
  const monthlyToCancel = await withTransaction(async client => {
    const fresh = await client.query(
      'INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [event.id, event.type]);
    if (fresh.rowCount === 0) return null;
    if (isRefund) { await recordRefundEvent(client, event); return null; }
    await enqueueFiscalEvent(client, event);
    if (isInvoice) return null;
    if (!isSubscription) return grantPass(client, event.data.object as Stripe.Checkout.Session);
    const result = await applySubscription(client, event.data.object as Stripe.Subscription, new Date(event.created * 1000));
    if (!result.applied && result.reason === 'user-not-found') {
      getLogger().warn({ event: 'billing.account_not_found', stripeEventId: event.id, stripeEventType: event.type }, 'Stripe: assinatura sem conta correspondente.');
    }
    return null;
  });
  await cancelMonthly(monthlyToCancel);
  if (CHECKOUT_EVENTS.has(event.type)) {
    // Conversão para o Google Ads/GA4 com o valor pago; falha aqui nunca devolve erro à Stripe.
    void sendPurchaseConversion(event.data.object as Stripe.Checkout.Session).catch(err =>
      getLogger().warn({ event: 'ga4.purchase.failed', stripeEventId: event.id, err }, 'Não foi possível enviar a conversão ao GA4.'));
  }
  await sendTrialNotifications();
}

/**
 * Webhook da Stripe. Precisa do corpo cru para conferir a assinatura, então é registrado antes do
 * `express.json()` (ver server/index.ts) e fica fora do filtro de origem das demais rotas.
 */
export function registerBillingWebhook(app: express.Express) {
  const handler: RequestHandler = async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.get('stripe-signature');
    if (!secret || !signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: 'Requisição inválida.' });
      return;
    }
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, signature, secret);
    } catch (err) {
      getLogger().warn({ event: 'billing.webhook.signature_failed', err }, 'Webhook signature validation failed.');
      res.status(400).json({ error: 'Assinatura inválida.' });
      return;
    }
    try {
      await handleStripeEvent(event);
      getLogger().info({ event: 'billing.webhook.completed', stripeEventId: event.id, stripeEventType: event.type, stripeEvent: event }, 'Evento Stripe processado.');
      res.json({ received: true });
    } catch (err) {
      // Uma falha nossa devolve 500 para a Stripe tentar o evento de novo (a marca de "já processado" volta atrás junto).
      res.err = err instanceof Error ? err : new Error('Falha ao processar evento Stripe.');
      getLogger().error({ event: 'billing.webhook.failed', stripeEventId: event.id, stripeEventType: event.type, err }, 'Stripe: falha ao processar o evento; será solicitada nova tentativa.');
      res.status(500).json({ error: 'Erro ao processar o evento.' });
    }
  };
  app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), handler);
}

interface BillingDependencies {
  requireUser: (req: Request) => Promise<AuthUser>;
  ensureDefaultEnxoval: (userId: string) => Promise<string>;
}

export function registerBillingRoutes(router: Router, { requireUser, ensureDefaultEnxoval }: BillingDependencies) {
  registerFiscalRoutes(router, requireUser);
  router.get('/billing/plans', asyncHandler(async (req, res) => {
    await requireUser(req);
    const offers = await Promise.all(PAID_PLAN_OFFERS.map(async offer => {
      if (!process.env[PRICE_ENV[offer.id]]) return null;
      const price = await getStripe().prices.retrieve(priceIdFor(offer.id));
      const valid = price.active && typeof price.unit_amount === 'number' &&
        (offer.id === 'pass' ? price.type === 'one_time' : price.recurring?.interval === 'month' && price.recurring.interval_count === 1);
      if (!valid) return null;
      return { id: offer.id, name: offer.name, amount: price.unit_amount, currency: price.currency,
        paymentMethods: offer.id === 'pass' && price.currency === 'brl' && process.env.STRIPE_PIX_ENABLED !== 'false' ? ['card', 'pix'] : ['card'] };
    }));
    res.json({ offers: offers.filter(Boolean) });
  }));
  /** Situação da conta para a tela de planos. */
  router.get('/billing/status', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    let ownerId = user.id;
    if (typeof req.query.enxovalId === 'string') {
      const shared = await getPool().query<{owner_id: string}>(`SELECT e.owner_id FROM enxovais e JOIN enxoval_members m ON m.enxoval_id = e.id WHERE e.id = $1 AND m.user_id = $2`, [req.query.enxovalId, user.id]);
      if (!shared.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');
      ownerId = shared.rows[0].owner_id;
    }
    let row = await recoverBillingAccess(ownerId);
    // Backfill accounts confirmed before billing amounts were persisted. Never infer a purchase from the URL.
    if (row.plan === 'monthly' && !row.billing_snapshot.monthlyPrice && row.stripe_subscription_id) {
      try {
        const subscription = await getStripe().subscriptions.retrieve(row.stripe_subscription_id);
        if (subscription) {
          await withTransaction(client => applySubscription(client, subscription, new Date(), true));
          row = await loadBillingRow(ownerId);
        }
      } catch (err) {
        getLogger().warn({ event: 'billing.price_sync_failed', userId: ownerId, err }, 'Não foi possível atualizar o valor da assinatura.');
      }
    }
    let trialNotice: 'started' | 'ending' | null = null;
    if (ownerId === user.id && !row.is_guest && row.plan === 'monthly' && row.subscription_status === 'trialing' && row.stripe_subscription_id && row.trial_ends_at && row.trial_ends_at > new Date()) {
      if (row.trial_ends_at.getTime() - Date.now() <= 86400000 && row.trial_ending_seen_subscription_id !== row.stripe_subscription_id) trialNotice = 'ending';
      else if (row.trial_intro_seen_subscription_id !== row.stripe_subscription_id) trialNotice = 'started';
    }
    res.json({
      trialNotice,
      fiscalEnabled: fiscalEnabled(),
      fiscalNeedsData: fiscalEnabled() && ownerId === user.id && !row.is_guest
        ? (await getPool().query<{ pending: boolean }>("SELECT EXISTS (SELECT 1 FROM fiscal_invoices WHERE user_id = $1 AND status = 'needs_data') AS pending", [user.id])).rows[0].pending : false,
      monthlyPrice: row.billing_snapshot.monthlyPrice ?? null,
      passPayment: row.plan === 'pass' ? row.billing_snapshot.passPayment ?? null : null,
      passNotice: ownerId === user.id && !row.is_guest && row.plan === 'pass' && row.billing_snapshot.passPayment?.sessionId !== row.pass_notice_seen_session_id
        ? row.billing_snapshot.passPayment?.sessionId ?? null : null,
      subscriptionId: row.stripe_subscription_id,
      accessAllowed: row.plan !== 'free',
      isOwner: ownerId === user.id && !row.is_guest,
      trialEndsAt: row.trial_ends_at?.toISOString() ?? null,
      trialUsed: row.trial_used,
      available: isBillingConfigured(),
      plan: row.plan,
      status: row.subscription_status,
      renewsAt: row.subscription_renews_at?.toISOString() ?? null,
      cancelAtPeriodEnd: row.subscription_cancel_at_period_end,
      passExpiresAt: row.pass_expires_at && row.pass_expires_at > new Date() ? row.pass_expires_at.toISOString() : null,
      canManage: Boolean(row.stripe_customer_id)
    });
  }));

  router.post('/billing/pass-notice', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = await loadBillingRow(user.id);
    const sessionId = row.billing_snapshot.passPayment?.sessionId;
    if (row.is_guest || !sessionId || sessionId !== req.body?.sessionId) throw new HttpError(403, 'Aviso inválido.');
    await getPool().query('UPDATE users SET pass_notice_seen_session_id = $2 WHERE id = $1', [user.id, sessionId]);
    res.status(204).end();
  }));

  router.post('/billing/trial-notice' , asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = await loadBillingRow(user.id);
    const kind = req.body?.kind;
    if (!['started', 'ending'].includes(kind)) throw new HttpError(400, 'Aviso inválido.');
    if (row.is_guest || !row.stripe_subscription_id || row.stripe_subscription_id !== req.body?.subscriptionId) throw new HttpError(403, 'Este aviso não pertence à sua assinatura.');
    await getPool().query(`UPDATE users SET trial_intro_seen_subscription_id = $2,
      trial_ending_seen_subscription_id = CASE WHEN $3 = 'ending' THEN $2 ELSE trial_ending_seen_subscription_id END
      WHERE id = $1 AND stripe_subscription_id = $2`, [user.id, row.stripe_subscription_id, kind]);
    res.status(204).end();
  }));

  /** Abre o checkout hospedado da Stripe para o plano escolhido (assinatura mensal ou Passe da Casa Nova). */
  router.post('/billing/checkout', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const plan = req.body?.plan;
    if (!isPaidPlan(plan)) throw new HttpError(400, 'Escolha um dos planos disponíveis.');
    const url = await withTransaction(async client => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const row = await loadBillingRow(user.id, client);
    if (!canDeliverMail()) throw new HttpError(503, 'Os avisos por e-mail estão indisponíveis. Tente novamente em breve.');
    if (row.is_guest) throw new HttpError(403, 'Contas de convidados usam o plano de quem os convidou.');
    if (row.plan === 'founder') throw new HttpError(409, 'Sua conta já tem acesso completo, sem cobrança.');
    if (plan === 'monthly') {
      if (row.plan === 'pass') throw new HttpError(409, 'Você já tem o Passe da Casa Nova em vigor.', 'PASS_ACTIVE');
      if (row.stripe_subscription_id && row.subscription_status && ACTIVE_STATUSES.has(row.subscription_status)) {
        throw new HttpError(409, 'Você já tem uma assinatura ativa. Use "Gerenciar assinatura" para alterá-la ou cancelá-la.', 'ALREADY_SUBSCRIBED');
      }
    }
    const baseUrl = billingReturnUrl(req);
    if (!baseUrl) throw new HttpError(503, UNAVAILABLE, 'BILLING_UNAVAILABLE');

    const returnPath = checkoutReturnPath(req.body?.returnTo);
    const checkoutConfiguration = `card:${fiscalEnabled() ? 'fiscal-v1' : 'standard'}:${returnPath}`;
    if (plan === 'monthly') {
      const cached = await client.query<{url: string}>('SELECT url FROM billing_checkouts WHERE user_id = $1 AND expires_at > now() AND configuration_key = $2', [user.id, checkoutConfiguration]);
      if (cached.rows[0]) return cached.rows[0].url;
    }
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceIdFor(plan));
    if (!price.active || (plan === 'pass' ? price.type !== 'one_time' : price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1)) {
      throw new HttpError(503, UNAVAILABLE, 'BILLING_UNAVAILABLE');
    }
    const pix = plan === 'pass' && price.currency === 'brl' && process.env.STRIPE_PIX_ENABLED !== 'false';
    let customerId = row.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: row.email, metadata: { userId: user.id } });
      customerId = customer.id;
      // Só grava se ninguém gravou antes (duas abas); a vencedora vale para as duas.
      const saved = await client.query<{ stripe_customer_id: string }>(
        'UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2) WHERE id = $1 RETURNING stripe_customer_id', [user.id, customerId]);
      customerId = saved.rows[0]?.stripe_customer_id ?? customerId;
    }
    const session = await stripe.checkout.sessions.create({
      mode: plan === 'pass' ? 'payment' : 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceIdFor(plan), quantity: 1 }],
      allow_promotion_codes: true,
      locale: 'pt-BR',
      // Stripe 23 / API 2026-09-30: payment_method_types foi substituído por allowed_payment_method_types.
      allowed_payment_method_types: pix ? ['card', 'pix'] : ['card'],
      ...(pix ? { payment_method_options: { pix: { expires_after_seconds: 3600 } } } : {}),
      ...(fiscalEnabled() ? {
        billing_address_collection: 'required' as const,
        customer_update: { name: 'auto' as const, address: 'auto' as const },
        custom_fields: [{ key: 'fiscal_document', label: { type: 'custom' as const, custom: 'CPF ou CNPJ (somente números)' },
          type: 'numeric' as const, numeric: { minimum_length: 11, maximum_length: 14 }, optional: false }],
      } : {}),
      metadata: { userId: user.id, plan },
      ...(plan === 'monthly' ? {
        payment_method_collection: 'always',
        subscription_data: {
          metadata: { userId: user.id },
          ...(!row.trial_used ? { trial_period_days: 2, trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } } } : {})
        },
        custom_text: { submit: { message: !row.trial_used ? 'Teste completo por 2 dias (48 horas). Após esse período, cobraremos automaticamente o valor mensal no cartão. Cancele no app antes do término para evitar a cobrança. O cancelamento encerra também o acesso dos convidados.' : 'A assinatura será cobrada agora. O teste gratuito só pode ser usado uma vez.' } }
      } : {}),
      success_url: `${baseUrl}${returnPath}?assinatura=sucesso&plano=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}${returnPath}?assinatura=cancelada`
    });
    if (!session.url) throw new HttpError(502, 'Não foi possível abrir o pagamento agora. Tente novamente.');
    if (plan === 'monthly' && session.expires_at) await client.query(`INSERT INTO billing_checkouts (user_id, url, expires_at, configuration_key) VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET url = EXCLUDED.url, expires_at = EXCLUDED.expires_at, configuration_key = EXCLUDED.configuration_key`, [user.id, session.url, new Date(session.expires_at * 1000), checkoutConfiguration]);
    return session.url;
    });
    res.json({ url });
  }));

  router.post('/billing/cancel', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = await loadBillingRow(user.id);
    if (row.is_guest || !row.stripe_subscription_id) throw new HttpError(403, 'Somente o titular pode cancelar a assinatura.');
    const subscription = await getStripe().subscriptions.cancel(row.stripe_subscription_id);
    await withTransaction(client => applySubscription(client, subscription, new Date(), true));
    res.json({ canceled: true });
  }));

  /** Portal da Stripe: atualizar cartão, ver faturas e cancelar o mensal. */
  router.post('/billing/portal', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = await loadBillingRow(user.id);
    if (!row.stripe_customer_id) throw new HttpError(409, 'Você ainda não tem uma assinatura.');
    const baseUrl = billingReturnUrl(req);
    if (!baseUrl) throw new HttpError(503, UNAVAILABLE, 'BILLING_UNAVAILABLE');
    const session = await getStripe().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${baseUrl}/app`
    });
    res.json({ url: session.url });
  }));

  /**
   * Na volta do checkout o webhook pode ainda não ter chegado. Esta rota lê a assinatura e os pagamentos recentes
   * direto na Stripe e aplica o mesmo caminho do webhook (cada pagamento do Passe vale uma vez só).
   */
  router.post('/billing/sync', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const fresh = await reconcileBillingAccount(user.id, req.body?.sessionId);
    const enxovalId = req.body?.prepareWorkspace === true && fresh.plan !== 'free' && !fresh.is_guest
      ? await ensureDefaultEnxoval(user.id) : null;
    res.json({ plan: fresh.plan, status: fresh.subscription_status, accessAllowed: fresh.plan !== 'free', enxovalId });
  }));
}

/** Keep the checkout on the authenticated development origin (localhost and LAN have separate cookies). */
function billingReturnUrl(req: Request) {
  const configured = appBaseUrl();
  const origin = req.get('origin');
  if (!isProductionServer() && origin) {
    try {
      const url = new URL(origin);
      if (url.host === req.get('host') && ['http:', 'https:'].includes(url.protocol)) return url.origin;
    } catch { /* Fall back to the configured public URL. */ }
  }
  return configured;
}

/** Authoritative reconciliation, shared by checkout return and recovery of missed webhooks. */
export async function reconcileBillingAccount(userId: string, sessionId?: string) {
    const row = await loadBillingRow(userId);
    if (row.stripe_customer_id) {
      const stripe = getStripe();
      if (sessionId) {
        if (typeof sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) throw new HttpError(400, 'Sessão de pagamento inválida.');
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (customer !== row.stripe_customer_id || session.client_reference_id !== userId) throw new HttpError(403, 'Este pagamento não pertence à sua conta.');
        if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) throw new HttpError(409, 'O pagamento ainda não foi aprovado.');
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = typeof session.subscription === 'string' ? await stripe.subscriptions.retrieve(session.subscription) : session.subscription;
          await withTransaction(client => applySubscription(client, subscription, new Date(), true));
        } else {
          const monthlyToCancel = await withTransaction(client => grantPass(client, session));
          await cancelMonthly(monthlyToCancel);
        }
      } else {
      const list = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: 'all', limit: 5 });
      const current = list.data.find(sub => ACTIVE_STATUSES.has(sub.status)) ?? list.data[0];
      if (current) await withTransaction(client => applySubscription(client, current, new Date(), true));
      const sessions = await stripe.checkout.sessions.list({ customer: row.stripe_customer_id, limit: 10 });
      for (const session of sessions.data) {
        const monthlyToCancel = await withTransaction(client => grantPass(client, session));
        await cancelMonthly(monthlyToCancel);
      }
      }
    }
    return loadBillingRow(userId);

}

const recoveryAttempts = new Map<string, { at: number; pending: Promise<BillingUserRow> }>();
/** A missed callback must not leave an approved customer stuck behind the paywall. */
export async function recoverBillingAccess(userId: string) {
  const row = await loadBillingRow(userId);
  if (row.plan !== 'free' || !row.stripe_customer_id || !isBillingConfigured()) return row;
  const now = Date.now();
  for (const [id, attempt] of recoveryAttempts) if (now - attempt.at >= 60000) recoveryAttempts.delete(id);
  const previous = recoveryAttempts.get(userId);
  if (previous) { await previous.pending; return loadBillingRow(userId); }
  const pending = reconcileBillingAccount(userId).catch(error => {
    getLogger().error({ event: 'billing.reconciliation_failed', userId, err: error }, 'Não foi possível sincronizar o acesso com a Stripe.');
    return row;
  });
  recoveryAttempts.set(userId, { at: now, pending });
  await pending;
  return loadBillingRow(userId);
}
