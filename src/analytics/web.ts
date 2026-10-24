import { safeRoute } from './events';

export const WEB_GOALS = [
  { event: 'signup_success', name: 'Cadastro concluído' },
  { event: 'onboarding_complete', name: 'Onboarding concluído' },
  { event: 'subscription_activated', name: 'Acesso ao plano ativado (inclui teste)' },
] as const;

export const ATTRIBUTION_KEY = 'casamia:analytics:attribution';
export const TRAFFIC_KEY = 'casamia:analytics:traffic';
const SOURCES: Record<string, string> = {
  instagram: 'instagram', ig: 'instagram', facebook: 'facebook', fb: 'facebook',
  whatsapp: 'whatsapp', wa: 'whatsapp', google: 'google', bing: 'bing',
  tiktok: 'tiktok', youtube: 'youtube', linkedin: 'linkedin',
  newsletter: 'newsletter', email: 'email', partner: 'partner', direct: 'direct', other: 'other',
};
const MEDIA = ['social', 'paid_social', 'cpc', 'organic', 'email', 'referral', 'none', 'other'];
const REFERRERS: Record<string, string> = {
  'instagram.com': 'instagram.com', 'l.instagram.com': 'instagram.com',
  'facebook.com': 'facebook.com', 'm.facebook.com': 'facebook.com', 'l.facebook.com': 'facebook.com', 'lm.facebook.com': 'facebook.com',
  'wa.me': 'whatsapp.com', 'whatsapp.com': 'whatsapp.com', 'web.whatsapp.com': 'whatsapp.com',
  'google.com': 'google.com', 'google.com.br': 'google.com', 'bing.com': 'bing.com',
  'tiktok.com': 'tiktok.com', 'youtube.com': 'youtube.com', 'youtu.be': 'youtube.com', 'linkedin.com': 'linkedin.com',
};

export function campaignAllowlist(config = '') {
  return new Set(['launch', 'bio', 'trial', 'enxoval', 'casa-nova', ...config.split(',')]
    .map(code => code.trim().toLowerCase()).filter(code => /^[a-z][a-z0-9_-]{0,47}$/.test(code)));
}

// Never forward an arbitrary referrer hostname, path, query, fragment or UTM text.
export function readAttribution(search: string, referrer: string, origin: string, campaigns: Set<string>) {
  const params = new URLSearchParams(search);
  const source = params.get('utm_source')?.toLowerCase();
  const medium = params.get('utm_medium')?.toLowerCase();
  const campaign = params.get('utm_campaign')?.toLowerCase();
  let domain = '$direct';
  try {
    const url = new URL(referrer);
    if (url.origin !== origin) domain = REFERRERS[url.hostname.toLowerCase().replace(/^www\./, '')] || 'other';
  } catch { /* No referrer, direct navigation. */ }
  return {
    $referring_domain: domain,
    $referrer: domain === '$direct' ? '$direct' : domain === 'other' ? 'https://other.invalid/' : `https://${domain}/`,
    ...(source ? { utm_source: SOURCES[source] || 'other' } : {}),
    ...(medium ? { utm_medium: MEDIA.includes(medium) ? medium : 'other' } : {}),
    ...(campaign ? { utm_campaign: campaigns.has(campaign) ? campaign : 'other' } : {}),
  };
}

export function safeOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (/^https?:$/.test(url.protocol) && /^[a-z0-9.-]+$/i.test(url.hostname) && url.hostname.includes('.') && !/^\d[\d.]*$/.test(url.hostname)) return url.origin;
  } catch { /* Incomplete location in an embedded browser or a test. */ }
  return 'http://localhost';
}

export function pageMetadata(origin: string, pathname: string) {
  const route = safeRoute(pathname);
  const base = safeOrigin(origin);
  return { route, $pathname: route, $host: new URL(base).host, $current_url: `${base}${route}` };
}

export function trafficType(env: { DEV?: boolean; MODE?: string; VITE_POSTHOG_TRAFFIC_TYPE?: string }, localFlag: string | null, hostname = '') {
  if (env.MODE === 'test' || env.VITE_POSTHOG_TRAFFIC_TYPE === 'test' || localFlag === 'test') return 'test';
  if (env.DEV || env.VITE_POSTHOG_TRAFFIC_TYPE === 'internal' || localFlag === 'internal' || /^(?:localhost$|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(hostname)) return 'internal';
  return 'external';
}

export function webVitalsProperties(properties: Record<string, any>) {
  const clean: Record<string, unknown> = {};
  for (const name of ['LCP', 'INP', 'CLS', 'FCP']) {
    const key = `$web_vitals_${name}_value`;
    const metric = properties[`$web_vitals_${name}_event`];
    const value = properties[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (name === 'CLS' ? 100 : 3_600_000)) continue;
    clean[key] = value;
    // Raw entries and attribution can contain DOM text, selectors or resource URLs.
    clean[`$web_vitals_${name}_event`] = {
      name, value,
      ...(typeof metric?.id === 'string' && /^[\w.-]{1,100}$/.test(metric.id) ? { id: metric.id } : {}),
      ...(['good', 'needs-improvement', 'poor'].includes(metric?.rating) ? { rating: metric.rating } : {}),
      ...(typeof metric?.delta === 'number' && Number.isFinite(metric.delta) ? { delta: metric.delta } : {}),
      ...(['navigate', 'reload', 'back-forward', 'back-forward-cache', 'prerender', 'restore'].includes(metric?.navigationType) ? { navigationType: metric.navigationType } : {}),
      ...(typeof metric?.$session_id === 'string' && /^[\w-]{1,100}$/.test(metric.$session_id) ? { $session_id: metric.$session_id } : {}),
      ...(typeof metric?.$window_id === 'string' && /^[\w-]{1,100}$/.test(metric.$window_id) ? { $window_id: metric.$window_id } : {}),
      ...(typeof metric?.timestamp === 'number' && Number.isFinite(metric.timestamp) ? { timestamp: metric.timestamp } : {}),
    };
  }
  return clean;
}
