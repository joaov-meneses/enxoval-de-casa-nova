// GA4 e Google Ads pelo Tag Manager, com Consent Mode v2. O script do Google só é baixado depois que a pessoa
// aceita análise ou marketing; até lá (e na recusa) todos os sinais ficam em `denied`.
import { googleTagId, type ConsentChoice } from './consent';

declare global {
  interface Window { dataLayer?: unknown[] }
}

let initialized = false;
let loaded = false;
let current: ConsentChoice | null = null;

// O Consent Mode exige o objeto `arguments` (não um array) em cada comando enviado ao dataLayer.
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
}

function consentSignals(choice: ConsentChoice | null) {
  const analytics = choice?.analytics ? 'granted' : 'denied';
  const marketing = choice?.marketing ? 'granted' : 'denied';
  return { analytics_storage: analytics, ad_storage: marketing, ad_user_data: marketing, ad_personalization: marketing };
}

/** Aplica a escolha atual. Chamado ao iniciar e a cada mudança no aviso de consentimento. */
export function applyGoogleConsent(choice: ConsentChoice | null, id = googleTagId()) {
  if (!id) return;
  current = choice;
  if (!initialized) {
    initialized = true;
    gtag('consent', 'default', { ...consentSignals(null), functionality_storage: 'granted', security_storage: 'granted', wait_for_update: 500 });
    gtag('set', 'ads_data_redaction', true);
    gtag('set', 'url_passthrough', false);
  }
  gtag('consent', 'update', consentSignals(choice));
  if (!loaded && (choice?.analytics || choice?.marketing)) {
    loaded = true;
    window.dataLayer!.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
  }
}

// Eventos do PostHog que também interessam ao Google (nomes recomendados do GA4 quando existem).
// `purchase` não sai daqui: o servidor envia a conversão com o valor pago (Measurement Protocol).
const GOOGLE_EVENTS: Record<string, string> = {
  signup_success: 'sign_up',
  onboarding_start: 'tutorial_begin',
  onboarding_complete: 'tutorial_complete',
  workspace_created: 'enxoval_created',
  checkout_started: 'begin_checkout',
  subscription_activated: 'subscription_activated',
  invitation_accepted: 'join_group',
};

/** Repassa ao dataLayer só eventos mapeados, com as mesmas propriedades já filtradas para o PostHog. */
export function pushGoogleEvent(event: string, properties: Record<string, string | number | boolean> = {}) {
  if (!loaded || !(current?.analytics || current?.marketing)) return;
  const name = GOOGLE_EVENTS[event];
  if (!name) return;
  window.dataLayer!.push({ event: name, ...(name === 'sign_up' ? { method: 'email' } : {}), ...properties });
}

/** Visualização de página manual: rota sem identificadores (o GA4 deve ter "mudanças no histórico" desligado). */
export function pushGooglePageview(route: string, origin: string) {
  if (!loaded || !current?.analytics) return;
  window.dataLayer!.push({ event: 'page_view', page_path: route, page_location: `${origin}${route}` });
}

/** `client_id` do GA4 (cookie `_ga`, formato GA1.1.<id>.<timestamp>), para conversões enviadas pelo servidor. */
export function googleClientId(cookie = typeof document === 'undefined' ? '' : document.cookie) {
  const match = cookie.match(/(?:^|;\s*)_ga=GA\d\.\d\.(\d{1,20}\.\d{1,20})(?:;|$)/);
  return match?.[1] ?? null;
}
