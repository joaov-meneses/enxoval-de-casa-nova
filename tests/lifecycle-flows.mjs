// Regras puras do restante da Fase 7: fluxos L4, L7, L8 e L9, retorno do provedor, SEO, receita recorrente,
// painel de efeito, campanhas e monitoramento das rotinas. Rodar: npm run test:lifecycle
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  inviteStalledSteps, milestoneSteps, overdueSteps, postMoveSteps, reachedMilestones,
} from '../server/lifecycle/policy.ts';
import { decide } from '../server/lifecycle/engine.ts';
import { lifecycleEmail } from '../server/lifecycle/emails.ts';
import { isPermanentBounce, verifyWebhookSignature } from '../server/lifecycle/tracking.ts';
import { isPrivatePath, renderPageHtml, robotsTxt, sitemapXml } from '../server/seo.ts';
import { incrementalLift, netPromoterScore } from '../server/lifecycle/report.ts';
import { parseCampaign } from '../server/lifecycle/campaigns.ts';
import { purchasePayload } from '../server/googleConversions.ts';
import { isStale } from '../server/jobMonitor.ts';
import { appVersion } from '../server/version.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const USER = '00000000-0000-4000-8000-000000000001';

test('L4 atrasos: um resumo por semana, só com atraso', () => {
  const thursday = Date.parse('2026-10-22T13:00:00Z');
  assert.deepEqual(overdueSteps(0, thursday), []);
  assert.equal(overdueSteps(3, thursday)[0].key, 'wk:2026-10-19', 'a chave é a segunda-feira da semana');
  assert.equal(overdueSteps(1, Date.parse('2026-10-25T20:00:00Z'))[0].key, 'wk:2026-10-19', 'domingo ainda é a mesma semana');
  assert.equal(overdueSteps(1, Date.parse('2026-10-26T01:00:00Z'))[0].key, 'wk:2026-10-26');
});

test('L7 marcos: metade, ambiente completo e 80% do enxoval; o maior vence no empate', () => {
  const at = '2026-10-20T12:00:00Z';
  const milestones = reachedMilestones([
    { id: 'quarto', name: 'Quarto', total: 4, done: 4, last_done_at: at },
    { id: 'banho', name: 'Banheiro', total: 6, done: 3, last_done_at: '2026-10-19T12:00:00Z' },
    { id: 'mini', name: 'Varanda', total: 1, done: 1, last_done_at: at },
    { id: 'sala', name: 'Sala', total: 4, done: 1, last_done_at: at },
  ]);
  assert.deepEqual(milestones.map(m => `${m.kind}:${m.ref}`), ['room100:quarto', 'room50:banho'],
    'ambiente de um item não conta; 9 de 15 não chega a 80%');
  const all = reachedMilestones([
    { id: 'a', name: 'A', total: 5, done: 5, last_done_at: at },
    { id: 'b', name: 'B', total: 5, done: 3, last_done_at: at },
  ]);
  assert.equal(milestoneSteps(all).at(-1).key, 'overall80:all');
});

test('L8 convite parado e L9 pós-mudança', () => {
  const steps = inviteStalledSteps([
    { id: 'i2', email: 'b@x.com', created_at: '2026-10-10T00:00:00Z' },
    { id: 'i1', email: 'a@x.com', created_at: '2026-10-08T00:00:00Z' },
  ]);
  assert.deepEqual(steps.map(step => step.key), ['inv:i1', 'inv:i2']);
  assert.equal(steps[0].at, Date.parse('2026-10-11T00:00:00Z'), '3 dias depois do convite');
  assert.equal(postMoveSteps('2026-09-01')[0].key, 'd30:2026-09-01');
  assert.deepEqual(postMoveSteps('ontem'), []);
});

test('decisão: L3 > L2 > L1 > L4 > L8 > L9 > L7 > L6, e todo envio conta no limite', () => {
  const now = new Date('2026-10-22T13:00:00Z');
  const base = {
    id: USER, email: 'a@example.com', name: 'Ana', timezone: 'America/Sao_Paulo', created_at: new Date(now - 90 * DAY),
    marketing_preferences: {}, preferences_token: null, last_activity_at: new Date(now - 22 * DAY),
    enxoval_id: '11111111-1111-4111-8111-111111111111', enxoval_created_at: new Date(now - 80 * DAY),
    move_date: null, has_value: true, total_count: 10, done_count: 9,
  };
  const overdue = { ...base, overdue_count: 2, invites: [{ id: 'inv1', email: 'b@x.com', created_at: new Date(now - 3 * DAY - HOUR) }] };
  assert.equal(decide(overdue, [], now, 'send').flow, 'overdue', 'atraso vence convite e ausência');
  assert.equal(decide({ ...overdue, overdue_count: 0 }, [], now, 'send').flow, 'invite_stalled');
  const moved = { ...base, move_date: new Date(now - 31 * DAY).toISOString().slice(0, 10) };
  assert.equal(decide(moved, [], now, 'send').flow, 'post_move');
  const room = { id: 'q', name: 'Quarto', total: 3, done: 3, last_done_at: new Date(now - DAY) };
  assert.equal(decide({ ...base, rooms: [room] }, [], now, 'send').flow, 'milestone');
  assert.equal(decide({ ...base, rooms: [{ ...room, last_done_at: new Date(now - 5 * DAY) }] }, [], now, 'send').flow,
    'inactive', 'marco antigo não vira e-mail');
  assert.equal(decide({ ...overdue, marketing_preferences: { reminders: false } }, [], now, 'send').flow, 'inactive',
    'atraso e convite são lembretes: respeitam a preferência');
  const alerted = [{ user_id: USER, flow_key: 'price_drop', step: 'x', status: 'sent', sent_at: new Date(now - HOUR) }];
  assert.equal(decide(overdue, alerted, now, 'send'), null, 'alerta de preço conta no limite diário');
});

