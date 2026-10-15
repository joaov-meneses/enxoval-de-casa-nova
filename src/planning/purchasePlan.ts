/**
 * Planejamento de compras em torno da data da mudança.
 *
 * Cada item tem uma semana de compra, contada a partir da semana da mudança: negativa antes, 0 na semana
 * da mudança e positiva depois. A semana pode ser sugerida pelo algoritmo (`planPurchases`) ou escolhida
 * pela pessoa (`buyWeek` no item): a escolha dela sempre vale mais que a sugestão.
 *
 * As semanas ficam agrupadas em períodos (antes da mudança, primeira semana, primeiro mês, meses 2 e 3...)
 * e cada período tem uma faixa de gasto de referência, que depende do perfil de gasto do enxoval. O
 * verificador compara o que a pessoa já registrou em cada período com essa faixa.
 */
import { CATALOG, type CatalogEntry } from "../onboarding/catalog";
import {
  addBands,
  bandFor,
  EMPTY_BAND,
  isPriceCategory,
  SPENDING_TIERS,
  type Band,
  type PriceCategory,
  type SpendingTier,
} from "./spending";
import {
  isDoneStatus,
  isInactiveStatus,
  netPriceCents,
  type ItemStatus,
} from "../itemStatus";

export type ItemPriority = "essential" | "optional";
/** Quando o item precisa estar pronto, se o catálogo sabe: na primeira noite ou já na primeira semana. */
export type ItemTiming = "first_night" | "first_week";

export const MIN_BUY_WEEK = -52;
export const MAX_BUY_WEEK = 104;

export function isBuyWeek(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_BUY_WEEK &&
    value <= MAX_BUY_WEEK
  );
}

/** O que o planejamento precisa saber de um item (um `EnxovalItem` já serve). */
export interface PlannableItem {
  id: string;
  name: string;
  /** Nome do ambiente: dá a urgência de cada cômodo. */
  category: string;
  status: ItemStatus;
  priceCents: number | null;
  discountCents: number;
  /** Semana escolhida pela pessoa; null deixa a escolha com o algoritmo. */
  buyWeek?: number | null;
  priceCategory?: PriceCategory | null;
  priority?: ItemPriority | null;
  timing?: ItemTiming | null;
}

/* ------------------------------------------------------------------ catálogo */

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CATALOG_BY_NAME = (() => {
  const map = new Map<string, CatalogEntry>();
  for (const entry of CATALOG) {
    const names = entry.name.includes("{cama}")
      ? [
          entry.name.replace("{cama}", "de casal"),
          entry.name.replace("{cama}", "de solteiro"),
        ]
      : [entry.name];
    for (const name of names) {
      const key = normalizeName(name);
      if (!map.has(key)) map.set(key, entry);
    }
  }
  return map;
})();

/** Item do catálogo com o mesmo nome (sem acento nem caixa), ou undefined para itens da própria pessoa. */
export function matchCatalog(name: string): CatalogEntry | undefined {
  return CATALOG_BY_NAME.get(normalizeName(name));
}

/** Categoria de preço a partir do valor informado, para itens que o catálogo não conhece. */
function categoryFromPrice(priceCents: number | null): PriceCategory {
  const price = priceCents ?? 0;
  if (price >= 120_000) return 4;
  if (price >= 25_000) return 3;
  if (price >= 8_000) return 2;
  return price > 0 ? 1 : 2;
}

export interface ItemMeta {
  priceCategory: PriceCategory;
  priority: ItemPriority;
  timing: ItemTiming | null;
  /** Os dados vieram do catálogo ou do preço, e não gravados no item. */
  inferred: boolean;
}

/** Dados gravados no item quando existem; senão o catálogo; senão o valor informado pela pessoa. */
export function itemMeta(item: PlannableItem): ItemMeta {
  const match = matchCatalog(item.name);
  const storedCategory = isPriceCategory(item.priceCategory) ? item.priceCategory : null;
  const priceCategory =
    storedCategory ?? match?.tier ?? categoryFromPrice(item.priceCents);
  const priority: ItemPriority =
    item.priority ?? (match?.flags.includes("E") ? "essential" : "optional");
  const timing: ItemTiming | null =
    item.timing ??
    (match?.flags.includes("I")
      ? "first_night"
      : match?.flags.includes("U")
        ? "first_week"
        : null);
  return {
    priceCategory,
    priority,
    timing,
    inferred: !storedCategory || !item.priority,
  };
}

