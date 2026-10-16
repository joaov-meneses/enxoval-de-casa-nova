/**
 * Catálogo mestre de itens (Fase 6): o que um enxoval descobre sobre um item vale para todos.
 *
 * Camadas:
 *  - L1, em memória por processo: um índice de chaves e trigramas de todo o catálogo, com os apelidos e as faixas de
 *    preço. Resolve um nome em microssegundos, sem rede. Vale por `CATALOG_CACHE_TTL_MS` (padrão: 60 s) e é
 *    descartado na hora quando este processo grava algo. Com Redis, as outras instâncias são avisadas e descartam o
 *    delas também; sem Redis, recarregam ao vencer.
 *  - L2, o Postgres: fonte durável e compartilhada (`catalog_items`, `catalog_item_aliases`, urgências e preços).
 *  - L3, um Redis opcional (`REDIS_URL`, ver `server/cache/shared.ts`): respostas do Jev e teto diário de chamadas
 *    compartilhados entre instâncias, e o aviso de "o catálogo mudou".
 *
 * A similaridade é a mesma do pg_trgm (trigramas e Jaccard), calculada aqui em vez de no banco: o catálogo cabe na
 * memória, a normalização fica idêntica à do app (`src/catalog/normalize.ts`) e não depende de extensões do Postgres.
 *
 * Cascata ao resolver um nome (`resolveItemName`):
 *  1. chave exata (nome normalizado ou apelido) → catálogo, sem Jev;
 *  2. similaridade ≥ 0,8 → mesmo item; o nome vira apelido;
 *  3. similaridade entre 0,4 e 0,8 → o Jev escolhe entre os 5 mais próximos ou "nenhum"; se escolher, vira apelido;
 *  4. nada parecido → o Jev infere uma vez (cômodo, prioridade, prazo, grupo) e o item nasce `pending_review`.
 * Os passos 3 e 4 só rodam fora do caminho da requisição (`queueResolution`) e nunca enquanto a pessoa digita.
 */
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { getPool, type Queryable } from '../database.ts';
import { isSharedCacheConfigured, publish, subscribe } from '../cache/shared.ts';
import { compactKey, foldText, itemKey, slugify, trigrams, trigramSimilarity } from '../../src/catalog/normalize.ts';
import type { RoomKey } from '../../src/onboarding/types.ts';
import type { ItemPriority, ItemTiming } from '../../src/planning/purchasePlan.ts';
import { URGENCY_LEVELS, URGENCY_RUBRIC_VERSION } from '../../src/planning/purchaseUrgency.ts';
import { chooseSameItem, inferCatalogItem, isJevConfigured, setJevCallListener } from '../services/jev.ts';
import { CATALOG_SEED_VERSION, seedItems } from './seed.ts';

export type CatalogSource = 'curated' | 'users' | 'jev';
export type CatalogStatus = 'approved' | 'pending_review';
export type AliasSource = 'curated' | 'similar' | 'jev' | 'admin' | 'users';

export interface CatalogItem {
  id: string;
  slug: string;
  name: string;
  normalizedName: string;
  room: RoomKey | null;
  priority: ItemPriority | null;
  timing: ItemTiming | null;
  leadTimeWeeks: number;
  priceCategory: 1 | 2 | 3 | 4 | null;
  functionGroup: string | null;
  source: CatalogSource;
  status: CatalogStatus;
}

export interface PriceRange {
  p10: number;
  p50: number;
  p90: number;
  samples: number;
  region: string;
}

/** Limiares da cascata. Conservadores: na dúvida, quem decide é o Jev (e depois a revisão humana). */
export const SAME_ITEM_SIMILARITY = 0.8;
export const CANDIDATE_SIMILARITY = 0.4;
const MAX_CANDIDATES = 5;
/** Quanto tempo um "não é item de casa" fica sem reconsultar o Jev. */
const NEGATIVE_TTL_DAYS = 30;

/* ------------------------------------------------------------------ índice L1 */

interface IndexKey {
  itemId: string;
  key: string;
  grams: Set<string>;
}

