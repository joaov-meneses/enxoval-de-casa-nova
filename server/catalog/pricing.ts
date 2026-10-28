import { getPool, type Queryable } from '../database.ts';
import { foldText } from '../../src/catalog/normalize.ts';
import { validatePriceNames } from '../services/jev.ts';
import { invalidateCatalogIndex, isSharableName } from './store.ts';

export const PRICE_CHECK_REVISION = 1;
const STATS_LOCK = 726_351_910;

export function priceMinCustomers() {
  const value = Number(process.env.CATALOG_PRICE_MIN_CUSTOMERS);
  return Number.isInteger(value) && value >= 2 ? value : 2;
}

/** As decisões são persistidas por nome e referência; renomear o catálogo exige nova avaliação. */
export async function checkedPriceNames(item: { id: string; name: string }, names: string[], queryable: Queryable = getPool()) {
  const unique = [...new Set(names)];
  const stored = await queryable.query<{ observed_name: string; eligible: boolean; confidence: number }>(
    `SELECT observed_name, eligible, confidence FROM catalog_price_name_checks
     WHERE item_id = $1 AND observed_name = ANY($2::text[]) AND canonical_name = $3 AND revision = $4`,
    [item.id, unique, item.name, PRICE_CHECK_REVISION]
  );
  const checks = new Map(stored.rows.map(row => [row.observed_name, { eligible: row.eligible, confidence: Number(row.confidence) }]));
  const pending = unique.filter(name => !checks.has(name));
  const exact = pending.filter(name => foldText(name) === foldText(item.name));
  for (const name of exact) checks.set(name, { eligible: true, confidence: 1 });
  const uncertain = pending.filter(name => !checks.has(name));
  for (let offset = 0; offset < uncertain.length; offset += 20) {
    const decided = await validatePriceNames(item.name, uncertain.slice(offset, offset + 20));
    for (const [name, check] of decided) checks.set(name, check);
  }
  for (const name of pending) {
    const check = checks.get(name);
    if (!check) continue;
    await queryable.query(
      `INSERT INTO catalog_price_name_checks (item_id, observed_name, canonical_name, eligible, confidence, revision)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (item_id, observed_name) DO UPDATE SET
       canonical_name=EXCLUDED.canonical_name, eligible=EXCLUDED.eligible, confidence=EXCLUDED.confidence,
       revision=EXCLUDED.revision, checked_at=now()`,
      [item.id, name, item.name, check.eligible, check.confidence, PRICE_CHECK_REVISION]
    );
  }
  return checks;
}

async function checkCustomerNames() {
  const rows = await getPool().query<{ item_id: string; canonical_name: string; name: string }>(
    `SELECT DISTINCT ci.id AS item_id, ci.canonical_name, i.name
     FROM items i JOIN catalog_items ci ON ci.id=i.catalog_item_id
     LEFT JOIN tracked_products tp ON tp.id=i.tracked_product_id
     LEFT JOIN catalog_price_name_checks v ON v.item_id=ci.id AND v.observed_name=i.name
       AND v.canonical_name=ci.canonical_name AND v.revision=$1
     WHERE i.quantity=1 AND COALESCE(i.price_cents,tp.current_price_cents)>0 AND v.item_id IS NULL
     ORDER BY ci.id, i.name LIMIT 1000`, [PRICE_CHECK_REVISION]
  );
  const groups = new Map<string, { name: string; names: string[] }>();
  for (const row of rows.rows) {
    if (!isSharableName(row.name)) continue;
    const group = groups.get(row.item_id) ?? { name: row.canonical_name, names: [] };
    group.names.push(row.name); groups.set(row.item_id, group);
  }
  for (const [id, group] of groups) await checkedPriceNames({ id, name: group.name }, group.names);
}

/** Só publica agregados nacionais. Uma pessoa com vários enxovais continua contando uma vez. */
export async function refreshNationalPriceStats() {
  const client = await getPool().connect();
  let locked = false;
  try {
    locked = Boolean((await client.query('SELECT pg_try_advisory_lock($1) AS locked', [STATS_LOCK])).rows[0]?.locked);
    if (!locked) return 0;
    await checkCustomerNames();
    await client.query('BEGIN');
    await client.query('DELETE FROM catalog_price_stats');
    const result = await client.query(`
      WITH customers AS (
        SELECT i.catalog_item_id AS item_id, e.owner_id::text AS sample_id,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(i.price_cents,tp.current_price_cents)) AS price
        FROM items i JOIN enxovais e ON e.id=i.enxoval_id
        JOIN catalog_items ci ON ci.id=i.catalog_item_id
        JOIN catalog_price_name_checks v ON v.item_id=ci.id AND v.observed_name=i.name
          AND v.canonical_name=ci.canonical_name AND v.revision=$2 AND v.eligible
        LEFT JOIN tracked_products tp ON tp.id=i.tracked_product_id
        WHERE i.quantity=1 AND COALESCE(i.price_cents,tp.current_price_cents)>0
        GROUP BY i.catalog_item_id, e.owner_id
      ), market AS (
        SELECT DISTINCT ON (s.item_id,o.merchant) s.item_id, o.merchant AS sample_id, o.price_cents::double precision AS price
        FROM catalog_market_offers o JOIN catalog_market_searches s ON s.id=o.search_id
        JOIN catalog_items ci ON ci.id=s.item_id AND ci.canonical_name=s.canonical_name
        WHERE s.status='success' AND o.captured_at>=now()-interval '45 days'
        ORDER BY s.item_id,o.merchant,o.captured_at DESC,s.requested_at DESC
      ), observations AS (
        SELECT *, 'customers' AS source FROM customers UNION ALL SELECT *, 'serpapi' AS source FROM market
      ), fences AS (
        SELECT item_id,source,percentile_cont(0.25) WITHIN GROUP (ORDER BY price) AS q1,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY price) AS q3
        FROM observations GROUP BY item_id,source
      ), kept AS (
        SELECT o.* FROM observations o JOIN fences f USING(item_id,source)
        WHERE o.price BETWEEN f.q1-1.5*(f.q3-f.q1) AND f.q3+1.5*(f.q3-f.q1)
      ), ranges AS (
        SELECT item_id,source,COUNT(*)::int AS samples,round(avg(price))::int AS mean_cents,
          round(CASE WHEN count(*)<5 THEN min(price) ELSE percentile_cont(0.1) WITHIN GROUP (ORDER BY price) END)::int AS p10,
          round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price))::int AS p50,
          round(CASE WHEN count(*)<5 THEN max(price) ELSE percentile_cont(0.9) WITHIN GROUP (ORDER BY price) END)::int AS p90
        FROM kept GROUP BY item_id,source HAVING COUNT(*)>=CASE WHEN source='customers' THEN $1 ELSE 2 END
      ), preferred AS (
        SELECT DISTINCT ON (item_id) * FROM ranges ORDER BY item_id,(source='serpapi') DESC
      ) INSERT INTO catalog_price_stats (item_id,region,p10,p50,p90,samples,mean_cents,source)
        SELECT item_id,'',p10,p50,p90,samples,mean_cents,source FROM preferred`,
      [priceMinCustomers(), PRICE_CHECK_REVISION]
    );
    await client.query('COMMIT');
    invalidateCatalogIndex();
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [STATS_LOCK]);
    client.release();
  }
}
