import { randomBytes, randomUUID, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express, { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { CATEGORIES, DEFAULT_ITEM_TEMPLATES } from '../src/data.ts';
import type { AuthUser, BootstrapData, EnxovalCategory, EnxovalItem } from '../src/types.ts';
import { getPool, Queryable } from './database.ts';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'enxoval_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

interface DbUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
}

interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

interface ItemRow {
  id: string;
  name: string;
  category_id: string;
  category: string;
  checked: boolean;
  link: string;
  description: string;
  sort_order: number;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${fieldName} é obrigatório.`);
  }

  return value.trim();
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [scheme, salt, storedHash] = passwordHash.split(':');
  if (scheme !== 'scrypt' || !salt || !storedHash) return false;

  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  const storedKey = Buffer.from(storedHash, 'hex');

  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function getCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return '';

  const cookies = header.split(';').map(cookie => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find(cookie => cookie.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
    path: '/'
  };
}

function mapUser(row: Pick<DbUserRow, 'id' | 'name' | 'email'>): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email
  };
}

function mapCategory(row: CategoryRow): EnxovalCategory {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order
  };
}

function mapItem(row: ItemRow): EnxovalItem {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    category: row.category,
    checked: row.checked,
    link: row.link,
    description: row.description,
    sortOrder: row.sort_order
  };
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function fetchCategories(queryable: Queryable, userId: string) {
  const result = await queryable.query<CategoryRow>(`
    SELECT id, name, sort_order
    FROM categories
    WHERE user_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [userId]);

  return result.rows.map(mapCategory);
}

async function fetchItems(queryable: Queryable, userId: string) {
  const result = await queryable.query<ItemRow>(`
    SELECT
      i.id,
      i.name,
      i.category_id,
      c.name AS category,
      i.checked,
      i.link,
      i.description,
      i.sort_order
    FROM items i
    INNER JOIN categories c ON c.id = i.category_id
    WHERE i.user_id = $1
    ORDER BY c.sort_order ASC, i.sort_order ASC, i.created_at ASC
  `, [userId]);

  return result.rows.map(mapItem);
}

async function fetchBootstrap(user: AuthUser): Promise<BootstrapData> {
  const pool = getPool();
  const [categories, items] = await Promise.all([
    fetchCategories(pool, user.id),
    fetchItems(pool, user.id)
  ]);

  return { user, categories, items };
}

async function findCategory(queryable: Queryable, userId: string, categoryId: string) {
  const result = await queryable.query<CategoryRow>(`
    SELECT id, name, sort_order
    FROM categories
    WHERE id = $1 AND user_id = $2
  `, [categoryId, userId]);

  return result.rows[0] ? mapCategory(result.rows[0]) : null;
}

async function findOrCreateCategory(client: PoolClient, userId: string, name: string) {
  const orderResult = await client.query<{ next_order: number }>(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
    FROM categories
    WHERE user_id = $1
  `, [userId]);

  const result = await client.query<CategoryRow>(`
    INSERT INTO categories (id, user_id, name, sort_order)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, sort_order
  `, [randomUUID(), userId, name, orderResult.rows[0]?.next_order ?? 0]);

  return mapCategory(result.rows[0]);
}

async function seedUserDefaults(client: PoolClient, userId: string) {
  const categoryIds = new Map<string, string>();

  for (const [index, categoryName] of CATEGORIES.entries()) {
    const result = await client.query<CategoryRow>(`
      INSERT INTO categories (id, user_id, name, sort_order)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, sort_order
    `, [randomUUID(), userId, categoryName, index]);

    categoryIds.set(categoryName, result.rows[0].id);
  }

  for (const [index, item] of DEFAULT_ITEM_TEMPLATES.entries()) {
    const categoryId = categoryIds.get(item.category);
    if (!categoryId) continue;

    await client.query(`
      INSERT INTO items (id, user_id, category_id, name, sort_order)
      VALUES ($1, $2, $3, $4, $5)
    `, [randomUUID(), userId, categoryId, item.name, index]);
  }
}

async function createSession(res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await getPool().query(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [randomUUID(), userId, tokenHash, expiresAt]);

  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: SESSION_TTL_MS
  });
}

async function getCurrentUser(req: Request) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const result = await getPool().query<DbUserRow>(`
    SELECT u.id, u.name, u.email, u.password_hash
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now()
    LIMIT 1
  `, [hashSessionToken(token)]);

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

async function requireCurrentUser(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) throw new HttpError(401, 'Faça login para continuar.');
  return user;
}

async function createItemForUser(input: { userId: string; name: string; categoryId?: string; categoryName?: string }) {
  return withTransaction(async client => {
    let category: EnxovalCategory | null = null;

    if (input.categoryId) {
      category = await findCategory(client, input.userId, input.categoryId);
      if (!category) throw new HttpError(404, 'Categoria não encontrada.');
    } else if (input.categoryName) {
      category = await findOrCreateCategory(client, input.userId, input.categoryName);
    } else {
      throw new HttpError(400, 'Categoria é obrigatória.');
    }

    const orderResult = await client.query<{ next_order: number }>(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
      FROM items
      WHERE user_id = $1 AND category_id = $2
    `, [input.userId, category.id]);

    const itemId = randomUUID();
    await client.query(`
      INSERT INTO items (id, user_id, category_id, name, sort_order)
      VALUES ($1, $2, $3, $4, $5)
    `, [itemId, input.userId, category.id, input.name, orderResult.rows[0]?.next_order ?? 0]);

    const itemResult = await client.query<ItemRow>(`
      SELECT
        i.id,
        i.name,
        i.category_id,
        c.name AS category,
        i.checked,
        i.link,
        i.description,
        i.sort_order
      FROM items i
      INNER JOIN categories c ON c.id = i.category_id
      WHERE i.id = $1 AND i.user_id = $2
    `, [itemId, input.userId]);

    return {
      item: mapItem(itemResult.rows[0]),
      category
    };
  });
}

