// Fase 11.4: avisa 30 e 7 dias antes de a garantia de um item vencer, e esvazia a fila de arquivos a apagar do bucket.
// A tabela warranty_reminders evita repetir o mesmo aviso, inclusive com mais de uma instância do servidor.
import { getPool, withTransaction } from '../database.ts';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger.ts';
import { canDeliverMail, sendMail, warrantyEmail } from '../mailer.ts';
import { categoryEnabled } from '../lifecycle/policy.ts';
import { frequencyGate, recordExternalSend } from '../lifecycle/frequency.ts';
import { processStorageDeletions } from '../objectStorage.ts';
import { registerJob, trackJob } from '../jobMonitor.ts';

export const REMINDER_DAYS = [30, 7] as const;

interface DueRow {
  item_id: string;
  item_name: string;
  enxoval_name: string;
  warranty_until: string;
  days_left: number;
  recipients: { name: string; email: string; preferences: unknown }[];
}

/** Uma rodada: um e-mail por pessoa com todas as garantias que entraram na janela de 30 ou de 7 dias. */
export async function sendWarrantyReminders(now = new Date()) {
  const summary = { items: 0, emails: 0 };
  if (!canDeliverMail()) return summary;
  const due = await getPool().query<DueRow>(`
    SELECT i.id AS item_id, i.name AS item_name, e.name AS enxoval_name,
      to_char(i.warranty_until, 'YYYY-MM-DD') AS warranty_until,
      (i.warranty_until - ($1::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date) AS days_left,
      COALESCE((
        SELECT json_agg(json_build_object('name', u.name, 'email', u.email, 'preferences', u.marketing_preferences))
        FROM enxoval_members em
        INNER JOIN users u ON u.id = em.user_id
        WHERE em.enxoval_id = i.enxoval_id AND u.is_active AND u.warranty_reminders
          AND (u.marketing_paused_until IS NULL OR u.marketing_paused_until < $1)
      ), '[]'::json) AS recipients
    FROM items i
    INNER JOIN enxovais e ON e.id = i.enxoval_id
    WHERE i.warranty_until IS NOT NULL AND i.status <> 'researching'
      AND i.warranty_until >= ($1::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date
      AND i.warranty_until <= ($1::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date + 30
  `, [now]);

  const outbox = new Map<string, { name: string; items: { itemId: string; daysBefore: number; until: string; itemName: string; enxovalName: string; daysLeft: number }[] }>();
  for (const row of due.rows) {
    const daysLeft = Number(row.days_left);
    // A janela mais próxima vale: com 5 dias restantes, só o aviso de 7 dias (o de 30 já passou ou não interessa mais).
    const daysBefore = REMINDER_DAYS.filter(days => daysLeft <= days).at(-1);
    if (daysBefore === undefined) continue;
    for (const person of row.recipients) {
      if (!categoryEnabled(person.preferences, 'reminders')) continue;
      const entry = outbox.get(person.email) ?? { name: person.name, items: [] };
      entry.items.push({ itemId: row.item_id, daysBefore, until: row.warranty_until, itemName: row.item_name, enxovalName: row.enxoval_name, daysLeft });
      outbox.set(person.email, entry);
    }
  }

  // Mesmo limite dos e-mails de ciclo de vida: quem já recebeu e-mail hoje recebe o aviso na próxima rodada (de hora em hora).
  const { allowed } = await frequencyGate([...outbox.keys()], now.getTime());
  for (const [email, { name, items }] of outbox) {
    if (!allowed.has(email)) continue;
    try {
      await withTransaction(async client => {
        const fresh = [];
        for (const item of items) {
          // Garantia renovada (outra data de fim) volta a ser avisada; o mesmo aviso não sai duas vezes para a mesma pessoa.
          const claimed = await client.query(`
            INSERT INTO warranty_reminders (item_id, days_before, warranty_until, email) VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `, [item.itemId, item.daysBefore, item.until, email]);
          if (claimed.rowCount) fresh.push(item);
        }
        if (fresh.length === 0) return;
        const userId = allowed.get(email) ?? null;
        const messageId = userId ? randomUUID() : undefined;
        const delivery = await sendMail(warrantyEmail({ to: email, name, items: fresh, messageId }));
        await recordExternalSend(userId, 'warranty', delivery.providerMessageId, undefined, { messageId, queryable: client });
        summary.items += fresh.length;
        summary.emails += 1;
      });
    } catch (err) {
      logger.error({ event: 'warranty.reminder.failed', email, err }, 'Warranty reminder failed; will retry next run.');
    }
  }
  return summary;
}

export function startWarrantyReminders() {
  registerJob('warranty_reminders', 60 * 60_000);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { summary, deletions } = await trackJob('warranty_reminders', async () => ({
        summary: await sendWarrantyReminders(),
        deletions: await processStorageDeletions(getPool()),
      }));
      if (summary.emails || deletions.deleted || deletions.failed) {
        logger.info({ event: 'warranty.worker.completed', summary, deletions }, 'Warranty reminders and storage cleanup completed.');
      }
    } catch (err) {
      logger.error({ event: 'warranty.worker.failed', err }, 'Warranty reminder run failed.');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), 60 * 60_000);
  timer.unref();
  return timer;
}
