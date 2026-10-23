// Rotina dos e-mails de ciclo de vida, a cada 15 minutos dentro do servidor. LIFECYCLE_MODE decide o que ela faz:
// `off` (padrão, não roda), `simulate` (só registra quem receberia) ou `send`.
import { logger } from '../logger.ts';
import { runLifecycle } from '../lifecycle/engine.ts';
import { lifecycleMode } from '../lifecycle/policy.ts';

export const LIFECYCLE_INTERVAL_MS = 15 * 60_000;

export function startLifecycleWorker() {
  if (lifecycleMode() === 'off') return null;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await runLifecycle();
      if (!summary.skipped) logger.info({ event: 'lifecycle.worker.completed', ...summary }, 'Rodada do ciclo de vida concluída.');
    } catch (err) {
      logger.error({ event: 'lifecycle.worker.failed', err }, 'Falha na rotina de ciclo de vida.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), LIFECYCLE_INTERVAL_MS);
  timer.unref();
  void run();
  return timer;
}
