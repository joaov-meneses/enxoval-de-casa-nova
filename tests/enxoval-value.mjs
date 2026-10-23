// Fase 11 (mais valor na lista "Meu enxoval"): funções puras de parcelas e fluxo mensal, atalhos da lista,
// documentos (tipo pelo conteúdo, ZIP, URL assinada) e fila offline do modo loja. Sem banco nem navegador.
//   npm run test:enxoval-value
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { PassThrough } from 'node:stream';
import {
  addMonths,
  installmentBadge,
  installmentPlan,
  isIsoDate,
  monthlyFlow,
  formatMonth,
} from '../src/planning/installments.ts';
import { buildPurchasePlan } from '../src/planning/purchasePlan.ts';
import { computeListInsights, dealIds, matchesAssignee, matchesQuickFilter, needsThanks, warrantyDaysLeft } from '../src/listInsights.ts';
import { cheapestOffer, hasCheaperOtherOffer } from '../src/priceTracking.ts';
import { applyPending } from '../src/storeOffline.ts';
import { appRoutePath, appRouteTemplate, parseAppRoute } from '../shared/appRoute.ts';
import { cleanFileName, sniffDocumentType } from '../server/itemDocuments.ts';
import { crc32, uniqueZipName, ZipWriter } from '../server/zip.ts';
import { presignedDownloadUrl, storageDriver } from '../server/objectStorage.ts';
import { todayInBrazil } from '../server/itemExtras.ts';

let seq = 0;
const item = (extra = {}) => ({
  id: `i${++seq}`,
  name: `Item ${seq}`,
  categoryId: 'c1',
  category: 'Cozinha',
  checked: false,
  status: 'researching',
  link: '',
  description: '',
  priceCents: null,
  quantity: 1,
  discountCents: 0,
  sortOrder: seq,
  buyWeek: null,
  priceCategory: null,
  priority: null,
  timing: null,
  updatedAt: '2026-10-01T12:00:00Z',
  ...extra,
});

test('datas: dia válido, soma de meses sem pular mês e rótulo do mês', () => {
  assert.equal(isIsoDate('2027-02-28'), true);
  assert.equal(isIsoDate('2027-02-31'), false);
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-11-15', 14), '2028-01-15');
  assert.equal(formatMonth('2027-03'), 'mar/2027');
});

test('parcelas: divisão sem perder centavos, juros e selo da linha', () => {
  const split = installmentPlan(item({ status: 'bought', priceCents: 100_00, installments: 3, purchasedAt: '2026-10-10' }));
  assert.deepEqual(split.amounts, [33_34, 33_33, 33_33]);
  assert.equal(split.totalCents, 100_00);
  assert.equal(split.interestCents, 0);
  assert.equal(split.firstMonth, '2026-10');

  const withInterest = installmentPlan(item({ status: 'bought', priceCents: 1_000_00, installments: 10, installmentCents: 110_00, firstInstallmentOn: '2026-12-01' }));
  assert.equal(withInterest.totalCents, 1_100_00);
  assert.equal(withInterest.interestCents, 100_00);
  assert.equal(withInterest.firstMonth, '2026-12');

  // O desconto sai do valor parcelado; sem preço, não há parcelas.
  assert.equal(installmentPlan(item({ status: 'bought', priceCents: 100_00, discountCents: 10_00, installments: 2 })).totalCents, 90_00);
  assert.equal(installmentPlan(item({ priceCents: null, installments: 3 })), null);
  assert.equal(installmentBadge(item({ status: 'bought', priceCents: 1_890_00, installments: 10 })).replace(/\s/gu, ' '), '10x R$ 189');
  assert.equal(installmentBadge(item({ status: 'bought', priceCents: 100_00, installments: 1 })), null);
});

