import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { createLogger, getLogger, setLogUser } from '../server/logger.ts';
import { createHttpLogging, httpErrorHandler } from '../server/httpLogging.ts';
import { asyncHandler, HttpError } from '../server/security.ts';

test('logs HTTP: cobertura, erros, correlação, privacidade, lentidão e interrupção', async () => {
  const logs = [];
  const logger = createLogger({ write: line => logs.push(JSON.parse(line)) });
  const previousSlow = process.env.LOG_SLOW_REQUEST_MS;
  process.env.LOG_SLOW_REQUEST_MS = '30';
  const app = express();
  app.use(createHttpLogging(logger));
  if (previousSlow === undefined) delete process.env.LOG_SLOW_REQUEST_MS;
  else process.env.LOG_SLOW_REQUEST_MS = previousSlow;
  // Same order as production: webhook before JSON parser.
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    assert.ok(Buffer.isBuffer(req.body));
    res.json({ received: true });
  });
  app.use(express.json({ limit: '1kb' }));
  app.post('/api/echo/:id', (req, res) => res.json({ received: req.body }));
  const router = express.Router();
  router.get('/items/:id', asyncHandler(async (req, res) => {
    setLogUser(`user-${req.params.id}`);
    await delay(req.params.id === 'one' ? 12 : 1);
    getLogger().info({ event: 'item.loaded' }, 'Item consultado.');
    res.setHeader('Set-Cookie', 'session=RESPONSE_COOKIE_SECRET');
    res.json({ password: 'RESPONSE_BODY_SECRET' });
  }));
  app.use('/api', router);
  app.get('/expected', () => { throw new HttpError(403, 'Acesso negado.', 'FORBIDDEN'); });
  app.get('/failure', asyncHandler(async () => {
    const err = new Error('Banco indisponível.', { cause: new Error('Conexão encerrada.') });
    Object.assign(err, { code: 'ECONNRESET', detail: 'PRIVATE_SQL_DETAIL', query: 'PRIVATE_SQL_QUERY', password: 'ERROR_PASSWORD_SECRET' });
    throw err;
  }));
  app.get('/direct-error', (_req, res) => res.status(429).json({ error: 'Limite atingido.' }));
  app.get('/slow', asyncHandler(async (_req, res) => { await delay(50); res.end('ok'); }));
  let abortStarted;
  const abortReady = new Promise(resolve => { abortStarted = resolve; });
  app.get('/abort', (_req, _res) => abortStarted());
  app.get('/', (_req, res) => res.type('html').send('<h1>Casa Mia</h1>'));
  app.use(httpErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, options) => {
    const response = await fetch(`${base}${path}`, options);
    const body = await response.text();
    return { response, body, id: response.headers.get('x-request-id') };
  };
  try {
    const [one, two] = await Promise.all(['one', 'two'].map(id => call(`/api/items/${id}?token=QUERY_TOKEN_SECRET&email=PRIVATE_EMAIL`, {
      headers: { authorization: 'Bearer AUTH_SECRET', cookie: 'session=COOKIE_SECRET', 'x-request-id': 'UNTRUSTED_ID' },
    })));
    assert.notEqual(one.id, two.id);
    assert.match(one.id, /^[0-9a-f-]{36}$/);
    for (const [id, result] of [['one', one], ['two', two]]) {
      const scoped = logs.filter(log => log.reqId === result.id);
      assert.equal(scoped.filter(log => log.event === 'http.request.started').length, 1);
      assert.equal(scoped.find(log => log.event === 'http.request.started').level, 30);
      const completed = scoped.find(log => log.event === 'http.request.completed');
      assert.equal(completed.route, '/api/items/:id');
      assert.equal(completed.res.statusCode, 200);
      assert.equal(completed.userId, `user-${id}`);
      assert.equal(scoped.find(log => log.event === 'item.loaded').userId, `user-${id}`);
      assert.equal(typeof completed.responseTime, 'number');
    }
    const echo = await call('/api/echo/raw-id?email=real@example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Real input', password: 'original-password' }) });
    const echoLog = logs.find(log => log.reqId === echo.id && log.res);
    assert.equal(echoLog.req.body.password, 'original-password');
    assert.equal(echoLog.req.params.id, 'raw-id');
    assert.equal(echoLog.req.query.email, 'real@example.test');
    assert.equal(echoLog.res.body.received.name, 'Real input');
    const expected = await call('/expected');
    assert.equal(expected.response.status, 403);
    assert.deepEqual(JSON.parse(expected.body), { error: 'Acesso negado.', code: 'FORBIDDEN' });
    const expectedLog = logs.find(log => log.reqId === expected.id && log.event === 'http.request.failed');
    assert.equal(expectedLog.level, 40);
    assert.equal(expectedLog.err.code, 'FORBIDDEN');
    const failure = await call('/failure');
    assert.equal(failure.response.status, 500);
    assert.equal(JSON.parse(failure.body).error, 'Erro interno do servidor.');
    const failedLog = logs.find(log => log.reqId === failure.id && log.event === 'http.request.failed');
    assert.equal(failedLog.level, 50);
    assert.match(failedLog.err.stack, /Banco indisponível/);
    assert.match(failedLog.err.cause.stack, /Conexão encerrada/);
    assert.equal(failedLog.err.code, 'ECONNRESET');
    assert.equal(failedLog.err.detail, 'PRIVATE_SQL_DETAIL');
    assert.equal(failedLog.err.query, 'PRIVATE_SQL_QUERY');
    assert.equal(failedLog.err.password, 'ERROR_PASSWORD_SECRET');
    const direct = await call('/direct-error');
    assert.equal(logs.find(log => log.reqId === direct.id && log.res).level, 40);
    const malformed = await call('/json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"MALFORMED_PASSWORD_SECRET", invalid}' });
    assert.equal(malformed.response.status, 400);
    const oversized = await call('/json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'LARGE_BODY_SECRET'.repeat(100) }) });
    assert.equal(oversized.response.status, 413);
    const webhook = await call('/api/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 'STRIPE_SIGNATURE_SECRET' }, body: '{}' });
    assert.equal(webhook.response.status, 200);
    assert.ok(logs.find(log => log.reqId === webhook.id && log.res));
    const slow = await call('/slow');
    const slowLog = logs.find(log => log.reqId === slow.id && log.res);
    assert.equal(slowLog.slow, true);
    assert.equal(slowLog.level, 40);
    const missing = await call('/missing');
    assert.equal(missing.response.status, 404);
    assert.equal(logs.find(log => log.reqId === missing.id && log.res).level, 40);
    const page = await call('/');
    assert.equal(page.response.status, 200);
    assert.equal(logs.some(log => log.reqId === page.id), false);
    const request = http.get(`${base}/abort`);
    request.on('error', () => {});
    await abortReady;
    request.destroy();
    // Let the server process the socket close event.
    for (let i = 0; i < 50 && !logs.some(log => log.event === 'http.request.aborted'); i++) await delay(10);
    assert.equal(logs.find(log => log.event === 'http.request.aborted').level, 40);
    const completed = logs.find(log => log.reqId === one.id && log.res);
    assert.equal(completed.req.query.token, 'QUERY_TOKEN_SECRET');
    assert.equal(completed.req.headers.authorization, 'Bearer AUTH_SECRET');
    assert.equal(completed.res.headers['set-cookie'], 'session=RESPONSE_COOKIE_SECRET');
    assert.equal(completed.res.body.password, 'RESPONSE_BODY_SECRET');
    const malformedLog = logs.find(log => log.reqId === malformed.id && log.res);
    assert.match(malformedLog.err.body, /MALFORMED_PASSWORD_SECRET/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('routine HTTP traffic is quiet while API calls and asset failures remain visible', async () => {
  const logs = [];
  const logger = createLogger({ write: line => logs.push(JSON.parse(line)) });
  const app = express();
  app.use(createHttpLogging(logger));
  app.use((req, res) => {
    if (req.path === '/src/broken.tsx') throw new Error('Module failed');
    res.status(req.query.cached ? 304 : 200).end();
  });
  app.use(httpErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET') => {
    const response = await fetch(`${base}${path}`, { method });
    await response.text();
    return response.headers.get('x-request-id');
  };
  try {
    for (const [path, method] of [
      ['/src/components/animate-ui/icons/house.tsx?t=123'],
      ['/src/components/animate-ui/icons/check.tsx?cached=1'],
      ['/node_modules/.vite/deps/motion_react.js?v=123'],
      ['/@vite/client'], ['/@react-refresh'], ['/assets/app.js'],
      ['/brand/nino.webp'], ['/favicon.ico'], ['/app'], ['/app', 'HEAD'],
      ['/ingest/e/', 'POST'], ['/ingest/static/array.js'],
      ['/api/health?check=1'], ['/api/auth/activity', 'POST'],
    ]) {
      const id = await call(path, method);
      assert.match(id, /^[0-9a-f-]{36}$/);
      assert.equal(logs.some(log => log.reqId === id), false, `${method || 'GET'} ${path}`);
    }
    for (const [path, method] of [
      ['/api/items'], ['/api/catalog/export.js'], ['/api/health/details'],
      ['/api/auth/activity', 'GET'], ['/ingestion', 'POST'],
    ]) {
      const id = await call(path, method);
      assert.deepEqual(logs.filter(log => log.reqId === id).map(log => log.event), [
        'http.request.started', 'http.request.completed',
      ]);
    }
    const id = await call('/src/broken.tsx');
    const scoped = logs.filter(log => log.reqId === id);
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].event, 'http.request.failed');
    assert.equal(scoped[0].level, 50);
    assert.equal(scoped[0].err.message, 'Module failed');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
