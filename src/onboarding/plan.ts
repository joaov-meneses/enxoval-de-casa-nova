import { CATALOG, type CatalogEntry } from "./catalog";
import type {
  Answers,
  Budget,
  Climate,
  ExcludeReason,
  GeneratedPlan,
  Housing,
  Milestone,
  Moment,
  OptionalRoom,
  PlanCategory,
  PlanItem,
  PlanPayload,
  RoomKey,
  Savings,
} from "./types";

export const emptyAnswers: Answers = {
  name: "",
  moment: null,
  moveDate: null,
  moveDateAnswered: false,
  state: null,
  housing: null,
  people: null,
  rooms: null,
  owned: null,
  style: null,
  budget: null,
  worries: [],
  usage: [],
  source: "",
};

/* ---------------------------------------------------------------- estados */

export interface StateInfo {
  uf: string;
  name: string;
  /** Com a preposição ("na Bahia", "em São Paulo"). */
  loc: string;
  climate: Climate;
}

export const STATES: StateInfo[] = [
  { uf: "AC", name: "Acre", loc: "no Acre", climate: "hot" },
  { uf: "AL", name: "Alagoas", loc: "em Alagoas", climate: "hot" },
  { uf: "AP", name: "Amapá", loc: "no Amapá", climate: "hot" },
  { uf: "AM", name: "Amazonas", loc: "no Amazonas", climate: "hot" },
  { uf: "BA", name: "Bahia", loc: "na Bahia", climate: "hot" },
  { uf: "CE", name: "Ceará", loc: "no Ceará", climate: "hot" },
  { uf: "DF", name: "Distrito Federal", loc: "no Distrito Federal", climate: "mild" },
  { uf: "ES", name: "Espírito Santo", loc: "no Espírito Santo", climate: "hot" },
  { uf: "GO", name: "Goiás", loc: "em Goiás", climate: "mild" },
  { uf: "MA", name: "Maranhão", loc: "no Maranhão", climate: "hot" },
  { uf: "MT", name: "Mato Grosso", loc: "em Mato Grosso", climate: "hot" },
  { uf: "MS", name: "Mato Grosso do Sul", loc: "em Mato Grosso do Sul", climate: "mild" },
  { uf: "MG", name: "Minas Gerais", loc: "em Minas Gerais", climate: "mild" },
  { uf: "PA", name: "Pará", loc: "no Pará", climate: "hot" },
  { uf: "PB", name: "Paraíba", loc: "na Paraíba", climate: "hot" },
  { uf: "PR", name: "Paraná", loc: "no Paraná", climate: "cold" },
  { uf: "PE", name: "Pernambuco", loc: "em Pernambuco", climate: "hot" },
  { uf: "PI", name: "Piauí", loc: "no Piauí", climate: "hot" },
  { uf: "RJ", name: "Rio de Janeiro", loc: "no Rio de Janeiro", climate: "hot" },
  { uf: "RN", name: "Rio Grande do Norte", loc: "no Rio Grande do Norte", climate: "hot" },
  { uf: "RS", name: "Rio Grande do Sul", loc: "no Rio Grande do Sul", climate: "cold" },
  { uf: "RO", name: "Rondônia", loc: "em Rondônia", climate: "hot" },
  { uf: "RR", name: "Roraima", loc: "em Roraima", climate: "hot" },
  { uf: "SC", name: "Santa Catarina", loc: "em Santa Catarina", climate: "cold" },
  { uf: "SP", name: "São Paulo", loc: "em São Paulo", climate: "mild" },
  { uf: "SE", name: "Sergipe", loc: "em Sergipe", climate: "hot" },
  { uf: "TO", name: "Tocantins", loc: "no Tocantins", climate: "hot" },
];

