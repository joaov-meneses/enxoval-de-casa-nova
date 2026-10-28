// Planejamento de compras: algoritmo de semanas, faixas por perfil de gasto, verificador por período
// e catálogo regional. São funções puras, então não precisam de banco nem de navegador.
//   npm run test:purchase-plan
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPurchasePlan,
  formatWeekRange,
  itemMeta,
  matchCatalog,
  periodOfWeek,
  planPurchases,
  currentWeek,
  tierTotals,
} from '../src/planning/purchasePlan.ts';
import { normalizeItemStatus } from '../src/itemStatus.ts';
import { bandFor, suggestSpendingTier } from '../src/planning/spending.ts';
import { emptyAnswers, generatePlan, toPayload } from '../src/onboarding/plan.ts';
import { citiesOfState, cityMatchesState } from '../src/onboarding/regions.ts';

let seq = 0;
const item = (name, category, extra = {}) => ({
  id: `i${++seq}`,
  name,
  category,
  status: 'researching',
  priceCents: null,
  discountCents: 0,
  ...extra,
});

const answers = (extra = {}) => ({
  ...emptyAnswers,
  name: 'Ana',
  moment: 'casal',
  moveDateAnswered: true,
  state: 'SP',
  housing: 'apartamento',
  people: 2,
  rooms: ['cozinha', 'banheiro', 'sala', 'quarto', 'servico', 'externa', 'escritorio'],
  owned: 'nada',
  style: 'full',
  budget: 'unknown',
  ...extra,
});

const namesOf = (plan) => plan.categories.flatMap((category) => category.items.map((entry) => entry.name));

test('o catálogo é reconhecido sem depender de acento, caixa nem da cama', () => {
  assert.equal(matchCatalog('GELADEIRA')?.tier, 4);
  assert.equal(matchCatalog('jogo de cama de casal')?.name, 'Jogo de cama {cama}');
  assert.equal(matchCatalog('Item inventado pela pessoa'), undefined);
});

test('semana sugerida: prazo de entrega, primeira noite e opcionais depois da mudança', () => {
  const geladeira = item('Geladeira', 'Eletrodomésticos');
  const toalhas = item('Toalhas de banho', 'Banheiro');
  const sofa = item('Sofá', 'Sala de Estar');
  const quadros = item('Quadros e decoração', 'Sala de Estar');
  const placements = planPurchases([geladeira, toalhas, sofa, quadros], 'equilibrado');

  assert.equal(placements.get(geladeira.id).week, -5, 'compra grande e essencial vem antes');
  assert.equal(placements.get(toalhas.id).week, -1, 'primeira noite: semana anterior');
  assert.equal(placements.get(sofa.id).week, -5);
  assert.ok(placements.get(quadros.id).week >= 4, 'opcional só depois que a casa assentou');
  assert.ok(placements.get(quadros.id).reason.length > 0);
});

test('a semana escolhida pela pessoa vale mais que a sugestão', () => {
  const geladeira = item('Geladeira', 'Eletrodomésticos', { buyWeek: 3 });
  const placement = planPurchases([geladeira], 'equilibrado').get(geladeira.id);
  assert.equal(placement.week, 3);
  assert.equal(placement.source, 'manual');
});

test('itens com situações removidas voltam a receber uma semana de compra', () => {
  for (const status of ['needed', 'not_needed', 'discarded']) {
    const migrated = item('Geladeira', 'Eletrodomésticos', { status: normalizeItemStatus({ status, checked: false }) });
    assert.equal(planPurchases([migrated], 'equilibrado').has(migrated.id), true);
  }
});

test('os opcionais são distribuídos em vez de caírem todos na mesma semana', () => {
  const plan = generatePlan(answers());
  const items = plan.categories.flatMap((category) =>
    category.items.map((entry) => item(entry.name, category.name, {
      priceCategory: entry.tier,
      priority: entry.essential ? 'essential' : 'optional',
      timing: entry.firstNight ? 'first_night' : entry.soon ? 'first_week' : null,
    })));
  const placements = planPurchases(items, 'equilibrado');

  const optionalWeeks = items
    .filter((entry) => entry.priority === 'optional' && entry.timing === null)
    .map((entry) => placements.get(entry.id).week);
  assert.ok(optionalWeeks.length > 20);
  const perWeek = new Map();
  for (const week of optionalWeeks) perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  assert.ok(new Set(optionalWeeks).size >= 8, 'ocupa várias semanas');
  assert.ok(Math.max(...perWeek.values()) <= optionalWeeks.length / 4, 'nenhuma semana concentra o gasto');
  assert.ok(Math.min(...optionalWeeks) >= 4);
});

test('comprar ou informar preço não remaneja as outras semanas', () => {
  const plan = generatePlan(answers());
  const build = () => plan.categories.flatMap((category) =>
    category.items.map((entry, index) => item(`${entry.name}`, category.name, {
      id: `${category.key}-${index}`,
      priceCategory: entry.tier,
      priority: entry.essential ? 'essential' : 'optional',
    })));
  const before = planPurchases(build(), 'equilibrado');
  const changed = build();
  changed[5] = { ...changed[5], status: 'bought', priceCents: 99_900 };
  const after = planPurchases(changed, 'equilibrado');
  for (const [id, placement] of before) assert.equal(after.get(id).week, placement.week, id);
});

