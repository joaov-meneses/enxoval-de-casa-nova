// Executa uma rodada do motor de ciclo de vida e termina. Uso: npm run lifecycle [-- --simulate]
import { getPool } from '../database.ts';
import { logger, stopPosthogLogs } from '../logger.ts';
import { runLifecycle } from '../lifecycle/engine.ts';
import { stopProductAnalytics } from '../productAnalytics.ts';

try {
  const summary = await runLifecycle(process.argv.includes('--simulate') ? { mode: 'simulate' } : {});
  logger.info({ event: 'lifecycle.run.completed', ...summary }, 'Rodada do ciclo de vida concluída.');
} catch (err) {
  logger.error({ event: 'lifecycle.run.failed', err }, 'Falha na rodada do ciclo de vida.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([getPool().end(), stopPosthogLogs(), stopProductAnalytics()]);
}
