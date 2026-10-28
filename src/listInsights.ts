/**
 * Atalhos da lista "Meu enxoval": dados que o app já calcula (plano de compras, acompanhamento de preço,
 * catálogo) resumidos em contagens que viram filtros com um toque.
 */
import { compactKey, foldText, itemKey, trigramSimilarity, trigrams } from "./catalog/normalize";
import { CATALOG, type CatalogEntry } from "./onboarding/catalog";
import type { RoomKey } from "./onboarding/types";
import {
  currentWeek,
  MAX_BUY_WEEK,
  PERIODS,
  periodOfWeek,
  roomOfCategory,
  type PurchasePlan,
} from "./planning/purchasePlan";
import { buyOpportunities, hasCheaperOtherOffer } from "./priceTracking";
import { netPriceCents } from "./itemStatus";
import type { EnxovalCategory, EnxovalItem } from "./types";

/** Filtros que nascem dos atalhos acima da lista. */
export type QuickFilter = "week" | "deals" | "boughtUnpriced" | "mine" | "thanks" | "warranty";

export const QUICK_FILTER_TITLE: Record<QuickFilter, string> = {
  week: "Para comprar esta semana",
  deals: "Baixaram de preço",
  boughtUnpriced: "Compras sem valor",
  mine: "Meus itens",
  thanks: "Agradecimentos pendentes",
  warranty: "Garantias vencendo em 30 dias",
};

/** Quem compra o quê (Fase 11.2): "mine" e "unassigned" são fixos; os demais valores são o id de quem participa. */
export type AssigneeFilter = "all" | "mine" | "unassigned" | string;

export function matchesAssignee(item: Pick<EnxovalItem, "assigneeId">, filter: AssigneeFilter, userId: string | undefined) {
  if (filter === "all") return true;
  if (filter === "unassigned") return !item.assigneeId;
  if (filter === "mine") return Boolean(userId) && item.assigneeId === userId;
  return item.assigneeId === filter;
}

/** Item ganho cujo agradecimento ainda não foi marcado como enviado. */
export function needsThanks(item: Pick<EnxovalItem, "status" | "thankedAt">) {
  return item.status === "received" && !item.thankedAt;
}

