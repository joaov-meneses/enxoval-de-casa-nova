// Motor de ciclo de vida: quem decide um disparo é o Postgres (estado confiável); o PostHog só mede o resultado.
// Cada rodada escolhe no máximo um e-mail por pessoa, aplicando consentimento, supressão, preferências, horário,
// limite de frequência e grupo de controle, nesta ordem. Ver docs/analytics-funil-e-reengajamento.md, seção 9.
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../database.ts';
import { getLogger } from '../logger.ts';
import { appBaseUrl, canDeliverMail, sendMail, type MailMessage } from '../mailer.ts';
import { captureServerEvent } from '../productAnalytics.ts';
import { buildPurchasePlan, type ItemPriority, type ItemTiming, type PlannableItem } from '../../src/planning/purchasePlan.ts';
import { isPriceCategory, isSpendingTier, type PriceCategory } from '../../src/planning/spending.ts';
import type { ItemStatus } from '../../src/itemStatus.ts';
import { lifecycleEmail } from './emails.ts';
import {
  categoryEnabled, countdownSteps, dueStep, firstValueSteps, FLOW_CATEGORY, FLOW_PRIORITY, FLOW_WINDOW_MS,
  frequencyAllows, funnelResumeSteps, inactiveSteps, inHoldout, inviteStalledSteps, lifecycleMode, milestoneSteps,
  overdueSteps, postMoveSteps, reachedMilestones, TEMPLATE_VERSION, withinSendingHours,
  type FlowKey, type FlowStep, type LifecycleMode, type MessageKind, type MilestoneKind, type RoomProgress,
  type StalledInvite,
} from './policy.ts';

// Número fixo do lock no PostgreSQL: duas instâncias do servidor nunca rodam o motor ao mesmo tempo.
const ADVISORY_LOCK_KEY = 726_351_911;

export interface CandidateRow {
  id: string;
  email: string;
  name: string;
  timezone: string;
  created_at: Date;
  marketing_preferences: unknown;
  preferences_token: string | null;
  last_activity_at: Date | null;
  enxoval_id: string | null;
  enxoval_created_at: Date | null;
  move_date: string | null;
  spending_tier?: string | null;
  has_value: boolean | null;
  total_count: number | null;
  done_count: number | null;
  /** Itens atrasados no planejamento (calculado depois da consulta, só para quem tem data da mudança). */
  overdue_count?: number;
  overdue_items?: string[];
  /** Convites desta pessoa sem resposta há pelo menos 3 dias. */
  invites?: StalledInvite[] | null;
  /** Progresso por ambiente do enxoval (para os marcos). */
  rooms?: RoomProgress[] | null;
}

interface HistoryRow { user_id: string; flow_key: MessageKind; step: string; status: string; sent_at: Date | null }

export interface LifecycleDecision {
  userId: string;
  flow: FlowKey;
  step: FlowStep;
  enxovalId: string | null;
  holdout: boolean;
}

export interface LifecycleSummary {
  mode: LifecycleMode;
  skipped: boolean;
  considered: number;
  sent: number;
  simulated: number;
  holdout: number;
  failed: number;
}

/** Passo devido de cada fluxo, na ordem de prioridade. Função pura sobre a linha do candidato. */
export function flowCandidates(row: CandidateRow, now: number) {
  const steps: [FlowKey, FlowStep[]][] = [];
  if (row.enxoval_id && row.move_date) steps.push(['countdown', countdownSteps(row.move_date)]);
  if (row.enxoval_id && row.enxoval_created_at && !row.has_value) steps.push(['first_value', firstValueSteps(row.enxoval_created_at)]);
  if (!row.enxoval_id) steps.push(['funnel_resume', funnelResumeSteps(row.created_at)]);
  if (row.enxoval_id && row.overdue_count) steps.push(['overdue', overdueSteps(row.overdue_count, now)]);
  if (row.invites?.length) steps.push(['invite_stalled', inviteStalledSteps(row.invites)]);
  if (row.enxoval_id && row.move_date) steps.push(['post_move', postMoveSteps(row.move_date)]);
  if (row.enxoval_id && row.rooms?.length) steps.push(['milestone', milestoneSteps(reachedMilestones(row.rooms))]);
  if (row.enxoval_id && row.last_activity_at) steps.push(['inactive', inactiveSteps(row.last_activity_at)]);
  return steps
    .filter(([flow]) => categoryEnabled(row.marketing_preferences, FLOW_CATEGORY[flow]))
    .sort(([a], [b]) => FLOW_PRIORITY.indexOf(a) - FLOW_PRIORITY.indexOf(b))
    .map(([flow, flowSteps]) => ({ flow, flowSteps, window: FLOW_WINDOW_MS[flow] }))
    .filter(({ flowSteps }) => flowSteps.some(step => step.at <= now));
}

