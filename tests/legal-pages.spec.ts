import { expect, test } from '@playwright/test';

for (const width of [320, 375, 425]) {
  test(`políticas públicas acessíveis e sem rolagem horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, heading] of [['/termos', 'Termos de Uso'], ['/reembolso', 'Cancelamento e reembolso']] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: 'contato@devspot.com.br', exact: true }).first()).toHaveAttribute('href', /^mailto:contato@devspot\.com\.br/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    const submit = page.getByRole('button', { name: 'Solicitar cancelamento e reembolso' });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
    await expect(submit).toHaveCSS('background-color', 'rgb(163, 76, 48)');
    await page.screenshot({ path: `test-results/legal-refunds-${width}.png` });
  });
}

test('pedido é confirmado somente após registro, sem exigir justificativa', async ({ page }) => {
  let input: Record<string, unknown> | undefined;
  await page.route('**/api/feedback', async route => {
    input = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: 'protocolo-de-teste' } });
  });
  await page.goto('/reembolso');
  await page.getByRole('button', { name: 'Solicitar cancelamento e reembolso' }).click();
  await expect(page.getByRole('status')).toContainText('Pedido recebido.');
  await expect(page.getByRole('status')).toContainText('protocolo-de-teste');
  expect(input?.kind).toBe('other');
  expect(input?.description).toContain('direito de arrependimento');
  await expect(page.getByRole('button', { name: 'Solicitar cancelamento e reembolso' })).toHaveCount(0);
});

test('sem sessão não confirma pedido e mantém alternativa de contato', async ({ page }) => {
  await page.route('**/api/feedback', route => route.fulfill({ status: 401, json: { error: 'Entre na sua conta.' } }));
  await page.goto('/reembolso');
  await page.getByRole('button', { name: 'Solicitar cancelamento e reembolso' }).click();
  await expect(page.getByRole('alert')).toContainText('Entre na conta usada na contratação');
  await expect(page.getByRole('link', { name: 'Entrar na conta', exact: true })).toHaveAttribute('href', '/login');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'contato@devspot.com.br', exact: true }).first()).toBeVisible();
  await page.goto('/privacidade');
  await expect(page.getByRole('link', { name: 'contato@devspot.com.br', exact: true })).toHaveAttribute('href', 'mailto:contato@devspot.com.br');
  await expect(page.getByText('O Casa Mia ainda não foi lançado.', { exact: false })).toHaveCount(0);
});