test('períodos: primeira semana, primeiro mês, meses 2 e 3, 4 a 6', () => {
  assert.equal(periodOfWeek(-8).id, 'before');
  assert.equal(periodOfWeek(-1).id, 'before');
  assert.equal(periodOfWeek(0).id, 'week1');
  assert.equal(periodOfWeek(1).id, 'month1');
  assert.equal(periodOfWeek(3).id, 'month1');
  assert.equal(periodOfWeek(4).id, 'month3');
  assert.equal(periodOfWeek(11).id, 'month3');
  assert.equal(periodOfWeek(12).id, 'month6');
  assert.equal(periodOfWeek(25).id, 'month6');
  assert.equal(periodOfWeek(26).id, 'later');
  assert.equal(periodOfWeek(80).id, 'later');
});

test('verificador: abaixo, dentro e acima da faixa do perfil', () => {
  // Geladeira é categoria 4: no perfil equilibrado a faixa é R$ 1.200 a R$ 2.200.
  assert.deepEqual(bandFor('equilibrado', 4), { minCents: 120_000, maxCents: 220_000 });
  const verdictFor = (priceCents, tier = 'equilibrado') => {
    const geladeira = item('Geladeira', 'Eletrodomésticos', { priceCents });
    const plan = buildPurchasePlan([geladeira], { tier });
    return plan.periods.find((period) => period.entries.length)?.verdict;
  };
  assert.equal(verdictFor(null), 'no_prices');
  assert.equal(verdictFor(90_000), 'below');
  assert.equal(verdictFor(150_000), 'within');
  assert.equal(verdictFor(300_000), 'above');
  // O mesmo preço muda de leitura conforme o perfil: R$ 1.500 é folgado no econômico e baixo no confortável.
  assert.equal(verdictFor(150_000, 'economico'), 'above');
  assert.equal(verdictFor(150_000, 'confortavel'), 'below');
});

test('verificador: itens sem preço não fazem o período parecer barato', () => {
  const itens = [
    item('Geladeira', 'Eletrodomésticos', { priceCents: 150_000 }),
    item('Fogão ou cooktop', 'Eletrodomésticos'),
  ];
  const period = buildPurchasePlan(itens, { tier: 'equilibrado' }).periods.find((p) => p.entries.length);
  assert.equal(period.verdict, 'within');
  assert.equal(period.unpricedCount, 1);
});

test('faixa alcançada, concluído e itens que não custam dinheiro', () => {
  const itens = [
    item('Geladeira', 'Eletrodomésticos', { status: 'bought', priceCents: 150_000 }),
    item('Fogão ou cooktop', 'Eletrodomésticos', { status: 'owned' }),
    item('Micro-ondas', 'Eletrodomésticos', { status: 'received', priceCents: 40_000 }),
  ];
  const plan = buildPurchasePlan(itens, { tier: 'equilibrado' });
  const period = plan.periods.find((p) => p.entries.length);
  assert.equal(period.completed, true);
  assert.equal(period.spentCents, 150_000);
  // Só a geladeira custa dinheiro: a faixa do período é a dela.
  assert.deepEqual(period.band, { minCents: 120_000, maxCents: 220_000 });
  assert.equal(period.reached, true);
});

test('atrasado e período atual dependem da data da mudança', () => {
  const geladeira = item('Geladeira', 'Eletrodomésticos');
  const now = new Date(2026, 9, 14); // 14/10/2026
  // Mudança em 10/11/2026: a semana -8 já passou, a geladeira está atrasada.
  const plan = buildPurchasePlan([geladeira], { tier: 'equilibrado', moveDate: '2026-11-10', now });
  assert.equal(plan.byId.get(geladeira.id).overdue, true);
  assert.equal(plan.totals.overdueCount, 1);
  assert.equal(currentWeek('2026-11-10', now), -4);
  assert.equal(plan.periods.find((p) => p.current).period.id, 'before');
  assert.equal(formatWeekRange('2026-11-10', 0).startsWith('10 a '), true);
});

test('total do enxoval em cada perfil cresce do econômico ao premium', () => {
  const itens = [item('Geladeira', 'Eletrodomésticos'), item('Sofá', 'Sala de Estar'), item('Cabides', 'Quarto')];
  const totals = tierTotals(itens);
  assert.ok(totals.economico.maxCents < totals.equilibrado.maxCents);
  assert.ok(totals.equilibrado.maxCents < totals.confortavel.maxCents);
  assert.ok(totals.confortavel.maxCents < totals.premium.maxCents);
});

test('perfil sugerido pelo orçamento do funil', () => {
  assert.equal(suggestSpendingTier([2, 2, 3], null), 'equilibrado');
  assert.equal(suggestSpendingTier([4, 4, 4, 4], 100_000), 'economico', 'nem o mínimo cabe: o mais econômico');
  assert.equal(suggestSpendingTier([4, 4], 10_000_000), 'premium');
  // Cabe o máximo do equilibrado (2 x R$ 2.200), mas não o do confortável (2 x R$ 3.800).
  assert.equal(suggestSpendingTier([4, 4], 500_000), 'equilibrado');
});

