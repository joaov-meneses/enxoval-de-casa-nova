// Rotina que relê os preços dos produtos acompanhados, guarda o histórico e avisa por e-mail quando um item baixa.
// Roda sozinha a cada 12 horas dentro do servidor (ver `startPriceTrackerScheduler`) ou sob demanda: npm run track-prices
import { getPool } from '../database.ts';
import { canDeliverMail, priceOpportunityEmail, sendMail, type PriceOpportunity } from '../mailer.ts';
import { ScrapeError, scrapeProduct, type ScrapedProductPreview } from '../services/productScraper.ts';
import { recordScrape, recordScrapeFailure, type ScrapeOutcome } from '../trackedProducts.ts';

export const PRICE_CHECK_INTERVAL_MS = 12 * 60 * 60_000;
const MIN_DELAY_MS = 2_000;
const MAX_DELAY_MS = 4_000;
const DEFAULT_BATCH_LIMIT = 200;
// Número fixo que identifica esta rotina no lock do PostgreSQL (evita duas execuções ao mesmo tempo em vários servidores).
const ADVISORY_LOCK_KEY = 726_351_904;

interface DueProduct {
  id: string;
  url: string;
}

export interface PriceTrackerOptions {
  /** Relê também os produtos lidos há menos de 12 horas. */
  force?: boolean;
  limit?: number;
  /** Espera entre uma loja e outra. Os testes passam uma versão sem espera. */
  sleep?: (ms: number) => Promise<void>;
  scrape?: (url: string) => Promise<ScrapedProductPreview>;
  log?: (message: string) => void;
}

export interface PriceTrackerSummary {
  checked: number;
  updated: number;
  failed: number;
  alertsSent: number;
  skipped: boolean;
}

type QueuedOpportunity = PriceOpportunity & { itemId: string; alertedPriceCents: number };

/** Avisos a enviar, por e-mail da pessoa. O preço avisado de cada item só é gravado depois que o e-mail sai. */
type Outbox = Map<string, { name: string; items: QueuedOpportunity[] }>;

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const jitter = () => MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);

async function dueProducts(limit: number, force: boolean) {
  // Só vale reler produtos que ainda estão em algum item a comprar. Os nunca lidos vão primeiro.
  const result = await getPool().query<DueProduct>(`
    SELECT tp.id, tp.url
    FROM tracked_products tp
    WHERE EXISTS (
        SELECT 1 FROM items i
        WHERE i.tracked_product_id = tp.id AND i.status IN ('needed', 'researching')
      )
      AND ($2::boolean OR tp.last_scraped_at IS NULL OR tp.last_scraped_at < now() - interval '12 hours')
    ORDER BY tp.last_scraped_at ASC NULLS FIRST
    LIMIT $1
  `, [limit, force]);
  return result.rows;
}

interface AlertCandidate {
  item_id: string;
  item_name: string;
  enxoval_name: string;
  price_basis: 'regular' | 'pix';
  target_price_cents: number | null;
  last_alert_price_cents: number | null;
  recipients: { name: string; email: string }[];
}

/** Itens a comprar, com aviso ligado, que usam este produto — com as pessoas que devem receber o aviso. */
async function alertCandidates(productId: string) {
  const result = await getPool().query<AlertCandidate>(`
    SELECT
      i.id AS item_id,
      i.name AS item_name,
      e.name AS enxoval_name,
      i.price_basis,
      i.target_price_cents,
      i.last_alert_price_cents,
      COALESCE((
        SELECT json_agg(json_build_object('name', u.name, 'email', u.email))
        FROM enxoval_members em
        INNER JOIN users u ON u.id = em.user_id AND u.is_active
        WHERE em.enxoval_id = i.enxoval_id
      ), '[]'::json) AS recipients
    FROM items i
    INNER JOIN enxovais e ON e.id = i.enxoval_id
    WHERE i.tracked_product_id = $1
      AND i.price_alert_enabled
      AND i.status IN ('needed', 'researching')
  `, [productId]);
  return result.rows;
}

/**
 * Decide, para cada item do produto, se há uma oportunidade nova (preço no alvo ou menor da história) e a anota
 * para o e-mail. O mesmo preço não é avisado duas vezes; se o preço volta a subir, um novo recorde avisa de novo.
 */
