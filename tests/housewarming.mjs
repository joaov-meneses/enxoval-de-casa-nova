import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { parseHousewarmingPix, housewarmingPixPayload } from '../server/housewarmingPix.ts';
import { parseHousewarmingSettings } from '../server/housewarming.ts';
import { appRoutePath, parseAppRoute, appRouteTemplate } from '../shared/appRoute.ts';
import { safeRoute } from '../src/analytics/events.ts';
import { isPrivatePath, renderPageHtml } from '../server/seo.ts';

test('Pix static payload matches the BCB reference CRC, including 6304', () => {
  const payload = housewarmingPixPayload({ key: '123e4567-e12b-12d1-a456-426655440000', keyType: 'random', receiverName: 'Fulano de Tal', city: 'BRASILIA' });
  assert.equal(payload, '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');
});
test('Pix validates each key type and normalizes receiver fields without truncation', () => {
  const base = { receiverName: 'Ana do Chá', city: 'São Paulo' };
  assert.deepEqual(parseHousewarmingPix({ ...base, keyType: 'phone', key: '+55 (11) 99999-8888' }), { receiverName: 'ANA DO CHA', city: 'SAO PAULO', keyType: 'phone', key: '+5511999998888' });
  assert.equal(parseHousewarmingPix({ ...base, keyType: 'email', key: 'ANA@example.com' }).key, 'ana@example.com');
  assert.equal(parseHousewarmingPix({ ...base, keyType: 'cpf', key: '529.982.247-25' }).key, '52998224725');
  for (const [keyType, key] of [['cpf', '111.111.111-11'], ['cpf', '52998224726'], ['phone', '11999998888'], ['random', 'wrong'], ['email', 'not-an-email'], ['other', '123']]) {
    assert.throws(() => parseHousewarmingPix({ ...base, keyType, key }), { status: 400 });
  }
  assert.throws(() => parseHousewarmingPix({ ...base, keyType: 'email', key: 'a@example.com', receiverName: 'a'.repeat(26) }), { status: 400 });
  assert.equal(parseHousewarmingPix(null), null);
});
test('publishing requires explicit item selection or Pix and validates calendar dates and slug', () => {
  const settings = { slug: 'meu-cha', title: 'Nosso lar', message: '', eventDate: null, isPublic: false, itemIds: [], pix: null };
  assert.deepEqual(parseHousewarmingSettings(settings), settings);
  assert.throws(() => parseHousewarmingSettings({ ...settings, isPublic: true }), { status: 400 });
  const itemId = randomUUID();
  assert.equal(parseHousewarmingSettings({ ...settings, isPublic: true, itemIds: [itemId], eventDate: '2028-02-29' }).eventDate, '2028-02-29');
  for (const patch of [{ slug: '../admin' }, { slug: 'lar da ana' }, { eventDate: '2027-02-29' }, { eventDate: '2026-04-31' }, { itemIds: [itemId, itemId] }, { itemIds: ['wrong'] }, { pix: {} }, { isPublic: 'true' }]) {
    assert.throws(() => parseHousewarmingSettings({ ...settings, ...patch }), { status: 400 });
  }
});
test('housewarming navigation is stable and guest slugs stay out of analytics and search indexes', () => {
  const route = { enxovalId: 'home-id', view: 'housewarming', categoryId: '' };
  assert.equal(appRoutePath(route), '/app/home-id/cha');
  assert.deepEqual(parseAppRoute('/app/home-id/cha'), route);
  assert.deepEqual(parseAppRoute('/app/cha'), { view: 'housewarming', categoryId: '' });
  assert.equal(appRouteTemplate('/app/home-id/cha'), '/app/:enxoval/cha');
  assert.equal(safeRoute('/cha/lar-da-ana'), '/cha/:slug');
  assert.equal(isPrivatePath('/cha/lar-da-ana'), true);
  assert.match(renderPageHtml('<html><head></head></html>', '/cha/lar-da-ana', null), /noindex, nofollow/);
});
