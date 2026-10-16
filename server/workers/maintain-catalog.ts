// Executa uma rodada de manutenção do catálogo e termina. Uso: npm run catalog:maintain [-- --urgency]
import { getPool } from '../database.ts';
import { runCatalogMaintenance } from './catalogMaintenanceWorker.ts';

try {
  const summary = await runCatalogMaintenance({
    urgency: process.argv.includes('--urgency'),
    log: message => console.log(message)
  });
  if (summary.skipped) console.log('Outra rodada já está em andamento. Nada a fazer.');
} finally {
  await getPool().end();
}
