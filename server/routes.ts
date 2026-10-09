import { randomBytes, randomUUID } from 'node:crypto';
import express, { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { MAX_ENVIRONMENT_NAME_LENGTH } from '../src/data.ts';
import { DEFAULT_ITEM_QUANTITY, isValidQuantity, quantityFromDescription } from '../src/itemQuantity.ts';
import { DEFAULT_ITEM_STATUS, isDoneStatus, isItemStatus, resolveDiscountCents, statusFromChecked, type ItemStatus } from '../src/itemStatus.ts';
import type { AuthUser, BootstrapData, EnxovalCategory, EnxovalItem, EnxovalMember, EnxovalSummary, EnxovalWorkspace } from '../src/types.ts';
import { getPool, withTransaction, Queryable } from './database.ts';
import { asyncHandler, cookieOptions, getCookie, hashPassword, hashSessionToken, HttpError, loginRateLimit, protectMutationOrigin, verifyPassword } from './security.ts';
import { registerAdminRoutes } from './admin.ts';
import { parseOnboardingProfile, type OnboardingProfile } from './onboarding-profile.ts';

const SESSION_COOKIE = 'enxoval_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

interface DbUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  is_active: boolean;
  must_change_password: boolean;
  password_reset_expires_at: Date | null;
}

interface EnxovalRow {
  id: string;
  name: string;
  owner_id: string;
  role: 'owner' | 'editor';
  discount_cents: number;
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor';
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
  status: ItemStatus;
  link: string;
  description: string;
  price_cents: number | null;
  discount_cents: number;
  quantity: number;
  sort_order: number;
  updated_at: string | Date;
  created_at: string | Date;
}

interface TemplateRow {
  id: string;
}

interface TemplateCategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

interface TemplateItemRow {
  category_id: string;
  name: string;
  sort_order: number;
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

function requireEnvironmentName(value: unknown) {
  const name = requireText(value, 'Nome do ambiente');
  if (name.length > MAX_ENVIRONMENT_NAME_LENGTH) {
    throw new HttpError(400, `O nome do ambiente pode ter no máximo ${MAX_ENVIRONMENT_NAME_LENGTH} caracteres.`);
  }
  return name;
}

function mapUser(row: Pick<DbUserRow, 'id' | 'name' | 'email'> & Partial<Pick<DbUserRow, 'must_change_password'>>): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mustChangePassword: row.must_change_password ?? false
  };
}

function mapEnxoval(row: EnxovalRow): EnxovalSummary {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    role: row.role,
    discountCents: Number(row.discount_cents ?? 0)
  };
}

function mapMember(row: MemberRow): EnxovalMember {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role
  };
}

function serializeTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
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
    status: row.status,
    link: row.link,
    description: row.description,
    priceCents: row.price_cents === null ? null : Number(row.price_cents),
    quantity: Number(row.quantity ?? 1),
    discountCents: Number(row.discount_cents ?? 0),
    sortOrder: row.sort_order,
    createdAt: serializeTimestamp(row.created_at),
    updatedAt: serializeTimestamp(row.updated_at)
  };
}

async function fetchEnxovais(queryable: Queryable, userId: string) {
  const result = await queryable.query<EnxovalRow>(`
    SELECT e.id, e.name, e.owner_id, e.discount_cents, em.role
    FROM enxovais e
    INNER JOIN enxoval_members em ON em.enxoval_id = e.id
    WHERE em.user_id = $1
    ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END, e.created_at ASC, e.name ASC
  `, [userId]);

  return result.rows.map(mapEnxoval);
}

