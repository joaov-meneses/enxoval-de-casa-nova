import { logger, stopPosthogLogs } from './logger.ts';
import { getPool } from './database.ts';
import { migrateDatabase } from './migrations.ts';

try {
  await migrateDatabase();
  logger.info({ event: 'database.migrated' }, 'Database migrations completed.');
} catch (err) {
  logger.error({ event: 'database.migration.failed', err }, 'Database migrations failed.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([getPool().end(), stopPosthogLogs()]);
}
