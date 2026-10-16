// Pagamentos pela Stripe: assinatura mensal e Passe da Casa Nova (pagamento único, 12 meses sem renovação). O plano da
// conta só muda aqui, pelos eventos assinados da Stripe (webhook), nunca por algo que o app envie. A assinatura vive em
// users.plan; o Passe vive em users.pass_expires_at (ver effectivePlanSql). Sem as chaves, o app segue no plano gratuito.
import express from 'express';
import type { Request, RequestHandler, Router } from 'express';
import Stripe from 'stripe';
import type { PoolClient } from 'pg';
import { getPool, withTransaction } from './database.ts';
import { effectivePlanSql } from './freemium.ts';
import { appBaseUrl } from './mailer.ts';
import { asyncHandler, HttpError } from './security.ts';
import { PASS_MONTHS } from '../src/plans.ts';
import type { AuthUser } from '../src/types.ts';

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
  return Boolean(process.env.STRIPE_SECRET_KEY && PAID_PLANS.every(plan => process.env[PRICE_ENV[plan]]));
}

let stripeClient: Stripe | null = null;
let stripeOverride: Stripe | null = null;

/** Só para testes: troca o cliente da Stripe por um falso. */
export function setStripeClientForTests(client: unknown) {
  stripeOverride = client as Stripe | null;
}

