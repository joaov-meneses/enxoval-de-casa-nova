import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedSubscriptionStatus, clearSubscriptionStatus, loadSubscriptionStatus, rememberSubscriptionStatus, subscriptionAllowsAccess, subscriptionScope } from '../src/subscriptionStatus.ts';

const active = { accessAllowed: true, plan: 'monthly', status: 'active' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
test('deduplica consultas simultâneas e isola conta e enxoval', async () => {
  clearSubscriptionStatus();
  const scope = subscriptionScope('ana', 'home');
  const pending = deferred();
  let calls = 0;
  const first = loadSubscriptionStatus(scope, () => { calls++; return pending.promise; });
  const second = loadSubscriptionStatus(scope, () => { calls++; return pending.promise; });
  assert.equal(first, second);
  assert.equal(calls, 1);
  pending.resolve(active);
  await first;
  assert.equal(cachedSubscriptionStatus(scope), active);
  assert.equal(cachedSubscriptionStatus(subscriptionScope('ana', 'other')), null);
  assert.equal(cachedSubscriptionStatus(subscriptionScope('leo', 'home')), null);
  rememberSubscriptionStatus(scope, { ...active, accessAllowed: false });
  assert.equal(cachedSubscriptionStatus(scope).accessAllowed, false);
});
test('logout descarta respostas em trânsito, inclusive falhas de uma sessão anterior', async () => {
  for (const fail of [false, true]) {
    clearSubscriptionStatus();
    const scope = subscriptionScope('ana', 'home');
    const pending = deferred();
    const previous = loadSubscriptionStatus(scope, () => pending.promise);
    clearSubscriptionStatus();
    const fresh = { ...active, accessAllowed: false };
    await loadSubscriptionStatus(scope, async () => fresh);
    if (fail) pending.reject(new Error('resposta antiga'));
    else pending.resolve(active);
    assert.equal(await previous, null);
    assert.equal(cachedSubscriptionStatus(scope), fresh);
  }
});
test('revalidação com falha conserva o último status, mas invalidação explícita o apaga', async () => {
  clearSubscriptionStatus();
  const scope = subscriptionScope('ana', 'home');
  await loadSubscriptionStatus(scope, async () => active);
  await assert.rejects(loadSubscriptionStatus(scope, async () => { throw new Error('rede'); }));
  assert.equal(cachedSubscriptionStatus(scope), active);
  clearSubscriptionStatus(scope);
  assert.equal(cachedSubscriptionStatus(scope), null);
});
test('uma resposta guardada não ultrapassa o prazo do trial ou do Passe', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  for (const trial of [true, false]) {
    const status = { ...active, plan: trial ? 'monthly' : 'pass', status: trial ? 'trialing' : null,
      [trial ? 'trialEndsAt' : 'passExpiresAt']: '2026-10-22T12:00:01Z' };
    assert.equal(subscriptionAllowsAccess(status, now), true);
    assert.equal(subscriptionAllowsAccess(status, now + 1000), false);
  }
  assert.equal(subscriptionAllowsAccess(null, now), false);
  assert.equal(subscriptionAllowsAccess({ ...active, accessAllowed: false }, now), false);
  assert.equal(subscriptionAllowsAccess({ ...active, status: 'trialing', trialEndsAt: 'invalid' }, now), false);
  assert.equal(subscriptionAllowsAccess(active, now), true);
});
