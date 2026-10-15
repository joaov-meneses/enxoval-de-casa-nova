// Executa uma rodada do acompanhamento de preços e termina. Uso: npm run track-prices [-- --force]
import { getPool } from '../database.ts';
import { runPriceTracker } from './priceTrackerWorker.ts';

try {
  const summary = await runPriceTracker({
    force: process.argv.includes('--force'),
    log: message => console.log(message),
  });
  if (summary.skipped) console.log('Outra rodada já está em andamento. Nada a fazer.');
  else console.log(`Concluído: ${summary.checked} lidos, ${summary.updated} atualizados, ${summary.failed} com falha, ${summary.alertsSent} e-mails enviados.`);
} finally {
  await getPool().end();
}