/* ----------------------------------------------------------------- cômodos */

export type Room =
  | "cozinha"
  | "eletro"
  | "sala"
  | "quarto"
  | "quartoExtra"
  | "banheiro"
  | "servico"
  | "externa"
  | "escritorio";

export function roomOfCategory(categoryName: string): Room | null {
  const name = normalizeName(categoryName);
  if (/cozinha/.test(name)) return "cozinha";
  if (/eletro/.test(name)) return "eletro";
  if (/extra|hospede|visita/.test(name)) return "quartoExtra";
  if (/quarto|sala/.test(name)) return /sala/.test(name) ? "sala" : "quarto";
  if (/banheiro|lavabo/.test(name)) return "banheiro";
  if (/servico|lavanderia/.test(name)) return "servico";
  if (/home\s*office|escritorio/.test(name)) return "escritorio";
  if (/varanda|sacada|quintal|jardim|externa/.test(name)) return "externa";
  return null;
}

/** Semanas a mais que cada cômodo espera antes de receber compras opcionais (primeiro o que se usa todo dia). */
const ROOM_DELAY: Record<Room, number> = {
  quarto: 0,
  banheiro: 0,
  cozinha: 0,
  eletro: 1,
  servico: 1,
  sala: 2,
  escritorio: 3,
  quartoExtra: 4,
  externa: 6,
};
const UNKNOWN_ROOM_DELAY = 2;

/* ---------------------------------------------------------------- períodos */

export type PeriodId = "before" | "week1" | "month1" | "month3" | "month6" | "later";

export interface Period {
  id: PeriodId;
  label: string;
  /** Explicação curta do intervalo. */
  hint: string;
  fromWeek: number;
  toWeek: number;
}

export const PERIODS: readonly Period[] = [
  { id: "before", label: "Antes da mudança", hint: "Até a semana anterior à mudança", fromWeek: MIN_BUY_WEEK, toWeek: -1 },
  { id: "week1", label: "Primeira semana", hint: "A semana da mudança", fromWeek: 0, toWeek: 0 },
  { id: "month1", label: "Primeiro mês", hint: "Semanas 2 a 4 na casa nova", fromWeek: 1, toWeek: 3 },
  { id: "month3", label: "Meses 2 e 3", hint: "Da 5ª à 12ª semana", fromWeek: 4, toWeek: 11 },
  { id: "month6", label: "Meses 4 a 6", hint: "Da 13ª à 26ª semana", fromWeek: 12, toWeek: 25 },
  { id: "later", label: "Depois dos 6 meses", hint: "A partir da 27ª semana", fromWeek: 26, toWeek: MAX_BUY_WEEK },
];

export function periodOfWeek(week: number): Period {
  return (
    PERIODS.find((period) => week >= period.fromWeek && week <= period.toWeek) ??
    PERIODS[week < 0 ? 0 : PERIODS.length - 1]
  );
}

export function weekLabel(week: number) {
  if (week < 0) return week === -1 ? "1 semana antes" : `${-week} semanas antes`;
  if (week === 0) return "Semana da mudança";
  return week === 1 ? "1 semana depois" : `${week} semanas depois`;
}

/* ------------------------------------------------------------------- datas */

const DAY_MS = 86_400_000;

function parseDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Primeiro e último dia (inclusive) de uma semana de compra, dada a data da mudança. */
export function weekRange(moveDate: string, week: number) {
  const base = parseDate(moveDate);
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() + week * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start, end };
}

/** Semana em que "hoje" cai em relação à mudança (negativa antes, 0 na semana da mudança). */
export function currentWeek(moveDate: string, now = new Date()) {
  const days = Math.round((startOfDay(now).getTime() - parseDate(moveDate).getTime()) / DAY_MS);
  return Math.floor(days / 7);
}

const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

