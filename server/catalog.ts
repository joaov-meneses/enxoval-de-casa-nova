// Catálogo compartilhado de itens (Fase 6): o que um enxoval descobre vale para todos. Guarda só nomes de itens e
// agregados, nunca dados de pessoa ou de enxoval. O Jev fica como último degrau da cascata (ver server/ai.ts).
//
// Camadas: L1 é um índice em memória (recarregado a cada INDEX_TTL_MS ou quando este processo grava) e L2 é o
// Postgres, a fonte durável e compartilhada entre instâncias.
import { randomUUID } from 'node:crypto';
import type { Request, Router } from 'express';
import { CATALOG } from '../src/onboarding/catalog.ts';
import { stateInfo } from '../src/onboarding/plan.ts';
import { jaccard, normalizeName, similarity, stripAccents, trigrams } from '../src/catalog/normalize.ts';
import { MAX_ITEM_NAME_LENGTH } from '../src/data.ts';
import { URGENCY_RUBRIC_VERSION } from '../src/planning/purchaseUrgency.ts';
import { getPool, Queryable, withTransaction } from './database.ts';
import { requireAdmin } from './admin.ts';
import { asyncHandler, HttpError, rateLimit } from './security.ts';
import { inferCatalogEntry } from './services/jev.ts';
import type { AuthUser } from '../src/types.ts';

/** Similaridade a partir da qual dois nomes são tratados como o mesmo item. */
export const SAME_ITEM_SIMILARITY = 0.8;
/** Abaixo disto o nome não se parece com nada do catálogo; entre os dois limites o Jev desempata. */
export const DOUBT_SIMILARITY = 0.4;
const MAX_DOUBT_CANDIDATES = 5;
/** Preço só vira faixa pública com amostra de pelo menos este número de enxovais distintos. */
export const MIN_PRICE_SAMPLES = 5;
/** Nome usado por pelo menos este número de enxovais distintos pode virar item do catálogo (nunca um texto isolado). */
const MIN_ENXOVAIS_FOR_NEW_ITEM = 3;
const INDEX_TTL_MS = 30_000;

export interface CatalogItem {
  id: string;
  canonicalName: string;
  normalizedName: string;
  room: string | null;
  priority: 'essential' | 'optional';
  timing: 'first_night' | 'first_week' | null;
  leadTimeWeeks: number | null;
  priceCategory: number | null;
  functionGroup: string | null;
  source: 'curated' | 'users' | 'jev';
  status: 'approved' | 'pending_review';
}

interface CatalogRow {
  id: string;
  canonical_name: string;
  normalized_name: string;
  room: string | null;
  priority: 'essential' | 'optional';
  timing: 'first_night' | 'first_week' | null;
  lead_time_weeks: number | null;
  price_category: number | null;
  function_group: string | null;
  source: CatalogItem['source'];
  status: CatalogItem['status'];
}

const toItem = (row: CatalogRow): CatalogItem => ({
  id: row.id,
  canonicalName: row.canonical_name,
  normalizedName: row.normalized_name,
  room: row.room,
  priority: row.priority,
  timing: row.timing,
  leadTimeWeeks: row.lead_time_weeks,
  priceCategory: row.price_category,
  functionGroup: row.function_group,
  source: row.source,
  status: row.status
});

/* ------------------------------------------------------------------- semeadura */

/** Itens que cumprem a mesma função: ter um deles já resolve a necessidade do outro. */
const FUNCTION_GROUPS: Record<string, string> = {
  'Air fryer': 'fritura-sem-oleo',
  'Espremedor de frutas': 'espremer-fruta',
  'Espremedor elétrico de frutas': 'espremer-fruta',
  'Purificador de água': 'filtrar-agua',
  'Filtro de água de bancada': 'filtrar-agua',
  Cafeteira: 'preparar-cafe',
  'Coador de café': 'preparar-cafe'
};

