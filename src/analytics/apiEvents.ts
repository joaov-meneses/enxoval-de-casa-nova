import type { AuthUser } from '../types';
import { DEFAULT_ITEM_STATUS, isItemStatus } from '../itemStatus';
import type { AnalyticsEvent, AnalyticsProperties } from './events';

export interface AnalyticsSink {
  capture: (event: AnalyticsEvent, properties?: AnalyticsProperties) => void;
  captureOnce: (key: string, event: AnalyticsEvent, properties?: AnalyticsProperties) => void;
  identifyAnalytics: (user: AuthUser) => void;
  resetAnalytics: () => void;
}

// Called only after a successful response. Pick properties individually; never send input/output.
export function recordApiSuccess(sink: AnalyticsSink, path: string, method: string, input: Record<string, unknown>, result: unknown) {
  const route = path.split('?')[0];
  if (route.startsWith('/api/admin/')) return;
  const data = (result && typeof result === 'object' ? result : {}) as Record<string, any>;
  const { capture, captureOnce } = sink;
  if (data.user?.id && typeof data.user.id === 'string') sink.identifyAnalytics(data.user);
  if (route === '/api/auth/register') capture('signup_success');
  if (route === '/api/auth/login') capture('login_success');
  if (route === '/api/auth/logout') { capture('logout'); sink.resetAnalytics(); }
  if (route === '/api/enxovais' && method === 'POST') capture('workspace_created', { template: input.useDefaultTemplate === true });
  if (route === '/api/categories' && method === 'POST') capture('environment_created');
  if (route === '/api/items' && method === 'POST') {
    capture('item_created', { source: input.placement === 'end' ? 'spreadsheet' : input.link ? 'link' : 'manual', status: isItemStatus(data.item?.status) ? data.item.status : DEFAULT_ITEM_STATUS });
  }
  if (/^\/api\/items\/[^/]+$/.test(route) && method === 'PATCH') {
    if (isItemStatus(input.status) || typeof input.checked === 'boolean') {
      const status = isItemStatus(input.status) ? input.status : input.checked ? 'bought' : DEFAULT_ITEM_STATUS;
      capture('item_status_changed', { status });
      if (status === 'bought') capture('item_purchase_recorded');
    }
    if ('buyWeek' in input) capture('purchase_scheduled');
    if (typeof input.installments === 'number') capture('installments_set', { installments: input.installments, payment_method: typeof data.paymentMethod === 'string' ? data.paymentMethod : 'none' });
    if (typeof input.giftFrom === 'string' && input.giftFrom.trim()) capture('gift_logged', { has_message: typeof data.giftMessage === 'string' && data.giftMessage.length > 0 });
    if (typeof input.warrantyMonths === 'number') capture('warranty_set', { months: input.warrantyMonths });
  }
  if (/^\/api\/enxovais\/[^/]+$/.test(route) && method === 'PATCH' && typeof input.monthlyBudgetCents === 'number') capture('monthly_budget_set');
  if (/^\/api\/enxovais\/[^/]+$/.test(route) && method === 'PATCH' && ['moveDate', 'spendingTier', 'state', 'city'].some(key => key in input)) capture('planning_updated');
  if (route === '/api/products/extract') capture('product_imported', { has_price: typeof data.priceCents === 'number' });
  if (/^\/api\/items\/[^/]+\/price-history$/.test(route)) capture('price_history_viewed');
  if (/^\/api\/enxovais\/[^/]+\/invitations$/.test(route) && method === 'POST') capture('invitation_sent');
  if (route === '/api/invitations/accept') capture('invitation_accepted');
  const aiFeature = { '/api/ai/assess-item': 'assess_item', '/api/ai/recommend': 'recommend', '/api/ai/prioritize': 'prioritize' }[route];
  if (aiFeature && data.available === true) capture('nino_used', { feature: aiFeature });
  if (route === '/api/billing/checkout' && ['monthly', 'pass'].includes(String(input.plan))) capture('checkout_started', { plan: String(input.plan) });
  // Access is confirmed by the server. A return URL alone never counts as a conversion.
  if (route === '/api/billing/sync' && data.accessAllowed === true && ['monthly', 'pass'].includes(data.plan)) {
    const key = typeof input.sessionId === 'string' && input.sessionId ? input.sessionId : 'return';
    captureOnce(`checkout:${key}`, 'subscription_activated', { plan: data.plan, trial: data.status === 'trialing' });
  }
  if (route === '/api/billing/portal') capture('billing_portal_opened');
  if (route === '/api/billing/cancel' && data.canceled === true) capture('subscription_canceled');
}
