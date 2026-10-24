import posthog from 'posthog-js';
import { startActionLogging } from './analytics/operations';
import { exceptionProperties } from '../shared/errorTracking';
import { allowedProperties, EVENT_PROPERTIES, safeRoute, scrubSdkProperties, type AnalyticsEvent, type AnalyticsProperties } from './analytics/events';
import type { AuthUser } from './types';
import { isAppPath } from './appRoute';
import { ATTRIBUTION_KEY, TRAFFIC_KEY, campaignAllowlist, pageMetadata, readAttribution, safeOrigin, trafficType, webVitalsProperties } from './analytics/web';
import { onConsentChange, readConsent, saveConsent, hasAnalyticsConsent, type ConsentChoice } from './analytics/consent';
import { applyGoogleConsent, pushGoogleEvent, pushGooglePageview } from './analytics/google';
import { readFirstTouch } from './analytics/firstTouch';
import { channelGroup } from '../shared/acquisition';

let enabled = false;
let identifiedUser: string | null = null;
let openedSession: string | null = null;
let lastPage = '';
let lastOperationalPage = '';
const emitted = new Set<string>();
const ONCE_STORAGE = 'casamia:analytics:checkouts';
const SESSION_STORAGE = 'casamia:analytics:app-session';
let attributionSession = '';
let attribution: ReturnType<typeof readAttribution> | null = null;

function trafficProperties() {
  let flag: string | null = null;
  try { flag = localStorage.getItem(TRAFFIC_KEY); } catch { /* Storage is optional. */ }
  return {
    app_environment: import.meta.env.MODE === 'test' ? 'test' : import.meta.env.DEV ? 'development' : 'production',
    traffic_type: trafficType(import.meta.env, flag, window.location.hostname),
    app_version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
  };
}

function campaignProperties() {
  const session = posthog.get_session_id();
  if (attribution && session === attributionSession) return attribution;
  const campaigns = campaignAllowlist(import.meta.env.VITE_POSTHOG_CAMPAIGNS);
  const fresh = readAttribution(window.location.search, document.referrer, window.location.origin, campaigns);
  attribution = fresh;
  attributionSession = session;
  try {
    const previous = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || 'null');
    if (previous?.session === session && previous?.properties) {
      const params = new URLSearchParams();
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
        if (typeof previous.properties[key] === 'string') params.set(key, previous.properties[key]);
      }
      attribution = readAttribution(params.toString(), previous.properties.$referrer, window.location.origin, campaigns);
    }
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ session, properties: attribution }));
  } catch { /* In-memory attribution still works when storage is blocked. */ }
  return attribution;
}

// Analytics failures must never interrupt an account, purchase or workspace action.
function safely(action: () => void) {
  if (!enabled) return;
  try { action(); } catch { /* Best effort telemetry. */ }
}

export function capture(event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  const allowed = allowedProperties(event, properties);
  safely(() => { posthog.capture(event, allowed); });
  try { pushGoogleEvent(event, allowed); } catch { /* Best effort telemetry. */ }
}

export function trackLandingCta(action: 'start_trial' | 'open_app' | 'login' | 'view_pricing' | 'view_how_it_works' | 'view_nino' | 'view_gift_list', position: 'header' | 'navigation' | 'hero' | 'pricing' | 'footer_cta' | 'footer') {
  capture('landing_cta_clicked', { action, position });
}

export function captureOperational(event: `application.${string}`, properties: Record<string, unknown> = {}) {
  safely(() => posthog.capture(event, { ...properties, url: window.location.href, timestamp: new Date().toISOString() }));
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.VITE_POSTHOG_ERROR_TRACKING === 'false') return;
  safely(() => posthog.captureException(error, context));
}

export function captureOnce(key: string, event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  if (!enabled || emitted.has(key)) return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(ONCE_STORAGE) || '[]');
    if (Array.isArray(stored)) {
      if (stored.includes(key)) return;
      sessionStorage.setItem(ONCE_STORAGE, JSON.stringify([...stored.slice(-49), key]));
    }
  } catch { /* Memory deduplication still works with blocked storage. */ }
  emitted.add(key);
  capture(event, properties);
}

