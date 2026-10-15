/**
 * Perfis de gasto. Cada perfil diz quanto um item de cada categoria de preço costuma custar para quem
 * escolhe aquele nível de conforto. Os valores são faixas de referência para orientar o planejamento:
 * nunca são gravados como preço de item (o preço de um item é sempre o que a pessoa informa).
 */

/** Categoria de preço de um item: 1 pequeno (R$ dezenas) até 4 compra grande (eletrodoméstico, móvel). */
export type PriceCategory = 1 | 2 | 3 | 4;

export type SpendingTier = "economico" | "equilibrado" | "confortavel" | "premium";

export const SPENDING_TIERS: readonly SpendingTier[] = [
  "economico",
  "equilibrado",
  "confortavel",
  "premium",
];

export const DEFAULT_SPENDING_TIER: SpendingTier = "equilibrado";

export interface SpendingTierInfo {
  id: SpendingTier;
  label: string;
  /** Uma frase curta: para quem é o perfil. */
  tagline: string;
  /** O que muda na prática nas compras. */
  detail: string;
}

export const SPENDING_TIER_INFO: Record<SpendingTier, SpendingTierInfo> = {
  economico: {
    id: "economico",
    label: "Econômico",
    tagline: "O básico bem resolvido",
    detail: "Marcas simples, promoções e itens de entrada. Cada real rende o máximo.",
  },
  equilibrado: {
    id: "equilibrado",
    label: "Equilibrado",
    tagline: "Bom custo-benefício",
    detail: "Qualidade que dura sem pagar por marca. É o ponto de partida mais comum.",
  },
  confortavel: {
    id: "confortavel",
    label: "Confortável",
    tagline: "Conforto no dia a dia",
    detail: "Materiais melhores, mais espaço e tecnologia onde faz diferença.",
  },
  premium: {
    id: "premium",
    label: "Premium",
    tagline: "Qualidade e design",
    detail: "Marcas reconhecidas, acabamento superior e peças para durar muitos anos.",
  },
};

/** Faixa [mínimo, máximo] em centavos, por perfil e categoria de preço. O perfil "equilibrado" é a base do funil. */
const BANDS: Record<SpendingTier, Record<PriceCategory, [number, number]>> = {
  economico: {
    1: [1_500, 3_500],
    2: [5_000, 10_000],
    3: [15_000, 30_000],
    4: [80_000, 140_000],
  },
  equilibrado: {
    1: [2_500, 5_000],
    2: [8_000, 15_000],
    3: [25_000, 50_000],
    4: [120_000, 220_000],
  },
  confortavel: {
    1: [4_000, 8_000],
    2: [13_000, 28_000],
    3: [45_000, 90_000],
    4: [200_000, 380_000],
  },
  premium: {
    1: [7_000, 15_000],
    2: [25_000, 55_000],
    3: [80_000, 180_000],
    4: [350_000, 800_000],
  },
};

export interface Band {
  minCents: number;
  maxCents: number;
}

export function isSpendingTier(value: unknown): value is SpendingTier {
  return typeof value === "string" && (SPENDING_TIERS as readonly string[]).includes(value);
}

export function isPriceCategory(value: unknown): value is PriceCategory {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/** Faixa de um item de determinada categoria de preço no perfil escolhido. */
export function bandFor(tier: SpendingTier, category: PriceCategory): Band {
  const [minCents, maxCents] = BANDS[tier][category];
  return { minCents, maxCents };
}

export function addBands(a: Band, b: Band): Band {
  return { minCents: a.minCents + b.minCents, maxCents: a.maxCents + b.maxCents };
}

export const EMPTY_BAND: Band = { minCents: 0, maxCents: 0 };

/**
 * Perfil sugerido para um plano e um limite de orçamento: o mais confortável cujo total máximo ainda cabe;
 * se nenhum cabe inteiro, o mais confortável cujo total mínimo cabe; se nem isso, o mais econômico.
 * Sem limite informado, o perfil equilibrado.
 */
export function suggestSpendingTier(
  categories: readonly PriceCategory[],
  limitCents: number | null,
): SpendingTier {
  if (limitCents === null) return DEFAULT_SPENDING_TIER;
  const total = (tier: SpendingTier) =>
    categories.reduce((sum, category) => addBands(sum, bandFor(tier, category)), EMPTY_BAND);
  const fromMostComfortable = [...SPENDING_TIERS].reverse();
  const fitsAll = fromMostComfortable.find((tier) => total(tier).maxCents <= limitCents);
  if (fitsAll) return fitsAll;
  const fitsMin = fromMostComfortable.find((tier) => total(tier).minCents <= limitCents);
  return fitsMin ?? SPENDING_TIERS[0];
}
