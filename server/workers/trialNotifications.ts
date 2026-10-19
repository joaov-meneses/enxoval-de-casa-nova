import { getPool, withTransaction } from '../database.ts';
import { logger } from '../logger.ts';
import { canDeliverMail, sendMail, trialEmail } from '../mailer.ts';

/** Durable deduplication and row locks also coordinate multiple server instances. */
export async function sendTrialNotifications() {
  if (!canDeliverMail()) return;
  const due = await getPool().query<{ id: string }>(`
    SELECT id FROM users WHERE subscription_status = 'trialing'
    AND NOT subscription_cancel_at_period_end AND trial_ends_at > now()
    AND (NOT EXISTS (SELECT 1 FROM billing_mail m WHERE m.subscription_id = users.stripe_subscription_id AND m.kind = 'started')
      OR (trial_ends_at <= now() + interval '24 hours' AND NOT EXISTS
        (SELECT 1 FROM billing_mail m WHERE m.subscription_id = users.stripe_subscription_id AND m.kind = 'ending')))
  `);
  for (const { id } of due.rows) {
    try {
      await withTransaction(async client => {
        const result = await client.query<{email: string; stripe_subscription_id: string; trial_ends_at: Date}>(`
          SELECT email, stripe_subscription_id, trial_ends_at FROM users
          WHERE id = $1 AND subscription_status = 'trialing' AND NOT subscription_cancel_at_period_end
          AND trial_ends_at > now() FOR UPDATE SKIP LOCKED`, [id]);
        const user = result.rows[0];
        if (!user) return;
        const kinds = ['started', ...(user.trial_ends_at.getTime() - Date.now() <= 86400000 ? ['ending'] : [])];
        for (const kind of kinds) {
          const fresh = await client.query('INSERT INTO billing_mail (subscription_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.stripe_subscription_id, kind]);
          if (fresh.rowCount) await sendMail(trialEmail({ to: user.email, endsAt: user.trial_ends_at, reminder: kind === 'ending' }));
        }
      });
    } catch (err) { logger.error({ event: 'trial.notification.failed', err }, 'Falha no aviso do trial; nova tentativa na próxima rodada.'); }
  }
}

export function startTrialNotifications() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await sendTrialNotifications(); }
    catch (err) { logger.error({ event: 'trial.worker.failed', err }, 'Falha na rotina de avisos do trial.'); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), 60000);
  timer.unref();
  return timer;
}
