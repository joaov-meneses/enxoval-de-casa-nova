export const ITEM_STATUSES = [
  "needed",
  "researching",
  "bought",
  "received",
  "owned",
  "not_needed",
  "discarded",
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** pending: ainda falta resolver · done: conquistado · inactive: fora da lista e dos cálculos. */
export type ItemStatusGroup = "pending" | "done" | "inactive";

export const ITEM_STATUS_META: Record<
  ItemStatus,
  { label: string; hint: string; group: ItemStatusGroup }
> = {
  needed: {
    label: "Preciso comprar",
    hint: "Está na lista e ainda falta comprar.",
    group: "pending",
  },
  researching: {
    label: "Pesquisando",
    hint: "Comparando preços e opções.",
    group: "pending",
  },
  bought: {
    label: "Comprei",
    hint: "Entra em Já investimos.",
    group: "done",
  },
  received: {
    label: "Ganhei",
    hint: "Presente ou ganho: entra em Descontos e cashback, não em Já investimos.",
    group: "done",
  },
  owned: {
    label: "Já tenho",
    hint: "Já existe em casa, sem custo novo.",
    group: "done",
  },
  not_needed: {
    label: "Não preciso",
    hint: "Sai dos cálculos e do progresso.",
    group: "inactive",
  },
  discarded: {
    label: "Descartei",
    hint: "Desisti ou me desfiz do item. Sai dos cálculos.",
    group: "inactive",
  },
};

export const DEFAULT_ITEM_STATUS: ItemStatus = "needed";

export function isItemStatus(value: unknown): value is ItemStatus {
  return (
    typeof value === "string" &&
    (ITEM_STATUSES as readonly string[]).includes(value)
  );
}

export function statusLabel(status: ItemStatus) {
  return (ITEM_STATUS_META[status] ?? ITEM_STATUS_META[DEFAULT_ITEM_STATUS])
    .label;
}

/** Situação desconhecida ou ausente conta como pendente em vez de derrubar a tela. */
function groupOf(status: ItemStatus): ItemStatusGroup {
  return ITEM_STATUS_META[status]?.group ?? "pending";
}

export function isDoneStatus(status: ItemStatus) {
  return groupOf(status) === "done";
}

export function isPendingStatus(status: ItemStatus) {
  return groupOf(status) === "pending";
}

export function isInactiveStatus(status: ItemStatus) {
  return groupOf(status) === "inactive";
}

/**
 * Situação equivalente ao antigo marcador "checked":
 * marcar conserva uma situação já concluída (ou vira "Comprei");
 * desmarcar volta para "Preciso comprar" e não mexe em situações pendentes ou inativas.
 */
export function statusFromChecked(
  checked: boolean,
  current: ItemStatus,
): ItemStatus {
  if (checked) return isDoneStatus(current) ? current : "bought";
  return isDoneStatus(current) ? DEFAULT_ITEM_STATUS : current;
}

/** Normaliza itens antigos (sem `status`) usando o marcador `checked`. */
export function normalizeItemStatus(item: {
  status?: unknown;
  checked?: unknown;
}): ItemStatus {
  if (isItemStatus(item.status)) return item.status;
  return item.checked ? "bought" : DEFAULT_ITEM_STATUS;
}

interface StatusItem {
  status: ItemStatus;
  /** Valor do item (a quantidade é só informativa e não multiplica o preço). */
  priceCents: number | null;
  discountCents?: number | null;
}

/** Preço do item. A quantidade apenas informa quantas unidades existem: não altera o valor. */
export function itemPriceCents(item: StatusItem) {
  const price = Number(item.priceCents);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/** O desconto/cashback do item só faz sentido enquanto há compra a fazer ou feita. */
export function discountApplies(status: ItemStatus) {
  return status === "needed" || status === "researching" || status === "bought";
}

/** Desconto/cashback informado no item, limitado ao preço e ignorado nas situações sem compra. */
function discountOf(item: StatusItem) {
  if (!discountApplies(item.status)) return 0;
  const discount = Number(item.discountCents);
  return Number.isFinite(discount) && discount > 0
    ? Math.min(discount, itemPriceCents(item))
    : 0;
}

/** O que o item economizou: o valor cheio se foi ganho, ou o desconto/cashback registrado. */
export function itemSavingsCents(item: StatusItem) {
  return item.status === "received" ? itemPriceCents(item) : discountOf(item);
}

/** Quanto o item custa de fato: preço menos o desconto/cashback informado. */
export function netPriceCents(item: StatusItem) {
  return itemPriceCents(item) - discountOf(item);
}

/**
 * Valida o desconto de um item e devolve o valor a gravar.
 * Situações sem compra (Ganhei, Já tenho, Não preciso, Descartei) sempre gravam 0.
 */
export function resolveDiscountCents(input: {
  status: ItemStatus;
  priceCents: number | null;
  discountCents: unknown;
}): { value: number } | { error: string } {
  const raw = input.discountCents ?? 0;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0)
    return { error: "Desconto ou cashback inválido." };
  if (!discountApplies(input.status)) return { value: 0 };
  if (raw > (input.priceCents ?? 0))
    return {
      error:
        raw > 0 && !input.priceCents
          ? "Informe o preço do item antes do desconto ou cashback."
          : "O desconto ou cashback não pode ser maior que o preço do item.",
    };
  return { value: raw };
}

/** Itens que contam para progresso e totais (exclui "Não preciso" e "Descartei"). */
export function activeItems<T extends StatusItem>(items: T[]) {
  return items.filter((item) => !isInactiveStatus(item.status));
}

export function doneItems<T extends StatusItem>(items: T[]) {
  return items.filter((item) => isDoneStatus(item.status));
}

export function pendingItems<T extends StatusItem>(items: T[]) {
  return items.filter((item) => isPendingStatus(item.status));
}

/** Itens comprados, já com o desconto/cashback abatido: é o que entra em "Já investimos". */
export function sumBought(items: StatusItem[]) {
  return items
    .filter((item) => item.status === "bought")
    .reduce((total, item) => total + netPriceCents(item), 0);
}

/** Descontos e cashback registrados nos itens (a comprar ou comprados): entram em "Descontos e cashback". */
export function sumItemDiscounts(items: StatusItem[]) {
  return items.reduce((total, item) => total + discountOf(item), 0);
}

/** Valor cheio dos itens ganhos: entra em "Descontos e cashback", nunca em "Já investimos". */
export function sumReceived(items: StatusItem[]) {
  return items
    .filter((item) => item.status === "received")
    .reduce((total, item) => total + itemPriceCents(item), 0);
}

/** Valor ainda por investir (itens pendentes, já com o desconto previsto abatido). */
export function sumPending(items: StatusItem[]) {
  return pendingItems(items).reduce(
    (total, item) => total + netPriceCents(item),
    0,
  );
}

/** Aplica uma mudança de `status` ou do marcador antigo `checked`, mantendo os dois coerentes. */
export function withStatusUpdate<
  T extends { status: ItemStatus; checked: boolean },
>(item: T, updates: { status?: ItemStatus; checked?: boolean }): T {
  const status = isItemStatus(updates.status)
    ? updates.status
    : typeof updates.checked === "boolean"
      ? statusFromChecked(updates.checked, item.status)
      : item.status;
  return { ...item, status, checked: isDoneStatus(status) };
}
