import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('casamia:consent', JSON.stringify({ analytics: false, marketing: false, version: '2026-10', decidedAt: new Date().toISOString() })));
  await page.route('**/ingest/**', route => route.abort());
});

for (const width of [320, 375, 425]) {
  test(`gestos de boas-vindas, planejamento e alegria em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const welcome = page.locator('.cm-hero-nino');
    await welcome.scrollIntoViewIfNeeded();
    await expect(welcome).toHaveAttribute('data-animated', 'true');
    await expect(welcome).toHaveCSS('animation-name', 'nino-wave');
    const thinking = page.locator('.cm-nino-figure .nino');
    await thinking.scrollIntoViewIfNeeded();
    await expect(thinking).toHaveAttribute('data-animated', 'true');
    await expect(thinking).toHaveCSS('animation-name', 'nino-think');
    await expect(thinking).toHaveCSS('animation-iteration-count', '1');
    await expect.poll(() => thinking.evaluate(el => el.getAnimations().every(animation => animation.playState === 'finished'))).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.route('**/api/public/housewarming/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/events')) return route.abort();
      if (path.endsWith('/messages')) return route.fulfill({ status: 201, json: { id: 'message' } });
      return route.fulfill({ json: { slug: 'nino-test', title: 'Nosso novo lar', message: 'Venha celebrar com a gente.', eventDate: null, pix: null, items: [] } });
    });
    await page.goto('/cha/nino-test');
    const guestNino = page.locator('.housewarming-nino .nino');
    await expect(guestNino).toHaveAttribute('data-pose', 'wave');
    await page.getByRole('button', { name: 'Deixar um recado', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Seu nome').fill('Ana');
    await dialog.getByLabel('Seu recado').fill('Felicidades no novo lar!');
    await dialog.getByRole('button', { name: 'Enviar recado' }).click();
    await expect(dialog).toBeHidden();
    await guestNino.scrollIntoViewIfNeeded();
    await expect(guestNino).toHaveAttribute('data-pose', 'happy');
    await expect(guestNino).toHaveAttribute('data-animated', 'true');
    await expect(guestNino).toHaveCSS('animation-name', 'nino-happy');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`nino-${width}.png`), fullPage: true });
  });
}

test('movimento reduzido mantém o Nino estático', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const nino = page.locator('.cm-hero-nino');
  await nino.scrollIntoViewIfNeeded();
  await expect(nino).toBeVisible();
  await expect(nino).toHaveCSS('animation-name', 'none');
  expect(await nino.evaluate(el => el.getAnimations().length)).toBe(0);
});
