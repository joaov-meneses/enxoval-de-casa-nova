import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { getPool } from '../server/database.ts';
import { migrateDatabase } from '../server/migrations.ts';
import { registerApiRoutes } from '../server/routes.ts';

if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL.');
const url = new URL(process.env.DATABASE_URL);
const ssl = process.env.DATABASE_SSL === 'true' || (process.env.DATABASE_SSL !== 'false' && ['require', 'verify-full'].includes(url.searchParams.get('sslmode')));
const control = new pg.Pool({ connectionString: url.toString(), ssl: ssl ? { rejectUnauthorized: false } : undefined });
const schema = `casamia_session_test_${randomUUID().replaceAll('-', '')}`;
let server;
let created = false;
try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.COOKIE_SECURE = 'false';
  await migrateDatabase();
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (path, method = 'GET', body, extraHeaders = {}) => {
    const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = response.headers.getSetCookie().find(value => value.startsWith('enxoval_session='));
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, cookie: setCookie, data: response.status === 204 ? null : await response.json() };
  };
  const query = async (sql, params = []) => (await getPool().query(sql, params)).rows;
  const password = randomBytes(24).toString('hex');
  const registered = await call('/auth/register', 'POST', { email: 'session@example.invalid', password });
  assert.equal(registered.status, 201);
  assert.match(registered.cookie, /Max-Age=604800/);
  assert.match(registered.cookie, /HttpOnly/);
  assert.match(registered.cookie, /SameSite=Lax/);
  const userId = registered.data.user.id;
  const original = (await query('SELECT * FROM sessions WHERE user_id = $1', [userId]))[0];
  assert.ok(Math.abs(original.expires_at - original.created_at - 7 * 86400000) < 5000);

  await query("UPDATE sessions SET created_at = now() - interval '6 days', last_activity_at = now() - interval '47 hours', expires_at = now() + interval '1 day' WHERE id = $1", [original.id]);
  const before = (await query('SELECT * FROM sessions WHERE id = $1', [original.id]))[0];
  assert.equal((await call('/bootstrap')).status, 200);
  assert.equal((await call('/billing/status')).status, 200);
  assert.equal((await query('SELECT last_activity_at FROM sessions WHERE id = $1', [original.id]))[0].last_activity_at.getTime(), before.last_activity_at.getTime(), 'polling does not count as user activity');
  assert.equal((await call('/auth/activity', 'POST', {}, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await call('/auth/activity', 'POST', {})).status, 204);
  const touched = (await query('SELECT * FROM sessions WHERE id = $1', [original.id]))[0];
  assert.ok(Date.now() - touched.last_activity_at < 10000);
  assert.equal(touched.created_at.getTime(), before.created_at.getTime());
  assert.equal(touched.expires_at.getTime(), before.expires_at.getTime(), 'activity cannot extend the absolute deadline');

  await query("UPDATE sessions SET last_activity_at = now() - interval '48 hours 1 second' WHERE id = $1", [original.id]);
  assert.equal((await call('/bootstrap')).status, 401);
  assert.equal((await call('/auth/activity', 'POST', {})).status, 401, 'activity cannot revive an idle session');
  await query("UPDATE sessions SET created_at = now() - interval '7 days 1 second', last_activity_at = now(), expires_at = now() + interval '30 days' WHERE id = $1", [original.id]);
  assert.equal((await call('/bootstrap')).status, 401, 'absolute deadline holds even for a legacy 30-day expiry');
  assert.equal((await call('/auth/activity', 'POST', {})).status, 401);

  const loggedIn = await call('/auth/login', 'POST', { email: 'session@example.invalid', password });
  assert.equal(loggedIn.status, 200);
  assert.match(loggedIn.cookie, /Max-Age=604800/);
  assert.equal((await call('/auth/activity', 'POST', {})).status, 204);
  assert.equal((await call('/auth/logout', 'POST', {})).status, 204);
  assert.equal((await call('/bootstrap')).status, 401);

  // Existing sessions must inherit the limits, without being renewed during migration.
  await query('ALTER TABLE sessions DROP COLUMN last_activity_at');
  await migrateDatabase();
  const migrated = (await query('SELECT * FROM sessions WHERE id = $1', [original.id]))[0];
  assert.equal(migrated.last_activity_at.getTime(), migrated.created_at.getTime());
  assert.equal(migrated.expires_at - migrated.created_at, 7 * 86400000);
  console.log('PASS: 48h inactivity, 7-day absolute expiry, no polling renewal, no revival, logout and legacy migration.');
} finally {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
