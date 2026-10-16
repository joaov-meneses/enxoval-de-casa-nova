// Inteligência do Casa Mia (Nino) com o Jev: ambiente e redundância de um item novo, próximo item essencial de um
// ambiente e urgência dos itens pendentes. Cada rota é uma ajuda opcional: sem chave do Jev, ou com confiança baixa,
// a resposta vem vazia e o app segue como sempre (ver server/services/jev.ts).
import type { Request, Router } from 'express';
import {
  createPendingItem,
  learnAlias,
  loadBucketUrgencies,
  lookupExact,
  profileBucket,
  recordMetric,
  resolveItem,
  roomMatches,
  saveBucketUrgency,
  type CatalogItem
} from './catalog.ts';
import { getPool, Queryable } from './database.ts';
import { asyncHandler, HttpError, rateLimit } from './security.ts';
import {
  assessItem,
  candidatesFor,
  chooseSameItem,
  isJevConfigured,
  MAX_URGENCY_ITEMS,
  prioritizeItems,
  recommendNext,
  setJevCallObserver,
  urgencyKey,
  type JevProfile
} from './services/jev.ts';
import { MAX_ITEM_NAME_LENGTH } from '../src/data.ts';
import { isDoneStatus, isInactiveStatus } from '../src/itemStatus.ts';
import { weeksUntil } from '../src/onboarding/plan.ts';
import { roomOfCategory } from '../src/planning/purchasePlan.ts';
import { URGENCY_LEVELS } from '../src/planning/purchaseUrgency.ts';
import type { AuthUser, EnxovalCategory, EnxovalItem } from '../src/types.ts';

