import type { Pool } from 'pg';

/**
 * Fase 11: mais valor na lista "Meu enxoval". Parcelas e fluxo mensal, responsável por item, presentes e
 * agradecimentos, comprovantes e garantias, várias lojas por item. Roda no fim de `migrateDatabase`.
 */
export async function migrateEnxovalValue(pool: Pool) {
  await pool.query(`
    -- 11.1 Parcelas e fluxo mensal. "Já investimos" continua sendo o valor total; o fluxo é uma visão à parte.
    ALTER TABLE items
      ADD COLUMN IF NOT EXISTS installments smallint NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS first_installment_on date,
      ADD COLUMN IF NOT EXISTS purchased_at date,
      ADD COLUMN IF NOT EXISTS payment_method text,
      ADD COLUMN IF NOT EXISTS installment_cents integer;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_installments_valid;
    ALTER TABLE items ADD CONSTRAINT items_installments_valid CHECK (installments BETWEEN 1 AND 24);
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_payment_method_valid;
    ALTER TABLE items ADD CONSTRAINT items_payment_method_valid CHECK (payment_method IS NULL OR payment_method IN ('pix', 'credit', 'debit', 'boleto', 'cash', 'other'));
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_installment_cents_valid;
    ALTER TABLE items ADD CONSTRAINT items_installment_cents_valid CHECK (installment_cents IS NULL OR installment_cents > 0);
    ALTER TABLE enxovais ADD COLUMN IF NOT EXISTS monthly_budget_cents integer;
    ALTER TABLE enxovais DROP CONSTRAINT IF EXISTS enxovais_monthly_budget_valid;
    ALTER TABLE enxovais ADD CONSTRAINT enxovais_monthly_budget_valid CHECK (monthly_budget_cents IS NULL OR monthly_budget_cents > 0);
    -- Compras antigas sem data: a melhor aproximação é o dia da última alteração do item.
    UPDATE items SET purchased_at = updated_at::date WHERE status = 'bought' AND purchased_at IS NULL;

    -- 11.2 Quem compra o quê. Só dono ou membro do enxoval (validado no servidor).
    ALTER TABLE items ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS items_assignee_idx ON items(enxoval_id, assignee_id) WHERE assignee_id IS NOT NULL;
    -- Quem sai do enxoval deixa de ser responsável pelos itens dele.
    CREATE OR REPLACE FUNCTION items_release_assignee() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE items SET assignee_id = NULL WHERE enxoval_id = OLD.enxoval_id AND assignee_id = OLD.user_id;
      RETURN OLD;
    END $$;
    DROP TRIGGER IF EXISTS enxoval_members_release_assignee ON enxoval_members;
    CREATE TRIGGER enxoval_members_release_assignee AFTER DELETE ON enxoval_members
      FOR EACH ROW EXECUTE FUNCTION items_release_assignee();

    -- 11.3 Presentes recebidos e agradecimentos. Nomes de terceiros ficam só no enxoval.
    ALTER TABLE items
      ADD COLUMN IF NOT EXISTS gift_from text,
      ADD COLUMN IF NOT EXISTS gift_message text,
      ADD COLUMN IF NOT EXISTS thanked_at timestamptz;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_gift_text_valid;
    ALTER TABLE items ADD CONSTRAINT items_gift_text_valid CHECK (
      (gift_from IS NULL OR char_length(gift_from) <= 120) AND (gift_message IS NULL OR char_length(gift_message) <= 500));

    -- 11.4 Comprovantes e garantias.
    ALTER TABLE items
      ADD COLUMN IF NOT EXISTS warranty_months smallint,
      ADD COLUMN IF NOT EXISTS warranty_until date,
      ADD COLUMN IF NOT EXISTS store_name text;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_warranty_valid;
    ALTER TABLE items ADD CONSTRAINT items_warranty_valid CHECK (
      (warranty_months IS NULL OR warranty_months BETWEEN 1 AND 240) AND (store_name IS NULL OR char_length(store_name) <= 80));
    -- \`storage_key\` diz onde o arquivo mora: "db:<id>" (tabela abaixo) ou "s3:<chave>" (bucket de objetos).
    CREATE TABLE IF NOT EXISTS item_documents (
      id uuid PRIMARY KEY,
      item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      enxoval_id uuid NOT NULL REFERENCES enxovais(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('invoice', 'warranty', 'manual', 'other')),
      storage_key text NOT NULL UNIQUE,
      file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 160),
      content_type text NOT NULL,
      size_bytes integer NOT NULL CHECK (size_bytes > 0),
      uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS item_documents_item_idx ON item_documents(item_id, created_at);
    CREATE INDEX IF NOT EXISTS item_documents_enxoval_idx ON item_documents(enxoval_id, created_at);
    ALTER TABLE item_documents ADD COLUMN IF NOT EXISTS receipt_preview jsonb;
    CREATE TABLE IF NOT EXISTS document_read_usage (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_day date NOT NULL,
      attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
      PRIMARY KEY (user_id, read_day)
    );
    CREATE TABLE IF NOT EXISTS item_document_blobs (
      document_id uuid PRIMARY KEY REFERENCES item_documents(id) ON DELETE CASCADE,
      data bytea NOT NULL
    );
    -- Arquivo no bucket não some com o CASCADE: a exclusão entra numa fila que o worker esvazia.
    CREATE TABLE IF NOT EXISTS storage_deletions (
      storage_key text PRIMARY KEY,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION item_documents_queue_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.storage_key LIKE 's3:%' THEN
        INSERT INTO storage_deletions (storage_key) VALUES (OLD.storage_key) ON CONFLICT DO NOTHING;
      END IF;
      RETURN OLD;
    END $$;
    DROP TRIGGER IF EXISTS item_documents_queue_deletion ON item_documents;
    CREATE TRIGGER item_documents_queue_deletion AFTER DELETE ON item_documents
      FOR EACH ROW EXECUTE FUNCTION item_documents_queue_deletion();
    -- Lembretes de garantia: um por item, prazo (30 ou 7 dias), data de fim e pessoa, para não repetir.
    CREATE TABLE IF NOT EXISTS warranty_reminders (
      item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      days_before smallint NOT NULL,
      warranty_until date NOT NULL,
      email text NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (item_id, days_before, warranty_until, email)
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS warranty_reminders boolean NOT NULL DEFAULT true;

    -- 11.5 Várias lojas para o mesmo item. A oferta principal é espelhada em items.tracked_product_id.
    CREATE TABLE IF NOT EXISTS item_offers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      tracked_product_id uuid NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
      is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (item_id, tracked_product_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS item_offers_one_primary ON item_offers(item_id) WHERE is_primary;
    CREATE INDEX IF NOT EXISTS item_offers_product_idx ON item_offers(tracked_product_id);
    INSERT INTO item_offers (item_id, tracked_product_id, is_primary)
    SELECT i.id, i.tracked_product_id, true FROM items i
    WHERE i.tracked_product_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM item_offers o WHERE o.item_id = i.id)
    ON CONFLICT DO NOTHING;
  `);
}
