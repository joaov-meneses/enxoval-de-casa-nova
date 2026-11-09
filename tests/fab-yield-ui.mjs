import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

/* Estabilidade do botão flutuante que cede (useFabYield): no topo, o estado não alterna com mutações do DOM; cede/volta
   ao rolar; e um botão focado nunca fica escondido. */
const base = process.env.FAB_YIELD_UI_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 640 }, reducedMotion: 'reduce' });
  const home = { id: 'home', name: 'Nossa casa nova', ownerId: 'owner', role: 'owner', discountCents: 0, moveDate: null, state: 'BA', city: null, spendingTier: 'equilibrado' };
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, categoryId: 'bedroom', category: 'Quarto', checked: false, status: 'researching', link: '', description: '', priceCents: 10000, quantity: 1, discountCents: 0, sortOrder: i, buyWeek: null, priceCategory: null, priority: null, timing: null, updatedAt: '2026-10-18T12:00:00Z', imageUrl: null }));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/bootstrap') return route.fulfill({ json: { user: { id: 'owner', name: 'Ana', email: 'ana@example.invalid', plan: 'monthly', isGuest: false, onboardingCompleted: true }, enxovais: [home], activeEnxoval: home, members: [], categories: [{ id: 'bedroom', name: 'Quarto', sortOrder: 0 }], items } });
    if (path === '/api/billing/status') return route.fulfill({ json: { available: true, plan: 'monthly', status: 'active', accessAllowed: true, isOwner: true, trialUsed: true, trialNotice: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${base}/app`);
  await page.locator('.workspace-app').waitFor();
  await page.locator('.mobile-bottom-nav').getByRole('button', { name: /^Meu enxoval/ }).click();
  await page.locator('[data-item-id=i0]').waitFor();
  const fab = page.locator('.mobile-fab-add');
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));
  const state = () => fab.evaluate((el) => el.hasAttribute('data-yield'));
  // Provoca mutações de DOM (como o botão "Limpar busca" surgindo).
  const mutate = () => page.evaluate(() => {
    const root = document.getElementById('workspace-main') ?? document.body;
    const s = document.createElement('span'); s.className = 'tmp-mut'; root.append(s);
  });

  let yielded = 0;
  for (let h = 560; h <= 720; h += 4) {
    await page.setViewportSize({ width: 375, height: h });
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames();
    // Em cada situação da busca (vazia/digitada) o estado deve ser estável: o layout muda entre elas, o estado não oscila.
    const search = page.locator('.list-search input').first();
    const phases = [''];
    if (await search.count()) phases.push('a', '');
    let last;
    for (const text of phases) {
      if (await search.count()) { await search.fill(text); await frames(); }
      const seen = new Set();
      for (let n = 0; n < 8; n++) { await mutate(); await frames(); seen.add(await state()); }
      assert.equal(seen.size, 1, `altura ${h}, busca "${text}": o estado do botão alternou com mutações (${[...seen]})`);
      last = [...seen][0];
    }
    if (last) yielded++;
    await page.evaluate(() => document.querySelectorAll('.tmp-mut').forEach((e) => e.remove()));
  }
  assert.ok(yielded > 0, 'o botão cede em alguma altura de tela quando cobriria um controle');

  // Cede no topo e volta ao rolar (usa uma altura em que cede).
  let checked = false;
  for (let h = 560; h <= 720 && !checked; h += 4) {
    await page.setViewportSize({ width: 375, height: h });
    await page.evaluate(() => window.scrollTo(0, 0)); await frames();
    if (!(await state())) continue;
    assert.equal(await fab.evaluate((el) => getComputedStyle(el).visibility), 'hidden');
    await page.evaluate(() => window.scrollTo(0, 600)); await frames();
    assert.equal(await state(), false, 'volta ao rolar para baixo');
    assert.equal(await fab.evaluate((el) => getComputedStyle(el).visibility), 'visible');
    await page.evaluate(() => window.scrollTo(0, 0)); await frames();
    assert.equal(await state(), true, 'cede de novo ao voltar ao topo');
    // Foco nunca fica num elemento invisível.
    // (focar enquanto cedido é impossível: visibility:hidden tira do Tab) Foca visível, volta ao topo e o foco permanece.
    await page.evaluate(() => window.scrollTo(0, 600)); await frames();
    await fab.focus(); await frames();
    await page.evaluate(() => window.scrollTo(0, 0)); await frames();
    assert.equal(await state(), false, 'botão focado não cede');
    assert.equal(await fab.evaluate((el) => getComputedStyle(el).visibility), 'visible');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mobile-fab-add')), true);
    checked = true;
  }
  assert.ok(checked);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log('fab-yield-ui ok');
