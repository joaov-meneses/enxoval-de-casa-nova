import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { allowedProperties, scrubSdkProperties, safeRoute } from '../src/analytics/events.ts';
import { recordApiSuccess } from '../src/analytics/apiEvents.ts';
import { campaignAllowlist, pageMetadata, readAttribution, trafficType, webVitalsProperties } from '../src/analytics/web.ts';

function sink() {
  const calls = [];
  const once = new Set();
  return {
    calls,
    capture: (event, props = {}) => calls.push([event, props]),
    captureOnce: (key, event, props) => { if (!once.has(key)) { once.add(key); calls.push([event, props]); } },
    identifyAnalytics: user => calls.push(['identify', user.id]),
    resetAnalytics: () => calls.push(['reset']),
  };
}

test('event schemas strip personal data and unknown properties', () => {
  assert.deepEqual(allowedProperties('item_created', { source: 'manual', status: 'needed', name: 'Private', email: 'secret@example.com', price: 100 }), { source: 'manual', status: 'needed' });
  assert.deepEqual(allowedProperties('plan_ready', { items: Infinity, rooms: 2 }), { rooms: 2 });
  assert.equal(safeRoute('/reset/secret'), '/other');
  assert.equal(safeRoute('/app'), '/app');
});

test('SDK metadata scrubber removes tokens, query strings, referrers and document titles recursively', () => {
  const result = scrubSdkProperties({ $current_url: 'https://app/convite#token=secret', $referrer: 'https://private', $pathname: '/private', $title: 'Personal name', $set_once: { $initial_current_url: 'https://app?session_id=secret', $initial_referring_domain: 'private', plan: 'free' }, route: '/convite', $session_id: 'session' });
  assert.deepEqual(result, { $set_once: { plan: 'free' }, route: '/convite', $session_id: 'session' });
  const timestamp = new Date();
  assert.deepEqual(scrubSdkProperties({ timestamp, values: [1, 2], $set_once: { $current_url: 'secret' } }), { timestamp, values: [1, 2], $set_once: {} });
});

test('signup identifies before capture; logout resets the browser identity', () => {
  const s = sink();
  recordApiSuccess(s, '/api/auth/register', 'POST', { email: 'secret@example.com', password: 'secret' }, { user: { id: 'u1', email: 'secret@example.com' } });
  recordApiSuccess(s, '/api/auth/logout', 'POST', {}, undefined);
  assert.deepEqual(s.calls, [['identify', 'u1'], ['signup_success', {}], ['logout', {}], ['reset']]);
});

test('successful product actions only emit bounded metadata', () => {
  const s = sink();
  recordApiSuccess(s, '/api/items', 'POST', { name: 'Secret', link: 'https://private' }, { item: { status: 'researching' } });
  recordApiSuccess(s, '/api/items/i1', 'PATCH', { status: 'bought', buyWeek: 3, priceCents: 1000 }, {});
  recordApiSuccess(s, '/api/products/extract', 'POST', { url: 'https://private' }, { priceCents: 1000 });
  recordApiSuccess(s, '/api/enxovais/e1/invitations', 'POST', { email: 'private@example.com' }, {});
  recordApiSuccess(s, '/api/items/i1/price-history?days=60', 'GET', {}, {});
  assert.deepEqual(s.calls, [
    ['item_created', { source: 'link', status: 'researching' }],
    ['item_status_changed', { status: 'bought' }], ['item_purchase_recorded', {}],
    ['purchase_scheduled', {}], ['product_imported', { has_price: true }],
    ['invitation_sent', {}], ['price_history_viewed', {}],
  ]);
  assert.equal(JSON.stringify(s.calls).includes('private'), false);
});

