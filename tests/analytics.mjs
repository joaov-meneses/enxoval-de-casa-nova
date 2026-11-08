import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { allowedProperties, scrubSdkProperties, safeRoute } from '../src/analytics/events.ts';
import { apiPathTemplate, describeControl, sanitizeErrorContext, sanitizeOperational, stripUrl } from '../src/analytics/operationalPrivacy.ts';
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
  assert.deepEqual(allowedProperties('item_created', { source: 'manual', status: 'researching', name: 'Private', email: 'secret@example.com', price: 100 }), { source: 'manual', status: 'researching' });
  assert.deepEqual(allowedProperties('plan_ready', { items: Infinity, rooms: 2 }), { rooms: 2 });
  assert.equal(safeRoute('/reset/secret'), '/other');
  assert.equal(safeRoute('/app'), '/app');
  assert.equal(safeRoute('/app/meu-lar'), '/app/meu-lar');
  assert.equal(safeRoute('/app/plano'), '/app/plano');
  assert.equal(safeRoute('/app/itens/3f2a9c1e-room'), '/app/itens/:ambiente');
  assert.equal(safeRoute('/app/desconhecida'), '/app/:enxoval');
  assert.equal(safeRoute('/app/private-home/itens/private-room'), '/app/:enxoval/itens/:ambiente');
  assert.equal(safeRoute('/application'), '/other');
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
  assert.deepEqual(s.calls, [['nino_used', { feature: 'recommend', outcome: 'none' }]]);
});

test('Nino outcomes use fixed vocabularies, never names from the answer', () => {
  const s = sink();
  recordApiSuccess(s, '/api/ai/assess-item', 'POST', { name: 'Private' }, { available: true, source: 'catalog', catalogItem: { name: 'Private' }, environment: null, redundancy: { overlapsWith: 'Private' } });
  recordApiSuccess(s, '/api/ai/assess-item', 'POST', {}, { available: true, source: 'jev', catalogItem: null, environment: { name: 'Private' }, redundancy: null });
  recordApiSuccess(s, '/api/ai/recommend', 'POST', {}, { available: true, recommendation: { name: 'Private' } });
  recordApiSuccess(s, '/api/ai/recommend', 'POST', {}, { available: true, recommendation: null, reason: 'complete' });
  recordApiSuccess(s, '/api/ai/prioritize', 'POST', {}, { available: true, scores: [{ urgency: 3 }] });
  assert.deepEqual(s.calls, [
    ['nino_used', { feature: 'assess_item', outcome: 'redundancy', source: 'catalog' }],
    ['nino_used', { feature: 'assess_item', outcome: 'environment', source: 'jev' }],
    ['nino_used', { feature: 'recommend', outcome: 'recommended' }],
    ['nino_used', { feature: 'recommend', outcome: 'complete' }],
    ['nino_used', { feature: 'prioritize', outcome: 'scored' }],
  ]);
  assert.equal(JSON.stringify(s.calls).includes('Private'), false);
});

