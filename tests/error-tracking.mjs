import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import express from 'express';
import { PostHog } from 'posthog-node';
import { exceptionProperties } from '../shared/errorTracking.ts';
import { createErrorTracking, errorTrackingHandler } from '../server/errorTracking.ts';
import { HttpError, asyncHandler } from '../server/security.ts';

test('exception sanitizer preserves source coordinates and chunk IDs, removes free text and request data', () => {
  const result = exceptionProperties({
    email: 'PRIVATE_EMAIL', $current_url: 'PRIVATE_URL', $set: { password: 'PRIVATE_PASSWORD' },
    $exception_list: [{ type: 'TypeError', value: 'PRIVATE_MESSAGE', mechanism: { type: 'generic', data: 'PRIVATE_MECHANISM' },
      stacktrace: { frames: [{ platform: 'node:javascript', filename: 'C:\\Users\\PRIVATE_USER\\dist\\server.js?token=PRIVATE_TOKEN', function: 'createItem', lineno: 12, colno: 8, chunk_id: '1234-abcd', vars: { body: 'PRIVATE_BODY' }, context_line: 'PRIVATE_SOURCE' }] } }],
  });
  assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
  assert.equal(result.$exception_list[0].stacktrace.frames[0].filename, 'server.js');
  assert.equal(result.$exception_list[0].stacktrace.frames[0].chunk_id, '1234-abcd');
  assert.equal(result.$exception_list[0].stacktrace.frames[0].lineno, 12);
});

test('server is disabled without token, by explicit switch, and in development by default', () => {
  assert.equal(createErrorTracking({}, true), null);
  assert.equal(createErrorTracking({ POSTHOG_KEY: 'test' }, false), null);
  assert.equal(createErrorTracking({ POSTHOG_KEY: 'test', POSTHOG_ERROR_TRACKING: 'false' }, true), null);
});

test('Express forwards only unexpected failures once, preserves responses, and tolerates telemetry failure', async () => {
  const captured = [];
  const app = express();
  app.get('/expected', () => { throw new HttpError(403, 'Denied'); });
  app.get('/api/admin/private', () => { throw new Error('PRIVATE_ADMIN'); });
  app.get('/failure', asyncHandler(async () => { throw new Error('PRIVATE_MESSAGE'); }));
  app.use(errorTrackingHandler({ captureException: (...args) => { captured.push(args); throw new Error('transport'); } }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: 'failed' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/expected`)).status, 403);
    assert.equal((await fetch(`${base}/api/admin/private`)).status, 500);
    const failure = await fetch(`${base}/failure?token=PRIVATE_TOKEN`, { headers: { authorization: 'PRIVATE_AUTH' } });
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { error: 'failed' });
    assert.equal(captured.length, 1);
    assert.equal(captured[0].length, 1);
    assert.ok(captured[0][0] instanceof Error);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('real Node SDK exception payload is sanitized before transport (no external requests)', async () => {
  const batches = [];
  const client = new PostHog('phc_test', {
    host: 'https://posthog.invalid', disableGeoip: true, disableCompression: true, fetchRetryCount: 0,
    before_send: event => event.event === '$exception' ? { ...event, properties: exceptionProperties(event.properties) } : null,
    fetch: async (_url, options) => {
      batches.push(JSON.parse(options.body));
      return { status: 200, text: async () => '{}', json: async () => ({}) };
    },
  });
  try {
    client.captureException(new TypeError('PRIVATE_EMAIL PRIVATE_PASSWORD'), undefined, { body: 'PRIVATE_BODY' });
    await client.flush();
    assert.equal(batches.length, 1);
    assert.equal(JSON.stringify(batches).includes('PRIVATE_'), false);
    const event = batches[0].batch[0];
    assert.equal(event.event, '$exception');
    assert.equal(event.properties.$exception_list[0].type, 'TypeError');
    assert.ok(event.properties.$exception_list[0].stacktrace.frames.length > 0);
  } finally { await client.shutdown(); }
});

test('source maps are removed from public output with upload disabled or missing credentials', async () => {
  const root = process.cwd();
  await mkdir(path.join(root, 'tmp'), { recursive: true });
  const fixture = await mkdtemp(path.join(root, 'tmp', 'posthog-sourcemaps-'));
  try {
    const dist = path.join(fixture, 'dist');
    for (const upload of ['false', 'true']) {
      await build({ stdin: { contents: 'export const fail = () => { throw new Error("test"); };', sourcefile: 'source.ts' }, outfile: path.join(dist, 'app.js'), format: 'esm', sourcemap: 'external' });
      const cleanup = spawnSync(process.execPath, [path.join(root, 'scripts/posthog-sourcemaps.mjs')], {
        cwd: fixture,
        env: { ...process.env, POSTHOG_UPLOAD_SOURCEMAPS: upload, POSTHOG_CLI_API_KEY: '', POSTHOG_CLI_PROJECT_ID: '' },
        encoding: 'utf8',
      });
      assert.equal(cleanup.status, upload === 'true' ? 1 : 0, cleanup.stderr);
      await assert.rejects(readFile(path.join(dist, 'app.js.map')), { code: 'ENOENT' });
      assert.match(await readFile(path.join(dist, 'app.js'), 'utf8'), /throw new Error/);
    }
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