interface CatalogIndex {
  items: Map<string, CatalogItem>;
  /** Chave e chave compacta → item. */
  byKey: Map<string, string>;
  keys: IndexKey[];
  /** Grupo de função → itens. */
  groups: Map<string, string[]>;
  prices: Map<string, PriceRange[]>;
  loadedAt: number;
}

interface ItemRow {
  id: string;
  slug: string;
  canonical_name: string;
  normalized_name: string;
  room: RoomKey | null;
  priority: ItemPriority | null;
  timing: ItemTiming | null;
  lead_time_weeks: number;
  price_category: number | null;
  function_group: string | null;
  source: CatalogSource;
  status: CatalogStatus;
}

export const CATALOG_ITEM_COLUMNS = `id, slug, canonical_name, normalized_name, room, priority, timing, lead_time_weeks,
  price_category, function_group, source, status`;

export function mapCatalogItem(row: ItemRow): CatalogItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.canonical_name,
    normalizedName: row.normalized_name,
    room: row.room,
    priority: row.priority,
    timing: row.timing,
    leadTimeWeeks: Number(row.lead_time_weeks ?? 0),
    priceCategory: row.price_category === null ? null : (Number(row.price_category) as 1 | 2 | 3 | 4),
    functionGroup: row.function_group,
    source: row.source,
    status: row.status
  };
}

let index: CatalogIndex | null = null;
let loading: Promise<CatalogIndex> | null = null;

function cacheTtl() {
  const value = Number(process.env.CATALOG_CACHE_TTL_MS);
  return Number.isFinite(value) && value >= 0 ? value : 60_000;
}

async function loadIndex(queryable: Queryable): Promise<CatalogIndex> {
  const [itemsResult, aliasesResult, pricesResult] = await Promise.all([
    queryable.query<ItemRow>(`SELECT ${CATALOG_ITEM_COLUMNS} FROM catalog_items`),
    queryable.query<{ alias_normalized: string; item_id: string }>('SELECT alias_normalized, item_id FROM catalog_item_aliases'),
    queryable.query<{ item_id: string; region: string; p10: number; p50: number; p90: number; samples: number }>(
      'SELECT item_id, region, p10, p50, p90, samples FROM catalog_price_stats'
    )
  ]);
  const next: CatalogIndex = { items: new Map(), byKey: new Map(), keys: [], groups: new Map(), prices: new Map(), loadedAt: Date.now() };
  const addKey = (itemId: string, key: string) => {
    if (!key) return;
    if (!next.byKey.has(key)) next.byKey.set(key, itemId);
    const compact = compactKey(key);
    if (!next.byKey.has(compact)) next.byKey.set(compact, itemId);
    next.keys.push({ itemId, key, grams: trigrams(key) });
  };
  for (const row of itemsResult.rows) {
    const item = mapCatalogItem(row);
    next.items.set(item.id, item);
    addKey(item.id, item.normalizedName);
    if (item.functionGroup) next.groups.set(item.functionGroup, [...(next.groups.get(item.functionGroup) ?? []), item.id]);
  }
  for (const row of aliasesResult.rows) if (next.items.has(row.item_id)) addKey(row.item_id, row.alias_normalized);
  for (const row of pricesResult.rows) {
    const range = { p10: row.p10, p50: row.p50, p90: row.p90, samples: row.samples, region: row.region };
    next.prices.set(row.item_id, [...(next.prices.get(row.item_id) ?? []), range]);
  }
  return next;
}

/** Identifica este processo nos avisos do Redis, para ele não reagir ao próprio aviso. */
const INSTANCE_ID = randomUUID();
const CHANGED_CHANNEL = 'catalog:changed';
let listening = false;

/** Com Redis, escuta os avisos de "o catálogo mudou" das outras instâncias (uma vez por processo). */
function listenForChanges() {
  if (listening || !isSharedCacheConfigured()) return;
  listening = true;
  void subscribe(CHANGED_CHANNEL, message => {
    if (message !== INSTANCE_ID) index = null;
  });
}

/**
 * O índice L1, recarregado do banco quando vence. Leituras simultâneas esperam a mesma carga. Sempre lê pelo pool,
 * nunca pelo cliente de uma transação: o índice é global, e não uma visão daquela transação.
 */
