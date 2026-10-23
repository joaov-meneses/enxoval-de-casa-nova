// Campanhas pontuais da equipe (/admin): um segmento salvo, um texto e um botão para uma página do app. O público
// sai do Postgres com as mesmas regras dos fluxos (consentimento, descadastro, pausa, supressão, e-mail confirmado)
// e cada envio respeita o limite de frequência. 10% do segmento fica de fora (grupo de controle) para medir efeito.
import { randomUUID } from 'node:crypto';
import { getPool } from '../database.ts';
import { getLogger } from '../logger.ts';
import { appBaseUrl, canDeliverMail, sendMail, type MailMessage } from '../mailer.ts';
import { HttpError } from '../security.ts';
import { lifecycleEmail, type CustomContent } from './emails.ts';
import { ensurePreferencesToken } from './engine.ts';
import { frequencyAllows, inHoldout, lifecycleMode, TEMPLATE_VERSION } from './policy.ts';

/** Segmentos da seção 8 do plano de analytics que dá para disparar só com o Postgres. */
export const SEGMENTS = {
  all: { label: 'Todos com consentimento', sql: 'true' },
  no_enxoval: {
    label: 'S1 · Conta sem enxoval há mais de 1 hora',
    sql: "e.id IS NULL AND u.created_at < now() - interval '1 hour'",
  },
  no_value: {
    label: 'S2 · Enxoval sem item conquistado há mais de 2 dias',
    sql: "e.id IS NOT NULL AND e.created_at < now() - interval '2 days' AND NOT EXISTS (SELECT 1 FROM items i WHERE i.enxoval_id = e.id AND i.status <> 'researching')",
  },
  inactive_14: { label: 'S5 · Sem usar o app há 14 dias', sql: inactiveSql(14) },
  inactive_30: { label: 'S5 · Sem usar o app há 30 dias', sql: inactiveSql(30) },
  inactive_60: { label: 'S5 · Sem usar o app há 60 dias', sql: inactiveSql(60) },
  almost_done: {
    label: 'S6 · Enxoval com 80% ou mais conquistado',
    sql: `e.id IS NOT NULL AND (SELECT count(*) FILTER (WHERE i.status <> 'researching') * 5 >= count(*) * 4 AND count(*) > 0
      FROM items i WHERE i.enxoval_id = e.id)`,
  },
  post_move: { label: 'S8 · Mudança há 30 dias ou mais', sql: "e.move_date IS NOT NULL AND e.move_date <= current_date - 30" },
  paid: { label: 'S9 · Veio de anúncio', sql: "u.acq_channel_group IN ('paid_search', 'paid_social')" },
  organic: { label: 'S9 · Veio de busca, redes ou indicação', sql: "u.acq_channel_group IN ('organic_search', 'organic_social', 'referral', 'direct', 'email')" },
  premium: {
    label: 'S10 · Potencial premium (perfil premium ou orçamento alto)',
    sql: "(e.spending_tier = 'premium' OR e.onboarding_profile->>'budget' = 'gt50')",
  },
} as const satisfies Record<string, { label: string; sql: string }>;

export type SegmentKey = keyof typeof SEGMENTS;

function inactiveSql(days: number) {
  return `NOT EXISTS (SELECT 1 FROM user_activity_days d WHERE d.user_id = u.id AND d.day > current_date - ${days})
    AND COALESCE(u.last_login_at, u.created_at) < now() - interval '${days} days'`;
}

export function isSegment(value: unknown): value is SegmentKey {
  return typeof value === 'string' && Object.hasOwn(SEGMENTS, value);
}

/** Mesmas regras de elegibilidade do motor de ciclo de vida. */
const ELIGIBLE = `
  u.marketing_consent_at IS NOT NULL AND u.marketing_unsubscribed_at IS NULL
  AND (u.marketing_paused_until IS NULL OR u.marketing_paused_until < now())
  AND u.is_active AND NOT u.is_guest AND u.email_verified_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE es.email = lower(u.email))`;

interface AudienceRow { id: string; email: string; name: string; preferences_token: string | null; sent: Date[] | null }

async function audience(segment: SegmentKey) {
  const result = await getPool().query<AudienceRow>(`
    SELECT u.id, u.email, u.name, u.preferences_token,
      (SELECT array_agg(m.sent_at) FROM lifecycle_messages m
       WHERE m.user_id = u.id AND m.status = 'sent' AND m.sent_at > now() - interval '7 days') AS sent
    FROM users u
    LEFT JOIN LATERAL (
      SELECT id, created_at, move_date, spending_tier, onboarding_profile FROM enxovais WHERE owner_id = u.id
      ORDER BY created_at, id LIMIT 1
    ) e ON true
    WHERE ${ELIGIBLE} AND (${SEGMENTS[segment].sql})
  `);
  return result.rows;
}

/** Público estimado: elegíveis, quantos ficam no grupo de controle e quantos esperariam pelo limite de frequência. */
export async function estimateAudience(segment: SegmentKey, campaignKey = 'estimate', now = Date.now()) {
  const rows = await audience(segment);
  const holdout = rows.filter(row => inHoldout(row.id, `campaign:${campaignKey}`)).length;
  const limited = rows.filter(row => !frequencyAllows((row.sent ?? []).map(date => new Date(date)), now)).length;
  return { eligible: rows.length, holdout, limited };
}

export interface CampaignInput { name: string; segment: SegmentKey; subject: string; body: string; ctaLabel: string; ctaPath: string }

