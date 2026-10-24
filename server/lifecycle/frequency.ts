// Limite de frequência comum a todo e-mail de relacionamento: os fluxos do motor, o alerta de queda de preço, o
// lembrete de garantia e as campanhas da equipe. Quem já recebeu e-mail hoje (ou dois na semana) espera a próxima
// rodada; o envio fica registrado em lifecycle_messages para contar no limite e aparecer no painel de cada fluxo.
import { randomUUID } from 'node:crypto';
import { getPool } from '../database.ts';
import { frequencyAllows, TEMPLATE_VERSION, type MessageKind } from './policy.ts';

/** Contas ligadas aos endereços (minúsculos), com os envios dos últimos 7 dias. */
async function recentSends(emails: string[]) {
  const result = await getPool().query<{ email: string; user_id: string; sent: Date[] | null }>(`
    SELECT lower(u.email) AS email, u.id AS user_id,
      (SELECT array_agg(m.sent_at) FROM lifecycle_messages m
       WHERE m.user_id = u.id AND m.status = 'sent' AND m.sent_at > now() - interval '7 days') AS sent
    FROM users u WHERE lower(u.email) = ANY($1::text[])
  `, [emails.map(email => email.toLowerCase())]);
  return new Map(result.rows.map(row => [row.email, { userId: row.user_id, sent: row.sent ?? [] }]));
}

/**
 * Separa os endereços que podem receber agora dos que ficam para depois. Endereço sem conta (não deveria existir
 * para alertas e garantias) não tem histórico e passa.
 */
export async function frequencyGate(emails: string[], now = Date.now()) {
  const sends = await recentSends(emails);
  const allowed = new Map<string, string | null>();
  const deferred: string[] = [];
  for (const email of emails) {
    const entry = sends.get(email.toLowerCase());
    if (entry && !frequencyAllows(entry.sent.map(date => new Date(date)), now)) deferred.push(email);
    else allowed.set(email, entry?.userId ?? null);
  }
  return { allowed, deferred };
}

/** Registra um e-mail enviado fora do motor, para contar no limite e receber o retorno do provedor. */
export async function recordExternalSend(userId: string | null, kind: MessageKind, providerMessageId: string | null, step = randomUUID()) {
  if (!userId) return null;
  const result = await getPool().query<{ id: string }>(`
    INSERT INTO lifecycle_messages (id, user_id, flow_key, step, template_version, status, sent_at, provider_message_id)
    VALUES ($1, $2, $3, $4, $5, 'sent', now(), $6)
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [randomUUID(), userId, kind, step, TEMPLATE_VERSION, providerMessageId]);
  return result.rows[0]?.id ?? null;
}