const NORDESTE = new Set(["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]);

export function stateInfo(uf: string | null): StateInfo {
  return STATES.find((s) => s.uf === uf) ?? STATES.find((s) => s.uf === "SP")!;
}

export type SeasonTone = "calor" | "ameno" | "fresco" | "frio";

/** Verão, outono, inverno e primavera, no clima típico do estado. */
export const SEASONS: Record<Climate, SeasonTone[]> = {
  hot: ["calor", "calor", "ameno", "calor"],
  mild: ["calor", "ameno", "fresco", "ameno"],
  cold: ["calor", "ameno", "frio", "ameno"],
};

/* ------------------------------------------------------------------ datas */

export function parseLocalDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function weeksUntil(value: string, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round(
    (parseLocalDate(value).getTime() - today.getTime()) / 86_400_000,
  );
  return Math.max(0, Math.ceil(days / 7));
}

export type Phase = "plan" | "buy" | "final" | "now";

export function phaseOf(weeks: number): Phase {
  if (weeks >= 12) return "plan";
  if (weeks >= 4) return "buy";
  if (weeks >= 1) return "final";
  return "now";
}

/* --------------------------------------------------------------- utilidades */

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function defaultPeople(moment: Moment | null) {
  if (moment === "solo") return 1;
  if (moment === "amigos") return 3;
  return 2;
}

export function defaultRooms(
  housing: Housing | null,
  people: number | null,
): OptionalRoom[] {
  const rooms: OptionalRoom[] =
    housing === "studio"
      ? ["cozinha", "banheiro", "sala", "servico"]
      : ["cozinha", "banheiro", "sala", "quarto", "servico", "externa"];
  if (housing !== "studio" && (people ?? 0) >= 3) rooms.push("quartoExtra");
  return rooms;
}

const ROOM_ORDER: RoomKey[] = [
  "quarto",
  "banheiro",
  "cozinha",
  "eletro",
  "servico",
  "sala",
  "quartoExtra",
  "escritorio",
  "externa",
];

const BUDGET_MAX_CENTS: Record<Budget, number | null> = {
  lt10: 1_000_000,
  "10-25": 2_500_000,
  "25-50": 5_000_000,
  gt50: Number.MAX_SAFE_INTEGER,
  unknown: null,
};

/** Faixas de referência por categoria de preço (centavos). Só para a estimativa do funil. */
const TIER_BAND: Record<1 | 2 | 3 | 4, [number, number]> = {
  1: [2_500, 5_000],
  2: [8_000, 15_000],
  3: [25_000, 50_000],
  4: [120_000, 220_000],
};

const DEFERRED_NOTE = "pode ficar para depois";
const DEFER_ROOMS = new Set<RoomKey>(["sala", "quartoExtra", "externa", "escritorio"]);

/* ----------------------------------------------------------------- gerador */

interface Resolved {
  moment: Moment;
  housing: Housing;
  people: number;
  rooms: Set<RoomKey>;
  uf: string;
  climate: Climate;
  style: "full" | "min";
  budget: Budget;
  name: string;
}

function resolve(a: Answers): Resolved {
  const housing = a.housing ?? "apartamento";
  const moment = a.moment ?? "casal";
  const people = Math.min(Math.max(a.people ?? defaultPeople(moment), 1), 6);
  const rooms = new Set<RoomKey>(a.rooms ?? defaultRooms(housing, people));
  // Eletrodomésticos acompanham a cozinha.
  if (rooms.has("cozinha")) rooms.add("eletro");
  // Studio tem sala e quarto juntos: marcar a sala traz o quarto.
  if (housing === "studio") {
    rooms.delete("quartoExtra");
    if (rooms.has("sala")) rooms.add("quarto");
    else rooms.delete("quarto");
  }
  const info = stateInfo(a.state);
  return {
    moment,
    housing,
    people,
    rooms,
    uf: info.uf,
    climate: info.climate,
    style: a.style ?? "full",
    budget: a.budget ?? "unknown",
    name: firstName(a.name),
  };
}

interface Evaluation {
  ok: boolean;
  essential: boolean;
  /** Preenchido quando o item não entra no plano. */
  reason?: ExcludeReason;
}

const skip = (reason: ExcludeReason): Evaluation => ({ ok: false, essential: false, reason });

/** Decide se um item do catálogo entra no plano e, se não, por quê. */
function evaluate(entry: CatalogEntry, r: Resolved, full: boolean): Evaluation {
  const has = (letter: string) => entry.flags.includes(letter);

  if (!r.rooms.has(entry.room)) return skip("rooms");
  if (
    (has("K") && r.housing !== "casa") ||
    (has("A") && r.housing === "casa") ||
    (has("X") && r.housing === "studio") ||
    (has("O") && r.housing !== "studio")
  ) {
    return skip("housing");
  }
  if (has("F") && r.climate === "hot") return skip("climate");
  if ((has("N") && !NORDESTE.has(r.uf)) || (has("R") && r.uf !== "RS")) {
    return skip("region");
  }
  if ((has("C") && r.moment !== "casal") || (has("S") && r.moment === "casal")) {
    return skip("moment");
  }

  const essential =
    has("E") ||
    (has("H") && r.climate === "hot") ||
    (has("F") && r.climate === "cold");
  if (!full && !essential) return skip("style");
  return { ok: true, essential };
}

function itemsFor(r: Resolved, full: boolean) {
  const byRoom = new Map<RoomKey, PlanItem[]>();
  const seen = new Set<string>();

  for (const entry of CATALOG) {
    const verdict = evaluate(entry, r, full);
    if (!verdict.ok) continue;
    const { essential } = verdict;
    const has = (letter: string) => entry.flags.includes(letter);

    const name = entry.name.replace(
      "{cama}",
      r.moment === "casal" ? "de casal" : "de solteiro",
    );
    const roomKey: RoomKey =
      r.housing === "studio" && entry.room === "quarto" ? "sala" : entry.room;
    const dedupeKey = `${roomKey}:${name.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let quantity = 0;
    if (has("P")) quantity = Math.min(r.people + (full ? 2 : 0), 12);
    else if (has("T")) quantity = r.people * 2;
    else if (has("Q")) quantity = r.moment === "casal" ? 2 : 1;

    const parts: string[] = [];
    if (full) parts.push(essential ? "Essencial" : "Opcional");
    if (quantity > 1 || (quantity === 1 && has("P"))) {
      parts.push(`${quantity} un.`);
    }

    const list = byRoom.get(roomKey) ?? [];
    list.push({
      name,
      description: parts.join(" · "),
      essential,
      tier: entry.tier,
      room: entry.room,
      firstNight: has("I"),
    });
    byRoom.set(roomKey, list);
  }
  return byRoom;
}

function countItems(map: Map<RoomKey, PlanItem[]>) {
  let total = 0;
  for (const items of map.values()) total += items.length;
  return total;
}

function estimate(categories: PlanCategory[], skipDeferred = false) {
  let min = 0;
  let max = 0;
  for (const category of categories) {
    for (const item of category.items) {
      if (skipDeferred && item.description.includes(DEFERRED_NOTE)) continue;
      min += TIER_BAND[item.tier][0];
      max += TIER_BAND[item.tier][1];
    }
  }
  return { min, max };
}

export function enxovalNameFor(moment: Moment, name: string) {
  if (moment === "solo" && name) return `Casa de ${name}`;
  if (moment === "troca") return "Minha nova casa";
  return "Nossa casa nova";
}

export function generatePlan(answers: Answers): GeneratedPlan {
  const r = resolve(answers);
  const fullMap = itemsFor(r, true);
  const essentialMap = itemsFor(r, false);
  const chosen = r.style === "min" ? essentialMap : fullMap;

  const categories: PlanCategory[] = [];
  for (const key of ROOM_ORDER) {
    const items = chosen.get(key);
    if (!items?.length) continue;
    const name =
      key === "sala" && r.housing === "studio"
        ? "Sala e Quarto"
        : key === "externa"
          ? r.housing === "casa"
            ? "Área Externa"
            : "Varanda"
          : ({
              quarto: "Quarto",
              banheiro: "Banheiro",
              cozinha: "Cozinha",
              eletro: "Eletrodomésticos",
              servico: "Área de Serviço",
              sala: "Sala de Estar",
              quartoExtra: "Quarto Extra",
              escritorio: "Home Office",
            } as Record<string, string>)[key];
    categories.push({ key, name, items: [...items] });
  }

  // Studio: a sala (que agora também guarda o quarto) vem primeiro.
  if (r.housing === "studio") {
    categories.sort((a, b) =>
      a.key === "sala" ? -1 : b.key === "sala" ? 1 : 0,
    );
  }

  const { min, max } = estimate(categories);
  const limit = BUDGET_MAX_CENTS[r.budget];
  const budgetFit =
    limit === null ? "unknown" : min > limit ? "over" : max <= limit ? "within" : "tight";

  let deferred = 0;
  for (const category of categories) {
    category.items = category.items.map((item) => {
      const shouldDefer =
        budgetFit === "over" &&
        item.tier === 4 &&
        (!item.essential || DEFER_ROOMS.has(item.room));
      if (!shouldDefer) return item;
      deferred += 1;
      return {
        ...item,
        description: [item.description, `Compra grande, ${DEFERRED_NOTE}`]
          .filter(Boolean)
          .join(" · "),
        essential: false,
      };
    });
    const rank = (item: PlanItem) =>
      item.description.includes(DEFERRED_NOTE) ? 2 : item.essential ? 0 : 1;
    category.items = category.items
      .map((item, index) => ({ item, index }))
      .sort((x, y) => rank(x.item) - rank(y.item) || x.index - y.index)
      .map(({ item }) => item);
  }

  const now = estimate(categories, true);

  return {
    enxovalName: enxovalNameFor(r.moment, r.name),
    categories,
    stats: {
      total: categories.reduce((sum, c) => sum + c.items.length, 0),
      essentials: countItems(essentialMap),
      complete: countItems(fullMap),
      rooms: categories.length,
      estimateMinCents: min,
      estimateMaxCents: max,
      estimateNowMinCents: now.min,
      estimateNowMaxCents: now.max,
      bigTicketDeferred: deferred,
      budgetFit,
    },
  };
}

export function toPayload(plan: GeneratedPlan): PlanPayload {
  return {
    categories: plan.categories.map((category) => ({
      name: category.name,
      items: category.items.map((item) => ({
        name: item.name,
        description: item.description,
      })),
    })),
  };
}

/** "R$ 15 a 28 mil" */
export function formatEstimate(minCents: number, maxCents: number) {
  const toThousands = (cents: number) => Math.round(cents / 100_000);
  const low = toThousands(minCents);
  const high = Math.max(toThousands(maxCents), low + 1);
  return `R$ ${low} a ${high} mil`;
}

/* ----------------------------------------------- informações de valor do funil */

const ALL_ROOMS: OptionalRoom[] = [
  "cozinha",
  "banheiro",
  "sala",
  "quarto",
  "quartoExtra",
  "servico",
  "externa",
  "escritorio",
];

/** Quantos itens cada espaço teria no plano completo, para mostrar ao escolher. */
export function roomItemCounts(
  answers: Answers,
): Partial<Record<OptionalRoom, number>> {
  const r = resolve({ ...answers, rooms: ALL_ROOMS, style: "full" });
  const map = itemsFor(r, true);
  const count = (key: RoomKey) => map.get(key)?.length ?? 0;
  return {
    cozinha: count("cozinha") + count("eletro"),
    banheiro: count("banheiro"),
    sala: count("sala"),
    quarto: count("quarto"),
    quartoExtra: count("quartoExtra"),
    servico: count("servico"),
    externa: count("externa"),
    escritorio: count("escritorio"),
  };
}

/**
 * Compara o plano com uma lista genérica (todo o catálogo, sem considerar clima, moradia,
 * região, momento nem espaços) e explica o que ficou de fora.
 */
export function savingsFor(answers: Answers): Savings {
  const r = resolve(answers);
  const full = r.style === "full";
  const plan = generatePlan(answers);
  const byReason = new Map<ExcludeReason, { count: number; examples: string[] }>();
  let genericMin = 0;
  let genericMax = 0;
  let removed = 0;

  for (const entry of CATALOG) {
    genericMin += TIER_BAND[entry.tier][0];
    genericMax += TIER_BAND[entry.tier][1];
    const verdict = evaluate(entry, r, full);
    if (verdict.ok) continue;
    removed += 1;
    const reason = verdict.reason ?? "rooms";
    const slot = byReason.get(reason) ?? { count: 0, examples: [] };
    slot.count += 1;
    const name = entry.name.replace("{cama}", "de casal");
    if (slot.examples.length < 3 && !slot.examples.includes(name)) {
      slot.examples.push(name);
    }
    byReason.set(reason, slot);
  }

  return {
    genericTotal: CATALOG.length,
    planTotal: plan.stats.total,
    removedCount: removed,
    genericMinCents: genericMin,
    genericMaxCents: genericMax,
    planMinCents: plan.stats.estimateMinCents,
    planMaxCents: plan.stats.estimateMaxCents,
    reasons: [...byReason.entries()]
      .map(([reason, value]) => ({ reason, ...value }))
      .sort((x, y) => y.count - x.count),
  };
}

/** Itens do plano que precisam estar prontos na noite da mudança. */
export function firstNightItems(plan: GeneratedPlan) {
  return plan.categories.flatMap((category) =>
    category.items
      .filter((item) => item.firstNight)
      .map((item) => ({ ...item, category: category.name })),
  );
}

/** Semanas antes da mudança em que cada grupo de compras deve estar resolvido. */
const MILESTONE_WEEKS: Record<Milestone["id"], number> = {
  big: 8,
  mid: 5,
  small: 2,
  night: 1,
  after: -4,
};

/**
 * Divide o plano em marcos de compra (todo item cai em exatamente um) e, se a pessoa
 * sabe a data da mudança, calcula até quando cada marco deve estar resolvido.
 */
export function scheduleFor(
  plan: GeneratedPlan,
  moveDate: string | null,
  now = new Date(),
): Milestone[] {
  const groups: Record<Milestone["id"], string[]> = {
    big: [],
    mid: [],
    small: [],
    night: [],
    after: [],
  };
  for (const category of plan.categories) {
    for (const item of category.items) {
      const id: Milestone["id"] = item.firstNight
        ? "night"
        : !item.essential
          ? "after"
          : item.tier === 4
            ? "big"
            : item.tier === 3
              ? "mid"
              : "small";
      groups[id].push(item.name);
    }
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const order: Milestone["id"][] = ["big", "mid", "small", "night", "after"];
  return order
    .filter((id) => groups[id].length > 0)
    .map((id) => {
      let date: string | null = null;
      let isNow = false;
      if (moveDate) {
        const target = parseLocalDate(moveDate);
        target.setDate(target.getDate() - MILESTONE_WEEKS[id] * 7);
        isNow = target < today;
        date = toISODate(isNow ? today : target);
      }
      return {
        id,
        date,
        now: isNow,
        count: groups[id].length,
        examples: groups[id].slice(0, 3),
      };
    });
}
