// Inteligência do Casa Mia (Nino) com o Jev: ambiente e redundância de um item novo, próximo item essencial de um
// ambiente e urgência dos itens pendentes. Cada rota é uma ajuda opcional: sem chave do Jev, ou com confiança baixa,
// a resposta vem vazia e o app segue como sempre (ver server/services/jev.ts).
import type { Request, Router } from 'express';
import { getPool, Queryable } from './database.ts';
import { asyncHandler, HttpError, rateLimit } from './security.ts';
import {
  assessItem,
  bucketState,
  candidatesFor,
  CATALOG_ROOM_LABELS,
  isJevConfigured,
  MAX_URGENCY_ITEMS,
  prioritizeItems,
  profileBucket,
  recommendNext,
  urgencyKey,
  type JevProfile
} from './services/jev.ts';
import {
  catalogUrgencies,
  findRedundancy,
  getCatalogIndex,
  matchName,
  priceRangeOf,
  recordMetric,
  saveCatalogUrgencies
} from './catalog/store.ts';
import { categoryForRoom } from '../src/catalog/rooms.ts';
import { MAX_ITEM_NAME_LENGTH } from '../src/data.ts';
import { isDoneStatus } from '../src/itemStatus.ts';
import { weeksUntil } from '../src/onboarding/plan.ts';
import { roomOfCategory } from '../src/planning/purchasePlan.ts';
import { URGENCY_LEVELS } from '../src/planning/purchaseUrgency.ts';
import type { AuthUser, EnxovalCategory, EnxovalItem } from '../src/types.ts';

const HOUSINGS = ['apartamento', 'casa', 'studio', 'kitnet'];
const MIN_NAME_LENGTH = 3;

export interface AiDependencies {
  requireUser: (req: Request) => Promise<AuthUser>;
  fetchItems: (queryable: Queryable, userId: string, enxovalId: string) => Promise<EnxovalItem[]>;
  fetchCategories: (queryable: Queryable, userId: string, enxovalId: string) => Promise<EnxovalCategory[]>;
}

interface ProfileRow {
  move_date: string | null;
  state: string | null;
  city: string | null;
  spending_tier: string | null;
  onboarding_profile: Record<string, unknown> | null;
}

