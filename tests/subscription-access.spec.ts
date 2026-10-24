import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Iniciar: postman simulation run postman/simulations/subscription-access.sim.yaml --port 4904 --no-history
const simulation = process.env.SUBSCRIPTION_SIMULATION_URL || 'http://127.0.0.1:4904/app';

async function workspace(page: Page, initial: Record<string, unknown> = {}, options: { bootstrapUnavailable?: boolean } = {}) {
  const session = randomUUID();
  const configure = async (config: Record<string, unknown>) => {
    const response = await fetch(`${simulation}/test/configure`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mock-session': session }, body: JSON.stringify(config) });
    expect(response.ok).toBe(true);
  };
  await configure(initial);
  await page.addInitScript(() => localStorage.setItem('casamia:consent', JSON.stringify({ analytics: false, marketing: false, version: '2026-10', decidedAt: new Date().toISOString() })));
  const home = { id: 'home', name: 'Casa da Ana', ownerId: 'ana', ownerName: 'Ana', role: 'owner', discountCents: 0, moveDate: null, state: 'BA', city: null, spendingTier: 'equilibrado' };
  const other = { ...home, id: 'other', name: 'Casa compartilhada', ownerId: 'leo', role: 'editor' };
  const categories = [{ id: 'kitchen', name: 'Cozinha', sortOrder: 0 }];
  const items = [{ id: 'pan', name: 'Panela', category: 'Cozinha', categoryId: 'kitchen', status: 'researching', checked: false,
    link: '', description: '', quantity: 1, priceCents: 15000, discountCents: 0, sortOrder: 0, buyWeek: null,
    priceCategory: null, priority: null, timing: null, createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }];
  const statusCalls: string[] = [];
  const statusResults: string[] = [];
  let bootstrapUnavailable = options.bootstrapUnavailable;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap' && bootstrapUnavailable) return route.abort('internetdisconnected');
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: {
      user: { id: 'ana', name: 'Ana', email: 'ana@example.invalid', plan: 'monthly', onboardingCompleted: true, isGuest: false },
      enxovais: [home, other], activeEnxoval: url.searchParams.get('enxovalId') === 'other' ? other : home,
      categories, items, members: [],
    } });
    if (url.pathname.startsWith('/api/enxovais/')) return route.fulfill({ json: {
      enxoval: url.pathname.endsWith('/other') ? other : home, categories, items, members: [],
    } });
    if (url.pathname === '/api/billing/status') {
      const scope = url.searchParams.get('enxovalId') || 'account';
      statusCalls.push(scope);
      const response = await route.fetch({ url: `${simulation}${url.pathname}${url.search}`, headers: { 'x-mock-session': session } });
      await route.fulfill({ response });
      statusResults.push(scope);
      return;
    }
    if (url.pathname === '/api/billing/plans') return route.fulfill({ json: { offers: [
      { id: 'monthly', name: 'Mensal', amount: 2990, currency: 'brl' },
      { id: 'pass', name: 'Passe', amount: 9900, currency: 'brl' },
    ] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/app/itens/kitchen');
  return { configure, statusCalls, statusResults, resumeBootstrap: () => { bootstrapUnavailable = false; } };
}

const focus = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

for (const width of [320, 1440]) {
  test(`carregamento mantém a estrutura, sem botão de erro, em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { statusCalls } = await workspace(page, { delayMs: 2000 });
    await expect(page.locator('.workspace-loading')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
    await expect(page.locator('.workspace-app')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Verificando seu acesso…' })).toHaveCount(0);
    await expect.poll(() => statusCalls.length).toBe(1);
    await page.screenshot({ path: test.info().outputPath(`loading-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.workspace-app')).toBeVisible();
    await page.reload();
    await expect(page.locator('.workspace-loading')).toBeVisible();
    await expect(page.locator('.workspace-app')).toBeVisible();
  });
}

test('navegação e revalidação lenta preservam o app e uma consulta em trânsito', async ({ page }) => {
  const api = await workspace(page);
  await expect(page.locator('.workspace-app')).toBeVisible();
  const initialCalls = api.statusCalls.length;
  await page.locator('[data-item-id="pan"] .item-title-button').click();
  await api.configure({ delayMs: 1600 });
  await focus(page);
  await focus(page);
  await expect(page.locator('.workspace-loading')).toHaveCount(0);
  await expect(page.locator('[data-item-id="pan"] .item-title-button')).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => api.statusCalls.length).toBe(initialCalls + 1);
  // A edição abre numa janela: fecha antes de usar a barra lateral.
  await page.keyboard.press('Escape');
  await page.locator('.workspace-sidebar').getByRole('button', { name: 'Planejamento', exact: true }).click();
  await expect(page.locator('.workspace-app')).toBeVisible();
  await expect(page.locator('.workspace-loading')).toHaveCount(0);
  await expect.poll(() => api.statusResults.length).toBe(api.statusCalls.length);
  expect(api.statusCalls.length).toBe(initialCalls + 1);
});