/** Nomes que as pessoas usam para o mesmo item do catálogo. */
const SEED_ALIASES: Record<string, string[]> = {
  'Air fryer': ['airfryer', 'fritadeira elétrica', 'fritadeira sem óleo', 'fritadeira de ar'],
  Geladeira: ['refrigerador', 'geladeira frost free', 'geladeira duplex'],
  'Micro-ondas': ['microondas', 'forno de micro-ondas', 'forno micro-ondas'],
  'Fogão ou cooktop': ['fogão', 'cooktop', 'fogão 4 bocas', 'fogão 5 bocas'],
  'Máquina de lavar roupa': ['lavadora', 'lavadora de roupa', 'máquina de lavar'],
  'Lava-louças': ['máquina de lavar louça', 'lava louça'],
  Televisão: ['tv', 'televisor', 'smart tv'],
  'Guarda-roupa': ['roupeiro', 'armário de roupa'],
  'Ar-condicionado': ['ar condicionado', 'split'],
  'Robô aspirador': ['robô de limpeza', 'aspirador robô'],
  'Ferro de passar': ['ferro', 'ferro a vapor', 'ferro de passar roupa'],
  'Panela elétrica de arroz': ['arrozeira'],
  Liquidificador: ['liquidificador potente'],
  'Jogo de panelas': ['conjunto de panelas', 'kit de panelas'],
  Colchão: ['colchão de casal', 'colchão ortopédico']
};

/** Semanas de antecedência que entrega e montagem costumam exigir; o que não está aqui não tem prazo fixo. */
const SEED_LEAD_TIME: Record<string, number> = {
  'Cama (estrutura ou box)': 3,
  Colchão: 2,
  'Guarda-roupa': 6,
  Sofá: 6,
  Geladeira: 2,
  'Fogão ou cooktop': 2,
  'Máquina de lavar roupa': 2,
  'Rack ou painel de TV': 3,
  'Mesa de jantar com cadeiras': 6,
  'Ar-condicionado': 3,
  'Lava-louças': 3
};

/** Itens do catálogo do funil, sem a variação por casal ou solteiro (que normaliza para o mesmo nome). */
function seedEntries() {
  const entries = new Map<string, { name: string; room: string; essential: boolean; timing: 'first_night' | 'first_week' | null; tier: number; source: string }>();
  for (const entry of CATALOG) {
    const name = entry.name.replace('{cama}', '').replace(/\s+/g, ' ').trim();
    const key = normalizeName(name);
    if (!key || entries.has(key)) continue;
    const has = (letter: string) => entry.flags.includes(letter);
    entries.set(key, {
      name,
      room: entry.room,
      essential: has('E') || has('H') || has('F'),
      timing: has('I') ? 'first_night' : has('U') ? 'first_week' : null,
      tier: entry.tier,
      source: entry.name
    });
  }
  return entries;
}

/** Insere o catálogo curado. Não sobrescreve o que a equipe já revisou: só acrescenta o que falta. */
export async function seedCatalog(queryable: Queryable) {
  const entries = [...seedEntries()];
  await queryable.query(
    `INSERT INTO catalog_items (id, canonical_name, normalized_name, room, priority, timing, lead_time_weeks, price_category, function_group, source, status)
     SELECT gen_random_uuid(), t.name, t.key, t.room, t.priority, t.timing, t.lead, t.tier, t.grp, 'curated', 'approved'
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::text[])
       AS t(name, key, room, priority, timing, lead, tier, grp)
     ON CONFLICT (normalized_name) DO NOTHING`,
    [
      entries.map(([, entry]) => entry.name),
      entries.map(([key]) => key),
      entries.map(([, entry]) => entry.room),
      entries.map(([, entry]) => (entry.essential ? 'essential' : 'optional')),
      entries.map(([, entry]) => entry.timing),
      entries.map(([, entry]) => SEED_LEAD_TIME[entry.source] ?? null),
      entries.map(([, entry]) => entry.tier),
      entries.map(([, entry]) => FUNCTION_GROUPS[entry.name] ?? null)
    ]
  );

  const aliases: { alias: string; target: string }[] = [];
  for (const [key, entry] of entries) {
    for (const alias of SEED_ALIASES[entry.name] ?? []) {
      const normalized = normalizeName(alias);
      if (normalized && normalized !== key) aliases.push({ alias: normalized, target: key });
    }
  }
  if (aliases.length > 0) {
    await queryable.query(
      `INSERT INTO catalog_item_aliases (alias_normalized, item_id, source)
       SELECT t.alias, ci.id, 'curated'
       FROM unnest($1::text[], $2::text[]) AS t(alias, target)
       JOIN catalog_items ci ON ci.normalized_name = t.target
       WHERE NOT EXISTS (SELECT 1 FROM catalog_items other WHERE other.normalized_name = t.alias)
       ON CONFLICT (alias_normalized) DO NOTHING`,
      [aliases.map(entry => entry.alias), aliases.map(entry => entry.target)]
    );
  }
  invalidateCatalogIndex();
}

