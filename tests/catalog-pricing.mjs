import assert from 'node:assert/strict';
import test from 'node:test';
import { parseShoppingOffers } from '../server/services/serpapi.ts';
import { pricingWindows, marketSchedule } from '../server/workers/catalogMarketWorker.ts';
import { priceMinCustomers } from '../server/catalog/pricing.ts';

test('accepts only full positive BRL offers for new products with an identified source', () => {
  const offer = { title: 'Geladeira 400 litros', source: 'Loja A', extracted_price: 2499.9, price: 'R$ 2.499,90', product_link: 'https://loja.example.invalid/produto' };
  assert.equal(parseShoppingOffers({ shopping_results: [offer] })[0].priceCents, 249990);
  for (const patch of [
    { price: '10x R$ 249,99' }, { price: 'R$ 249,99/mês' }, { price: '$2499.90' },
    { extracted_price: -1 }, { extracted_price: Infinity }, { extracted_price: '2499.9' },
    { second_hand_condition: 'used' }, { title: 'Geladeira usada' }, { source: '' },
    { product_link: 'javascript:alert(1)' }, { product_link: 'https://user:pass@loja.example.invalid' },
  ]) assert.deepEqual(parseShoppingOffers({ shopping_results: [{ ...offer, ...patch }] }), [], JSON.stringify(patch));
  assert.deepEqual(parseShoppingOffers({ error: 'unavailable' }), []);
});

test('weekly/monthly windows use São Paulo time at midnight and month boundaries', () => {
  assert.deepEqual(pricingWindows(new Date('2026-08-03T02:30:00Z')), { week: '2026-07-27', month: '2026-08-01' });
  assert.deepEqual(pricingWindows(new Date('2026-08-03T03:00:00Z')), { week: '2026-08-03', month: '2026-08-01' });
  assert.deepEqual(pricingWindows(new Date('2026-11-01T02:30:00Z')), { week: '2026-10-26', month: '2026-10-01' });
});

test('customer minimum defaults to two and cannot be configured below two', () => {
  const original = process.env.CATALOG_PRICE_MIN_CUSTOMERS;
  try {
    for (const value of ['', '1', '-1', 'NaN']) { process.env.CATALOG_PRICE_MIN_CUSTOMERS = value; assert.equal(priceMinCustomers(), 2); }
    process.env.CATALOG_PRICE_MIN_CUSTOMERS = '3'; assert.equal(priceMinCustomers(), 3);
  } finally { if (original === undefined) delete process.env.CATALOG_PRICE_MIN_CUSTOMERS; else process.env.CATALOG_PRICE_MIN_CUSTOMERS = original; }
});

test('weekly research waits for Monday 06:00 in São Paulo and advances by calendar week', () => {
  const beforeSlot = marketSchedule(new Date('2026-10-26T08:59:59Z'));
  assert.equal(beforeSlot.catchUp, false);
  assert.equal(beforeSlot.next.toISOString(), '2026-10-26T09:00:00.000Z');
  const onTime = marketSchedule(new Date('2026-10-26T09:00:00Z'));
  assert.equal(onTime.catchUp, true);
  assert.equal(onTime.due.toISOString(), '2026-10-26T09:00:00.000Z');
  assert.equal(onTime.next.toISOString(), '2026-11-02T09:00:00.000Z');
});

test('startup after the slot recovers only the current pending batch, including a year boundary', () => {
  const sunday = marketSchedule(new Date('2026-10-25T18:00:00Z'));
  assert.equal(sunday.catchUp, true);
  assert.equal(sunday.due.toISOString(), '2026-10-19T09:00:00.000Z');
  assert.equal(sunday.next.toISOString(), '2026-10-26T09:00:00.000Z');
  const restart = marketSchedule(new Date('2026-10-28T15:00:00Z'));
  assert.equal(restart.catchUp, true);
  assert.equal(restart.due.toISOString(), '2026-10-26T09:00:00.000Z');
  assert.equal(restart.next.toISOString(), '2026-11-02T09:00:00.000Z');
  const yearEnd = marketSchedule(new Date('2026-12-31T12:00:00Z'));
  assert.equal(yearEnd.next.toISOString(), '2027-01-04T09:00:00.000Z');
});
