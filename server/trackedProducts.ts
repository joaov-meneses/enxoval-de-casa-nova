// Produtos de loja acompanhados: um registro por link, compartilhado entre os itens que o usam, e o histórico de preços.
import { randomUUID } from 'node:crypto';
import type { Queryable } from './database.ts';
import { domainOf, normalizeProductUrl, recallPreview, ScrapeError, type ScrapedProductPreview } from './services/productScraper.ts';
import { HttpError } from './security.ts';

const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60_000;

/** Endereço do produto como é guardado (sem rastreio nem fragmento). Lança 400 quando o link não é de uma página pública. */
export function requireTrackableUrl(raw: unknown) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Link do produto inválido.');
  try {
    return normalizeProductUrl(raw);
  } catch (error) {
    throw new HttpError(400, error instanceof ScrapeError ? error.message : 'Link do produto inválido.');
  }
}

/**
 * Acha o produto acompanhado do link ou cria um novo. Produto novo já nasce com a leitura recente feita pelo
 * formulário (se houver) e o primeiro registro do histórico; sem leitura, fica "pendente" até a rotina de preços passar.
 */
export async function findOrCreateTrackedProduct(queryable: Queryable, rawUrl: string, fallbackTitle: string) {
  const url = requireTrackableUrl(rawUrl);
  const preview = recallPreview(url);
  const price = preview?.priceCents ?? null;
  const pix = preview?.pixPriceCents ?? null;

  const result = await queryable.query<{ id: string; inserted: boolean }>(`
    INSERT INTO tracked_products (
      id, url, canonical_url, domain, title, image_url, current_price_cents, pix_price_cents,
      lowest_price_cents, highest_price_cents, in_stock, last_scraped_at, last_scrape_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7, $7, $9, $10, $11)
    ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url
    RETURNING id, (xmax = 0) AS inserted
  `, [
    randomUUID(), url, preview?.canonicalUrl ?? null, domainOf(url), (preview?.title || fallbackTitle).slice(0, 300),
    preview?.imageUrl ?? null, price, pix, preview?.inStock ?? true,
    preview ? new Date() : null, preview ? (price === null ? 'no_price' : 'ok') : 'pending',
  ]);

  const { id, inserted } = result.rows[0];
  if (inserted && price !== null) {
    await queryable.query(`
      INSERT INTO product_price_snapshots (id, tracked_product_id, price_cents, pix_price_cents, in_stock)
      VALUES ($1, $2, $3, $4, $5)
    `, [randomUUID(), id, price, pix, preview?.inStock ?? true]);
  }
  return id;
}

export interface ScrapeOutcome {
  /** Menores preços do histórico ANTES desta leitura (null quando não havia nenhum). */
  previousLowestCents: number | null;
  previousLowestPixCents: number | null;
  snapshotRecorded: boolean;
}

/** Grava uma leitura bem-sucedida: atualiza o produto e, se o preço mudou (ou passou 1 dia), registra um novo ponto no histórico. */
export async function recordScrape(queryable: Queryable, productId: string, preview: ScrapedProductPreview): Promise<ScrapeOutcome> {
  const price = preview.priceCents;
  const pix = preview.pixPriceCents ?? null;

  const history = await queryable.query<{ lowest: number | null; lowest_pix: number | null }>(`
    SELECT MIN(price_cents) AS lowest, MIN(pix_price_cents) AS lowest_pix
    FROM product_price_snapshots
    WHERE tracked_product_id = $1
  `, [productId]);
  const outcome: ScrapeOutcome = {
    previousLowestCents: history.rows[0]?.lowest ?? null,
    previousLowestPixCents: history.rows[0]?.lowest_pix ?? null,
    snapshotRecorded: false,
  };

  if (price === null) {
    await queryable.query(`
      UPDATE tracked_products
      SET in_stock = $2, last_scraped_at = now(), last_scrape_status = 'no_price', updated_at = now()
      WHERE id = $1
    `, [productId, preview.inStock]);
    return outcome;
  }

  const last = await queryable.query<{ price_cents: number; pix_price_cents: number | null; in_stock: boolean; captured_at: Date }>(`
    SELECT price_cents, pix_price_cents, in_stock, captured_at
    FROM product_price_snapshots
    WHERE tracked_product_id = $1
    ORDER BY captured_at DESC
    LIMIT 1
  `, [productId]);
  const previous = last.rows[0];
  const changed = !previous
    || previous.price_cents !== price
    || (previous.pix_price_cents ?? null) !== pix
    || previous.in_stock !== preview.inStock
    || Date.now() - previous.captured_at.getTime() >= SNAPSHOT_MAX_AGE_MS;

  if (changed) {
    await queryable.query(`
      INSERT INTO product_price_snapshots (id, tracked_product_id, price_cents, pix_price_cents, in_stock)
      VALUES ($1, $2, $3, $4, $5)
    `, [randomUUID(), productId, price, pix, preview.inStock]);
    outcome.snapshotRecorded = true;
  }

  await queryable.query(`
    UPDATE tracked_products
    SET current_price_cents = $2,
        pix_price_cents = $3,
        lowest_price_cents = LEAST(COALESCE(lowest_price_cents, $2), $2),
        highest_price_cents = GREATEST(COALESCE(highest_price_cents, $2), $2),
        in_stock = $4,
        image_url = COALESCE(image_url, $5),
        canonical_url = COALESCE(canonical_url, $6),
        last_scraped_at = now(),
        last_scrape_status = 'ok',
        updated_at = now()
    WHERE id = $1
  `, [productId, price, pix, preview.inStock, preview.imageUrl ?? null, preview.canonicalUrl ?? null]);

  return outcome;
}

/** Leitura que falhou: guarda o motivo e adia a próxima tentativa (não martela uma loja que está barrando). */
export async function recordScrapeFailure(queryable: Queryable, productId: string, error: unknown) {
  const status = error instanceof ScrapeError && error.code === 'blocked' ? 'blocked' : 'failed';
  await queryable.query(`
    UPDATE tracked_products
    SET last_scraped_at = now(), last_scrape_status = $2, updated_at = now()
    WHERE id = $1
  `, [productId, status]);
}
