import { isDoneStatus } from "./itemStatus";
import type { EnxovalItem } from "./types";

export interface NinoCelebration {
  itemId: string;
  categoryId: string;
  name: string;
}

/** A lista completa do ambiente decide o descanso, independentemente dos filtros da tela. */
export function ninoState(items: EnxovalItem[], categoryId?: string, celebration?: NinoCelebration | null, busy = false) {
  const scoped = categoryId ? items.filter(item => item.categoryId === categoryId) : items;
  const completed = celebration && scoped.find(item => item.id === celebration.itemId && item.categoryId === celebration.categoryId && isDoneStatus(item.status));
  if (busy) return "thinking";
  if (completed) return "celebrating";
  if (scoped.length > 0 && scoped.every(item => isDoneStatus(item.status))) return "resting";
  return "thinking";
}
