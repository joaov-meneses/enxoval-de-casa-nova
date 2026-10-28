import type { Pool } from 'pg';

export async function migratePlanning(pool: Pool) {
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS lead_time_weeks integer CHECK (lead_time_weeks BETWEEN 0 AND 52);
    ALTER TABLE items ADD COLUMN IF NOT EXISTS research_weeks integer CHECK (research_weeks BETWEEN 0 AND 12);
    ALTER TABLE items ADD COLUMN IF NOT EXISTS has_temporary_solution boolean NOT NULL DEFAULT false;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS depends_on_item_id uuid REFERENCES items(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS items_depends_on_idx ON items(depends_on_item_id) WHERE depends_on_item_id IS NOT NULL;
  `);
}
