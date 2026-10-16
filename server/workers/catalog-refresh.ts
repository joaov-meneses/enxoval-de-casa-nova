// Executa uma rodada da rotina do catálogo e termina. Uso: npm run catalog:refresh [-- --urgency [--limit 600]]
import { getPool } from '../database.ts';
import { runCatalogRefresh } from './catalogWorker.ts';

const limitIndex = process.argv.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : undefined;

try {
  const summary = await runCatalogRefresh({
    urgency: process.argv.includes('--urgency'),
    urgencyLimit: Number.isInteger(limit) && limit! > 0 ? limit : undefined,
    log: message => console.log(message),
  });
  if (summary.skipped) console.log('Outra rodada já está em andamento. Nada a fazer.');
  else console.log(`Concluído: ${summary.linked} itens ligados, ${summary.promoted} itens novos, ${summary.priceRanges} faixas de preço, ${summary.urgencies} urgências pré-calculadas.`);
} finally {
  await getPool().end();
}