const HOUSINGS = ['apartamento', 'casa', 'studio'];
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
    weeksToMove: row?.move_date ? weeksUntil(row.move_date) : null
  };
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${label} é obrigatório.`);
  return value.trim();
}

export function registerAiRoutes(router: Router, deps: AiDependencies) {
  const { requireUser, fetchItems, fetchCategories } = deps;
  // Cada chamada que de fato chega ao Jev entra nas métricas do catálogo (custo por dia).
  setJevCallObserver(() => void recordMetric('jev_call'));
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

    const empty = { environment: null, redundancy: null };
    if (!isJevConfigured()) {
      await fetchCategories(getPool(), user.id, enxovalId);
      res.json({ available: false, ...empty });
      return;
    }
    if (name.length < MIN_NAME_LENGTH) {
      res.json({ available: true, ...empty });
      return;
    }

    const [categories, items, profile] = await Promise.all([
      fetchCategories(getPool(), user.id, enxovalId),
      fetchItems(getPool(), user.id, enxovalId),
      loadProfile(getPool(), enxovalId)
    ]);
    const active = items.filter(item => !isInactiveStatus(item.status));

    // Cascata: catálogo primeiro (exato, apelido, similar); o Jev só desempata dúvida ou cobre o que o catálogo não sabe.
    let resolution = await resolveItem(getPool(), name);
    if (resolution.kind === 'doubt') {
      const chosen = await chooseSameItem(name, resolution.candidates.map(candidate => candidate.item.canonicalName));
      const picked = resolution.candidates.find(candidate => candidate.item.canonicalName === chosen);
      if (picked) {
        await learnAlias(getPool(), picked.item.id, name, 'jev');
        resolution = { kind: 'match', item: picked.item, via: 'alias', score: 1 };
      }
    }
    const known = resolution.kind === 'match' ? resolution.item : null;

    // Ambiente: o cômodo do item no catálogo, quando a pessoa tem um ambiente desse cômodo.
    const fromCatalog = known && req.body?.classify === true
      ? categories.find(category => roomMatches(known.room, roomOfCategory(category.name)))
      : undefined;

    // Redundância: outro item da lista que é o mesmo do catálogo (ou do mesmo grupo de função) responde sem Jev.
    let overlap: string | null = null;
    let redundancyKnown = false;
    if (known) {
      for (const item of active) {
        const other = await lookupExact(getPool(), item.name);
        if (other && (other.id === known.id || (known.functionGroup && other.functionGroup === known.functionGroup))) {
          overlap = item.name;
          break;
        }
      }
      redundancyKnown = overlap !== null || known.functionGroup !== null;
    }

    const askEnvironment = req.body?.classify === true && !fromCatalog;
    let assessment = null;
    if (askEnvironment || !redundancyKnown) {
      assessment = await assessItem({
        name,
        environments: categories.map(category => category.name),
        classify: askEnvironment,
        existing: redundancyKnown ? [] : active.map(item => ({ name: item.name, environment: item.category })),
        profile
      });
    }

    const category = fromCatalog
      ?? (assessment?.environment ? categories.find(candidate => candidate.name === assessment!.environment!.name) : undefined);
    const confidence = fromCatalog ? 1 : assessment?.environment?.confidence ?? 0;
    const redundancy = overlap
      ? { probability: 1, overlapsWith: overlap }
      : redundancyKnown ? null : assessment?.redundancy ?? null;

    // Aprendizado: o que o catálogo ainda não conhece vira item pendente de revisão, para o próximo enxoval já achar.
    void recordMetric(known ? 'resolve_hit' : 'resolve_miss');
    if (!known) {
      void createPendingItem(getPool(), name, { room: category ? roomOfCategory(category.name) : null, source: 'users' })
        .catch(err => console.warn('[catalog] Item novo não gravado:', err instanceof Error ? err.message : err));
    }

    res.json({
      available: true,
      environment: category ? { id: category.id, name: category.name, confidence } : null,
      redundancy
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
    const active = items.filter(item => !isInactiveStatus(item.status));
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

  // Urgência dos itens pendentes de um ambiente. A nota é inferida uma vez por faixa de perfil e guardada no catálogo
  // compartilhado: o Jev só é consultado para itens que nenhum enxoval do mesmo perfil já avaliou. O item guarda um
  // espelho da nota (leitura rápida), que deixa de valer se ele for renomeado ou movido de ambiente.
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
      item.categoryId === category.id && !isDoneStatus(item.status) && !isInactiveStatus(item.status));
    const scores = new Map<string, { urgency: number; confidence: number }>();
    for (const item of pending) {
      if (typeof item.aiUrgency === 'number') scores.set(item.id, { urgency: item.aiUrgency, confidence: item.aiUrgencyConfidence ?? 0 });
    }
    let cached = scores.size;

    // Liga cada item ao catálogo (exato, apelido ou similaridade alta; sem Jev).
    const catalogOf = new Map<string, CatalogItem>();
    for (const item of pending) {
      const resolution = await resolveItem(getPool(), item.name);
      if (resolution.kind === 'match') catalogOf.set(item.id, resolution.item);
    }

    const bucket = profileBucket(profile);
    const shared = await loadBucketUrgencies(getPool(), [...new Set([...catalogOf.values()].map(entry => entry.id))], bucket);
    const mirror = (item: EnxovalItem, urgency: number, confidence: number) => getPool().query(
      `UPDATE items SET ai_urgency = $3, ai_urgency_confidence = $4, ai_urgency_key = $5, catalog_item_id = COALESCE($6, catalog_item_id)
       WHERE id = $1 AND enxoval_id = $2`,
      // O nome e o ambiente entram na chave: se o item mudar depois, a nota guardada deixa de valer.
      [item.id, enxovalId, Math.min(URGENCY_LEVELS, Math.max(1, urgency)), confidence, urgencyKey(item.name, item.category), catalogOf.get(item.id)?.id ?? null]
    );

    for (const item of pending) {
      if (scores.has(item.id)) continue;
      const known = catalogOf.get(item.id);
      const hit = known ? shared.get(known.id) : undefined;
      if (!hit) continue;
      await mirror(item, hit.urgency, hit.confidence);
      scores.set(item.id, hit);
      cached += 1;
    }

    const missing = pending.filter(item => !scores.has(item.id)).slice(0, MAX_URGENCY_ITEMS);
    let inferred = 0;
    if (missing.length > 0) {
      const results = await prioritizeItems({
        items: missing.map(item => ({ id: item.id, name: item.name, environment: item.category })),
        profile
      });
      const names = new Map(missing.map(item => [item.id, item]));
      for (const result of results ?? []) {
        const item = names.get(result.id);
        if (!item) continue;
        // Item que o catálogo não conhecia entra como pendente de revisão, para o próximo enxoval já achar a nota.
        let entry = catalogOf.get(item.id);
        if (!entry) {
          const created = await createPendingItem(getPool(), item.name, { room: roomOfCategory(item.category), source: 'users' });
          if (created) catalogOf.set(item.id, (entry = created));
        }
        await mirror(item, result.urgency, result.confidence);
        if (entry) await saveBucketUrgency(getPool(), entry.id, bucket, result.urgency, result.confidence);
        scores.set(item.id, { urgency: result.urgency, confidence: result.confidence });
        inferred += 1;
      }
    }
    void recordMetric('resolve_hit', cached);
    void recordMetric('resolve_miss', inferred);

    // Prazo: item com entrega e montagem demoradas, com a mudança dentro da antecedência necessária, vira "comprar já".
    // É feito aqui, na resposta, porque a nota guardada é compartilhada e não conhece a data de ninguém.
    const urgent = (item: EnxovalItem, urgency: number) => {
      const lead = catalogOf.get(item.id)?.leadTimeWeeks;
      return lead && profile.weeksToMove !== null && profile.weeksToMove <= lead + 1 ? URGENCY_LEVELS : urgency;
    };
    const byId = new Map(pending.map(item => [item.id, item]));

    res.json({
      available: true,
      categoryId,
      scores: [...scores].map(([id, score]) => ({ id, ...score, urgency: byId.has(id) ? urgent(byId.get(id)!, score.urgency) : score.urgency })),
      inferred,
      cached,
      unscored: pending.length - scores.size
    });
  }));
}