test('deleting an item, room or enxoval emits a bare event', () => {
  const s = sink();
  recordApiSuccess(s, '/api/items/i1', 'DELETE', {}, undefined);
  recordApiSuccess(s, '/api/categories/c1?enxovalId=e1', 'DELETE', {}, undefined);
  recordApiSuccess(s, '/api/enxovais/e1', 'DELETE', {}, undefined);
  recordApiSuccess(s, '/api/enxovais/e1/members/u2', 'DELETE', {}, undefined);
  assert.deepEqual(s.calls, [['item_deleted', {}], ['environment_deleted', {}], ['workspace_deleted', {}]]);
  assert.deepEqual(allowedProperties('item_edited', { changed_name: true, changed_price: false, name: 'Private' }), { changed_name: true, changed_price: false });
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
    init: (key, options) => { config = options; sdk.optedOut = Boolean(options.opt_out_capturing_by_default); calls.push(['init', key]); },
    set_config: (next) => { sdk.persistence = next.persistence; },
    capture: (event, properties) => { if (!sdk.optedOut) calls.push([event, properties]); },
    captureException: (error, properties) => { if (!sdk.optedOut) calls.push(['$exception', properties]); },
    identify: (id, properties, setOnce) => calls.push(['identify', id, properties, setOnce]),
    reset: () => { calls.push(['reset']); sdk.optedOut = Boolean(config?.opt_out_capturing_by_default); },
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
  // Por padrão a pessoa já aceitou a análise; os testes de consentimento passam `local` sem escolha.
  const local = options.local || new Map([['casamia:consent', JSON.stringify({ analytics: true, marketing: false, version: '2026-10', decidedAt: '2026-10-01T00:00:00Z' })]]);
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

test('admin operational events are dropped; exceptions are kept', async () => {
  const c = await client({}, '/admin/catalog'); c.api.startAnalytics();
  assert.ok(c.config());
  const properties = { body: { password: 'raw-password' }, response: { email: 'real@example.test' }, path: '/api/admin/x' };
  assert.equal(c.config().before_send({ event: 'application.api.completed', properties }), null);
  assert.equal(c.config().before_send({ event: 'application.ui.action', properties: { action: 'click' } }), null);
  assert.equal(c.config().before_send({ event: '$exception', properties: { $exception_list: [{ type: 'Error', value: 'Original admin failure' }] } }).properties.$exception_list[0].value, 'Original admin failure');
});

const fakeControl = (tagName, attrs = {}, props = {}) => ({
  tagName, value: '', checked: false, textContent: '', ...props,
  getAttribute: name => attrs[name] ?? null,
});

test('ui action descriptions never contain typed values, labels or text', () => {
  const password = fakeControl('INPUT', { name: 'password', type: 'password' }, { value: 'SEGREDO_SENHA', textContent: 'SEGREDO_TEXTO' });
  const email = fakeControl('INPUT', { name: 'email', type: 'email' }, { value: 'pessoa@example.test' });
  const pix = fakeControl('INPUT', { name: 'pix', type: 'text' }, { value: '123.456.789-00' });
  const terms = fakeControl('INPUT', { name: 'terms', type: 'checkbox' }, { checked: true });
  const area = fakeControl('TEXTAREA', { name: 'nota' }, { value: 'texto privado', textContent: 'texto privado' });
  const button = fakeControl('BUTTON', { type: 'submit', 'aria-label': 'Reenviar para convidado@example.test', 'data-analytics': 'invite_resend' }, { textContent: 'Reenviar para convidado@example.test' });
  const form = { querySelectorAll: () => [password, email, pix, terms, area] };
  const link = fakeControl('A', { href: '/preferencias?token=SEGREDO_TOKEN#hash=SEGREDO_HASH' }, { textContent: 'Preferências de pessoa@example.test' });
  const events = [
    describeControl(password, form), describeControl(email, form), describeControl(button, form),
    describeControl(area, form), describeControl(terms, form), describeControl(link, null),
  ];
  const text = JSON.stringify(events);
  for (const secret of ['SEGREDO', 'pessoa@example.test', 'convidado@example.test', '123.456', 'texto privado', 'token=', 'hash=']) assert.equal(text.includes(secret), false, secret);
  for (const event of events) for (const key of ['value', 'text', 'label']) assert.equal(key in event, false, key);
  assert.deepEqual(events[0].fields[0], { name: 'password', id: undefined, type: 'password', filled: true });
  assert.deepEqual(events[0].fields[3], { name: 'terms', id: undefined, type: 'checkbox', filled: true, checked: true });
  assert.equal(events[2].data_analytics, 'invite_resend');
  assert.equal(events[4].checked, true);
  assert.equal(events[5].href, '/preferencias');
});

test('form.name or form.checked shadowed by a child element never leaks an object', () => {
  const child = { nodeName: 'INPUT', value: 'SEGREDO_FILHO' };
  const form = fakeControl('FORM', { name: 'login', id: 'f' }, { name: child, id: child, checked: child, value: child });
  const described = describeControl(form, { querySelectorAll: () => [fakeControl('INPUT', { name: 'q', type: 'checkbox' }, { checked: child, value: child })] });
  assert.deepEqual([described.name, described.id], ['login', 'f']);
  assert.equal(JSON.stringify(described).includes('SEGREDO'), false);
  assert.deepEqual(described.fields, [{ name: 'q', id: undefined, type: 'checkbox', filled: false, checked: false }]);
  for (const [key, value] of Object.entries(described)) if (key !== 'fields') assert.notEqual(typeof value, 'object', key);
});

test('operational filter drops unknown properties, bodies and URL query/hash', () => {
  assert.equal(stripUrl('https://casamia.test/preferencias?token=x#y'), 'https://casamia.test/preferencias');
  assert.equal(stripUrl('/a/b?c=1', 'https://casamia.test'), '/a/b');
  const clean = sanitizeOperational({
    action: 'submit', url: 'https://casamia.test/preferencias?token=SEGREDO', value: 'SEGREDO_VALOR', novoCampo: 'SEGREDO_NOVO',
    body: '{"password":"SEGREDO"}', headers: { authorization: 'SEGREDO' }, response: { email: 'SEGREDO' }, response_headers: { a: 'SEGREDO' },
    path: '/api/auth/login', method: 'POST', http_status: 401, duration_ms: 12, request_id: 'r1',
    fields: [{ name: 'senha', type: 'password', value: 'SEGREDO', filled: true }],
    error: { name: 'ApiError', message: 'Este convite é para SEGREDO@example.test', stack: 'SEGREDO', code: 'X', extra: 'SEGREDO' },
    label: 'SEGREDO', text: 'SEGREDO', $session_id: 's', token: 'phc', $leak: 'SEGREDO', objeto: { a: 1 }, lista: ['SEGREDO'], $set: { email: 'SEGREDO' },
  });
  assert.equal(JSON.stringify(clean).includes('SEGREDO'), false);
  assert.equal(clean.url, 'https://casamia.test/preferencias');
  assert.deepEqual([clean.path, clean.method, clean.http_status, clean.request_id, clean.$session_id, clean.token], ['/api/auth/login', 'POST', 401, 'r1', 's', 'phc']);
  assert.deepEqual([clean.error_name, clean.error_code, 'error' in clean, '$leak' in clean], ['ApiError', 'X', false, false]);
  assert.equal(sanitizeOperational({ path: '/api/invitations/3f2a9c1e-aaaa-bbbb-cccc-123456789012?token=T' }).path, '/api/invitations/:id');
  assert.equal(apiPathTemplate('/api/enxovais/abc123/itens'), '/api/enxovais/:id/itens');
  assert.deepEqual(clean.fields, [{ name: 'senha', id: undefined, type: 'password', filled: true }]);
});

test('operational events leave the browser without typed values, query or hash', async () => {
  const c = await client({}, '/preferencias'); c.api.startAnalytics();
  globalThis.window.location.href = 'https://casamia.test/preferencias?token=SEGREDO#h=SEGREDO';
  c.api.captureOperational('application.ui.action', { action: 'click', value: 'SEGREDO_SENHA', fields: [{ type: 'password', value: 'SEGREDO_SENHA', filled: true }] });
  const sent = c.calls.filter(([event]) => event === 'application.ui.action').at(-1)[1];
  assert.equal(JSON.stringify(sent).includes('SEGREDO'), false);
  assert.equal(sent.url, 'https://casamia.test/preferencias');
  const nav = c.calls.filter(([event]) => event === 'application.navigation').at(-1)[1];
  assert.deepEqual(Object.keys(nav).filter(key => ['search', 'hash'].includes(key)), []);
  const viaSdk = c.config().before_send({ event: 'application.api.started', properties: { path: '/api/auth/login', method: 'POST', body: '{"password":"SEGREDO"}', headers: {}, extra: 'SEGREDO', token: 'phc', distinct_id: 'd' } }).properties;
  assert.equal(JSON.stringify(viaSdk).includes('SEGREDO'), false);
  assert.equal(viaSdk.path, '/api/auth/login');
  assert.equal(viaSdk.token, 'phc');
});

test('exceptions from failed API calls never carry the request body, headers or response', async () => {
  const c = await client({}, '/login'); c.api.startAnalytics();
  const login = { path: '/api/auth/login?email=SEGREDO_EMAIL', method: 'POST', body: '{"email":"a@b.test","password":"SEGREDO_SENHA"}', headers: { authorization: 'SEGREDO' } };
  // 401: o contexto antigo (body + response) é filtrado em captureError.
  c.api.captureError(new Error('E-mail ou senha inválidos'), { ...login, request_id: 'r1', http_status: 401, duration_ms: 9, response: { error: 'SEGREDO_RESPOSTA' }, response_headers: { a: 'SEGREDO' }, error_source: 'api' });
  // Falha de rede.
  c.api.captureError(new TypeError('Failed to fetch'), { ...login, error_source: 'api' });
  // React: só componentStack e error_source.
  c.api.captureError(new Error('boom'), { error_source: 'react.caught', componentStack: '\n at App', digest: 'SEGREDO_DIGEST', props: { senha: 'SEGREDO' } });
  const sent = c.calls.filter(([event]) => event === '$exception').map(([, props]) => props);
  assert.equal(sent.length, 3);
  assert.equal(JSON.stringify(sent).includes('SEGREDO'), false);
  assert.deepEqual(sent[0], { path: '/api/auth/login', method: 'POST', request_id: 'r1', http_status: 401, duration_ms: 9, error_source: 'api' });
  assert.deepEqual(sent[2], { error_source: 'react.caught', componentStack: '\n at App' });
  // before_send remove o que ainda sobrar em um $exception, mantendo a mensagem do erro.
  const out = c.config().before_send({ event: '$exception', properties: { body: 'SEGREDO', headers: {}, input: 'SEGREDO', response: 'SEGREDO', response_headers: {}, path: '/api/x?q=SEGREDO', $exception_list: [{ type: 'Error', value: 'ApiError 401 POST /api/auth/login' }] } }).properties;
  assert.equal(JSON.stringify(out).includes('SEGREDO'), false);
  assert.equal(out.$exception_list[0].value, 'ApiError 401 POST /api/auth/login');
});

test('$exception uses an allowlist: URLs lose query and hash, unknown and nested properties are dropped', async () => {
  const c = await client({}, '/preferencias'); c.api.startAnalytics();
  const out = c.config().before_send({ event: '$exception', properties: {
    token: 'phc', distinct_id: 'd', $session_id: 's', $device_id: 'dev', $lib: 'web', $browser: 'Edge', $os: 'Windows',
    $current_url: 'https://casamia.test/preferencias?token=T_SEGREDO', $pathname: '/preferencias?token=T_SEGREDO#h_SEGREDO',
    $referrer: 'https://site.test/x?q=R_SEGREDO', $initial_current_url: 'https://casamia.test/a?i=I_SEGREDO', $initial_referrer: 'https://s.test/?r=R_SEGREDO',
    $set: { email: 'E_SEGREDO' }, $leak: 'L_SEGREDO', password: 'P_SEGREDO', email: 'E_SEGREDO', objeto: { a: 'O_SEGREDO' },
    http_status: 401, error_source: 'api', $exception_list: [{ type: 'ApiError', value: 'ApiError 401 POST /api/auth/login' }],
  } }).properties;
  assert.equal(JSON.stringify(out).includes('SEGREDO'), false);
  for (const key of ['password', 'email', '$leak', '$set', 'objeto']) assert.equal(key in out, false, key);
  assert.deepEqual([out.token, out.distinct_id, out.$session_id, out.$device_id, out.$lib, out.$browser, out.$os, out.http_status, out.error_source],
    ['phc', 'd', 's', 'dev', 'web', 'Edge', 'Windows', 401, 'api']);
  assert.equal(out.$exception_list[0].type, 'ApiError');
  assert.equal(out.$current_url, 'https://casamia.test/preferencias');
});

test('application events clean $set and $set_once and drop unknown $ keys', async () => {
  const c = await client({}, '/app'); c.api.startAnalytics();
  const out = c.config().before_send({ event: 'application.api.started', properties: { path: '/api/x', $leak: 'SEGREDO', $set: { a: 'SEGREDO' } },
    $set: { plan: 'free', $initial_current_url: 'https://casamia.test/preferencias?t=SEGREDO#x', obj: { a: 'SEGREDO' } },
    $set_once: { $initial_current_url: 'https://casamia.test/a?t=SEGREDO#x', $initial_referrer: 'https://s.test/?q=SEGREDO' } });
  assert.equal(JSON.stringify(out).includes('SEGREDO'), false);
  assert.deepEqual(out.$set, { plan: 'free', $initial_current_url: 'https://casamia.test/preferencias' });
});

test('Chá slugs and other free-text path params become placeholders everywhere', async () => {
  assert.equal(apiPathTemplate('/api/public/housewarming/maria-e-joao'), '/api/public/housewarming/:slug');
  assert.equal(apiPathTemplate('/api/public/housewarming/maria-e-joao/reservations?x=1'), '/api/public/housewarming/:slug/reservations');
  assert.equal(apiPathTemplate('/api/admin/catalog/aliases/Panela%20Tramontina'), '/api/admin/catalog/aliases/:key');
  assert.equal(apiPathTemplate('/api/items/ab/offers/cd'), '/api/items/:id/offers/:id');
  const op = sanitizeOperational({ path: '/cha/maria-e-joao', url: 'https://casamia.test/cha/maria-e-joao?x=1', href: '/cha/maria-e-joao#a' }, 'https://casamia.test');
  assert.deepEqual([op.path, op.url, op.href], ['/cha/:slug', 'https://casamia.test/cha/:slug', '/cha/:slug']);
  assert.equal(sanitizeOperational({ path: '/api/public/housewarming/maria-e-joao' }).path, '/api/public/housewarming/:slug');
  assert.equal(JSON.stringify(sanitizeErrorContext({ path: '/api/public/housewarming/maria-e-joao/messages' })).includes('maria'), false);
  const c = await client({}, '/cha/maria-e-joao'); c.api.startAnalytics();
  const out = c.config().before_send({ event: '$exception', properties: {
    $current_url: 'https://casamia.test/cha/maria-e-joao?x=1', $pathname: '/cha/maria-e-joao', $initial_current_url: 'https://casamia.test/cha/maria-e-joao',
    $exception_list: [{ type: 'ApiError', value: 'ApiError 404 GET /api/public/housewarming/:slug' }],
  } }).properties;
  assert.equal(JSON.stringify(out).includes('maria'), false);
  assert.deepEqual([out.$current_url, out.$pathname], ['https://casamia.test/cha/:slug', '/cha/:slug']);
});

test('ApiError rejections reaching the SDK get the fixed message, not the server text', async () => {
  const c = await client({}, '/convite'); c.api.startAnalytics();
  const shown = 'Este convite é para pessoa@example.test';
  c.api.rememberApiError(shown, 'ApiError 403 POST /api/invitations/:id');
  const out = c.config().before_send({ event: '$exception', properties: { $exception_list: [
    { type: 'ApiError', value: shown, mechanism: { type: 'onunhandledrejection', handled: false, data: { message: 'SEGREDO' } } },
    { type: 'ApiError', value: 'mensagem nunca registrada com dado@example.test' },
    { type: 'TypeError', value: 'x is not a function' },
  ] } }).properties.$exception_list;
  assert.equal(out[0].value, 'ApiError 403 POST /api/invitations/:id');
  assert.equal(out[1].value, 'ApiError');
  assert.equal(out[2].value, 'x is not a function');
  assert.equal(JSON.stringify(out).includes('example.test'), false);
  assert.equal(JSON.stringify(out).includes('SEGREDO'), false);
  assert.deepEqual(out[0].mechanism, { type: 'onunhandledrejection', handled: false, synthetic: undefined });
});

test('$exception keeps only safe $exception_* keys and the minimal list structure', async () => {
  const c = await client({}, '/app'); c.api.startAnalytics();
  const out = c.config().before_send({ event: '$exception', properties: {
    $exception_level: 'error', $exception_fingerprint: 'fp', $exception_types: ['TypeError'],
    $exception_values: ['SEGREDO_VALOR'], $exception_steps: [{ message: 'SEGREDO_PASSO' }], $exception_message: 'SEGREDO_MSG', $exception_source: 'SEGREDO_SRC',
    $initial_utm_term: 'SEGREDO_TERM', $initial_gclid: 'SEGREDO_GCLID', $initial_referrer: 'https://s.test/?q=SEGREDO', $initial_os: 'Windows',
    $exception_list: [{ type: 'TypeError', value: 'falhou', module: 'SEGREDO_MOD', extra: 'SEGREDO', mechanism: { type: 'generic', handled: true, data: 'SEGREDO' },
      stacktrace: { type: 'raw', frames: [{ filename: 'https://app.test/a.js?token=SEGREDO#h', function: 'f', lineno: 1, colno: 2, context_line: 'SEGREDO', vars: { a: 'SEGREDO' }, abs_path: 'SEGREDO' }] } }],
  } }).properties;
  assert.equal(JSON.stringify(out).includes('SEGREDO'), false);
  assert.deepEqual(Object.keys(out).filter(key => key.startsWith('$exception')).sort(), ['$exception_fingerprint', '$exception_level', '$exception_list', '$exception_types']);
  assert.equal(out.$initial_os, 'Windows');
  assert.deepEqual(Object.keys(out).filter(key => key.startsWith('$initial_')), ['$initial_os']);
  assert.deepEqual(Object.keys(out.$exception_list[0]).sort(), ['mechanism', 'stacktrace', 'type', 'value']);
  const frame = out.$exception_list[0].stacktrace.frames[0];
  assert.deepEqual([frame.filename, frame.function, frame.lineno, frame.colno], ['https://app.test/a.js', 'f', 1, 2]);
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
  assert.equal('password' in event.properties, false, 'propriedade fora da lista de permissão não sai');
  assert.equal(JSON.stringify(event.properties).includes('PRIVATE_PASSWORD'), false);
  const frame = event.properties.$exception_list[0].stacktrace.frames[0];
  assert.equal(frame.context_line, undefined, 'código-fonte do frame não sai');
  assert.equal(frame.filename, 'https://app.test/assets/app.js');
  assert.equal(frame.lineno, 12);
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

test('PostHog only captures after analytics consent and stops when it is withdrawn', async () => {
  const local = new Map();
  const c = await client({}, '/login', new Map(), { local });
  c.api.startAnalytics();
  assert.equal(c.config().opt_out_capturing_by_default, true);
  assert.equal(c.config().persistence, 'memory');
  c.api.capture('signup_submit');
  assert.equal(c.calls.some(([name]) => name === 'signup_submit' || name === '$pageview'), false);
  c.api.setAnalyticsOptOut(false);
  assert.equal(c.sdk.persistence, 'localStorage+cookie');
  assert.deepEqual(c.calls.filter(([name]) => name === '$pageview'), [['$pageview', { route: '/login' }]]);
  c.api.capture('signup_submit');
  assert.equal(c.calls.filter(([name]) => name === 'signup_submit').length, 1);
  assert.equal(JSON.parse(local.get('casamia:consent')).analytics, true);
  // Logout ou sessão expirada chamam reset(), que volta o SDK ao opt-out padrão: o consentimento é reaplicado.
  c.api.resetAnalytics();
  c.api.capture('signup_submit');
  assert.equal(c.calls.filter(([name]) => name === 'signup_submit').length, 2);
  c.api.setAnalyticsOptOut(true);
  assert.equal(c.sdk.persistence, 'memory');
  c.api.capture('signup_submit');
  assert.equal(c.calls.filter(([name]) => name === 'signup_submit').length, 2);
  assert.equal(c.api.analyticsOptedOut(), true);
});

test('identify stores the first-touch channel once and never forwards raw referrers', async () => {
  const local = new Map([
    ['casamia:consent', JSON.stringify({ analytics: true, marketing: false, version: '2026-10', decidedAt: '2026-10-01T00:00:00Z' })],
    ['cm_first_touch', JSON.stringify({ source: 'google', medium: 'cpc', campaign: 'enxoval-casal-sp-2026q4', referrerHost: 'private.example', firstSeenAt: new Date().toISOString() })],
  ]);
  const c = await client({}, '/app', new Map(), { local });
  c.api.startAnalytics();
  c.api.identifyAnalytics({ id: 'u1' });
  const identify = c.calls.find(([name]) => name === 'identify');
  assert.deepEqual(identify[3], { initial_channel_group: 'paid_search', initial_source: 'google', initial_medium: 'cpc', initial_campaign: 'enxoval-casal-sp-2026q4' });
  assert.equal(JSON.stringify(c.calls).includes('private.example'), false);
});

test('Google Tag Manager waits for consent, starts denied and forwards mapped events only', async () => {
  const local = new Map();
  const c = await client({ VITE_POSTHOG_KEY: '', VITE_GTM_ID: 'GTM-TEST123' }, '/cadastro', new Map(), { local });
  const appended = [];
  c.doc.createElement = () => ({});
  c.doc.head = { appendChild: node => appended.push(node) };
  c.api.startAnalytics();
  const layer = () => c.win.dataLayer.map(entry => (entry && typeof entry.length === 'number' && !Array.isArray(entry) ? Array.from(entry) : entry));
  assert.deepEqual(layer()[0].slice(0, 2), ['consent', 'default']);
  assert.equal(layer()[0][2].analytics_storage, 'denied');
  assert.equal(layer()[0][2].ad_user_data, 'denied');
  assert.equal(appended.length, 0);
  c.api.capture('signup_success');
  assert.equal(layer().some(entry => entry?.event === 'sign_up'), false);
  c.api.setAnalyticsOptOut(false);
  assert.equal(appended.length, 1);
  assert.match(appended[0].src, /gtm\.js\?id=GTM-TEST123$/);
  const update = layer().filter(entry => Array.isArray(entry) && entry[1] === 'update').at(-1);
  assert.equal(update[2].analytics_storage, 'granted');
  assert.equal(update[2].ad_storage, 'denied');
  c.api.capture('signup_success');
  c.api.capture('item_created', { source: 'manual', status: 'researching' });
  assert.deepEqual(layer().filter(entry => entry?.event === 'sign_up'), [{ event: 'sign_up', method: 'email' }]);
  assert.equal(layer().some(entry => entry?.event === 'item_created'), false);
  assert.deepEqual(layer().filter(entry => entry?.event === 'page_view').map(entry => entry.page_path), ['/cadastro']);
});
