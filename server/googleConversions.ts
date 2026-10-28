// Conversão de compra enviada pelo servidor ao GA4 (Measurement Protocol). O anúncio passa a ser otimizado pela
// receita real, mesmo quando a pessoa paga dias depois, em outro aparelho ou com bloqueador. Só sai para quem deu
// consentimento de anúncios no cadastro (ad_consent_at) e tem o client_id do GA4 guardado. Nunca envia nome ou e-mail.
import type Stripe from 'stripe';
import { getPool } from './database.ts';
import { getLogger } from './logger.ts';
import { captureServerEvent } from './productAnalytics.ts';

export function googleConversionsConfigured(env = process.env) {
  return Boolean(env.GA4_MEASUREMENT_ID?.trim() && env.GA4_API_SECRET?.trim());
}

export function purchasePayload(input: {
  clientId: string; transactionId: string; amountCents: number; currency: string; plan: string; billingReason?: string;
}) {
  return {
    client_id: input.clientId,
    consent: { ad_user_data: 'GRANTED', ad_personalization: 'GRANTED' },
    events: [{
      name: 'purchase',
      params: {
        transaction_id: input.transactionId,
        value: Math.round(input.amountCents) / 100,
        currency: input.currency.toUpperCase(),
        items: [{ item_id: input.plan, item_name: input.plan, quantity: 1 }],
        // Distingue a primeira cobrança da assinatura (`subscription_create`, ou a primeira depois do teste) das renovações.
        ...(input.billingReason ? { billing_reason: input.billingReason } : {}),
      },
    }],
  };
}

/** Envia uma vez por cobrança: a chave fica em stripe_events e é liberada se o GA4 recusar, para tentar de novo. */
async function postPurchase(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch, dedupeKey: string, body: ReturnType<typeof purchasePayload>) {
  const fresh = await getPool().query(
    "INSERT INTO stripe_events (id, type) VALUES ($1, 'ga4_purchase') ON CONFLICT (id) DO NOTHING", [dedupeKey]);
  if (fresh.rowCount === 0) return false;
  const url = new URL('https://www.google-analytics.com/mp/collect');
  url.searchParams.set('measurement_id', env.GA4_MEASUREMENT_ID!.trim());
  url.searchParams.set('api_secret', env.GA4_API_SECRET!.trim());
  const response = await fetchImpl(url, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) {
    await getPool().query('DELETE FROM stripe_events WHERE id = $1', [dedupeKey]);
    throw new Error(`GA4 respondeu ${response.status}.`);
  }
  return true;
}

/**
 * Chamado depois que o webhook da Stripe confirma um checkout pago (Passe). Cada sessão é enviada uma vez só.
 * Assinaturas ficam com `invoice.paid` (abaixo): o checkout de assinatura sem teste também gera uma fatura paga, e
 * contar os dois dobraria a receita.
 */
export async function sendPurchaseConversion(session: Stripe.Checkout.Session, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}) {
  const env = deps.env ?? process.env;
  if (!googleConversionsConfigured(env)) return false;
  if (session.mode === 'subscription') return false;
  if (session.payment_status !== 'paid' || !session.amount_total || !session.currency) return false;
  const userId = session.client_reference_id ?? session.metadata?.userId;
  if (!userId) return false;
  const user = (await getPool().query<{ ga_client_id: string | null; ad_consent_at: Date | null }>(
    'SELECT ga_client_id, ad_consent_at FROM users WHERE id::text = $1', [userId])).rows[0];
  if (!user?.ga_client_id || !user.ad_consent_at) return false;
  const body = purchasePayload({
    clientId: user.ga_client_id, transactionId: session.id, amountCents: session.amount_total,
    currency: session.currency, plan: session.metadata?.plan ?? 'pass',
  });
  if (!await postPurchase(env, deps.fetch ?? fetch, `ga4:${session.id}`, body)) return false;
  getLogger().info({ event: 'ga4.purchase.sent', stripeSessionId: session.id }, 'Conversão de compra enviada ao GA4.');
  return true;
}

/**
 * Receita recorrente: cada fatura paga da assinatura (a primeira cobrança, inclusive a que vem depois do teste
 * grátis, e cada renovação) vira um `purchase` com o valor cobrado. O PostHog recebe o mesmo fato pelo servidor
 * (`subscription_payment_succeeded`), sem depender do navegador voltar ao app. O GA4 continua exigindo o
 * consentimento de anúncios.
 */
export async function sendInvoiceConversion(invoice: Stripe.Invoice, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}) {
  const env = deps.env ?? process.env;
  if (invoice.status !== 'paid' || !invoice.id || !invoice.currency || !(invoice.amount_paid > 0)) return false;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return false;
  const user = (await getPool().query<{ id: string; ga_client_id: string | null; ad_consent_at: Date | null }>(
    'SELECT id, ga_client_id, ad_consent_at FROM users WHERE stripe_customer_id = $1 LIMIT 1', [customerId])).rows[0];
  if (!user) return false;
  const billingReason = invoice.billing_reason ?? 'subscription_cycle';
  const firstSeen = await getPool().query(
    "INSERT INTO stripe_events (id, type) VALUES ($1, 'posthog_invoice') ON CONFLICT (id) DO NOTHING", [`posthog:${invoice.id}`]);
  if (firstSeen.rowCount) {
    captureServerEvent(user.id, 'subscription_payment_succeeded', {
      billing_reason: billingReason, amount_cents: invoice.amount_paid, currency: invoice.currency.toUpperCase(),
    });
  }
  if (!googleConversionsConfigured(env) || !user.ga_client_id || !user.ad_consent_at) return false;
  const body = purchasePayload({
    clientId: user.ga_client_id, transactionId: invoice.id, amountCents: invoice.amount_paid, currency: invoice.currency,
    plan: 'monthly', billingReason,
  });
  if (!await postPurchase(env, deps.fetch ?? fetch, `ga4:${invoice.id}`, body)) return false;
  getLogger().info({ event: 'ga4.invoice.sent', stripeInvoiceId: invoice.id, billingReason }, 'Cobrança recorrente enviada ao GA4.');
  return true;
}