/* ---------------------------------------------------------------- índice (L1) */

interface CatalogIndex {
  loadedAt: number;
  items: Map<string, CatalogItem>;
  /** Nome normalizado ou apelido → id do item. */
  keys: Map<string, string>;
  /** Trigramas de cada chave, calculados uma vez por carga do índice. */
  grams: Map<string, Set<string>>;
}

let index: CatalogIndex | null = null;

export function invalidateCatalogIndex() {
  index = null;
}

async function getIndex(queryable: Queryable): Promise<CatalogIndex> {
  if (index && Date.now() - index.loadedAt < INDEX_TTL_MS) return index;
  const [itemRows, aliasRows] = await Promise.all([
    queryable.query<CatalogRow>('SELECT * FROM catalog_items'),
    queryable.query<{ alias_normalized: string; item_id: string }>('SELECT alias_normalized, item_id FROM catalog_item_aliases')
  ]);
  const items = new Map<string, CatalogItem>();
  const keys = new Map<string, string>();
  for (const row of itemRows.rows) {
    items.set(row.id, toItem(row));
    keys.set(row.normalized_name, row.id);
  }
  for (const row of aliasRows.rows) if (items.has(row.item_id)) keys.set(row.alias_normalized, row.item_id);
  const grams = new Map([...keys.keys()].map(key => [key, trigrams(key)]));
  return (index = { loadedAt: Date.now(), items, keys, grams });
}

/* ------------------------------------------------------------------ resolução */

export type Resolution =
  | { kind: 'match'; item: CatalogItem; via: 'exact' | 'alias' | 'similar'; score: number }
  | { kind: 'doubt'; candidates: { item: CatalogItem; score: number }[] }
  | { kind: 'none' };

/** Só o acerto exato por nome ou apelido (sem similaridade): barato o bastante para rodar em cada item de uma lista. */
export async function lookupExact(queryable: Queryable, name: string): Promise<CatalogItem | null> {
  const key = normalizeName(name);
  if (!key) return null;
  const current = await getIndex(queryable);
  const id = current.keys.get(key);
  return id ? current.items.get(id) ?? null : null;
}

/** O cômodo do item do catálogo é o do ambiente da pessoa? Eletrodomésticos moram na cozinha. */
export function roomMatches(itemRoom: string | null, categoryRoom: string | null) {
  if (!itemRoom || !categoryRoom) return false;
  return itemRoom === categoryRoom || (itemRoom === 'eletro' && categoryRoom === 'cozinha');
}

/** Grava um apelido novo para um item e já o coloca no índice, para a mesma dúvida não voltar. */
export async function learnAlias(queryable: Queryable, itemId: string, name: string, source: 'similarity' | 'jev' | 'admin') {
  const alias = normalizeName(name);
  if (!alias) return;
  const current = await getIndex(queryable);
  if (current.keys.has(alias)) return;
  await queryable.query(
    'INSERT INTO catalog_item_aliases (alias_normalized, item_id, source) VALUES ($1, $2, $3) ON CONFLICT (alias_normalized) DO NOTHING',
    [alias, itemId, source]
  );
  current.keys.set(alias, itemId);
  current.grams.set(alias, trigrams(alias));
}

/**
 * Passos 1 e 2 da cascata, sem rede externa: acerto exato por nome ou apelido, e depois similaridade alta (que grava o
 * apelido). A faixa intermediária volta como dúvida para o Jev desempatar; nada parecido volta como `none`.
 */
