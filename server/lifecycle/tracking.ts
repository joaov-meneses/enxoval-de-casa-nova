// Retorno dos e-mails: webhooks do Resend (entregue, clicou, rejeitou, reclamou) e a volta ao app pelo link do
// e-mail. Tudo cai em lifecycle_events, ligado à mensagem enviada, e vai ao PostHog só com o UUID da conta.
// Rejeição definitiva e reclamação de spam suprimem o endereço para qualquer e-mail de relacionamento.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type Express } from 'express';
import { getPool } from '../database.ts';
import { getLogger } from '../logger.ts';
import { captureServerEvent, type ServerEvent } from '../productAnalytics.ts';
import { rateLimit } from '../security.ts';

const TOLERANCE_SECONDS = 5 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TrackedEvent = 'delivered' | 'clicked' | 'bounced' | 'complained' | 'returned';

const RESEND_TYPES: Record<string, Exclude<TrackedEvent, 'returned'>> = {
  'email.delivered': 'delivered',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

/**
 * Assinatura dos webhooks do Resend (padrão Svix): HMAC-SHA256 de `id.timestamp.corpo` com o segredo `whsec_...`,
 * em base64. O cabeçalho pode trazer várias assinaturas (`v1,<sig> v1,<sig>`) durante a troca do segredo.
 */
export function verifyWebhookSignature(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  body: string,
  nowMs = Date.now(),
) {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(nowMs / 1000 - seconds) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = Buffer.from(createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64'));
  return signature.split(' ').some(part => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

function recipients(data: Record<string, unknown>) {
  const to = data.to;
  const list = Array.isArray(to) ? to : typeof to === 'string' ? [to] : [];
  return list.filter((email): email is string => typeof email === 'string' && email.includes('@')).map(email => email.trim().toLowerCase());
}

/** Rejeição definitiva: o Resend marca como `Permanent` (as temporárias são `Transient`). */
export function isPermanentBounce(data: Record<string, unknown>) {
  const bounce = data.bounce as { type?: unknown } | undefined;
  return typeof bounce?.type === 'string' && /^(permanent|hard)$/i.test(bounce.type);
}

async function suppress(emails: string[], reason: string) {
  for (const email of emails) {
    await getPool().query('INSERT INTO email_suppressions (email, reason) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [email, reason]);
  }
}

/** Grava o evento uma vez (o id do evento deduplica reenvios) e repassa ao PostHog. */
async function recordEvent(message: { id: string; user_id: string; flow_key: string; step: string }, type: TrackedEvent, eventId: string, occurredAt: Date) {
  const inserted = await getPool().query(`
    INSERT INTO lifecycle_events (id, message_id, type, occurred_at, provider_event_id) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT DO NOTHING
  `, [randomUUID(), message.id, type, occurredAt, eventId]);
  if (!inserted.rowCount) return false;
  // Alertas e garantias têm um passo aleatório por envio; no PostHog o que interessa é o fluxo.
  const step = ['price_drop', 'warranty'].includes(message.flow_key) ? 'alert' : message.step.split(':')[0];
  captureServerEvent(message.user_id, `lifecycle_email_${type}` as ServerEvent, { flow_key: message.flow_key, step });
  return true;
}

export async function handleResendEvent(event: { type?: unknown; created_at?: unknown; data?: unknown }, eventId: string) {
  const type = typeof event.type === 'string' ? RESEND_TYPES[event.type] : undefined;
  const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
  if (!type) return { handled: false };
  if (type === 'complained') await suppress(recipients(data), 'complaint');
  if (type === 'bounced' && isPermanentBounce(data)) await suppress(recipients(data), 'bounce');
  const emailId = typeof data.email_id === 'string' ? data.email_id : null;
  if (!emailId) return { handled: true, recorded: false };
  const message = (await getPool().query<{ id: string; user_id: string; flow_key: string; step: string }>(
    'SELECT id, user_id, flow_key, step FROM lifecycle_messages WHERE provider_message_id = $1 LIMIT 1', [emailId])).rows[0];
  if (!message) return { handled: true, recorded: false };
  const created = typeof event.created_at === 'string' ? new Date(event.created_at) : new Date();
  const recorded = await recordEvent(message, type, eventId, Number.isNaN(created.getTime()) ? new Date() : created);
  return { handled: true, recorded };
}

/** A pessoa voltou ao app pelo link de um e-mail. Só conta para a dona da mensagem e só uma vez por mensagem. */
export async function recordReturn(userId: string, messageId: unknown) {
  if (typeof messageId !== 'string' || !UUID.test(messageId)) return false;
  const message = (await getPool().query<{ id: string; user_id: string; flow_key: string; step: string }>(
    'SELECT id, user_id, flow_key, step FROM lifecycle_messages WHERE id = $1 AND user_id = $2', [messageId, userId])).rows[0];
  if (!message) return false;
  await recordEvent(message, 'returned', `returned:${message.id}`, new Date());
  return true;
}

/**
 * Webhook do Resend. Precisa do corpo cru para conferir a assinatura, então é registrado antes do `express.json()`.
 * Sem RESEND_WEBHOOK_SECRET a rota não existe (404), para ninguém alimentar o painel com eventos falsos.
 */
export function registerResendWebhook(app: Express) {
  app.post('/api/webhooks/resend', rateLimit(600, 60_000), express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) {
      res.status(404).end();
      return;
    }
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const headers = { id: req.get('svix-id'), timestamp: req.get('svix-timestamp'), signature: req.get('svix-signature') };
    if (!verifyWebhookSignature(secret, headers, body)) {
      getLogger().warn({ event: 'resend.webhook.signature_failed' }, 'Resend webhook signature validation failed.');
      res.status(400).json({ error: 'Assinatura inválida.' });
      return;
    }
    try {
      const result = await handleResendEvent(JSON.parse(body), headers.id!);
      res.json({ ok: true, ...result });
    } catch (err) {
      // 500 faz o provedor tentar de novo; o id do evento evita gravar em dobro.
      getLogger().error({ event: 'resend.webhook.failed', err }, 'Resend webhook processing failed.');
      res.status(500).json({ error: 'Falha ao processar o evento.' });
    }
  });
}
