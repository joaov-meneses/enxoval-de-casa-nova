// Rotina do catálogo mestre. Roda sozinha a cada 6 horas dentro do servidor (ver `startCatalogScheduler`) ou sob
// demanda: npm run catalog:refresh. Nomes de preços diferentes são validados pelo Jev, com cache no banco.
// O pré-cálculo adicional das urgências só roda quando pedido: npm run catalog:refresh -- --urgency [--limit 600].
import { getPool } from '../database.ts';
import { refreshNationalPriceStats } from '../catalog/pricing.ts';
import { logger } from '../logger.ts';
import { registerJob, trackJob } from '../jobMonitor.ts';
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

/** Amostra mínima de enxovais para promover um nome novo; preços usam priceMinCustomers(). */
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
 * Faixa nacional: ofertas comparáveis recentes, ou preços de pelo menos dois clientes distintos.
 * O Jev só valida nomes; a média e os percentis são calculados a partir dos valores observados.
 */
export async function refreshPriceStats() {
  return refreshNationalPriceStats();
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
  const log = options.log ?? (message => logger.info({ event: 'catalog.refresh.progress' }, message));
  logger.info({ event: 'catalog.refresh.started', urgency: options.urgency, urgencyLimit: options.urgencyLimit }, 'Catalog refresh started.');
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
  registerJob('catalog_refresh', CATALOG_REFRESH_INTERVAL_MS);
  const run = () =>
    trackJob('catalog_refresh', () => runCatalogRefresh(), summary => summary.skipped)
      .then(summary => logger.info({ event: 'catalog.refresh.completed', ...summary }, 'Rotina do catálogo concluída.'))
      .catch(err => logger.error({ event: 'catalog.refresh.failed', err }, 'Rotina do catálogo falhou.'));
  setTimeout(run, 5 * 60_000).unref();
  setInterval(run, CATALOG_REFRESH_INTERVAL_MS).unref();
}
