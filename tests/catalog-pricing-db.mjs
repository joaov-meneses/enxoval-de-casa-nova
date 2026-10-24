// Real PostgreSQL in an isolated schema; real SerpApi HTTP client and Jev SDK against Postman simulation.
// First run: postman simulation run postman/simulations/catalog-pricing.sim.yaml --port 4912
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { getPool } from '../server/database.ts';
import { migrateDatabase } from '../server/migrations.ts';
import { refreshNationalPriceStats, checkedPriceNames } from '../server/catalog/pricing.ts';
import { runCatalogMarketRefresh } from '../server/workers/catalogMarketWorker.ts';
import { searchShoppingPrices, SerpApiError } from '../server/services/serpapi.ts';
import { setJevTransportForTests } from '../server/services/jev.ts';
import { getCatalogIndex, invalidateCatalogIndex, priceRangeOf } from '../server/catalog/store.ts';

const base = process.env.PRICING_SIMULATION_URL || 'http://127.0.0.1:4912';
process.env.SERPAPI_API_KEY = 'simulation-key';
process.env.SERPAPI_BASE_URL = `${base}/serpapi`;
process.env.TYPESAFE_API_KEY = 'simulation-key';
process.env.TYPESAFE_BASE_URL = `${base}/jev-pricing`;
process.env.CATALOG_MARKET_PRICES = 'on';
process.env.CATALOG_PRICE_MIN_CUSTOMERS = '2';
process.env.REDIS_URL = '';
setJevTransportForTests(undefined);