test('fluxo mensal: parcelas que atravessam o ano, previsão pela semana e teto', () => {
  const now = new Date(2026, 10, 15); // 15/11/2026
  const items = [
    item({ status: 'bought', priceCents: 1_200_00, installments: 12, purchasedAt: '2026-10-05' }), // out/26 a set/27
    item({ status: 'bought', priceCents: 300_00, installments: 1, purchasedAt: '2026-11-02' }),
    item({ status: 'researching', priceCents: 600_00, installments: 3, buyWeek: 2 }),
    item({ status: 'researching', priceCents: 50_00 }),
    item({ status: 'received', priceCents: 999_00 }),
  ];
  const plan = buildPurchasePlan(items, { tier: 'equilibrado', moveDate: '2026-12-01' });
  const flow = monthlyFlow(items, plan, '2026-12-01', now);
  // Outubro já passou: o fluxo começa no mês atual.
  assert.equal(flow.months[0].month, '2026-11');
  assert.equal(flow.months[0].committedCents, 100_00 + 300_00);
  assert.equal(flow.months.find((month) => month.month === '2027-09').committedCents, 100_00);
  assert.equal(flow.lastInstallmentMonth, '2027-09');
  assert.equal(flow.committedNext3Cents, 400_00 + 100_00 + 100_00);
  const forecast = flow.months.reduce((sum, month) => sum + month.forecastCents, 0);
  assert.equal(forecast, 650_00);
  assert.equal(flow.unscheduledCount, 0);

  // Sem a data da mudança, os pendentes ficam fora da previsão (e são contados).
  const noDate = monthlyFlow(items, buildPurchasePlan(items, { tier: 'equilibrado', moveDate: null }), null, now);
  assert.equal(noDate.unscheduledCount, 2);
  assert.equal(noDate.months.reduce((sum, month) => sum + month.forecastCents, 0), 0);
});

test('atalhos: meus itens, agradecimentos, garantias e lojas mais baratas', () => {
  const now = new Date(2026, 10, 15);
  const mine = item({ assigneeId: 'u1' });
  const theirs = item({ assigneeId: 'u2' });
  const nobody = item();
  const gift = item({ status: 'received', giftFrom: 'Tia Rosa', checked: true });
  const thanked = item({ status: 'received', thankedAt: '2026-11-01T10:00:00Z', checked: true });
  const warranty = item({ status: 'bought', warrantyUntil: '2026-12-01', checked: true });
  const expired = item({ status: 'bought', warrantyUntil: '2026-11-01', checked: true });
  const offers = item({
    priceCents: 500_00,
    priceTracking: { domain: 'a.com', url: 'https://a.com/p', initialPriceCents: 500_00, targetPriceCents: null, priceAlertEnabled: true, priceBasis: 'regular', currentPriceCents: 500_00, lowestPriceCents60d: 500_00, isLowestIn60d: false, inStock: true, lastCheckedAt: null, status: 'ok' },
    offers: [
      { id: 'o1', url: 'https://a.com/p', domain: 'a.com', isPrimary: true, currentPriceCents: 500_00, pixPriceCents: null, inStock: true, lastCheckedAt: null, status: 'ok' },
      { id: 'o2', url: 'https://b.com/p', domain: 'b.com', isPrimary: false, currentPriceCents: 450_00, pixPriceCents: null, inStock: true, lastCheckedAt: null, status: 'ok' },
      { id: 'o3', url: 'https://c.com/p', domain: 'c.com', isPrimary: false, currentPriceCents: 400_00, pixPriceCents: null, inStock: false, lastCheckedAt: null, status: 'ok' },
    ],
  });
  const all = [mine, theirs, nobody, gift, thanked, warranty, expired, offers];

  assert.equal(matchesAssignee(mine, 'mine', 'u1'), true);
  assert.equal(matchesAssignee(theirs, 'mine', 'u1'), false);
  assert.equal(matchesAssignee(nobody, 'unassigned', 'u1'), true);
  assert.equal(matchesAssignee(theirs, 'u2', 'u1'), true);
  assert.equal(needsThanks(gift), true);
  assert.equal(needsThanks(thanked), false);
  assert.equal(warrantyDaysLeft(warranty, now), 16);
  assert.equal(matchesQuickFilter(warranty, 'warranty', 'u1', now), true);
  assert.equal(matchesQuickFilter(expired, 'warranty', 'u1', now), false);

  const insights = computeListInsights(all, new Set(), false, { userId: 'u1', shared: true, now });
  assert.equal(insights.mineCount, 1);
  assert.equal(insights.thanksCount, 1);
  assert.equal(insights.warrantyCount, 1);
  assert.equal(computeListInsights(all, new Set(), false, { userId: 'u1', shared: false, now }).mineCount, null);

  // A loja mais barata em estoque (a de R$ 400 está indisponível) e o atalho "baixou de preço" por outra loja.
  assert.equal(cheapestOffer(offers).id, 'o2');
  assert.equal(hasCheaperOtherOffer(offers), true);
  assert.equal(dealIds(all).has(offers.id), true);
});

