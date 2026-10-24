import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createPosthogLogs, formatLog } from '../server/posthogLogs.ts';
import { createLogger } from '../server/logger.ts';
import { createHttpLogging, httpErrorHandler } from '../server/httpLogging.ts';
import { errorTrackingHandler } from '../server/errorTracking.ts';
import { exceptionProperties } from '../shared/errorTracking.ts';

const uuid = '9f2fe25c-426e-4c95-88b4-d42663c325ae';
const configuration = { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.invalid' };
const memoryExporter = () => {
  const records = [];
  return { records, export: (batch, callback) => { records.push(...batch); callback({ code: 0 }); }, shutdown: async () => {}, forceFlush: async () => {} };
};

test('export preserves complete logs as formatted JSON with searchable error attributes', () => {
  const log = formatLog({
    event: 'http.request.failed', level: 50, reqId: uuid, msg: 'PRIVATE_MESSAGE', userId: 'PRIVATE_USER',
    req: { method: 'POST', path: '/PRIVATE_PATH?token=PRIVATE_TOKEN', ip: 'PRIVATE_IP', userAgent: 'PRIVATE_AGENT', body: 'PRIVATE_BODY', headers: { cookie: 'PRIVATE_COOKIE' } },
    res: { statusCode: 500, headers: { authorization: 'PRIVATE_AUTH' } },
    route: '/api/items/:id', responseTime: 1450, slow: true,
    err: { type: 'TypeError', code: 'ECONNRESET', message: 'PRIVATE_EMAIL', stack: 'PRIVATE_STACK' },
    stripeEventId: 'PRIVATE_STRIPE_ID', stripeEventType: 'checkout.session.completed',
    custom: 'PRIVATE_CUSTOM', service: 'PRIVATE_SERVICE', environment: 'PRIVATE_ENV',
  });
  assert.equal(JSON.parse(log.body).msg, 'PRIVATE_MESSAGE');
  assert.equal(JSON.parse(log.body).req.headers.cookie, 'PRIVATE_COOKIE');
  assert.equal(JSON.parse(log.body).custom, 'PRIVATE_CUSTOM');
  assert.ok(log.body.includes('\n  '));
  assert.equal(log.attributes['exception.message'], 'PRIVATE_EMAIL');
  assert.equal(log.attributes['exception.stacktrace'], 'PRIVATE_STACK');
  assert.equal(log.severityText, 'error');
  assert.equal(log.severityNumber, 17);
  assert.equal(log.attributes['request.id'], uuid);
  assert.equal(log.attributes['http.route'], '/api/items/:id');
  assert.equal(log.attributes['http.response.status_code'], 500);
  assert.equal(log.attributes['duration_ms'], 1450);
  assert.equal(log.attributes['error.code'], 'ECONNRESET');
  assert.equal(JSON.parse(log.body).err.stack, 'PRIVATE_STACK');
  assert.equal(JSON.parse(formatLog({ event: 'PRIVATE_EVENT', level: 50 }).body).event, 'PRIVATE_EVENT');
  assert.equal(JSON.parse(formatLog({ level: 50, msg: 'original' }).body).msg, 'original');
  assert.equal(formatLog({ event: 'http.request.completed', level: 30 }).severityText, 'info');
  assert.equal(formatLog({ event: 'server.listening', level: 20 }).severityText, 'debug');
  const untrusted = formatLog({ event: 'http.request.failed', level: 50, reqId: 'PRIVATE_ID', route: '/PRIVATE_PATH', err: { type: 'PRIVATE_TYPE', code: 'PRIVATE_CODE' } });
  assert.equal(untrusted.attributes['error.type'], 'PRIVATE_TYPE');
});

test('disabled without project token, with personal key, in development or by explicit switch', () => {
  for (const [env, production] of [[{}, true], [{ POSTHOG_KEY: 'phx_personal' }, true], [configuration, false], [{ ...configuration, POSTHOG_LOGS: 'false' }, true]]) {
    assert.equal(createPosthogLogs(env, production), null);
  }
});

test('all events and successes are forwarded without per-minute sampling and stop after shutdown', async () => {
  const exporter = memoryExporter();
  const remote = createPosthogLogs(configuration, true, { exporter });
  try {
    remote.write('invalid JSON');
    for (let i = 0; i < 100; i++) remote.write(JSON.stringify({ event: `new.operation.${i}`, level: 30, result: i }));
    for (let i = 0; i < 20; i++) remote.write(JSON.stringify({ level: 50, msg: 'original error' }));
    await remote.flush();
    assert.equal(exporter.records.length, 120);
    assert.equal(exporter.records.filter(record => record.severityText === 'info').length, 100);
    await remote.shutdown();
    remote.write(JSON.stringify({ level: 50, msg: 'after shutdown' }));
    assert.equal(exporter.records.length, 120);
  } finally { await remote.shutdown(); }
});

test('Pino + Express export real OTLP HTTP with raw diagnostics and exception correlation', async () => {
  const received = [];
  const collector = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ path: req.url, auth: req.headers.authorization, payload: JSON.parse(body) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  collector.listen(0, '127.0.0.1');
  await once(collector, 'listening');
  const remote = createPosthogLogs({ ...configuration, POSTHOG_HOST: `http://127.0.0.1:${collector.address().port}` }, true);
  const local = [];
  const logger = createLogger({ write: line => local.push(JSON.parse(line)) }, remote);
  const captured = [];
  const app = express();
  app.use(createHttpLogging(logger));
  app.get('/api/items/:id', () => { throw new TypeError('PRIVATE_MESSAGE'); });
  app.use(errorTrackingHandler({ captureException: (...args) => captured.push(args) }));
  app.use(httpErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/items/PRIVATE_ITEM?token=PRIVATE_TOKEN`, { headers: { authorization: 'PRIVATE_AUTH', 'x-request-id': 'PRIVATE_UNTRUSTED_ID' } });
    assert.equal(response.status, 500);
    await response.text();
    logger.info({ event: 'billing.webhook.completed', stripeEventType: 'checkout.session.completed', stripeEventId: 'PRIVATE_STRIPE' }, 'PRIVATE_MESSAGE');
    await remote.flush();
    assert.ok(received.length > 0);
    assert.ok(received.every(batch => batch.path === '/i/v1/logs' && batch.auth === 'Bearer phc_test'));
    const resources = received.flatMap(batch => batch.payload.resourceLogs);
    const attrs = Object.fromEntries(resources[0].resource.attributes.map(attr => [attr.key, attr.value.stringValue]));
    assert.equal(attrs['service.name'], 'casamia');
    assert.equal(attrs['deployment.environment.name'], 'production');
    const records = resources.flatMap(resource => resource.scopeLogs.flatMap(scope => scope.logRecords));
    assert.equal(records.length, 3); // Request start, failure and successful webhook.
    const failure = records.find(record => JSON.parse(record.body.stringValue).event === 'http.request.failed');
    const attributes = Object.fromEntries(failure.attributes.map(attr => [attr.key, Object.values(attr.value)[0]]));
    const id = response.headers.get('x-request-id');
    assert.equal(attributes['request.id'], id);
    assert.equal(attributes['http.route'], '/api/items/:id');
    assert.equal(attributes['error.type'], 'TypeError');
    assert.equal(captured.length, 1);
    assert.equal(captured[0][2].request_id, id);
    assert.equal(exceptionProperties({ request_id: id }).request_id, id);
    assert.equal(exceptionProperties({ request_id: 'PRIVATE_ID' }).request_id, 'PRIVATE_ID');
    assert.equal(JSON.parse(failure.body.stringValue).err.message, 'PRIVATE_MESSAGE');
    assert.match(attributes['exception.stacktrace'], /PRIVATE_MESSAGE/);
    assert.ok(local.some(log => log.err?.message === 'PRIVATE_MESSAGE')); // Local diagnostics stay available.
  } finally {
    await remote.shutdown();
    server.closeAllConnections();
    collector.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => collector.close(resolve))]);
  }
});

test('exporter failures never interrupt local logs or propagate from flush/shutdown', async () => {
  const exporter = { export: (_records, done) => done({ code: 1, error: new Error('transport unavailable') }), forceFlush: async () => {}, shutdown: async () => {} };
  const remote = createPosthogLogs(configuration, true, { exporter });
  const local = [];
  const logger = createLogger({ write: line => local.push(JSON.parse(line)) }, remote);
  logger.error({ event: 'database.pool.error', err: Object.assign(new Error('PRIVATE_ERROR', { cause: new Error('ORIGINAL_CAUSE') }), { detail: 'ORIGINAL_DETAIL', token: 'ORIGINAL_TOKEN' }) }, 'Database failed');
  await remote.flush();
  await remote.shutdown();
  assert.equal(local.length, 1);
  assert.equal(local[0].event, 'database.pool.error');
  assert.equal(local[0].err.detail, 'ORIGINAL_DETAIL');
  assert.equal(local[0].err.token, 'ORIGINAL_TOKEN');
  assert.equal(local[0].err.cause.message, 'ORIGINAL_CAUSE');
  const broken = createLogger({ write: line => local.push(JSON.parse(line)) }, { write: () => { throw new Error('broken'); } });
  assert.doesNotThrow(() => broken.error('still local'));
  assert.equal(local.length, 2);
});
