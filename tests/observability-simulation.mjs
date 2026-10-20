// Start: postman simulation run postman/simulations/observability.sim.yaml --port 4900 --output ndjson
// Verify: node --import tsx tests/observability-simulation.mjs
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createLogger } from '../server/logger.ts';
import { createPosthogLogs } from '../server/posthogLogs.ts';
import { createHttpLogging, httpErrorHandler } from '../server/httpLogging.ts';

const base = process.env.OBSERVABILITY_SIMULATION_URL || 'http://127.0.0.1:4900';
await fetch(`${base}/i/test/reset`, { method: 'POST' });
const remote = createPosthogLogs({ POSTHOG_KEY: 'phc_local_test', POSTHOG_HOST: base }, true);
const logger = createLogger({ write() {} }, remote);
const app = express();
app.use(createHttpLogging(logger));
app.use(express.json());
app.post('/api/admin/diagnostic/:id', (req, res) => res.json({ saved: req.body, id: req.params.id }));
app.get('/api/diagnostic/failure', () => { throw Object.assign(new TypeError('Raw diagnostic message'), { detail: 'original detail' }); });
app.use(httpErrorHandler);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const appBase = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${appBase}/api/admin/diagnostic/real-id?filter=real-value`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'local-fixture' },
    body: JSON.stringify({ name: 'Real input fixture', password: 'raw fixture' }),
  });
  assert.equal(response.status, 200);
  await response.json();
  const failed = await fetch(`${appBase}/api/diagnostic/failure`);
  assert.equal(failed.status, 500);
  await failed.text();
  await remote.flush();
  const batches = await (await fetch(`${base}/i/test/records`)).json();
  const records = batches.flatMap(batch => batch.resourceLogs.flatMap(resource => resource.scopeLogs.flatMap(scope => scope.logRecords)));
  const logs = records.map(record => JSON.parse(record.body.stringValue));
  assert.equal(logs.length, 4);
  const success = logs.find(log => log.event === 'http.request.completed');
  assert.equal(success.req.body.password, 'raw fixture');
  assert.equal(success.req.params.id, 'real-id');
  assert.equal(success.req.query.filter, 'real-value');
  assert.equal(success.req.headers.authorization, 'local-fixture');
  assert.equal(success.res.body.saved.name, 'Real input fixture');
  assert.equal(success.reqId, response.headers.get('x-request-id'));
  const failure = logs.find(log => log.event === 'http.request.failed');
  assert.equal(failure.err.message, 'Raw diagnostic message');
  assert.equal(failure.err.detail, 'original detail');
  assert.match(failure.err.stack, /TypeError: Raw diagnostic message/);
  console.log('Passed: real Express/Pino/OTLP pipeline delivered all four complete records to the local Postman simulation.');
} finally {
  await remote.shutdown();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
