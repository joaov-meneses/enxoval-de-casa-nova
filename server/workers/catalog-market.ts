import { getPool } from '../database.ts';
import { logger, stopPosthogLogs } from '../logger.ts';
import { runCatalogMarketRefresh } from './catalogMarketWorker.ts';

try {
  const summary = await runCatalogMarketRefresh();
  logger.info({ event: 'catalog.market.completed', ...summary }, 'Rodada da pesquisa de preços concluída.');
} catch {
  logger.error({ event: 'catalog.market.failed' }, 'Falha ao pesquisar preços do catálogo.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([getPool().end(), stopPosthogLogs()]);
}
