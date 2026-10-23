// Regras puras do motor de ciclo de vida: passos de cada fluxo, prioridade, limites e grupo de controle.
// Sem banco nem envio, para os testes cobrirem cada decisão (ver tests/lifecycle.mjs).
import { createHash } from 'node:crypto';

export type FlowKey = 'countdown' | 'first_value' | 'funnel_resume' | 'inactive';
export type PreferenceCategory = 'reminders' | 'tips';
export type LifecycleMode = 'off' | 'simulate' | 'send';

/** Quando mais de um fluxo qualifica, vence o primeiro desta lista (L3 > L2 > L1 > L6). */
export const FLOW_PRIORITY: FlowKey[] = ['countdown', 'first_value', 'funnel_resume', 'inactive'];
export const FLOW_CATEGORY: Record<FlowKey, PreferenceCategory> = {
  countdown: 'reminders', funnel_resume: 'reminders', first_value: 'tips', inactive: 'tips',
};
export const TEMPLATE_VERSION = '1';
export const HOLDOUT_PERCENT = 10;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface FlowStep { key: string; at: number }

/** Modo do motor: `off` (padrão), `simulate` (só registra) ou `send`. */
export function lifecycleMode(env: NodeJS.ProcessEnv = process.env): LifecycleMode {
  const value = env.LIFECYCLE_MODE?.trim().toLowerCase();
  return value === 'send' || value === 'simulate' ? value : 'off';
}

/**
 * O passo mais recente que já venceu e ainda não foi enviado. Passos antigos não são mandados em atraso: se a
 * pessoa já passou do prazo de um passo (janela), ele é pulado em favor do seguinte.
 */
export function dueStep(steps: FlowStep[], now: number, sent: ReadonlySet<string>, windowMs: number) {
  const due = steps.filter(step => step.at <= now);
  const latest = due.at(-1);
  if (!latest || sent.has(latest.key) || now - latest.at > windowMs) return null;
  return latest;
}

export const FLOW_WINDOW_MS: Record<FlowKey, number> = {
  funnel_resume: 2 * DAY, first_value: 2 * DAY, countdown: 6 * DAY, inactive: 7 * DAY,
};

/** L1: conta criada sem enxoval (+2 h, +1 dia, +4 dias). */
export function funnelResumeSteps(createdAt: Date): FlowStep[] {
  const start = createdAt.getTime();
  return [{ key: '2h', at: start + 2 * HOUR }, { key: '1d', at: start + DAY }, { key: '4d', at: start + 4 * DAY }];
}

/** L2: enxoval sem item conquistado (+1, +3 e +7 dias). */
export function firstValueSteps(enxovalCreatedAt: Date): FlowStep[] {
  const start = enxovalCreatedAt.getTime();
  return [{ key: '1d', at: start + DAY }, { key: '3d', at: start + 3 * DAY }, { key: '7d', at: start + 7 * DAY }];
}

/** Meio-dia de Brasília do dia da mudança. A data entra na chave: mudar a data faz a contagem recomeçar. */
function moveDay(moveDate: string) {
  const [year, month, day] = moveDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day, 15);
}

/** L3: T-12, T-8, T-4, T-1 semanas, semana da mudança e T+1. */
export function countdownSteps(moveDate: string): FlowStep[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveDate)) return [];
  const move = moveDay(moveDate);
  return ([['w12', -12], ['w8', -8], ['w4', -4], ['w1', -1], ['w0', 0], ['after1', 1]] as const)
    .map(([key, weeks]) => ({ key: `${key}:${moveDate}`, at: move + weeks * 7 * DAY }));
}

/** Semanas inteiras que faltam para a mudança (negativo depois dela). */
export function weeksToMove(moveDate: string, now: number) {
  return Math.round((moveDay(moveDate) - now) / (7 * DAY));
}

/** L6: sem acesso há 21, 45 e 90 dias. Cada período de ausência (data do último acesso) conta de novo. */
export function inactiveSteps(lastActivityAt: Date): FlowStep[] {
  const start = lastActivityAt.getTime();
  const period = lastActivityAt.toISOString().slice(0, 10);
  return [21, 45, 90].map(days => ({ key: `d${days}:${period}`, at: start + days * DAY }));
}

/** 10% das pessoas elegíveis de cada fluxo ficam de fora, sempre as mesmas (hash estável). */
export function inHoldout(userId: string, flow: FlowKey, percent = HOLDOUT_PERCENT) {
  const digest = createHash('sha256').update(`${flow}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100 < percent;
}

export function localHour(now: Date, timezone: string) {
  try {
    const hour = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: timezone }).format(now);
    return Number(hour);
  } catch {
    return localHour(now, 'America/Sao_Paulo');
  }
}

/** E-mails só entre 8h e 20h no fuso da pessoa. */
export function withinSendingHours(now: Date, timezone: string, start = 8, end = 20) {
  const hour = localHour(now, timezone);
  return hour >= start && hour < end;
}

/** No máximo 1 e-mail de marketing por dia e 2 por semana por pessoa. */
export function frequencyAllows(sentAt: Date[], now: number) {
  const lastDay = sentAt.filter(date => now - date.getTime() < DAY).length;
  const lastWeek = sentAt.filter(date => now - date.getTime() < 7 * DAY).length;
  return lastDay === 0 && lastWeek < 2;
}

export function categoryEnabled(preferences: unknown, category: PreferenceCategory) {
  return !(preferences && typeof preferences === 'object' && (preferences as Record<string, unknown>)[category] === false);
}
