// Central de preferências (/preferencias) e descadastro com um clique. Funcionam sem login, pelo token do e-mail.
// Ficam fora do roteador /api comum: o descadastro com um clique é um POST vindo do provedor de e-mail (RFC 8058),
// sem a origem do app, então não pode passar pela proteção de origem das outras rotas.
import { randomUUID } from 'node:crypto';
import express, { type Express, type Request } from 'express';
import { getPool } from '../database.ts';
import { asyncHandler, HttpError, protectMutationOrigin, rateLimit } from '../security.ts';

const PAUSE_DAYS = 30;

interface PreferenceRow {
  id: string;
  email: string;
  marketing_consent_at: Date | null;
  marketing_unsubscribed_at: Date | null;
  marketing_paused_until: Date | null;
  marketing_preferences: Record<string, unknown> | null;
}

export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(local.length - 1, 6)))}@${domain}`;
}

function readToken(req: Request) {
  const token = typeof req.query.token === 'string' ? req.query.token : typeof req.body?.token === 'string' ? req.body.token : '';
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(404, 'Link de preferências inválido ou expirado.');
  return token;
}

async function findByToken(token: string) {
  const result = await getPool().query<PreferenceRow>(`
    SELECT id, email, marketing_consent_at, marketing_unsubscribed_at, marketing_paused_until, marketing_preferences
    FROM users WHERE preferences_token = $1
  `, [token]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'Link de preferências inválido ou expirado.');
  return row;
}

export function preferencesView(row: PreferenceRow) {
  const prefs = row.marketing_preferences ?? {};
  const paused = row.marketing_paused_until && row.marketing_paused_until.getTime() > Date.now();
  return {
    email: maskEmail(row.email),
    subscribed: Boolean(row.marketing_consent_at) && !row.marketing_unsubscribed_at,
    reminders: prefs.reminders !== false,
    tips: prefs.tips !== false,
    pausedUntil: paused ? row.marketing_paused_until!.toISOString() : null,
  };
}

async function unsubscribe(userId: string) {
  await getPool().query('UPDATE users SET marketing_unsubscribed_at = COALESCE(marketing_unsubscribed_at, now()) WHERE id = $1', [userId]);
  // Atribui o descadastro à última mensagem enviada, para o painel de cada fluxo.
  await getPool().query(`
    INSERT INTO lifecycle_events (id, message_id, type)
    SELECT $2, id, 'unsubscribed' FROM lifecycle_messages
    WHERE user_id = $1 AND status = 'sent' ORDER BY sent_at DESC LIMIT 1
  `, [userId, randomUUID()]);
}

export function registerPreferenceRoutes(app: Express) {
  const limit = rateLimit(60, 10 * 60_000);

  app.get('/api/preferences', limit, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(preferencesView(await findByToken(readToken(req))));
  }));

  app.post('/api/preferences', limit, protectMutationOrigin, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const row = await findByToken(readToken(req));
    const body = req.body ?? {};
    if (body.subscribed === false) {
      await unsubscribe(row.id);
    } else {
      const prefs = { ...(row.marketing_preferences ?? {}) };
      if (typeof body.reminders === 'boolean') prefs.reminders = body.reminders;
      if (typeof body.tips === 'boolean') prefs.tips = body.tips;
      await getPool().query(`
        UPDATE users SET marketing_preferences = $2::jsonb,
          marketing_unsubscribed_at = CASE WHEN $3 AND marketing_consent_at IS NOT NULL THEN NULL ELSE marketing_unsubscribed_at END,
          marketing_paused_until = CASE WHEN $4::text = 'pause' THEN now() + make_interval(days => $5::int)
                                        WHEN $4::text = 'resume' THEN NULL ELSE marketing_paused_until END
        WHERE id = $1
      `, [row.id, JSON.stringify(prefs), body.subscribed === true, body.pause === true ? 'pause' : body.pause === false ? 'resume' : '', PAUSE_DAYS]);
    }
    res.json(preferencesView(await findByToken(readToken(req))));
  }));

  // Descadastro com um clique (cabeçalho List-Unsubscribe-Post). Responde 200 mesmo para token desconhecido,
  // para o provedor não tentar de novo nem revelar quais tokens existem.
  app.post('/api/preferences/unsubscribe', limit, express.urlencoded({ extended: false, limit: '2kb' }), asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const row = await findByToken(readToken(req));
      await unsubscribe(row.id);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
    }
    res.type('text/plain').send('Pronto: você não recebe mais lembretes e dicas do Casa Mia.');
  }));
}
