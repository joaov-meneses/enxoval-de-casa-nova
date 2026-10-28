import { getStripe } from '../billing.ts';
import { checkBilling, reconcileBilling, reviewRefund, validateTestPix, enqueueMissingFiscal, syncFiscalInvoice } from '../billingOperations.ts';
import { getPool } from '../database.ts';
import { stopPosthogLogs } from '../logger.ts';

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  const result = index === -1 ? undefined : args[index + 1];
  if (!result || result.startsWith('--')) throw new Error(`Informe um valor para ${name}.`);
  return result;
};
try {
  const command = args[0];
  let result;
  if (command === 'check') result = await checkBilling(getStripe(), args.includes('--webhook-url') ? value('--webhook-url') : undefined);
  else if (command === 'test-pix') result = await validateTestPix(getStripe());
  else if (command === 'reconcile') {
    const since = args.includes('--since') ? Date.parse(value('--since')) / 1000 : NaN;
    const until = args.includes('--until') ? Date.parse(value('--until')) / 1000 : Math.floor(Date.now() / 1000);
    result = await reconcileBilling(getStripe(), { since, until, refreshFiscal: args.includes('--refresh-fiscal') });
  } else if (command === 'review-refund') {
    for (const name of ['--environment', '--charge', '--event', '--note']) if (!args.includes(name)) throw new Error(`Faltou ${name}.`);
    result = await reviewRefund(value('--environment'), value('--charge'), value('--event'), value('--note'));
  } else if (command === 'enqueue-fiscal') {
    for (const name of ['--source', '--reason']) if (!args.includes(name)) throw new Error(`Faltou ${name}.`);
    result = await enqueueMissingFiscal(getStripe(), value('--source'), value('--reason'), args.includes('--paid-at') ? Date.parse(value('--paid-at')) / 1000 : undefined);
  } else if (command === 'sync-fiscal') {
    if (!args.includes('--invoice')) throw new Error('Informe --invoice com o UUID da nota.');
    result = await syncFiscalInvoice(value('--invoice'));
  } else throw new Error('Use check, test-pix, reconcile --since <ISO> [--until <ISO>] [--refresh-fiscal], review-refund, enqueue-fiscal ou sync-fiscal.');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  // SDKs podem anexar headers e chaves à exceção. Não imprimir o objeto de erro.
  let message = err instanceof Error ? err.message : 'Falha na operação de pagamentos.';
  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NFSE_NACIONAL_KEY_PASSPHRASE', 'DATABASE_URL']) {
    if (process.env[name]) message = message.replaceAll(process.env[name]!, '[redacted]');
  }
  console.error(message.replace(/\b(?:sk|rk)_(?:test|live)_[a-zA-Z0-9_]+/g, '[redacted]')); process.exitCode = 1;
} finally { await Promise.allSettled([process.env.DATABASE_URL ? getPool().end() : Promise.resolve(), stopPosthogLogs()]); }
