// Regras puras da Fase 7: origem do cadastro, grupo de canal, motor de ciclo de vida, e-mails, proxy e conversões.
// Rodar: npm run test:lifecycle
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelGroup, sanitizeTouch } from '../shared/acquisition.ts';
import { parseSignupGrowth } from '../server/acquisition.ts';
import {
  categoryEnabled, countdownSteps, dueStep, firstValueSteps, frequencyAllows, funnelResumeSteps, inactiveSteps,
  inHoldout, lifecycleMode, withinSendingHours,
} from '../server/lifecycle/policy.ts';
import { decide } from '../server/lifecycle/engine.ts';
import { lifecycleEmail } from '../server/lifecycle/emails.ts';
import { maskEmail } from '../server/lifecycle/routes.ts';
import { ingestTarget } from '../server/ingestProxy.ts';
import { purchasePayload } from '../server/googleConversions.ts';
import { googleClientId } from '../src/analytics/google.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('primeiro toque aceita só campos conhecidos, em formato fechado', () => {
  const touch = sanitizeTouch({
    source: 'Google', medium: 'CPC', campaign: 'enxoval-casal-sp-2026q4', content: '<script>', term: 'cama box',
    referrerHost: 'www.Instagram.com', landingPath: '/convite?token=secret', gclid: 'Cj0KCQ-abc_123', fbclid: 'x',
    firstSeenAt: '2026-10-01T10:00:00Z', email: 'pessoa@example.com',
  });
  assert.deepEqual(touch, {
    source: 'google', medium: 'cpc', campaign: 'enxoval-casal-sp-2026q4', referrerHost: 'instagram.com',
    landingPath: '/convite', gclid: 'Cj0KCQ-abc_123', firstSeenAt: '2026-10-01T10:00:00.000Z',
  });
  assert.deepEqual(sanitizeTouch({ firstSeenAt: '2999-01-01T00:00:00Z', landingPath: 'javascript:alert(1)' }), {});
  assert.deepEqual(sanitizeTouch(null), {});
});

test('grupo de canal segue a regra única da seção 5.2', () => {
  assert.equal(channelGroup({ gclid: 'Cj0KCQabcdef' }), 'paid_search');
  assert.equal(channelGroup({ source: 'google', medium: 'cpc' }), 'paid_search');
  assert.equal(channelGroup({ fbclid: 'IwAR0abcdef' }), 'paid_social');
  assert.equal(channelGroup({ source: 'instagram', medium: 'paid-social' }), 'paid_social');
  assert.equal(channelGroup({ source: 'newsletter' }), 'email');
  assert.equal(channelGroup({ medium: 'email' }), 'email');
  assert.equal(channelGroup({ referrerHost: 'google.com.br' }), 'organic_search');
  assert.equal(channelGroup({ referrerHost: 'duckduckgo.com' }), 'organic_search');
  assert.equal(channelGroup({ referrerHost: 'l.instagram.com' }), 'organic_social');
  assert.equal(channelGroup({ medium: 'organic-social', source: 'tiktok' }), 'organic_social');
  assert.equal(channelGroup({ source: 'parceiro-loja' }), 'referral');
  assert.equal(channelGroup({ referrerHost: 'blog.example.com' }), 'referral');
  assert.equal(channelGroup({}), 'direct');
});

test('cadastro descarta identificadores de anúncio sem consentimento de anúncios', () => {
  const body = { emailMarketing: true, acquisition: { adConsent: false, gaClientId: '123.456', touch: { source: 'google', gclid: 'Cj0KCQabcdef' } } };
  const denied = parseSignupGrowth(body);
  assert.equal(denied.touch.gclid, undefined);
  assert.equal(denied.gaClientId, null);
  assert.equal(denied.channel, 'referral');
  assert.equal(denied.emailMarketing, true);
  const granted = parseSignupGrowth({ acquisition: { ...body.acquisition, adConsent: true } });
  assert.equal(granted.touch.gclid, 'Cj0KCQabcdef');
  assert.equal(granted.gaClientId, '123.456');
  assert.equal(granted.channel, 'paid_search');
  assert.equal(granted.emailMarketing, false, 'e-mail de marketing só com a caixa marcada');
  assert.equal(parseSignupGrowth({ acquisition: { adConsent: true, gaClientId: 'GA1.1.evil' } }).gaClientId, null);
});

