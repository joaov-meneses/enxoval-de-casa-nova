import type { RoomKey } from "../onboarding/types";
import { roomOfCategory } from "../planning/purchasePlan";
import { foldText } from "./normalize";

/**
 * Ambiente do enxoval que corresponde a um cômodo do catálogo ("eletro" → "Eletro Cozinha", ou "Cozinha" se não
 * houver um ambiente só de eletrodomésticos). Undefined quando o enxoval não tem ambiente para esse cômodo.
 */
export function categoryForRoom<T extends { name: string }>(categories: readonly T[], room: RoomKey | null | undefined): T | undefined {
  if (!room) return undefined;
  if (room === "eletro") {
    return (
      categories.find((category) => foldText(category.name).includes("eletro")) ??
      categories.find((category) => roomOfCategory(category.name) === "cozinha")
    );
  }
  return categories.find((category) => roomOfCategory(category.name) === room && !(room === "cozinha" && foldText(category.name).includes("eletro")))
    ?? categories.find((category) => roomOfCategory(category.name) === room);
}
