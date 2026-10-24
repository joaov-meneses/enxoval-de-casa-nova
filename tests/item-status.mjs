import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_ITEM_STATUS, ITEM_STATUSES, ITEM_STATUS_META, activeItems, doneItems,
  isItemStatus, normalizeItemStatus, pendingItems, statusFromChecked,
  sumBought, sumPending, sumReceived,
} from '../src/itemStatus.ts';
import { parseImportRows } from '../src/utils/importItems.ts';

test('only the four supported situations are selectable and new items start in research', () => {
  assert.deepEqual(ITEM_STATUSES, ['researching', 'bought', 'received', 'owned']);
  assert.deepEqual(ITEM_STATUSES.map(value => ITEM_STATUS_META[value].label), ['Pesquisando', 'Comprado', 'Recebido', 'Já tenho']);
  assert.equal(DEFAULT_ITEM_STATUS, 'researching');
  for (const removed of ['needed', 'not_needed', 'discarded']) assert.equal(isItemStatus(removed), false);
});

test('legacy inactive items return to research even if their old checked marker was inconsistent', () => {
  for (const status of ['needed', 'not_needed', 'discarded']) {
    assert.equal(normalizeItemStatus({ status, checked: false }), 'researching');
  }
  for (const status of ['not_needed', 'discarded']) {
    assert.equal(normalizeItemStatus({ status, checked: true }), 'researching');
  }
  assert.equal(normalizeItemStatus({ status: 'needed', checked: true }), 'bought');
  assert.equal(normalizeItemStatus({ checked: true }), 'bought');
  for (const status of ITEM_STATUSES) assert.equal(normalizeItemStatus({ status }), status);
});

test('unchecking every completed situation returns to research; checking preserves its original source', () => {
  for (const status of ['bought', 'received', 'owned']) {
    assert.equal(statusFromChecked(false, status), 'researching');
    assert.equal(statusFromChecked(true, status), status);
  }
  assert.equal(statusFromChecked(true, 'researching'), 'bought');
});

test('all items count toward progress while purchased, received and pending values stay separate', () => {
  const items = [
    { status: 'researching', priceCents: 10000, discountCents: 1000 },
    { status: 'bought', priceCents: 20000, discountCents: 2000 },
    { status: 'received', priceCents: 5000 },
    { status: 'owned', priceCents: 30000 },
  ];
  assert.equal(activeItems(items).length, 4);
  assert.equal(doneItems(items).length, 3);
  assert.equal(pendingItems(items).length, 1);
  assert.equal(sumBought(items), 18000);
  assert.equal(sumReceived(items), 5000);
  assert.equal(sumPending(items), 9000);
});

test('imports accept the new labels and normalize old spreadsheets without dropping rows', () => {
  const labels = ['Pesquisando', 'Comprado', 'Recebido', 'Já tenho', 'Preciso comprar', 'Não preciso', 'Descartei', 'Comprei', 'Ganhei'];
  const parsed = parseImportRows([
    ['Item', 'Ambiente', 'Situação'],
    ...labels.map((label, index) => [`Item ${index}`, 'Quarto', label]),
  ]);
  assert.equal(parsed.rows.length, labels.length);
  assert.deepEqual(parsed.rows.map(row => row.status), ['researching', 'bought', 'received', 'owned', 'researching', 'researching', 'researching', 'bought', 'received']);
});
