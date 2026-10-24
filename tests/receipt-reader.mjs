import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptFixture } from './fixtures/receipt-image.mjs';
import { parseReceiptText, readReceiptImage, receiptDailyLimit } from '../server/services/receiptReader.ts';

test('le somente total rotulado e data valida, sem confundir parcela, tributos ou troco', () => {
  const result = parseReceiptText('CASA TESTE LTDA\nCNPJ 00.000.000/0001-00\nEMISSAO 23/10/2026\nVALOR TOTAL R$ 1.234,56\nTRIBUTOS 120,00\nTROCO 10,00', 91, new Date('2026-10-24T12:00:00Z'));
  assert.equal(result.storeName, 'CASA TESTE LTDA');
  assert.equal(result.purchasedAt, '2026-10-23');
  assert.equal(result.totalCents, 123456);
  assert.equal(result.confidence, .91);
  assert.equal(parseReceiptText('PARCELA 10,00\nTOTAL TRIBUTOS 8,00\nTROCO 2,00', 90).totalCents, null);
  assert.equal(parseReceiptText('Data 31/02/2026', 90).purchasedAt, null);
  assert.equal(parseReceiptText('EMISSAO 23/10/2099', 90).purchasedAt, null);
});

test('limite de leitura e controlado e leitura de nota sem dados nao inventa campos', () => {
  assert.equal(receiptDailyLimit({}), 20);
  assert.equal(receiptDailyLimit({ RECEIPT_READ_DAILY_LIMIT: '999' }), 200);
  assert.equal(receiptDailyLimit({ RECEIPT_READ_DAILY_LIMIT: '-1' }), 20);
  const empty = parseReceiptText('', 0);
  assert.equal(empty.storeName, null);
  assert.equal(empty.totalCents, null);
  assert.equal(empty.purchasedAt, null);
});

test('OCR real com modelo portugues local, sem API externa', { timeout: 60000 }, async () => {
  const result = await readReceiptImage(await receiptFixture());
  assert.equal(result.storeName, 'CASA TESTE LTDA');
  assert.equal(result.totalCents, 12345);
  assert.equal(result.purchasedAt, '2026-10-23');
  assert.equal(result.multipleItems, true);
  assert.equal(result.method, 'local_ocr');
});
