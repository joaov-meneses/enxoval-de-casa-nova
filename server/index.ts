import { createHttpLogging, httpErrorHandler } from './httpLogging.ts';
import { startErrorTracking, captureServerError, stopErrorTracking } from './errorTracking.ts';
import { logger, isProduction, stopPosthogLogs } from './logger.ts';
import { startTrialNotifications } from './workers/trialNotifications.ts';
import { startUserIpRetention } from './workers/userIpRetention.ts';
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";
import { migrateDatabase } from "./migrations.ts";
import { registerBillingWebhook } from "./billing.ts";
import { registerApiRoutes } from "./routes.ts";
import { startPriceTrackerScheduler } from "./workers/priceTrackerWorker.ts";
import { startCatalogScheduler } from "./workers/catalogWorker.ts";
import { registerIngestProxy } from "./ingestProxy.ts";
import { registerPreferenceRoutes } from "./lifecycle/routes.ts";
import { startLifecycleWorker } from "./workers/lifecycleWorker.ts";
import { stopProductAnalytics } from "./productAnalytics.ts";
import { startFiscalInvoiceWorker } from "./workers/fiscalInvoices.ts";
import { startWarrantyReminders } from './workers/warrantyReminders.ts';
import { registerResendWebhook } from './lifecycle/tracking.ts';
import { startJobWatchdog } from './jobMonitor.ts';
import { registerSeoRoutes, renderPageHtml } from './seo.ts';

const app = express();
const port = Number(process.env.PORT ?? 3000);
startErrorTracking();

app.set("trust proxy", 1);
app.use(createHttpLogging());
// O webhook da Stripe confere a assinatura sobre o corpo cru, então vem antes do parser de JSON.
registerBillingWebhook(app);
// O proxy do PostHog repassa o corpo cru (às vezes comprimido), então também vem antes do parser de JSON.
registerIngestProxy(app);
// O webhook do Resend (entregas, cliques, rejeições) também confere a assinatura sobre o corpo cru.
registerResendWebhook(app);
app.use(express.json({ limit: "1mb" }));

logger.info({ event: 'server.starting', port }, 'Iniciando servidor e aplicando migrações do banco.');
try {
  await migrateDatabase();
  logger.info({ event: 'database.migrated' }, 'Banco de dados atualizado.');
} catch (err) {
  logger.fatal({ event: 'server.startup.failed', err }, 'Não foi possível iniciar o servidor: falha nas migrações.');
  await Promise.allSettled([stopPosthogLogs(), stopErrorTracking()]);
  process.exit(1);
}
registerPreferenceRoutes(app);
registerApiRoutes(app);
startTrialNotifications();
startLifecycleWorker();
startUserIpRetention();
startFiscalInvoiceWorker();
startWarrantyReminders();
startJobWatchdog();
// robots.txt, sitemap.xml e X-Robots-Tag das páginas privadas, antes dos arquivos estáticos.
registerSeoRoutes(app);

if (isProduction) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const indexHtml = await readFile(path.join(currentDir, "index.html"), "utf8");

  // `index: false`: a página inicial também passa pelo handler abaixo, que coloca os metadados de cada página.
  app.use(express.static(currentDir, { index: false }));
  app.get("*", (req, res) => {
    res.type("html").send(renderPageHtml(indexHtml, req.path));
  });
} else {
  const vite = await createViteServer({
    appType: "spa",
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== "true",
      watch:
        process.env.DISABLE_HMR === "true"
          ? null
          : {
              ignored: [
                "**/tmp/**",
                "**/tests/**",
                "**/test-results/**",
                "**/playwright-report/**",
              ],
            },
    },
  });

  app.use(vite.middlewares);
}

app.use(captureServerError);
app.use(httpErrorHandler);

const httpServer = app.listen(port, "0.0.0.0", () => {
  logger.info({ event: 'server.listening', port }, `Servidor rodando em http://localhost:${port}`);
}).on('error', async err => {
  logger.fatal({ event: 'server.listen.failed', err, port }, 'Não foi possível abrir a porta do servidor.');
  await Promise.allSettled([stopPosthogLogs(), stopErrorTracking()]);
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info({ event: 'server.stopping', signal }, 'Server shutdown started.');
    // Let request completion logs reach the queue before flushing telemetry.
    const deadline = setTimeout(() => httpServer.closeAllConnections(), 5000);
    deadline.unref();
    httpServer.close(() => {
      clearTimeout(deadline);
      void Promise.allSettled([stopPosthogLogs(), stopErrorTracking(), stopProductAnalytics()]).finally(() => process.exit(0));
    });
  });
}

// Relê os preços dos produtos acompanhados a cada 12 horas. Em desenvolvimento fica desligado, para não acessar
// lojas sem querer; PRICE_TRACKER=on liga e PRICE_TRACKER=off desliga em qualquer ambiente.
if (process.env.PRICE_TRACKER === "on" || (isProduction && process.env.PRICE_TRACKER !== "off")) {
  startPriceTrackerScheduler();
}

// Rotina do catálogo (vínculos, faixas de preço, itens vindos das listas) a cada 6 horas. Não chama o Jev.
// CATALOG_WORKER=on liga e CATALOG_WORKER=off desliga em qualquer ambiente.
if (process.env.CATALOG_WORKER === "on" || (isProduction && process.env.CATALOG_WORKER !== "off")) {
  startCatalogScheduler();
}
