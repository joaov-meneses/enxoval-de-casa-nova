import { foldText } from "../catalog/normalize";
import { categoryForRoom, ROOM_CATEGORY_NAME } from "../catalog/rooms";
import { MAX_ITEM_NAME_LENGTH } from "../data";
import { roomOfCategory } from "../planning/purchasePlan";
import type { CatalogNameMatch } from "../types";
import type { ImportIssue, ImportRow } from "./importItems";

/**
 * Sugestão do catálogo mestre para uma linha da planilha, na revisão da importação.
 * name: corrigir a grafia ("geladera" → "Geladeira") · category: o item costuma ficar em outro ambiente que o
 * enxoval já tem · fill: o Ambiente veio vazio e o catálogo sabe onde o item fica.
 */
export interface CatalogSuggestion {
  key: string;
  line: number;
  kind: "name" | "category" | "fill";
  itemName: string;
  from: string;
  to: string;
}

/**
 * Sugestões para as linhas lidas, a partir do que o catálogo reconheceu em cada nome (`matches` na ordem de
 * `rows`). `categoryNames` são os ambientes do enxoval: um ambiente só é sugerido para troca se já existir; para
 * preencher um vazio, vale também um ambiente novo com o nome de costume do cômodo.
 */
export function catalogSuggestions(
  rows: readonly ImportRow[],
  matches: readonly (CatalogNameMatch | null)[],
  categoryNames: readonly string[],
): CatalogSuggestion[] {
  // Ambientes que vão existir depois da importação: os do enxoval e os escritos na planilha.
  const known = new Map<string, { name: string }>();
  for (const name of [...categoryNames, ...rows.map((row) => row.categoryName)])
    if (name && !known.has(foldText(name))) known.set(foldText(name), { name });
  const environments = [...known.values()];
  const suggestions: CatalogSuggestion[] = [];
  rows.forEach((row, index) => {
    const match = matches[index];
    if (!match) return;
    const add = (kind: CatalogSuggestion["kind"], from: string, to: string) =>
      suggestions.push({ key: `${row.line}:${kind}`, line: row.line, kind, itemName: row.name, from, to });
    if (match.match === "similar" && foldText(match.name) !== foldText(row.name) && match.name.length <= MAX_ITEM_NAME_LENGTH)
      add("name", row.name, match.name);
    if (!match.room) return;
    if (!row.categoryName) {
      add("fill", "", categoryForRoom(environments, match.room)?.name ?? ROOM_CATEGORY_NAME[match.room]);
      return;
    }
    const current = roomOfCategory(row.categoryName);
    // Ambiente com nome próprio ("Casa da praia") é escolha da pessoa: o catálogo não opina.
    if (!current || current === match.room) return;
    const target = categoryForRoom(environments, match.room);
    if (target && foldText(target.name) !== foldText(row.categoryName)) add("category", row.categoryName, target.name);
  });
  return suggestions;
}

/** Já marcadas ao abrir a revisão: preencher um Ambiente vazio. Trocar o que a pessoa escreveu fica a critério dela. */
export function defaultAcceptedSuggestions(suggestions: readonly CatalogSuggestion[]) {
  return new Set(suggestions.filter((suggestion) => suggestion.kind === "fill").map((suggestion) => suggestion.key));
}

/** As linhas com as sugestões aceitas aplicadas. */
export function applyCatalogSuggestions(
  rows: readonly ImportRow[],
  suggestions: readonly CatalogSuggestion[],
  accepted: ReadonlySet<string>,
): ImportRow[] {
  const byLine = new Map<number, CatalogSuggestion[]>();
  for (const suggestion of suggestions)
    if (accepted.has(suggestion.key)) byLine.set(suggestion.line, [...(byLine.get(suggestion.line) ?? []), suggestion]);
  return rows.map((row) => {
    const applied = byLine.get(row.line);
    if (!applied) return row;
    const next = { ...row };
    for (const suggestion of applied) {
      if (suggestion.kind === "name") next.name = suggestion.to;
      else next.categoryName = suggestion.to;
    }
    return next;
  });
}

/** Os problemas que continuam valendo: um Ambiente vazio deixa de ser erro quando a linha recebe um ambiente. */
export function remainingIssues(issues: readonly ImportIssue[], rows: readonly ImportRow[]) {
  const filled = new Set(rows.filter((row) => row.categoryName).map((row) => row.line));
  return issues.filter((issue) => !(issue.code === "missing-category" && filled.has(issue.line)));
}
