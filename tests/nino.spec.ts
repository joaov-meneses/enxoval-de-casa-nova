import { test, expect, type Page } from '@playwright/test';

async function workspace(page: Page, options: { holdSave?: boolean } = {}) {
  const home = { id: 'home', name: 'Nossa casa', ownerId: 'owner', role: 'owner', discountCents: 0, moveDate: null, state: 'BA', city: null, spendingTier: 'equilibrado' };
  const categories = [{ id: 'kitchen', name: 'Cozinha', sortOrder: 0 }, { id: 'bedroom', name: 'Quarto', sortOrder: 1 }, { id: 'empty', name: 'Escritório', sortOrder: 2 }];
  const base = { link: '', description: '', quantity: 1, discountCents: 0, buyWeek: null, priceCategory: null, priority: null, timing: null, createdAt: '2026-10-18T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
  let items = [
    { ...base, id: 'pan', name: 'Panela', categoryId: 'kitchen', category: 'Cozinha', status: 'researching', checked: false, priceCents: 15000, sortOrder: 0 },
    { ...base, id: 'cups', name: 'Copos', categoryId: 'kitchen', category: 'Cozinha', status: 'received', checked: true, priceCents: null, sortOrder: 1 },
    { ...base, id: 'bed', name: 'Cama', categoryId: 'bedroom', category: 'Quarto', status: 'researching', checked: false, priceCents: null, sortOrder: 0 },
  ];
  let aiCalls = 0;
  let releaseSuggestion: (() => void) | undefined;
  let releaseSave: (() => void) | undefined;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/bootstrap') return route.fulfill({ json: {
      user: { id: 'owner', name: 'Ana', email: 'ana@example.invalid', plan: 'monthly', isGuest: false, onboardingCompleted: true },
      enxovais: [home], activeEnxoval: home, categories, items, members: [],
    } });
    if (path === '/api/billing/status') return route.fulfill({ json: { available: true, plan: 'monthly', status: 'active', accessAllowed: true, isOwner: true, trialUsed: true, trialNotice: null } });
    if (path === '/api/ai/status') return route.fulfill({ json: { enabled: true } });
    if (path === '/api/ai/recommend') {
      aiCalls++;
      const { categoryId } = route.request().postDataJSON();
      await new Promise<void>(resolve => { releaseSuggestion = resolve; });
      return route.fulfill({ json: { available: true, recommendation: {
        name: 'Pratos', essential: true, confidence: 0.95, clear: true, categoryId, categoryName: 'Cozinha',
        options: [{ name: 'Pratos', essential: true, probability: 0.95 }],
      } } });
    }
    if (path === '/api/items' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const saved = { ...items[0], ...body, id: 'new', status: 'researching', checked: false };
      items.push(saved);
      return route.fulfill({ json: { item: saved, category: categories.find(category => category.id === body.categoryId) } });
    }
    const match = path.match(/^\/api\/items\/([^/]+)$/);
    if (match && route.request().method() === 'PATCH') {
      if (options.holdSave) await new Promise<void>(resolve => { releaseSave = resolve; });
      const updates = route.request().postDataJSON();
      items = items.map(item => {
        if (item.id !== match[1]) return item;
        const status = updates.status ?? (updates.checked === false ? 'researching' : updates.checked ? 'bought' : item.status);
        return { ...item, ...updates, status, checked: ['bought', 'received', 'owned'].includes(status) };
      });
      return route.fulfill({ json: items.find(item => item.id === match[1]) });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/app/itens/kitchen');
  await expect(page.locator('.workspace-app')).toBeVisible();
  await expect(page.locator('.pp-nino')).toHaveCount(0);
  return { calls: () => aiCalls, release: () => releaseSuggestion?.(), releaseSave: () => releaseSave?.(), saving: () => Boolean(releaseSave) };
}

async function completePan(page: Page) {
  await page.locator('[data-item-id="pan"]').getByRole('checkbox').click();
  const dialog = page.getByRole('dialog', { name: 'Como você conseguiu?', exact: true });
  await dialog.getByRole('radio', { name: /^Comprado/ }).click();
  await dialog.getByRole('button', { name: 'Confirmar situação' }).click();
}

for (const width of [320, 1440]) {
  test.describe(`Nino em ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('ajuda fica no planejamento e só consulta ao pedir', async ({ page }) => {
      const api = await workspace(page);
      await page.goto('/app/plano');
      const bubble = page.locator('.pp-nino');
      await expect(bubble).toHaveAttribute('data-nino-state', 'thinking');
      await expect(bubble).toContainText('Falta 1 item da sua lista em Cozinha');
      expect(api.calls()).toBe(0);
      await bubble.getByRole('button', { name: 'Pedir sugestão' }).click();
      await expect(bubble).toContainText('Estou conferindo');
      await expect.poll(api.calls).toBe(1);
      api.release();
      await expect(bubble).toContainText('Pratos');
      await bubble.getByRole('button', { name: 'Adicionar', exact: true }).click();
      await expect(bubble.getByRole('button', { name: 'Adicionar', exact: true })).toHaveCount(0);
      await page.goto('/app/itens/kitchen');
      await expect(page.locator('[data-item-id="new"]')).toContainText('Pratos');
      await expect(page.locator('.pp-nino')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow).toBe(false);
    });
  });
}

test('planejamento mostra estados do ambiente selecionado e respeita movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await workspace(page);
  await completePan(page);
  await page.locator('.workspace-sidebar').getByRole('button', { name: 'Planejamento', exact: true }).click();
  await expect(page.locator('.nino-mood.is-celebrating .nino')).toHaveCSS('animation-name', 'none');
  await page.goto('/app/plano');
  await expect(page.locator('.pp-nino')).toHaveAttribute('data-nino-state', 'resting');
  await expect(page.locator('.pp-nino')).toContainText('Tudo da sua lista em Cozinha');
  await page.getByRole('combobox', { name: 'O que comprar primeiro?' }).click();
  await page.getByRole('option', { name: 'Quarto', exact: true }).click();
  await expect(page.locator('.pp-nino')).toHaveAttribute('data-nino-state', 'thinking');
  await expect(page.locator('.pp-nino')).toContainText('Falta 1 item da sua lista em Quarto');
  await page.getByRole('combobox', { name: 'Qual o próximo item de um ambiente?' }).click();
  await page.getByRole('option', { name: 'Cozinha', exact: true }).click();
  await expect(page.locator('.pp-nino')).toHaveAttribute('data-nino-state', 'resting');
});

test('comemora só após salvar e acompanha a navegação para o planejamento', async ({ page }) => {
  const api = await workspace(page, { holdSave: true });
  await completePan(page);
  await expect.poll(api.saving).toBe(true);
  await expect(page.locator('.pp-nino')).toHaveCount(0);
  api.releaseSave();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.workspace-sidebar').getByRole('button', { name: 'Planejamento', exact: true }).click();
  await expect(page.locator('.pp-nino')).toHaveAttribute('data-nino-state', 'celebrating');
  await expect(page.locator('.pp-nino')).toHaveAttribute('data-nino-state', 'resting', { timeout: 6000 });
});