/** O que o Jev precisa saber da casa: moradia, moradores, lugar, perfil de gasto e prazo. Nada de nome nem e-mail. */
async function loadProfile(queryable: Queryable, enxovalId: string): Promise<JevProfile> {
  const result = await queryable.query<ProfileRow>(
    `SELECT to_char(move_date, 'YYYY-MM-DD') AS move_date, state, city, spending_tier, onboarding_profile
     FROM enxovais WHERE id = $1`,
    [enxovalId]
  );
  const row = result.rows[0];
  const onboarding = row?.onboarding_profile ?? {};
  const housing = typeof onboarding.housing === 'string' && HOUSINGS.includes(onboarding.housing) ? onboarding.housing : 'apartamento';
  const people = typeof onboarding.people === 'number' && Number.isInteger(onboarding.people) && onboarding.people >= 1 ? onboarding.people : 1;
  return {
    housing,
    moment: typeof onboarding.moment === 'string' ? onboarding.moment : 'solo',
    people,
    uf: row?.state ?? (typeof onboarding.state === 'string' ? onboarding.state : null),
    city: row?.city ?? null,
    spendingTier: row?.spending_tier ?? 'equilibrado',
    weeksToMove: row?.move_date ? weeksUntil(row.move_date) : null,
    worries: Array.isArray(onboarding.worries) ? onboarding.worries.filter((value): value is string => typeof value === 'string' && ['start', 'waste', 'forget', 'budget', 'time'].includes(value)) : [],
    usage: Array.isArray(onboarding.usage) ? onboarding.usage.filter((value): value is string => typeof value === 'string' && ['buy', 'spend', 'links', 'share'].includes(value)) : [],
    owned: typeof onboarding.owned === 'string' && ['nada', 'algumas', 'boa'].includes(onboarding.owned) ? onboarding.owned : undefined,
    style: typeof onboarding.style === 'string' && ['full', 'min', 'none'].includes(onboarding.style) ? onboarding.style : undefined
  };
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${label} é obrigatório.`);
  return value.trim();
}

export function registerAiRoutes(router: Router, deps: AiDependencies) {
  const { requireUser, fetchItems, fetchCategories } = deps;
  // As rotas que a pessoa dispara sozinha (ao digitar) têm um teto maior que as de botão.
  const typing = rateLimit(60, 10 * 60_000, 'Muitas consultas seguidas. Aguarde um instante.');
  const button = rateLimit(20, 10 * 60_000, 'Muitas consultas seguidas. Aguarde um instante.');

  // O app só mostra a ajuda do Nino quando a chave do Jev está configurada.
  router.get('/ai/status', asyncHandler(async (req, res) => {
    await requireUser(req);
    res.json({ enabled: isJevConfigured() });
  }));

  // Ao preencher um item novo: sugere o ambiente (se a pessoa ainda não escolheu) e avisa de compra redundante.
  router.post('/ai/assess-item', typing, asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const enxovalId = requireString(req.body?.enxovalId, 'Enxoval');
    const name = requireString(req.body?.name, 'Nome do item');
    if (name.length > MAX_ITEM_NAME_LENGTH) throw new HttpError(400, `O nome do item pode ter no máximo ${MAX_ITEM_NAME_LENGTH} caracteres.`);

    const empty = { environment: null, redundancy: null, catalogItem: null };
    if (name.length < MIN_NAME_LENGTH) {
      await fetchCategories(getPool(), user.id, enxovalId);
      res.json({ available: isJevConfigured(), ...empty });
      return;
    }

    const [categories, items, profile, catalog] = await Promise.all([
      fetchCategories(getPool(), user.id, enxovalId),
      fetchItems(getPool(), user.id, enxovalId),
      loadProfile(getPool(), enxovalId),
      getCatalogIndex()
    ]);
    const classify = req.body?.classify === true;
    const active = items;

    // 1º o catálogo: item conhecido tem cômodo e grupo de função gravados, e a resposta sai do banco, sem Jev.
    const known = matchName(catalog, name).item;
    if (known) {
      recordMetric('assess_catalog');
      const overlapsWith = findRedundancy(catalog, known, name, active.map(item => ({ name: item.name, catalogItemId: item.catalogItemId ?? null })));
      let environment: { id: string; name: string; confidence: number } | null = null;
      if (classify) {
        const category = categoryForRoom(categories, known.room);
        if (category) environment = { id: category.id, name: category.name, confidence: 1 };
        else if (isJevConfigured() && categories.length >= 2) {
          // O catálogo não sabe o cômodo, ou o enxoval não tem esse ambiente: só o ambiente vai ao Jev.
          const assessment = await assessItem({ name, environments: categories.map(c => c.name), classify: true, existing: [], profile });
          const chosen = assessment?.environment ? categories.find(c => c.name === assessment.environment!.name) : undefined;
          if (chosen && assessment?.environment) environment = { id: chosen.id, name: chosen.name, confidence: assessment.environment.confidence };
        }
      }
      res.json({
        available: true,
        source: 'catalog',
        catalogItem: { id: known.id, name: known.name, priceRange: priceRangeOf(catalog, known.id, profile.uf) },
        environment,
        redundancy: overlapsWith ? { probability: 1, overlapsWith } : null
      });
      return;
    }

    if (!isJevConfigured()) {
      res.json({ available: false, ...empty });
      return;
    }
    recordMetric('assess_jev');
    const assessment = await assessItem({
      name,
      environments: categories.map(category => category.name),
      classify,
      existing: active.map(item => ({ name: item.name, environment: item.category })),
      profile
    });

    const category = assessment?.environment
      ? categories.find(candidate => candidate.name === assessment.environment!.name)
      : undefined;
    res.json({
      available: true,
      source: 'jev',
      catalogItem: null,
      environment: category && assessment?.environment
        ? { id: category.id, name: category.name, confidence: assessment.environment.confidence }
        : null,
      redundancy: assessment?.redundancy ?? null
    });
  }));

  // Próximo item essencial de um ambiente, escolhido entre os itens do catálogo que ainda não estão na lista.
  router.post('/ai/recommend', button, asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const enxovalId = requireString(req.body?.enxovalId, 'Enxoval');
    const categoryId = requireString(req.body?.categoryId, 'Ambiente');

    const [categories, items, profile] = await Promise.all([
      fetchCategories(getPool(), user.id, enxovalId),
      fetchItems(getPool(), user.id, enxovalId),
      loadProfile(getPool(), enxovalId)
    ]);
    const category = categories.find(candidate => candidate.id === categoryId);
    if (!category) throw new HttpError(404, 'Ambiente não encontrado.');
    if (!isJevConfigured()) {
      res.json({ available: false, recommendation: null, reason: 'unavailable' });
      return;
    }

    const room = roomOfCategory(category.name);
    if (!room) {
      res.json({ available: true, recommendation: null, reason: 'unknown_room' });
      return;
    }
    const active = items;
    // Quem já tem o item em outro ambiente não precisa dele de novo: o filtro olha a lista inteira.
    const candidates = candidatesFor(room, active.map(item => item.name), profile);
    const recommendation = await recommendNext({
      environment: category.name,
      existing: active.filter(item => item.categoryId === category.id).map(item => item.name),
      candidates,
      profile
    });
    res.json({
      available: true,
      recommendation: recommendation
        ? { ...recommendation, categoryId: category.id, categoryName: category.name }
        : null,
      reason: recommendation ? undefined : candidates.length === 0 ? 'complete' : 'none'
    });
  }));

  // Urgência (1 a 5) dos itens pendentes de um ambiente. Cada nota é inferida uma vez e guardada no item: as próximas
  // consultas só gastam o Jev com itens novos, ou renomeados e movidos de ambiente (a nota guardada deixa de valer).
  router.post('/ai/prioritize', button, asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const enxovalId = requireString(req.body?.enxovalId, 'Enxoval');
    const categoryId = requireString(req.body?.categoryId, 'Ambiente');
    const [categories, items, profile] = await Promise.all([
      fetchCategories(getPool(), user.id, enxovalId),
      fetchItems(getPool(), user.id, enxovalId),
      loadProfile(getPool(), enxovalId)
    ]);
    const category = categories.find(candidate => candidate.id === categoryId);
    if (!category) throw new HttpError(404, 'Ambiente não encontrado.');

    const empty = { categoryId, scores: [], inferred: 0, cached: 0, unscored: 0 };
    if (!isJevConfigured()) {
      res.json({ available: false, ...empty });
      return;
    }

    const pending = items.filter(item =>
      item.categoryId === category.id && !isDoneStatus(item.status));
    const scores = new Map<string, { urgency: number; confidence: number }>();
    for (const item of pending) {
      if (typeof item.aiUrgency === 'number') scores.set(item.id, { urgency: item.aiUrgency, confidence: item.aiUrgencyConfidence ?? 0 });
    }
    const cached = scores.size;

    // O nome e o ambiente entram na chave: se o item mudar depois, a nota guardada no item deixa de valer.
    const mirror = async (item: EnxovalItem, score: { urgency: number; confidence: number }) => {
      await getPool().query(
        `UPDATE items SET ai_urgency = $3, ai_urgency_confidence = $4, ai_urgency_key = $5
         WHERE id = $1 AND enxoval_id = $2`,
        [item.id, enxovalId, Math.min(URGENCY_LEVELS, Math.max(1, score.urgency)), score.confidence, urgencyKey(item.name, item.category)]
      );
      scores.set(item.id, score);
    };

    // Itens do catálogo: a nota é da faixa de perfil (moradia × clima × situação) e vale para todos os enxovais. O
    // Jev só é chamado para a faixa que ainda não tem nota; `items.ai_urgency` vira um espelho de leitura rápida.
    const missing = pending.filter(item => !scores.has(item.id));
    const linked = missing.filter(item => item.catalogItemId);
    const bucket = profileBucket(profile);
    const catalogIds = [...new Set(linked.map(item => item.catalogItemId!))];
    const shared = await catalogUrgencies(getPool(), catalogIds, bucket);
    let fromCatalog = 0;
    let inferred = 0;
    const absent = catalogIds.filter(id => !shared.has(id)).slice(0, MAX_URGENCY_ITEMS);
    if (absent.length > 0) {
      const catalog = await getCatalogIndex();
      const results = await prioritizeItems({
        items: absent.map(id => {
          const entry = catalog.items.get(id);
          const sample = linked.find(item => item.catalogItemId === id)!;
          return { id, name: entry?.name ?? sample.name, environment: entry?.room ? CATALOG_ROOM_LABELS[entry.room] : sample.category };
        }),
        state: bucketState(bucket)
      });
      await saveCatalogUrgencies(getPool(), bucket, results ?? []);
      for (const result of results ?? []) shared.set(result.id, { urgency: result.urgency, confidence: result.confidence });
      inferred += results?.length ?? 0;
    }
    for (const item of linked) {
      const score = shared.get(item.catalogItemId!);
      if (!score) continue;
      await mirror(item, score);
      fromCatalog += 1;
    }
    recordMetric('urgency_catalog', fromCatalog);

    // Itens livres (sem par no catálogo): nota por item, com a casa inteira da pessoa, como antes.
    const free = missing.filter(item => !item.catalogItemId).slice(0, MAX_URGENCY_ITEMS);
    if (free.length > 0) {
      const results = await prioritizeItems({
        items: free.map(item => ({ id: item.id, name: item.name, environment: item.category })),
        profile
      });
      const byId = new Map(free.map(item => [item.id, item]));
      for (const result of results ?? []) {
        const item = byId.get(result.id);
        if (!item) continue;
        await mirror(item, { urgency: result.urgency, confidence: result.confidence });
        inferred += 1;
      }
    }

    recordMetric('urgency_jev', inferred);
    res.json({
      available: true,
      categoryId,
      scores: [...scores].map(([id, score]) => ({ id, ...score })),
      inferred,
      cached,
      shared: fromCatalog,
      unscored: pending.length - scores.size
    });
  }));
}