/** "12 a 18 de nov." ou "28 de nov. a 4 de dez." */
export function formatWeekRange(moveDate: string, week: number) {
  const { start, end } = weekRange(moveDate, week);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} a ${shortDate.format(end)}`;
  }
  return `${shortDate.format(start)} a ${shortDate.format(end)}`;
}

/* ---------------------------------------------------------------- algoritmo */

/**
 * Quando comprar, por necessidade e prazo de entrega. Compras grandes e essenciais vêm primeiro porque
 * entrega e montagem levam tempo; o que se usa na primeira noite vem logo antes da mudança.
 */
const ESSENTIAL_WEEK: Record<PriceCategory, number> = { 4: -8, 3: -5, 2: -2, 1: -2 };
const FIRST_NIGHT_WEEK = -1;
const FIRST_WEEK = 0;
/** Opcionais só começam depois que a casa assentou: nunca antes da 4ª semana. */
const OPTIONAL_START: Record<PriceCategory, number> = { 1: 4, 2: 5, 3: 9, 4: 16 };
/** Teto para a semana de um opcional: o que não couber antes fica para este ponto. */
const MAX_AUTO_WEEK = 40;
/** O gasto opcional é distribuído em cerca de 16 semanas, para não pesar tudo de uma vez. */
const SPREAD_WEEKS = 16;

export type PlacementSource = "manual" | "auto";

export interface Placement {
  week: number;
  source: PlacementSource;
  /** Por que o algoritmo escolheu essa semana (ou o que a pessoa decidiu). */
  reason: string;
  /** O algoritmo adiou o item para distribuir o gasto. */
  spread?: boolean;
}

function baseWeek(meta: ItemMeta, room: Room | null): { week: number; reason: string } {
  const { priority, priceCategory, timing } = meta;
  if (timing === "first_night") {
    return { week: FIRST_NIGHT_WEEK, reason: "Precisa estar pronto na primeira noite." };
  }
  if (priority === "essential") {
    const week = timing === "first_week" ? Math.min(ESSENTIAL_WEEK[priceCategory], FIRST_WEEK) : ESSENTIAL_WEEK[priceCategory];
    const reason =
      priceCategory === 4
        ? "Compra grande e essencial: entrega e montagem levam tempo."
        : priceCategory === 3
          ? "Essencial de valor médio: dá tempo de pesquisar preço."
          : "Essencial do dia a dia: compre perto da mudança.";
    return { week, reason };
  }
  if (timing === "first_week") {
    return { week: FIRST_WEEK, reason: "Melhor já na primeira semana: evita um problema logo no começo." };
  }
  const delay = room ? ROOM_DELAY[room] : UNKNOWN_ROOM_DELAY;
  return {
    week: OPTIONAL_START[priceCategory] + delay,
    reason: "Conforto que pode esperar a casa assentar.",
  };
}

function referenceMidCents(tier: SpendingTier, category: PriceCategory) {
  const band = bandFor(tier, category);
  return Math.round((band.minCents + band.maxCents) / 2);
}

/**
 * Decide a semana de compra de cada item que ainda faz parte da lista.
 *
 * 1. Cada item ganha uma semana-base pela necessidade e pelo prazo de entrega (veja `baseWeek`).
 * 2. As semanas escolhidas pela pessoa ficam como estão e já contam no gasto da semana.
 * 3. Essenciais e itens com prazo (primeira noite ou primeira semana) não se mexem.
 * 4. Os opcionais são distribuídos: do mais urgente ao menos, cada um vai para a primeira semana a
 *    partir da sua semana-base em que o gasto de referência ainda cabe no teto semanal, que é o total
 *    dos opcionais dividido em cerca de 16 semanas. Assim o gasto não fica todo no mesmo mês.
 *
 * O resultado só depende dos itens, dos ambientes, das semanas manuais e do perfil de gasto. Preços e
 * situação (comprado, pesquisando...) não entram: marcar uma compra nunca remaneja o resto da lista.
 */
export function planPurchases(
  items: readonly PlannableItem[],
  tier: SpendingTier,
): Map<string, Placement> {
  const placements = new Map<string, Placement>();
  const flexible: { item: PlannableItem; base: number; cost: number; order: number; reason: string; category: PriceCategory }[] = [];
  const load = new Map<number, number>();
  const addLoad = (week: number, cents: number) => load.set(week, (load.get(week) ?? 0) + cents);

  items.forEach((item, order) => {
    if (isInactiveStatus(item.status)) return;
    const meta = itemMeta(item);
    const cost = referenceMidCents(tier, meta.priceCategory);

    if (isBuyWeek(item.buyWeek)) {
      placements.set(item.id, {
        week: item.buyWeek,
        source: "manual",
        reason: "Semana escolhida por você.",
      });
      addLoad(item.buyWeek, cost);
      return;
    }

    const base = baseWeek(meta, roomOfCategory(item.category));
    const isFixed = meta.priority === "essential" || meta.timing !== null;
    if (isFixed) {
      placements.set(item.id, { week: base.week, source: "auto", reason: base.reason });
      addLoad(base.week, cost);
      return;
    }
    flexible.push({ item, base: base.week, cost, order, reason: base.reason, category: meta.priceCategory });
  });

  const total = flexible.reduce((sum, entry) => sum + entry.cost, 0);
  const biggest = flexible.reduce((max, entry) => Math.max(max, entry.cost), 0);
  const cap = Math.max(biggest, Math.ceil(total / SPREAD_WEEKS));

  flexible.sort((a, b) => a.base - b.base || a.category - b.category || a.order - b.order);
  for (const entry of flexible) {
    let week = entry.base;
    // Uma semana vazia sempre aceita o item, mesmo que ele sozinho passe do teto.
    while (week < MAX_AUTO_WEEK && (load.get(week) ?? 0) > 0 && (load.get(week) ?? 0) + entry.cost > cap) {
      week += 1;
    }
    addLoad(week, entry.cost);
    const spread = week !== entry.base;
    placements.set(entry.item.id, {
      week,
      source: "auto",
      spread,
      reason: spread
        ? "Conforto que pode esperar, distribuído para o gasto não pesar de uma vez."
        : entry.reason,
    });
  }
  return placements;
}

/* ---------------------------------------------------------- faixas e verificador */

/** Itens que custam dinheiro de verdade: o que foi ganho ou já existe em casa não entra nas contas. */
function costsMoney(status: ItemStatus) {
  return status === "needed" || status === "researching" || status === "bought";
}

export type Verdict = "empty" | "no_prices" | "below" | "within" | "above";

export const VERDICT_LABEL: Record<Verdict, string> = {
  empty: "Nada a comprar",
  no_prices: "Sem preços ainda",
  below: "Abaixo da faixa",
  within: "Dentro da faixa",
  above: "Acima da faixa",
};

export interface PlannedItem<T extends PlannableItem = PlannableItem> {
  item: T;
  meta: ItemMeta;
  placement: Placement;
  /** Faixa de referência do item no perfil de gasto escolhido. */
  band: Band;
  pending: boolean;
  /** A semana já acabou e o item continua pendente (só existe com a data da mudança). */
  overdue: boolean;
}

export interface PeriodSummary<T extends PlannableItem = PlannableItem> {
  period: Period;
  entries: PlannedItem<T>[];
  doneCount: number;
  pendingCount: number;
  /** Faixa de referência de todos os itens do período que custam dinheiro. */
  band: Band;
  /** Previsto: soma dos preços (já com desconto) dos itens com preço. */
  plannedCents: number;
  /** Já gasto: soma dos itens comprados. */
  spentCents: number;
  unpricedCount: number;
  overdueCount: number;
  verdict: Verdict;
  /** O gasto já chegou ao mínimo da faixa. */
  reached: boolean;
  /** Tem itens e nenhum está pendente. */
  completed: boolean;
  /** "Hoje" cai neste período (só com a data da mudança). */
  current: boolean;
}

/**
 * Veredito do período: compara o previsto com a faixa dos mesmos itens (os que têm preço), para que itens
 * ainda sem preço não façam o período parecer barato.
 */
export function verdictFor(plannedCents: number, pricedBand: Band, pricedCount: number, costCount: number): Verdict {
  if (costCount === 0) return "empty";
  if (pricedCount === 0) return "no_prices";
  if (plannedCents < pricedBand.minCents) return "below";
  if (plannedCents > pricedBand.maxCents) return "above";
  return "within";
}

export interface PurchasePlan<T extends PlannableItem = PlannableItem> {
  periods: PeriodSummary<T>[];
  byId: Map<string, PlannedItem<T>>;
  totals: {
    band: Band;
    plannedCents: number;
    spentCents: number;
    unpricedCount: number;
    overdueCount: number;
  };
}

export function buildPurchasePlan<T extends PlannableItem>(
  items: readonly T[],
  options: { tier: SpendingTier; moveDate?: string | null; now?: Date },
): PurchasePlan<T> {
  const { tier, moveDate = null, now = new Date() } = options;
  const placements = planPurchases(items, tier);
  const today = startOfDay(now);
  const nowWeek = moveDate ? currentWeek(moveDate, now) : null;
  const byId = new Map<string, PlannedItem<T>>();
  const grouped = new Map<PeriodId, PlannedItem<T>[]>(PERIODS.map((p) => [p.id, []]));

  for (const item of items) {
    const placement = placements.get(item.id);
    if (!placement) continue;
    const meta = itemMeta(item);
    const pending = !isDoneStatus(item.status);
    const overdue = Boolean(
      moveDate && pending && weekRange(moveDate, placement.week).end < today,
    );
    const entry: PlannedItem<T> = {
      item,
      meta,
      placement,
      band: bandFor(tier, meta.priceCategory),
      pending,
      overdue,
    };
    byId.set(item.id, entry);
    grouped.get(periodOfWeek(placement.week).id)?.push(entry);
  }

  const periods = PERIODS.map((period): PeriodSummary<T> => {
    const entries = (grouped.get(period.id) ?? []).sort(
      (a, b) =>
        a.placement.week - b.placement.week ||
        Number(b.meta.priority === "essential") - Number(a.meta.priority === "essential"),
    );
    const costing = entries.filter((entry) => costsMoney(entry.item.status));
    const priced = costing.filter((entry) => netPriceCents(entry.item) > 0);
    const band = costing.reduce((sum, entry) => addBands(sum, entry.band), EMPTY_BAND);
    const pricedBand = priced.reduce((sum, entry) => addBands(sum, entry.band), EMPTY_BAND);
    const plannedCents = priced.reduce((sum, entry) => sum + netPriceCents(entry.item), 0);
    const spentCents = costing
      .filter((entry) => entry.item.status === "bought")
      .reduce((sum, entry) => sum + netPriceCents(entry.item), 0);
    const pendingCount = entries.filter((entry) => entry.pending).length;
    return {
      period,
      entries,
      doneCount: entries.length - pendingCount,
      pendingCount,
      band,
      plannedCents,
      spentCents,
      unpricedCount: costing.length - priced.length,
      overdueCount: entries.filter((entry) => entry.overdue).length,
      verdict: verdictFor(plannedCents, pricedBand, priced.length, costing.length),
      reached: band.minCents > 0 && spentCents >= band.minCents,
      completed: entries.length > 0 && pendingCount === 0,
      current: nowWeek !== null && nowWeek >= period.fromWeek && nowWeek <= period.toWeek,
    };
  });

  return {
    periods,
    byId,
    totals: {
      band: periods.reduce((sum, p) => addBands(sum, p.band), EMPTY_BAND),
      plannedCents: periods.reduce((sum, p) => sum + p.plannedCents, 0),
      spentCents: periods.reduce((sum, p) => sum + p.spentCents, 0),
      unpricedCount: periods.reduce((sum, p) => sum + p.unpricedCount, 0),
      overdueCount: periods.reduce((sum, p) => sum + p.overdueCount, 0),
    },
  };
}

/** Faixa total do enxoval em cada perfil de gasto, para a pessoa comparar antes de escolher. */
export function tierTotals(items: readonly PlannableItem[]): Record<SpendingTier, Band> {
  const costing = items.filter((item) => costsMoney(item.status));
  return Object.fromEntries(
    SPENDING_TIERS.map((tier) => [
      tier,
      costing.reduce(
        (sum, item) => addBands(sum, bandFor(tier, itemMeta(item).priceCategory)),
        EMPTY_BAND,
      ),
    ]),
  ) as Record<SpendingTier, Band>;
}