async function requireEnxovalMember(queryable: Queryable, userId: string, enxovalId: string) {
  const result = await queryable.query<{ role: 'owner' | 'editor' }>(`
    SELECT role
    FROM enxoval_members
    WHERE enxoval_id = $1 AND user_id = $2
  `, [enxovalId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');
  return result.rows[0].role;
}
async function requireEnxovalOwner(queryable: Queryable, userId: string, enxovalId: string) {
  const role = await requireEnxovalMember(queryable, userId, enxovalId);
  if (role !== 'owner') throw new HttpError(403, 'Apenas o dono pode alterar esse enxoval.');
}

async function fetchEnxoval(queryable: Queryable, userId: string, enxovalId: string) {
  const result = await queryable.query<EnxovalRow>(`
    SELECT e.id, e.name, e.owner_id, e.discount_cents, em.role
    FROM enxovais e
    INNER JOIN enxoval_members em ON em.enxoval_id = e.id
    WHERE e.id = $1 AND em.user_id = $2
    LIMIT 1
  `, [enxovalId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');
  return mapEnxoval(result.rows[0]);
}

async function fetchMembers(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<MemberRow>(`
    SELECT u.id, u.name, u.email, em.role
    FROM enxoval_members em
    INNER JOIN users u ON u.id = em.user_id
    WHERE em.enxoval_id = $1
    ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END, u.name ASC, u.email ASC
  `, [enxovalId]);

  return result.rows.map(mapMember);
}

async function fetchCategories(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<CategoryRow>(`
    SELECT id, name, sort_order
    FROM categories
    WHERE enxoval_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [enxovalId]);

  return result.rows.map(mapCategory);
}

async function fetchItems(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<ItemRow>(`
    SELECT
      i.id,
      i.name,
      i.category_id,
      c.name AS category,
      i.checked,
      i.status,
      i.link,
      i.description,
      i.price_cents,
      i.discount_cents,
      i.quantity,
      i.sort_order,
      i.created_at,
      i.updated_at
    FROM items i
    INNER JOIN categories c ON c.id = i.category_id
    WHERE i.enxoval_id = $1
    ORDER BY c.sort_order ASC, i.sort_order ASC, i.created_at ASC
  `, [enxovalId]);

  return result.rows.map(mapItem);
}

async function fetchWorkspace(queryable: Queryable, userId: string, enxovalId: string): Promise<EnxovalWorkspace> {
  const enxoval = await fetchEnxoval(queryable, userId, enxovalId);
  const members = await fetchMembers(queryable, userId, enxovalId);
  const categories = await fetchCategories(queryable, userId, enxovalId);
  const items = await fetchItems(queryable, userId, enxovalId);

  return { enxoval, members, categories, items };
}

async function fetchBootstrap(user: AuthUser, requestedEnxovalId?: string): Promise<BootstrapData> {
  if (user.mustChangePassword) return { user, enxovais: [], activeEnxoval: null, members: [], categories: [], items: [] };
  const enxovais = await fetchEnxovais(getPool(), user.id);
  const activeEnxovalId = requestedEnxovalId ?? enxovais[0]?.id;
  const workspace = activeEnxovalId
    ? await fetchWorkspace(getPool(), user.id, activeEnxovalId)
    : null;

  return {
    user,
    enxovais,
    activeEnxoval: workspace?.enxoval ?? null,
    members: workspace?.members ?? [],
    categories: workspace?.categories ?? [],
    items: workspace?.items ?? []
  };
}

async function findCategory(queryable: Queryable, userId: string, enxovalId: string, categoryId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<CategoryRow>(`
    SELECT id, name, sort_order
    FROM categories
    WHERE id = $1 AND enxoval_id = $2
  `, [categoryId, enxovalId]);

  return result.rows[0] ? mapCategory(result.rows[0]) : null;
}

async function findOrCreateCategory(client: PoolClient, userId: string, enxovalId: string, name: string, preferredOrder?: number) {
  await requireEnxovalMember(client, userId, enxovalId);

  const orderResult = await client.query<{ next_order: number }>(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
    FROM categories
    WHERE enxoval_id = $1
  `, [enxovalId]);

  const result = await client.query<CategoryRow>(`
    INSERT INTO categories (id, user_id, enxoval_id, name, sort_order)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (enxoval_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, sort_order
  `, [randomUUID(), userId, enxovalId, name, preferredOrder ?? orderResult.rows[0]?.next_order ?? 0]);

  return mapCategory(result.rows[0]);
}

async function seedEnxovalDefaults(client: PoolClient, userId: string, enxovalId: string) {
  const templateResult = await client.query<TemplateRow>(`
    SELECT id
    FROM enxoval_templates
    WHERE is_default = true
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const templateId = templateResult.rows[0]?.id;
  if (!templateId) return;

  const templateCategories = await client.query<TemplateCategoryRow>(`
    SELECT id, name, sort_order
    FROM template_categories
    WHERE template_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [templateId]);

  const categoryIds = new Map<string, string>();

  for (const templateCategory of templateCategories.rows) {
    const category = await findOrCreateCategory(client, userId, enxovalId, templateCategory.name, templateCategory.sort_order);
    categoryIds.set(templateCategory.id, category.id);
  }

  const templateItems = await client.query<TemplateItemRow>(`
    SELECT category_id, name, sort_order
    FROM template_items
    WHERE template_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [templateId]);

  for (const item of templateItems.rows) {
    const categoryId = categoryIds.get(item.category_id);
    if (!categoryId) continue;

    await client.query(`
      INSERT INTO items (id, user_id, enxoval_id, category_id, name, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [randomUUID(), userId, enxovalId, categoryId, item.name, item.sort_order]);
  }
}

interface EnxovalPlan {
  categories: { name: string; items: { name: string; description: string }[] }[];
}

const MAX_PLAN_CATEGORIES = 15;
const MAX_PLAN_ITEMS = 400;

/** Plano gerado pelo funil de onboarding: ambientes e itens, com limites para não virar um vetor de abuso. */
function parsePlan(value: unknown): EnxovalPlan | null {
  if (value === undefined || value === null) return null;
  const categories = (value as { categories?: unknown })?.categories;
  if (!Array.isArray(categories) || categories.length === 0 || categories.length > MAX_PLAN_CATEGORIES) {
    throw new HttpError(400, 'Plano inválido.');
  }

  let totalItems = 0;
  const parsed = categories.map(category => {
    const items = (category as { items?: unknown })?.items;
    if (!Array.isArray(items)) throw new HttpError(400, 'Plano inválido.');
    totalItems += items.length;
    if (totalItems > MAX_PLAN_ITEMS) throw new HttpError(400, 'Plano com itens demais.');

    return {
      name: requireEnvironmentName((category as { name?: unknown }).name),
      items: items.map(item => {
        const rawName = (item as { name?: unknown })?.name;
        const rawDescription = (item as { description?: unknown })?.description;
        const name = requireText(rawName, 'Nome do item');
        if (name.length > 120) throw new HttpError(400, 'Nome do item muito longo.');
        const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
        if (description.length > 200) throw new HttpError(400, 'Descrição do item muito longa.');
        return { name, description };
      })
    };
  });

  if (new Set(parsed.map(category => category.name)).size !== parsed.length) {
    throw new HttpError(400, 'Plano com ambientes repetidos.');
  }
  if (totalItems === 0) throw new HttpError(400, 'Plano sem itens.');

  return { categories: parsed };
}

async function seedEnxovalPlan(client: PoolClient, userId: string, enxovalId: string, plan: EnxovalPlan) {
  for (const [categoryIndex, planCategory] of plan.categories.entries()) {
    const category = await findOrCreateCategory(client, userId, enxovalId, planCategory.name, categoryIndex);
    if (planCategory.items.length === 0) continue;

    await client.query(`
      INSERT INTO items (id, user_id, enxoval_id, category_id, name, description, sort_order, quantity)
      SELECT t.id, $1::uuid, $2::uuid, $3::uuid, t.name, t.description, t.sort_order, t.quantity
      FROM unnest($4::uuid[], $5::text[], $6::text[], $7::int[], $8::int[]) AS t(id, name, description, sort_order, quantity)
    `, [
      userId,
      enxovalId,
      category.id,
      planCategory.items.map(() => randomUUID()),
      planCategory.items.map(item => item.name),
      planCategory.items.map(item => item.description),
      planCategory.items.map((_, index) => index),
      planCategory.items.map(item => quantityFromDescription(item.description))
    ]);
  }
}

async function insertEnxoval(
  client: PoolClient,
  userId: string,
  name: string,
  options: { useDefaultTemplate?: boolean; plan?: EnxovalPlan | null; profile?: OnboardingProfile | null } = {}
) {
  const enxovalId = randomUUID();

  await client.query(`
    INSERT INTO enxovais (id, name, owner_id, onboarding_profile)
    VALUES ($1, $2, $3, $4::jsonb)
  `, [enxovalId, name, userId, options.profile ? JSON.stringify(options.profile) : null]);

  await client.query(`
    INSERT INTO enxoval_members (enxoval_id, user_id, role)
    VALUES ($1, $2, 'owner')
  `, [enxovalId, userId]);

  if (options.plan) {
    await seedEnxovalPlan(client, userId, enxovalId, options.plan);
  } else if (options.useDefaultTemplate !== false) {
    await seedEnxovalDefaults(client, userId, enxovalId);
  }

  return enxovalId;
}

async function createEnxovalForUser(userId: string, name: string, options: { useDefaultTemplate?: boolean } = {}) {
  return withTransaction(async client => {
    const enxovalId = await insertEnxoval(client, userId, name, options);
    return fetchWorkspace(client, userId, enxovalId);
  });
}

async function createSession(res: Response, userId: string, queryable: Queryable = getPool()) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await queryable.query(`
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
    SELECT u.id, u.name, u.email, u.password_hash, u.must_change_password
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active = true
      AND (NOT u.must_change_password OR u.password_reset_expires_at > now())
    LIMIT 1
  `, [hashSessionToken(token)]);

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

async function requireCurrentUser(req: Request, allowPasswordChange = false) {
  const user = await getCurrentUser(req);
  if (!user) throw new HttpError(401, 'Faça login para continuar.');
  if (user.mustChangePassword && !allowPasswordChange) throw new HttpError(403, 'Defina uma nova senha antes de acessar seu enxoval.');
  return user;
}

async function createItemForUser(input: { userId: string; enxovalId: string; name: string; categoryId?: string; categoryName?: string; priceCents?: number | null; link?: string; description?: string; status?: ItemStatus; discountCents?: unknown; quantity?: number }) {
  return withTransaction(async client => {
    await requireEnxovalMember(client, input.userId, input.enxovalId);

    let category: EnxovalCategory | null = null;

    if (input.categoryId) {
      category = await findCategory(client, input.userId, input.enxovalId, input.categoryId);
      if (!category) throw new HttpError(404, 'Ambiente não encontrado.');
    } else if (input.categoryName) {
      category = await findOrCreateCategory(client, input.userId, input.enxovalId, input.categoryName);
    } else {
      throw new HttpError(400, 'Ambiente é obrigatório.');
    }

    const orderResult = await client.query<{ next_order: number }>(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
      FROM items
      WHERE enxoval_id = $1 AND category_id = $2
    `, [input.enxovalId, category.id]);

    const itemId = randomUUID();
    const status = input.status ?? DEFAULT_ITEM_STATUS;
    const quantity = input.quantity ?? DEFAULT_ITEM_QUANTITY;
    const discount = resolveDiscountCents({ status, priceCents: input.priceCents ?? null, discountCents: input.discountCents });
    if ('error' in discount) throw new HttpError(400, discount.error);
    await client.query(`
      INSERT INTO items (id, user_id, enxoval_id, category_id, name, sort_order, price_cents, discount_cents, link, description, status, checked, quantity)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [itemId, input.userId, input.enxovalId, category.id, input.name, orderResult.rows[0]?.next_order ?? 0, input.priceCents ?? null, discount.value, input.link ?? '', input.description ?? '', status, isDoneStatus(status), quantity]);

    const itemResult = await client.query<ItemRow>(`
      SELECT
        i.id,
        i.name,
        i.category_id,
        c.name AS category,
        i.checked,
        i.status,
        i.link,
        i.description,
        i.price_cents,
        i.discount_cents,
        i.quantity,
        i.sort_order,
        i.created_at,
        i.updated_at
      FROM items i
      INNER JOIN categories c ON c.id = i.category_id
      WHERE i.id = $1 AND i.enxoval_id = $2
    `, [itemId, input.enxovalId]);

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

  return withTransaction(async client => {
    // FOR UPDATE: situação, preço e desconto são validados em conjunto, então ninguém pode alterá-los no meio.
    const current = await client.query<{ enxoval_id: string; status: ItemStatus; price_cents: number | null; discount_cents: number; quantity: number }>(`
      SELECT i.enxoval_id, i.status, i.price_cents, i.discount_cents, i.quantity
      FROM items i
      INNER JOIN enxoval_members em ON em.enxoval_id = i.enxoval_id
      WHERE i.id = $1 AND em.user_id = $2
      LIMIT 1
      FOR UPDATE OF i
    `, [itemId, userId]);

    if (!current.rows[0]) throw new HttpError(404, 'Item não encontrado.');

    const enxovalId = current.rows[0].enxoval_id;
    const updates = body as Record<string, unknown>;
    const has = (key: string) => Object.prototype.hasOwnProperty.call(updates, key);
    const setClauses: string[] = [];
    const values: unknown[] = [];

    const addUpdate = (column: string, value: unknown) => {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    };

    if (typeof updates.name === 'string') {
      const name = updates.name.trim();
      if (!name) throw new HttpError(400, 'Nome do item é obrigatório.');
      addUpdate('name', name);
    }

    let status = current.rows[0].status;
    if (has('status')) {
      if (!isItemStatus(updates.status)) throw new HttpError(400, 'Situação inválida.');
      status = updates.status;
    } else if (typeof updates.checked === 'boolean') {
      // Compatibilidade com o marcador antigo: mantém uma situação já coerente e só ajusta quando preciso.
      status = statusFromChecked(updates.checked, status);
    }
    if (has('status') || typeof updates.checked === 'boolean') {
      addUpdate('status', status);
      addUpdate('checked', isDoneStatus(status));
    }

    if (typeof updates.link === 'string') addUpdate('link', updates.link.trim());
    if (typeof updates.description === 'string') addUpdate('description', updates.description.trim());

    let priceCents = current.rows[0].price_cents === null ? null : Number(current.rows[0].price_cents);
    if (has('priceCents')) {
      if (updates.priceCents === null) {
        priceCents = null;
      } else if (typeof updates.priceCents === 'number' && Number.isInteger(updates.priceCents) && updates.priceCents >= 0) {
        priceCents = updates.priceCents;
      } else {
        throw new HttpError(400, 'Preço inválido.');
      }
      addUpdate('price_cents', priceCents);
    }

    let quantity = Number(current.rows[0].quantity ?? 1);
    if (has('quantity')) {
      if (!isValidQuantity(updates.quantity)) throw new HttpError(400, 'Quantidade inválida. Use um número inteiro de 1 a 999.');
      quantity = updates.quantity;
      addUpdate('quantity', quantity);
    }

    if (has('status') || has('priceCents') || has('discountCents') || typeof updates.checked === 'boolean') {
      const discount = resolveDiscountCents({
        status,
        priceCents,
        discountCents: has('discountCents') ? updates.discountCents : Number(current.rows[0].discount_cents)
      });
      if ('error' in discount) throw new HttpError(400, discount.error);
      addUpdate('discount_cents', discount.value);
    }

    if (typeof updates.categoryId === 'string') {
      const category = await findCategory(client, userId, enxovalId, updates.categoryId);
      if (!category) throw new HttpError(404, 'Ambiente não encontrado.');
      addUpdate('category_id', updates.categoryId);
    }

    if (setClauses.length === 0) {
      throw new HttpError(400, 'Nenhuma alteração enviada.');
    }

    values.push(itemId, enxovalId);
    const result = await client.query<ItemRow>(`
      UPDATE items
      SET ${setClauses.join(', ')}, updated_at = now()
      WHERE id = $${values.length - 1} AND enxoval_id = $${values.length}
      RETURNING
        id,
        name,
        category_id,
        (SELECT name FROM categories WHERE categories.id = items.category_id) AS category,
        checked,
        status,
        link,
        description,
        price_cents,
        discount_cents,
        quantity,
        sort_order,
        created_at,
        updated_at
    `, values);

    if (!result.rows[0]) throw new HttpError(404, 'Item não encontrado.');
    return mapItem(result.rows[0]);
  });
}
async function deleteItemForUser(userId: string, itemId: string) {
  const result = await getPool().query<{ id: string }>(`
    DELETE FROM items i
    WHERE i.id = $1
      AND EXISTS (
        SELECT 1
        FROM enxoval_members em
        WHERE em.enxoval_id = i.enxoval_id
          AND em.user_id = $2
      )
    RETURNING id
  `, [itemId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Item não encontrado.');
}

async function reorderCategoriesForUser(userId: string, enxovalId: string, categoryIds: string[]) {
  return withTransaction(async client => {
    await requireEnxovalMember(client, userId, enxovalId);

    const uniqueCategoryIds = new Set(categoryIds);
    if (uniqueCategoryIds.size !== categoryIds.length) {
      throw new HttpError(400, 'Ambientes duplicados na ordenação.');
    }

    const existingResult = await client.query<{ id: string }>(`
      SELECT id
      FROM categories
      WHERE enxoval_id = $1
      ORDER BY sort_order ASC, name ASC
    `, [enxovalId]);

    const existingIds = new Set(existingResult.rows.map(category => category.id));
    const invalidCategoryId = categoryIds.find(categoryId => !existingIds.has(categoryId));
    if (invalidCategoryId) {
      throw new HttpError(400, 'A ordenação contém um ambiente inválido.');
    }

    const nextCategoryIds = [
      ...categoryIds,
      ...existingResult.rows
        .map(category => category.id)
        .filter(categoryId => !uniqueCategoryIds.has(categoryId))
    ];

    for (const [sortOrder, categoryId] of nextCategoryIds.entries()) {
      await client.query(`
        UPDATE categories
        SET sort_order = $1, updated_at = now()
        WHERE id = $2 AND enxoval_id = $3
      `, [sortOrder, categoryId, enxovalId]);
    }

    return fetchCategories(client, userId, enxovalId);
  });
}

export function registerApiRoutes(app: Express) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(protectMutationOrigin);
  registerAdminRoutes(router);

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/bootstrap', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req, true);
    const requestedEnxovalId = typeof req.query.enxovalId === 'string' ? req.query.enxovalId : undefined;
    res.json(await fetchBootstrap(user, requestedEnxovalId));
  }));

  router.post('/auth/register', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = requireText(req.body?.password, 'Senha');
    const name = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : email.split('@')[0];

    if (!email || !email.includes('@')) throw new HttpError(400, 'E-mail inválido.');
    if (password.length > 128) throw new HttpError(400, 'A senha pode ter no máximo 128 caracteres.');
    if (password.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');

    // O cadastro só existe pelo funil de onboarding (/comecar): exige o plano e as respostas,
    // validados por completo antes de criar qualquer coisa.
    const plan = parsePlan(req.body?.plan);
    if (!plan) {
      throw new HttpError(400, 'O cadastro é feito pelo funil de onboarding. Monte o seu plano em /comecar.');
    }
    const enxovalName = requireText(req.body?.enxovalName, 'Nome do enxoval');
    if (enxovalName.length > 100) throw new HttpError(400, 'Nome do enxoval muito longo.');
    const profile = parseOnboardingProfile(req.body?.profile);

    const passwordHash = await hashPassword(password);
    const userId = randomUUID();

    try {
      await withTransaction(async client => {
        await client.query(`
          INSERT INTO users (id, name, email, password_hash, last_login_at)
          VALUES ($1, $2, $3, $4, now())
        `, [userId, name, email, passwordHash]);

        await insertEnxoval(client, userId, enxovalName, { useDefaultTemplate: false, plan, profile });
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new HttpError(409, 'Já existe uma conta com esse e-mail.');
      }
      throw err;
    }

    await createSession(res, userId);
    res.status(201).json(await fetchBootstrap({ id: userId, name, email }));
  }));

  router.post('/auth/login', loginRateLimit(), asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = requireText(req.body?.password, 'Senha');
    if (password.length > 512) throw new HttpError(400, 'Senha muito longa.');
    const user = await withTransaction(async client => {
      const result = await client.query<DbUserRow>(
        'SELECT * FROM users WHERE email = $1 LIMIT 1 FOR UPDATE', [email]);
      const row = result.rows[0];
      if (!row || !(await verifyPassword(password, row.password_hash))) {
        throw new HttpError(401, 'E-mail ou senha inválidos.');
      }
      if (!row.is_active) throw new HttpError(403, 'Esta conta está inativa. Entre em contato com o suporte.');
      if (row.must_change_password && (!row.password_reset_expires_at || row.password_reset_expires_at.getTime() <= Date.now())) {
        throw new HttpError(401, 'Sua senha temporária expirou. Solicite uma nova ao suporte.');
      }
      await client.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [row.id]);
      await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
      await createSession(res, row.id, client);
      return mapUser(row);
    });
    res.json(await fetchBootstrap(user));
  }));

  router.post('/auth/change-password', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req, true);
    const password = requireText(req.body?.password, 'Nova senha');
    const confirmation = requireText(req.body?.confirmation, 'Confirmação da senha');
    if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Use uma senha com 8 a 128 caracteres.');
    if (password !== confirmation) throw new HttpError(400, 'As senhas não coincidem.');
    const updatedUser = await withTransaction(async client => {
      const result = await client.query<DbUserRow>(
        'SELECT * FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const row = result.rows[0];
      const tokenHash = hashSessionToken(getCookie(req, SESSION_COOKIE));
      const session = await client.query('SELECT id FROM sessions WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()', [user.id, tokenHash]);
      if (!row?.is_active || !session.rowCount) throw new HttpError(401, 'Faça login novamente para continuar.');
      if (!row.must_change_password) throw new HttpError(409, 'Esta conta não possui uma troca de senha pendente.');
      if (!row.password_reset_expires_at || row.password_reset_expires_at.getTime() <= Date.now()) throw new HttpError(401, 'Sua senha temporária expirou. Solicite uma nova ao suporte.');
      if (await verifyPassword(password, row.password_hash)) throw new HttpError(400, 'Escolha uma senha diferente da temporária.');
      await client.query('UPDATE users SET password_hash = $2, must_change_password = false, password_reset_expires_at = NULL, updated_at = now() WHERE id = $1', [user.id, await hashPassword(password)]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      await createSession(res, user.id, client);
      return mapUser({ ...row, must_change_password: false });
    });
    res.json(await fetchBootstrap(updatedUser));
  }));

  router.post('/auth/logout', asyncHandler(async (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) {
      await getPool().query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
    }

    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
  }));

  router.get('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    res.json(await fetchWorkspace(getPool(), user.id, req.params.id));
  }));

  router.post('/enxovais', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireText(req.body?.name, 'Nome do enxoval');
    const useDefaultTemplate = req.body?.useDefaultTemplate !== false;

    const workspace = await createEnxovalForUser(user.id, name, { useDefaultTemplate });
    res.status(201).json(workspace);
  }));
  router.patch('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const role = await requireEnxovalMember(getPool(), user.id, req.params.id);

    if (!req.body || typeof req.body !== 'object') {
      throw new HttpError(400, 'Dados inválidos.');
    }

    const updates = req.body as Record<string, unknown>;
    const setClauses: string[] = [];
    const values: unknown[] = [];

    const addUpdate = (column: string, value: unknown) => {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      if (role !== 'owner') throw new HttpError(403, 'Apenas o dono pode alterar esse enxoval.');
      addUpdate('name', requireText(updates.name, 'Nome do enxoval'));
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'discountCents')) {
      if (typeof updates.discountCents !== 'number' || !Number.isInteger(updates.discountCents) || updates.discountCents < 0) {
        throw new HttpError(400, 'Desconto inválido.');
      }
      addUpdate('discount_cents', updates.discountCents);
    }

    if (setClauses.length === 0) throw new HttpError(400, 'Nenhuma alteração enviada.');

    values.push(req.params.id);
    const result = await getPool().query<EnxovalRow>(`
      UPDATE enxovais
      SET ${setClauses.join(', ')}, updated_at = now()
      WHERE id = $${values.length}
      RETURNING id, name, owner_id, discount_cents, $${values.length + 1}::text AS role
    `, [...values, role]);

    if (!result.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');
    res.json(mapEnxoval(result.rows[0]));
  }));

  router.delete('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);

    await requireEnxovalOwner(getPool(), user.id, req.params.id);
    await getPool().query('DELETE FROM enxovais WHERE id = $1', [req.params.id]);

    res.status(204).end();
  }));

  router.post('/enxovais/:id/members', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const email = normalizeEmail(req.body?.email);

    if (!email || !email.includes('@')) throw new HttpError(400, 'E-mail inválido.');
    await requireEnxovalMember(getPool(), user.id, req.params.id);

    const invitedUserResult = await getPool().query<DbUserRow>(`
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
    `, [email]);

    const invitedUser = invitedUserResult.rows[0];
    if (!invitedUser) throw new HttpError(404, 'Esse e-mail ainda não tem conta.');

    await getPool().query(`
      INSERT INTO enxoval_members (enxoval_id, user_id, role, invited_by)
      VALUES ($1, $2, 'editor', $3)
      ON CONFLICT (enxoval_id, user_id) DO NOTHING
    `, [req.params.id, invitedUser.id, user.id]);

    const memberResult = await getPool().query<MemberRow>(`
      SELECT u.id, u.name, u.email, em.role
      FROM enxoval_members em
      INNER JOIN users u ON u.id = em.user_id
      WHERE em.enxoval_id = $1 AND em.user_id = $2
      LIMIT 1
    `, [req.params.id, invitedUser.id]);

    res.status(201).json(mapMember(memberResult.rows[0]));
  }));

  router.get('/categories', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.query.enxovalId, 'Enxoval');
    res.json(await fetchCategories(getPool(), user.id, enxovalId));
  }));

  router.post('/categories', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireEnvironmentName(req.body?.name);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');

    const category = await withTransaction(client => findOrCreateCategory(client, user.id, enxovalId, name));
    res.status(201).json(category);
  }));

  router.patch('/categories/order', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');
    const categoryIds = Array.isArray(req.body?.categoryIds) && req.body.categoryIds.every((categoryId: unknown) => typeof categoryId === 'string')
      ? req.body.categoryIds
      : null;

    if (!categoryIds) throw new HttpError(400, 'Ordenação inválida.');

    res.json(await reorderCategoriesForUser(user.id, enxovalId, categoryIds));
  }));

  router.patch('/categories/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');
    const name = requireEnvironmentName(req.body?.name);
    await requireEnxovalMember(getPool(), user.id, enxovalId);
    try {
      const result = await getPool().query<CategoryRow>(
        'UPDATE categories SET name = $3, updated_at = now() WHERE id = $1 AND enxoval_id = $2 RETURNING id, name, sort_order',
        [req.params.id, enxovalId, name]);
      if (!result.rows[0]) throw new HttpError(404, 'Ambiente não encontrado.');
      res.json(mapCategory(result.rows[0]));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'Já existe um ambiente com esse nome.');
      throw err;
    }
  }));

  router.delete('/categories/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.query.enxovalId, 'Enxoval');
    await requireEnxovalMember(getPool(), user.id, enxovalId);
    // Os itens do ambiente são removidos junto (ON DELETE CASCADE).
    const result = await getPool().query<{ id: string }>(
      'DELETE FROM categories WHERE id = $1 AND enxoval_id = $2 RETURNING id',
      [req.params.id, enxovalId]);
    if (!result.rows[0]) throw new HttpError(404, 'Ambiente não encontrado.');
    res.status(204).end();
  }));

  router.patch('/items/order', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');
    const categoryId = requireText(req.body?.categoryId, 'Ambiente');
    const itemIds: string[] | null = Array.isArray(req.body?.itemIds) && req.body.itemIds.every((id: unknown) => typeof id === 'string') ? req.body.itemIds : null;
    if (!itemIds || new Set(itemIds).size !== itemIds.length) throw new HttpError(400, 'Ordenação inválida ou com itens duplicados.');
    const result = await withTransaction(async client => {
      await requireEnxovalMember(client, user.id, enxovalId);
      const category = await client.query('SELECT id FROM categories WHERE id = $1 AND enxoval_id = $2 FOR UPDATE', [categoryId, enxovalId]);
      if (!category.rowCount) throw new HttpError(404, 'Ambiente não encontrado.');
      const existing = await client.query<{ id: string }>('SELECT id FROM items WHERE enxoval_id = $1 AND category_id = $2 FOR UPDATE', [enxovalId, categoryId]);
      const actual = new Set(existing.rows.map(item => item.id));
      if (actual.size !== itemIds.length || itemIds.some(id => !actual.has(id))) throw new HttpError(409, 'A lista mudou. Atualize os itens antes de reordenar.');
      for (const [position, id] of itemIds.entries()) {
        await client.query('UPDATE items SET sort_order = $2 WHERE id = $1 AND enxoval_id = $3 AND category_id = $4', [id, position, enxovalId, categoryId]);
      }
      return (await fetchItems(client, user.id, enxovalId)).filter(item => item.categoryId === categoryId);
    });
    res.json(result);
  }));

  router.get('/items', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.query.enxovalId, 'Enxoval');
    res.json(await fetchItems(getPool(), user.id, enxovalId));
  }));

  router.post('/items', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireText(req.body?.name, 'Nome do item');
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : undefined;
    const categoryName = typeof req.body?.categoryName === 'string' && req.body.categoryName.trim()
      ? requireEnvironmentName(req.body.categoryName)
      : undefined;

    const rawPrice = req.body?.priceCents;
    if (rawPrice !== undefined && rawPrice !== null && !(typeof rawPrice === 'number' && Number.isInteger(rawPrice) && rawPrice >= 0)) {
      throw new HttpError(400, 'Preço inválido.');
    }
    const link = typeof req.body?.link === 'string' ? req.body.link.trim() : undefined;
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : undefined;
    const rawStatus = req.body?.status;
    if (rawStatus !== undefined && !isItemStatus(rawStatus)) throw new HttpError(400, 'Situação inválida.');
    const rawQuantity = req.body?.quantity;
    if (rawQuantity !== undefined && !isValidQuantity(rawQuantity)) throw new HttpError(400, 'Quantidade inválida. Use um número inteiro de 1 a 999.');

    const result = await createItemForUser({ userId: user.id, enxovalId, name, categoryId, categoryName, priceCents: rawPrice, link, description, status: rawStatus, discountCents: req.body?.discountCents, quantity: rawQuantity });
    res.status(201).json(result);
  }));

  router.patch('/items/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const item = await updateItemForUser(user.id, req.params.id, req.body);
    res.json(item);
  }));

  router.delete('/items/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    await deleteItemForUser(user.id, req.params.id);
    res.status(204).end();
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