/** Decide o e-mail de uma pessoa nesta rodada (ou nenhum). */
export function decide(row: CandidateRow, history: HistoryRow[], now: Date, mode: LifecycleMode): LifecycleDecision | null {
  if (!withinSendingHours(now, row.timezone)) return null;
  // Todo e-mail enviado conta no limite: fluxos, alertas de preço, garantias e campanhas.
  const sentAt = history.filter(entry => entry.status === 'sent' && entry.sent_at).map(entry => entry.sent_at!);
  if (!frequencyAllows(sentAt, now.getTime())) return null;
  for (const { flow, flowSteps, window } of flowCandidates(row, now.getTime())) {
    // Em simulação, a simulação anterior conta como enviada (senão a mesma linha se repetiria a cada rodada).
    const done = new Set(history
      .filter(entry => entry.flow_key === flow && (entry.status !== 'simulated' || mode === 'simulate'))
      .map(entry => entry.step));
    const step = dueStep(flowSteps, now.getTime(), done, window);
    if (step) return { userId: row.id, flow, step, enxovalId: row.enxoval_id, holdout: inHoldout(row.id, flow) };
  }
  return null;
}

async function candidates() {
  const result = await getPool().query<CandidateRow>(`
    SELECT u.id, u.email, u.name, u.timezone, u.created_at, u.marketing_preferences, u.preferences_token,
      GREATEST(u.last_login_at, (SELECT max(s.last_activity_at) FROM sessions s WHERE s.user_id = u.id)) AS last_activity_at,
      e.id AS enxoval_id, e.created_at AS enxoval_created_at, e.move_date::text AS move_date, e.spending_tier,
      EXISTS (SELECT 1 FROM items i WHERE i.enxoval_id = e.id AND i.status IN ('bought', 'received')) AS has_value,
      (SELECT count(*)::int FROM items i WHERE i.enxoval_id = e.id) AS total_count,
      (SELECT count(*)::int FROM items i WHERE i.enxoval_id = e.id AND i.status <> 'researching') AS done_count,
      (
        SELECT json_agg(json_build_object('id', inv.id, 'email', inv.email, 'created_at', inv.created_at))
        FROM enxoval_invitations inv
        WHERE inv.invited_by = u.id AND inv.expires_at > now()
          AND inv.created_at <= now() - interval '3 days' AND inv.created_at > now() - interval '8 days'
      ) AS invites,
      (
        SELECT json_agg(json_build_object('id', r.id, 'name', r.name, 'total', r.total, 'done', r.done, 'last_done_at', r.last_done_at))
        FROM (
          SELECT c.id, c.name, count(*)::int AS total,
            (count(*) FILTER (WHERE i.status <> 'researching'))::int AS done,
            max(i.updated_at) FILTER (WHERE i.status <> 'researching') AS last_done_at
          FROM categories c INNER JOIN items i ON i.category_id = c.id
          WHERE c.enxoval_id = e.id
          GROUP BY c.id, c.name
        ) r
      ) AS rooms
    FROM users u
    LEFT JOIN LATERAL (
      SELECT id, created_at, move_date, spending_tier FROM enxovais WHERE owner_id = u.id ORDER BY created_at, id LIMIT 1
    ) e ON true
    WHERE u.marketing_consent_at IS NOT NULL
      AND u.marketing_unsubscribed_at IS NULL
      AND (u.marketing_paused_until IS NULL OR u.marketing_paused_until < now())
      AND u.is_active AND NOT u.is_guest AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE es.email = lower(u.email))
  `);
  return result.rows;
}

interface PlanItemRow {
  id: string;
  enxoval_id: string;
  name: string;
  category: string;
  status: ItemStatus;
  price_cents: number | null;
  discount_cents: number | null;
  buy_week: number | null;
  price_category: number | null;
  priority: ItemPriority | null;
  timing: ItemTiming | null;
  catalog_item_id: string | null;
  catalog_price_category: number | null;
  catalog_priority: ItemPriority | null;
  catalog_timing: ItemTiming | null;
  catalog_lead_time_weeks: number | null;
}

