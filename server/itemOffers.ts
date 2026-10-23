// Fase 11.5: o mesmo item em várias lojas. Cada oferta reaproveita o produto acompanhado (e a rotina de preços); a
// principal fica espelhada em items.tracked_product_id para os clientes e consultas que só conhecem um link por item.
import type { Request, Router } from 'express';
import { getPool, withTransaction, type Queryable } from './database.ts';
import { asyncHandler, HttpError, rateLimit } from './security.ts';
import { findOrCreateTrackedProduct, requireTrackableUrl } from './trackedProducts.ts';
import type { AuthUser, EnxovalItem } from '../src/types.ts';

export const MAX_OFFERS_PER_ITEM = 3;

/**
 * Deixa as ofertas coerentes com o produto principal do item: troca de link substitui a oferta principal antiga;
 * item sem produto acompanhado perde só a oferta principal (as outras lojas continuam salvas).
 */
export async function syncPrimaryOffer(queryable: Queryable, itemId: string) {
  const item = await queryable.query<{ tracked_product_id: string | null }>('SELECT tracked_product_id FROM items WHERE id = $1', [itemId]);
  const productId = item.rows[0]?.tracked_product_id ?? null;
  if (!productId) {
    await queryable.query('DELETE FROM item_offers WHERE item_id = $1 AND is_primary', [itemId]);
    return;
  }
  await queryable.query('DELETE FROM item_offers WHERE item_id = $1 AND is_primary AND tracked_product_id <> $2', [itemId, productId]);
  await queryable.query(`
    INSERT INTO item_offers (item_id, tracked_product_id, is_primary) VALUES ($1, $2, true)
    ON CONFLICT (item_id, tracked_product_id) DO UPDATE SET is_primary = true
  `, [itemId, productId]);
}

interface OfferDeps {
  requireUser: (req: Request) => Promise<AuthUser>;
  requireEnxovalMember: (queryable: Queryable, userId: string, enxovalId: string) => Promise<'owner' | 'editor'>;
  fetchItemRow: (queryable: Queryable, itemId: string, enxovalId: string) => Promise<EnxovalItem>;
}

/** Item do enxoval da pessoa, travado para a alteração das ofertas. */
async function lockItem(queryable: Queryable, deps: OfferDeps, userId: string, itemId: string) {
  const result = await queryable.query<{ enxoval_id: string; name: string; price_basis: 'regular' | 'pix' }>(`
    SELECT i.enxoval_id, i.name, i.price_basis
    FROM items i
    INNER JOIN enxoval_members em ON em.enxoval_id = i.enxoval_id AND em.user_id = $2
    WHERE i.id = $1
    FOR UPDATE OF i
  `, [itemId, userId]);
  const item = result.rows[0];
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  await deps.requireEnxovalMember(queryable, userId, item.enxoval_id);
  return item;
}

/**
 * Torna a oferta a principal: o item passa a acompanhar o produto dela, o link do item aponta para a loja e o preço
 * do item segue o último preço lido (quando há). O aviso de preço anterior deixa de valer.
 */
async function promote(queryable: Queryable, itemId: string, offerId: string, priceBasis: 'regular' | 'pix') {
  const offer = await queryable.query<{ tracked_product_id: string; url: string; current: number | null }>(`
    SELECT o.tracked_product_id, tp.url,
      CASE WHEN $3 = 'pix' THEN COALESCE(tp.pix_price_cents, tp.current_price_cents) ELSE tp.current_price_cents END AS current
    FROM item_offers o
    INNER JOIN tracked_products tp ON tp.id = o.tracked_product_id
    WHERE o.id = $1 AND o.item_id = $2
  `, [offerId, itemId, priceBasis]);
  const chosen = offer.rows[0];
  if (!chosen) throw new HttpError(404, 'Loja não encontrada neste item.');
  await queryable.query('UPDATE item_offers SET is_primary = false WHERE item_id = $1 AND is_primary AND id <> $2', [itemId, offerId]);
  await queryable.query('UPDATE item_offers SET is_primary = true WHERE id = $1', [offerId]);
  await queryable.query(`
    UPDATE items SET
      tracked_product_id = $2,
      link = $3,
      price_cents = COALESCE($4, price_cents),
      initial_price_cents = COALESCE(initial_price_cents, $4),
      -- O desconto não pode passar do novo preço.
      discount_cents = LEAST(discount_cents, COALESCE($4, price_cents, 0)),
      last_alert_price_cents = NULL,
      updated_at = now()
    WHERE id = $1
  `, [itemId, chosen.tracked_product_id, chosen.url, chosen.current === null ? null : Number(chosen.current)]);
}