export async function getCatalogIndex(): Promise<CatalogIndex> {
  listenForChanges();
  if (index && Date.now() - index.loadedAt < cacheTtl()) return index;
  loading ??= loadIndex(getPool())
    .then(loaded => (index = loaded))
    .finally(() => {
      loading = null;
    });
  return loading;
}

/**
 * Descarta o L1 deste processo depois de gravar no catálogo e, com Redis, avisa as outras instâncias para fazerem o
 * mesmo. Sem Redis, as outras recarregam sozinhas quando o índice delas vence (`CATALOG_CACHE_TTL_MS`).
 */
export function invalidateCatalogIndex() {
  index = null;
  if (isSharedCacheConfigured()) void publish(CHANGED_CHANNEL, INSTANCE_ID);
}

/* --------------------------------------------------------------- resolução */

export type MatchKind = 'exact' | 'similar' | 'jev' | 'created';

export interface Candidate {
  item: CatalogItem;
  similarity: number;
}

export interface IndexMatch {
  key: string;
  item: CatalogItem | null;
  match: 'exact' | 'similar' | null;
  similarity: number;
  /** Os itens mais parecidos na faixa de dúvida, do mais ao menos parecido. */
  candidates: Candidate[];
}

/** Os itens mais parecidos com uma chave, um por item, do mais ao menos parecido. */
function rank(catalog: CatalogIndex, key: string, minimum: number) {
  const grams = trigrams(key);
  const best = new Map<string, number>();
  for (const entry of catalog.keys) {
    const score = trigramSimilarity(grams, entry.grams);
    if (score >= minimum && score > (best.get(entry.itemId) ?? 0)) best.set(entry.itemId, score);
  }
  return [...best]
    .map(([itemId, similarity]) => ({ item: catalog.items.get(itemId)!, similarity }))
    .sort((a, b) => b.similarity - a.similarity || a.item.name.localeCompare(b.item.name));
}

/** Passos 1 e 2 da cascata, só com o índice em memória: nada é gravado e o Jev não entra. */
export function matchName(catalog: CatalogIndex, name: string): IndexMatch {
  const key = itemKey(name);
  if (!key) return { key, item: null, match: null, similarity: 0, candidates: [] };
  const exactId = catalog.byKey.get(key) ?? catalog.byKey.get(compactKey(key));
  if (exactId) return { key, item: catalog.items.get(exactId)!, match: 'exact', similarity: 1, candidates: [] };
  const ranked = rank(catalog, key, CANDIDATE_SIMILARITY);
  const top = ranked[0];
  if (top && top.similarity >= SAME_ITEM_SIMILARITY) return { key, item: top.item, match: 'similar', similarity: top.similarity, candidates: [] };
  return { key, item: null, match: null, similarity: top?.similarity ?? 0, candidates: ranked.slice(0, MAX_CANDIDATES) };
}

/** Tamanho máximo de um nome guardado no catálogo (os itens do funil chegam a 120 caracteres). */
const MAX_SHARED_NAME_LENGTH = 120;

/**
 * O catálogo é compartilhado entre todos: um texto que parece dado pessoal (e-mail, link, telefone, CPF ou outro número
 * longo) nunca entra nele, nem como item nem como apelido. O item da pessoa continua só na lista dela.
 */
export function isSharableName(name: string) {
  const text = name.trim();
  return text.length > 0 && text.length <= MAX_SHARED_NAME_LENGTH && !/@|https?:|www\.|\d{5,}/i.test(text);
}

async function addAlias(queryable: Queryable, itemId: string, alias: string, key: string, source: AliasSource) {
  if (!key || !isSharableName(alias)) return;
  const result = await queryable.query(
    `INSERT INTO catalog_item_aliases (alias_normalized, item_id, alias, source)
     SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE normalized_name = $1)
     ON CONFLICT (alias_normalized) DO NOTHING`,
    [key, itemId, alias.slice(0, 120), source]
  );
  if (result.rowCount) invalidateCatalogIndex();
}