const priceCategory = (value: unknown) => (isPriceCategory(Number(value)) ? (Number(value) as PriceCategory) : null);

/** Atrasos de cada enxoval com data de mudança, com a mesma regra do planejamento na tela. */
export async function loadOverdue(rows: CandidateRow[], now = new Date()) {
  const withDate = rows.filter(row => row.enxoval_id && row.move_date);
  if (!withDate.length) return;
  const result = await getPool().query<PlanItemRow>(`
    SELECT i.id, i.enxoval_id, i.name, c.name AS category, i.status, i.price_cents, i.discount_cents, i.buy_week,
      i.price_category, i.priority, i.timing, i.catalog_item_id,
      ci.price_category AS catalog_price_category, ci.priority AS catalog_priority, ci.timing AS catalog_timing,
      ci.lead_time_weeks AS catalog_lead_time_weeks
    FROM items i
    INNER JOIN categories c ON c.id = i.category_id
    LEFT JOIN catalog_items ci ON ci.id = i.catalog_item_id
    WHERE i.enxoval_id = ANY($1::uuid[])
  `, [withDate.map(row => row.enxoval_id)]);
  const byEnxoval = new Map<string, PlannableItem[]>();
  for (const item of result.rows) {
    const list = byEnxoval.get(item.enxoval_id) ?? [];
    list.push({
      id: item.id, name: item.name, category: item.category, status: item.status,
      priceCents: item.price_cents === null ? null : Number(item.price_cents), discountCents: Number(item.discount_cents ?? 0),
      buyWeek: item.buy_week === null ? null : Number(item.buy_week), priceCategory: priceCategory(item.price_category),
      priority: item.priority, timing: item.timing,
      catalog: item.catalog_item_id
        ? { priceCategory: priceCategory(item.catalog_price_category), priority: item.catalog_priority, timing: item.catalog_timing,
            leadTimeWeeks: Number(item.catalog_lead_time_weeks ?? 0), priceRange: null }
        : null,
    });
    byEnxoval.set(item.enxoval_id, list);
  }
  for (const row of withDate) {
    const plan = buildPurchasePlan(byEnxoval.get(row.enxoval_id!) ?? [], {
      tier: isSpendingTier(row.spending_tier) ? row.spending_tier : 'equilibrado', moveDate: row.move_date, now,
    });
    const overdue = [...plan.byId.values()].filter(entry => entry.overdue);
    row.overdue_count = overdue.length;
    row.overdue_items = overdue.slice(0, 5).map(entry => entry.item.name.slice(0, 80));
  }
}