async function updateItemForUser(userId: string, itemId: string, body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Dados inválidos.');
  }

  const updates = body as Record<string, unknown>;
  const setClauses: string[] = [];
  const values: unknown[] = [];

  const addUpdate = (column: string, value: unknown) => {
    values.push(value);
    setClauses.push(`${column} = $${values.length}`);
  };

  if (typeof updates.name === 'string') addUpdate('name', updates.name.trim());
  if (typeof updates.checked === 'boolean') addUpdate('checked', updates.checked);
  if (typeof updates.link === 'string') addUpdate('link', updates.link.trim());
  if (typeof updates.description === 'string') addUpdate('description', updates.description.trim());

  if (typeof updates.categoryId === 'string') {
    const category = await findCategory(getPool(), userId, updates.categoryId);
    if (!category) throw new HttpError(404, 'Categoria não encontrada.');
    addUpdate('category_id', updates.categoryId);
  }

  if (setClauses.length === 0) {
    throw new HttpError(400, 'Nenhuma alteração enviada.');
  }

  if (updates.name === '') {
    throw new HttpError(400, 'Nome do item é obrigatório.');
  }

  values.push(itemId, userId);
  const result = await getPool().query<ItemRow>(`
    UPDATE items
    SET ${setClauses.join(', ')}, updated_at = now()
    WHERE id = $${values.length - 1} AND user_id = $${values.length}
    RETURNING
      id,
      name,
      category_id,
      (SELECT name FROM categories WHERE categories.id = items.category_id) AS category,
      checked,
      link,
      description,
      sort_order
  `, values);

  if (!result.rows[0]) throw new HttpError(404, 'Item não encontrado.');
  return mapItem(result.rows[0]);
}

export function registerApiRoutes(app: Express) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/bootstrap', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    res.json(await fetchBootstrap(user));
  }));

  router.post('/auth/register', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = requireText(req.body?.password, 'Senha');
    const name = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : email.split('@')[0];

    if (!email || !email.includes('@')) throw new HttpError(400, 'Email inválido.');
    if (password.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');

    const passwordHash = await hashPassword(password);
    const userId = randomUUID();

    try {
      await withTransaction(async client => {
        await client.query(`
          INSERT INTO users (id, name, email, password_hash)
          VALUES ($1, $2, $3, $4)
        `, [userId, name, email, passwordHash]);

        await seedUserDefaults(client, userId);
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new HttpError(409, 'Já existe uma conta com esse email.');
      }
      throw err;
    }

    await createSession(res, userId);
    res.status(201).json(await fetchBootstrap({ id: userId, name, email }));
  }));

  router.post('/auth/login', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = requireText(req.body?.password, 'Senha');

    const result = await getPool().query<DbUserRow>(`
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
    `, [email]);

    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(401, 'Email ou senha inválidos.');
    }

    await getPool().query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [user.id]);
    await createSession(res, user.id);
    res.json(await fetchBootstrap(mapUser(user)));
  }));

  router.post('/auth/logout', asyncHandler(async (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) {
      await getPool().query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
    }

    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
  }));

  router.get('/categories', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    res.json(await fetchCategories(getPool(), user.id));
  }));

  router.post('/categories', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireText(req.body?.name, 'Nome da categoria');

    const category = await withTransaction(client => findOrCreateCategory(client, user.id, name));
    res.status(201).json(category);
  }));

  router.get('/items', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    res.json(await fetchItems(getPool(), user.id));
  }));

  router.post('/items', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireText(req.body?.name, 'Nome do item');
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : undefined;
    const categoryName = typeof req.body?.categoryName === 'string' && req.body.categoryName.trim()
      ? req.body.categoryName.trim()
      : undefined;

    const result = await createItemForUser({ userId: user.id, name, categoryId, categoryName });
    res.status(201).json(result);
  }));

  router.patch('/items/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const item = await updateItemForUser(user.id, req.params.id, req.body);
    res.json(item);
  }));

  app.use('/api', router);

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }

    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });
}