test('client_id do GA4 vem do cookie _ga', () => {
  assert.equal(googleClientId('a=1; _ga=GA1.1.1234567890.1700000000; b=2'), '1234567890.1700000000');
  assert.equal(googleClientId('_ga_ABC=GS1.1.x'), null);
});

test('passo devido: o mais recente dentro da janela, nunca repetido nem em atraso', () => {
  const created = new Date('2026-10-01T12:00:00Z');
  const steps = funnelResumeSteps(created);
  const at = offset => created.getTime() + offset;
  assert.equal(dueStep(steps, at(HOUR), new Set(), 2 * DAY), null);
  assert.equal(dueStep(steps, at(3 * HOUR), new Set(), 2 * DAY).key, '2h');
  assert.equal(dueStep(steps, at(3 * HOUR), new Set(['2h']), 2 * DAY), null);
  assert.equal(dueStep(steps, at(30 * HOUR), new Set(['2h']), 2 * DAY).key, '1d');
  assert.equal(dueStep(steps, at(30 * HOUR), new Set(), 2 * DAY).key, '1d', 'passo antigo é pulado');
  assert.equal(dueStep(steps, at(10 * DAY), new Set(), 2 * DAY), null, 'último passo vencido há muito não sai');
  assert.deepEqual(firstValueSteps(created).map(step => step.key), ['1d', '3d', '7d']);
});

test('contagem regressiva e ausência recomeçam quando a data muda', () => {
  assert.deepEqual(countdownSteps('2027-01-20').map(step => step.key),
    ['w12:2027-01-20', 'w8:2027-01-20', 'w4:2027-01-20', 'w1:2027-01-20', 'w0:2027-01-20', 'after1:2027-01-20']);
  assert.deepEqual(countdownSteps('20/01/2027'), []);
  assert.equal(inactiveSteps(new Date('2026-09-01T10:00:00Z'))[0].key, 'd21:2026-09-01');
});

