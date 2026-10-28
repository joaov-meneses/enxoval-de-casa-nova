// Primeiro toque guardado no aparelho até o cadastro, para a origem não se perder entre a landing e o /cadastro.
// UTMs, domínio de origem e página de entrada ficam 90 dias; identificadores de clique (gclid/fbclid) ficam só
// na sessão e só seguem para a conta com consentimento de marketing.
import { sanitizeTouch, type AcquisitionTouch } from '../../shared/acquisition';
import { googleClientId } from './google';
import { hasAnalyticsConsent, hasMarketingConsent } from './consent';

export const FIRST_TOUCH_KEY = 'cm_first_touch';
export const LAST_TOUCH_KEY = 'cm_last_touch';
const CLICK_IDS_KEY = 'cm_click_ids';
const FIRST_TOUCH_TTL_MS = 90 * 86_400_000;

function readJson(storage: Storage, key: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* Sem armazenamento, a origem só não é guardada. */ }
}

/** Lê a visita atual. Roda uma vez por carregamento de página, antes de qualquer redirecionamento interno. */
export function recordTouch(location: Pick<Location, 'search' | 'pathname' | 'origin'> = window.location, referrer = document.referrer, now = Date.now()) {
  if (/^\/admin(?:\/|$)/.test(location.pathname)) return;
  const params = new URLSearchParams(location.search);
  let referrerHost: string | undefined;
  try {
    const url = new URL(referrer);
    if (url.origin !== location.origin) referrerHost = url.hostname;
  } catch { /* Navegação direta. */ }
  const visit = sanitizeTouch({
    source: params.get('utm_source'),
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
    term: params.get('utm_term'),
    referrerHost,
    landingPath: location.pathname,
    firstSeenAt: new Date(now).toISOString(),
  });
  const clicks = sanitizeTouch({ gclid: params.get('gclid'), fbclid: params.get('fbclid') });
  const hasCampaign = Boolean(visit.source || visit.medium || visit.campaign || clicks.gclid || clicks.fbclid);

  try {
    const first = readJson(localStorage, FIRST_TOUCH_KEY);
    const firstAt = typeof first?.firstSeenAt === 'string' ? Date.parse(first.firstSeenAt) : NaN;
    if (!first || !Number.isFinite(firstAt) || now - firstAt > FIRST_TOUCH_TTL_MS) writeJson(localStorage, FIRST_TOUCH_KEY, visit);
    if (hasCampaign) writeJson(localStorage, LAST_TOUCH_KEY, visit);
  } catch { /* localStorage bloqueado. */ }
  try {
    if (clicks.gclid || clicks.fbclid) writeJson(sessionStorage, CLICK_IDS_KEY, { ...readJson(sessionStorage, CLICK_IDS_KEY), ...clicks });
  } catch { /* sessionStorage bloqueado. */ }
}

export function readFirstTouch(): AcquisitionTouch {
  try { return sanitizeTouch(readJson(localStorage, FIRST_TOUCH_KEY)); } catch { return {}; }
}

/** Corpo opcional `acquisition` do cadastro. O servidor valida de novo e calcula o grupo de canal. */
export function acquisitionPayload() {
  const marketing = hasMarketingConsent();
  let clicks: AcquisitionTouch = {};
  try { clicks = marketing ? sanitizeTouch(readJson(sessionStorage, CLICK_IDS_KEY)) : {}; } catch { /* Sem sessão. */ }
  const gaClientId = hasAnalyticsConsent() ? googleClientId() : null;
  return {
    touch: { ...readFirstTouch(), ...clicks },
    adConsent: marketing,
    ...(gaClientId ? { gaClientId } : {}),
  };
}