test('modo loja: rota com e sem ambiente, modelo sem identificador e fila aplicada na tela', () => {
  assert.deepEqual(parseAppRoute('/app/e1/loja'), { view: 'store', categoryId: '', enxovalId: 'e1' });
  assert.deepEqual(parseAppRoute('/app/e1/loja/c9'), { view: 'store', categoryId: 'c9', enxovalId: 'e1' });
  assert.equal(appRoutePath({ view: 'store', categoryId: 'c9', enxovalId: 'e1' }), '/app/e1/loja/c9');
  assert.equal(appRouteTemplate('/app/e1/loja/c9'), '/app/:enxoval/loja/:ambiente');
  const base = [item({ id: 'x1' }), item({ id: 'x2' })];
  const shown = applyPending(base, [
    { enxovalId: 'e1', itemId: 'x1', updates: { status: 'bought', checked: true, priceCents: 90_00 }, queuedAt: 1 },
    { enxovalId: 'e1', itemId: 'x1', updates: { installments: 3 }, queuedAt: 2 },
  ]);
  assert.equal(shown[0].status, 'bought');
  assert.equal(shown[0].checked, true);
  assert.equal(shown[0].priceCents, 90_00);
  assert.equal(shown[0].installments, 3);
  assert.equal(shown[1], base[1]);
});

test('documentos: tipo pelo conteúdo e nome limpo com a extensão real', () => {
  assert.equal(sniffDocumentType(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj')), 'application/pdf');
  assert.equal(sniffDocumentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(sniffDocumentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'image/png');
  assert.equal(sniffDocumentType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'image/webp');
  assert.equal(sniffDocumentType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(4)])), 'image/heic');
  assert.equal(sniffDocumentType(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.equal(sniffDocumentType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(cleanFileName('C:\\fotos\\nota<geladeira>.exe', 'application/pdf', 'invoice'), 'notageladeira.pdf');
  assert.equal(cleanFileName('', 'image/jpeg', 'warranty'), 'Garantia.jpg');
});

test('ZIP: arquivos sem compressão legíveis, CRC correto e nomes únicos', async () => {
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => out.on('end', resolve));
  const zip = new ZipWriter(out);
  const taken = new Set();
  const first = uniqueZipName(taken, 'Cozinha/Geladeira - Nota fiscal - nota.pdf');
  const second = uniqueZipName(taken, 'Cozinha/Geladeira - Nota fiscal - nota.pdf');
  assert.equal(second, 'Cozinha/Geladeira - Nota fiscal - nota (2).pdf');
  await zip.add(first, Buffer.from('%PDF-um'));
  await zip.add(second, Buffer.from('%PDF-dois'));
  await zip.finish();
  await done;
  const data = Buffer.concat(chunks);
  assert.equal(data.readUInt32LE(0), 0x04034b50);
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.equal(data.readUInt16LE(end + 10), 2);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  // Sem compressão: o conteúdo aparece como está, logo depois do cabeçalho e do nome.
  const nameLength = data.readUInt16LE(26);
  assert.equal(data.subarray(30 + nameLength, 30 + nameLength + 7).toString(), '%PDF-um');
  assert.ok(inflateRawSync);
});

test('armazenamento: bucket só com configuração completa e URL assinada por 5 minutos', () => {
  assert.equal(storageDriver({}), 'database');
  assert.throws(() => storageDriver({ DOCUMENT_STORAGE: 's3', S3_BUCKET: 'b' }), /S3_ENDPOINT/);
  const env = { DOCUMENT_STORAGE: 's3', S3_ENDPOINT: 'https://conta.r2.cloudflarestorage.com', S3_BUCKET: 'casamia-docs', S3_ACCESS_KEY_ID: 'AKID', S3_SECRET_ACCESS_KEY: 'segredo', S3_REGION: 'auto' };
  assert.equal(storageDriver(env), 's3');
  const url = new URL(presignedDownloadUrl('s3:documentos/e1/d1', 'nota fiscal.pdf', new Date('2026-11-15T12:00:00Z'), env));
  assert.equal(url.pathname, '/casamia-docs/documentos/e1/d1');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  assert.equal(url.searchParams.get('X-Amz-Date'), '20261115T120000Z');
  assert.equal(url.searchParams.get('X-Amz-Credential'), 'AKID/20261115/auto/s3/aws4_request');
  assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
  assert.match(url.searchParams.get('response-content-disposition'), /nota%20fiscal\.pdf/);
  // Assinatura determinística: mesma entrada, mesma URL; documento no banco não tem URL assinada.
  assert.equal(presignedDownloadUrl('s3:documentos/e1/d1', 'nota fiscal.pdf', new Date('2026-11-15T12:00:00Z'), env), url.toString());
  assert.equal(presignedDownloadUrl('db:d1', 'x.pdf', new Date(), env), null);
});

test('data da compra no fuso de Brasília', () => {
  assert.equal(todayInBrazil(new Date('2026-11-16T02:30:00Z')), '2026-11-15');
  assert.equal(todayInBrazil(new Date('2026-11-16T03:30:00Z')), '2026-11-16');
});
