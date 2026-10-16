/**
 * Sugestões do catálogo para o lugar onde a pessoa mora, para quem já tem enxoval montado.
 * O funil já aplica essas regras ao gerar o plano; aqui elas servem para enxovais existentes, quando a
 * pessoa informa ou muda a cidade depois.
 */
import { foldText } from "../catalog/normalize";
import { CATALOG, matchesWhere, type CatalogEntry } from "../onboarding/catalog";
import { NORDESTE, cityById, traitsOfCity } from "../onboarding/regions";

export interface RegionalSuggestion {
  name: string;
  room: CatalogEntry["room"];
  tier: CatalogEntry["tier"];
  /** Por que o item faz sentido aqui, em poucas palavras. */
  note: string;
}

const normalize = foldText;

/** Itens que o catálogo só recomenda para quem mora aqui: por estado, cidade ou característica da cidade. */
function isRegional(entry: CatalogEntry) {
  return Boolean(entry.where) || entry.flags.includes("N") || entry.flags.includes("R");
}

function fitsPlace(entry: CatalogEntry, uf: string, city: string | null) {
  if (entry.flags.includes("N") && !NORDESTE.has(uf)) return false;
  if (entry.flags.includes("R") && uf !== "RS") return false;
  return matchesWhere(entry.where, { uf, city, traits: traitsOfCity(city) });
}

const FALLBACK_NOTE: Record<string, string> = {
  N: "Muito comum no Nordeste",
  R: "Tradição gaúcha",
};

/**
 * Itens regionais que combinam com o estado e a cidade e que ainda não estão na lista
 * (comparação pelo nome, sem acento nem caixa). Cada nome aparece uma vez, no primeiro ambiente do catálogo.
 */
export function regionalSuggestions(options: {
  uf: string | null;
  city: string | null;
  existingNames: Iterable<string>;
}): RegionalSuggestion[] {
  const { uf, existingNames } = options;
  if (!uf) return [];
  // A cidade só vale se pertencer ao estado: a mesma regra do funil.
  const city = options.city && cityById(options.city)?.uf === uf ? options.city : null;
  const have = new Set([...existingNames].map(normalize));
  const seen = new Set<string>();
  const result: RegionalSuggestion[] = [];

  for (const entry of CATALOG) {
    if (!isRegional(entry) || !fitsPlace(entry, uf, city)) continue;
    const name = entry.name.replace("{cama}", "de casal");
    const key = normalize(name);
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push({
      name,
      room: entry.room,
      tier: entry.tier,
      note: entry.note ?? FALLBACK_NOTE[entry.flags.includes("N") ? "N" : "R"] ?? "",
    });
  }
  return result;
}

/** Nome do ambiente em que cada cômodo do catálogo costuma ficar (os mesmos nomes do funil). */
export const ROOM_CATEGORY_NAME: Record<CatalogEntry["room"], string> = {
  quarto: "Quarto",
  quartoExtra: "Quarto Extra",
  banheiro: "Banheiro",
  cozinha: "Cozinha",
  eletro: "Eletrodomésticos",
  servico: "Área de Serviço",
  sala: "Sala de Estar",
  externa: "Varanda",
  escritorio: "Home Office",
};
