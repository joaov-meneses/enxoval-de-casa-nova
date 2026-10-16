// Rotas do catálogo mestre: busca instantânea para o app e, no /admin, a fila de revisão, a mesclagem de duplicados e
// as métricas de quanto o catálogo poupa o Jev.
import type { Request, Router } from 'express';
import { getPool, withTransaction } from '../database.ts';
import { asyncHandler, HttpError, rateLimit } from '../security.ts';
import { requireAdmin } from '../admin.ts';
import { itemKey } from '../../src/catalog/normalize.ts';
import { URGENCY_RUBRIC_VERSION } from '../../src/planning/purchaseUrgency.ts';
import type { AuthUser } from '../../src/types.ts';
import { CATALOG_ROOM_LABELS } from '../services/jev.ts';
import {
  CATALOG_ITEM_COLUMNS,
  flushCatalogMetrics,
  invalidateCatalogIndex,
  mapCatalogItem,
  searchCatalog,
  type CatalogItem
} from './store.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UFS = /^[A-Z]{2}$/;
const MAX_NAME_LENGTH = 120;

function catalogId(value: unknown) {
  const id = String(value ?? '');
  if (!UUID.test(id)) throw new HttpError(404, 'Item do catálogo não encontrado.');
  return id;
}

interface AdminCatalogRow {
  id: string;
  slug: string;
  canonical_name: string;
  normalized_name: string;
  room: CatalogItem['room'];
  priority: CatalogItem['priority'];
  timing: CatalogItem['timing'];
  lead_time_weeks: number;
  price_category: number | null;
  function_group: string | null;
  source: CatalogItem['source'];
  status: CatalogItem['status'];
  created_at: Date;
  aliases: { alias: string; key: string; source: string }[] | null;
  usage: number;
}

async function fetchAdminItems(where: string, params: unknown[], limit: number) {
  const result = await getPool().query<AdminCatalogRow>(
    `SELECT ${CATALOG_ITEM_COLUMNS.split(',').map(column => `ci.${column.trim()}`).join(', ')}, ci.created_at,
       (SELECT json_agg(json_build_object('alias', a.alias, 'key', a.alias_normalized, 'source', a.source) ORDER BY a.alias)
        FROM catalog_item_aliases a WHERE a.item_id = ci.id) AS aliases,
       (SELECT COUNT(*)::int FROM items i WHERE i.catalog_item_id = ci.id) AS usage
     FROM catalog_items ci
     ${where}
     ORDER BY ci.created_at DESC, ci.canonical_name
     LIMIT ${limit}`,
    params
  );
  return result.rows.map(row => ({
    ...mapCatalogItem(row),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    aliases: row.aliases ?? [],
    usage: row.usage
  }));
}

function parseEdits(body: Record<string, unknown>) {
  const edits: Record<string, unknown> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  if (has('name')) {
    const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > MAX_NAME_LENGTH || !itemKey(name)) throw new HttpError(400, 'Nome inválido.');
    edits.canonical_name = name;
    edits.normalized_name = itemKey(name);
  }
  if (has('room')) {
    if (body.room !== null && !(typeof body.room === 'string' && body.room in CATALOG_ROOM_LABELS)) throw new HttpError(400, 'Cômodo inválido.');
    edits.room = body.room;
  }
  if (has('priority')) {
    if (body.priority !== 'essential' && body.priority !== 'optional') throw new HttpError(400, 'Prioridade inválida.');
    edits.priority = body.priority;
  }
  if (has('timing')) {
    if (body.timing !== null && body.timing !== 'first_night' && body.timing !== 'first_week') throw new HttpError(400, 'Momento inválido.');
    edits.timing = body.timing;
  }
  if (has('leadTimeWeeks')) {
    if (!Number.isInteger(body.leadTimeWeeks) || (body.leadTimeWeeks as number) < 0 || (body.leadTimeWeeks as number) > 26) throw new HttpError(400, 'Prazo inválido.');
    edits.lead_time_weeks = body.leadTimeWeeks;
  }
  if (has('priceCategory')) {
    if (body.priceCategory !== null && ![1, 2, 3, 4].includes(body.priceCategory as number)) throw new HttpError(400, 'Faixa de preço inválida.');
    edits.price_category = body.priceCategory;
  }
  if (has('functionGroup')) {
    const group = typeof body.functionGroup === 'string' ? body.functionGroup.trim().toLowerCase() : null;
    if (group !== null && !/^[a-z0-9-]{2,60}$/.test(group)) throw new HttpError(400, 'Grupo de função inválido (use letras, números e hífen).');
    edits.function_group = group || null;
  }
  if (has('status')) {
    if (body.status !== 'approved' && body.status !== 'pending_review') throw new HttpError(400, 'Status inválido.');
    edits.status = body.status;
  }
  return edits;
}

