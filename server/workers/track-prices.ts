import { logger, stopPosthogLogs } from '../logger.ts';
// Executa uma rodada do acompanhamento de preços e termina. Uso: npm run track-prices [-- --force]
import { getPool } from '../database.ts';
import { runPriceTracker } from './priceTrackerWorker.ts';

try {
  const summary = await runPriceTracker({
    force: process.argv.includes('--force'),
  });
  logger.info({ event: 'prices.refresh.completed', ...summary }, 'Worker run completed.');
} catch (err) {
  logger.error({ event: 'prices.refresh.failed', err }, 'Worker run failed.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([getPool().end(), stopPosthogLogs()]);
}