test('limites: horário, frequência, preferências, grupo de controle e modo', () => {
  assert.equal(withinSendingHours(new Date('2026-10-22T13:00:00Z'), 'America/Sao_Paulo'), true); // 10h
  assert.equal(withinSendingHours(new Date('2026-10-22T02:00:00Z'), 'America/Sao_Paulo'), false); // 23h
  assert.equal(withinSendingHours(new Date('2026-10-22T13:00:00Z'), 'Fuso/Invalido'), true);
  const now = Date.parse('2026-10-22T13:00:00Z');
  assert.equal(frequencyAllows([], now), true);
  assert.equal(frequencyAllows([new Date(now - 2 * HOUR)], now), false, 'no máximo 1 por dia');
  assert.equal(frequencyAllows([new Date(now - 2 * DAY), new Date(now - 4 * DAY)], now), false, 'no máximo 2 por semana');
  assert.equal(frequencyAllows([new Date(now - 2 * DAY), new Date(now - 9 * DAY)], now), true);
  assert.equal(categoryEnabled({ tips: false }, 'tips'), false);
  assert.equal(categoryEnabled({}, 'reminders'), true);
  const users = Array.from({ length: 2000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const share = users.filter(id => inHoldout(id, 'countdown')).length / users.length;
  assert.ok(share > 0.07 && share < 0.13, `grupo de controle perto de 10% (${share})`);
  assert.equal(inHoldout(users[0], 'countdown'), inHoldout(users[0], 'countdown'), 'sempre a mesma pessoa');
  assert.equal(lifecycleMode({}), 'off');
  assert.equal(lifecycleMode({ LIFECYCLE_MODE: 'SEND' }), 'send');
  assert.equal(lifecycleMode({ LIFECYCLE_MODE: 'qualquer' }), 'off');
});

test('decisão: prioridade entre fluxos, simulação não bloqueia o envio real', () => {
  const now = new Date('2026-10-22T13:00:00Z');
  const row = {
    id: users0(), email: 'a@example.com', name: 'Ana', timezone: 'America/Sao_Paulo', created_at: new Date(now - 40 * DAY),
    marketing_preferences: {}, preferences_token: null, last_activity_at: new Date(now - 22 * DAY),
    enxoval_id: '11111111-1111-4111-8111-111111111111', enxoval_created_at: new Date(now - 30 * DAY),
    move_date: new Date(now.getTime() + 55 * DAY).toISOString().slice(0, 10), has_value: false, total_count: 10, done_count: 2,
  };
  const decision = decide(row, [], now, 'send');
  assert.equal(decision.flow, 'countdown', 'L3 vence L6');
  assert.match(decision.step.key, /^w8:/);
  const simulated = [{ user_id: row.id, flow_key: 'countdown', step: decision.step.key, status: 'simulated', sent_at: null }];
  assert.equal(decide(row, simulated, now, 'send').step.key, decision.step.key);
  assert.equal(decide(row, simulated, now, 'simulate').flow, 'inactive', 'em simulação o passo simulado conta como feito');
  assert.equal(decide({ ...row, marketing_preferences: { reminders: false } }, [], now, 'send').flow, 'inactive');
  assert.equal(decide(row, [], new Date('2026-10-22T02:00:00Z'), 'send'), null, 'fora do horário');
  const recent = [{ user_id: row.id, flow_key: 'inactive', step: 'x', status: 'sent', sent_at: new Date(now - HOUR) }];
  assert.equal(decide(row, recent, now, 'send'), null, 'limite diário');
  const noEnxoval = { ...row, enxoval_id: null, enxoval_created_at: null, move_date: null, created_at: new Date(now - 3 * HOUR) };
  assert.equal(decide(noEnxoval, [], now, 'send').flow, 'funnel_resume');
});

function users0() { return '00000000-0000-4000-8000-000000000001'; }

test('e-mail de ciclo de vida: descadastro com um clique, preferências e campanha medida', () => {
  const mail = lifecycleEmail({
    to: 'ana@example.com', name: 'Ana Souza', flow: 'countdown', step: 'w8', baseUrl: 'https://casamia.app',
    preferencesToken: 'tok_abcdefghijklmnopqrstuv', pendingCount: 8, topItems: ['Geladeira', '<b>Sofá</b>'],
  });
  assert.equal(mail.subject, 'Faltam 8 semanas: hora dos itens que demoram a chegar');
  assert.equal(mail.headers['List-Unsubscribe'], '<https://casamia.app/api/preferences/unsubscribe?token=tok_abcdefghijklmnopqrstuv>');
  assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(mail.html, /utm_medium=email/);
  assert.match(mail.html, /\/app\/plano\?/);
  assert.match(mail.html, /preferencias\?token=tok_abcdefghijklmnopqrstuv&amp;acao=cancelar/);
  assert.equal(mail.html.includes('<b>Sofá</b>'), false, 'nome de item escapado');
  assert.match(mail.text, /Ainda faltam 8 itens/);
  assert.match(mail.text, /^Ana,/);
});

test('proxy do PostHog só aponta para o PostHog', () => {
  assert.equal(ingestTarget('/e/?compression=gzip-js', {}).toString(), 'https://us.i.posthog.com/e/?compression=gzip-js');
  assert.equal(ingestTarget('/static/array.js', {}).toString(), 'https://us-assets.i.posthog.com/static/array.js');
  assert.equal(ingestTarget('//evil.example/x', {}).host, 'us.i.posthog.com');
  assert.equal(ingestTarget('/decide/', { POSTHOG_PROXY_HOST: 'https://eu.i.posthog.com' }).host, 'eu.i.posthog.com');
  assert.equal(ingestTarget('/static/x.js', { POSTHOG_PROXY_HOST: 'https://eu.i.posthog.com' }).host, 'eu-assets.i.posthog.com');
});

test('conversão de compra leva valor e moeda, sem dado pessoal', () => {
  const payload = purchasePayload({ clientId: '123.456', transactionId: 'cs_test_1', amountCents: 19990, currency: 'brl', plan: 'pass' });
  assert.equal(payload.client_id, '123.456');
  assert.deepEqual(payload.events[0].params, {
    transaction_id: 'cs_test_1', value: 199.9, currency: 'BRL', items: [{ item_id: 'pass', item_name: 'pass', quantity: 1 }],
  });
  assert.equal(maskEmail('pessoa@example.com'), 'p*****@example.com');
});
