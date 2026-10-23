import { runFiscalInvoices } from '../fiscal/service.ts';
import { getLogger } from '../logger.ts';

export function startFiscalInvoiceWorker() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await runFiscalInvoices();
      if (summary.processed) getLogger().info({ event: 'fiscal.run.completed', ...summary }, 'Rodada de emissão fiscal concluída.');
    } catch { getLogger().error({ event: 'fiscal.run.failed' }, 'Não foi possível processar a fila fiscal.'); }
    finally { running = false; }
  };
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
  void run();
  return timer;
}