export function identifyAnalytics(user: AuthUser) {
  safely(() => {
    if (identifiedUser && identifiedUser !== user.id) resetAnalytics();
    // Origem do primeiro toque, gravada uma vez só na pessoa ($set_once), para fatiar qualquer análise por canal.
    const touch = readFirstTouch();
    const initial = Object.fromEntries(Object.entries({
      initial_channel_group: channelGroup(touch), initial_source: touch.source,
      initial_medium: touch.medium, initial_campaign: touch.campaign,
    }).filter(([, value]) => value !== undefined));
    posthog.identify(user.id, { plan: user.plan ?? 'free', is_guest: Boolean(user.isGuest) }, initial);
    identifiedUser = user.id;
    recordAppSession();
  });
}

/** Propriedades da pessoa ($set), já filtradas pelo esquema do evento que as originou. */
export function setPersonProperties(properties: AnalyticsProperties) {
  safely(() => { if (Object.keys(properties).length) posthog.setPersonProperties(properties); });
}

function recordAppSession() {
  if (!identifiedUser || !isAppPath(window.location.pathname) || document.visibilityState === 'hidden') return;
  safely(() => {
    const session = posthog.get_session_id();
    const key = `${identifiedUser}:${session}`;
    if (key !== openedSession) {
      openedSession = key;
      try {
        if (sessionStorage.getItem(SESSION_STORAGE) === key) return;
        sessionStorage.setItem(SESSION_STORAGE, key);
      } catch { /* Memory fallback when storage is unavailable. */ }
      capture('app_opened');
    }
  });
}

export function resetAnalytics() {
  safely(() => {
    posthog.reset();
    // reset() devolve o SDK ao padrão (opt-out); quem consentiu continua sendo medido como anônimo.
    if (hasAnalyticsConsent()) posthog.opt_in_capturing({ captureEventName: false });
  });
  identifiedUser = null;
  openedSession = null;
  emitted.clear();
  try { sessionStorage.removeItem(ONCE_STORAGE); } catch { /* Storage may be blocked. */ }
  try { sessionStorage.removeItem(SESSION_STORAGE); } catch { /* Storage may be blocked. */ }
}

export const analyticsAvailable = () => enabled;
export const analyticsOptedOut = () => enabled && !hasAnalyticsConsent();
/** Atalho da página de privacidade: grava no mesmo consentimento do aviso (recusar análise recusa marketing). */
export function setAnalyticsOptOut(optOut: boolean) {
  saveConsent({ analytics: !optOut, marketing: optOut ? false : Boolean(readConsent()?.marketing) });
}

/** PostHog só captura com consentimento de análise; antes disso não grava cookie nem armazenamento local. */
function applyPosthogConsent(choice: ConsentChoice | null) {
  safely(() => {
    if (choice?.analytics) {
      posthog.set_config({ persistence: 'localStorage+cookie' });
      if (posthog.has_opted_out_capturing()) {
        posthog.opt_in_capturing({ captureEventName: false });
        lastPage = '';
        trackPageview();
      }
      return;
    }
    if (choice) posthog.opt_out_capturing();
    posthog.set_config({ persistence: 'memory' });
    attribution = null;
    attributionSession = '';
    try { sessionStorage.removeItem(ATTRIBUTION_KEY); } catch { /* Optional storage. */ }
  });
}

export function trackPageview() {
  // $pageview first: the session's entry page and origin come from its first event.
  const route = safeRoute(window.location.pathname);
  if (route !== lastPage) {
    trackPageleave();
    lastPage = route;
    capture('$pageview', { route });
  }
  const location = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (location !== lastOperationalPage) {
    lastOperationalPage = location;
    captureOperational('application.navigation', { path: window.location.pathname, search: window.location.search, hash: window.location.hash });
  }
}

