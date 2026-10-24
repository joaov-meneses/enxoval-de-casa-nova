import assert from 'node:assert/strict';
import test from 'node:test';
import { ninoState } from '../src/nino.ts';

const item = (id, status, categoryId = 'kitchen') => ({ id, status, categoryId });
const event = { itemId: 'pan', name: 'Panela', categoryId: 'kitchen' };
test('ambiente vazio e item pendente não representam 100%', () => {
  assert.equal(ninoState([], 'kitchen'), 'thinking');
  assert.equal(ninoState([item('pan', 'researching')], 'kitchen'), 'thinking');
});
test('todas as formas de conquista contam para o descanso, somente no ambiente aberto', () => {
  const items = [item('pan', 'bought'), item('cups', 'received'), item('plate', 'owned'), item('bed', 'researching', 'bedroom')];
  assert.equal(ninoState(items, 'kitchen'), 'resting');
  assert.equal(ninoState(items, 'bedroom'), 'thinking');
});
test('a conquista comemora antes do descanso; desfazer, excluir e trocar de ambiente não comemoram', () => {
  assert.equal(ninoState([item('pan', 'bought')], 'kitchen', event), 'celebrating');
  assert.equal(ninoState([item('pan', 'bought')], 'kitchen', null), 'resting');
  assert.equal(ninoState([item('pan', 'researching')], 'kitchen', event), 'thinking');
  assert.equal(ninoState([], 'kitchen', event), 'thinking');
  assert.equal(ninoState([item('bed', 'researching', 'bedroom')], 'bedroom', event), 'thinking');
  assert.equal(ninoState([item('pan', 'bought')], 'kitchen', event, true), 'thinking');
});