/**
 * Resolução barata, usada no caminho das requisições: chave exata ou similaridade alta. Quando acerta por
 * similaridade, grava o nome como apelido (a próxima vez já é exata).
 */
export async function resolveCheap(name: string, queryable: Queryable = getPool()): Promise<IndexMatch> {
  const catalog = await getCatalogIndex();
  const found = matchName(catalog, name);
  if (found.match === 'similar' && found.item) await addAlias(queryable, found.item.id, name, found.key, 'similar');
  recordMetric(found.match ? `resolve_${found.match}` : 'resolve_pending');
  return found;
}

async function isNegative(queryable: Queryable, key: string) {
  const result = await queryable.query('SELECT 1 FROM catalog_negative_cache WHERE normalized_name = $1 AND expires_at > now()', [key]);
  return Boolean(result.rowCount);
}

async function uniqueSlug(queryable: Queryable, name: string) {
  const base = slugify(name);
  const taken = await queryable.query<{ slug: string }>('SELECT slug FROM catalog_items WHERE slug = $1 OR slug LIKE $2', [base, `${base}-%`]);
  const used = new Set(taken.rows.map(row => row.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Nome de exibição de um item que nasce de um texto digitado: primeira letra maiúscula, espaços simples. */
function displayName(name: string) {
  const text = name.replace(/\s+/g, ' ').trim();
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

export async function createCatalogItem(
  queryable: Queryable,
  input: Omit<CatalogItem, 'id' | 'slug' | 'normalizedName'> & { normalizedName?: string }
): Promise<CatalogItem | null> {
  const normalizedName = input.normalizedName ?? itemKey(input.name);
  if (!normalizedName || !isSharableName(input.name)) return null;
  const id = randomUUID();
  const result = await queryable.query<ItemRow>(
    `INSERT INTO catalog_items (id, slug, canonical_name, normalized_name, room, priority, timing, lead_time_weeks, price_category, function_group, source, status)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
     WHERE NOT EXISTS (SELECT 1 FROM catalog_item_aliases WHERE alias_normalized = $4)
     ON CONFLICT (normalized_name) DO NOTHING
     RETURNING ${CATALOG_ITEM_COLUMNS}`,
    [id, await uniqueSlug(queryable, input.name), input.name, normalizedName, input.room, input.priority, input.timing,
      Math.min(26, Math.max(0, Math.round(input.leadTimeWeeks))), input.priceCategory, input.functionGroup, input.source, input.status]
  );
  invalidateCatalogIndex();
  return result.rows[0] ? mapCatalogItem(result.rows[0]) : null;
}

/** Os grupos de função que existem, cada um descrito pelos itens que já fazem parte dele (para o Jev escolher). */
export function functionGroupDescriptions(catalog: CatalogIndex): Record<string, string> {
  const groups: Record<string, string> = {};
  for (const [group, ids] of catalog.groups) {
    groups[group] = `Mesma função de: ${ids.map(id => catalog.items.get(id)?.name).filter(Boolean).slice(0, 4).join(', ')}`;
  }
  return groups;
}

export interface Resolution {
  item: CatalogItem | null;
  match: MatchKind | null;
}

/**
 * A cascata inteira (passos 1 a 4). Chama o Jev, então só roda fora do caminho da requisição. Sem Jev, ou com o
 * Jev em dúvida, devolve `item: null` e nada é criado: o item da pessoa continua existindo, só sem estimativas.
 */
export async function resolveItemName(name: string, queryable: Queryable = getPool()): Promise<Resolution> {
  const catalog = await getCatalogIndex();
  const found = matchName(catalog, name);
  if (found.item) {
    if (found.match === 'similar') await addAlias(queryable, found.item.id, name, found.key, 'similar');
    recordMetric(`resolve_${found.match}`);
    return { item: found.item, match: found.match };
  }
  // Texto que parece dado pessoal não vai ao Jev nem ao catálogo.
  if (!found.key || !isSharableName(name) || !isJevConfigured() || (await isNegative(queryable, found.key))) {
    recordMetric('resolve_miss');
    return { item: null, match: null };
  }

  if (found.candidates.length > 0) {
    const chosen = await chooseSameItem(name, found.candidates.map(candidate => candidate.item.name));
    const item = chosen && found.candidates.find(candidate => candidate.item.name === chosen.name)?.item;
    if (item) {
      await addAlias(queryable, item.id, name, found.key, 'jev');
      recordMetric('resolve_jev');
      return { item, match: 'jev' };
    }
  }

  const inferred = await inferCatalogItem(name, functionGroupDescriptions(catalog));
  if (!inferred) {
    recordMetric('resolve_miss');
    return { item: null, match: null };
  }
  if (!inferred.isHomeItem) {
    await queryable.query(
      `INSERT INTO catalog_negative_cache (normalized_name, reason, expires_at)
       VALUES ($1, 'not_home_item', now() + make_interval(days => $2))
       ON CONFLICT (normalized_name) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at`,
      [found.key, NEGATIVE_TTL_DAYS]
    );
    recordMetric('resolve_negative');
    return { item: null, match: null };
  }
  const created = await createCatalogItem(queryable, {
    name: displayName(name),
    normalizedName: found.key,
    room: inferred.room,
    priority: inferred.priority,
    timing: inferred.timing,
    leadTimeWeeks: inferred.leadTimeWeeks,
    priceCategory: inferred.priceCategory,
    functionGroup: inferred.functionGroup,
    source: 'jev',
    status: 'pending_review'
  });
  // Outra instância pode ter criado o mesmo item no meio do caminho: vale o que está no banco.
  let item = created;
  if (!item) {
    const fresh = await getCatalogIndex();
    item = fresh.items.get(fresh.byKey.get(found.key) ?? '') ?? null;
  }
  if (item) recordMetric('resolve_created');
  return { item, match: item ? 'created' : null };
}

/* ------------------------------------------------- vínculo com os itens */

/**
 * Liga itens de enxoval ao catálogo pela resolução barata (só os que ainda não têm vínculo). Devolve os ids ligados
 * e os que ficaram sem par, para quem chama decidir se manda para a cascata completa.
 */
export async function linkItemsToCatalog(queryable: Queryable, items: { id: string; name: string }[]) {
  if (items.length === 0) return { linked: 0, unresolved: [] as { id: string; name: string }[] };
  const catalog = await getCatalogIndex();
  const ids: string[] = [];
  const catalogIds: string[] = [];
  const unresolved: { id: string; name: string }[] = [];
  const aliases = new Map<string, { itemId: string; name: string }>();
  for (const item of items) {
    const found = matchName(catalog, item.name);
    recordMetric(found.match ? `resolve_${found.match}` : 'resolve_pending');
    if (!found.item) {
      unresolved.push(item);
      continue;
    }
    ids.push(item.id);
    catalogIds.push(found.item.id);
    if (found.match === 'similar') aliases.set(found.key, { itemId: found.item.id, name: item.name });
  }
  for (const [key, alias] of aliases) await addAlias(queryable, alias.itemId, alias.name, key, 'similar');
  if (ids.length > 0) {
    await queryable.query(
      `UPDATE items i SET catalog_item_id = t.catalog_item_id
       FROM unnest($1::uuid[], $2::uuid[]) AS t(id, catalog_item_id)
       WHERE i.id = t.id`,
      [ids, catalogIds]
    );
  }
  return { linked: ids.length, unresolved };
}

/* ------------------------------------------- fila da cascata completa */

const queue = new Map<string, { name: string; itemIds: Set<string> }>();
let draining: Promise<void> | null = null;

/**
 * Manda nomes que a resolução barata não achou para a cascata completa, fora da requisição. Um nome repetido entra
 * uma vez só. Ao terminar, os itens são ligados ao que o catálogo achou ou criou.
 */
export function queueResolution(items: { id: string; name: string }[]) {
  if (!isJevConfigured() || process.env.CATALOG_RESOLUTION === 'off') return;
  for (const item of items) {
    const key = itemKey(item.name);
    if (!key) continue;
    const entry = queue.get(key) ?? { name: item.name, itemIds: new Set<string>() };
    entry.itemIds.add(item.id);
    queue.set(key, entry);
  }
  draining ??= drainQueue().finally(() => {
    draining = null;
  });
}

async function drainQueue() {
  while (queue.size > 0) {
    const [key, entry] = queue.entries().next().value as [string, { name: string; itemIds: Set<string> }];
    queue.delete(key);
    try {
      const { item } = await resolveItemName(entry.name);
      if (item) {
        await getPool().query('UPDATE items SET catalog_item_id = $1 WHERE id = ANY($2::uuid[]) AND catalog_item_id IS NULL', [item.id, [...entry.itemIds]]);
      }
    } catch (err) {
      console.warn('[catalog] Falha ao resolver item:', err instanceof Error ? err.message : err);
    }
  }
}

/** Só para testes: espera a fila da cascata esvaziar. */
export async function waitForCatalogQueue() {
  while (draining) await draining;
}

/* --------------------------------------------------------- busca rápida */

export interface CatalogSearchResult {
  id: string;
  name: string;
  room: RoomKey | null;
  priceRange: PriceRange | null;
}

/** Faixa de preço comum do item: a da região, se tiver amostra, senão a do Brasil todo. */
export function priceRangeOf(catalog: CatalogIndex, itemId: string, region?: string | null): PriceRange | null {
  const ranges = catalog.prices.get(itemId) ?? [];
  return (region ? ranges.find(range => range.region === region) : undefined) ?? ranges.find(range => range.region === '') ?? null;
}

/**
 * Autocomplete: primeiro o que começa com o texto digitado (nome ou apelido), depois o que se parece. Só itens
 * aprovados aparecem; os que o Jev criou esperam a revisão no /admin.
 */
export async function searchCatalog(query: string, options: { limit?: number; region?: string | null } = {}): Promise<CatalogSearchResult[]> {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const folded = foldText(query).replace(/[^a-z0-9 ]+/g, ' ').trim();
  const key = itemKey(query) || folded;
  if (key.length < 2) return [];
  const catalog = await getCatalogIndex();
  const grams = trigrams(key);
  const scores = new Map<string, number>();
  for (const entry of catalog.keys) {
    const item = catalog.items.get(entry.itemId)!;
    if (item.status !== 'approved') continue;
    // Prefixo vale mais que qualquer similaridade, e o do nome de exibição vale mais que o da chave: "jogo de c" acha
    // "Jogo de cama" antes de "Jogo de copos" (na chave, o "c" some como palavra vazia). Entre iguais, o mais curto.
    const tier = foldText(item.name).replace(/[^a-z0-9 ]+/g, ' ').startsWith(folded)
      ? 4
      : entry.key.startsWith(key)
        ? 3
        : entry.key.split(' ').some(word => word.startsWith(key))
          ? 2
          : 0;
    const score = tier > 0 ? tier - entry.key.length / 1000 : trigramSimilarity(grams, entry.grams);
    if (score >= 0.3 && score > (scores.get(item.id) ?? 0)) scores.set(item.id, score);
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => {
      const item = catalog.items.get(id)!;
      return { id, name: item.name, room: item.room, priceRange: priceRangeOf(catalog, id, options.region) };
    });
}

/**
 * Item do catálogo contido num texto longo, como o título de um produto de loja ("Air Fryer Mondial 4L Preta"):
 * o nome ou apelido mais longo que aparece inteiro no título.
 */
export async function findItemInTitle(title: string): Promise<CatalogItem | null> {
  const catalog = await getCatalogIndex();
  const key = itemKey(title);
  if (!key) return null;
  const padded = ` ${key} `;
  const compact = compactKey(key);
  let best: IndexKey | null = null;
  for (const entry of catalog.keys) {
    const contained = padded.includes(` ${entry.key} `) || (entry.key.length >= 6 && compact.includes(compactKey(entry.key)));
    if (contained && (!best || entry.key.length > best.key.length)) best = entry;
  }
  return best ? catalog.items.get(best.itemId) ?? null : null;
}

/* ------------------------------------------------ compras redundantes */

/**
 * Compra redundante pelo banco, sem Jev: outro item da lista é o mesmo item do catálogo (escrito de outro jeito) ou
 * do mesmo grupo de função. Devolve o nome do item da lista que já cumpre o papel.
 */
export function findRedundancy(
  catalog: CatalogIndex,
  item: CatalogItem,
  draftName: string,
  existing: { name: string; catalogItemId: string | null }[]
): string | null {
  const draft = foldText(draftName);
  for (const other of existing) {
    if (foldText(other.name) === draft) continue;
    const otherId = other.catalogItemId ?? matchName(catalog, other.name).item?.id ?? null;
    if (!otherId) continue;
    if (otherId === item.id) return other.name;
    const otherGroup = catalog.items.get(otherId)?.functionGroup;
    if (item.functionGroup && otherGroup === item.functionGroup) return other.name;
  }
  return null;
}

/* ------------------------------------------------------ urgência por faixa */

export interface StoredUrgency {
  urgency: number;
  confidence: number;
}

export async function catalogUrgencies(queryable: Queryable, itemIds: string[], bucket: string) {
  const result = new Map<string, StoredUrgency>();
  if (itemIds.length === 0) return result;
  const rows = await queryable.query<{ item_id: string; urgency: number; confidence: number }>(
    `SELECT item_id, urgency, confidence FROM catalog_item_urgency
     WHERE item_id = ANY($1::uuid[]) AND profile_bucket = $2 AND rubric_version = $3`,
    [itemIds, bucket, URGENCY_RUBRIC_VERSION]
  );
  for (const row of rows.rows) result.set(row.item_id, { urgency: Number(row.urgency), confidence: Number(row.confidence) });
  return result;
}

export async function saveCatalogUrgencies(queryable: Queryable, bucket: string, scores: { id: string; urgency: number; confidence: number }[]) {
  if (scores.length === 0) return;
  await queryable.query(
    `INSERT INTO catalog_item_urgency (item_id, profile_bucket, rubric_version, urgency, confidence)
     SELECT t.item_id, $1, $2, t.urgency, t.confidence
     FROM unnest($3::uuid[], $4::real[], $5::real[]) AS t(item_id, urgency, confidence)
     ON CONFLICT (item_id, profile_bucket, rubric_version) DO UPDATE SET urgency = EXCLUDED.urgency, confidence = EXCLUDED.confidence`,
    [bucket, URGENCY_RUBRIC_VERSION, scores.map(score => score.id),
      scores.map(score => Math.min(URGENCY_LEVELS, Math.max(1, score.urgency))), scores.map(score => score.confidence)]
  );
}

/* --------------------------------------------------------------- métricas */

const pendingMetrics = new Map<string, number>();
let flushTimer: NodeJS.Timeout | null = null;

/** Conta um evento do catálogo. Os contadores vão ao banco em lote, a cada 15 s, para não pesar nas requisições. */
export function recordMetric(metric: string, amount = 1) {
  pendingMetrics.set(metric, (pendingMetrics.get(metric) ?? 0) + amount);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushCatalogMetrics().catch(err => console.warn('[catalog] Falha ao gravar métricas:', err instanceof Error ? err.message : err));
    }, 15_000);
    flushTimer.unref?.();
  }
}

export async function flushCatalogMetrics(queryable: Queryable = getPool()) {
  if (pendingMetrics.size === 0) return;
  const entries = [...pendingMetrics];
  pendingMetrics.clear();
  await queryable.query(
    `INSERT INTO catalog_metrics_daily (day, metric, count)
     SELECT current_date, t.metric, t.count FROM unnest($1::text[], $2::int[]) AS t(metric, count)
     ON CONFLICT (day, metric) DO UPDATE SET count = catalog_metrics_daily.count + EXCLUDED.count`,
    [entries.map(([metric]) => metric), entries.map(([, count]) => count)]
  );
}

setJevCallListener(() => recordMetric('jev_calls'));

/* ----------------------------------------------------------------- semente */

/** Grava a semente quando a versão do banco é mais antiga. Idempotente e segura com várias instâncias subindo juntas. */
export async function seedCatalog(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock da transação: duas instâncias subindo ao mesmo tempo não semeiam em dobro.
    await client.query('SELECT pg_advisory_xact_lock(726351905)');
    const state = await client.query<{ version: number }>('SELECT version FROM catalog_seed_state');
    const seededVersion = state.rows[0]?.version ?? 0;
    if (seededVersion >= CATALOG_SEED_VERSION) {
      await client.query('COMMIT');
      return;
    }

    const known = await client.query<{ key: string }>('SELECT normalized_name AS key FROM catalog_items UNION SELECT alias_normalized FROM catalog_item_aliases');
    const slugs = await client.query<{ slug: string }>('SELECT slug FROM catalog_items');
    const usedKeys = new Set(known.rows.map(row => row.key));
    const usedSlugs = new Set(slugs.rows.map(row => row.slug));
    const items = seedItems();
    const newItems: { id: string; slug: string; key: string; item: (typeof items)[number] }[] = [];
    for (const item of items) {
      const key = itemKey(item.name);
      // Só entram as levas mais novas que a do banco: o que a equipe apagou de uma leva antiga não volta.
      if (!key || item.since <= seededVersion || usedKeys.has(key)) continue;
      usedKeys.add(key);
      let slug = slugify(item.name);
      for (let n = 2; usedSlugs.has(slug); n += 1) slug = `${slugify(item.name)}-${n}`;
      usedSlugs.add(slug);
      newItems.push({ id: randomUUID(), slug, key, item });
    }
    if (newItems.length > 0) {
      await client.query(
        `INSERT INTO catalog_items (id, slug, canonical_name, normalized_name, room, priority, timing, lead_time_weeks, price_category, function_group, source, status)
         SELECT t.id, t.slug, t.name, t.key, t.room, t.priority, t.timing, t.lead, t.tier, t.grp, 'curated', 'approved'
         FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::smallint[], $9::smallint[], $10::text[])
           AS t(id, slug, name, key, room, priority, timing, lead, tier, grp)
         ON CONFLICT DO NOTHING`,
        [
          newItems.map(entry => entry.id),
          newItems.map(entry => entry.slug),
          newItems.map(entry => entry.item.name),
          newItems.map(entry => entry.key),
          newItems.map(entry => entry.item.room),
          newItems.map(entry => entry.item.priority),
          newItems.map(entry => entry.item.timing),
          newItems.map(entry => entry.item.leadTimeWeeks),
          newItems.map(entry => entry.item.priceCategory),
          newItems.map(entry => entry.item.functionGroup)
        ]
      );
    }

    // Apelidos de todos os itens da semente, inclusive dos que já existiam; um apelido nunca toma a chave de outro item.
    const ids = await client.query<{ id: string; key: string }>('SELECT id, normalized_name AS key FROM catalog_items');
    const idByKey = new Map(ids.rows.map(row => [row.key, row.id]));
    const aliasKeys: string[] = [];
    const aliasItems: string[] = [];
    const aliasTexts: string[] = [];
    for (const item of items) {
      const itemId = idByKey.get(itemKey(item.name));
      if (!itemId) continue;
      for (const alias of item.aliases) {
        const key = itemKey(alias);
        if (!key || idByKey.has(key) || aliasKeys.includes(key)) continue;
        aliasKeys.push(key);
        aliasItems.push(itemId);
        aliasTexts.push(alias);
      }
    }
    if (aliasKeys.length > 0) {
      await client.query(
        `INSERT INTO catalog_item_aliases (alias_normalized, item_id, alias, source)
         SELECT t.key, t.item_id, t.alias, 'curated' FROM unnest($1::text[], $2::uuid[], $3::text[]) AS t(key, item_id, alias)
         ON CONFLICT (alias_normalized) DO NOTHING`,
        [aliasKeys, aliasItems, aliasTexts]
      );
    }

    await client.query(
      `INSERT INTO catalog_seed_state (id, version) VALUES (true, $1)
       ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version`,
      [CATALOG_SEED_VERSION]
    );
    await client.query('COMMIT');
    invalidateCatalogIndex();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Só para testes: esquece o índice e as métricas pendentes. */
export function resetCatalogForTests() {
  index = null;
  listening = false;
  pendingMetrics.clear();
  queue.clear();
}