function getStripe(): Stripe {
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

interface BillingUserRow {
  /** Plano em vigor (já considera a validade do Passe). */
  plan: string;
  pass_expires_at: Date | null;
  email: string;
  is_guest: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_renews_at: Date | null;
  subscription_cancel_at_period_end: boolean;
}

async function loadBillingRow(userId: string) {
  const result = await getPool().query<BillingUserRow>(`
    SELECT ${effectivePlanSql()} AS plan, pass_expires_at, email, is_guest, stripe_customer_id, stripe_subscription_id,
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
    if (ACTIVE_STATUSES.has(subscription.status) && isMonthly) nextPlan = 'monthly';
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
        subscription_event_at = GREATEST($8, subscription_event_at)
    WHERE id = $1
  `, [
    user.id, nextPlan, customerId, subscription.id, subscription.status, periodEnd(subscription),
    Boolean(subscription.cancel_at_period_end), eventAt
  ]);
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
    SET pass_expires_at = GREATEST(COALESCE(pass_expires_at, now()), now()) + make_interval(months => $2::int)
    WHERE id::text = $1
    RETURNING plan, stripe_subscription_id, subscription_status
  `, [userId, PASS_MONTHS]);
  const row = granted.rows[0];
  if (!row) {
    console.warn(`Stripe: pagamento do Passe (${session.id}) de uma conta que não existe.`);
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
    await getStripe().subscriptions.cancel(subscriptionId);
  } catch (err) {
    console.error('Stripe: não foi possível cancelar o mensal ao ativar o Passe', subscriptionId, err);
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
  if (!isSubscription && !CHECKOUT_EVENTS.has(event.type)) return;
  const monthlyToCancel = await withTransaction(async client => {
    const fresh = await client.query(
      'INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [event.id, event.type]);
    if (fresh.rowCount === 0) return null;
    if (!isSubscription) return grantPass(client, event.data.object as Stripe.Checkout.Session);
    const result = await applySubscription(client, event.data.object as Stripe.Subscription, new Date(event.created * 1000));
    if (!result.applied && result.reason === 'user-not-found') {
      console.warn(`Stripe: evento ${event.id} (${event.type}) de uma assinatura sem conta correspondente.`);
    }
    return null;
  });
  await cancelMonthly(monthlyToCancel);
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
    } catch {
      res.status(400).json({ error: 'Assinatura inválida.' });
      return;
    }
    try {
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (err) {
      // Uma falha nossa devolve 500 para a Stripe tentar o evento de novo (a marca de "já processado" volta atrás junto).
      console.error('Stripe: falha ao processar o evento', event.id, err);
      res.status(500).json({ error: 'Erro ao processar o evento.' });
    }
  };
  app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), handler);
}

interface BillingDependencies {
  requireUser: (req: Request) => Promise<AuthUser>;
}

export function registerBillingRoutes(router: Router, { requireUser }: BillingDependencies) {
  /** Situação da conta para a tela de planos. */
  router.get('/billing/status', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = await loadBillingRow(user.id);
    res.json({
      available: isBillingConfigured(),
      plan: row.plan,
      status: row.subscription_status,
      renewsAt: row.subscription_renews_at?.toISOString() ?? null,
      cancelAtPeriodEnd: row.subscription_cancel_at_period_end,
      passExpiresAt: row.pass_expires_at && row.pass_expires_at > new Date() ? row.pass_expires_at.toISOString() : null,
      canManage: Boolean(row.stripe_customer_id)
    });
  }));

  /** Abre o checkout hospedado da Stripe para o plano escolhido (assinatura mensal ou Passe da Casa Nova). */
  router.post('/billing/checkout', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const plan = req.body?.plan;
    if (!isPaidPlan(plan)) throw new HttpError(400, 'Escolha um dos planos disponíveis.');
    const row = await loadBillingRow(user.id);
    if (row.is_guest) throw new HttpError(403, 'Contas de convidados usam o plano de quem os convidou.');
    if (row.plan === 'founder') throw new HttpError(409, 'Sua conta já tem acesso completo, sem cobrança.');
    if (plan === 'monthly') {
      if (row.plan === 'pass') throw new HttpError(409, 'Você já tem o Passe da Casa Nova em vigor.', 'PASS_ACTIVE');
      if (row.stripe_subscription_id && row.subscription_status && ACTIVE_STATUSES.has(row.subscription_status)) {
        throw new HttpError(409, 'Você já tem uma assinatura ativa. Use "Gerenciar assinatura" para alterá-la ou cancelá-la.', 'ALREADY_SUBSCRIBED');
      }
    }
    const baseUrl = appBaseUrl();
    if (!baseUrl) throw new HttpError(503, UNAVAILABLE, 'BILLING_UNAVAILABLE');

    const stripe = getStripe();
    let customerId = row.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: row.email, metadata: { userId: user.id } });
      customerId = customer.id;
      // Só grava se ninguém gravou antes (duas abas); a vencedora vale para as duas.
      const saved = await getPool().query<{ stripe_customer_id: string }>(
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
      metadata: { userId: user.id, plan },
      ...(plan === 'monthly' ? { subscription_data: { metadata: { userId: user.id } } } : {}),
      success_url: `${baseUrl}/app?assinatura=sucesso&plano=${plan}`,
      cancel_url: `${baseUrl}/app?assinatura=cancelada`
    });
    if (!session.url) throw new HttpError(502, 'Não foi possível abrir o pagamento agora. Tente novamente.');
    res.json({ url: session.url });
  }));

  /** Portal da Stripe: atualizar cartão, ver faturas e cancelar o mensal. */
  router.post('/billing/portal', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = await loadBillingRow(user.id);
    if (!row.stripe_customer_id) throw new HttpError(409, 'Você ainda não tem uma assinatura.');
    const baseUrl = appBaseUrl();
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
    const row = await loadBillingRow(user.id);
    if (row.stripe_customer_id) {
      const stripe = getStripe();
      const list = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: 'all', limit: 5 });
      const current = list.data.find(sub => ACTIVE_STATUSES.has(sub.status)) ?? list.data[0];
      if (current) await withTransaction(client => applySubscription(client, current, new Date(), true));
      const sessions = await stripe.checkout.sessions.list({ customer: row.stripe_customer_id, limit: 10 });
      for (const session of sessions.data) {
        const monthlyToCancel = await withTransaction(client => grantPass(client, session));
        await cancelMonthly(monthlyToCancel);
      }
    }
    const fresh = await loadBillingRow(user.id);
    res.json({ plan: fresh.plan, status: fresh.subscription_status });
  }));
}
