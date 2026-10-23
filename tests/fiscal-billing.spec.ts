import { test, expect } from '@playwright/test';

for (const width of [375, 1440]) {
  test(`notas fiscais: dados, endereço e download em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
    });
    const user = { id: 'owner', name: 'Ana', email: 'ana@example.invalid', avatarUrl: null, createdAt: '2026-10-01T12:00:00Z', plan: 'monthly', isGuest: false, onboardingCompleted: true };
    const home = { id: 'home', name: 'Nossa casa', ownerId: user.id, ownerName: user.name, role: 'owner', discountCents: 0, moveDate: null, state: 'SP', city: null, spendingTier: 'equilibrado' };
    const billing = { available: true, plan: 'monthly', status: 'active', accessAllowed: true, isOwner: true, renewsAt: '2026-11-18T12:00:00Z', trialEndsAt: null, trialNotice: null, trialUsed: true, subscriptionId: 'sub_test', canManage: true, cancelAtPeriodEnd: false, passExpiresAt: null, fiscalEnabled: true, fiscalNeedsData: true };
    let fiscal = { enabled: true, requireAddress: true, profile: { name: '', document: '', address: null as unknown }, invoices: [
      { id: 'invoice_authorized', status: 'authorized', environment: 'homologacao', amountCents: 9900, currency: 'brl', number: '123', pdfUrl: 'https://example.invalid/legacy-nfse.pdf', xmlUrl: '/api/billing/fiscal/invoice_authorized/xml', errorCode: null, createdAt: '2026-10-22T15:00:00Z' },
    ] };
    let saved: any;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/bootstrap') return route.fulfill({ json: { user, enxovais: [home], activeEnxoval: home, members: [{ ...user, role: 'owner' }], items: [], categories: [] } });
      if (path === '/api/billing/status') return route.fulfill({ json: billing });
      if (path === '/api/billing/plans') return route.fulfill({ json: { offers: [{ id: 'pass', name: 'Passe da Casa Nova', amount: 9900, currency: 'brl', paymentMethods: ['card', 'pix'] }] } });
      if (path === '/api/profile') return route.fulfill({ json: user });
      if (path === '/api/profile/marketing') return route.fulfill({ json: { subscribed: false } });
      if (path === '/api/billing/fiscal') return route.fulfill({ json: fiscal });
      if (path === '/api/billing/fiscal/profile') {
        saved = route.request().postDataJSON(); fiscal = { ...fiscal, profile: saved };
        return route.fulfill({ json: saved });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/app');
    const decline = page.getByRole('button', { name: 'Recusar', exact: true });
    if (await decline.isVisible()) await decline.click();
    await expect(page.getByText('Sua nota fiscal aguarda os dados de cobrança.', { exact: false })).toBeVisible();
    if (width >= 1024) {
      await page.getByRole('button', { name: 'Menu da conta', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Meu perfil', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Abrir menu do enxoval' }).click();
      await page.getByRole('button', { name: 'Meu perfil', exact: true }).click();
    }
    const dialog = page.getByRole('dialog', { name: 'Meu perfil', exact: true });
    await dialog.getByRole('tab', { name: 'Assinatura', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Notas fiscais', exact: true })).toBeVisible();
    await dialog.getByLabel('Nome completo ou razão social', { exact: true }).fill('Ana de Teste');
    await dialog.getByLabel('CPF ou CNPJ', { exact: true }).fill('529.982.247-25');
    await dialog.getByLabel('Rua ou avenida', { exact: true }).fill('Rua de Teste');
    await dialog.getByLabel('Número', { exact: true }).fill('123');
    await dialog.getByLabel('Bairro', { exact: true }).fill('Centro');
    const state = dialog.locator('.profile-fiscal').getByLabel('Estado', { exact: true });
    await expect(state).toBeEnabled(); await state.selectOption('SP');
    await dialog.locator('.profile-fiscal').getByLabel('Cidade', { exact: true }).selectOption({ label: 'São Paulo' });
    await dialog.getByLabel('CEP', { exact: true }).fill('01001-000');
    await dialog.getByRole('button', { name: 'Salvar dados fiscais', exact: true }).click();
    await expect(dialog.getByText('Dados fiscais salvos.', { exact: false })).toBeVisible();
    expect(saved.address.codigo_municipio).toBe('3550308');
    await expect(dialog.getByText('Homologação, sem valor fiscal', { exact: false })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Abrir nota (PDF)' })).toHaveAttribute('href', 'https://example.invalid/legacy-nfse.pdf');
    await expect(dialog.getByRole('link', { name: 'Baixar XML' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `tmp/fiscal-billing-${width}.png`, fullPage: true });
    billing.accessAllowed = false;
    await page.reload();
    await page.getByRole('button', { name: 'Minhas notas fiscais', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Abrir nota (PDF)' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
