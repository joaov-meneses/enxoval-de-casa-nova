import { randomUUID } from 'node:crypto';
import type { Request, Router } from 'express';
import { getPool, withTransaction, type Queryable } from './database.ts';
import { asyncHandler, HttpError, rateLimit } from './security.ts';
import { effectivePlanSql } from './freemium.ts';
import { parseHousewarmingPix, housewarmingPixPayload } from './housewarmingPix.ts';
import type { AuthUser } from '../src/types.ts';
import type { HousewarmingEntry, HousewarmingSettings } from '../src/housewarming.ts';
import { streamHousewarming } from './housewarmingEvents.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new HttpError(400, 'Identificador inválido.');
  return value.toLowerCase();
}
function text(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new HttpError(400, `${label} inválido.`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new HttpError(400, `${label}: use de ${min} a ${max} caracteres.`);
  return result;
}
export function parseHousewarmingSettings(body: unknown): HousewarmingSettings {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Confira os dados do Chá.');
  const data = body as Record<string, unknown>;
  const slug = text(data.slug, 3, 80, 'Endereço');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, 'Use letras minúsculas, números e hífens no endereço.');
  if (typeof data.isPublic !== 'boolean') throw new HttpError(400, 'Escolha se a página está publicada.');
  if (!Array.isArray(data.itemIds) || data.itemIds.length > 500) throw new HttpError(400, 'Escolha até 500 itens para o Chá.');
  const itemIds = data.itemIds.map(uuid);
  if (new Set(itemIds).size !== itemIds.length) throw new HttpError(400, 'A seleção tem itens repetidos.');
  const eventDate = data.eventDate;
  if (eventDate !== null && (typeof eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    || !Number.isFinite(Date.parse(`${eventDate}T12:00:00Z`)) || new Date(`${eventDate}T12:00:00Z`).toISOString().slice(0, 10) !== eventDate))
    throw new HttpError(400, 'Informe uma data válida para o Chá.');
  const pix = parseHousewarmingPix(data.pix);
  if (data.isPublic && !itemIds.length && !pix) throw new HttpError(400, 'Escolha algum item ou cadastre o Pix antes de publicar.');
  return { slug, title: text(data.title, 3, 120, 'Título'), message: text(data.message, 0, 1000, 'Mensagem'),
    eventDate: eventDate as string | null, isPublic: data.isPublic, itemIds, pix };
}

interface ListRow {
  id: string; enxoval_id: string; slug: string; title: string; message: string; event_date: string | null; is_public: boolean;
  pix_key: string | null; pix_key_type: 'cpf' | 'email' | 'phone' | 'random' | null;
  pix_receiver_name: string | null; pix_city: string | null;
}
const columns = `l.id, l.enxoval_id, l.slug, l.title, l.message, l.event_date::text, l.is_public,
  l.pix_key, l.pix_key_type, l.pix_receiver_name, l.pix_city`;
const pixOf = (row: ListRow) => row.pix_key ? { key: row.pix_key, keyType: row.pix_key_type!, receiverName: row.pix_receiver_name!, city: row.pix_city! } : null;

async function publicList(db: Queryable, slug: string, lock = false) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 80) throw new HttpError(404, 'Este Chá não está disponível.');
  const result = await db.query<ListRow>(`
    SELECT ${columns} FROM housewarming_lists l
    JOIN enxovais e ON e.id = l.enxoval_id JOIN users u ON u.id = e.owner_id
    WHERE l.slug = $1 AND l.is_public AND u.is_active AND ${effectivePlanSql('u')} <> 'free'
      AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.target_type = 'user' AND b.target_value = u.id::text
        AND b.scope = 'block_all' AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now()))
    ${lock ? 'FOR UPDATE OF l' : ''}
  `, [slug]);
  if (!result.rows[0]) throw new HttpError(404, 'Este Chá não está disponível.');
  return result.rows[0];
}

const inboxSql = `
  SELECT r.id, 'reservation'::text AS kind, r.guest_name AS name, r.guest_email AS email, r.message,
    r.item_id AS "itemId", i.name AS "itemName", i.status AS "itemStatus", r.cancelled_at AS "cancelledAt",
    r.created_at AS "createdAt", r.read_at AS "readAt"
  FROM housewarming_reservations r JOIN items i ON i.id = r.item_id WHERE r.list_id = $1
  UNION ALL
  SELECT m.id, 'message'::text, m.guest_name, NULL, m.message, NULL::uuid, NULL, NULL, NULL::timestamptz,
    m.created_at, m.read_at FROM housewarming_messages m WHERE m.list_id = $1`;

