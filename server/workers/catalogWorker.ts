// Rotina do catálogo mestre. Roda sozinha a cada 6 horas dentro do servidor (ver `startCatalogScheduler`) ou sob
// demanda: npm run catalog:refresh. Nenhum passo padrão chama o Jev; o pré-cálculo das urgências (que chama) só roda
// quando pedido: npm run catalog:refresh -- --urgency [--limit 600]
import { getPool } from '../database.ts';
import { itemKey } from '../../src/catalog/normalize.ts';
import type { RoomKey } from '../../src/onboarding/types.ts';
import { roomOfCategory } from '../../src/planning/purchasePlan.ts';
import { URGENCY_RUBRIC_VERSION } from '../../src/planning/purchaseUrgency.ts';
import { ALL_PROFILE_BUCKETS, bucketState, CATALOG_ROOM_LABELS, isJevConfigured, MAX_URGENCY_ITEMS, prioritizeItems } from '../services/jev.ts';
import {
  createCatalogItem,
  flushCatalogMetrics,
  getCatalogIndex,
  invalidateCatalogIndex,
  linkItemsToCatalog,
  matchName,
  saveCatalogUrgencies
} from '../catalog/store.ts';

export const CATALOG_REFRESH_INTERVAL_MS = 6 * 60 * 60_000;
// Número fixo que identifica esta rotina no lock do PostgreSQL (evita duas execuções ao mesmo tempo em vários servidores).
const ADVISORY_LOCK_KEY = 726_351_906;

/** Amostra mínima (enxovais diferentes) para publicar uma faixa de preço ou promover um item cadastrado pelas pessoas. */
export function minSamples() {
  const value = Number(process.env.CATALOG_MIN_SAMPLES);
  return Number.isInteger(value) && value >= 1 ? value : 5;
}

export interface CatalogRefreshOptions {
  /** Pré-calcula as urgências que faltam por faixa de perfil (chama o Jev). */
  urgency?: boolean;
  /** Teto de itens enviados ao Jev nesta rodada (cada `MAX_URGENCY_ITEMS` itens é uma consulta por parte). */
  urgencyLimit?: number;
  log?: (message: string) => void;
}

export interface CatalogRefreshSummary {
  skipped: boolean;
  linked: number;
  promoted: number;
  priceRanges: number;
  urgencies: number;
}

/**
 * Faixas de preço por item e região (UF), só com agregados: um valor por enxoval (a mediana dos preços dele), fora os
 * extremos (regra do IQR), e só com `minSamples()` enxovais distintos. Itens com quantidade maior que 1 ficam de fora,
 * porque o preço pode ser do conjunto. Na falta do preço digitado, vale o preço lido da loja acompanhada.
 */
export async function refreshPriceStats() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM catalog_price_stats');
    const result = await client.query(
      `WITH per_enxoval AS (
         SELECT i.catalog_item_id AS item_id, COALESCE(e.state, '') AS uf, i.enxoval_id,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(i.price_cents, tp.current_price_cents)) AS price
         FROM items i
         INNER JOIN enxovais e ON e.id = i.enxoval_id
         LEFT JOIN tracked_products tp ON tp.id = i.tracked_product_id
         WHERE i.catalog_item_id IS NOT NULL
           AND i.quantity = 1
           AND i.status NOT IN ('not_needed', 'discarded')
           AND COALESCE(i.price_cents, tp.current_price_cents) > 0
         GROUP BY 1, 2, 3
       ),
       scoped AS (
         SELECT item_id, '' AS region, price FROM per_enxoval
         UNION ALL
         SELECT item_id, uf, price FROM per_enxoval WHERE uf <> ''
       ),
       fences AS (
         SELECT item_id, region,
                percentile_cont(0.25) WITHIN GROUP (ORDER BY price) AS q1,
                percentile_cont(0.75) WITHIN GROUP (ORDER BY price) AS q3
         FROM scoped GROUP BY 1, 2
       ),
       kept AS (
         SELECT s.item_id, s.region, s.price
         FROM scoped s INNER JOIN fences f USING (item_id, region)
         WHERE s.price BETWEEN f.q1 - 1.5 * (f.q3 - f.q1) AND f.q3 + 1.5 * (f.q3 - f.q1)
       )
       INSERT INTO catalog_price_stats (item_id, region, p10, p50, p90, samples)
       SELECT item_id, region,
              round(percentile_cont(0.1) WITHIN GROUP (ORDER BY price))::int,
              round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price))::int,
              round(percentile_cont(0.9) WITHIN GROUP (ORDER BY price))::int,
              COUNT(*)::int
       FROM kept
       GROUP BY 1, 2
       HAVING COUNT(*) >= $1`,
      [minSamples()]
    );
    await client.query('COMMIT');
    invalidateCatalogIndex();
    return result.rowCount ?? 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Liga ao catálogo os itens que ainda não têm par (itens antigos, ou que o catálogo passou a conhecer). Sem Jev. */