export async function resolveItem(queryable: Queryable, name: string, options: { learn?: boolean } = {}): Promise<Resolution> {
  const key = normalizeName(name);
  if (!key) return { kind: 'none' };
  const current = await getIndex(queryable);

  const exact = current.keys.get(key);
  if (exact) {
    const item = current.items.get(exact)!;
    return { kind: 'match', item, via: item.normalizedName === key ? 'exact' : 'alias', score: 1 };
  }

  const best = new Map<string, number>();
  const wanted = trigrams(key);
  for (const [candidate, id] of current.keys) {
    const score = jaccard(wanted, current.grams.get(candidate)!);
    if (score >= DOUBT_SIMILARITY && score > (best.get(id) ?? 0)) best.set(id, score);
  }
  const ranked = [...best]
    .map(([id, score]) => ({ item: current.items.get(id)!, score }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return { kind: 'none' };

  if (ranked[0].score >= SAME_ITEM_SIMILARITY) {
    if (options.learn !== false) await learnAlias(queryable, ranked[0].item.id, name, 'similarity');
    return { kind: 'match', item: ranked[0].item, via: 'similar', score: ranked[0].score };
  }
  return { kind: 'doubt', candidates: ranked.slice(0, MAX_DOUBT_CANDIDATES) };
}

/** Nome que não deve ir para o catálogo compartilhado (parece dado pessoal, link ou texto longo demais). */
function isSharable(name: string) {
  return name.length > 0 && name.length <= MAX_ITEM_NAME_LENGTH && !/@|https?:|www\.|\d{5,}/i.test(name);
}

/** Passo 4: item sem equivalente entra no catálogo como pendente de revisão, e nunca vale mais que o curado. */
export async function createPendingItem(
  queryable: Queryable,
  name: string,
  data: { room?: string | null; source: 'users' | 'jev' }
): Promise<CatalogItem | null> {
  const trimmed = name.trim();
  const key = normalizeName(trimmed);
  if (!key || !isSharable(trimmed)) return null;
  const result = await queryable.query<CatalogRow>(
    `INSERT INTO catalog_items (id, canonical_name, normalized_name, room, source, status)
     VALUES ($1, $2, $3, $4, $5, 'pending_review')
     ON CONFLICT (normalized_name) DO UPDATE SET updated_at = catalog_items.updated_at
     RETURNING *`,
    [randomUUID(), trimmed, key, data.room ?? null, data.source]
  );
  invalidateCatalogIndex();
  return result.rows[0] ? toItem(result.rows[0]) : null;
}

/* ------------------------------------------------------------------- métricas */

export type MetricKind = 'resolve_hit' | 'resolve_miss' | 'jev_call';

/** Contadores diários. Falhar aqui nunca pode derrubar a requisição. */
export async function recordMetric(kind: MetricKind, amount = 1) {
  try {
    await getPool().query(
      `INSERT INTO catalog_metrics (day, kind, total) VALUES (current_date, $1, $2)
       ON CONFLICT (day, kind) DO UPDATE SET total = catalog_metrics.total + EXCLUDED.total`,
      [kind, amount]
    );
  } catch (err) {
    console.warn('[catalog] Métrica não gravada:', err instanceof Error ? err.message : err);
  }
}

/* ---------------------------------------------------------------------- busca */

export interface CatalogSearchResult {
  id: string;
  name: string;
  room: string | null;
  priority: 'essential' | 'optional';
  priceCategory: number | null;
  priceRange: { p10Cents: number; p50Cents: number; p90Cents: number } | null;
}

/** Autocomplete: prefixo do nome, prefixo de palavra e similaridade. Só itens aprovados aparecem para as pessoas. */
export async function searchCatalog(queryable: Queryable, query: string, limit = 8): Promise<CatalogSearchResult[]> {
  const typed = stripAccents(query).toLowerCase().replace(/\s+/g, ' ').trim();
  const key = normalizeName(query);
  if (typed.length < 2) return [];
  const current = await getIndex(queryable);

  const scores = new Map<string, number>();
  const bump = (id: string, score: number) => {
    if (score > (scores.get(id) ?? 0)) scores.set(id, score);
  };
  for (const [candidate, id] of current.keys) {
    const item = current.items.get(id);
    if (!item || item.status !== 'approved') continue;
    const plain = candidate;
    if (plain.startsWith(typed) || (key && plain.startsWith(key))) bump(id, 1);
    else if (plain.split(' ').some(word => word.startsWith(typed))) bump(id, 0.9);
    else if (key) {
      const score = similarity(key, candidate);
      if (score >= DOUBT_SIMILARITY) bump(id, score * 0.8);
    }
  }
  for (const item of current.items.values()) {
    if (item.status !== 'approved') continue;
    const plain = stripAccents(item.canonicalName).toLowerCase();
    if (plain.startsWith(typed)) bump(item.id, 1);
    else if (plain.split(' ').some(word => word.startsWith(typed))) bump(item.id, 0.9);
  }

  const top = [...scores].sort((a, b) => b[1] - a[1] || current.items.get(a[0])!.canonicalName.localeCompare(current.items.get(b[0])!.canonicalName)).slice(0, limit);
  if (top.length === 0) return [];
  const stats = await queryable.query<{ item_id: string; p10_cents: number; p50_cents: number; p90_cents: number }>(
    `SELECT item_id, p10_cents, p50_cents, p90_cents FROM catalog_price_stats WHERE region = '' AND item_id = ANY($1::uuid[])`,
    [top.map(([id]) => id)]
  );
  const ranges = new Map(stats.rows.map(row => [row.item_id, { p10Cents: row.p10_cents, p50Cents: row.p50_cents, p90Cents: row.p90_cents }]));
  return top.map(([id]) => {
    const item = current.items.get(id)!;
    return {
      id,
      name: item.canonicalName,
      room: item.room,
      priority: item.priority,
      priceCategory: item.priceCategory,
      priceRange: ranges.get(id) ?? null
    };
  });
}

/* ------------------------------------------------------------ urgência por faixa */

export interface BucketProfile {
  housing: string;
  moment: string;
  uf: string | null;
}

/** Faixa de perfil que decide a urgência: moradia x clima x situação. Prazo até a mudança não entra. */
export function profileBucket(profile: BucketProfile) {
  const situation = profile.moment === 'casal' ? 'casal' : profile.moment === 'solo' ? 'solo' : 'outros';
  return `${profile.housing}:${stateInfo(profile.uf).climate}:${situation}`;
}

export async function loadBucketUrgencies(queryable: Queryable, itemIds: string[], bucket: string) {
  const map = new Map<string, { urgency: number; confidence: number }>();
  if (itemIds.length === 0) return map;
  const result = await queryable.query<{ item_id: string; urgency: number; confidence: number }>(
    `SELECT item_id, urgency, confidence FROM catalog_item_urgency
     WHERE profile_bucket = $1 AND rubric_version = $2 AND item_id = ANY($3::uuid[])`,
    [bucket, URGENCY_RUBRIC_VERSION, itemIds]
  );
  for (const row of result.rows) map.set(row.item_id, { urgency: row.urgency, confidence: row.confidence });
  return map;
}

export async function saveBucketUrgency(queryable: Queryable, itemId: string, bucket: string, urgency: number, confidence: number) {
  await queryable.query(
    `INSERT INTO catalog_item_urgency (item_id, profile_bucket, urgency, confidence, rubric_version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (item_id, profile_bucket)
     DO UPDATE SET urgency = EXCLUDED.urgency, confidence = EXCLUDED.confidence, rubric_version = EXCLUDED.rubric_version, updated_at = now()`,
    [itemId, bucket, urgency, confidence, URGENCY_RUBRIC_VERSION]
  );
}

/* ----------------------------------------------------------------- manutenção */

function percentile(sorted: number[], fraction: number) {
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/** Aparar extremos pela regra do IQR (1,5 × a distância entre quartis). */
export function trimOutliers(values: number[]) {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const spread = (q3 - q1) * 1.5;
  return sorted.filter(value => value >= q1 - spread && value <= q3 + spread);
}

/**
 * Agrega os preços que as pessoas cadastraram em faixas por item. Publica só com amostra de pelo menos
 * `MIN_PRICE_SAMPLES` enxovais distintos (depois de aparar os extremos) e guarda só os agregados.
 */
export async function refreshPriceStats(queryable: Queryable) {
  const rows = await queryable.query<{ catalog_item_id: string; enxoval_id: string; price_cents: number }>(
    `SELECT catalog_item_id, enxoval_id, price_cents FROM items WHERE catalog_item_id IS NOT NULL AND price_cents > 0`
  );
  // Um valor por enxoval (a mediana dos que ele tem), para um enxoval com dez toalhas não pesar dez vezes.
  const perItem = new Map<string, Map<string, number[]>>();
  for (const row of rows.rows) {
    const byEnxoval = perItem.get(row.catalog_item_id) ?? new Map<string, number[]>();
    byEnxoval.set(row.enxoval_id, [...(byEnxoval.get(row.enxoval_id) ?? []), row.price_cents]);
    perItem.set(row.catalog_item_id, byEnxoval);
  }

  const published: string[] = [];
  for (const [itemId, byEnxoval] of perItem) {
    const samples = trimOutliers([...byEnxoval.values()].map(prices => percentile([...prices].sort((a, b) => a - b), 0.5)));
    if (samples.length < MIN_PRICE_SAMPLES) continue;
    const sorted = [...samples].sort((a, b) => a - b);
    await queryable.query(
      `INSERT INTO catalog_price_stats (item_id, region, p10_cents, p50_cents, p90_cents, samples)
       VALUES ($1, '', $2, $3, $4, $5)
       ON CONFLICT (item_id, region)
       DO UPDATE SET p10_cents = EXCLUDED.p10_cents, p50_cents = EXCLUDED.p50_cents, p90_cents = EXCLUDED.p90_cents,
                     samples = EXCLUDED.samples, updated_at = now()`,
      [itemId, Math.round(percentile(sorted, 0.1)), Math.round(percentile(sorted, 0.5)), Math.round(percentile(sorted, 0.9)), sorted.length]
    );
    published.push(itemId);
  }
  // Item que perdeu amostra suficiente deixa de ter faixa publicada.
  await queryable.query(`DELETE FROM catalog_price_stats WHERE region = '' AND NOT (item_id = ANY($1::uuid[]))`, [published]);
  return { published: published.length };
}

/**
 * Liga ao catálogo os itens que ainda não têm vínculo (sem Jev). Nomes sem equivalente só viram item pendente quando
 * pelo menos `MIN_ENXOVAIS_FOR_NEW_ITEM` enxovais distintos os usam: texto isolado de uma pessoa não entra.
 */
export async function linkUnlinkedItems(queryable: Queryable) {
  const rows = await queryable.query<{ id: string; enxoval_id: string; name: string }>(
    'SELECT id, enxoval_id, name FROM items WHERE catalog_item_id IS NULL'
  );
  const byKey = new Map<string, { name: string; ids: string[]; enxovais: Set<string> }>();
  for (const row of rows.rows) {
    const key = normalizeName(row.name);
    if (!key) continue;
    const group = byKey.get(key) ?? { name: row.name, ids: [], enxovais: new Set<string>() };
    group.ids.push(row.id);
    group.enxovais.add(row.enxoval_id);
    byKey.set(key, group);
  }

  let linked = 0;
  let created = 0;
  for (const group of byKey.values()) {
    const resolution = await resolveItem(queryable, group.name);
    let itemId: string | null = null;
    if (resolution.kind === 'match') itemId = resolution.item.id;
    else if (resolution.kind === 'none' && group.enxovais.size >= MIN_ENXOVAIS_FOR_NEW_ITEM) {
      const item = await createPendingItem(queryable, group.name, { source: 'users' });
      if (item) {
        itemId = item.id;
        created += 1;
      }
    }
    if (!itemId) continue;
    await queryable.query('UPDATE items SET catalog_item_id = $1 WHERE id = ANY($2::uuid[])', [itemId, group.ids]);
    linked += group.ids.length;
  }
  return { linked, created };
}

/* ---------------------------------------------------------------------- admin */

export interface CatalogMetrics {
  days: number;
  resolveHits: number;
  resolveMisses: number;
  /** Fração das resoluções atendidas sem chamar o Jev, ou null sem dados. */
  hitRate: number | null;
  jevCalls: number;
  jevCallsPerDay: number;
  pendingReview: number;
  itemsWithoutUrgency: number;
}

export async function catalogMetrics(queryable: Queryable, days = 30): Promise<CatalogMetrics> {
  const [totals, pending, withoutUrgency] = await Promise.all([
    queryable.query<{ kind: string; total: number }>(
      `SELECT kind, COALESCE(SUM(total), 0)::int AS total FROM catalog_metrics WHERE day > current_date - $1::int GROUP BY kind`,
      [days]
    ),
    queryable.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM catalog_items WHERE status = 'pending_review'`),
    queryable.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM catalog_items ci
       WHERE ci.status = 'approved' AND NOT EXISTS (SELECT 1 FROM catalog_item_urgency u WHERE u.item_id = ci.id)`
    )
  ]);
  const count = (kind: string) => Number(totals.rows.find(row => row.kind === kind)?.total ?? 0);
  const hits = count('resolve_hit');
  const misses = count('resolve_miss');
  return {
    days,
    resolveHits: hits,
    resolveMisses: misses,
    hitRate: hits + misses > 0 ? hits / (hits + misses) : null,
    jevCalls: count('jev_call'),
    jevCallsPerDay: count('jev_call') / days,
    pendingReview: Number(pending.rows[0]?.total ?? 0),
    itemsWithoutUrgency: Number(withoutUrgency.rows[0]?.total ?? 0)
  };
}

export async function listPendingItems(queryable: Queryable, limit = 100) {
  const result = await queryable.query<CatalogRow & { usage: number }>(
    `SELECT ci.*, (SELECT COUNT(*)::int FROM items i WHERE i.catalog_item_id = ci.id) AS usage
     FROM catalog_items ci WHERE ci.status = 'pending_review'
     ORDER BY usage DESC, ci.created_at ASC LIMIT $1`,
    [limit]
  );
  const current = await getIndex(queryable);
  return result.rows.map(row => {
    // Itens aprovados mais parecidos: candidatos a "mesclar em" (a revisão decide; nada é mesclado sozinho).
    const wanted = trigrams(row.normalized_name);
    const best = new Map<string, number>();
    for (const [key, id] of current.keys) {
      if (id === row.id || current.items.get(id)?.status !== 'approved') continue;
      const score = jaccard(wanted, current.grams.get(key)!);
      if (score >= 0.3 && score > (best.get(id) ?? 0)) best.set(id, score);
    }
    const similar = [...best]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, score]) => ({ id, name: current.items.get(id)!.canonicalName, score }));
    return { ...toItem(row), usage: Number(row.usage), similar };
  });
}