test('Nino unavailable, unrelated APIs and admin traffic produce no product events', () => {
  const s = sink();
  recordApiSuccess(s, '/api/ai/recommend', 'POST', {}, { available: false });
  recordApiSuccess(s, '/api/admin/users', 'GET', {}, { user: { id: 'admin' } });
  recordApiSuccess(s, '/api/catalog/search?q=private', 'GET', {}, {});
  assert.deepEqual(s.calls, []);
  recordApiSuccess(s, '/api/ai/recommend', 'POST', {}, { available: true });
  assert.deepEqual(s.calls, [['nino_used', { feature: 'recommend' }]]);
});

test('subscription conversion requires confirmed paid access and deduplicates the checkout', () => {
  const s = sink();
  recordApiSuccess(s, '/api/billing/sync', 'POST', { sessionId: 'secret' }, { accessAllowed: false, plan: 'monthly' });
  recordApiSuccess(s, '/api/billing/sync', 'POST', {}, { accessAllowed: true, plan: 'free' });
  assert.deepEqual(s.calls, []);
  for (let i = 0; i < 2; i++) recordApiSuccess(s, '/api/billing/sync', 'POST', { sessionId: 'secret' }, { accessAllowed: true, plan: 'monthly', status: 'trialing' });
  assert.deepEqual(s.calls, [['subscription_activated', { plan: 'monthly', trial: true }]]);
});