export function registerItemOfferRoutes(router: Router, deps: OfferDeps) {
  // Adicionar outra loja: o formulário já leu o link (POST /products/extract), então o produto nasce com o preço.
  router.post('/items/:id/offers', rateLimit(60, 10 * 60_000), asyncHandler(async (req, res) => {
    const user = await deps.requireUser(req);
    const url = requireTrackableUrl(req.body?.url);
    const item = await withTransaction(async client => {
      const locked = await lockItem(client, deps, user.id, req.params.id);
      const count = await client.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM item_offers WHERE item_id = $1', [req.params.id]);
      const productId = await findOrCreateTrackedProduct(client, url, locked.name);
      const duplicate = await client.query('SELECT 1 FROM item_offers WHERE item_id = $1 AND tracked_product_id = $2', [req.params.id, productId]);
      if (duplicate.rowCount) throw new HttpError(409, 'Esta loja já está no item.');
      if (Number(count.rows[0]?.total ?? 0) >= MAX_OFFERS_PER_ITEM) throw new HttpError(400, `Cada item pode ter até ${MAX_OFFERS_PER_ITEM} lojas.`);
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO item_offers (item_id, tracked_product_id, is_primary) VALUES ($1, $2, false) RETURNING id',
        [req.params.id, productId]);
      // Primeira loja do item: vira a principal (o item passa a acompanhar o preço dela).
      const hasPrimary = await client.query('SELECT 1 FROM item_offers WHERE item_id = $1 AND is_primary', [req.params.id]);
      if (!hasPrimary.rowCount) await promote(client, req.params.id, inserted.rows[0].id, locked.price_basis);
      else await client.query('UPDATE items SET updated_at = now() WHERE id = $1', [req.params.id]);
      return deps.fetchItemRow(client, req.params.id, locked.enxoval_id);
    });
    res.status(201).json(item);
  }));

  router.patch('/items/:id/offers/:offerId', asyncHandler(async (req, res) => {
    const user = await deps.requireUser(req);
    if (req.body?.isPrimary !== true) throw new HttpError(400, 'Envie isPrimary: true para tornar esta loja a principal.');
    const item = await withTransaction(async client => {
      const locked = await lockItem(client, deps, user.id, req.params.id);
      await promote(client, req.params.id, req.params.offerId, locked.price_basis);
      return deps.fetchItemRow(client, req.params.id, locked.enxoval_id);
    });
    res.json(item);
  }));

  router.delete('/items/:id/offers/:offerId', asyncHandler(async (req, res) => {
    const user = await deps.requireUser(req);
    const item = await withTransaction(async client => {
      const locked = await lockItem(client, deps, user.id, req.params.id);
      const removed = await client.query<{ is_primary: boolean }>(
        'DELETE FROM item_offers WHERE id = $1 AND item_id = $2 RETURNING is_primary', [req.params.offerId, req.params.id]);
      if (!removed.rows[0]) throw new HttpError(404, 'Loja não encontrada neste item.');
      // Sem a principal, o item deixa de acompanhar um preço até outra loja ser escolhida.
      if (removed.rows[0].is_primary) {
        await client.query('UPDATE items SET tracked_product_id = NULL, last_alert_price_cents = NULL, updated_at = now() WHERE id = $1', [req.params.id]);
      } else {
        await client.query('UPDATE items SET updated_at = now() WHERE id = $1', [req.params.id]);
      }
      return deps.fetchItemRow(client, req.params.id, locked.enxoval_id);
    });
    res.json(item);
  }));
}

/** Pontos do histórico de cada loja não principal do item, para o gráfico mostrar uma linha por loja. */
export async function offerHistories(itemId: string, days: number, priceBasis: 'regular' | 'pix') {
  const result = await getPool().query<{ offer_id: string; domain: string; url: string; captured_at: Date; price: number | null }>(`
    SELECT o.id AS offer_id, tp.domain, tp.url, s.captured_at,
      CASE WHEN $3 = 'pix' THEN s.pix_price_cents ELSE s.price_cents END AS price
    FROM item_offers o
    INNER JOIN tracked_products tp ON tp.id = o.tracked_product_id
    INNER JOIN product_price_snapshots s ON s.tracked_product_id = o.tracked_product_id
    WHERE o.item_id = $1 AND NOT o.is_primary AND s.captured_at >= now() - ($2::int * interval '1 day')
    ORDER BY o.created_at ASC, s.captured_at ASC
  `, [itemId, days, priceBasis]);
  const series = new Map<string, { domain: string; url: string; points: { date: string; priceCents: number }[] }>();
  for (const row of result.rows) {
    if (row.price === null) continue;
    const entry = series.get(row.offer_id) ?? { domain: row.domain, url: row.url, points: [] };
    entry.points.push({ date: row.captured_at.toISOString(), priceCents: Number(row.price) });
    series.set(row.offer_id, entry);
  }
  return [...series.values()];
}
