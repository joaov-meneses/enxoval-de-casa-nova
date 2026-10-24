import { appRouteTemplate } from '../appRoute';

export type AnalyticsProperties = Record<string, string | number | boolean>;

/**
 * Respostas do funil concluído, em categorias e faixas (ver src/onboarding/metrics.ts). Ficam aqui, e não lá, para
 * o esquema não puxar o gerador do plano para todas as páginas.
 */
export const ONBOARDING_METRIC_KEYS = [
  'moment', 'housing', 'people_bucket', 'rooms_count', 'items_count', 'no_rooms', 'owned', 'style', 'budget',
  'spending_tier', 'has_move_date', 'weeks_to_move_bucket', 'uf', 'has_city', 'worries_count', 'worries_none',
  'worries_none_reason', 'usage_count', 'usage_none', 'usage_none_reason',
  'worry_start', 'worry_waste', 'worry_forget', 'worry_budget', 'worry_time',
  'usage_buy', 'usage_spend', 'usage_links', 'usage_share',
] as const;

// Explicit schema: never forward forms, API payloads, names, links or free text.
export const EVENT_PROPERTIES = {
  onboarding_start: ['resumed'], step_view: ['step', 'index'],
  step_complete: ['step', 'index'], onboarding_back: ['step'],
  plan_ready: ['items', 'rooms'], onboarding_submit: [], onboarding_complete: ONBOARDING_METRIC_KEYS, commitment_signed: [],
  signup_submit: [], signup_success: [], login_success: [], logout: [],
  app_opened: [], workspace_viewed: ['view'], workspace_created: ['template'],
  environment_created: [], item_created: ['source', 'status'],
  item_status_changed: ['status'], item_purchase_recorded: [],
  item_edited: ['changed_name', 'changed_price', 'changed_quantity', 'changed_notes', 'changed_room'],
  item_deleted: [], environment_deleted: [], workspace_deleted: [],
  purchase_scheduled: [], planning_updated: [],
  product_imported: ['has_price'], price_history_viewed: [],
  invitation_sent: [], invitation_accepted: [],
  nino_used: ['feature', 'outcome', 'source'], items_imported: ['count', 'failed', 'stopped', 'catalog_applied'],
  items_exported: ['format', 'count'], plans_viewed: ['source', 'reason'],
  checkout_started: ['plan'], checkout_failed: ['plan'], checkout_canceled: [],
  subscription_activated: ['plan', 'trial'], subscription_canceled: [],
  billing_portal_opened: [], $pageview: ['route'],
  $pageleave: ['route'],
  landing_cta_clicked: ['action', 'position'],
  // Fase 11: parcelas, responsável, presentes, documentos, lojas e modo loja.
  installments_set: ['installments', 'payment_method'], monthly_budget_set: [],
  item_assigned: ['self'], gift_logged: ['has_message'], gift_thanked: ['channel'],
  document_uploaded: ['kind', 'source'], warranty_set: ['months'],
  offer_added: ['offers'], offer_promoted: ['cheapest'], offer_cheapest_found: ['savings_cents'],
  store_mode_opened: ['offline'], store_mode_item_checked: ['offline'], store_mode_offline_sync: ['count'],
} as const;

export type AnalyticsEvent = keyof typeof EVENT_PROPERTIES;

export function allowedProperties(event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  if (event === 'landing_cta_clicked') {
    const action = ['start_trial', 'open_app', 'login', 'view_pricing', 'view_how_it_works', 'view_nino', 'view_gift_list'].includes(String(properties.action)) ? properties.action : undefined;
    const position = ['header', 'navigation', 'hero', 'pricing', 'footer_cta', 'footer'].includes(String(properties.position)) ? properties.position : undefined;
    return action && position ? { action, position } : {};
  }
  return Object.fromEntries(EVENT_PROPERTIES[event].flatMap(key => {
    const value = properties[key];
    return ['string', 'number', 'boolean'].includes(typeof value) &&
      (typeof value !== 'number' || Number.isFinite(value)) ? [[key, value]] : [];
  }));
}

export const PUBLIC_ROUTES = ['/', '/app', '/login', '/cadastro', '/comecar', '/convite', '/privacidade', '/preferencias', '/pesquisa', '/como-o-nino-escolhe', '/esqueci-senha', '/redefinir-senha', '/verificar-email'];

export function safeRoute(pathname: string) {
  if (PUBLIC_ROUTES.includes(pathname)) return pathname;
  // Sub-rotas do app viram modelos sem identificador: /app/meu-lar, /app/plano, /app/itens/:ambiente.
  return appRouteTemplate(pathname) ?? '/other';
}

export function scrubSdkProperties(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(scrubSdkProperties);
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/url|referr|pathname|search|title|host|user_agent|utm_|gclid|fbclid|msclkid|ttclid|dclid/i.test(key),
  ).map(([key, child]) => [key, scrubSdkProperties(child)]));
}
