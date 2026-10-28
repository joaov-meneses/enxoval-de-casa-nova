// Real HTTP + PostgreSQL in a disposable schema. No payment, banking or mail service is called.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import { strongPassword } from './strongPassword.mjs';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para os testes isolados.');
const databaseUrl = new URL(process.env.DATABASE_URL);
const ssl = process.env.DATABASE_SSL === 'true' || (process.env.DATABASE_SSL !== 'false' && ['require', 'verify-full'].includes(databaseUrl.searchParams.get('sslmode')));
const control = new pg.Pool({ connectionString: databaseUrl.toString(), ssl: ssl ? { rejectUnauthorized: false } : undefined });
const schema = `casamia_cha_test_${randomUUID().replaceAll('-', '')}`;
let server;
let created = false;
let pool;
let streamAbort;
try {
  await control.query(`CREATE SCHEMA "${schema}"`); created = true;
  databaseUrl.searchParams.set('options', `-c search_path=${schema}`);
  Object.assign(process.env, { DATABASE_URL: databaseUrl.toString(), COOKIE_SECURE: 'false', EMAIL_VERIFICATION_REQUIRED: 'false', MAIL_DRIVER: 'memory', POSTHOG_PROJECT_API_KEY: '', GA4_API_SECRET: '', LOG_LEVEL: 'fatal' });
  const { getPool } = await import('../server/database.ts');
  pool = getPool();
  const { migrateDatabase } = await import('../server/migrations.ts');
  const { registerApiRoutes } = await import('../server/routes.ts');
  await migrateDatabase();
  await migrateDatabase();
  const app = express(); app.use(express.json()); registerApiRoutes(app);
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const query = async (sql, params = []) => (await pool.query(sql, params)).rows;
  const client = () => {
    let cookie = '';
    return { call: async (path, method = 'GET', body, headers = {}) => {
      const response = await fetch(`${base}${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const session = response.headers.getSetCookie().find(value => value.startsWith('enxoval_session='));
      if (session) cookie = session.split(';')[0];
      const raw = await response.text();
      return { status: response.status, data: raw ? JSON.parse(raw) : null, headers: response.headers };
    } };
  };
  const owner = client(), editor = client(), stranger = client(), guest = client();
  async function signup(person, name) {
    const result = await person.call('/auth/register', 'POST', { name, email: `${randomUUID()}@example.invalid`, password: strongPassword() });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    await query("UPDATE users SET plan = 'monthly', onboarding_completed_at = now() WHERE id = $1", [result.data.user.id]);
    return result.data.user.id;
  }
  const ownerId = await signup(owner, 'Ana'), editorId = await signup(editor, 'Léo'), strangerId = await signup(stranger, 'Bia');
  async function workspace(userId, name) {
    const id = randomUUID(), categoryId = randomUUID();
    await query('INSERT INTO enxovais (id, owner_id, name) VALUES ($1,$2,$3)', [id, userId, name]);
    await query("INSERT INTO enxoval_members (enxoval_id,user_id,role) VALUES ($1,$2,'owner')", [id,userId]);
    await query("INSERT INTO categories (id,user_id,enxoval_id,name) VALUES ($1,$2,$3,'Cozinha')", [categoryId,userId,id]);
    return { id, categoryId, userId };
  }
  const home = await workspace(ownerId, 'Nosso lar'), foreign = await workspace(strangerId, 'Outro lar');
  await query("INSERT INTO enxoval_members (enxoval_id,user_id,role) VALUES ($1,$2,'editor')", [home.id,editorId]);
  async function item(space, name, status = 'researching') {
    const id = randomUUID();
    await query("INSERT INTO items (id,user_id,enxoval_id,category_id,name,status,description,price_cents) VALUES ($1,$2,$3,$4,$5,$6,'segredo do enxoval',12345)", [id,space.userId,space.id,space.categoryId,name,status]);
    return id;
  }
  const chosen = await item(home, 'Jogo de pratos'), hidden = await item(home, 'Item secreto'), second = await item(home, 'Toalhas'), otherItem = await item(foreign, 'Panela de outro lar');
  const path = `/enxovais/${home.id}/housewarming`;
  const settings = { slug: 'lar-da-ana-e-leo', title: 'Nosso Chá de Casa Nova', message: 'Venha celebrar!', eventDate: '2026-12-12', isPublic: false, itemIds: [chosen, second],
    pix: { keyType: 'random', key: '123e4567-e12b-12d1-a456-426655440000', receiverName: 'Ana de Tal', city: 'São Paulo' } };
  assert.equal((await guest.call(path)).status, 401);
  assert.equal((await owner.call('/enxovais/invalid-id/housewarming')).status, 400);
  assert.equal((await stranger.call(path)).status, 404);
  assert.equal((await editor.call(path, 'PUT', settings)).status, 403);
  assert.equal((await owner.call(path)).data.list, null);
  assert.equal((await owner.call(path, 'PUT', { ...settings, itemIds: [otherItem] })).status, 400);
  assert.equal((await owner.call(path, 'PUT', { ...settings, eventDate: '2026-02-30' })).status, 400);
  assert.equal((await owner.call(path, 'PUT', settings)).status, 200);
  const publicPath = `/public/housewarming/${settings.slug}`;
  assert.equal((await guest.call(publicPath)).status, 404);
  assert.equal((await owner.call(path, 'PUT', { ...settings, isPublic: true })).status, 200);
  const pub = await guest.call(publicPath);
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  assert.equal(pub.headers.get('cache-control'), 'no-store');
  assert.equal(pub.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.deepEqual(new Set(pub.data.items.map(row => row.id)), new Set([chosen, second]));
  assert.deepEqual(Object.keys(pub.data).sort(), ['eventDate','items','message','pix','slug','title']);
  assert.deepEqual(Object.keys(pub.data.items[0]).sort(), ['availability','category','id','name']);
  assert.equal(JSON.stringify(pub.data).includes('segredo'), false);
  assert.equal(JSON.stringify(pub.data).includes(hidden), false);
  assert.match(pub.data.pix.payload, /^000201/);
  assert.equal(pub.data.pix.receiverName, 'ANA DE TAL');
  console.log('PASS: explicit publication, item allowlist, private data and owner/editor permissions.');

  const guestOne = { requestId: randomUUID(), itemId: chosen, name: 'Maria', email: 'maria@example.invalid', message: 'Muito amor no novo lar!' };
  const guestTwo = { ...guestOne, requestId: randomUUID(), name: 'Joana', email: 'joana@example.invalid' };
  streamAbort = new AbortController();
  const stream = await fetch(`${base}${publicPath}/events`, { signal: streamAbort.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: refresh\ndata: \{\}/);
  const concurrent = await Promise.all([guest.call(`${publicPath}/reservations`, 'POST', guestOne), guest.call(`${publicPath}/reservations`, 'POST', guestTwo)]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [201,409]);
  let eventTimeout;
  try {
    const change = await Promise.race([reader.read(), new Promise((_, reject) => { eventTimeout = setTimeout(() => reject(new Error('No committed change reached the SSE subscriber')), 5000); })]);
    assert.match(new TextDecoder().decode(change.value), /event: refresh\ndata: \{\}/);
  } finally { clearTimeout(eventTimeout); streamAbort.abort(); await reader.cancel().catch(() => undefined); }
  const winner = concurrent[0].status === 201 ? guestOne : guestTwo;
  assert.equal((await guest.call(`${publicPath}/reservations`, 'POST', winner)).status, 200);
  assert.equal((await guest.call(`${publicPath}/reservations`, 'POST', { ...winner, name: 'Outro nome' })).status, 409);
  let row = (await query('SELECT status,gift_from,gift_message,gift_reservation_id FROM items WHERE id = $1', [chosen]))[0];
  assert.equal(row.status, 'researching'); assert.equal(row.gift_from, winner.name); assert.equal(row.gift_message, winner.message); assert.equal(row.gift_reservation_id,winner.requestId);
  const after = (await guest.call(publicPath)).data;
  assert.equal(after.items.find(row => row.id === chosen).availability, 'reserved');
  assert.equal(JSON.stringify(after).includes(winner.email), false);
  const message = { requestId: randomUUID(), name: 'Vó Lia', message: '<script>Este recado é só dos moradores</script>' };
  assert.equal((await guest.call(`${publicPath}/messages`, 'POST', message)).status, 201);
  assert.equal((await guest.call(`${publicPath}/messages`, 'POST', message)).status, 200);
  assert.equal((await guest.call(`${publicPath}/messages`, 'POST', { ...message, message: 'Alterado' })).status, 409);
  let management = (await editor.call(path)).data;
  assert.equal(management.unreadCount, 2); assert.equal(management.inbox.length, 2);
  assert.equal(management.inbox.find(row => row.kind === 'reservation').email, winner.email);
  assert.equal((await owner.call(`${path}/notifications`)).data.unreadCount, 2);
  assert.equal((await editor.call(`${path}/read`, 'POST', { ids: [message.requestId] })).status, 204);
  assert.equal((await owner.call(`${path}/notifications`)).data.unreadCount, 1);
  assert.equal((await editor.call(`${path}/reservations/${winner.requestId}`, 'DELETE')).status, 403);
  assert.equal((await editor.call(`/items/${chosen}`, 'PATCH', { status: 'received' })).status, 200);
  assert.equal((await guest.call(publicPath)).data.items.find(row => row.id === chosen).availability, 'gifted');
  assert.equal((await owner.call(`${path}/reservations/${winner.requestId}`, 'DELETE')).status, 409);
  assert.equal((await owner.call(`/items/${chosen}`, 'PATCH', { status: 'researching', giftMessage: 'anotação dos moradores' })).status, 200);
  assert.equal((await owner.call(`${path}/reservations/${winner.requestId}`, 'DELETE')).status, 204);
  assert.equal((await owner.call(`${path}/reservations/${winner.requestId}`, 'DELETE')).status, 204);
  row = (await query('SELECT gift_from,gift_message,gift_reservation_id FROM items WHERE id=$1', [chosen]))[0];
  assert.equal(row.gift_from,null); assert.equal(row.gift_message,'anotação dos moradores'); assert.equal(row.gift_reservation_id,null);
  assert.equal((await guest.call(publicPath)).data.items.find(row => row.id === chosen).availability, 'available');
  console.log('PASS: concurrent reservation, committed PostgreSQL-to-SSE update, idempotent retries, private recados, notifications, receipt and cancellation.');

  const anotherPath = `/enxovais/${foreign.id}/housewarming`;
  assert.equal((await stranger.call(anotherPath, 'PUT', { ...settings, itemIds: [otherItem] })).status, 409);
  const foreignSettings = { ...settings, slug: 'outro-cha', itemIds: [otherItem], isPublic: true };
  assert.equal((await stranger.call(anotherPath, 'PUT', foreignSettings)).status, 200);
  assert.equal((await stranger.call(`${anotherPath}/read`, 'POST', { ids: [message.requestId] })).status, 204);
  assert.equal((await stranger.call(`${anotherPath}/reservations/${winner.requestId}`, 'DELETE')).status, 404);
  assert.equal((await owner.call(path, 'PUT', { ...settings, slug: 'novo-endereco', isPublic: true })).status, 200);
  assert.equal((await guest.call(publicPath)).status, 404);
  const nextPath = '/public/housewarming/novo-endereco';
  await query("UPDATE users SET plan='free' WHERE id=$1", [ownerId]);
  assert.equal((await guest.call(nextPath)).status, 404);
  assert.equal((await guest.call(`${nextPath}/messages`, 'POST', { ...message, requestId: randomUUID() })).status, 404);
  await query("UPDATE users SET plan='monthly', is_active=false WHERE id=$1", [ownerId]);
  assert.equal((await guest.call(nextPath)).status, 404);
  await query('UPDATE users SET is_active=true WHERE id=$1', [ownerId]);
  await query("INSERT INTO bans (id,target_type,target_value,scope,reason_code,created_by) VALUES ($1,'user',$2,'block_all','other',$3)", [randomUUID(),ownerId,strangerId]);
  assert.equal((await guest.call(nextPath)).status, 404);
  await query('DELETE FROM bans WHERE target_value=$1', [ownerId]);
  assert.equal((await owner.call(path, 'PUT', settings)).status, 200);
  assert.equal((await guest.call(publicPath)).status, 404);
  assert.equal((await guest.call(`${publicPath}/messages`, 'POST', message, { Origin: 'https://evil.invalid' })).status, 403);
  await query('DELETE FROM enxovais WHERE id=$1', [home.id]);
  assert.equal((await query('SELECT count(*)::int AS n FROM housewarming_lists WHERE enxoval_id=$1', [home.id]))[0].n,0);
  assert.equal((await query('SELECT count(*)::int AS n FROM housewarming_reservations'))[0].n,0);
  assert.equal((await query('SELECT count(*)::int AS n FROM housewarming_messages'))[0].n,0);
  console.log('PASS: slug conflicts, cross-workspace isolation, access expiry, bans, unpublishing, CSRF and cascading deletion.');
} finally {
  streamAbort?.abort();
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
