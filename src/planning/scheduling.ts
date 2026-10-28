import { foldText } from '../catalog/normalize';
import { isDoneStatus, netPriceCents } from '../itemStatus';
import { addMonthKey, installmentPlan, monthOf } from './installments';
import { currentWeek, itemBand, itemMeta, weekRange, MAX_BUY_WEEK, MIN_BUY_WEEK, type Placement, type PlannableItem } from './purchasePlan';
import type { SpendingTier } from './spending';

export interface SchedulingInput {
  leadTimeWeeks?: number | null;
  researchWeeks?: number | null;
  hasTemporarySolution?: boolean;
  dependsOnItemId?: string | null;
  aiUrgency?: number | null;
  aiUrgencyConfidence?: number | null;
  installments?: number;
  installmentCents?: number | null;
  firstInstallmentOn?: string | null;
  purchasedAt?: string | null;
  updatedAt?: string;
}

export interface SchedulingOptions {
  moveDate?: string | null;
  monthlyBudgetCents?: number | null;
  now?: Date;
}

export function purchaseLeadTime(item: PlannableItem) {
  const explicit = item.leadTimeWeeks != null;
  const catalog = item.catalog?.leadTimeWeeks ?? 0;
  const large = /^(geladeira|refrigerador|fogao|cama|base de cama|colchao|guarda[- ]roupa|sofa|maquina de lavar|lava e seca|armario|roupeiro)\b/.test(foldText(item.name));
  const delivery = Math.max(0, Math.min(52, explicit ? item.leadTimeWeeks! : catalog > 0 ? catalog : large ? 4 : 0));
  const research = Math.max(0, Math.min(12, item.researchWeeks ?? 1));
  return { delivery, research, estimated: !explicit };
}

/** Same payment amounts as the installments view; unknown prices use a labelled reference estimate. */
export function planningPayments(item: PlannableItem, week: number, tier: SpendingTier, options: SchedulingOptions) {
  if (item.status !== 'researching' && item.status !== 'bought') return [];
  const now = options.now ?? new Date();
  const current = monthOf(now);
  let first = item.status === 'bought'
    ? monthOf(item.purchasedAt ?? item.updatedAt ?? now)
    : options.moveDate ? monthOf(weekRange(options.moveDate, week).start) : null;
  if (item.status === 'researching' && first && first < current) first = current;
  const { band } = itemBand(item, tier);
  const price = netPriceCents(item) || (item.status === 'researching' ? Math.round((band.minCents + band.maxCents) / 2) : 0);
  const schedule = installmentPlan({ ...item, priceCents: price, discountCents: 0 }, first);
  if (!schedule?.firstMonth) return [];
  return schedule.amounts.map((cents, index) => ({ month: addMonthKey(schedule.firstMonth!, index), cents }))
    .filter(payment => payment.month >= current);
}

export interface BudgetConflict { month: string; totalCents: number; excessCents: number; itemIds: string[]; }

export function planningBudget(items: readonly PlannableItem[], placements: Map<string, Placement>, tier: SpendingTier, options: SchedulingOptions): BudgetConflict[] {
  const budget = options.monthlyBudgetCents;
  if (!budget || !options.moveDate) return [];
  const months = new Map<string, { total: number; ids: Set<string> }>();
  for (const item of items) for (const payment of planningPayments(item, placements.get(item.id)?.week ?? 0, tier, options)) {
    const entry = months.get(payment.month) ?? { total: 0, ids: new Set<string>() };
    entry.total += payment.cents;
    entry.ids.add(item.id);
    months.set(payment.month, entry);
  }
  return [...months].filter(([, entry]) => entry.total > budget).sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entry]) => ({ month, totalCents: entry.total, excessCents: entry.total - budget, itemIds: [...entry.ids] }));
}

