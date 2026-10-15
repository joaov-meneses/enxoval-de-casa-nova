// Inteligência do Casa Mia (Nino) com o Jev: ambiente e redundância de um item novo, próximo item essencial de um
// ambiente e urgência dos itens pendentes. Cada rota é uma ajuda opcional: sem chave do Jev, ou com confiança baixa,
// a resposta vem vazia e o app segue como sempre (ver server/services/jev.ts).
import type { Request, Router } from 'express';
import { getPool, Queryable } from './database.ts';
import { asyncHandler, HttpError, rateLimit } from './security.ts';
import {
  assessItem,
  candidatesFor,
  isJevConfigured,
  MAX_URGENCY_ITEMS,
  prioritizeItems,
  recommendNext,
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
    const assessment = await assessItem({
      name,
      environments: categories.map(category => category.name),
      classify: req.body?.classify === true,
      existing: items.filter(item => !isInactiveStatus(item.status)).map(item => ({ name: item.name, environment: item.category })),
      profile
    });

    const category = assessment?.environment
      ? categories.find(candidate => candidate.name === assessment.environment!.name)
      : undefined;
    res.json({
      available: true,
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
      item.categoryId === category.id && !isDoneStatus(item.status) && !isInactiveStatus(item.status));
    const scores = new Map<string, { urgency: number; confidence: number }>();
    for (const item of pending) {
      if (typeof item.aiUrgency === 'number') scores.set(item.id, { urgency: item.aiUrgency, confidence: item.aiUrgencyConfidence ?? 0 });
    }
    const cached = scores.size;

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
        // O nome e o ambiente entram na chave: se o item mudar depois, a nota guardada deixa de valer.
        await getPool().query(
          `UPDATE items SET ai_urgency = $3, ai_urgency_confidence = $4, ai_urgency_key = $5
           WHERE id = $1 AND enxoval_id = $2`,
          [item.id, enxovalId, Math.min(URGENCY_LEVELS, Math.max(1, result.urgency)), result.confidence, urgencyKey(item.name, item.category)]
        );
        scores.set(item.id, { urgency: result.urgency, confidence: result.confidence });
        inferred += 1;
      }
    }

    res.json({
      available: true,
      categoryId,
      scores: [...scores].map(([id, score]) => ({ id, ...score })),
      inferred,
      cached,
      unscored: pending.length - scores.size
    });
  }));
}