async function management(db: Queryable, enxovalId: string) {
  const row = (await db.query<ListRow>(`SELECT ${columns} FROM housewarming_lists l WHERE l.enxoval_id = $1`, [enxovalId])).rows[0];
  if (!row) return { list: null, itemIds: [], inbox: [], unreadCount: 0 };
  const selected = await db.query<{ item_id: string }>('SELECT item_id FROM housewarming_items WHERE list_id = $1 ORDER BY item_id', [row.id]);
  const inbox = await db.query<HousewarmingEntry>(`SELECT * FROM (${inboxSql}) entries
    ORDER BY ("readAt" IS NULL AND "cancelledAt" IS NULL) DESC, "createdAt" DESC, id DESC LIMIT 100`, [row.id]);
  const unread = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM (${inboxSql}) entries WHERE "readAt" IS NULL AND "cancelledAt" IS NULL`, [row.id]);
  return { list: { id: row.id, slug: row.slug, title: row.title, message: row.message, eventDate: row.event_date,
    isPublic: row.is_public, pix: pixOf(row) }, itemIds: selected.rows.map(item => item.item_id), inbox: inbox.rows, unreadCount: unread.rows[0].total };
}

function guestInput(body: Record<string, unknown>, reservation: boolean) {
  const requestId = uuid(body.requestId);
  const name = text(body.name, 2, 120, 'Nome');
  const message = text(body.message ?? '', reservation ? 0 : 1, 500, 'Recado');
  let email = '';
  if (reservation) {
    email = text(body.email, 3, 254, 'E-mail').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Confira seu e-mail.');
  }
  return { requestId, name, message, email };
}
function publicConflict(error: unknown): never {
  if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'Este presente ou pedido já foi registrado. Atualize a página para conferir.');
  throw error;
}

/** Register before the authenticated API gate. Origin checks, bans and no-store still apply. */
export function registerPublicHousewarmingRoutes(router: Router) {
  // Validate new workspace paths before the existing global access middleware casts their IDs to uuid.
  router.use('/enxovais/:id/housewarming', (req, _res, next) => { uuid(req.params.id); next(); });
  router.use('/public/housewarming', rateLimit(240, 10 * 60_000));
  router.get('/public/housewarming/:slug/events', asyncHandler(async (req, res) => {
    const list = await publicList(getPool(), req.params.slug);
    await streamHousewarming(req, res, list.enxoval_id);
  }));
  router.get('/public/housewarming/:slug', asyncHandler(async (req, res) => {
    // A repeatable-read snapshot keeps publication and the selected items consistent.
    const result = await withTransaction(async db => {
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const row = await publicList(db, req.params.slug);
      const items = await db.query<{ id: string; name: string; category: string; availability: string }>(`
        SELECT i.id, i.name, c.name AS category,
          CASE WHEN i.status <> 'researching' THEN 'gifted'
            WHEN EXISTS (SELECT 1 FROM housewarming_reservations r WHERE r.item_id = i.id AND r.cancelled_at IS NULL) THEN 'reserved'
            ELSE 'available' END AS availability
        FROM housewarming_items h JOIN items i ON i.id = h.item_id JOIN categories c ON c.id = i.category_id
        WHERE h.list_id = $1 AND i.enxoval_id = $2 ORDER BY c.sort_order, i.sort_order, i.created_at
      `, [row.id, row.enxoval_id]);
      const pix = pixOf(row);
      return { slug: row.slug, title: row.title, message: row.message, eventDate: row.event_date,
        pix: pix ? { key: pix.key, receiverName: pix.receiverName, payload: housewarmingPixPayload(pix) } : null, items: items.rows };
    });
    res.set('X-Robots-Tag', 'noindex, nofollow').json(result);
  }));

  const writeLimit = rateLimit(12, 10 * 60_000, 'Você já enviou vários recados ou reservas. Aguarde alguns minutos para continuar.');
  router.post('/public/housewarming/:slug/reservations', writeLimit, asyncHandler(async (req, res) => {
    const input = guestInput(req.body ?? {}, true);
    const itemId = uuid(req.body?.itemId);
    const result = await withTransaction(async db => {
      const list = await publicList(db, req.params.slug, true);
      const replay = (await db.query('SELECT * FROM housewarming_reservations WHERE id = $1', [input.requestId])).rows[0];
      if (replay) {
        if (replay.list_id !== list.id || replay.item_id !== itemId || replay.guest_name !== input.name || replay.guest_email !== input.email
          || replay.message !== input.message || replay.cancelled_at) throw new HttpError(409, 'Este pedido já foi usado. Atualize a página antes de tentar de novo.');
        return { id: replay.id as string, replay: true };
      }
      const item = (await db.query<{ status: string }>(`
        SELECT i.status FROM items i JOIN housewarming_items h ON h.item_id = i.id
        WHERE i.id = $1 AND h.list_id = $2 AND i.enxoval_id = $3 FOR UPDATE OF i
      `, [itemId, list.id, list.enxoval_id])).rows[0];
      if (!item) throw new HttpError(400, 'Este item não está nesta lista.');
      const reserved = await db.query('SELECT 1 FROM housewarming_reservations WHERE item_id = $1 AND cancelled_at IS NULL', [itemId]);
      if (item.status !== 'researching' || reserved.rowCount) throw new HttpError(409, 'Este item já foi escolhido. Que tal outro presente?');
      await db.query(`INSERT INTO housewarming_reservations (id, list_id, item_id, guest_name, guest_email, message)
        VALUES ($1, $2, $3, $4, $5, $6)`, [input.requestId, list.id, itemId, input.name, input.email, input.message]);
      await db.query(`UPDATE items SET gift_reservation_id = $2, gift_from = $3, gift_message = $4, updated_at = now() WHERE id = $1`,
        [itemId, input.requestId, input.name, input.message || null]);
      return { id: input.requestId, replay: false };
    }).catch(publicConflict);
    res.status(result.replay ? 200 : 201).json({ id: result.id });
  }));

  router.post('/public/housewarming/:slug/messages', writeLimit, asyncHandler(async (req, res) => {
    const input = guestInput(req.body ?? {}, false);
    const replay = await withTransaction(async db => {
      const list = await publicList(db, req.params.slug, true);
      const existing = (await db.query('SELECT * FROM housewarming_messages WHERE id = $1', [input.requestId])).rows[0];
      if (existing) {
        if (existing.list_id !== list.id || existing.guest_name !== input.name || existing.message !== input.message) throw new HttpError(409, 'Este pedido já foi usado. Atualize a página antes de tentar de novo.');
        return true;
      }
      await db.query('INSERT INTO housewarming_messages (id, list_id, guest_name, message) VALUES ($1, $2, $3, $4)',
        [input.requestId, list.id, input.name, input.message]);
      return false;
    }).catch(publicConflict);
    res.status(replay ? 200 : 201).json({ id: input.requestId });
  }));
}

interface Deps {
  requireUser: (req: Request) => Promise<AuthUser>;
  requireEnxovalMember: (db: Queryable, userId: string, enxovalId: string) => Promise<'owner' | 'editor'>;
}
export function registerHousewarmingRoutes(router: Router, deps: Deps) {
  async function authorize(req: Request, db: Queryable, owner = false) {
    const id = uuid(req.params.id);
    const user = await deps.requireUser(req);
    const role = await deps.requireEnxovalMember(db, user.id, id);
    if (owner && role !== 'owner') throw new HttpError(403, 'Só quem criou o enxoval pode configurar o Chá e liberar reservas.');
    return { id, user };
  }
  router.get('/enxovais/:id/housewarming', asyncHandler(async (req, res) => {
    const { id } = await authorize(req, getPool());
    res.json(await management(getPool(), id));
  }));
  router.get('/enxovais/:id/housewarming/events', asyncHandler(async (req, res) => {
    const { id } = await authorize(req, getPool());
    await streamHousewarming(req, res, id);
  }));
  router.put('/enxovais/:id/housewarming', asyncHandler(async (req, res) => {
    const input = parseHousewarmingSettings(req.body);
    try {
      const result = await withTransaction(async db => {
        const { id, user } = await authorize(req, db, true);
        await db.query('SELECT id FROM enxovais WHERE id = $1 FOR UPDATE', [id]);
        const valid = await db.query('SELECT id FROM items WHERE enxoval_id = $1 AND id = ANY($2::uuid[])', [id, input.itemIds]);
        if (valid.rowCount !== input.itemIds.length) throw new HttpError(400, 'Escolha apenas itens deste enxoval.');
        // Item conquistado não entra no convite; os que já estavam (presenteados pelo Chá) podem continuar.
        const conquered = await db.query(`
          SELECT i.id FROM items i
          WHERE i.id = ANY($2::uuid[]) AND i.status <> 'researching' AND NOT EXISTS (
            SELECT 1 FROM housewarming_items h JOIN housewarming_lists l ON l.id = h.list_id WHERE l.enxoval_id = $1 AND h.item_id = i.id)
        `, [id, input.itemIds]);
        if (conquered.rowCount) throw new HttpError(400, 'Escolha só itens que ainda estão na fila. Os já conquistados não entram no convite.');
        const saved = await db.query<{ id: string }>(`
          INSERT INTO housewarming_lists (id, enxoval_id, user_id, slug, title, message, event_date, is_public, pix_key, pix_key_type, pix_receiver_name, pix_city)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (enxoval_id) DO UPDATE SET slug = EXCLUDED.slug, title = EXCLUDED.title, message = EXCLUDED.message,
            event_date = EXCLUDED.event_date, is_public = EXCLUDED.is_public, pix_key = EXCLUDED.pix_key,
            pix_key_type = EXCLUDED.pix_key_type, pix_receiver_name = EXCLUDED.pix_receiver_name, pix_city = EXCLUDED.pix_city, updated_at = now()
          RETURNING id
        `, [randomUUID(), id, user.id, input.slug, input.title, input.message, input.eventDate, input.isPublic,
          input.pix?.key ?? null, input.pix?.keyType ?? null, input.pix?.receiverName ?? null, input.pix?.city ?? null]);
        const listId = saved.rows[0].id;
        await db.query('DELETE FROM housewarming_items WHERE list_id = $1', [listId]);
        await db.query('INSERT INTO housewarming_items (list_id, item_id) SELECT $1, unnest($2::uuid[])', [listId, input.itemIds]);
        return management(db, id);
      });
      res.json(result);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'Este endereço já tem um Chá. Escolha outro nome para o link.');
      throw error;
    }
  }));
  router.get('/enxovais/:id/housewarming/notifications', asyncHandler(async (req, res) => {
    const { id } = await authorize(req, getPool());
    const data = await management(getPool(), id);
    res.json({ unreadCount: data.unreadCount, latest: data.inbox.find(entry => !entry.readAt && !entry.cancelledAt) ?? null });
  }));
  router.post('/enxovais/:id/housewarming/read', asyncHandler(async (req, res) => {
    if (!Array.isArray(req.body?.ids) || req.body.ids.length > 100) throw new HttpError(400, 'Selecione até 100 novidades.');
    const ids = req.body.ids.map(uuid);
    await withTransaction(async db => {
      const { id } = await authorize(req, db);
      for (const table of ['housewarming_reservations', 'housewarming_messages']) {
        await db.query(`UPDATE ${table} SET read_at = now() WHERE read_at IS NULL AND id = ANY($1::uuid[])
          AND list_id IN (SELECT id FROM housewarming_lists WHERE enxoval_id = $2)`, [ids, id]);
      }
    });
    res.status(204).end();
  }));
  router.delete('/enxovais/:id/housewarming/reservations/:reservationId', asyncHandler(async (req, res) => {
    const reservationId = uuid(req.params.reservationId);
    await withTransaction(async db => {
      const { id } = await authorize(req, db, true);
      const list = (await db.query<{ id: string }>('SELECT id FROM housewarming_lists WHERE enxoval_id = $1 FOR UPDATE', [id])).rows[0];
      const reservation = list && (await db.query('SELECT * FROM housewarming_reservations WHERE id = $1 AND list_id = $2', [reservationId, list.id])).rows[0];
      if (!reservation) throw new HttpError(404, 'Reserva não encontrada.');
      if (reservation.cancelled_at) return;
      const item = (await db.query('SELECT status FROM items WHERE id = $1 FOR UPDATE', [reservation.item_id])).rows[0];
      if (item?.status !== 'researching') throw new HttpError(409, 'Este item já foi conquistado. Volte para Pesquisando antes de liberar a reserva.');
      await db.query('UPDATE housewarming_reservations SET cancelled_at = now(), read_at = COALESCE(read_at, now()) WHERE id = $1', [reservationId]);
      await db.query(`UPDATE items SET gift_reservation_id = NULL,
        gift_from = CASE WHEN gift_from = $3 THEN NULL ELSE gift_from END,
        gift_message = CASE WHEN gift_message = NULLIF($4, '') THEN NULL ELSE gift_message END, updated_at = now()
        WHERE id = $1 AND gift_reservation_id = $2`, [reservation.item_id, reservationId, reservation.guest_name, reservation.message]);
    });
    res.status(204).end();
  }));
}