/** AI supplies need; delivery/research supply lead time. Manual dates are always preserved. */
export function refineSchedule(items: readonly PlannableItem[], placements: Map<string, Placement>, tier: SpendingTier, options: SchedulingOptions) {
  const byId = new Map(items.map(item => [item.id, item]));
  for (const item of items) {
    const placement = placements.get(item.id)!;
    if (placement.source === 'manual') continue;
    const meta = itemMeta(item);
    const lead = purchaseLeadTime(item);
    const scored = typeof item.aiUrgency === 'number' && (item.aiUrgencyConfidence ?? 0) >= .5;
    const score = scored ? Math.min(8, Math.max(1, Math.round(item.aiUrgency!))) : null;
    const needed = score !== null ? [26, 12, 4, 1, 0, 0, 0, 0][score - 1] : meta.timing ? 0 : meta.priority === 'essential' ? 0 : null;
    if (needed !== null) {
      const earliest = item.hasTemporarySolution ? Math.max(4, needed) : needed;
      placement.week = Math.max(MIN_BUY_WEEK, earliest - lead.delivery - lead.research);
      placement.reason = item.hasTemporarySolution
        ? 'Você tem uma solução temporária: a substituição pode chegar a partir do segundo mês.'
        : scored ? 'Necessidade avaliada pelo Nino para a rotina da sua casa.'
        : meta.timing === 'first_night' ? 'Precisa estar pronto na primeira noite.'
        : meta.priority === 'essential' ? 'Essencial para a casa funcionar na mudança.' : 'Pode esperar a casa se organizar.';
      placement.reason += ` Reservamos ${lead.research} ${lead.research === 1 ? 'semana' : 'semanas'} para pesquisa e ${lead.delivery} para entrega, montagem e instalação.`;
      if (lead.estimated) placement.reason += ' Prazo de entrega estimado; ajuste conforme a loja.';
      placement.spread = false;
    } else if (item.hasTemporarySolution) {
      placement.reason += ' Você já tem uma solução temporária.';
    }
  }

  const budget = options.moveDate ? options.monthlyBudgetCents : null;
  const load = new Map<string, number>();
  const reserve = (item: PlannableItem) => {
    for (const p of planningPayments(item, placements.get(item.id)!.week, tier, options)) load.set(p.month, (load.get(p.month) ?? 0) + p.cents);
  };
  const flexible = (item: PlannableItem) => {
    if (isDoneStatus(item.status) || placements.get(item.id)!.source === 'manual' || item.firstInstallmentOn) return false;
    if (item.hasTemporarySolution) return true;
    if (typeof item.aiUrgency === 'number' && (item.aiUrgencyConfidence ?? 0) >= .5) return item.aiUrgency < 4.5;
    const meta = itemMeta(item);
    return meta.priority !== 'essential' && !meta.timing;
  };
  for (const item of items) if (!flexible(item)) reserve(item);
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered = [...items].sort((a, b) => placements.get(a.id)!.week - placements.get(b.id)!.week);
  function place(item: PlannableItem) {
    if (visited.has(item.id)) return;
    if (visiting.has(item.id)) return; // Old/imported cyclic data must never hang the planner.
    visiting.add(item.id);
    const placement = placements.get(item.id)!;
    const previousWeek = placement.week;
    const previousPayments = !flexible(item) ? planningPayments(item, previousWeek, tier, options) : [];
    const dependency = item.dependsOnItemId ? byId.get(item.dependsOnItemId) : undefined;
    if (dependency && !isDoneStatus(dependency.status)) {
      place(dependency);
      const dependencyWeek = placements.get(dependency.id)!.week;
      if (placement.source === 'auto' && placement.week < dependencyWeek) {
        placement.week = dependencyWeek;
        placement.reason += ` Compre junto ou depois de ${dependency.name}; confirme a compatibilidade primeiro.`;
        if (itemMeta(item).priority === 'essential' && !item.hasTemporarySolution)
          placement.reason += ' Atenção: a dependência adia um item essencial. Revise as semanas para ele chegar a tempo.';
      } else if (placement.week < dependencyWeek) {
        placement.reason += ` Atenção: sua semana vem antes de ${dependency.name}. Confirme a compatibilidade ou ajuste as datas.`;
      } else {
        placement.reason += ` Depende de ${dependency.name}: confirme medidas e compatibilidade.`;
      }
    }
    if (!flexible(item) && placement.week !== previousWeek) {
      for (const payment of previousPayments) load.set(payment.month, (load.get(payment.month) ?? 0) - payment.cents);
      reserve(item);
    }
    if (flexible(item)) {
      if (budget && budget > 0) {
        const original = placement.week;
        placement.week = Math.min(MAX_BUY_WEEK, Math.max(placement.week, currentWeek(options.moveDate!, options.now)));
        const payments = () => planningPayments(item, placement.week, tier, options);
        const impossible = payments().some(p => p.cents > budget);
        while (!impossible && placement.week < MAX_BUY_WEEK && payments().some(p => (load.get(p.month) ?? 0) + p.cents > budget)) placement.week++;
        if (placement.week > original) {
          placement.spread = true;
          placement.reason += ' Compra distribuída para respeitar o orçamento mensal e as parcelas já assumidas.';
        }
        if (impossible) placement.reason += ' O valor mensal deste item sozinho ultrapassa o orçamento; ajuste o valor, as parcelas ou o teto.';
      }
      reserve(item);
    }
    visiting.delete(item.id);
    visited.add(item.id);
  }
  ordered.forEach(place);
  return placements;
}
