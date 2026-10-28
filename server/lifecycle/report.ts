// Painel de ciclo de vida do /admin: por fluxo, envios, retorno do provedor, volta ao app e o efeito incremental
// (quem recebeu e usou o app nos 7 dias seguintes contra o grupo de controle, que era elegível e não recebeu).
import { getPool } from '../database.ts';

export interface FlowReport {
  flow: string;
  sent: number;
  holdout: number;
  simulated: number;
  failed: number;
  delivered: number;
  clicked: number;
  returned: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  sentActive7d: number;
  holdoutActive7d: number;
}

/** Diferença, em pontos percentuais, entre a taxa de uso em 7 dias de quem recebeu e a do grupo de controle. */
export function incrementalLift(report: Pick<FlowReport, 'sent' | 'holdout' | 'sentActive7d' | 'holdoutActive7d'>) {
  if (!report.sent || !report.holdout) return null;
  return Math.round((report.sentActive7d / report.sent - report.holdoutActive7d / report.holdout) * 1000) / 10;
}

/** NPS: % de promotores (9 e 10) menos % de detratores (0 a 6). */
export function netPromoterScore(scores: number[]) {
  if (!scores.length) return null;
  const promoters = scores.filter(score => score >= 9).length;
  const detractors = scores.filter(score => score <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

export async function lifecycleReport(days = 90) {
  const flows = await getPool().query<Record<string, string | number>>(`
    WITH msgs AS (
      SELECT m.id, m.user_id, m.flow_key, m.status, COALESCE(m.sent_at, m.created_at) AS at
      FROM lifecycle_messages m
      WHERE m.created_at > now() - make_interval(days => $1::int)
    ),
    marked AS (
      SELECT msgs.*,
        EXISTS (SELECT 1 FROM user_activity_days d WHERE d.user_id = msgs.user_id
          AND d.day BETWEEN (msgs.at AT TIME ZONE 'America/Sao_Paulo')::date + 1 AND (msgs.at AT TIME ZONE 'America/Sao_Paulo')::date + 7) AS active7,
        (SELECT array_agg(DISTINCT ev.type) FROM lifecycle_events ev WHERE ev.message_id = msgs.id) AS events
      FROM msgs
    )
    SELECT flow_key AS flow,
      count(*) FILTER (WHERE status = 'sent')::int AS sent,
      count(*) FILTER (WHERE status = 'holdout')::int AS holdout,
      count(*) FILTER (WHERE status = 'simulated')::int AS simulated,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      count(*) FILTER (WHERE 'delivered' = ANY(events))::int AS delivered,
      count(*) FILTER (WHERE 'clicked' = ANY(events))::int AS clicked,
      count(*) FILTER (WHERE 'returned' = ANY(events))::int AS returned,
      count(*) FILTER (WHERE 'bounced' = ANY(events))::int AS bounced,
      count(*) FILTER (WHERE 'complained' = ANY(events))::int AS complained,
      count(*) FILTER (WHERE 'unsubscribed' = ANY(events))::int AS unsubscribed,
      count(*) FILTER (WHERE status = 'sent' AND active7)::int AS "sentActive7d",
      count(*) FILTER (WHERE status = 'holdout' AND active7)::int AS "holdoutActive7d"
    FROM marked
    GROUP BY flow_key
    ORDER BY flow_key
  `, [days]);
  const surveys = await getPool().query<{ score: number }>("SELECT score FROM survey_responses WHERE survey = 'post_move'");
  const scores = surveys.rows.map(row => Number(row.score));
  const suppressions = await getPool().query<{ reason: string; count: number }>(
    'SELECT reason, count(*)::int AS count FROM email_suppressions GROUP BY reason ORDER BY reason');
  return {
    days,
    flows: (flows.rows as unknown as FlowReport[]).map(row => ({ ...row, liftPoints: incrementalLift(row) })),
    survey: { responses: scores.length, nps: netPromoterScore(scores) },
    suppressions: suppressions.rows,
  };
}

export async function listCampaigns() {
  const result = await getPool().query(`
    SELECT c.id, c.name, c.segment, c.subject, c.status, c.audience_count AS "audienceCount", c.created_at AS "createdAt",
      count(m.*) FILTER (WHERE m.status = 'sent')::int AS sent,
      count(m.*) FILTER (WHERE m.status = 'holdout')::int AS holdout,
      count(m.*) FILTER (WHERE m.status = 'simulated')::int AS simulated,
      count(DISTINCT ev.message_id) FILTER (WHERE ev.type = 'clicked')::int AS clicked,
      count(DISTINCT ev.message_id) FILTER (WHERE ev.type = 'returned')::int AS returned,
      count(DISTINCT ev.message_id) FILTER (WHERE ev.type = 'unsubscribed')::int AS unsubscribed
    FROM marketing_campaigns c
    LEFT JOIN lifecycle_messages m ON m.flow_key = 'campaign' AND m.step = c.id::text
    LEFT JOIN lifecycle_events ev ON ev.message_id = m.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 50
  `);
  return result.rows;
}