export interface ApprovePatch {
  canonicalName?: string;
  room?: string | null;
  priority?: 'essential' | 'optional';
  timing?: 'first_night' | 'first_week' | null;
  priceCategory?: number | null;
  functionGroup?: string | null;
}

/** Aprovar (e, se preciso, renomear e completar) um item pendente: a partir daí ele vale como curado. */
export async function approveItem(queryable: Queryable, id: string, patch: ApprovePatch) {
  const name = patch.canonicalName?.trim();
  const key = name ? normalizeName(name) : null;
  if (name !== undefined && (!key || !isSharable(name))) throw new HttpError(400, 'Nome inválido para o catálogo.');
  if (patch.priceCategory != null && !(Number.isInteger(patch.priceCategory) && patch.priceCategory >= 1 && patch.priceCategory <= 4)) {
    throw new HttpError(400, 'A faixa de preço vai de 1 a 4.');
  }
  const taken = key ? await queryable.query('SELECT 1 FROM catalog_items WHERE normalized_name = $1 AND id <> $2', [key, id]) : null;
  if (taken?.rowCount) throw new HttpError(409, 'Já existe um item com esse nome. Use "mesclar".');
  const result = await queryable.query<CatalogRow>(
    `UPDATE catalog_items SET
       canonical_name = COALESCE($2, canonical_name),
       normalized_name = COALESCE($3, normalized_name),
       room = CASE WHEN $4 THEN $5 ELSE room END,
       priority = COALESCE($6, priority),
       timing = CASE WHEN $7 THEN $8 ELSE timing END,
       price_category = CASE WHEN $9 THEN $10 ELSE price_category END,
       function_group = CASE WHEN $11 THEN $12 ELSE function_group END,
       source = 'curated', status = 'approved', updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      id, name ?? null, key,
      'room' in patch, patch.room ?? null,
      patch.priority ?? null,
      'timing' in patch, patch.timing ?? null,
      'priceCategory' in patch, patch.priceCategory ?? null,
      'functionGroup' in patch, patch.functionGroup ?? null
    ]
  );
  if (!result.rows[0]) throw new HttpError(404, 'Item do catálogo não encontrado.');
  invalidateCatalogIndex();
  return toItem(result.rows[0]);
}

/** Mescla `sourceId` em `targetId`: o nome e os apelidos viram apelidos do destino e os itens dos enxovais migram. */
export async function mergeItems(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new HttpError(400, 'Escolha dois itens diferentes.');
  await withTransaction(async client => {
    const rows = await client.query<{ id: string; normalized_name: string }>(
      'SELECT id, normalized_name FROM catalog_items WHERE id = ANY($1::uuid[]) FOR UPDATE',
      [[sourceId, targetId]]
    );
    const source = rows.rows.find(row => row.id === sourceId);
    if (!source || !rows.rows.some(row => row.id === targetId)) throw new HttpError(404, 'Item do catálogo não encontrado.');
    await client.query('UPDATE catalog_item_aliases SET item_id = $2 WHERE item_id = $1', [sourceId, targetId]);
    await client.query('UPDATE items SET catalog_item_id = $2 WHERE catalog_item_id = $1', [sourceId, targetId]);
    // Os dois nomes precisam sair da tabela de itens antes de virar apelido (a chave é única nas duas).
    await client.query('DELETE FROM catalog_items WHERE id = $1', [sourceId]);
    await client.query(
      `INSERT INTO catalog_item_aliases (alias_normalized, item_id, source) VALUES ($1, $2, 'admin') ON CONFLICT (alias_normalized) DO NOTHING`,
      [source.normalized_name, targetId]
    );
  });
  invalidateCatalogIndex();
}

/* ------------------------------------------------------------------------ rotas */

export function registerCatalogRoutes(router: Router, deps: { requireUser: (req: Request) => Promise<AuthUser> }) {
  const typing = rateLimit(120, 10 * 60_000, 'Muitas buscas seguidas. Aguarde um instante.');

  // Autocomplete do catálogo (prefixo + similaridade), em memória: não consulta o Jev nem a rede.
  router.get('/catalog/search', typing, asyncHandler(async (req, res) => {
    await deps.requireUser(req);
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, MAX_ITEM_NAME_LENGTH * 2) : '';
    const limit = Math.min(15, Math.max(1, Number.parseInt(String(req.query.limit ?? '8'), 10) || 8));
    res.json({ results: await searchCatalog(getPool(), query, limit) });
  }));
  // Painel do /admin: métricas e fila de itens pendentes de revisão (aprovar, renomear, mesclar, completar com o Jev).
  router.get('/admin/catalog', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    res.json({ metrics: await catalogMetrics(getPool()), pending: await listPendingItems(getPool()) });
  }));

  router.patch('/admin/catalog/:id', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    res.json({ item: await approveItem(getPool(), String(req.params.id), req.body ?? {}) });
  }));

  router.post('/admin/catalog/:id/merge', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    if (typeof req.body?.targetId !== 'string') throw new HttpError(400, 'Informe o item de destino.');
    await mergeItems(String(req.params.id), req.body.targetId);
    res.status(204).end();
  }));

  // Pede ao Jev (uma única consulta) cômodo, prioridade, prazo e grupo de um item pendente; a equipe ainda aprova.
  router.post('/admin/catalog/:id/complete', asyncHandler(async (req, res) => {
    await requireAdmin(req);
    const id = String(req.params.id);
    const found = await getPool().query<CatalogRow>('SELECT * FROM catalog_items WHERE id = $1', [id]);
    if (!found.rows[0]) throw new HttpError(404, 'Item do catálogo não encontrado.');
    const groups = await getPool().query<{ function_group: string }>(
      'SELECT DISTINCT function_group FROM catalog_items WHERE function_group IS NOT NULL'
    );
    const inference = await inferCatalogEntry(found.rows[0].canonical_name, groups.rows.map(row => row.function_group));
    if (!inference) throw new HttpError(503, 'O Jev não está disponível agora.');
    await getPool().query(
      `UPDATE catalog_items SET room = COALESCE($2, room), priority = COALESCE($3, priority), timing = COALESCE($4, timing),
         function_group = COALESCE($5, function_group), updated_at = now() WHERE id = $1`,
      [id, inference.room, inference.priority, inference.timing, inference.functionGroup]
    );
    invalidateCatalogIndex();
    res.json({ inference });
  }));
}
