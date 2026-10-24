import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPurchasePlan, planPurchases, weekRange } from '../src/planning/purchasePlan.ts';
import { monthOf, monthlyFlow } from '../src/planning/installments.ts';
import { priceReferenceOpportunity } from '../src/planning/priceOpportunity.ts';
import { purchaseLeadTime } from '../src/planning/scheduling.ts';

const now = new Date('2026-10-24T12:00:00');
const options = { moveDate: '2026-12-05', monthlyBudgetCents: 10000, now, tier: 'equilibrado' };
const item = (id, extra = {}) => ({ id, name: id, category: 'Quarto', status: 'researching', priceCents: 6000,
  discountCents: 0, quantity: 1, priceCategory: 1, priority: 'optional', timing: null, buyWeek: null,
  researchWeeks: 0, leadTimeWeeks: 0, updatedAt: now.toISOString(), ...extra });

test('estimativa de entrega diferencia moveis de roupa de cama e acessorios', () => {
  assert.equal(purchaseLeadTime(item('Cama de casal', { leadTimeWeeks: null })).delivery, 4);
  assert.equal(purchaseLeadTime(item('Guarda-roupa', { leadTimeWeeks: null })).delivery, 4);
  assert.equal(purchaseLeadTime(item('Jogo de cama', { leadTimeWeeks: null })).delivery, 0);
  assert.equal(purchaseLeadTime(item('Protetor de colchao', { leadTimeWeeks: null })).delivery, 0);
});

test('datas antigas respeitam o horizonte maximo da sugestao', () => {
  const plan = buildPurchasePlan([item('opcional')], { ...options, moveDate: '2020-01-01' });
  assert.ok(plan.byId.get('opcional').placement.week <= 104);
});

test('a necessidade do Nino se transforma na mesma semana do calendario; notas incertas usam regras', () => {
  const early = item('cedo', { aiUrgency: 8, aiUrgencyConfidence: .9, leadTimeWeeks: 6, researchWeeks: 2 });
  const later = item('depois', { aiUrgency: 2, aiUrgencyConfidence: .9 });
  const uncertain = item('incerto', { aiUrgency: 8, aiUrgencyConfidence: .2 });
  const placements = planPurchases([early, later, uncertain], 'equilibrado');
  assert.equal(placements.get('cedo').week, -8);
  assert.equal(placements.get('depois').week, 12);
  assert.ok(placements.get('incerto').week >= 4);
});

test('antecedencia depende de entrega e pesquisa, e nao do valor do essencial', () => {
  const cheap = item('barato', { priority: 'essential', priceCents: 1000, leadTimeWeeks: 8, researchWeeks: 2 });
  const expensive = item('caro', { priority: 'essential', priceCents: 500000, leadTimeWeeks: 0, researchWeeks: 0 });
  const p = planPurchases([cheap, expensive], 'equilibrado');
  assert.equal(p.get('barato').week, -10);
  assert.equal(p.get('caro').week, 0);
});

test('solucao temporaria adia a chegada; semana manual continua prevalecendo', () => {
  const base = item('essencial', { priority: 'essential', leadTimeWeeks: 2, hasTemporarySolution: true });
  const p = planPurchases([base, { ...base, id: 'manual', buyWeek: -3 }], 'equilibrado');
  assert.equal(p.get('essencial').week, 2);
  assert.equal(p.get('manual').week, -3);
});

test('dependencias pendentes antecedem a compra, as resolvidas nao atrasam, manuais geram explicacao', () => {
  const bed = item('cama', { buyWeek: 12 });
  const mattress = item('colchao', { dependsOnItemId: 'cama', priority: 'essential' });
  let p = planPurchases([mattress, bed], 'equilibrado');
  assert.equal(p.get('colchao').week, 12);
  p = planPurchases([mattress, { ...bed, status: 'owned' }], 'equilibrado');
  assert.equal(p.get('colchao').week, 0);
  p = planPurchases([{ ...mattress, buyWeek: -1 }, bed], 'equilibrado');
  assert.equal(p.get('colchao').week, -1);
  assert.match(p.get('colchao').reason, /compatibilidade/);
});

test('orcamento distribui opcionais por meses e respeita parcelas assumidas', () => {
  const committed = item('assumido', { status: 'bought', installments: 24, installmentCents: 6000, priceCents: 144000, purchasedAt: '2026-10-01' });
  const flexible = item('opcional', { priceCents: 6000 });
  const plan = buildPurchasePlan([committed, flexible], options);
  // No month with the committed 60 + optional 60 can fit a 100 budget; eventually after the final installment.
  assert.ok(plan.byId.get('opcional').placement.week > 40);
  assert.equal(plan.budgetConflicts.length, 0);
});

test('essenciais e escolhas manuais nao sao adiados para esconder estouro do orcamento', () => {
  const essential = item('essencial', { priority: 'essential', priceCents: 20000 });
  const manual = item('manual', { buyWeek: 0, priceCents: 10000 });
  const plan = buildPurchasePlan([essential, manual], options);
  assert.equal(plan.byId.get('essencial').placement.week, 0);
  assert.equal(plan.byId.get('manual').placement.week, 0);
  assert.equal(plan.budgetConflicts[0].excessCents, 20000);
  assert.deepEqual(new Set(plan.budgetConflicts[0].itemIds), new Set(['essencial', 'manual']));
});

test('estimativas sem preco entram no fluxo, zero e ausencia de data nao travam o calendario', () => {
  const items = [item('sem preco', { priceCents: null, priority: 'essential' })];
  const plan = buildPurchasePlan(items, options);
  assert.ok(monthlyFlow(items, plan, options.moveDate, now).months.some(m => m.forecastCents > 0));
  assert.equal(buildPurchasePlan(items, { ...options, moveDate: null }).budgetConflicts.length, 0);
  assert.equal(buildPurchasePlan(items, { ...options, monthlyBudgetCents: null }).budgetConflicts.length, 0);
});

test('opcionais muito caros terminam com conflito explicito; ciclos antigos nao travam', () => {
  const costly = item('caro', { priceCents: 20000 });
  const plan = buildPurchasePlan([costly], options);
  assert.equal(plan.budgetConflicts.length, 1);
  assert.match(plan.byId.get('caro').placement.reason, /sozinho/);
  assert.equal(planPurchases([item('a', { dependsOnItemId: 'b' }), item('b', { dependsOnItemId: 'a' })], 'equilibrado').size, 2);
});

test('oportunidade compara precos recentes e equivalentes, sem previsao de promocao', () => {
  const product = item('oferta', { priceCents: 8000, catalog: { priceRange: { p10: 7000, p50: 10000, p90: 12000, samples: 6, updatedAt: now.toISOString(), source: 'serpapi' } } });
  assert.equal(priceReferenceOpportunity(product, now).percent, 20);
  for (const change of [{ quantity: 2 }, { status: 'bought' }, { updatedAt: '2020-01-01' }, { priceCents: 9900 }]) assert.equal(priceReferenceOpportunity({ ...product, ...change }, now), null);
  assert.equal(priceReferenceOpportunity({ ...product, catalog: { priceRange: { ...product.catalog.priceRange, samples: 1 } } }, now), null);
  assert.equal(priceReferenceOpportunity({ ...product, catalog: { priceRange: { ...product.catalog.priceRange, updatedAt: '2020-01-01' } } }, now), null);
});
