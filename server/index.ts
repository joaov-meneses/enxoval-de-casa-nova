import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";
import { migrateDatabase } from "./migrations.ts";
import { registerApiRoutes } from "./routes.ts";
import { startPriceTrackerScheduler } from "./workers/priceTrackerWorker.ts";
import { startCatalogScheduler } from "./workers/catalogWorker.ts";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const isProduction =
  process.env.NODE_ENV === "production" ||
  process.argv.includes("--production");

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

await migrateDatabase();
registerApiRoutes(app);

if (isProduction) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  app.use(express.static(currentDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(currentDir, "index.html"));
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

app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

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
