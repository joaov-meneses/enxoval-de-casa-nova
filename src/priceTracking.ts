import { isPendingStatus } from "./itemStatus";
import type { EnxovalItem, ItemPriceTracking, SavingsSummary } from "./types";

/** Lojas conhecidas, para mostrar um selo curto no lugar do endereço. */
const STORE_LABELS: [RegExp, string][] = [
  [/(^|\.)mercadoli[vb]re\.com(\.br)?$/, "Mercado Livre"],
  [/(^|\.)amazon\./, "Amazon"],
  [/(^|\.)(magazineluiza|magalu)\.com(\.br)?$/, "Magalu"],
  [/(^|\.)shopee\./, "Shopee"],
  [/(^|\.)americanas\.com(\.br)?$/, "Americanas"],
  [/(^|\.)casasbahia\.com(\.br)?$/, "Casas Bahia"],
  [/(^|\.)kabum\.com(\.br)?$/, "KaBuM!"],
  [/(^|\.)leroymerlin\.com(\.br)?$/, "Leroy Merlin"],
];

export function storeLabel(domain: string) {
  const host = domain.toLowerCase().replace(/^www\./, "");
  return STORE_LABELS.find(([pattern]) => pattern.test(host))?.[1] ?? host;
}

export interface PriceChange {
  /** Preço atual menos o preço do cadastro: negativo quando ficou mais barato. */
  deltaCents: number;
  /** Variação em %, sempre positiva (mínimo de 1% quando houve mudança). */
  percent: number;
  direction: "down" | "up" | "same";
}

/** Quanto o preço lido na loja mudou em relação ao dia do cadastro. `null` quando falta um dos dois preços. */
export function priceChange(
  tracking: ItemPriceTracking | null | undefined,
): PriceChange | null {
  if (!tracking) return null;
  const { initialPriceCents: initial, currentPriceCents: current } = tracking;
  if (!initial || initial <= 0 || current === null || current <= 0) return null;
  const deltaCents = current - initial;
  if (deltaCents === 0) return { deltaCents, percent: 0, direction: "same" };
  return {
    deltaCents,
    percent: Math.max(1, Math.round((Math.abs(deltaCents) / initial) * 100)),
    direction: deltaCents < 0 ? "down" : "up",
  };
}

/** O preço lido já está no valor que a pessoa pediu para ser avisada. */
export function reachedTarget(tracking: ItemPriceTracking | null | undefined) {
  return Boolean(
    tracking &&
      tracking.targetPriceCents !== null &&
      tracking.currentPriceCents !== null &&
      tracking.currentPriceCents <= tracking.targetPriceCents,
  );
}

/** Só itens ainda por comprar entram na conta: depois da compra o preço da loja deixa de importar. */
function monitoredItems(items: EnxovalItem[]) {
  return items.filter(
    (item) =>
      isPendingStatus(item.status) && priceChange(item.priceTracking) !== null,
  );
}

export function computeSavings(items: EnxovalItem[]): SavingsSummary {
  const summary: SavingsSummary = {
    trackedItemsCount: 0,
    totalInitialCents: 0,
    totalCurrentCents: 0,
    totalSavingsCents: 0,
    totalIncreaseCents: 0,
    itemsWithDropsCount: 0,
    itemsAtLowestPriceCount: 0,
  };
  for (const item of monitoredItems(items)) {
    const tracking = item.priceTracking!;
    const change = priceChange(tracking)!;
    summary.trackedItemsCount += 1;
    summary.totalInitialCents += tracking.initialPriceCents!;
    summary.totalCurrentCents += tracking.currentPriceCents!;
    if (change.direction === "down") {
      summary.totalSavingsCents += -change.deltaCents;
      summary.itemsWithDropsCount += 1;
    } else if (change.direction === "up") {
      summary.totalIncreaseCents += change.deltaCents;
    }
    if (tracking.isLowestIn60d) summary.itemsAtLowestPriceCount += 1;
  }
  return summary;
}

export interface BuyOpportunity {
  item: EnxovalItem;
  tracking: ItemPriceTracking;
  change: PriceChange;
}

/** Itens a comprar que estão mais baratos que no cadastro, no menor preço ou abaixo do preço-alvo. */
export function buyOpportunities(items: EnxovalItem[]): BuyOpportunity[] {
  return monitoredItems(items)
    .map((item) => ({
      item,
      tracking: item.priceTracking!,
      change: priceChange(item.priceTracking)!,
    }))
    .filter(
      ({ tracking, change }) =>
        tracking.inStock &&
        (change.direction === "down" ||
          tracking.isLowestIn60d ||
          reachedTarget(tracking)),
    )
    .sort((a, b) => a.change.deltaCents - b.change.deltaCents);
}

/**
 * Até dois itens da lista que a economia "paga": do mais caro ao mais barato, sem repetir e sem
 * passar do valor economizado. Serve para dar uma noção concreta do quanto se economizou.
 */
export function savingsEquivalent(items: EnxovalItem[], savingsCents: number) {
  const picked: string[] = [];
  let remaining = savingsCents;
  const candidates = items
    .filter((item) => (item.priceCents ?? 0) > 0)
    .sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0));
  for (const item of candidates) {
    if (picked.length === 2) break;
    const price = item.priceCents ?? 0;
    if (price > remaining || picked.includes(item.name)) continue;
    picked.push(item.name);
    remaining -= price;
  }
  return picked;
}
