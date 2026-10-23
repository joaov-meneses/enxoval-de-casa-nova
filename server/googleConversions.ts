// Conversão de compra enviada pelo servidor ao GA4 (Measurement Protocol). O anúncio passa a ser otimizado pela
// receita real, mesmo quando a pessoa paga dias depois, em outro aparelho ou com bloqueador. Só sai para quem deu
// consentimento de anúncios no cadastro (ad_consent_at) e tem o client_id do GA4 guardado. Nunca envia nome ou e-mail.
import type Stripe from 'stripe';
import { getPool } from './database.ts';
import { getLogger } from './logger.ts';

export function googleConversionsConfigured(env = process.env) {
  return Boolean(env.GA4_MEASUREMENT_ID?.trim() && env.GA4_API_SECRET?.trim());
}

export function purchasePayload(input: { clientId: string; transactionId: string; amountCents: number; currency: string; plan: string }) {
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
      },
    }],
  };
}

/** Chamado depois que o webhook da Stripe confirma um checkout pago. Cada sessão é enviada uma vez só. */
export async function sendPurchaseConversion(session: Stripe.Checkout.Session, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}) {
  const env = deps.env ?? process.env;
  if (!googleConversionsConfigured(env)) return false;
  if (session.payment_status !== 'paid' || !session.amount_total || !session.currency) return false;
  const userId = session.client_reference_id ?? session.metadata?.userId;
  if (!userId) return false;
  const user = (await getPool().query<{ ga_client_id: string | null; ad_consent_at: Date | null }>(
    'SELECT ga_client_id, ad_consent_at FROM users WHERE id::text = $1', [userId])).rows[0];
  if (!user?.ga_client_id || !user.ad_consent_at) return false;
  const fresh = await getPool().query(
    "INSERT INTO stripe_events (id, type) VALUES ($1, 'ga4_purchase') ON CONFLICT (id) DO NOTHING", [`ga4:${session.id}`]);
  if (fresh.rowCount === 0) return false;
  const url = new URL('https://www.google-analytics.com/mp/collect');
  url.searchParams.set('measurement_id', env.GA4_MEASUREMENT_ID!.trim());
  url.searchParams.set('api_secret', env.GA4_API_SECRET!.trim());
  const body = purchasePayload({
    clientId: user.ga_client_id, transactionId: session.id, amountCents: session.amount_total,
    currency: session.currency, plan: session.metadata?.plan ?? 'monthly',
  });
  const response = await (deps.fetch ?? fetch)(url, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) {
    // Libera nova tentativa no próximo evento da mesma sessão.
    await getPool().query('DELETE FROM stripe_events WHERE id = $1', [`ga4:${session.id}`]);
    throw new Error(`GA4 respondeu ${response.status}.`);
  }
  getLogger().info({ event: 'ga4.purchase.sent', stripeSessionId: session.id }, 'Conversão de compra enviada ao GA4.');
  return true;
}
