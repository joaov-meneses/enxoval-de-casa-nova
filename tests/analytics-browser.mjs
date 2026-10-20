import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

// Real SDK + browser smoke test. All telemetry is intercepted locally.
const previous = { ...process.env };
process.env.VITE_POSTHOG_KEY = 'phc_browser_test';
process.env.VITE_POSTHOG_HOST = 'https://analytics.example.test';
process.env.VITE_POSTHOG_ENABLE_DEV = 'true';
process.env.VITE_POSTHOG_ERROR_TRACKING = 'true';
process.env.VITE_POSTHOG_WEB_VITALS = 'true';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  // Exercise the real capture path: PostHog filters automation as bot traffic.
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(30000);
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const batches = [];
  const errors = [];
  const telemetryRequests = [];
  let failItemRequest = false;
  const exceptionScript = await readFile('node_modules/posthog-js/dist/exception-autocapture.js', 'utf8');
  const vitalsScript = await readFile('node_modules/posthog-js/dist/web-vitals.js', 'utf8');
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    if (request.url().startsWith('https://analytics.example.test')) {
      telemetryRequests.push([request.method(), request.url()]);
      if (request.url().endsWith('/exception-autocapture.js')) return route.fulfill({ contentType: 'application/javascript', body: exceptionScript });
      if (request.url().endsWith('/web-vitals.js')) return route.fulfill({ contentType: 'application/javascript', body: vitalsScript });
      if (request.method() === 'POST') {
        let body = request.postDataBuffer();
        try { body = gunzipSync(body); } catch { /* SDK may send uncompressed JSON. */ }
        const text = body.toString();
        let json;
        try { json = JSON.parse(text); }
        catch {
          const params = new URLSearchParams(text);
          json = JSON.parse(Buffer.from(params.get('data'), 'base64').toString());
        }
        batches.push(...(Array.isArray(json) ? json : json.batch ?? [json]));
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (request.url().startsWith(`${origin}/api/`)) {
      const path = new URL(request.url()).pathname;
      if (path === '/api/auth/login') return route.fulfill({ json: { user: { id: 'test-user', name: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL', plan: 'monthly' } } });
      if (path === '/api/auth/register') return route.fulfill({ json: { user: { id: 'test-user', name: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL' } } });
      if (path === '/api/billing/sync') return route.fulfill({ json: { accessAllowed: true, plan: 'monthly', status: 'trialing' } });
      if (path === '/api/items' && failItemRequest) return route.fulfill({ status: 503, json: { error: 'PRIVATE_SERVER_MESSAGE' } });
      if (path.startsWith('/api/items')) return route.fulfill({ json: path === '/api/items' ? { item: { status: 'researching' } } : { status: 'bought' } });
      return route.fulfill({ status: 401, json: { error: 'Unauthenticated' } });
    }
    if (request.url().startsWith(origin)) return route.continue();
    return route.abort();
  });
  await page.goto(`${origin}/privacidade?utm_source=instagram&utm_medium=social&utm_campaign=launch&utm_term=PRIVATE_TERM&token=PRIVATE_TOKEN#PRIVATE_FRAGMENT`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Desativar análise de uso' }).waitFor();
  await page.waitForFunction(() => window.__PosthogExtensions__?.errorWrappingFunctions && window.onerror);
  await page.locator('h1').click();
  await page.evaluate(() => {
    history.pushState({}, '', '/login?token=PRIVATE_NAV_TOKEN');
    history.pushState({}, '', '/privacidade');
  });
  await page.evaluate(async () => {
    const api = await import('/src/api.ts');
    await api.login('PRIVATE_EMAIL', 'PRIVATE_PASSWORD');
    await api.createItem({ enxovalId: 'test', name: 'PRIVATE_ITEM', description: 'PRIVATE_DESCRIPTION', link: 'https://PRIVATE_LINK' });
    await api.updateItem('item', { status: 'bought' });
    (await import('/src/analytics.ts')).captureError(new TypeError('PRIVATE_EXCEPTION PRIVATE_EMAIL'));
    window.dispatchEvent(new ErrorEvent('error', { message: 'PRIVATE_UNHANDLED', error: new RangeError('PRIVATE_UNHANDLED') }));
    await api.register('PRIVATE_EMAIL', 'PRIVATE_PASSWORD');
    (await import('/src/onboarding/analytics.ts')).track('signup_success');
    await api.syncBilling('PRIVATE_CHECKOUT');
  });
  failItemRequest = true;
  await page.evaluate(async () => {
    try { await (await import('/src/api.ts')).createItem({ enxovalId: 'test', name: 'PRIVATE_FAILED_ITEM' }); }
    catch { /* The UI can handle this error; telemetry must still receive it. */ }
  });
  // Default SDK batching interval is three seconds.
  await page.waitForTimeout(8500);
  if (!batches.length) console.log({ telemetryRequests, errors, browser: await page.evaluate(() => ({ dnt: navigator.doNotTrack, storage: { ...localStorage } })) });
  assert.ok(batches.some(event => event.event === '$pageview'));
  assert.ok(batches.some(event => event.event === 'login_success'));
  assert.ok(batches.some(event => event.event === 'item_created'));
  assert.ok(batches.some(event => event.event === 'item_purchase_recorded'));
  for (const goal of ['signup_success', 'onboarding_complete', 'subscription_activated']) assert.ok(batches.some(event => event.event === goal));
  const pageview = batches.find(event => event.event === '$pageview');
  assert.equal(pageview.properties.$pathname, '/privacidade');
  assert.equal(pageview.properties.$current_url, 'http://localhost/privacidade');
  assert.equal(pageview.properties.utm_source, 'instagram');
  assert.equal(pageview.properties.utm_campaign, 'launch');
  assert.equal(pageview.properties.traffic_type, 'internal');
  const vitals = batches.find(event => event.event === '$web_vitals');
  assert.ok(vitals, 'real web-vitals observers must send metrics');
  assert.equal(vitals.properties.$pathname, '/privacidade');
  assert.ok(['FCP', 'LCP', 'CLS', 'INP'].some(name => typeof vitals.properties[`$web_vitals_${name}_value`] === 'number'));
  const exception = batches.find(event => event.event === '$exception');
  assert.ok(exception);
  assert.equal(exception.properties.$exception_list[0].type, 'TypeError');
  assert.ok(exception.properties.$exception_list[0].stacktrace.frames.length);
  assert.equal(exception.properties.token, 'phc_browser_test');
  assert.ok(exception.properties.distinct_id);
  assert.ok(batches.some(event => event.event === '$exception' && event.properties.$exception_list[0].type === 'RangeError'));
  assert.ok(batches.some(event => event.event === '$exception' && event.properties.error_source === 'api' && event.properties.http_status === 503));
  const findPrivate = (value, path = '') => Object.entries(value).flatMap(([key, child]) => child && typeof child === 'object' ? findPrivate(child, `${path}.${key}`) : String(child).includes('PRIVATE_') ? [`${path}.${key}: ${child}`] : []);
  assert.deepEqual(findPrivate(batches.filter(event => event.event !== '$exception' && !event.event.startsWith('application.'))), []);
  assert.equal(exception.properties.$exception_list[0].value, 'PRIVATE_EXCEPTION PRIVATE_EMAIL');
  assert.ok(batches.some(event => event.event === 'application.api.started' && event.properties.path === '/api/auth/login' && event.properties.body.includes('PRIVATE_PASSWORD')));
  assert.ok(batches.some(event => event.event === 'application.api.completed' && event.properties.response?.user?.email === 'PRIVATE_EMAIL'));
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="diagnostic" value="RAW_FORM_VALUE"><button type="button">Diagnostic action</button>';
    document.body.append(form);
    form.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
    form.querySelector('button').click();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.remove();
  });
  await page.waitForTimeout(3500);
  for (const action of ['click', 'change', 'submit']) {
    assert.ok(batches.some(event => event.event === 'application.ui.action' && event.properties.action === action && event.properties.fields?.some(field => field.value === 'RAW_FORM_VALUE')));
  }
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'Desativar análise de uso' }).click();
  await page.getByRole('button', { name: 'Ativar análise de uso' }).waitFor();
  await page.waitForTimeout(3500); // Drain events queued before the opt-out click.
  const count = batches.length;
  await page.evaluate(async () => {
    const analytics = await import('/src/analytics.ts');
    analytics.capture('item_created');
    analytics.captureError(new Error('PRIVATE_OPTED_OUT'));
  });
  await page.waitForTimeout(3500);
  assert.equal(batches.length, count);
  await page.reload();
  await page.getByRole('button', { name: 'Ativar análise de uso' }).waitFor();
  await page.getByRole('button', { name: 'Ativar análise de uso' }).click();
  await page.goto(`${origin}/`);
  await page.locator('.cm-hero-actions a').first().waitFor();
  // Prevent navigation only in this test, while still exercising React's real click handler.
  await page.locator('.cm-hero-actions a').first().evaluate(element => element.addEventListener('click', event => event.preventDefault()));
  await page.locator('.cm-hero-actions a').first().dispatchEvent('click');
  await page.waitForTimeout(3500);
  assert.ok(batches.some(event => event.event === 'landing_cta_clicked' && event.properties.action === 'start_trial' && event.properties.position === 'hero'));
  assert.ok(batches.some(event => event.event === '$pageleave' && event.properties.$pathname === '/privacidade'));
  assert.deepEqual(findPrivate(batches.filter(event => event.event !== '$exception' && !event.event.startsWith('application.'))), []);
  assert.equal(exception.properties.$exception_list[0].value, 'PRIVATE_EXCEPTION PRIVATE_EMAIL');
  console.log('Browser smoke passed: real SDK, complete exceptions, raw API diagnostics, UI actions, product events, Web Vitals and persistent opt-out.');
} finally {
  await browser?.close();
  await server.close();
  for (const key of ['VITE_POSTHOG_KEY', 'VITE_POSTHOG_HOST', 'VITE_POSTHOG_ENABLE_DEV', 'VITE_POSTHOG_ERROR_TRACKING', 'VITE_POSTHOG_WEB_VITALS']) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
}
