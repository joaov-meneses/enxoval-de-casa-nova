import type { Pool } from 'pg';

export async function migrateHousewarming(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS housewarming_lists (
      id uuid PRIMARY KEY,
      enxoval_id uuid NOT NULL UNIQUE REFERENCES enxovais(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 3 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
      title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
      message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
      event_date date,
      pix_key text,
      pix_key_type text CHECK (pix_key_type IN ('cpf', 'email', 'phone', 'random')),
      pix_receiver_name text,
      pix_city text,
      is_public boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((pix_key IS NULL AND pix_key_type IS NULL AND pix_receiver_name IS NULL AND pix_city IS NULL)
          OR (pix_key IS NOT NULL AND pix_key_type IS NOT NULL AND pix_receiver_name IS NOT NULL AND pix_city IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS housewarming_items (
      list_id uuid NOT NULL REFERENCES housewarming_lists(id) ON DELETE CASCADE,
      item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      PRIMARY KEY (list_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS housewarming_reservations (
      id uuid PRIMARY KEY,
      list_id uuid NOT NULL REFERENCES housewarming_lists(id) ON DELETE CASCADE,
      item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      guest_name text NOT NULL CHECK (char_length(guest_name) BETWEEN 2 AND 120),
      guest_email text NOT NULL CHECK (char_length(guest_email) <= 254),
      message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz,
      cancelled_at timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS housewarming_one_reservation_idx ON housewarming_reservations(item_id) WHERE cancelled_at IS NULL;
    CREATE INDEX IF NOT EXISTS housewarming_reservations_inbox_idx ON housewarming_reservations(list_id, created_at DESC);
    ALTER TABLE items ADD COLUMN IF NOT EXISTS gift_reservation_id uuid REFERENCES housewarming_reservations(id) ON DELETE SET NULL;
    CREATE TABLE IF NOT EXISTS housewarming_messages (
      id uuid PRIMARY KEY,
      list_id uuid NOT NULL REFERENCES housewarming_lists(id) ON DELETE CASCADE,
      guest_name text NOT NULL CHECK (char_length(guest_name) BETWEEN 2 AND 120),
      message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS housewarming_messages_inbox_idx ON housewarming_messages(list_id, created_at DESC);
    -- PostgreSQL delivers notifications after commit, including across server instances.
    CREATE OR REPLACE FUNCTION housewarming_notify_change() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE workspace_id uuid;
    BEGIN
      IF TG_TABLE_NAME IN ('housewarming_lists', 'items') THEN
        workspace_id := COALESCE(NEW.enxoval_id, OLD.enxoval_id);
      ELSE
        SELECT enxoval_id INTO workspace_id FROM housewarming_lists WHERE id = COALESCE(NEW.list_id, OLD.list_id);
      END IF;
      IF workspace_id IS NOT NULL THEN PERFORM pg_notify('housewarming_changed', workspace_id::text); END IF;
      RETURN NULL;
    END $$;
    DROP TRIGGER IF EXISTS housewarming_list_changed ON housewarming_lists;
    CREATE TRIGGER housewarming_list_changed AFTER INSERT OR UPDATE OR DELETE ON housewarming_lists FOR EACH ROW EXECUTE FUNCTION housewarming_notify_change();
    DROP TRIGGER IF EXISTS housewarming_selection_changed ON housewarming_items;
    CREATE TRIGGER housewarming_selection_changed AFTER INSERT OR UPDATE OR DELETE ON housewarming_items FOR EACH ROW EXECUTE FUNCTION housewarming_notify_change();
    DROP TRIGGER IF EXISTS housewarming_reservation_changed ON housewarming_reservations;
    CREATE TRIGGER housewarming_reservation_changed AFTER INSERT OR UPDATE OR DELETE ON housewarming_reservations FOR EACH ROW EXECUTE FUNCTION housewarming_notify_change();
    DROP TRIGGER IF EXISTS housewarming_message_changed ON housewarming_messages;
    CREATE TRIGGER housewarming_message_changed AFTER INSERT OR UPDATE OR DELETE ON housewarming_messages FOR EACH ROW EXECUTE FUNCTION housewarming_notify_change();
    DROP TRIGGER IF EXISTS housewarming_item_changed ON items;
    CREATE TRIGGER housewarming_item_changed AFTER UPDATE OR DELETE ON items FOR EACH ROW EXECUTE FUNCTION housewarming_notify_change();
  `);
}