test('e-mails dos novos fluxos: atrasos, marco, convite, pesquisa e campanha', () => {
  const common = {
    to: 'ana@example.com', name: 'Ana', baseUrl: 'https://casamia.app', preferencesToken: 'tok_abcdefghijklmnopqrstuv',
    messageId: '22222222-2222-4222-8222-222222222222',
  };
  const overdue = lifecycleEmail({ ...common, flow: 'overdue', step: 'wk', overdueCount: 2, overdueItems: ['Geladeira', 'Sofá'] });
  assert.equal(overdue.subject, '2 itens passaram da semana de compra');
  assert.match(overdue.text, /Atrasados:\n- Geladeira\n- Sofá/);
  assert.match(overdue.html, /lm=22222222-2222-4222-8222-222222222222/, 'o link mede a volta ao app');
  assert.match(overdue.html, /utm_campaign=lifecycle-overdue/);
  const milestone = lifecycleEmail({ ...common, flow: 'milestone', step: 'room100', milestone: { kind: 'room100', label: 'Quarto' } });
  assert.equal(milestone.subject, 'Quarto completo!');
  const invite = lifecycleEmail({ ...common, flow: 'invite_stalled', step: 'inv', inviteEmail: 'bia@example.com' });
  assert.match(invite.text, /convite para bia@example\.com ainda não foi aceito/);
  assert.match(invite.html, /utm_campaign=lifecycle-invite-stalled/);
  const survey = lifecycleEmail({ ...common, flow: 'post_move', step: 'd30' });
  assert.equal((survey.html.match(/\/pesquisa\?/g) ?? []).length, 11, 'um botão por nota, de 0 a 10');
  assert.match(survey.html, /nota=10/);
  assert.match(survey.text, /\/pesquisa\?.*token=tok_/);
  const campaign = lifecycleEmail({
    ...common, flow: 'campaign', step: 'abc',
    custom: { subject: 'Novidade', body: 'Linha 1\n\n<b>Linha 2</b>', cta: 'Ver', path: '/app/plano' },
  });
  assert.equal(campaign.subject, 'Novidade');
  assert.match(campaign.html, /line-height:1\.6">Linha 1<\/p>\n<p [^>]*>&lt;b&gt;Linha 2/, 'um parágrafo por bloco');
  assert.equal(campaign.html.includes('<b>Linha 2</b>'), false, 'texto da campanha escapado');
  assert.match(campaign.headers['List-Unsubscribe'], /unsubscribe\?token=/);
});

test('webhook do Resend: assinatura Svix, janela de tempo e rejeição definitiva', () => {
  const raw = 'segredo-de-teste-123';
  const secret = `whsec_${Buffer.from(raw).toString('base64')}`;
  const body = '{"type":"email.delivered"}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = (id, ts, payload) => createHmac('sha256', Buffer.from(raw)).update(`${id}.${ts}.${payload}`).digest('base64');
  const signature = `v1,${sign('msg_1', timestamp, body)}`;
  assert.equal(verifyWebhookSignature(secret, { id: 'msg_1', timestamp, signature }, body), true);
  assert.equal(verifyWebhookSignature(secret, { id: 'msg_1', timestamp, signature: `v1,errada ${signature}` }, body), true,
    'aceita qualquer assinatura válida da lista (troca de segredo)');
  assert.equal(verifyWebhookSignature(secret, { id: 'msg_1', timestamp, signature }, `${body} `), false, 'corpo alterado');
  assert.equal(verifyWebhookSignature(secret, { id: 'msg_2', timestamp, signature }, body), false, 'outro id');
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  assert.equal(verifyWebhookSignature(secret, { id: 'msg_1', timestamp: old, signature: `v1,${sign('msg_1', old, body)}` }, body), false,
    'fora da janela de 5 minutos');
  assert.equal(verifyWebhookSignature('', { id: 'msg_1', timestamp, signature }, body), false);
  assert.equal(isPermanentBounce({ bounce: { type: 'Permanent' } }), true);
  assert.equal(isPermanentBounce({ bounce: { type: 'Transient' } }), false);
  assert.equal(isPermanentBounce({}), false);
});

test('SEO: metadados por página pública, noindex nas privadas, robots e sitemap', () => {
  const html = `<html><head><title>Casa Mia | Enxoval de casa nova</title>
    <meta
      name="description"
      content="antiga"
    />
    <meta property="og:title" content="Casa Mia" />
    <meta
      property="og:description"
      content="antiga"
    />
    <meta property="og:image" content="/images/casamia-home.webp" />
  </head><body></body></html>`;
  const home = renderPageHtml(html, '/', 'https://casamia.app');
  assert.match(home, /<link rel="canonical" href="https:\/\/casamia\.app\/" \/>/);
  assert.match(home, /application\/ld\+json/);
  assert.match(home, /content="https:\/\/casamia\.app\/images\/casamia-home\.webp"/, 'imagem do Open Graph com endereço completo');
  assert.equal((home.match(/name="description"/g) ?? []).length, 1, 'substitui, não duplica');
  const nino = renderPageHtml(html, '/como-o-nino-escolhe', 'https://casamia.app');
  assert.match(nino, /<title>Como o Nino escolhe \| Casa Mia<\/title>/);
  assert.equal(nino.includes('ld+json'), false);
  assert.match(renderPageHtml(html, '/app/plano', 'https://casamia.app'), /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.equal(renderPageHtml(html, '/', null).includes('canonical'), false, 'sem APP_URL não inventa endereço');
  assert.equal(isPrivatePath('/preferencias'), true);
  assert.equal(isPrivatePath('/comecar'), false);
  assert.equal(isPrivatePath('/appendix'), false);
  assert.match(robotsTxt('https://casamia.app'), /Disallow: \/app\n[\s\S]*Sitemap: https:\/\/casamia\.app\/sitemap\.xml/);
  assert.match(sitemapXml('https://casamia.app'), /<loc>https:\/\/casamia\.app\/como-o-nino-escolhe<\/loc>/);
  assert.equal(sitemapXml('https://casamia.app').includes('/app<'), false);
});

test('receita recorrente, painel de efeito, campanhas e rotinas', () => {
  const renewal = purchasePayload({ clientId: '1.2', transactionId: 'in_1', amountCents: 1990, currency: 'brl', plan: 'monthly', billingReason: 'subscription_cycle' });
  assert.equal(renewal.events[0].params.billing_reason, 'subscription_cycle');
  assert.equal(renewal.events[0].params.value, 19.9);
  assert.equal(incrementalLift({ sent: 100, holdout: 10, sentActive7d: 40, holdoutActive7d: 3 }), 10);
  assert.equal(incrementalLift({ sent: 100, holdout: 0, sentActive7d: 40, holdoutActive7d: 0 }), null);
  assert.equal(netPromoterScore([10, 9, 8, 6, 0]), 0);
  assert.equal(netPromoterScore([]), null);
  const draft = { name: 'Black Friday', segment: 'inactive_30', subject: 'Oi', body: 'Texto', ctaLabel: 'Ver', ctaPath: '/app/plano' };
  assert.deepEqual(parseCampaign(draft), draft);
  assert.throws(() => parseCampaign({ ...draft, ctaPath: 'https://evil.example' }), /caminho do app/);
  assert.throws(() => parseCampaign({ ...draft, ctaPath: '//evil.example' }), /caminho do app/);
  assert.throws(() => parseCampaign({ ...draft, segment: 'todos; DROP TABLE users' }), /segmento/);
  assert.throws(() => parseCampaign({ ...draft, subject: '' }), /assunto/);
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(isStale({ interval_ms: HOUR, registered_at: new Date(now - 10 * HOUR), last_succeeded_at: new Date(now - 2 * HOUR) }, now), false);
  assert.equal(isStale({ interval_ms: HOUR, registered_at: new Date(now - 10 * HOUR), last_succeeded_at: new Date(now - 3 * HOUR) }, now), true);
  assert.equal(isStale({ interval_ms: HOUR, registered_at: new Date(now - HOUR), last_succeeded_at: null }, now), false, 'acabou de subir');
  assert.equal(isStale({ interval_ms: HOUR, registered_at: new Date(now - 3 * HOUR), last_succeeded_at: null }, now), true, 'nunca concluiu');
  assert.equal(appVersion({ RAILWAY_GIT_COMMIT_SHA: 'abcdef1234567' }), 'abcdef1');
  assert.equal(appVersion({ APP_VERSION: 'v1.2.3', RAILWAY_GIT_COMMIT_SHA: 'abc' }), 'v1.2.3');
  assert.equal(appVersion({}), 'dev');
});