async function collectOpportunities(
  productId: string,
  productUrl: string,
  preview: ScrapedProductPreview,
  outcome: ScrapeOutcome,
  outbox: Outbox,
) {
  if (preview.priceCents === null || !preview.inStock) return;
  for (const candidate of await alertCandidates(productId)) {
    const current = candidate.price_basis === 'pix' ? (preview.pixPriceCents ?? null) : preview.priceCents;
    if (current === null) continue;
    const previousLowest = candidate.price_basis === 'pix' ? outcome.previousLowestPixCents : outcome.previousLowestCents;

    const reason: PriceOpportunity['reason'] | null =
      previousLowest !== null && current < previousLowest ? 'lowest'
        : candidate.target_price_cents !== null && current <= candidate.target_price_cents ? 'target'
          : null;
    const alreadyTold = candidate.last_alert_price_cents !== null && current >= candidate.last_alert_price_cents;

    if (!reason) {
      if (candidate.last_alert_price_cents !== null) {
        await getPool().query('UPDATE items SET last_alert_price_cents = NULL WHERE id = $1', [candidate.item_id]);
      }
      continue;
    }
    if (alreadyTold) continue;

    for (const person of candidate.recipients) {
      const entry = outbox.get(person.email) ?? { name: person.name, items: [] };
      entry.items.push({ itemId: candidate.item_id, alertedPriceCents: current, itemName: candidate.item_name, enxovalName: candidate.enxoval_name, priceCents: current, reason, url: productUrl });
      outbox.set(person.email, entry);
    }
  }
}

/** Uma rodada completa. Devolve o resumo; se outra rodada já está em andamento, não faz nada (`skipped`). */
export async function runPriceTracker(options: PriceTrackerOptions = {}): Promise<PriceTrackerSummary> {
  const log = options.log ?? (() => undefined);
  const sleep = options.sleep ?? wait;
  const scrape = options.scrape ?? scrapeProduct;
  const summary: PriceTrackerSummary = { checked: 0, updated: 0, failed: 0, alertsSent: 0, skipped: false };

  // O lock vale por conexão: pega uma só para a rodada inteira.
  const lockClient = await getPool().connect();
  try {
    const lock = await lockClient.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_KEY]);
    if (!lock.rows[0]?.locked) {
      summary.skipped = true;
      return summary;
    }

    try {
      const products = await dueProducts(options.limit ?? DEFAULT_BATCH_LIMIT, options.force ?? false);
      const outbox: Outbox = new Map();

      for (const [index, product] of products.entries()) {
        if (index > 0) await sleep(jitter());
        summary.checked += 1;
        try {
          const preview = await scrape(product.url);
          const outcome = await recordScrape(getPool(), product.id, preview);
          await collectOpportunities(product.id, product.url, preview, outcome, outbox);
          summary.updated += 1;
          log(`ok ${product.url} -> ${preview.priceCents ?? 'sem preço'}`);
        } catch (error) {
          summary.failed += 1;
          await recordScrapeFailure(getPool(), product.id, error);
          log(`falhou ${product.url}: ${error instanceof ScrapeError ? error.code : (error as Error).message}`);
        }
      }

      if (outbox.size > 0 && canDeliverMail()) {
        for (const [email, { name, items }] of outbox) {
          try {
            await sendMail(priceOpportunityEmail({ to: email, name, opportunities: items }));
            summary.alertsSent += 1;
            // Só marca o preço como avisado depois do envio: se o e-mail falhar, a próxima rodada tenta de novo.
            for (const item of items) {
              await getPool().query('UPDATE items SET last_alert_price_cents = $2 WHERE id = $1', [item.itemId, item.alertedPriceCents]);
            }
          } catch (error) {
            log(`e-mail não enviado: ${(error as Error).message}`);
          }
        }
      }
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
  return summary;
}

/**
 * Agenda a rotina dentro do servidor: a primeira rodada sai 1 minuto depois da subida e as seguintes a cada 12 horas.
 * Devolve uma função que cancela o agendamento.
 */
export function startPriceTrackerScheduler() {
  const run = () => {
    runPriceTracker({ log: message => console.log(`[preços] ${message}`) })
      .then(summary => {
        if (!summary.skipped && summary.checked > 0) console.log(`[preços] ${summary.updated} atualizados, ${summary.failed} com falha, ${summary.alertsSent} e-mails.`);
      })
      .catch(error => console.error('[preços] rodada interrompida:', error));
  };
  const first = setTimeout(run, 60_000);
  const repeat = setInterval(run, PRICE_CHECK_INTERVAL_MS);
  first.unref();
  repeat.unref();
  return () => {
    clearTimeout(first);
    clearInterval(repeat);
  };
}
