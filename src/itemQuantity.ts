/** Quantidade padrão de um item e o maior valor aceito (evita erro de digitação como 99999). */
export const DEFAULT_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 999;

export function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_ITEM_QUANTITY
  );
}

/** Quantidade segura para cálculos: inteira, entre 1 e o máximo; itens antigos sem o campo valem 1. */
export function normalizeQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1
    ? Math.min(quantity, MAX_ITEM_QUANTITY)
    : DEFAULT_ITEM_QUANTITY;
}

/** Lê "4 un." das descrições geradas pelo funil de onboarding ("Essencial · 4 un."). */
export function quantityFromDescription(description: string) {
  const match = /(\d+) un\./.exec(description);
  return match ? normalizeQuantity(Number(match[1])) : DEFAULT_ITEM_QUANTITY;
}