const original = new URL(process.env.DATABASE_URL);
const ssl = process.env.DATABASE_SSL === 'true' || (process.env.DATABASE_SSL !== 'false' && ['require', 'verify-full'].includes(original.searchParams.get('sslmode'))) ? { rejectUnauthorized: false } : undefined;
const control = new pg.Pool({ connectionString: original.toString(), ssl });
const schema = `pricing_test_${randomUUID().replaceAll('-', '')}`;
let created = false;
async function simulationState(data) {
  const response = await fetch(`${base}/serpapi/test/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal(response.status, 200);
}
const simulationCounts = async () => (await fetch(`${base}/serpapi/test/state`)).json();

try {
  await simulationState({ mode: 'success', searches: 0, queries: [], remaining: 250 });
  await fetch(`${base}/jev-pricing/test/mode`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({mode:'success'}) });
  await control.query(`CREATE SCHEMA "${schema}"`); created = true;
  original.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = original.toString();
  await migrateDatabase();
  const db = getPool();
  const user1 = randomUUID(), user2 = randomUUID(), user3 = randomUUID();
  for (const user of [user1, user2, user3]) await db.query("INSERT INTO users (id,name,email,password_hash) VALUES ($1,'Cliente de teste',$2,'not-a-login-hash')", [user, `${user}@example.invalid`]);
  async function home(owner) {
    const id = randomUUID(), category = randomUUID();
    await db.query("INSERT INTO enxovais (id,name,owner_id,state) VALUES ($1,'Teste',$2,'SP')", [id, owner]);
    await db.query("INSERT INTO categories (id,user_id,enxoval_id,name) VALUES ($1,$2,$3,'Cozinha')", [category, owner, id]);
    return { id, category, owner };
  }
  const h1 = await home(user1), h1b = await home(user1), h2 = await home(user2), h3 = await home(user3);
  async function item(h, catalogId, name, price = null, quantity = 1) {
    const id = randomUUID();
    await db.query('INSERT INTO items (id,user_id,enxoval_id,category_id,name,price_cents,catalog_item_id,quantity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, h.owner, h.id, h.category, name, price, catalogId, quantity]);
    return id;
  }
  const refrigerator = (await db.query("SELECT id FROM catalog_items WHERE canonical_name='Geladeira'")).rows[0].id;
  await item(h1, refrigerator, 'Geladeira Frost Free', 10000);
  await item(h1b, refrigerator, 'Geladeira', 30000);
  await refreshNationalPriceStats();
  assert.equal((await db.query('SELECT * FROM catalog_price_stats WHERE item_id=$1', [refrigerator])).rowCount, 0, 'two lists owned by one customer do not publish a range');
  await item(h2, refrigerator, 'Geladeira', 40000);
  await item(h3, refrigerator, 'Filtro para geladeira', 100);
  await item(h3, refrigerator, 'Geladeira', 900000, 2);
  await refreshNationalPriceStats();
  const stats = async () => (await db.query('SELECT * FROM catalog_price_stats WHERE item_id=$1', [refrigerator])).rows[0];
  assert.deepEqual([ (await stats()).samples, (await stats()).mean_cents, (await stats()).p50, (await stats()).p10, (await stats()).p90, (await stats()).source ], [2, 30000, 30000, 20000, 40000, 'customers']);
  assert.equal((await stats()).region, '');
  const filter = (await db.query("SELECT eligible FROM catalog_price_name_checks WHERE observed_name='Filtro para geladeira'")).rows[0];
  assert.equal(filter.eligible, false, 'Jev rejects a wrongly associated accessory');
  const index = await getCatalogIndex();
  assert.equal(priceRangeOf(index, refrigerator, 'BA').meanCents, 30000, 'another state receives the same national range');
  console.log('PASS: two distinct customers, multiple-list deduplication, mean/range, quantity and Jev filtering.');

  const direct = await searchShoppingPrices('Geladeira novo');
  assert.equal(direct.length, 4, 'parser retains candidates and excludes used, installments and non-BRL');
  await simulationState({ searches: 0, queries: [] });
  const first = await runCatalogMarketRefresh();
  assert.equal(first.searched, 1);
  assert.equal(first.offers, 2, 'one central observation per comparable merchant');
  assert.deepEqual([(await stats()).source, (await stats()).samples, (await stats()).mean_cents], ['serpapi', 2, 13000]);
  const noRepeat = await runCatalogMarketRefresh();
  assert.equal(noRepeat.skipped, true);
  assert.equal((await simulationCounts()).searches, 1, 'restart does not repeat completed rotation in the same week');
  await db.query("UPDATE catalog_market_offers SET captured_at=now()-interval '46 days'");
  await refreshNationalPriceStats();
  assert.equal((await stats()).source, 'customers', 'expired market prices revert to customer data');
  console.log('PASS: real SerpApi client + Jev SDK, offer provenance, merchant deduplication, freshness and fallback.');

  async function resetResearch(mode = 'success', remaining = 250) {
    await db.query('TRUNCATE catalog_market_offers, catalog_market_searches, catalog_market_rotation');
    await simulationState({ mode, remaining, searches: 0, queries: [] });
  }
  const researchItems = [];
  for (let n = 0; n < 260; n++) {
    const id = randomUUID(), name = `Item de teste ${String(n).padStart(3, '0')}`;
    await db.query("INSERT INTO catalog_items (id,slug,canonical_name,normalized_name,source,status) VALUES ($1,$2,$3,$2,'curated','approved')", [id, `pricing-test-${n}`, name]);
    await item(h1, id, name); researchItems.push(id);
  }
  await resetResearch();
  const concurrent = await Promise.all([runCatalogMarketRefresh(), runCatalogMarketRefresh()]);
  assert.equal(concurrent.filter(result => result.reason === 'locked').length, 1);
  assert.equal(concurrent.reduce((sum, result) => sum + result.searched, 0), 50);
  assert.equal((await simulationCounts()).searches, 50, 'multiple server instances share one weekly budget');
  console.log('PASS: concurrent workers cannot duplicate a batch or its allowance.');
  await resetResearch();
  const weeks = ['2026-06-01','2026-06-08','2026-06-15','2026-06-22','2026-06-29'];
  let frozen;
  for (const [weekIndex, date] of weeks.entries()) {
    const now = new Date(`${date}T12:00:00Z`);
    const summary = await runCatalogMarketRefresh({ now });
    assert.equal(summary.searched, 50);
    if (!frozen) frozen = (await db.query('SELECT item_ids FROM catalog_market_rotation')).rows[0].item_ids;
    const cursor = (await db.query('SELECT cursor FROM catalog_market_rotation')).rows[0].cursor;
    assert.equal(cursor, (weekIndex + 1) * 50);
    assert.equal((await runCatalogMarketRefresh({ now })).reason, 'local_quota');
  }
  assert.equal((await simulationCounts()).searches, 250);
  assert.equal((await db.query('SELECT count(DISTINCT item_id)::int AS n FROM catalog_market_searches')).rows[0].n, 250);
  const resumed = await runCatalogMarketRefresh({ now: new Date('2026-07-06T12:00:00Z') });
  assert.equal(resumed.searched, 50);
  const nextIds = (await db.query("SELECT item_id FROM catalog_market_searches WHERE week_start='2026-07-06' ORDER BY requested_at,id")).rows.map(row => row.item_id).sort();
  assert.deepEqual(nextIds, frozen.slice(0, 50).sort(), 'sixth week returns to the first fifty');
  console.log('PASS: 50 per week, frozen 250-item ranking, five distinct batches and next rotation.');

  await resetResearch();
  await db.query(`INSERT INTO catalog_market_searches (id,canonical_name,query,week_start,month_start,requested_at)
    SELECT gen_random_uuid(),'Item apagado','Consulta anterior','2026-08-03','2026-08-01','2026-08-03' FROM generate_series(1,249)`);
  const lastCredit = await runCatalogMarketRefresh({ now: new Date('2026-08-31T12:00:00Z') });
  assert.equal(lastCredit.searched, 1);
  assert.equal((await runCatalogMarketRefresh({ now: new Date('2026-08-31T12:00:00Z') })).reason, 'local_quota');
  assert.equal((await simulationCounts()).searches, 1, 'deleted items do not restore a reserved monthly allowance');
  await resetResearch('success', 0);
  assert.equal((await runCatalogMarketRefresh()).reason, 'provider_quota');
  assert.equal((await simulationCounts()).searches, 0);
  console.log('PASS: independent monthly guard and live provider allowance guard.');

  for (const mode of ['unauthorized', 'rate-limit', 'html', 'error', 'invalid']) {
    await resetResearch(mode);
    const result = await runCatalogMarketRefresh();
    assert.equal(result.searched, 1); assert.equal(result.failed, 1, `${mode} stops the batch without retry`);
    assert.equal((await simulationCounts()).searches, 1);
    assert.equal((await stats()).source, 'customers');
  }
  await resetResearch('timeout');
  process.env.SERPAPI_TIMEOUT_MS = '100';
  await assert.rejects(() => searchShoppingPrices('Geladeira novo'), error => error instanceof SerpApiError && error.code === 'timeout' && !error.message.includes('simulation-key'));
  delete process.env.SERPAPI_TIMEOUT_MS;
  await new Promise(resolve => setTimeout(resolve, 650));
  await resetResearch('empty');
  const empty = await runCatalogMarketRefresh();
  assert.equal(empty.offers, 0); assert.equal((await stats()).source, 'customers');
  console.log('PASS: authorization, quota, HTML/JSON failures, timeout and empty offers keep the customer fallback.');

  await fetch(`${base}/jev-pricing/test/mode`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({mode:'uncertain'}) });
  const uncertain = await checkedPriceNames({id:refrigerator,name:'Geladeira'}, ['Modelo incerto para teste']);
  assert.equal(uncertain.size, 0);
  console.log('PASS: uncertain Jev responses do not create eligible observations or invent prices.');
  await migrateDatabase();
  invalidateCatalogIndex();
  assert.equal((await stats()).source, 'customers', 'migration is idempotent and preserves aggregates');
} finally {
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
