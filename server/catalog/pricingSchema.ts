import type { Pool } from 'pg';

export async function migrateCatalogPricing(pool: Pool) {
  await pool.query(`
    -- Agregados antigos contavam enxovais, não clientes; serão recalculados com a nova regra.
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
        AND table_name='catalog_price_stats' AND column_name='source') THEN
        DELETE FROM catalog_price_stats;
      END IF;
    END $$;
    ALTER TABLE catalog_price_stats ADD COLUMN IF NOT EXISTS mean_cents integer;
    ALTER TABLE catalog_price_stats ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'customers';

    CREATE TABLE IF NOT EXISTS catalog_price_name_checks (
      item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
      observed_name text NOT NULL,
      canonical_name text NOT NULL,
      eligible boolean NOT NULL,
      confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      revision integer NOT NULL DEFAULT 1,
      checked_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (item_id, observed_name)
    );

    CREATE TABLE IF NOT EXISTS catalog_market_rotation (
      id boolean PRIMARY KEY DEFAULT true CHECK (id),
      item_ids uuid[] NOT NULL DEFAULT '{}',
      cursor integer NOT NULL DEFAULT 0 CHECK (cursor >= 0),
      finished_week date,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- A reserva é gravada ANTES da chamada HTTP. Uma reserva interrompida não é refeita automaticamente.
    -- O histórico não depende da existência do item, para exclusões não devolverem créditos ao orçamento local.
    CREATE TABLE IF NOT EXISTS catalog_market_searches (
      id uuid PRIMARY KEY,
      item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL,
      canonical_name text NOT NULL,
      query text NOT NULL,
      week_start date NOT NULL,
      month_start date NOT NULL,
      requested_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'success', 'failed', 'unmatched')),
      error_code text,
      completed_at timestamptz,
      UNIQUE (week_start, item_id)
    );
    CREATE INDEX IF NOT EXISTS catalog_market_searches_month_idx ON catalog_market_searches(month_start);
    CREATE INDEX IF NOT EXISTS catalog_market_searches_item_idx ON catalog_market_searches(item_id, requested_at DESC);

    CREATE TABLE IF NOT EXISTS catalog_market_offers (
      search_id uuid NOT NULL REFERENCES catalog_market_searches(id) ON DELETE CASCADE,
      merchant text NOT NULL,
      title text NOT NULL,
      url text NOT NULL,
      price_cents integer NOT NULL CHECK (price_cents > 0),
      confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      captured_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (search_id, merchant)
    );
  `);
}
