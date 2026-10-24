// Regras puras do motor de ciclo de vida: passos de cada fluxo, prioridade, limites e grupo de controle.
// Sem banco nem envio, para os testes cobrirem cada decisão (ver tests/lifecycle.mjs).
import { createHash } from 'node:crypto';

export type FlowKey =
  | 'countdown' | 'first_value' | 'funnel_resume' | 'overdue' | 'invite_stalled' | 'post_move' | 'milestone' | 'inactive';
/** Mensagens que não saem do motor, mas entram no mesmo limite de frequência e no painel de ciclo de vida. */
export type MessageKind = FlowKey | 'price_drop' | 'warranty' | 'campaign';
export type PreferenceCategory = 'reminders' | 'tips';
export type LifecycleMode = 'off' | 'simulate' | 'send';

/** Quando mais de um fluxo qualifica, vence o primeiro desta lista (L3 > L2 > L1 > L4 > L8 > L9 > L7 > L6). */
export const FLOW_PRIORITY: FlowKey[] = [
  'countdown', 'first_value', 'funnel_resume', 'overdue', 'invite_stalled', 'post_move', 'milestone', 'inactive',
];
export const FLOW_CATEGORY: Record<FlowKey, PreferenceCategory> = {
  countdown: 'reminders', funnel_resume: 'reminders', overdue: 'reminders', invite_stalled: 'reminders',
  first_value: 'tips', inactive: 'tips', post_move: 'tips', milestone: 'tips',
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
  overdue: 7 * DAY, invite_stalled: 4 * DAY, post_move: 14 * DAY, milestone: 3 * DAY,
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

/** L4: resumo de atrasos, no máximo um por semana (a chave é a segunda-feira da semana) enquanto houver atraso. */
export function overdueSteps(overdueCount: number, now: number): FlowStep[] {
  if (overdueCount <= 0) return [];
  const date = new Date(now);
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return [{ key: `wk:${new Date(monday).toISOString().slice(0, 10)}`, at: monday }];
}

/** L9: pesquisa 30 dias depois da mudança, uma vez por data de mudança. */
export function postMoveSteps(moveDate: string): FlowStep[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveDate)) return [];
  return [{ key: `d30:${moveDate}`, at: moveDay(moveDate) + 30 * DAY }];
}

export interface StalledInvite { id: string; email: string; created_at: Date | string }

/** L8: convite sem resposta há 3 dias. Um aviso por convite, só para quem convidou (nunca para o convidado). */
export function inviteStalledSteps(invites: StalledInvite[]): FlowStep[] {
  return invites
    .map(invite => ({ key: `inv:${invite.id}`, at: new Date(invite.created_at).getTime() + 3 * DAY }))
    .sort((a, b) => a.at - b.at);
}

export type MilestoneKind = 'room50' | 'room100' | 'overall80';
export interface Milestone { kind: MilestoneKind; ref: string; label: string | null; reachedAt: number }
export interface RoomProgress { id: string; name: string; total: number; done: number; last_done_at: Date | string | null }

const MILESTONE_RANK: Record<MilestoneKind, number> = { room50: 0, room100: 1, overall80: 2 };
/** Ambientes com menos itens que isso não geram marco: completar um ambiente de um item só não é conquista. */
export const MILESTONE_MIN_ITEMS = 3;

/**
 * L7: marcos já alcançados (metade de um ambiente, ambiente completo, 80% do enxoval). O momento do marco é a
 * última conquista do ambiente (ou do enxoval); a janela curta do fluxo faz só os marcos recentes virarem e-mail.
 */
export function reachedMilestones(rooms: RoomProgress[]): Milestone[] {
  const milestones: Milestone[] = [];
  for (const room of rooms) {
    if (room.total < MILESTONE_MIN_ITEMS || !room.last_done_at) continue;
    const reachedAt = new Date(room.last_done_at).getTime();
    if (room.done >= room.total) milestones.push({ kind: 'room100', ref: room.id, label: room.name, reachedAt });
    else if (room.done * 2 >= room.total) milestones.push({ kind: 'room50', ref: room.id, label: room.name, reachedAt });
  }
  const total = rooms.reduce((sum, room) => sum + room.total, 0);
  const done = rooms.reduce((sum, room) => sum + room.done, 0);
  const latest = Math.max(...rooms.map(room => (room.last_done_at ? new Date(room.last_done_at).getTime() : 0)), 0);
  if (total >= MILESTONE_MIN_ITEMS && done * 5 >= total * 4 && latest) {
    milestones.push({ kind: 'overall80', ref: 'all', label: null, reachedAt: latest });
  }
  return milestones;
}

/** Passos dos marcos em ordem; no empate, o marco maior fica por último e é o escolhido por `dueStep`. */
export function milestoneSteps(milestones: Milestone[]): FlowStep[] {
  return [...milestones]
    .sort((a, b) => a.reachedAt - b.reachedAt || MILESTONE_RANK[a.kind] - MILESTONE_RANK[b.kind])
    .map(milestone => ({ key: `${milestone.kind}:${milestone.ref}`, at: milestone.reachedAt }));
}

/** 10% das pessoas elegíveis de cada fluxo ficam de fora, sempre as mesmas (hash estável). */
export function inHoldout(userId: string, flow: FlowKey | `campaign:${string}`, percent = HOLDOUT_PERCENT) {
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
