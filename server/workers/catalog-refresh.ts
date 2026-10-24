import { logger, stopPosthogLogs } from '../logger.ts';
// Executa uma rodada da rotina do catálogo e termina. Uso: npm run catalog:refresh [-- --urgency [--limit 600]]
import { getPool } from '../database.ts';
import { runCatalogRefresh } from './catalogWorker.ts';

const limitIndex = process.argv.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : undefined;

try {
  const summary = await runCatalogRefresh({
    urgency: process.argv.includes('--urgency'),
    urgencyLimit: Number.isInteger(limit) && limit! > 0 ? limit : undefined,
  });
  logger.info({ event: 'catalog.refresh.completed', ...summary }, 'Worker run completed.');
} catch (err) {
  logger.error({ event: 'catalog.refresh.failed', err }, 'Worker run failed.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([getPool().end(), stopPosthogLogs()]);
}
