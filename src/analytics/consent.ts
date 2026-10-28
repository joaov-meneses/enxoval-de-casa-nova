// Consentimento de cookies e análise (LGPD). Essencial (sessão, segurança) não depende dele.
// Análise: PostHog e GA4 (`analytics_storage`). Marketing: Google Ads (`ad_*`) e identificadores de clique.

export const CONSENT_VERSION = '2026-10';
export const CONSENT_KEY = 'casamia:consent';
export const CONSENT_CHANGED_EVENT = 'casamia:consent-changed';
export const CONSENT_OPEN_EVENT = 'casamia:consent-open';

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
  version: string;
  decidedAt: string;
}

let memory: ConsentChoice | null = null;

function parse(value: unknown): ConsentChoice | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.analytics !== 'boolean' || typeof raw.marketing !== 'boolean') return null;
  // Escolha feita numa versão anterior do aviso precisa ser refeita.
  if (raw.version !== CONSENT_VERSION || typeof raw.decidedAt !== 'string') return null;
  return { analytics: raw.analytics, marketing: raw.marketing, version: raw.version, decidedAt: raw.decidedAt };
}

/** Escolha atual, ou `null` enquanto a pessoa não decidiu. */
export function readConsent(): ConsentChoice | null {
  try {
    const stored = parse(JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'));
    if (stored) memory = stored;
  } catch { /* Armazenamento bloqueado: vale a escolha desta visita. */ }
  return memory;
}

export function saveConsent(choice: { analytics: boolean; marketing: boolean }) {
  const next: ConsentChoice = { analytics: choice.analytics, marketing: choice.marketing, version: CONSENT_VERSION, decidedAt: new Date().toISOString() };
  memory = next;
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(next)); } catch { /* Vale só nesta visita. */ }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_CHANGED_EVENT, { detail: next }));
  return next;
}

export function onConsentChange(listener: (choice: ConsentChoice) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<ConsentChoice>).detail);
  window.addEventListener(CONSENT_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, handler);
}

/** Reabre o aviso (link "Preferências de privacidade"). */
export function openConsentPreferences() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

export const hasAnalyticsConsent = () => Boolean(readConsent()?.analytics);
export const hasMarketingConsent = () => Boolean(readConsent()?.marketing);

/** Há alguma ferramenta que dependa do aviso neste build? Sem nenhuma, o aviso não aparece. */
export function consentRequired(env: AnalyticsEnv = import.meta.env) {
  return posthogConfigured(env) || Boolean(googleTagId(env));
}

export type AnalyticsEnv = { VITE_POSTHOG_KEY?: string; VITE_GTM_ID?: string; DEV?: boolean; VITE_POSTHOG_ENABLE_DEV?: string; VITE_GTM_ENABLE_DEV?: string };

export function posthogConfigured(env: AnalyticsEnv = import.meta.env) {
  return Boolean(env.VITE_POSTHOG_KEY?.trim()) && (!env.DEV || env.VITE_POSTHOG_ENABLE_DEV === 'true');
}

/** Contêiner do Tag Manager (`GTM-XXXX`). Desenvolvimento fica desligado, como no PostHog. */
export function googleTagId(env: AnalyticsEnv = import.meta.env) {
  const id = env.VITE_GTM_ID?.trim() ?? '';
  if (!/^GTM-[A-Z0-9]{4,12}$/.test(id)) return null;
  return !env.DEV || env.VITE_GTM_ENABLE_DEV === 'true' ? id : null;
}
