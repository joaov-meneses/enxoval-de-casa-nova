import { test, expect, chromium, webkit, devices } from '@playwright/test';

const baseURL = process.env.STORE_TEST_URL ?? 'http://127.0.0.1:4176';
const consent = () => localStorage.setItem('casamia:consent', JSON.stringify({ analytics: false, marketing: false, version: '2026-10', decidedAt: new Date().toISOString() }));

for (const [name, engine, device] of [['Android Chromium', chromium, devices['Pixel 5']], ['iPhone WebKit', webkit, devices['iPhone 13']]] as const) {
  test(`${name}: production service worker, offline reopen, queued purchase and reconnect`, async () => {
    test.setTimeout(90_000);
    await fetch(`${baseURL}/__test/reset`, { method: 'POST' });
    const browser = await engine.launch({ channel: engine === chromium && process.platform === 'win32' ? 'msedge' : undefined });
    try {
      const context = await browser.newContext({ ...device, baseURL, serviceWorkers: 'allow' });
      await context.addInitScript(consent);
      let page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', err => errors.push(err.message));
      await page.goto('/app/home/loja');
      await expect(page.getByRole('heading', { name: 'Modo loja' })).toBeVisible();
      await expect(page.locator('.store-offline-readiness')).toContainText('Disponível para abrir sem conexão', { timeout: 30000 });
      expect(await page.evaluate(async () => {
        const keys = await caches.keys();
        const requests = await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(req => req.url)));
        return requests.flat().some(url => new URL(url).pathname.startsWith('/api/'));
      })).toBe(false);
      await page.close();
      // WebKit 2359 rejects even literal service-worker responses under setOffline:
      // https://github.com/microsoft/playwright/issues/42775 . Cut actual origin connections instead.
      if (engine === webkit) await fetch(`${baseURL}/__test/network`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offline: true }) });
      else await context.setOffline(true);
      page = await context.newPage();
      page.on('pageerror', err => errors.push(err.message));
      const offlineNavigation = await page.goto('/app/home/loja');
      expect(offlineNavigation?.fromServiceWorker()).toBe(true);
      await expect(page.locator('.store-mode')).toBeVisible();
      await expect(page.locator('.store-item')).toHaveCount(2);
      const pan = page.locator('.store-item').filter({ hasText: 'Panela' });
      await pan.getByRole('button', { name: 'Comprei', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Comprei', exact: true });
      await dialog.getByLabel(/Quanto você pagou/).fill('14500');
      await dialog.getByRole('button', { name: 'Confirmar situação', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('.store-item')).toHaveCount(1);
      await expect(page.locator('.store-status')).toContainText('1 alteração aguardando');
      await page.reload();
      await expect(page.locator('.store-item')).toHaveCount(1);
      await page.screenshot({ path: `.tmp/offline-${name.split(' ')[0]}.png`, fullPage: true });
      if (engine === webkit) {
        await fetch(`${baseURL}/__test/network`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offline: false }) });
        await page.reload();
      } else await context.setOffline(false);
      await expect.poll(async () => (await (await fetch(`${baseURL}/__test/state`)).json()).patches.length).toBe(1);
      await expect(page.locator('.store-item')).toHaveCount(1);
      const state = await (await fetch(`${baseURL}/__test/state`)).json();
      expect(state.patches).toContainEqual(expect.objectContaining({ id: 'pan', status: 'bought', checked: true, priceCents: 14500 }));
      expect(state.patches[0].purchasedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(errors).toEqual([]);
      await context.close();
    } finally {
      await fetch(`${baseURL}/__test/network`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offline: false }) });
      await browser.close();
    }
  });
}

for (const width of [320, 375, 425]) {
  test(`receipt review at ${width}px requires explicit amount confirmation`, async () => {
    await fetch(`${baseURL}/__test/reset`, { method: 'POST' });
    const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
    try {
      const context = await browser.newContext({ baseURL, viewport: { width, height: width === 320 ? 568 : width === 375 ? 667 : 800 }, serviceWorkers: 'block' });
      await context.addInitScript(consent);
      const page = await context.newPage();
      await page.goto('/app/home');
      await page.locator('.mobile-bottom-nav').getByRole('button', { name: /^Meu enxoval/ }).click();
      await page.getByRole('button', { name: 'Abrir detalhes de Geladeira', exact: true }).click();
      const form = page.getByRole('form', { name: 'Editar Geladeira na lista' });
      await form.getByRole('button', { name: 'Ler nota nota-teste.png', exact: true }).click();
      const review = page.getByRole('region', { name: 'Conferir dados da nota' });
      await expect(review).toBeVisible();
      await expect(review.getByRole('checkbox')).not.toBeChecked();
      await review.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.tmp/receipt-review-${width}.png` });
      await review.getByRole('button', { name: 'Usar dados no formulário', exact: true }).click();
      await expect(review).toBeHidden();
      expect((await (await fetch(`${baseURL}/__test/state`)).json()).patches).toEqual([]);
      await form.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
      const state = await (await fetch(`${baseURL}/__test/state`)).json();
      expect(state.patches.at(-1)).toMatchObject({ storeName: 'CASA TESTE LTDA', purchasedAt: '2026-10-23', priceCents: 10000 });
      await page.getByRole('button', { name: 'Abrir detalhes de Geladeira', exact: true }).click();
      await form.getByRole('button', { name: 'Ler nota nota-teste.png', exact: true }).click();
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Usar dados no formulário', exact: true }).click();
      await form.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
      const confirmed = await (await fetch(`${baseURL}/__test/state`)).json();
      expect(confirmed.patches.at(-1).priceCents).toBe(12345);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await context.close();
    } finally { await browser.close(); }
  });
}

test('late Wake Lock permission is released after leaving the store', async () => {
  await fetch(`${baseURL}/__test/reset`, { method: 'POST' });
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 }, serviceWorkers: 'block' });
    await context.addInitScript(consent);
    await context.addInitScript(() => {
      const state = window as unknown as { wakeRequests: number; wakeReleases: number; resolveWake?: () => void };
      state.wakeRequests = 0; state.wakeReleases = 0;
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => {
        state.wakeRequests++;
        return new Promise(resolve => { state.resolveWake = () => resolve({ release: async () => { state.wakeReleases++; } }); });
      } } });
    });
    const page = await context.newPage();
    await page.goto('/app/home/loja');
    await expect.poll(() => page.evaluate(() => (window as unknown as { wakeRequests: number }).wakeRequests)).toBe(1);
    await page.getByRole('button', { name: 'Sair do modo loja', exact: true }).click();
    await expect(page.locator('.store-mode')).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { resolveWake: () => void }).resolveWake());
    await expect.poll(() => page.evaluate(() => (window as unknown as { wakeReleases: number }).wakeReleases)).toBe(1);
    await context.close();
  } finally { await browser.close(); }
});