export function registerCatalogRoutes(router: Router, deps: { requireUser: (req: Request) => Promise<AuthUser> }) {
  // Autocomplete do formulário de item: roda a cada tecla (com espera curta no app), sem Jev e sem rede externa.
  router.get('/catalog/search', rateLimit(240, 10 * 60_000, 'Muitas buscas seguidas. Aguarde um instante.'), asyncHandler(async (req, res) => {
    await deps.requireUser(req);
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
    const region = typeof req.query.uf === 'string' && UFS.test(req.query.uf) ? req.query.uf : null;
    const limit = Number(req.query.limit);
    res.json({ results: await searchCatalog(query, { limit: Number.isInteger(limit) ? limit : 8, region }) });
  }));

  /* ----------------------------------------------------------------- admin */

  router.get('/admin/catalog/overview', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    await flushCatalogMetrics();
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 180);
    const [metrics, counts, active, gaps] = await Promise.all([
      getPool().query<{ day: string; metric: string; count: number }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, metric, count FROM catalog_metrics_daily
         WHERE day > current_date - $1::int ORDER BY day`,
        [days]
      ),
      getPool().query<{ status: string; source: string; total: number }>(
        'SELECT status, source, COUNT(*)::int AS total FROM catalog_items GROUP BY status, source'
      ),
      getPool().query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM users WHERE last_login_at > now() - make_interval(days => $1)`,
        [days]
      ),
      getPool().query<{ unlinked: number; linked: number; without_urgency: number; aliases: number; price_ranges: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM items WHERE catalog_item_id IS NULL AND status NOT IN ('not_needed', 'discarded')) AS unlinked,
           (SELECT COUNT(*)::int FROM items WHERE catalog_item_id IS NOT NULL AND status NOT IN ('not_needed', 'discarded')) AS linked,
           (SELECT COUNT(*)::int FROM catalog_items ci WHERE NOT EXISTS (
              SELECT 1 FROM catalog_item_urgency u WHERE u.item_id = ci.id AND u.rubric_version = $1)) AS without_urgency,
           (SELECT COUNT(*)::int FROM catalog_item_aliases) AS aliases,
           (SELECT COUNT(DISTINCT item_id)::int FROM catalog_price_stats) AS price_ranges`,
        [URGENCY_RUBRIC_VERSION]
      )
    ]);
    const totals: Record<string, number> = {};
    for (const row of metrics.rows) totals[row.metric] = (totals[row.metric] ?? 0) + row.count;
    const hits = (totals.resolve_exact ?? 0) + (totals.resolve_similar ?? 0) + (totals.assess_catalog ?? 0);
    const lookups = hits + (totals.resolve_pending ?? 0) + (totals.assess_jev ?? 0);
    const urgencyHits = totals.urgency_catalog ?? 0;
    const urgencyLookups = urgencyHits + (totals.urgency_jev ?? 0);
    const activeUsers = active.rows[0]?.total ?? 0;
    res.json({
      days,
      daily: metrics.rows,
      totals,
      hitRate: lookups > 0 ? hits / lookups : null,
      urgencyHitRate: urgencyLookups > 0 ? urgencyHits / urgencyLookups : null,
      jevCalls: totals.jev_calls ?? 0,
      activeUsers,
      jevCallsPerActiveUser: activeUsers > 0 ? (totals.jev_calls ?? 0) / activeUsers : null,
      catalog: counts.rows,
      gaps: gaps.rows[0]
    });
  }));

  router.get('/admin/catalog/items', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const status = req.query.status === 'approved' || req.query.status === 'pending_review' ? req.query.status : null;
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (status) {
      params.push(status);
      conditions.push(`ci.status = $${params.length}`);
    }
    if (query) {
      params.push(`%${itemKey(query) || query.toLowerCase()}%`);
      conditions.push(`(ci.normalized_name LIKE $${params.length} OR EXISTS (
        SELECT 1 FROM catalog_item_aliases a WHERE a.item_id = ci.id AND a.alias_normalized LIKE $${params.length}))`);
    }
    const items = await fetchAdminItems(conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params, query ? 50 : 100);
    res.json({ items });
  }));

  router.patch('/admin/catalog/items/:id', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const id = catalogId(req.params.id);
    const edits = parseEdits((req.body ?? {}) as Record<string, unknown>);
    const columns = Object.keys(edits);
    if (columns.length === 0) throw new HttpError(400, 'Nenhuma alteração enviada.');
    await withTransaction(async client => {
      if (edits.normalized_name) {
        const taken = await client.query(
          `SELECT 1 FROM catalog_items WHERE normalized_name = $1 AND id <> $2
           UNION SELECT 1 FROM catalog_item_aliases WHERE alias_normalized = $1 AND item_id <> $2`,
          [edits.normalized_name, id]
        );
        if (taken.rowCount) throw new HttpError(409, 'Já existe um item com esse nome. Use "Mesclar" para juntar os dois.');
        // O nome antigo continua valendo como apelido, para os itens que já foram cadastrados assim.
        await client.query(
          `INSERT INTO catalog_item_aliases (alias_normalized, item_id, alias, source)
           SELECT normalized_name, id, canonical_name, 'admin' FROM catalog_items WHERE id = $1 AND normalized_name <> $2
           ON CONFLICT (alias_normalized) DO NOTHING`,
          [id, edits.normalized_name]
        );
        await client.query('DELETE FROM catalog_item_aliases WHERE alias_normalized = $1', [edits.normalized_name]);
      }
      const values = columns.map(column => edits[column]);
      const result = await client.query(
        `UPDATE catalog_items SET ${columns.map((column, index) => `${column} = $${index + 2}`).join(', ')}, updated_at = now()
         WHERE id = $1`,
        [id, ...values]
      );
      if (!result.rowCount) throw new HttpError(404, 'Item do catálogo não encontrado.');
      // Mudou o que define a urgência: as notas guardadas para este item deixam de valer.
      if (edits.normalized_name || 'room' in edits) await client.query('DELETE FROM catalog_item_urgency WHERE item_id = $1', [id]);
    });
    invalidateCatalogIndex();
    const [item] = await fetchAdminItems('WHERE ci.id = $1', [id], 1);
    res.json(item);
  }));

  // Junta um item (duplicado) em outro: apelidos, vínculos com enxovais e o próprio nome passam para o destino.
  router.post('/admin/catalog/items/:id/merge', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const sourceId = catalogId(req.params.id);
    const targetId = catalogId(req.body?.targetId);
    if (sourceId === targetId) throw new HttpError(400, 'Escolha outro item para mesclar.');
    await withTransaction(async client => {
      const both = await client.query('SELECT id FROM catalog_items WHERE id = ANY($1::uuid[]) FOR UPDATE', [[sourceId, targetId]]);
      if (both.rowCount !== 2) throw new HttpError(404, 'Item do catálogo não encontrado.');
      await client.query('UPDATE catalog_item_aliases SET item_id = $2 WHERE item_id = $1', [sourceId, targetId]);
      await client.query('UPDATE items SET catalog_item_id = $2 WHERE catalog_item_id = $1', [sourceId, targetId]);
      const source = await client.query<{ normalized_name: string; canonical_name: string }>(
        'DELETE FROM catalog_items WHERE id = $1 RETURNING normalized_name, canonical_name',
        [sourceId]
      );
      await client.query(
        `INSERT INTO catalog_item_aliases (alias_normalized, item_id, alias, source) VALUES ($1, $2, $3, 'admin')
         ON CONFLICT (alias_normalized) DO UPDATE SET item_id = EXCLUDED.item_id, source = 'admin'`,
        [source.rows[0].normalized_name, targetId, source.rows[0].canonical_name]
      );
    });
    invalidateCatalogIndex();
    const [item] = await fetchAdminItems('WHERE ci.id = $1', [targetId], 1);
    res.json(item);
  }));

  // Recusa um item (por exemplo, algo que o Jev criou e não é um item de casa). Os itens dos enxovais continuam, só
  // perdem o vínculo.
  router.delete('/admin/catalog/items/:id', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const result = await getPool().query('DELETE FROM catalog_items WHERE id = $1', [catalogId(req.params.id)]);
    if (!result.rowCount) throw new HttpError(404, 'Item do catálogo não encontrado.');
    invalidateCatalogIndex();
    res.status(204).end();
  }));

  router.post('/admin/catalog/items/:id/aliases', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const id = catalogId(req.params.id);
    const alias = typeof req.body?.alias === 'string' ? req.body.alias.replace(/\s+/g, ' ').trim() : '';
    const key = itemKey(alias);
    if (!key || alias.length > MAX_NAME_LENGTH) throw new HttpError(400, 'Apelido inválido.');
    const taken = await getPool().query(
      'SELECT 1 FROM catalog_items WHERE normalized_name = $1 UNION SELECT 1 FROM catalog_item_aliases WHERE alias_normalized = $1',
      [key]
    );
    if (taken.rowCount) throw new HttpError(409, 'Esse nome já aponta para um item do catálogo.');
    const result = await getPool().query(
      `INSERT INTO catalog_item_aliases (alias_normalized, item_id, alias, source)
       SELECT $1, id, $2, 'admin' FROM catalog_items WHERE id = $3`,
      [key, alias, id]
    );
    if (!result.rowCount) throw new HttpError(404, 'Item do catálogo não encontrado.');
    invalidateCatalogIndex();
    const [item] = await fetchAdminItems('WHERE ci.id = $1', [id], 1);
    res.status(201).json(item);
  }));

  // Desfaz um apelido (por exemplo, uma junção errada da deduplicação). Os itens já ligados a ele são desligados,
  // e voltam para a cascata na próxima rodada da rotina do catálogo.
  router.delete('/admin/catalog/aliases/:key', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const key = String(req.params.key ?? '').slice(0, 200);
    await withTransaction(async client => {
      const removed = await client.query<{ item_id: string }>('DELETE FROM catalog_item_aliases WHERE alias_normalized = $1 RETURNING item_id', [key]);
      if (!removed.rowCount) throw new HttpError(404, 'Apelido não encontrado.');
      const linked = await client.query<{ id: string; name: string }>('SELECT id, name FROM items WHERE catalog_item_id = $1', [removed.rows[0].item_id]);
      const unlink = linked.rows.filter(item => itemKey(item.name) === key).map(item => item.id);
      if (unlink.length > 0) await client.query('UPDATE items SET catalog_item_id = NULL WHERE id = ANY($1::uuid[])', [unlink]);
    });
    invalidateCatalogIndex();
    res.status(204).end();
  }));
}
