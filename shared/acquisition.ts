// Origem do cadastro (primeiro toque): o navegador lê, o servidor valida e calcula o grupo de canal.
// Uma regra só, usada nos dois lados, para o PostHog e a linha de `users` nunca divergirem.

export const CHANNEL_GROUPS = ['paid_search', 'paid_social', 'email', 'organic_search', 'organic_social', 'referral', 'direct'] as const;
export type ChannelGroup = typeof CHANNEL_GROUPS[number];

export interface AcquisitionTouch {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  referrerHost?: string;
  landingPath?: string;
  gclid?: string;
  fbclid?: string;
  firstSeenAt?: string;
}

const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|search\.yahoo\.com|yandex\.[a-z.]+|search\.brave\.com)$/;
const SOCIAL_HOSTS = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|pinterest\.[a-z.]+|youtube\.com|youtu\.be|linkedin\.com|t\.co|x\.com|twitter\.com|threads\.net)$/;

/** UTM no formato combinado (minúsculas, sem acento, `-` ou `_`); o resto é descartado. */
function slug(value: unknown, max = 80) {
  if (typeof value !== 'string') return undefined;
  const clean = value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]*$/.test(clean) ? clean.slice(0, max) : undefined;
}

function host(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().toLowerCase().replace(/^www\./, '');
  return /^[a-z0-9.-]{1,253}$/.test(clean) && clean.includes('.') ? clean : undefined;
}

function clickId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{8,255}$/.test(value) ? value : undefined;
}

function path(value: unknown) {
  // Só a rota, nunca query string ou fragmento (podem carregar tokens de convite ou de redefinição).
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined;
  const clean = value.split(/[?#]/)[0];
  return /^\/[A-Za-z0-9/_-]{0,119}$/.test(clean) ? clean : undefined;
}

function date(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  // Primeiro toque no futuro ou de mais de dois anos atrás é lixo do aparelho.
  if (!Number.isFinite(time) || time > Date.now() + 86_400_000 || time < Date.now() - 2 * 365 * 86_400_000) return undefined;
  return new Date(time).toISOString();
}

/** Valida um primeiro toque vindo do navegador: campos conhecidos, formatos e tamanhos fechados. */
export function sanitizeTouch(input: unknown): AcquisitionTouch {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const touch: AcquisitionTouch = {
    source: slug(raw.source, 60),
    medium: slug(raw.medium, 40),
    campaign: slug(raw.campaign),
    content: slug(raw.content),
    term: slug(raw.term),
    referrerHost: host(raw.referrerHost),
    landingPath: path(raw.landingPath),
    gclid: clickId(raw.gclid),
    fbclid: clickId(raw.fbclid),
    firstSeenAt: date(raw.firstSeenAt),
  };
  return Object.fromEntries(Object.entries(touch).filter(([, value]) => value !== undefined)) as AcquisitionTouch;
}

/** Grupo de canal (seção 5.2 de analytics-funil-e-reengajamento.md). A ordem das regras importa. */
export function channelGroup(touch: AcquisitionTouch): ChannelGroup {
  const { source = '', medium = '', referrerHost = '' } = touch;
  const hasUtm = Boolean(touch.source || touch.medium || touch.campaign);
  if (touch.gclid || medium === 'cpc' || medium === 'ppc' || medium === 'paid-search') return 'paid_search';
  if (touch.fbclid || medium === 'paid-social' || medium === 'paid_social') return 'paid_social';
  if (medium === 'email' || source === 'newsletter') return 'email';
  if (medium === 'organic-social' || medium === 'social') return 'organic_social';
  if (medium === 'referral' || source.startsWith('parceiro-')) return 'referral';
  if (!hasUtm && referrerHost) {
    if (SEARCH_HOSTS.test(referrerHost)) return 'organic_search';
    if (SOCIAL_HOSTS.test(referrerHost)) return 'organic_social';
    return 'referral';
  }
  return hasUtm ? 'referral' : 'direct';
}