let lastGooglePage = '';
function trackGooglePageview() {
  const route = safeRoute(window.location.pathname);
  if (route === lastGooglePage) return;
  lastGooglePage = route;
  try { pushGooglePageview(route, safeOrigin(window.location.origin)); } catch { /* Best effort telemetry. */ }
}

/** Tag Manager e Consent Mode. Independe do PostHog: cada ferramenta liga com a própria variável. */
function startGoogle() {
  applyGoogleConsent(readConsent());
  const stopConsent = onConsentChange(choice => { applyGoogleConsent(choice); lastGooglePage = ''; trackGooglePageview(); });
  trackGooglePageview();
  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;
  const push: History['pushState'] = function (...args) { originalPush.apply(this, args); trackGooglePageview(); };
  const replace: History['replaceState'] = function (...args) { originalReplace.apply(this, args); trackGooglePageview(); };
  window.history.pushState = push;
  window.history.replaceState = replace;
  window.addEventListener('popstate', trackGooglePageview);
  return () => {
    stopConsent();
    if (window.history.pushState === push) window.history.pushState = originalPush;
    if (window.history.replaceState === replace) window.history.replaceState = originalReplace;
    window.removeEventListener('popstate', trackGooglePageview);
  };
}

export function startAnalytics() {
  let stopGoogle = () => {};
  try { stopGoogle = startGoogle(); } catch { /* Telemetry never blocks the app. */ }
  const stopPosthog = startPosthog();
  return () => { stopPosthog(); stopGoogle(); };
}

function trackPageleave() {
  if (!lastPage) return;
  const route = lastPage;
  lastPage = '';
  safely(() => posthog.capture('$pageleave', { route }, { send_instantly: true, transport: 'sendBeacon' }));
}

