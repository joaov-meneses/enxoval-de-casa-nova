import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, options: { role?: string; moveDate?: string | null } = {}) {
  await page.addInitScript(() => localStorage.setItem('casamia:consent', JSON.stringify({ analytics: false, marketing: false, version: '2026-10', decidedAt: new Date().toISOString() })));
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00-03:00'));
  let home = { id: 'home', name: 'Nossa casa nova', ownerId: 'owner', role: options.role ?? 'owner', discountCents: 0,
    moveDate: options.moveDate === undefined ? '2026-12-05' : options.moveDate, state: 'SP', city: null, spendingTier: 'equilibrado', monthlyBudgetCents: 10000 };
  const user = { id: 'owner', name: 'Ana', email: 'ana@example.invalid', plan: 'monthly', isGuest: false, onboardingCompleted: true };
  const categories = [{ id: 'kitchen', name: 'Cozinha', sortOrder: 0 }];
  let items: any[] = [
    { id: 'fridge', name: 'Geladeira', priceCents: 20000, priority: 'essential', priceCategory: 4, timing: null },
    { id: 'organizer', name: 'Organizador de talheres', priceCents: 8000, priority: 'optional', priceCategory: 1, timing: null,
      catalog: { priority: 'optional', priceCategory: 1, timing: null, leadTimeWeeks: 0,
        priceRange: { p10: 7000, p50: 10000, p90: 12000, samples: 8, source: 'serpapi', region: '', updatedAt: '2026-10-24T12:00:00Z' } } },
  ].map(item => ({ ...item, categoryId: 'kitchen', category: 'Cozinha', status: 'researching', checked: false,
    link: '', description: '', discountCents: 0, quantity: 1, sortOrder: 0, buyWeek: null,
    leadTimeWeeks: null, researchWeeks: null, hasTemporarySolution: false, dependsOnItemId: null, updatedAt: '2026-10-24T12:00:00Z' }));
  const patches: any[] = [];
  let failNext = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/bootstrap') return route.fulfill({ json: { user, enxovais: [home], activeEnxoval: home, categories, items, members: [] } });
    if (path === '/api/billing/status') return route.fulfill({ json: { available: true, plan: 'monthly', status: 'active', accessAllowed: true, isOwner: true, trialUsed: true, trialNotice: null } });
    if (path === '/api/ai/status') return route.fulfill({ json: { enabled: true } });
    if (path.includes('/prioritize')) {
      items = items.map(item => ({ ...item, aiUrgency: item.id === 'fridge' ? 8 : 1, aiUrgencyConfidence: .95 }));
      return route.fulfill({ json: { available: true, categoryId: 'kitchen', scores: items.map(item => ({ id: item.id, urgency: item.aiUrgency, confidence: .95 })), inferred: 2, cached: 0, unscored: 0 } });
    }
    if (path.startsWith('/api/items/') && route.request().method() === 'PATCH') {
      const data = route.request().postDataJSON(); patches.push(data);
      if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { error: 'Não foi possível salvar. Tente novamente.' } }); }
      const id = path.split('/').at(-1);
      items = items.map(item => item.id === id ? { ...item, ...data } : item);
      return route.fulfill({ json: items.find(item => item.id === id) });
    }
    if (path === '/api/enxovais/home' && route.request().method() === 'PATCH') {
      home = { ...home, ...route.request().postDataJSON() };
      return route.fulfill({ json: home });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/app');
  await page.locator('.mobile-bottom-nav').getByRole('button', { name: /Planejamento/ }).click();
  await expect(page.locator('.pp')).toBeVisible();
  return { patches, fail: () => { failNext = true; } };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

for (const [size, width, height] of [['S', 320, 568], ['M', 375, 667], ['L', 425, 800]] as const) {
  test(`unified scheduling and mobile ${size}: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const { patches, fail } = await setup(page);
    await expect(page.getByRole('region', { name: 'Conflitos do planejamento' })).toBeVisible();
    await page.locator('.pp-period').last().locator('.pp-period-toggle').click();
    await expect(page.locator('.purchase-price-opportunity')).toContainText('20% abaixo da referência');
    await expect(page.locator('.purchase-price-opportunity')).toContainText('8 ofertas comparáveis');
    await noOverflow(page);
    await page.screenshot({ path: `.tmp/planning-${width}.png`, fullPage: true });

    const before = page.locator('.pp-period').filter({ has: page.locator('.pp-period-name', { hasText: 'Antes da mudança' }) });
    await before.locator('.pp-period-toggle').click();
    await page.getByRole('button', { name: 'Ajustar sugestão de Geladeira', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Quando comprar: Geladeira' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Entrega, montagem e instalação', { exact: true }).fill('6');
    await dialog.getByLabel('Tempo para pesquisar e escolher', { exact: true }).fill('2');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('combobox', { name: 'Item que precisa ser definido antes' }).click();
    await page.getByRole('option', { name: 'Organizador de talheres', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Semana de compra', exact: true }).click();
    await page.getByRole('option', { name: /^2 semanas antes ·/ }).click();
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(dialog.locator('.purchase-timing-date')).toContainText('27/11');
    await page.screenshot({ path: `.tmp/planning-dialog-${width}.png` });
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    const headingBox = await dialog.locator('.dialog-heading').boundingBox();
    expect(headingBox!.y).toBeGreaterThanOrEqual(box!.y - 1);
    const footerBox = await dialog.locator('.purchase-timing-footer').boundingBox();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(height + 1);
    await dialog.getByRole('button', { name: 'Salvar planejamento', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(patches.at(-1)).toMatchObject({ leadTimeWeeks: 6, researchWeeks: 2, hasTemporarySolution: true, dependsOnItemId: 'organizer', buyWeek: -2 });

    await page.getByRole('button', { name: 'Ajustar sugestão de Geladeira', exact: true }).click();
    await expect(dialog.getByLabel('Entrega, montagem e instalação', { exact: true })).toHaveValue('6');
    fail();
    await dialog.getByLabel('Entrega, montagem e instalação', { exact: true }).fill('7');
    await dialog.getByRole('button', { name: 'Salvar planejamento', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Não foi possível salvar');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

    const budget = page.getByLabel('Quanto você pode destinar à casa por mês?', { exact: true });
    await budget.fill('50000'); await budget.press('Enter');
    await expect(budget).toHaveValue(/500,00/);
    await page.getByRole('button', { name: 'Ver os itens prioritários', exact: true }).click();
    const ranking = page.locator('.pp-nino-ranking');
    await expect(ranking).toBeVisible();
    const date = await ranking.locator('li').filter({ hasText: 'Geladeira' }).locator('.pp-nino-urgency').innerText();
    await expect(before.locator('.pp-row').filter({ hasText: 'Geladeira' }).locator('.pp-row-week')).toContainText(date);

    await page.locator('.mobile-bottom-nav').getByRole('button', { name: /Meu enxoval/ }).click();
    const when = page.getByRole('button', { name: 'Quando comprar Geladeira', exact: true });
    await expect(when).toContainText(date);
    await when.click();
    const edit = page.getByRole('dialog', { name: 'Geladeira', exact: true });
    await expect(edit.getByLabel('Entrega, montagem e instalação', { exact: true })).toHaveValue('6');
    await edit.getByRole('button', { name: 'Fechar janela', exact: true }).click();
    await page.locator('.mobile-bottom-nav').getByRole('button', { name: /Meu Lar/ }).click();
    await expect(page.getByRole('button', { name: 'Ver planejamento', exact: true })).toBeVisible();
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test('no move date keeps reference weeks and editors cannot change the monthly budget', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setup(page, { role: 'editor', moveDate: null });
  await expect(page.getByRole('region', { name: 'Conflitos do planejamento' })).toHaveCount(0);
  await expect(page.getByLabel('Quanto você pode destinar à casa por mês?', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Data da mudança', { exact: true })).toBeDisabled();
  await page.locator('.pp-period').first().locator('.pp-period-toggle').click();
  await page.getByRole('button', { name: 'Ajustar sugestão de Geladeira', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Quando comprar: Geladeira' });
  await expect(dialog.locator('.purchase-timing-date')).toContainText('antes da mudança');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await noOverflow(page);
});