export async function linkUnlinkedItems(limit = 5000) {
  const result = await getPool().query<{ id: string; name: string }>(
    'SELECT id, name FROM items WHERE catalog_item_id IS NULL ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  const { linked } = await linkItemsToCatalog(getPool(), result.rows);
  return linked;
}

/**
 * Itens que muitas pessoas cadastram e o catálogo não conhece entram como `source = users`, à espera de revisão.
 * O nome mais usado vira o nome do item e o cômodo é o do ambiente mais comum. Não guarda quem cadastrou.
 */
export async function harvestUserItems(limit = 20_000) {
  const result = await getPool().query<{ name: string; category: string; enxoval_id: string }>(
    `SELECT i.name, c.name AS category, i.enxoval_id
     FROM items i INNER JOIN categories c ON c.id = i.category_id
     WHERE i.catalog_item_id IS NULL
     ORDER BY i.created_at DESC LIMIT $1`,
    [limit]
  );
  const groups = new Map<string, { enxovais: Set<string>; names: Map<string, number>; rooms: Map<string, number> }>();
  for (const row of result.rows) {
    const key = itemKey(row.name);
    if (!key) continue;
    const group = groups.get(key) ?? { enxovais: new Set(), names: new Map(), rooms: new Map() };
    group.enxovais.add(row.enxoval_id);
    const name = row.name.replace(/\s+/g, ' ').trim();
    group.names.set(name, (group.names.get(name) ?? 0) + 1);
    const room = roomOfCategory(row.category);
    if (room) group.rooms.set(room, (group.rooms.get(room) ?? 0) + 1);
    groups.set(key, group);
  }

  const catalog = await getCatalogIndex();
  const top = (counts: Map<string, number>) => [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let promoted = 0;
  for (const [key, group] of groups) {
    if (group.enxovais.size < minSamples() || matchName(catalog, key).item) continue;
    const created = await createCatalogItem(getPool(), {
      name: top(group.names)!,
      normalizedName: key,
      // `Room` do planejamento e `RoomKey` do funil são a mesma lista de cômodos.
      room: top(group.rooms) as RoomKey | null,
      priority: null,
      timing: null,
      leadTimeWeeks: 0,
      priceCategory: null,
      functionGroup: null,
      source: 'users',
      status: 'pending_review'
    });
    if (created) promoted += 1;
  }
  return promoted;
}

/**
 * Pré-calcula, em lote, as urgências que faltam por faixa de perfil: custo único, controlado e previsível, em vez de
 * gasto sob demanda. Só itens aprovados. Para quando atinge `limit` itens enviados ao Jev.
 */
export async function precomputeUrgencies(limit = 600, log: (message: string) => void = () => {}) {
  if (!isJevConfigured()) {
    log('Jev sem chave (TYPESAFE_API_KEY): urgências não pré-calculadas.');
    return 0;
  }
  const catalog = await getCatalogIndex();
  let sent = 0;
  let saved = 0;
  for (const bucket of ALL_PROFILE_BUCKETS) {
    if (sent >= limit) break;
    const missing = await getPool().query<{ id: string }>(
      `SELECT ci.id FROM catalog_items ci
       WHERE ci.status = 'approved' AND NOT EXISTS (
         SELECT 1 FROM catalog_item_urgency u WHERE u.item_id = ci.id AND u.profile_bucket = $1 AND u.rubric_version = $2)
       ORDER BY ci.priority = 'essential' DESC, ci.canonical_name
       LIMIT $3`,
      [bucket, URGENCY_RUBRIC_VERSION, limit - sent]
    );
    for (let i = 0; i < missing.rows.length; i += MAX_URGENCY_ITEMS) {
      const chunk = missing.rows.slice(i, i + MAX_URGENCY_ITEMS);
      sent += chunk.length;
      const results = await prioritizeItems({
        items: chunk.map(({ id }) => {
          const item = catalog.items.get(id);
          return { id, name: item?.name ?? id, environment: item?.room ? CATALOG_ROOM_LABELS[item.room] : 'Casa' };
        }),
        state: bucketState(bucket)
      });
      // O Jev parou de responder (limite do dia, erro): melhor parar do que gastar o resto em vão.
      if (!results) return saved;
      await saveCatalogUrgencies(getPool(), bucket, results);
      saved += results.length;
    }
    log(`Faixa ${bucket}: ${saved} notas gravadas até agora.`);
  }
  return saved;
}

export async function runCatalogRefresh(options: CatalogRefreshOptions = {}): Promise<CatalogRefreshSummary> {
  const log = options.log ?? (() => {});
  const lockClient = await getPool().connect();
  try {
    const lock = await lockClient.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_KEY]);
    if (!lock.rows[0]?.locked) return { skipped: true, linked: 0, promoted: 0, priceRanges: 0, urgencies: 0 };
    try {
      const linked = await linkUnlinkedItems();
      log(`${linked} itens ligados ao catálogo.`);
      const promoted = await harvestUserItems();
      // Itens que acabaram de entrar no catálogo já podem ser ligados.
      const linkedAfter = promoted > 0 ? await linkUnlinkedItems() : 0;
      log(`${promoted} itens novos vindos das listas (aguardando revisão).`);
      const priceRanges = await refreshPriceStats();
      log(`${priceRanges} faixas de preço publicadas.`);
      const urgencies = options.urgency ? await precomputeUrgencies(options.urgencyLimit, log) : 0;
      await flushCatalogMetrics();
      return { skipped: false, linked: linked + linkedAfter, promoted, priceRanges, urgencies };
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
}

/** Agenda a rotina dentro do servidor. A primeira rodada sai alguns minutos depois de subir, fora do caminho do boot. */
export function startCatalogScheduler() {
  const run = () =>
    runCatalogRefresh({ log: message => console.log(`[catalog] ${message}`) }).catch(err =>
      console.error('[catalog] Rotina falhou:', err instanceof Error ? err.message : err)
    );
  setTimeout(run, 5 * 60_000).unref();
  setInterval(run, CATALOG_REFRESH_INTERVAL_MS).unref();
}