async function historyFor(userIds: string[]) {
  if (!userIds.length) return new Map<string, HistoryRow[]>();
  const result = await getPool().query<HistoryRow>(`
    SELECT user_id, flow_key, step, status, sent_at FROM lifecycle_messages WHERE user_id = ANY($1::uuid[])
  `, [userIds]);
  const byUser = new Map<string, HistoryRow[]>();
  for (const row of result.rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  return byUser;
}

/** Token de /preferencias, criado na primeira mensagem. */
export async function ensurePreferencesToken(userId: string) {
  const result = await getPool().query<{ preferences_token: string }>(`
    UPDATE users SET preferences_token = COALESCE(preferences_token, $2) WHERE id = $1 RETURNING preferences_token
  `, [userId, randomBytes(24).toString('base64url')]);
  return result.rows[0].preferences_token;
}

async function topItems(enxovalId: string | null) {
  if (!enxovalId) return [];
  // Os primeiros itens a comprar: essenciais e mais urgentes primeiro.
  const result = await getPool().query<{ name: string }>(`
    SELECT name FROM items WHERE enxoval_id = $1 AND status = 'researching'
    ORDER BY (priority = 'essential') DESC NULLS LAST, ai_urgency DESC NULLS LAST, (timing = 'first_night') DESC NULLS LAST, sort_order, created_at
    LIMIT 3
  `, [enxovalId]);
  return result.rows.map(row => row.name.slice(0, 80));
}

async function record(decision: LifecycleDecision, status: 'pending' | 'holdout' | 'simulated') {
  const result = await getPool().query<{ id: string }>(`
    INSERT INTO lifecycle_messages (id, user_id, enxoval_id, flow_key, step, template_version, holdout, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [randomUUID(), decision.userId, decision.enxovalId, decision.flow, decision.step.key, TEMPLATE_VERSION, decision.holdout, status]);
  return result.rows[0]?.id ?? null;
}

/** O que o e-mail de cada fluxo precisa além do estado comum: o marco alcançado ou o convite parado. */
function stepDetails(row: CandidateRow, decision: LifecycleDecision) {
  const [kind, ref] = decision.step.key.split(':');
  if (decision.flow === 'milestone') {
    const label = kind === 'overall80' ? null : row.rooms?.find(room => room.id === ref)?.name.slice(0, 60) ?? null;
    return { milestone: { kind: kind as MilestoneKind, label } };
  }
  if (decision.flow === 'invite_stalled') return { inviteEmail: row.invites?.find(invite => invite.id === ref)?.email };
  return {};
}

export interface LifecycleOptions {
  now?: Date;
  mode?: LifecycleMode;
  send?: (message: MailMessage) => Promise<{ providerMessageId: string | null } | undefined>;
}

/** Uma rodada do motor. Também roda sob demanda: npm run lifecycle */
export async function runLifecycle(options: LifecycleOptions = {}): Promise<LifecycleSummary> {
  const mode = options.mode ?? lifecycleMode();
  const now = options.now ?? new Date();
  const summary: LifecycleSummary = { mode, skipped: false, considered: 0, sent: 0, simulated: 0, holdout: 0, failed: 0 };
  const baseUrl = appBaseUrl();
  if (mode === 'off' || !baseUrl || (mode === 'send' && !canDeliverMail())) return { ...summary, skipped: true };

  const lock = await getPool().connect();
  try {
    const locked = await lock.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_KEY]);
    if (!locked.rows[0]?.locked) return { ...summary, skipped: true };
    try {
      const rows = await candidates();
      await loadOverdue(rows, now);
      const history = await historyFor(rows.map(row => row.id));
      summary.considered = rows.length;
      for (const row of rows) {
        const decision = decide(row, history.get(row.id) ?? [], now, mode);
        if (!decision) continue;
        const stepKey = decision.step.key.split(':')[0];
        const event = { flow_key: decision.flow, step: stepKey, template_version: TEMPLATE_VERSION, locale: 'pt-BR', holdout: decision.holdout };
        if (mode === 'simulate') {
          if (await record(decision, 'simulated')) summary.simulated += 1;
          getLogger().info({ event: 'lifecycle.simulated', userId: row.id, ...event }, 'Ciclo de vida (simulação).');
          continue;
        }
        if (decision.holdout) {
          if (await record(decision, 'holdout')) {
            summary.holdout += 1;
            captureServerEvent(row.id, 'lifecycle_email_sent', event);
          }
          continue;
        }
        const messageId = await record(decision, 'pending');
        if (!messageId) continue;
        try {
          const token = row.preferences_token ?? await ensurePreferencesToken(row.id);
          const message = lifecycleEmail({
            to: row.email, name: row.name, flow: decision.flow, step: stepKey, baseUrl, preferencesToken: token, messageId,
            totalCount: row.total_count ?? 0, doneCount: row.done_count ?? 0,
            pendingCount: Math.max(0, (row.total_count ?? 0) - (row.done_count ?? 0)),
            topItems: await topItems(decision.enxovalId),
            overdueCount: row.overdue_count, overdueItems: row.overdue_items,
            ...stepDetails(row, decision),
          });
          const delivery = await (options.send ?? sendMail)(message);
          await getPool().query(
            "UPDATE lifecycle_messages SET status = 'sent', sent_at = now(), provider_message_id = $2 WHERE id = $1",
            [messageId, delivery?.providerMessageId ?? null]);
          summary.sent += 1;
          captureServerEvent(row.id, 'lifecycle_email_sent', event);
        } catch (err) {
          // Não tenta de novo sozinho: melhor perder um lembrete do que repetir e-mail.
          await getPool().query("UPDATE lifecycle_messages SET status = 'failed', suppressed_reason = 'send_failed' WHERE id = $1", [messageId]);
          summary.failed += 1;
          getLogger().error({ event: 'lifecycle.send_failed', userId: row.id, flow: decision.flow, err }, 'Falha ao enviar e-mail de ciclo de vida.');
        }
      }
      return summary;
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    lock.release();
  }
}