function startPosthog() {
  const env = import.meta.env;
  const consent = readConsent();
  if (!env.VITE_POSTHOG_KEY?.trim() || (env.DEV && env.VITE_POSTHOG_ENABLE_DEV !== 'true')) return () => {};
  try {
    posthog.init(env.VITE_POSTHOG_KEY.trim(), {
      api_host: env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      // Com o proxy próprio (VITE_POSTHOG_HOST=/ingest), os links da interface do PostHog usam o host real.
      ...(env.VITE_POSTHOG_UI_HOST ? { ui_host: env.VITE_POSTHOG_UI_HOST } : {}),
      // Sem consentimento de análise: nada é capturado e nada é gravado no aparelho.
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      persistence: consent?.analytics ? 'localStorage+cookie' : 'memory',
      ...(env.VITE_POSTHOG_COOKIELESS === 'on_reject' ? { cookieless_mode: 'on_reject' as const } : {}),
      person_profiles: 'identified_only', autocapture: false,
      capture_pageview: false, capture_pageleave: true,
      disable_session_recording: true, disable_surveys: true,
      capture_performance: env.VITE_POSTHOG_WEB_VITALS === 'false' ? false : {
        web_vitals: true, web_vitals_allowed_metrics: ['LCP', 'INP', 'CLS', 'FCP'],
        web_vitals_attribution: false,
      },
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: env.VITE_POSTHOG_ERROR_TRACKING === 'false' ? false : {
        capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false,
      },
      advanced_disable_flags: true, enable_recording_console_log: false,
      save_referrer: false, save_campaign_params: false,
      respect_dnt: true, ip: false,
      before_send: event => {
        // Operational events keep the real URL in `url`; the SDK page fields get the sanitized route and origin,
        // so a session that starts with one of them still has an entry page and channel in Web Analytics.
        if (event?.event.startsWith('application.')) return { ...event, properties: {
          ...event.properties, ...pageMetadata(window.location.origin, window.location.pathname),
          ...campaignProperties(), ...trafficProperties(),
        } };
        if (/^\/admin(?:\/|$)/.test(window.location.pathname) && event?.event !== '$exception') return null;
        if (event?.event === '$exception') {
          if (env.VITE_POSTHOG_ERROR_TRACKING === 'false') return null;
          return {
            uuid: event.uuid, event: event.event, timestamp: event.timestamp,
            properties: {
              ...exceptionProperties(event.properties),
              // SDK transport fields, already generated by the configured client.
              // `token` here is the public project token, never an auth token.
              token: event.properties.token,
              distinct_id: event.properties.distinct_id,
              $device_id: event.properties.$device_id,
              $user_id: event.properties.$user_id,
              ...campaignProperties(), ...trafficProperties(),
            },
          } as typeof event;
        }
        if (event?.event === '$web_vitals') {
          if (env.VITE_POSTHOG_WEB_VITALS === 'false') return null;
          const metrics = webVitalsProperties(event.properties);
          if (!Object.keys(metrics).length) return null;
          let path = window.location.pathname;
          // Buffered metrics belong to the page that produced them, even after SPA navigation.
          try { path = new URL(event.properties.$current_url).pathname; } catch { /* Use current page. */ }
          return { uuid: event.uuid, event: event.event, timestamp: event.timestamp, properties: {
            token: event.properties.token, distinct_id: event.properties.distinct_id,
            $device_id: event.properties.$device_id, $user_id: event.properties.$user_id,
            $session_id: event.properties.$session_id, $window_id: event.properties.$window_id,
            $device_type: event.properties.$device_type, $browser: event.properties.$browser,
            $os: event.properties.$os, $lib: event.properties.$lib, $lib_version: event.properties.$lib_version,
            ...pageMetadata(window.location.origin, path), ...campaignProperties(), ...trafficProperties(),
            ...metrics,
          } } as typeof event;
        }
        if (!event || !Object.hasOwn(EVENT_PROPERTIES, event.event) && !['$identify', '$set'].includes(event.event)) return null;
        const clean = scrubSdkProperties(event) as typeof event;
        return { ...clean, properties: {
          ...clean.properties,
          ...(typeof event.properties.$prev_pageview_pathname === 'string' ? { $prev_pageview_pathname: safeRoute(event.properties.$prev_pageview_pathname) } : {}),
          ...pageMetadata(window.location.origin, typeof event.properties.route === 'string' ? event.properties.route : window.location.pathname),
          ...campaignProperties(), ...trafficProperties(),
        } } as typeof event;
      },
    });
    enabled = true;
  } catch { return () => {}; }
  applyPosthogConsent(consent);
  const stopConsent = onConsentChange(applyPosthogConsent);
  const stopActionLogging = startActionLogging(captureOperational);
  trackPageview();
  if (new URLSearchParams(window.location.search).get('assinatura') === 'cancelada') capture('checkout_canceled');
  const expire = () => resetAnalytics();
  const visible = () => recordAppSession();
  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;
  const push: History['pushState'] = function (...args) { originalPush.apply(this, args); trackPageview(); };
  const replace: History['replaceState'] = function (...args) { originalReplace.apply(this, args); trackPageview(); };
  window.history.pushState = push;
  window.history.replaceState = replace;
  window.addEventListener('popstate', trackPageview);
  // The SDK sends the final pageleave before flushing its queue on pagehide.
  const hidePage = () => { lastPage = ''; };
  window.addEventListener('pagehide', hidePage);
  const restorePage = (event: PageTransitionEvent) => { if (event.persisted) trackPageview(); };
  window.addEventListener('pageshow', restorePage);
  window.addEventListener('casamia:session-expired', expire);
  window.addEventListener('focus', visible);
  document.addEventListener('visibilitychange', visible);
  return () => {
    stopConsent();
    stopActionLogging();
    if (window.history.pushState === push) window.history.pushState = originalPush;
    if (window.history.replaceState === replace) window.history.replaceState = originalReplace;
    window.removeEventListener('popstate', trackPageview);
    window.removeEventListener('pagehide', hidePage);
    window.removeEventListener('pageshow', restorePage);
    window.removeEventListener('casamia:session-expired', expire);
    window.removeEventListener('focus', visible);
    document.removeEventListener('visibilitychange', visible);
  };
}