// Compile the actual browser wrapper with a fake SDK, so tests exercise its init,
// history listeners and lifecycle without a database or outbound telemetry.
async function client(env = {}, pathname = '/app', storage = new Map(), options = {}) {
  const calls = [];
  let config;
  const sdk = {
    session: 's1', optedOut: false,
    init: (key, options) => { config = options; calls.push(['init', key]); },
    capture: (event, properties) => { if (!sdk.optedOut) calls.push([event, properties]); },
    captureException: (error, properties) => { if (!sdk.optedOut) calls.push(['$exception', properties]); },
    identify: (id, properties) => calls.push(['identify', id, properties]),
    reset: () => calls.push(['reset']),
    get_session_id: () => sdk.session,
    has_opted_out_capturing: () => sdk.optedOut,
    opt_out_capturing: () => { sdk.optedOut = true; },
    opt_in_capturing: () => { sdk.optedOut = false; },
  };
  globalThis.__analyticsSdk = sdk;
  const win = new EventTarget();
  win.location = { pathname, search: options.search || '', hash: '', origin: 'https://casamia.test', hostname: 'casamia.test' };
  const navigate = (_data, _unused, url) => { win.location.pathname = new URL(url, 'https://app.test').pathname; };
  win.history = { pushState: navigate, replaceState: navigate };
  globalThis.window = win;
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  doc.referrer = options.referrer || '';
  globalThis.document = doc;
  globalThis.sessionStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  const local = options.local || new Map();
  globalThis.localStorage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) };
  const result = await build({
    entryPoints: ['src/analytics.ts'], bundle: true, write: false, format: 'esm',
    define: { 'import.meta.env': JSON.stringify({ DEV: false, VITE_POSTHOG_KEY: 'phc_test', ...env }) },
    plugins: [{ name: 'fake-sdk', setup(builder) {
      builder.onResolve({ filter: /^posthog-js$/ }, () => ({ path: 'sdk', namespace: 'fake' }));
      builder.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: 'export default globalThis.__analyticsSdk' }));
    } }],
  });
  const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`;
  const api = await import(url);
  return { api, sdk, calls, win, doc, storage, config: () => config };
}

test('missing key and development default never initialize the SDK', async () => {
  for (const [env, path] of [[{ VITE_POSTHOG_KEY: '' }, '/app'], [{ DEV: true }, '/app']]) {
    const c = await client(env, path);
    c.api.startAnalytics(); c.api.capture('signup_submit');
    assert.deepEqual(c.calls, []);
  }
});

test('admin exceptions and operational diagnostics preserve real data', async () => {
  const c = await client({}, '/admin/catalog'); c.api.startAnalytics();
  assert.ok(c.config());
  const properties = { body: { password: 'raw-password' }, response: { email: 'real@example.test' } };
  assert.deepEqual(c.config().before_send({ event: 'application.api.completed', properties }).properties.body, properties.body);
  c.api.captureOperational('application.api.completed', properties);
  assert.equal(c.calls.at(-1)[0], 'application.api.completed');
  assert.equal(c.config().before_send({ event: '$exception', properties: { $exception_list: [{ type: 'Error', value: 'Original admin failure' }] } }).properties.$exception_list[0].value, 'Original admin failure');
});

test('initialization enables bounded web vitals and reconstructs safe standard page properties', async () => {
  const c = await client({ DEV: true, VITE_POSTHOG_ENABLE_DEV: 'true' }, '/convite');
  const stop = c.api.startAnalytics();
  const config = c.config();
  assert.equal(config.autocapture, false);
  assert.equal(config.disable_session_recording, true);
  assert.deepEqual(config.capture_exceptions, { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false });
  assert.equal(config.capture_pageview, false);
  assert.equal(config.ip, false);
  assert.equal(config.respect_dnt, true);
  assert.deepEqual(config.capture_performance, { web_vitals: true, web_vitals_allowed_metrics: ['LCP', 'INP', 'CLS', 'FCP'], web_vitals_attribution: false });
  assert.equal(config.before_send({ event: '$autocapture', properties: {} }), null);
  const safe = config.before_send({ event: '$pageview', properties: { route: '/convite', $current_url: 'secret', utm_campaign: 'PRIVATE_CAMPAIGN', $set_once: { $initial_current_url: 'secret' } } }).properties;
  assert.equal(safe.$current_url, 'https://casamia.test/convite');
  assert.equal(safe.$pathname, '/convite');
  assert.equal(safe.$host, 'casamia.test');
  assert.equal(safe.traffic_type, 'internal');
  assert.equal(JSON.stringify(safe).includes('secret'), false);
  assert.equal(JSON.stringify(safe).includes('PRIVATE_'), false);
  assert.deepEqual(config.before_send({ event: '$pageview', properties: { route: '/convite' }, $set_once: { $current_url: 'secret' } }).$set_once, {});
  stop();
});

test('campaign values and referrers use fixed vocabularies; unsafe inputs never leave the browser', () => {
  const campaigns = campaignAllowlist('outubro-2026');
  const attribution = readAttribution('?utm_source=ig&utm_medium=paid_social&utm_campaign=outubro-2026&utm_term=PRIVATE_TERM&gclid=PRIVATE_CLICK', 'https://l.instagram.com/private?token=PRIVATE_TOKEN', 'https://casamia.test', campaigns);
  assert.deepEqual(attribution, { $referring_domain: 'instagram.com', $referrer: 'https://instagram.com/', utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'outubro-2026' });
  const unknown = readAttribution('?utm_source=PRIVATE_EMAIL&utm_medium=PRIVATE_MEDIUM&utm_campaign=PRIVATE_NAME', 'https://PRIVATE_HOST.test/private', 'https://casamia.test', campaigns);
  assert.equal(JSON.stringify(unknown).includes('PRIVATE_'), false);
  assert.equal(unknown.utm_campaign, 'other');
  assert.equal(pageMetadata('http://192.168.1.4:3000', '/reset/PRIVATE_TOKEN').$current_url, 'http://localhost/other');
});

test('session attribution survives navigation and reload, is revalidated, and refreshes for a new SDK session', async () => {
  const storage = new Map();
  const first = await client({}, '/', storage, { search: '?utm_source=whatsapp&utm_medium=social&utm_campaign=launch' });
  first.api.startAnalytics();
  const filter = () => first.config().before_send({ event: '$pageview', properties: {} }).properties;
  assert.equal(filter().utm_source, 'whatsapp');
  const reload = await client({}, '/cadastro', storage);
  reload.api.startAnalytics();
  assert.equal(reload.config().before_send({ event: 'signup_success', properties: {} }).properties.utm_source, 'whatsapp');
  reload.sdk.session = 's2';
  const fresh = reload.config().before_send({ event: '$pageview', properties: {} }).properties;
  assert.equal(fresh.utm_source, undefined);
  assert.equal(fresh.$referring_domain, '$direct');
});

test('internal traffic is explicit, works before login, and never requires an e-mail property', () => {
  assert.equal(trafficType({ DEV: true }, null), 'internal');
  assert.equal(trafficType({}, null, '192.168.1.5'), 'internal');
  assert.equal(trafficType({}, 'internal', 'casamia.com.br'), 'internal');
  assert.equal(trafficType({ MODE: 'test' }, null), 'test');
  assert.equal(trafficType({}, null, 'casamia.com.br'), 'external');
});

test('web vitals exclude raw DOM, resources, invalid metrics and free text while preserving the original page', async () => {
  const props = { $web_vitals_LCP_value: 1500, $web_vitals_LCP_event: { value: 1500, name: 'LCP', id: 'v5-12345', rating: 'good', entries: ['PRIVATE_DOM'], attribution: { element: 'PRIVATE_ELEMENT' } }, $web_vitals_CLS_value: NaN, body: 'PRIVATE_BODY' };
  assert.equal(JSON.stringify(webVitalsProperties(props)).includes('PRIVATE_'), false);
  const c = await client(); c.api.startAnalytics();
  const safe = c.config().before_send({ event: '$web_vitals', properties: { ...props, token: 'phc_test', distinct_id: 'u1', $current_url: 'https://casamia.test/login?token=PRIVATE_TOKEN' } });
  assert.equal(safe.properties.$pathname, '/login');
  assert.equal(safe.properties.$web_vitals_LCP_value, 1500);
  assert.equal(safe.properties.$web_vitals_CLS_value, undefined);
  assert.equal(JSON.stringify(safe).includes('PRIVATE_'), false);
});

test('CTA taxonomy rejects DOM text and page leaves use the previous safe route only once', async () => {
  assert.deepEqual(allowedProperties('landing_cta_clicked', { action: 'start_trial', position: 'hero', text: 'PRIVATE_TEXT' }), { action: 'start_trial', position: 'hero' });
  assert.deepEqual(allowedProperties('landing_cta_clicked', { action: 'PRIVATE_ACTION', position: 'hero' }), {});
  const c = await client({}, '/login'); c.api.startAnalytics();
  c.win.history.pushState({}, '', '/cadastro?token=PRIVATE_TOKEN');
  c.win.history.pushState({}, '', '/app');
  c.win.history.replaceState({}, '', '/app');
  assert.equal(c.config().capture_pageleave, true);
  assert.deepEqual(c.calls.filter(([name]) => name === '$pageleave'), [['$pageleave', { route: '/login' }], ['$pageleave', { route: '/cadastro' }]]);
});

test('exceptions preserve original diagnostics, opt-out and kill switch', async () => {
  const c = await client(); c.api.startAnalytics();
  const event = c.config().before_send({ event: '$exception', properties: {
    $current_url: 'PRIVATE_URL', password: 'PRIVATE_PASSWORD',
    $exception_list: [{ type: 'TypeError', value: 'PRIVATE_EMAIL', stacktrace: { frames: [{ filename: 'https://app.test/assets/app.js?token=PRIVATE_TOKEN', lineno: 12, colno: 8, context_line: 'PRIVATE_CODE' }] } }],
  } });
  assert.equal(event.properties.$exception_list[0].value, 'PRIVATE_EMAIL');
  assert.equal(event.properties.password, 'PRIVATE_PASSWORD');
  assert.equal(event.properties.$exception_list[0].stacktrace.frames[0].context_line, 'PRIVATE_CODE');
  assert.equal(event.properties.$exception_list[0].stacktrace.frames[0].lineno, 12);
  c.api.captureError(new Error('PRIVATE_MESSAGE'));
  assert.equal(c.calls.filter(([name]) => name === '$exception').length, 1);
  c.api.setAnalyticsOptOut(true);
  c.api.captureError(new Error('PRIVATE_MESSAGE'));
  assert.equal(c.calls.filter(([name]) => name === '$exception').length, 1);
  const disabled = await client({ VITE_POSTHOG_ERROR_TRACKING: 'false' }); disabled.api.startAnalytics();
  assert.equal(disabled.config().capture_exceptions, false);
  disabled.api.captureError(new Error('test'));
  assert.equal(disabled.config().before_send({ event: '$exception', properties: {} }), null);
  assert.equal(disabled.calls.some(([name]) => name === '$exception'), false);
});

test('pageviews follow history navigation, deduplicate replacements and remove listeners on dispose', async () => {
  const c = await client({}, '/login');
  const original = c.win.history.pushState;
  const stop = c.api.startAnalytics();
  c.win.history.replaceState({}, '', '/login?token=secret');
  c.win.history.pushState({}, '', '/cadastro#token=secret');
  assert.deepEqual(c.calls.filter(([name]) => name === '$pageview'), [['$pageview', { route: '/login' }], ['$pageview', { route: '/cadastro' }]]);
  stop();
  assert.equal(c.win.history.pushState, original);
});

test('return sessions deduplicate reloads, track new sessions and reset identities on account changes/expiry', async () => {
  const c = await client(); c.api.startAnalytics();
  c.api.identifyAnalytics({ id: 'u1', email: 'private', name: 'Private', plan: 'monthly' });
  c.api.identifyAnalytics({ id: 'u1' });
  assert.equal(c.calls.filter(([name]) => name === 'app_opened').length, 1);
  c.sdk.session = 's2'; c.win.dispatchEvent(new Event('focus'));
  assert.equal(c.calls.filter(([name]) => name === 'app_opened').length, 2);
  c.api.identifyAnalytics({ id: 'u2' });
  assert.equal(c.calls.some(([name]) => name === 'reset'), true);
  assert.equal(JSON.stringify(c.calls).includes('private'), false);
  c.win.dispatchEvent(new Event('casamia:session-expired'));
  assert.deepEqual(c.calls.at(-1), ['reset']);

  const storage = new Map();
  for (let i = 0; i < 2; i++) {
    const reload = await client({}, '/app', storage);
    const stop = reload.api.startAnalytics(); reload.api.identifyAnalytics({ id: 'u1' });
    assert.equal(reload.calls.filter(([name]) => name === 'app_opened').length, i === 0 ? 1 : 0);
    stop();
  }
});

test('conversion deduplication survives reload and opt-out blocks optional events', async () => {
  const storage = new Map();
  for (let i = 0; i < 2; i++) {
    const c = await client({}, '/app', storage); const stop = c.api.startAnalytics();
    c.api.captureOnce('checkout:secret', 'subscription_activated', { plan: 'pass' });
    assert.equal(c.calls.filter(([name]) => name === 'subscription_activated').length, i === 0 ? 1 : 0);
    c.api.setAnalyticsOptOut(true); c.api.capture('item_created');
    assert.equal(c.api.analyticsOptedOut(), true);
    assert.equal(c.calls.some(([name]) => name === 'item_created'), false);
    stop();
  }
});

test('blocked browser storage and SDK capture errors do not break product actions', async () => {
  const c = await client(); c.api.startAnalytics();
  globalThis.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => c.api.identifyAnalytics({ id: 'u1' }));
  assert.doesNotThrow(() => c.api.captureOnce('checkout:test', 'subscription_activated', { plan: 'pass' }));
  c.sdk.capture = () => { throw new Error('offline'); };
  assert.doesNotThrow(() => c.api.capture('item_created'));
  assert.doesNotThrow(() => c.api.resetAnalytics());
});
