// Requer: postman simulation run postman/simulations/jev.sim.yaml --port 4902
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const baseURL = process.env.JEV_SIMULATION_URL || 'http://127.0.0.1:4902/jev';
const env = { ...process.env, TYPESAFE_API_KEY: 'test-only-key', TYPESAFE_BASE_URL: baseURL, RAILWAY_ENVIRONMENT_NAME: 'simulation', JEV_TIMEOUT_MS: '1000' };
function check(overrides = {}, args = []) {
  const result = spawnSync(process.execPath, ['scripts/check-jev.mjs', ...args], { env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.ok(!result.stdout.includes('test-only-key') && !result.stdout.includes('do-not-print-provider-body'));
  assert.equal(result.stderr, '');
  return { exitCode: result.status, report: JSON.parse(result.stdout) };
}
async function mode(value) {
  const response = await fetch(`${baseURL}/test/mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: value }) });
  assert.ok(response.ok);
}
await mode('success');
assert.equal(check().report.status, 'available');
assert.equal(check().exitCode, 0);
assert.equal(check({ TYPESAFE_API_KEY: '' }).report.status, 'not_configured');
assert.equal(check({}, ['--expect-environment', 'production']).report.status, 'environment_mismatch');
assert.equal(check({}, ['--expect-environment']).exitCode, 1);
await mode('invalid');
assert.equal(check().report.status, 'invalid_response');
assert.equal(check().exitCode, 1);
await mode('unauthorized');
assert.deepEqual(check().report.httpStatus, 401);
assert.equal(check().exitCode, 1);
assert.equal(check({ TYPESAFE_BASE_URL: 'http://127.0.0.1:1' }).report.status, 'unavailable');
await mode('success');
console.log('PASS: SDK real por HTTP: disponível, sem chave, ambiente incorreto, resposta inválida, 401 sem vazamento e provedor inacessível.');
