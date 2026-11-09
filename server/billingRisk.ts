import type Stripe from 'stripe';
import type { Queryable } from './database.ts';

export const RISK_EVENTS = new Set([
  'invoice.payment_failed', 'charge.dispute.created',
  'radar.early_fraud_warning.created', 'checkout.session.async_payment_failed'
]);

export interface BillingRiskReferences {
  customerId: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
}
const idOf = (value: unknown): string | null => typeof value === 'string' ? value
  : value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : null;

/** Namespace próprio: a mesma fixture/evento não pode deduplicar outro ambiente. */
export const billingRiskEventKey = (event: Stripe.Event) =>
  `billing-risk:${event.livemode === true ? 'live' : 'test'}:${event.id}`;

/**
 * Somente leituras na Stripe, antes de abrir transação. Metadata e userId do evento
 * nunca são usados para decidir titularidade, acesso, cancelamento ou estorno.
 */
export async function resolveBillingRiskEvent(stripe: Stripe, event: Stripe.Event): Promise<BillingRiskReferences> {
  if (!RISK_EVENTS.has(event.type)) throw new Error('BILLING_RISK_EVENT_UNSUPPORTED');
  const sourceId = idOf(event.data.object);
  if (!sourceId) throw new Error('BILLING_RISK_SOURCE_REQUIRED');
  const refs: BillingRiskReferences = { customerId: null, subscriptionId: null, paymentIntentId: null, chargeId: null };
  const validateMode = (object: { livemode: boolean }) => {
    if (object.livemode !== (event.livemode === true)) throw new Error('BILLING_RISK_ENVIRONMENT_MISMATCH');
  };
  const useCustomer = (value: unknown) => {
    const customer = idOf(value);
    if (refs.customerId && customer && refs.customerId !== customer) throw new Error('BILLING_RISK_CUSTOMER_MISMATCH');
    refs.customerId ??= customer;
  };
  const useSubscription = async (value: unknown) => {
    const id = idOf(value);
    if (!id) return;
    const subscription = await stripe.subscriptions.retrieve(id);
    validateMode(subscription);
    useCustomer(subscription.customer);
    refs.subscriptionId = subscription.id;
  };
  const useInvoice = async (id: string) => {
    const invoice = await stripe.invoices.retrieve(id);
    validateMode(invoice);
    useCustomer(invoice.customer);
    await useSubscription(invoice.parent?.subscription_details?.subscription);
  };

  if (event.type === 'invoice.payment_failed') {
    await useInvoice(sourceId);
  } else if (event.type === 'checkout.session.async_payment_failed') {
    const session = await stripe.checkout.sessions.retrieve(sourceId);
    validateMode(session);
    useCustomer(session.customer);
    refs.paymentIntentId = idOf(session.payment_intent);
    await useSubscription(session.subscription);
  } else {
    const source = event.type === 'charge.dispute.created'
      ? await stripe.disputes.retrieve(sourceId)
      : await stripe.radar.earlyFraudWarnings.retrieve(sourceId);
    validateMode(source);
    const chargeId = idOf(source.charge);
    if (!chargeId) throw new Error('BILLING_RISK_CHARGE_REQUIRED');
    const charge = await stripe.charges.retrieve(chargeId);
    validateMode(charge);
    refs.chargeId = charge.id;
    refs.paymentIntentId = idOf(charge.payment_intent);
    useCustomer(charge.customer);
    if (refs.paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(refs.paymentIntentId);
      validateMode(intent);
      useCustomer(intent.customer);
      // A API atual liga PaymentIntent à assinatura por InvoicePayment, não Charge.invoice.
      const subscriptionIds = new Set<string>();
      for await (const payment of stripe.invoicePayments.list({
        payment: { type: 'payment_intent', payment_intent: refs.paymentIntentId }, limit: 100
      })) {
        validateMode(payment);
        if (idOf(payment.payment?.payment_intent) !== refs.paymentIntentId) throw new Error('BILLING_RISK_PAYMENT_MISMATCH');
        const invoiceId = idOf(payment.invoice);
        if (!invoiceId) throw new Error('BILLING_RISK_INVOICE_REQUIRED');
        refs.subscriptionId = null;
        await useInvoice(invoiceId);
        if (refs.subscriptionId) subscriptionIds.add(refs.subscriptionId);
      }
      // Um pagamento pode liquidar mais de uma fatura. Não atribuir assinatura arbitrária.
      refs.subscriptionId = subscriptionIds.size === 1 ? [...subscriptionIds][0] : null;
    }
  }
  return refs;
}

/** Chamado dentro da mesma transação da deduplicação. Não modifica acesso nem pagamentos. */
export async function recordBillingRiskEvent(db: Queryable, event: Stripe.Event, refs: BillingRiskReferences) {
  if (!RISK_EVENTS.has(event.type)) throw new Error('BILLING_RISK_EVENT_UNSUPPORTED');
  const sourceId = idOf(event.data.object);
  if (!sourceId) throw new Error('BILLING_RISK_SOURCE_REQUIRED');
  await db.query(`INSERT INTO billing_risk_cases
    (environment, kind, source_id, last_event_id, last_event_created, customer_id, subscription_id, payment_intent_id, charge_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (environment, kind, source_id) DO UPDATE SET
      last_event_id=EXCLUDED.last_event_id, last_event_created=EXCLUDED.last_event_created,
      customer_id=EXCLUDED.customer_id, subscription_id=EXCLUDED.subscription_id,
      payment_intent_id=EXCLUDED.payment_intent_id, charge_id=EXCLUDED.charge_id,
      review_status='pending', review_note=NULL, reviewed_at=NULL, updated_at=now()
    WHERE (EXCLUDED.last_event_created, EXCLUDED.last_event_id) >
      (billing_risk_cases.last_event_created, billing_risk_cases.last_event_id)`,
  [event.livemode === true ? 'producao' : 'homologacao', event.type, sourceId, event.id, event.created,
    refs.customerId, refs.subscriptionId, refs.paymentIntentId, refs.chargeId]);
}
