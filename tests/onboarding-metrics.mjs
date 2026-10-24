// Respostas do funil que vão ao PostHog: só categorias, faixas e marcações; nada de nome, data exata ou texto livre.
// Rodar: npm run test:analytics
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedProperties, ONBOARDING_METRIC_KEYS } from '../src/analytics/events.ts';
import { generatePlan, emptyAnswers } from '../src/onboarding/plan.ts';
import { onboardingMetrics, weeksToMoveBucket } from '../src/onboarding/metrics.ts';

const answers = {
  ...emptyAnswers,
  name: 'Jeoston Araújo',
  moment: 'casal',
  moveDate: '2027-01-12',
  moveDateAnswered: true,
  state: 'BA',
  city: 'salvador',
  housing: 'kitnet',
  people: 2,
  rooms: ['cozinha', 'banheiro'],
  owned: 'algumas',
  style: 'min',
  budget: '10-25',
  worries: ['waste', 'time'],
  usage: [],
  usageNone: true,
  usageOther: 'Só quero anotar o que ganhei da Maria',
  source: 'instagram',
};

test('o evento leva categorias e faixas, nunca nome, data ou texto livre', () => {
  const now = new Date('2026-10-23T12:00:00');
  const metrics = onboardingMetrics(answers, generatePlan(answers), now);
  assert.deepEqual(Object.keys(metrics).sort(), [...ONBOARDING_METRIC_KEYS].sort(), 'o esquema cobre todas as propriedades');
  const sent = allowedProperties('onboarding_complete', { ...metrics, name: answers.name, usageOther: answers.usageOther });
  assert.equal(sent.name, undefined);
  assert.equal(sent.usageOther, undefined);
  assert.equal(JSON.stringify(sent).includes('Maria'), false, 'o motivo digitado nunca vai');
  assert.equal(JSON.stringify(sent).includes('2027-01-12'), false, 'a data exata nunca vai');
  assert.equal(sent.housing, 'kitnet');
  assert.equal(sent.people_bucket, '2');
  assert.equal(sent.weeks_to_move_bucket, '5-12');
  assert.equal(sent.worry_waste, true);
  assert.equal(sent.worry_start, false);
  assert.equal(sent.usage_none, true);
  assert.equal(sent.usage_none_reason, true);
  assert.equal(sent.has_city, true);
  assert.equal(sent.rooms_count, 3, 'a cozinha traz os eletrodomésticos como ambiente próprio');
  assert.equal(sent.uf, 'BA');
});

test('sem ambientes, o estilo é "sem itens" e a contagem é zero', () => {
  const empty = { ...answers, rooms: [], style: null, people: 7 };
  const metrics = onboardingMetrics(empty, generatePlan(empty));
  assert.equal(metrics.no_rooms, true);
  assert.equal(metrics.rooms_count, 0);
  assert.equal(metrics.items_count, 0);
  assert.equal(metrics.style, 'none');
  assert.equal(metrics.people_bucket, '5+');
});

test('faixas de semanas até a mudança', () => {
  const now = new Date('2026-10-23T12:00:00');
  assert.equal(weeksToMoveBucket(null, now), 'sem_data');
  assert.equal(weeksToMoveBucket('2026-11-10', now), '0-4');
  assert.equal(weeksToMoveBucket('2027-03-01', now), '13-26');
  assert.equal(weeksToMoveBucket('2027-12-01', now), '27+');
});
