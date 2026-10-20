import { getPool } from '../database.ts';
import { logger } from '../logger.ts';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000;

export async function pruneUserIpEvents() {
  const result = await getPool().query(
    "DELETE FROM user_ip_events WHERE occurred_at < now() - interval '6 months'",
  );
  return result.rowCount ?? 0;
}

export function startUserIpRetention() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    logger.info({ event: 'user_ip_events.retention_started' }, 'IP retention run started.');
    try {
      const deleted = await pruneUserIpEvents();
      logger.info({ event: 'user_ip_events.pruned', deleted }, 'Registros de IP expirados removidos.');
    } catch (err) {
      logger.error({ event: 'user_ip_events.retention_failed', err }, 'Falha ao remover registros de IP expirados.');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}
