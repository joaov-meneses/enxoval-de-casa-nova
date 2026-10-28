import test from 'node:test';
import assert from 'node:assert/strict';
import { appRoutePath, appRouteTemplate, checkoutReturnPath, isAppPath, parseAppRoute } from '../src/appRoute.ts';

test('URL decide a tela do app', () => {
  assert.deepEqual(parseAppRoute('/app'), { view: 'list', categoryId: '' });
  assert.deepEqual(parseAppRoute('/app/'), { view: 'list', categoryId: '' });
  assert.deepEqual(parseAppRoute('/app/meu-lar'), { view: 'overview', categoryId: '' });
  assert.deepEqual(parseAppRoute('/app/plano'), { view: 'plan', categoryId: '' });
  assert.deepEqual(parseAppRoute('/app/itens/quarto%201'), { view: 'list', categoryId: 'quarto 1' });
  assert.deepEqual(parseAppRoute('/app/itens'), { view: 'list', categoryId: '' });
  assert.deepEqual(parseAppRoute('/app/itens/%E0'), { view: 'list', categoryId: '' });
  assert.deepEqual(parseAppRoute('/app/plano/extra'), { view: 'list', categoryId: '' });
  assert.equal(parseAppRoute('/login'), null);
  assert.equal(parseAppRoute('/application'), null);
  assert.equal(isAppPath('/app/plano'), true);
});

test('workspace and room IDs round-trip; analytics only receives route templates', () => {
  for (const route of [
    { enxovalId: 'home-a', view: 'list', categoryId: '' },
    { enxovalId: 'home-b', view: 'plan', categoryId: '' },
    { enxovalId: 'home-a', view: 'overview', categoryId: '' },
    { enxovalId: 'casa nova', view: 'list', categoryId: 'quarto 1' },
  ]) {
    assert.deepEqual(parseAppRoute(appRoutePath(route)), route);
  }
  assert.equal(appRouteTemplate('/app/private-home/plano'), '/app/:enxoval/plano');
  assert.equal(appRouteTemplate('/app/private-home/itens/private-room'), '/app/:enxoval/itens/:ambiente');
  assert.equal(appRouteTemplate('/app/private-home'), '/app/:enxoval');
  assert.deepEqual(parseAppRoute('/app/home/itens/%2Fprivate'), { enxovalId: 'home', view: 'list', categoryId: '' });
  assert.deepEqual(parseAppRoute('/app/home/plano/extra'), { enxovalId: 'home', view: 'list', categoryId: '' });
});

test('checkout returns only to recognized local routes', () => {
  for (const path of ['/app', '/app/plano', '/app/home', '/app/home/meu-lar', '/app/home/itens/room']) {
    assert.equal(checkoutReturnPath(path), path);
  }
  for (const path of [null, {}, 'https://evil.test/app', '//evil.test/app', '/application', '/app/../admin',
    '/app/home/plano/extra', '/app/home?next=evil', '/app/home#token', '/app/%2f%2fevil',
    '/app/home\\evil', '/app/home\r\nHeader: bad', '/app/' + 'a'.repeat(2048)]) {
    assert.equal(checkoutReturnPath(path), '/app');
  }
});

test('tela vira URL e modelo de rota sem identificador', () => {
  assert.equal(appRoutePath({ view: 'list', categoryId: '' }), '/app');
  assert.equal(appRoutePath({ view: 'list', categoryId: 'quarto 1' }), '/app/itens/quarto%201');
  assert.equal(appRoutePath({ view: 'overview', categoryId: 'ignorado' }), '/app/meu-lar');
  assert.equal(appRoutePath({ view: 'plan', categoryId: '' }), '/app/plano');
  assert.equal(appRouteTemplate('/app/itens/abc'), '/app/itens/:ambiente');
  assert.equal(appRouteTemplate('/convite'), null);
});
