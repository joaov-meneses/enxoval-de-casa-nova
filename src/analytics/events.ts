export type AnalyticsProperties = Record<string, string | number | boolean>;

// Explicit schema: never forward forms, API payloads, names, links or free text.
export const EVENT_PROPERTIES = {
  onboarding_start: ['resumed'], step_view: ['step', 'index'],
  step_complete: ['step', 'index'], onboarding_back: ['step'],
  plan_ready: ['items', 'rooms'], onboarding_submit: [], onboarding_complete: [],
  signup_submit: [], signup_success: [], login_success: [], logout: [],
  app_opened: [], workspace_viewed: ['view'], workspace_created: ['template'],
  environment_created: [], item_created: ['source', 'status'],
  item_status_changed: ['status'], item_purchase_recorded: [],
  purchase_scheduled: [], planning_updated: [],
  product_imported: ['has_price'], price_history_viewed: [],
  invitation_sent: [], invitation_accepted: [],
  nino_used: ['feature'], items_imported: ['count', 'failed', 'stopped'],
  items_exported: ['format', 'count'], plans_viewed: ['source', 'reason'],
  checkout_started: ['plan'], checkout_failed: ['plan'], checkout_canceled: [],
  subscription_activated: ['plan', 'trial'], subscription_canceled: [],
  billing_portal_opened: [], $pageview: ['route'],
  $pageleave: ['route'],
  landing_cta_clicked: ['action', 'position'],
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

export const PUBLIC_ROUTES = ['/', '/app', '/login', '/cadastro', '/comecar', '/convite', '/privacidade', '/como-o-nino-escolhe', '/esqueci-senha', '/redefinir-senha'];

export function safeRoute(pathname: string) {
  return PUBLIC_ROUTES.includes(pathname) ? pathname : '/other';
}

export function scrubSdkProperties(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(scrubSdkProperties);
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/url|referr|pathname|search|title|host|user_agent|utm_|gclid|fbclid|msclkid|ttclid|dclid/i.test(key),
  ).map(([key, child]) => [key, scrubSdkProperties(child)]));
}
