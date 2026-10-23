import { weeksUntil } from "./plan";
import type { Answers, GeneratedPlan, Usage, Worry } from "./types";

/** Respostas do funil prontas para métrica: só categorias, faixas e marcações. Nunca nome, data exata ou texto livre. */
export type OnboardingMetrics = Record<string, string | number | boolean>;

const WORRIES: Worry[] = ["start", "waste", "forget", "budget", "time"];
const USAGES: Usage[] = ["buy", "spend", "links", "share"];

/** Faixas de semanas até a mudança (seção 6.2 do plano de analytics): nunca a data exata. */
export function weeksToMoveBucket(moveDate: string | null, now = new Date()) {
  if (!moveDate) return "sem_data";
  const weeks = weeksUntil(moveDate, now);
  if (weeks <= 4) return "0-4";
  if (weeks <= 12) return "5-12";
  if (weeks <= 26) return "13-26";
  return "27+";
}

/**
 * Propriedades de `onboarding_complete` e da pessoa no PostHog. Cada preocupação e cada uso vira uma marcação
 * própria (dá para filtrar e quebrar por qualquer uma); o motivo digitado em "nenhuma das opções" fica só no banco.
 */
export function onboardingMetrics(answers: Answers, plan: GeneratedPlan, now = new Date()): OnboardingMetrics {
  const people = answers.people ?? 0;
  const metrics: OnboardingMetrics = {
    moment: answers.moment ?? "unknown",
    housing: answers.housing ?? "unknown",
    people_bucket: people >= 5 ? "5+" : people > 0 ? String(people) : "unknown",
    rooms_count: plan.categories.length,
    items_count: plan.stats.total,
    no_rooms: plan.categories.length === 0,
    owned: answers.owned ?? "unknown",
    style: plan.categories.length === 0 ? "none" : answers.style ?? "unknown",
    budget: answers.budget ?? "unknown",
    spending_tier: plan.stats.spendingTier,
    has_move_date: Boolean(answers.moveDate),
    weeks_to_move_bucket: weeksToMoveBucket(answers.moveDate, now),
    uf: answers.state ?? "unknown",
    has_city: Boolean(answers.city),
    worries_count: answers.worries.length,
    worries_none: answers.worriesNone,
    worries_none_reason: answers.worriesNone && answers.worriesOther.trim().length > 0,
    usage_count: answers.usage.length,
    usage_none: answers.usageNone,
    usage_none_reason: answers.usageNone && answers.usageOther.trim().length > 0,
  };
  for (const worry of WORRIES) metrics[`worry_${worry}`] = answers.worries.includes(worry);
  for (const usage of USAGES) metrics[`usage_${usage}`] = answers.usage.includes(usage);
  return metrics;
}

