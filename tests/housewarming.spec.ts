import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const homeId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const secondId = '33333333-3333-4333-8333-333333333333';
const reservationId = '44444444-4444-4444-8444-444444444444';
const payload = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';
const invitation = {
  slug: 'lar-da-ana-e-leo', title: 'Chá de Casa Nova da Ana e do Léo', message: 'Nosso cantinho está ganhando vida. Venha celebrar esse começo com a gente!', eventDate: '2026-12-12',
  pix: { key: '123e4567-e12b-12d1-a456-426655440000', receiverName: 'Fulano de Tal', payload },
  items: [
    { id: itemId, name: 'Jogo de pratos', category: 'Cozinha', availability: 'available' },
    { id: secondId, name: 'Jogo de toalhas', category: 'Banheiro', availability: 'reserved' },
    { id: 'third', name: 'Cafeteira', category: 'Cozinha', availability: 'gifted' },
  ],
};

async function prepare(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/ingest/**', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('cm_consent_v1', JSON.stringify({ analytics: false, marketing: false, version: 1 })));
  return errors;
}

for (const width of [375, 1440]) {
  test.describe(`Chá de Casa Nova em ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 812 : 1000 } });

    test('convidado reserva sem conta, envia recado e abre Pix local', async ({ page }, testInfo) => {
      const errors = await prepare(page);
      const data = structuredClone(invitation);
      const posts: { path: string; body: Record<string, unknown> }[] = [];
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/events')) return route.abort();
        if (path.endsWith('/reservations')) {
          posts.push({ path, body: route.request().postDataJSON() }); data.items[0].availability = 'reserved';
          return route.fulfill({ status: 201, json: { id: reservationId } });
        }
        if (path.endsWith('/messages')) {
          posts.push({ path, body: route.request().postDataJSON() }); return route.fulfill({ status: 201, json: { id: 'message' } });
        }
        if (path === '/api/public/housewarming/lar-da-ana-e-leo') return route.fulfill({ json: data });
        return route.fulfill({ json: {} });
      });
      await page.goto('/cha/lar-da-ana-e-leo');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(invitation.title);
      await expect(page.getByRole('button', { name: 'Alguém já escolheu este presente' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Este carinho já chegou' })).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('public.png'), fullPage: true });
      await page.getByRole('button', { name: 'Vou presentear com este item' }).click();
      let dialog = page.getByRole('dialog');
      await dialog.getByLabel('Seu nome').fill('Maria');
      await dialog.getByLabel('Seu e-mail').fill('maria@example.invalid');
      await dialog.getByLabel('Seu recado').fill('Um lar cheio de amor!');
      await dialog.getByRole('button', { name: 'Reservar este presente' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('Carinho reservado');
      expect(posts[0].body).toMatchObject({ name: 'Maria', email: 'maria@example.invalid', itemId, message: 'Um lar cheio de amor!' });
      expect(posts[0].body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      await page.getByRole('button', { name: 'Deixar um recado', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByLabel('Seu nome').fill('Tia Rosa');
      await dialog.getByLabel('Seu recado').fill('Que venham lindas memórias!');
      await expect(dialog.getByLabel('Seu e-mail')).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Enviar recado' }).click();
      await expect(page.getByRole('status')).toContainText('Seu recado já chegou');
      expect(posts[1].body).toMatchObject({ name: 'Tia Rosa', message: 'Que venham lindas memórias!' });
      expect(posts[1].body.email).toBeUndefined();
      await page.getByRole('button', { name: 'Presentear via Pix' }).click();
      dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('img', { name: 'QR Code Pix para presentear os moradores' })).toHaveAttribute('src', /^data:image\/png;base64,/);
      await expect(dialog.getByLabel('Código Pix copia e cola')).toHaveValue(payload);
      await expect(dialog).toContainText('não recebe o dinheiro nem confirma a transferência');
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(a11y.violations.filter(violation => ['serious','critical'].includes(violation.impact ?? ''))).toEqual([]);
      await dialog.getByRole('button', { name: 'Fechar janela' }).click();
      await expect(page.getByRole('link', { name: 'Começar grátis' })).toHaveAttribute('href', '/comecar');
      expect(errors).toEqual([]);
    });

    test('conflito de reserva mantém o formulário e página indisponível tem recuperação', async ({ page }) => {
      await prepare(page);
      let available = true;
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/events')) return route.abort();
        if (path.endsWith('/reservations')) return route.fulfill({ status: 409, json: { error: 'Este item já foi escolhido. Que tal outro presente?' } });
        if (path.startsWith('/api/public/housewarming/')) return available ? route.fulfill({ json: invitation }) : route.fulfill({ status: 404, json: { error: 'Este Chá não está disponível.' } });
        return route.fulfill({ json: {} });
      });
      await page.goto('/cha/lar-da-ana-e-leo');
      await page.getByRole('button', { name: 'Vou presentear com este item' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Seu nome').fill('Maria'); await dialog.getByLabel('Seu e-mail').fill('maria@example.invalid');
      await dialog.getByRole('button', { name: 'Reservar este presente' }).click();
      await expect(dialog.getByRole('alert')).toContainText('já foi escolhido');
      await expect(dialog.getByLabel('Seu nome')).toHaveValue('Maria');
      available = false; await page.reload();
      await expect(page.getByRole('heading', { name: 'Vamos encontrar esse convite?' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Vou presentear com este item' })).toHaveCount(0);
      available = true; await page.getByRole('button', { name: 'Tentar de novo' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(invitation.title);
    });

    test('morador publica a seleção e confirma um presente recebido', async ({ page }, testInfo) => {
      const errors = await prepare(page);
      const home = { id: homeId, name: 'Nossa casa', ownerId: 'owner', ownerName: 'Ana', role: 'owner', discountCents: 0, moveDate: null, state: 'BA', city: null, spendingTier: 'equilibrado' };
      const item = { id: itemId, name: 'Jogo de pratos', categoryId: 'kitchen', category: 'Cozinha', checked: false, status: 'researching', link: '', description: '', quantity: 1, discountCents: 0, priceCents: 10000, sortOrder: 0, buyWeek: null, priceCategory: null, priority: null, timing: null, installments: 1, offers: [], documentCount: 0, createdAt: '2026-10-24T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z' };
      let list: Record<string, unknown> | null = null;
      let itemIds: string[] = [];
      let saved: Record<string, unknown> | null = null;
      let inbox = [{ id: reservationId, kind: 'reservation', name: 'Maria', email: 'maria@example.invalid', message: '<script>carinho privado</script>', itemId, itemName: item.name, itemStatus: 'researching', cancelledAt: null, createdAt: '2026-10-24T12:00:00Z', readAt: null }];
      await page.route('**/api/**', route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (path.endsWith('/events')) return route.abort();
        if (path === '/api/bootstrap') return route.fulfill({ json: { user: { id: 'owner', name: 'Ana', email: 'ana@example.invalid', plan: 'monthly', isGuest: false, onboardingCompleted: true }, enxovais: [home], activeEnxoval: home, members: [{ id: 'owner', name: 'Ana', role: 'owner', email: 'ana@example.invalid' }], categories: [{ id: 'kitchen', name: 'Cozinha', sortOrder: 0 }], items: [item] } });
        if (path === '/api/billing/status') return route.fulfill({ json: { available: true, plan: 'monthly', status: 'active', accessAllowed: true, isOwner: true, trialUsed: true, trialNotice: null } });
        if (path.endsWith('/housewarming/notifications')) return route.fulfill({ json: { unreadCount: 1, latest: inbox[0] } });
        if (path.endsWith('/housewarming')) {
          if (request.method() === 'PUT') { const input = request.postDataJSON(); saved = input; itemIds = input.itemIds; list = { ...input, id: 'list' }; }
          return route.fulfill({ json: { list, itemIds, inbox, unreadCount: 1 } });
        }
        if (path === `/api/items/${itemId}` && request.method() === 'PATCH') {
          const patch = request.postDataJSON(); Object.assign(item, patch, { checked: patch.status !== 'researching' }); inbox = inbox.map(entry => ({ ...entry, itemStatus: patch.status }));
          return route.fulfill({ json: item });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto(`/app/${homeId}/cha`);
      await expect(page.getByRole('heading', { name: 'Chá de Casa Nova', exact: true })).toBeVisible();
      await page.getByLabel('Título do Chá').fill('Chá da Ana e do Léo');
      await page.getByLabel('Nome do link').fill('lar-da-ana-e-leo');
      await page.getByRole('group', { name: 'Itens do convite' }).getByRole('checkbox').check();
      await page.getByLabel('Deixar o convite disponível pelo link').check();
      await page.getByRole('button', { name: 'Salvar convite' }).click();
      await expect(page.locator('.housewarming-manager').getByRole('status')).toContainText('Seu Chá está publicado');
      expect(saved).toMatchObject({ slug: 'lar-da-ana-e-leo', itemIds: [itemId], isPublic: true, pix: null });
      await expect(page.getByLabel('Link para compartilhar')).toHaveValue(/\/cha\/lar-da-ana-e-leo$/);
      const inboxTab = page.getByRole('tab', { name: /Recados e reservas/ });
      if (await inboxTab.isVisible()) await inboxTab.click();
      await expect(page.locator('.housewarming-inbox blockquote')).toHaveText('<script>carinho privado</script>');
      await page.getByRole('button', { name: 'Já recebi este presente' }).click();
      await expect(page.locator('.housewarming-manager').getByRole('status')).toContainText('Presente recebido');
      expect(item.status).toBe('received');
      await expect(page.getByText('Item conquistado', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('manager.png'), fullPage: true });
      const a11y = await new AxeBuilder({ page }).include('.housewarming-manager').analyze();
      expect(a11y.violations.filter(violation => ['serious','critical'].includes(violation.impact ?? ''))).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