/** Valida o formulário do /admin. O destino é sempre uma página do próprio app (nunca um link externo). */
export function parseCampaign(body: Record<string, unknown> | undefined): CampaignInput {
  const text = (key: string, max: number, label: string) => {
    const value = typeof body?.[key] === 'string' ? (body[key] as string).trim() : '';
    if (!value) throw new HttpError(400, `Preencha ${label}.`);
    if (value.length > max) throw new HttpError(400, `${label[0].toUpperCase()}${label.slice(1)} pode ter até ${max} caracteres.`);
    return value;
  };
  const segment = body?.segment;
  if (!isSegment(segment)) throw new HttpError(400, 'Escolha um segmento.');
  const ctaPath = text('ctaPath', 120, 'a página do botão');
  if (!/^\/[a-z0-9\-/]*$/.test(ctaPath) || ctaPath.startsWith('//')) {
    throw new HttpError(400, 'A página do botão deve ser um caminho do app, como /app ou /app/plano.');
  }
  return {
    name: text('name', 80, 'o nome da campanha'),
    segment,
    subject: text('subject', 120, 'o assunto'),
    body: text('body', 3000, 'o texto'),
    ctaLabel: text('ctaLabel', 40, 'o texto do botão'),
    ctaPath,
  };
}

function custom(input: CampaignInput): CustomContent {
  return { subject: input.subject, body: input.body, cta: input.ctaLabel, path: input.ctaPath };
}

function requireBaseUrl() {
  const baseUrl = appBaseUrl();
  if (!baseUrl || !canDeliverMail()) throw new HttpError(503, 'Configure APP_URL e o envio de e-mail para disparar campanhas.');
  return baseUrl;
}

/** Envio de teste para a equipe: o mesmo e-mail, sem registrar nem contar no limite. */
export async function sendCampaignTest(input: CampaignInput, to: string, send: (message: MailMessage) => Promise<unknown> = sendMail) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'Informe um e-mail válido para o teste.');
  const baseUrl = requireBaseUrl();
  await send(lifecycleEmail({
    to, name: 'Equipe', flow: 'campaign', step: 'teste', baseUrl, preferencesToken: 'teste-sem-token-valido', custom: custom(input),
  }));
}

export interface CampaignSummary { id: string; audience: number; sent: number; holdout: number; deferred: number; simulated: number; failed: number }

/**
 * Cria e dispara a campanha. Respeita LIFECYCLE_MODE: `off` recusa, `simulate` só registra quem receberia. Quem já
 * recebeu e-mail hoje (ou dois na semana) fica de fora desta campanha: campanha é pontual, não espera.
 */
export async function sendCampaign(input: CampaignInput, options: { now?: Date; send?: (message: MailMessage) => Promise<{ providerMessageId: string | null } | undefined> } = {}) {
  const mode = lifecycleMode();
  if (mode === 'off') throw new HttpError(409, 'Os e-mails de relacionamento estão desligados (LIFECYCLE_MODE=off).');
  const baseUrl = mode === 'send' ? requireBaseUrl() : appBaseUrl() ?? '';
  const now = options.now ?? new Date();
  const id = randomUUID();
  const rows = await audience(input.segment);
  await getPool().query(`
    INSERT INTO marketing_campaigns (id, name, segment, subject, body, cta_label, cta_path, audience_count)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [id, input.name, input.segment, input.subject, input.body, input.ctaLabel, input.ctaPath, rows.length]);
  const summary: CampaignSummary = { id, audience: rows.length, sent: 0, holdout: 0, deferred: 0, simulated: 0, failed: 0 };
  const insert = (userId: string, status: string, holdout: boolean) => getPool().query<{ id: string }>(`
    INSERT INTO lifecycle_messages (id, user_id, flow_key, step, template_version, holdout, status)
    VALUES ($1, $2, 'campaign', $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id
  `, [randomUUID(), userId, id, TEMPLATE_VERSION, holdout, status]);
  try {
    for (const row of rows) {
      if (!frequencyAllows((row.sent ?? []).map(date => new Date(date)), now.getTime())) { summary.deferred += 1; continue; }
      const holdout = inHoldout(row.id, `campaign:${id}`);
      if (mode === 'simulate') { await insert(row.id, 'simulated', holdout); summary.simulated += 1; continue; }
      if (holdout) { await insert(row.id, 'holdout', true); summary.holdout += 1; continue; }
      const messageId = (await insert(row.id, 'pending', false)).rows[0]?.id;
      if (!messageId) continue;
      try {
        const token = row.preferences_token ?? await ensurePreferencesToken(row.id);
        const delivery = await (options.send ?? sendMail)(lifecycleEmail({
          to: row.email, name: row.name, flow: 'campaign', step: id.slice(0, 8), baseUrl, preferencesToken: token, messageId,
          custom: custom(input),
        }));
        await getPool().query("UPDATE lifecycle_messages SET status = 'sent', sent_at = now(), provider_message_id = $2 WHERE id = $1",
          [messageId, delivery?.providerMessageId ?? null]);
        summary.sent += 1;
      } catch (err) {
        await getPool().query("UPDATE lifecycle_messages SET status = 'failed', suppressed_reason = 'send_failed' WHERE id = $1", [messageId]);
        summary.failed += 1;
        getLogger().error({ event: 'campaign.send_failed', campaignId: id, userId: row.id, err }, 'Falha ao enviar e-mail de campanha.');
      }
    }
    await getPool().query("UPDATE marketing_campaigns SET status = 'sent', finished_at = now() WHERE id = $1", [id]);
  } catch (err) {
    await getPool().query("UPDATE marketing_campaigns SET status = 'failed', finished_at = now() WHERE id = $1", [id]);
    throw err;
  }
  return summary;
}