test('falha transitória preserva a lista e oferece uma tentativa discreta', async ({ page }) => {
  const api = await workspace(page);
  await expect(page.locator('.workspace-app')).toBeVisible();
  await api.configure({ httpStatus: 503 });
  await focus(page);
  const notice = page.locator('.subscription-connection-notice');
  await expect(notice).toBeVisible();
  await expect(page.locator('[data-item-id="pan"]')).toBeVisible();
  await expect(page.locator('.workspace-loading')).toHaveCount(0);
  await api.configure({ delayMs: 1000 });
  await notice.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(notice.getByRole('button', { name: 'Tentando…' })).toBeDisabled();
  await expect(page.locator('.workspace-app')).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test('falha na primeira consulta não expõe dados nem oferece assinatura como solução', async ({ page }) => {
  const api = await workspace(page, { httpStatus: 503 });
  await expect(page.locator('.workspace-loading-error')).toBeVisible();
  await expect(page.locator('.workspace-app')).toHaveCount(0);
  await expect(page.locator('.subscription-plan-selection')).toHaveCount(0);
  await api.configure({});
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.workspace-app')).toBeVisible();
});

test('consulta que não termina mostra nova tentativa após o prazo de espera', async ({ page }) => {
  const api = await workspace(page, { delayMs: 12000 });
  await expect(page.locator('.workspace-loading-error')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.workspace-app')).toHaveCount(0);
  await api.configure({});
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.workspace-app')).toBeVisible();
  // Aguarda também a resposta abandonada para confirmar que ela não altera o novo estado.
  await expect.poll(() => api.statusResults.length).toBe(api.statusCalls.length);
  await expect(page.locator('.workspace-app')).toBeVisible();
});

test('conexão perdida não desmonta o app já validado', async ({ page }) => {
  await workspace(page);
  await expect(page.locator('.workspace-app')).toBeVisible();
  await page.route('**/api/billing/status*', route => route.abort('internetdisconnected'));
  await focus(page);
  await expect(page.locator('.subscription-connection-notice')).toBeVisible();
  await expect(page.locator('[data-item-id="pan"]')).toBeVisible();
  await expect(page.locator('.workspace-loading')).toHaveCount(0);
});

test('falha ao carregar a conta oferece nova tentativa sem fingir logout', async ({ page }) => {
  const api = await workspace(page, {}, { bootstrapUnavailable: true });
  await expect(page.locator('.workspace-loading-error')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /e-mail/i })).toHaveCount(0);
  api.resumeBootstrap();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.workspace-app')).toBeVisible();
});

test('negação explícita invalida imediatamente a verificação anterior', async ({ page }) => {
  const api = await workspace(page);
  await expect(page.locator('.workspace-app')).toBeVisible();
  await api.configure({ delayMs: 1200, status: { accessAllowed: false, plan: 'free', isOwner: false } });
  await page.evaluate(() => window.dispatchEvent(new Event('casamia:subscription-required')));
  await expect(page.locator('.workspace-app')).toHaveCount(0);
  await expect(page.locator('.workspace-loading')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Este enxoval está com o acesso bloqueado' })).toBeVisible();
  await expect(page.locator('.subscription-connection-notice')).toHaveCount(0);
});

test('resposta antiga de outro enxoval não libera o enxoval bloqueado', async ({ page }) => {
  const api = await workspace(page);
  await expect(page.locator('.workspace-app')).toBeVisible();
  await api.configure({ scopes: {
    home: { delayMs: 1800 }, other: { delayMs: 300, status: { accessAllowed: false, isOwner: false, plan: 'free' } },
  } });
  const oldResults = api.statusResults.filter(scope => scope === 'home').length;
  await focus(page);
  await page.locator('.enxoval-switcher-trigger').click();
  await page.getByRole('menuitem', { name: /Casa compartilhada/ }).click();
  await expect(page.getByRole('heading', { name: 'Este enxoval está com o acesso bloqueado' })).toBeVisible();
  await expect.poll(() => api.statusResults.filter(scope => scope === 'home').length).toBe(oldResults + 1);
  await expect(page.locator('.workspace-app')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Este enxoval está com o acesso bloqueado' })).toBeVisible();
});

for (const plan of ['monthly', 'pass']) {
  test(`prazo do ${plan} termina mesmo durante falha de rede`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
    const api = await workspace(page, { status: { plan, status: plan === 'monthly' ? 'trialing' : null,
      [plan === 'monthly' ? 'trialEndsAt' : 'passExpiresAt']: '2026-10-22T12:00:30Z', trialNotice: null } });
    await expect(page.locator('.workspace-app')).toBeVisible();
    await api.configure({ httpStatus: 503 });
    await focus(page);
    await expect(page.locator('.subscription-connection-notice')).toBeVisible();
    await page.clock.fastForward(31000);
    await expect(page.locator('.workspace-app')).toHaveCount(0);
    await expect(page.locator('.subscription-card')).toBeVisible();
  });
}

test('sessão expirada encerra o app em vez de manter a tela anterior', async ({ page }) => {
  const api = await workspace(page);
  await expect(page.locator('.workspace-app')).toBeVisible();
  await api.configure({ httpStatus: 401 });
  await focus(page);
  await expect(page.locator('.workspace-app')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /e-mail/i })).toBeVisible();
});

for (const pass of [false, true]) {
  test(`confirmar aviso de ${pass ? 'Passe' : 'trial'} não restaura um acesso revogado durante a confirmação`, async ({ page }) => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const api = await workspace(page, { status: pass
      ? { plan: 'pass', passNotice: 'cs_test', passExpiresAt: future, passPayment: { sessionId: 'cs_test', amount: 9900, currency: 'brl' } }
      : { status: 'trialing', trialNotice: 'started', trialEndsAt: future } });
    let release: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let started = false;
    let completed = false;
    await page.route(`**/api/billing/${pass ? 'pass' : 'trial'}-notice`, async route => {
      started = true;
      await pending;
      await route.fulfill({ status: 204 });
      completed = true;
    });
    await page.getByRole('button', { name: 'Continuar para meu enxoval' }).click();
    await expect.poll(() => started).toBe(true);
    await api.configure({ status: { accessAllowed: false, plan: 'free', isOwner: false } });
    await focus(page);
    await expect(page.getByRole('heading', { name: 'Este enxoval está com o acesso bloqueado' })).toBeVisible();
    release!();
    await expect.poll(() => completed).toBe(true);
    await expect(page.locator('.workspace-app')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Este enxoval está com o acesso bloqueado' })).toBeVisible();
  });
}