test('metadados do item: gravado vale mais que o catálogo, e o catálogo mais que o preço', () => {
  assert.equal(itemMeta(item('Geladeira', 'x')).priority, 'essential');
  assert.equal(itemMeta(item('Geladeira', 'x', { priority: 'optional' })).priority, 'optional');
  assert.equal(itemMeta(item('Peça rara', 'x', { priceCents: 300_000 })).priceCategory, 4);
  assert.equal(itemMeta(item('Peça rara', 'x')).priceCategory, 2);
});

test('catálogo regional: a cidade acrescenta itens ao que o estado já pede', () => {
  const salvador = namesOf(generatePlan(answers({ state: 'BA', city: 'salvador' })));
  const saoPaulo = namesOf(generatePlan(answers({ state: 'SP', city: 'sao-paulo' })));
  const belo = namesOf(generatePlan(answers({ state: 'MG', city: 'belo-horizonte' })));
  const semCidade = namesOf(generatePlan(answers({ state: 'BA', city: null })));

  // Salvador: umidade e maresia, panela de barro (moqueca) e tapioqueira.
  assert.ok(salvador.includes('Sachês antimofo para o guarda-roupa'));
  assert.ok(salvador.includes('Desumidificador de ar'));
  assert.ok(salvador.includes('Spray anticorrosão para fechaduras e dobradiças'));
  assert.ok(salvador.includes('Panela de barro'));
  assert.ok(salvador.includes('Tapioqueira'));
  assert.ok(!salvador.includes('Umidificador de ar'), 'umidificador é para clima seco');

  // São Paulo: estação seca pede umidificador; nada de antimofo nem panela de barro.
  assert.ok(saoPaulo.includes('Umidificador de ar'));
  assert.ok(!saoPaulo.includes('Sachês antimofo para o guarda-roupa'));
  assert.ok(!saoPaulo.includes('Panela de barro'));

  // Belo Horizonte: tradição mineira na cozinha e estação seca.
  assert.ok(belo.includes('Panela de pedra-sabão'));
  assert.ok(belo.includes('Panela de ferro'));
  assert.ok(belo.includes('Umidificador de ar'));
  assert.ok(!belo.includes('Panela de barro'));

  // Sem cidade, vale só o estado: o que depende de característica da cidade fica de fora.
  assert.ok(semCidade.includes('Panela de barro'), 'a tradição vale para o estado inteiro');
  assert.ok(!semCidade.includes('Sachês antimofo para o guarda-roupa'));
});

test('uma cidade que não pertence ao estado é ignorada', () => {
  const certa = namesOf(generatePlan(answers({ state: 'SP', city: 'sao-paulo' })));
  const errada = namesOf(generatePlan(answers({ state: 'SP', city: 'salvador' })));
  assert.ok(certa.includes('Umidificador de ar'));
  assert.ok(!errada.includes('Sachês antimofo para o guarda-roupa'));
  assert.ok(!errada.includes('Umidificador de ar'));
  assert.equal(cityMatchesState('salvador', 'BA'), true);
  assert.equal(cityMatchesState('salvador', 'SP'), false);
  const baianas = citiesOfState('BA').map((city) => city.name);
  assert.equal(baianas[0], 'Salvador', 'a capital vem primeiro');
  assert.ok(baianas.includes('Feira de Santana'));
  assert.ok(citiesOfState('BA').every((city) => city.uf === 'BA'));
});

test('a nota regional vai na descrição e o plano carrega os dados do planejamento', () => {
  const plan = generatePlan(answers({ state: 'BA', city: 'salvador' }));
  const antimofo = plan.categories
    .flatMap((category) => category.items)
    .find((entry) => entry.name === 'Sachês antimofo para o guarda-roupa');
  assert.match(antimofo.description, /Umidade alta aqui/);
  assert.equal(antimofo.soon, true);

  const payload = toPayload(plan);
  const sent = payload.categories.flatMap((category) => category.items);
  assert.ok(sent.every((entry) => [1, 2, 3, 4].includes(entry.priceCategory)));
  assert.ok(sent.every((entry) => ['essential', 'optional'].includes(entry.priority)));
  assert.ok(sent.some((entry) => entry.timing === 'first_night'));
  assert.ok(sent.every((entry) => entry.description.length <= 200));
  assert.ok(['economico', 'equilibrado', 'confortavel', 'premium'].includes(plan.stats.spendingTier));
});

test('a estimativa do funil não mudou com as novas faixas', () => {
  // O perfil equilibrado é a base: R$ 25 a R$ 50 para a categoria 1, e assim por diante.
  assert.deepEqual(bandFor('equilibrado', 1), { minCents: 2_500, maxCents: 5_000 });
  assert.deepEqual(bandFor('equilibrado', 3), { minCents: 25_000, maxCents: 50_000 });
});
