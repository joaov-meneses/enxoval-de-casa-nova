/**
 * Parcelas e fluxo mensal (Fase 11.1). No Brasil, compra grande de casa é parcelada: além de "quanto falta investir",
 * o casal quer saber quanto da renda de cada mês já está comprometido. "Já investimos" continua sendo o valor total da
 * compra; o fluxo mensal é uma visão à parte, sem histórico de pagamento real (não é app de finanças).
 */
import { netPriceCents } from "../itemStatus";
import type { EnxovalItem, PaymentMethod } from "../types";
import { weekRange, type PurchasePlan } from "./purchasePlan";

export const MAX_INSTALLMENTS = 24;

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  credit: "Cartão de crédito",
  debit: "Cartão de débito",
  boleto: "Boleto",
  cash: "Dinheiro",
  other: "Outro",
};

/** AAAA-MM-DD de um dia que existe no calendário (recusa 2027-02-31 e 2027-13-01). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Soma meses a uma data, sem pular mês: 31/01 + 1 mês vira 28/02 (ou 29 no bissexto). */
export function addMonths(iso: string, months: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
}

/** "AAAA-MM" de uma data (AAAA-MM-DD ou Date no fuso local). */
export function monthOf(date: string | Date) {
  if (typeof date === "string") return date.slice(0, 7);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function addMonthKey(month: string, count: number) {
  const [year, value] = month.split("-").map(Number);
  const target = new Date(Date.UTC(year, value - 1 + count, 1));
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "mar/2027". */
export function formatMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return `${MONTHS[(value - 1 + 12) % 12]}/${year}`;
}

export function normalizeInstallments(value: unknown) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_INSTALLMENTS ? count : 1;
}

type InstallmentItem = Pick<
  EnxovalItem,
  "status" | "priceCents" | "discountCents" | "installments" | "installmentCents" | "firstInstallmentOn" | "purchasedAt"
>;

export interface InstallmentPlan {
  count: number;
  /** Valor de cada parcela, na ordem (a primeira leva os centavos que sobram da divisão). */
  amounts: number[];
  totalCents: number;
  /** Juros: parcelas somadas menos o preço. Zero quando não há juros informados. */
  interestCents: number;
  /** Mês da primeira parcela; nulo quando não dá para saber (item pendente sem data da mudança). */
  firstMonth: string | null;
}

/** Como o valor do item se divide nas parcelas. Sem preço, não há o que dividir. */
export function installmentPlan(item: InstallmentItem, fallbackMonth: string | null = null): InstallmentPlan | null {
  const price = netPriceCents(item);
  if (price <= 0) return null;
  const count = normalizeInstallments(item.installments);
  let amounts: number[];
  if (count > 1 && item.installmentCents && item.installmentCents > 0) {
    amounts = Array.from({ length: count }, () => item.installmentCents!);
  } else {
    const base = Math.floor(price / count);
    amounts = Array.from({ length: count }, (_, index) => base + (index === 0 ? price - base * count : 0));
  }
  const totalCents = amounts.reduce((sum, value) => sum + value, 0);
  const firstMonth = item.firstInstallmentOn
    ? monthOf(item.firstInstallmentOn)
    : item.purchasedAt
      ? monthOf(item.purchasedAt)
      : fallbackMonth;
  return { count, amounts, totalCents, interestCents: Math.max(0, totalCents - price), firstMonth };
}

/** "10x R$ 189" para a linha do item; nada quando é à vista. */
export function installmentBadge(item: InstallmentItem) {
  const plan = installmentPlan(item);
  if (!plan || plan.count < 2) return null;
  const digits = plan.amounts.at(-1)! % 100 ? 2 : 0;
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${plan.count}x ${money.format(plan.amounts.at(-1)! / 100)}`;
}

export interface FlowEntry {
  id: string;
  name: string;
  cents: number;
  /** `committed`: compra feita (parcela assumida). `forecast`: item pendente, pela semana planejada. */
  kind: "committed" | "forecast";
  installment: number;
  of: number;
}

export interface FlowMonth {
  month: string;
  committedCents: number;
  forecastCents: number;
  entries: FlowEntry[];
}

export interface MonthlyFlow {
  months: FlowMonth[];
  /** Parcelas já assumidas neste mês e nos dois seguintes. */
  committedNext3Cents: number;
  /** Mês da última parcela já assumida. */
  lastInstallmentMonth: string | null;
  interestCents: number;
  /** Itens pendentes com preço que ficaram fora da previsão por falta da data da mudança. */
  unscheduledCount: number;
}

const MAX_FLOW_MONTHS = 36;

/**
 * Fluxo mês a mês a partir do mês atual: parcelas das compras feitas mais a previsão dos itens pendentes (pela
 * semana de compra do planejamento, que depende da data da mudança). Meses passados não aparecem.
 */
export function monthlyFlow(
  items: EnxovalItem[],
  plan: PurchasePlan<EnxovalItem> | null,
  moveDate: string | null,
  now = new Date(),
): MonthlyFlow {
  const current = monthOf(now);
  const byMonth = new Map<string, FlowMonth>();
  let interestCents = 0;
  let lastInstallmentMonth: string | null = null;
  let unscheduledCount = 0;

  for (const item of items) {
    if (item.status !== "bought" && item.status !== "researching") continue;
    let fallback: string | null = null;
    if (item.status === "bought") {
      fallback = monthOf(item.updatedAt ? new Date(item.updatedAt) : now);
    } else if (!item.firstInstallmentOn) {
      const entry = plan?.byId.get(item.id);
      if (moveDate && entry) fallback = monthOf(weekRange(moveDate, entry.placement.week).start);
    }
    const schedule = installmentPlan(item, fallback);
    if (!schedule) continue;
    if (!schedule.firstMonth) {
      unscheduledCount += 1;
      continue;
    }
    const kind = item.status === "bought" ? "committed" : "forecast";
    if (kind === "committed") interestCents += schedule.interestCents;
    schedule.amounts.forEach((cents, index) => {
      const month = addMonthKey(schedule.firstMonth!, index);
      if (kind === "committed" && (!lastInstallmentMonth || month > lastInstallmentMonth)) lastInstallmentMonth = month;
      if (month < current) return;
      const bucket = byMonth.get(month) ?? { month, committedCents: 0, forecastCents: 0, entries: [] };
      if (kind === "committed") bucket.committedCents += cents;
      else bucket.forecastCents += cents;
      bucket.entries.push({ id: item.id, name: item.name, cents, kind, installment: index + 1, of: schedule.count });
      byMonth.set(month, bucket);
    });
  }

  const last = [...byMonth.keys()].sort().at(-1);
  const months: FlowMonth[] = [];
  if (last) {
    for (let month = current; month <= last && months.length < MAX_FLOW_MONTHS; month = addMonthKey(month, 1)) {
      months.push(byMonth.get(month) ?? { month, committedCents: 0, forecastCents: 0, entries: [] });
    }
  }
  const nextThree = new Set([current, addMonthKey(current, 1), addMonthKey(current, 2)]);
  return {
    months,
    committedNext3Cents: months.filter((month) => nextThree.has(month.month)).reduce((sum, month) => sum + month.committedCents, 0),
    lastInstallmentMonth: lastInstallmentMonth && lastInstallmentMonth >= current ? lastInstallmentMonth : null,
    interestCents,
    unscheduledCount,
  };
}