/** Dias até o fim da garantia (negativo: já venceu); null sem garantia informada. */
export function warrantyDaysLeft(item: Pick<EnxovalItem, "warrantyUntil">, now = new Date()) {
  if (!item.warrantyUntil) return null;
  const [y, m, d] = item.warrantyUntil.split("-").map(Number);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

export function warrantyExpiringSoon(item: Pick<EnxovalItem, "warrantyUntil" | "status">, now = new Date()) {
  const days = warrantyDaysLeft(item, now);
  return item.status !== "researching" && days !== null && days >= 0 && days <= 30;
}

/** Comprado sem preço: não entra em "Já investimos". */
export function isBoughtWithoutPrice(item: EnxovalItem) {
  return item.status === "bought" && !(item.priceCents && item.priceCents > 0);
}

/** Dias até a mudança: positivo antes, 0 no dia, negativo depois. */
export function daysUntilMove(moveDate: string, now = new Date()) {
  const [y, m, d] = moveDate.split("-").map(Number);
  const move = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((move.getTime() - today.getTime()) / 86_400_000);
}

/** "Faltam 34 dias para a mudança", "A mudança é amanhã", "12 dias na casa nova". */
export function moveCountdownLabel(moveDate: string, now = new Date()) {
  const days = daysUntilMove(moveDate, now);
  if (days > 1) return `Faltam ${days} dias para a mudança`;
  if (days === 1) return "A mudança é amanhã";
  if (days === 0) return "A mudança é hoje";
  return days === -1 ? "1 dia na casa nova" : `${-days} dias na casa nova`;
}

/**
 * Itens pendentes cuja semana de compra já chegou (inclui os atrasados). Sem a data da mudança não há
 * "esta semana", e a lista volta vazia.
 */
export function thisWeekIds(
  plan: PurchasePlan<EnxovalItem> | null,
  moveDate: string | null,
  now = new Date(),
) {
  const ids = new Set<string>();
  if (!plan || !moveDate) return ids;
  const week = currentWeek(moveDate, now);
  for (const entry of plan.byId.values()) {
    if (entry.pending && entry.placement.week <= week) ids.add(entry.item.id);
  }
  return ids;
}

export interface ListInsightsData {
  week: { count: number; totalCents: number; unpricedCount: number } | null;
  dealsCount: number;
  boughtUnpricedCount: number;
  /** Itens pendentes da própria pessoa. Null quando o enxoval não é dividido (o atalho não faz sentido). */
  mineCount?: number | null;
  thanksCount?: number;
  warrantyCount?: number;
}

export function computeListInsights(
  items: EnxovalItem[],
  weekIds: ReadonlySet<string>,
  hasMoveDate: boolean,
  context: { userId?: string; shared?: boolean; now?: Date } = {},
): ListInsightsData {
  const weekItems = items.filter((item) => weekIds.has(item.id));
  const now = context.now ?? new Date();
  return {
    mineCount: context.shared && context.userId
      ? items.filter((item) => item.status === "researching" && item.assigneeId === context.userId).length
      : null,
    thanksCount: items.filter(needsThanks).length,
    warrantyCount: items.filter((item) => warrantyExpiringSoon(item, now)).length,
    week: hasMoveDate
      ? {
          count: weekItems.length,
          totalCents: weekItems.reduce((sum, item) => sum + netPriceCents(item), 0),
          unpricedCount: weekItems.filter((item) => netPriceCents(item) <= 0).length,
        }
      : null,
    dealsCount: dealIds(items).size,
    boughtUnpricedCount: items.filter(isBoughtWithoutPrice).length,
  };
}

export function dealIds(items: EnxovalItem[]) {
  const ids = new Set(buyOpportunities(items).map(({ item }) => item.id));
  for (const item of items) if (hasCheaperOtherOffer(item)) ids.add(item.id);
  return ids;
}

/** Os filtros de atalho que não dependem do plano de compras (os outros usam `weekIds` e `dealIds`). */
export function matchesQuickFilter(item: EnxovalItem, filter: QuickFilter, userId?: string, now = new Date()) {
  if (filter === "mine") return item.assigneeId === userId && Boolean(userId);
  if (filter === "thanks") return needsThanks(item);
  if (filter === "warranty") return warrantyExpiringSoon(item, now);
  return true;
}

/* ------------------------------------------------------ sugestões do ambiente */

/** Marcas do catálogo que dependem do perfil da casa (clima, casal, tipo de moradia, região). */
const PROFILE_FLAGS = /[FHCSKAXONR]/;

export interface RoomSuggestion {
  name: string;
  essential: boolean;
}

function catalogRoomOf(categoryName: string): RoomKey | null {
  const room = roomOfCategory(categoryName);
  // Ambientes como "Eletro Cozinha" são de eletrodomésticos, não da cozinha.
  if (room === "cozinha" && foldText(categoryName).includes("eletro")) return "eletro";
  return room;
}

/** O catálogo conhece o tipo deste ambiente (cozinha, quarto, banheiro...)? */
export function knowsRoom(categoryName: string) {
  return catalogRoomOf(categoryName) !== null;
}

function displayName(entry: CatalogEntry) {
  return entry.name.replace("{cama}", "de casal");
}

/** Parecidos o bastante para ser o mesmo item com outro nome ("Fogão" x "Fogão 4 bocas" não passa; "Micro-ondas" x "Microondas" sim). */
const SAME_ITEM_SIMILARITY = 0.8;

/**
 * Mesmo item com outro nome? Usa a normalização compartilhada com o Jev: "Micro-ondas", "microondas" e
 * "Micro ondas 30L" são um item só; "Geladeira Frost Free 375L" já cobre "Geladeira". Na dúvida, vale
 * não sugerir um item repetido.
 */
export function isSameItem(have: string, wanted: string) {
  if (foldText(have) === foldText(wanted)) return true;
  const haveKey = itemKey(have);
  const wantedKey = itemKey(wanted);
  if (!haveKey || !wantedKey) return false;
  if (haveKey === wantedKey || haveKey.startsWith(`${wantedKey} `)) return true;
  const haveCompact = compactKey(haveKey);
  const wantedCompact = compactKey(wantedKey);
  if (haveCompact === wantedCompact) return true;
  return trigramSimilarity(trigrams(haveCompact), trigrams(wantedCompact)) >= SAME_ITEM_SIMILARITY;
}

/** Ambientes que se confundem entre si: um item pode estar num e fazer mais sentido no outro. */
const SIBLING_ROOMS: RoomKey[][] = [
  ["cozinha", "eletro"],
  ["quarto", "quartoExtra"],
];

function areSiblingRooms(a: RoomKey, b: RoomKey) {
  return SIBLING_ROOMS.some((group) => group.includes(a) && group.includes(b));
}

function catalogCandidates(room: RoomKey) {
  return CATALOG.filter((entry) => entry.room === room && !entry.where && !PROFILE_FLAGS.test(entry.flags));
}

/**
 * Itens comuns do cômodo que ainda não estão na lista (de nenhum ambiente), essenciais primeiro e do mais
 * barato ao mais caro. Só entram itens que servem a qualquer casa: os que dependem de clima, região ou de
 * quem mora ficam no funil. Devolve o conjunto todo; quem mostra pagina com `pickPage`.
 */
export function roomSuggestions(
  categoryName: string,
  items: Pick<EnxovalItem, "name">[],
): RoomSuggestion[] {
  const room = catalogRoomOf(categoryName);
  if (!room) return [];
  const covered = (name: string) => items.some((item) => isSameItem(item.name, name));
  return catalogCandidates(room)
    .map((entry) => ({ entry, name: displayName(entry) }))
    .filter(({ name }) => !covered(name))
    .sort(
      (a, b) =>
        Number(b.entry.flags.includes("E")) - Number(a.entry.flags.includes("E")) ||
        a.entry.tier - b.entry.tier,
    )
    .map(({ entry, name }) => ({ name, essential: entry.flags.includes("E") }));
}

/** Uma "página" circular do conjunto: cada rodada mostra outros itens e, passando do fim, volta ao começo. */
export function pickPage<T>(pool: readonly T[], round: number, size = 4): T[] {
  if (pool.length <= size) return [...pool];
  const start = (round * size) % pool.length;
  return Array.from({ length: size }, (_, i) => pool[(start + i) % pool.length]);
}

export interface RoomMove {
  itemId: string;
  name: string;
  fromCategoryId: string;
  fromCategoryName: string;
}

/**
 * Itens que a pessoa pôs num ambiente irmão (Cozinha) mas que o catálogo guarda no ambiente atual (Eletro
 * Cozinha). Só sugere mover quando o item não é de nenhum catálogo do ambiente onde está.
 */
export function roomMoves(
  category: Pick<EnxovalCategory, "id" | "name">,
  items: Pick<EnxovalItem, "id" | "name" | "categoryId">[],
  categories: Pick<EnxovalCategory, "id" | "name">[],
): RoomMove[] {
  const room = catalogRoomOf(category.name);
  if (!room) return [];
  const targets = catalogCandidates(room).map(displayName);
  const moves: RoomMove[] = [];
  for (const item of items) {
    if (item.categoryId === category.id) continue;
    const from = categories.find((candidate) => candidate.id === item.categoryId);
    const fromRoom = from ? catalogRoomOf(from.name) : null;
    if (!from || !fromRoom || fromRoom === room || !areSiblingRooms(room, fromRoom)) continue;
    if (!targets.some((name) => isSameItem(item.name, name))) continue;
    if (catalogCandidates(fromRoom).some((entry) => isSameItem(item.name, displayName(entry)))) continue;
    moves.push({ itemId: item.id, name: item.name, fromCategoryId: from.id, fromCategoryName: from.name });
  }
  return moves;
}

/* --------------------------------------------------- lista por semana de compra */

export interface WeekGroup {
  id: string;
  label: string;
  items: EnxovalItem[];
}

/**
 * Agrupa a lista (já ordenada pela semana) em blocos de compra. Com a data da mudança, os blocos são
 * relativos a hoje; sem ela, seguem os períodos do Planejamento. Conquistados vão para o fim.
 */
export function groupByBuyWeek(
  items: EnxovalItem[],
  plan: PurchasePlan<EnxovalItem> | null,
  moveDate: string | null,
  now = new Date(),
  pendingCompletionIds?: ReadonlySet<string>,
): WeekGroup[] {
  const groups = new Map<string, WeekGroup>();
  const push = (id: string, label: string, item: EnxovalItem) => {
    const group = groups.get(id) ?? { id, label, items: [] };
    group.items.push(item);
    groups.set(id, group);
  };
  const nowWeek = moveDate ? currentWeek(moveDate, now) : null;
  const order = moveDate
    ? ["now", "soon", "later", "done"]
    : [...PERIODS.map((period) => period.id), "done"];

  for (const item of items) {
    const entry = plan?.byId.get(item.id);
    if (entry && !entry.pending && !pendingCompletionIds?.has(item.id)) {
      push("done", "Conquistados", item);
      continue;
    }
    const week = entry?.placement.week ?? MAX_BUY_WEEK;
    if (nowWeek !== null) {
      if (week <= nowWeek) push("now", "Para esta semana", item);
      else if (week <= nowWeek + 4) push("soon", "Nas próximas 4 semanas", item);
      else push("later", "Mais adiante", item);
    } else {
      const period = periodOfWeek(week);
      push(period.id, period.label, item);
    }
  }
  return order.flatMap((id) => groups.get(id) ?? []);
}

/** Posição para ordenar por semana: pendentes pela semana, conquistados no fim. */
export function buyWeekRank(item: EnxovalItem, plan: PurchasePlan<EnxovalItem> | null, completionPending = false) {
  const entry = plan?.byId.get(item.id);
  if (!entry) return MAX_BUY_WEEK;
  return entry.pending || completionPending ? entry.placement.week : MAX_BUY_WEEK + 1;
}
