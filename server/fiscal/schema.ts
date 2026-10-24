import type { Pool } from 'pg';

export async function migrateFiscal(pool: Pool) {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS fiscal_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE billing_checkouts ADD COLUMN IF NOT EXISTS configuration_key text NOT NULL DEFAULT 'legacy';
    CREATE TABLE IF NOT EXISTS fiscal_invoices (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      source_id text NOT NULL,
      reference text NOT NULL UNIQUE,
      environment text NOT NULL CHECK (environment IN ('homologacao', 'producao')),
      model text NOT NULL DEFAULT 'nfse' CHECK (model IN ('nfse', 'nfsen')),
      paid_at timestamptz NOT NULL DEFAULT now(),
      amount_cents integer NOT NULL CHECK (amount_cents > 0),
      currency text NOT NULL CHECK (currency = 'brl'),
      plan text NOT NULL CHECK (plan IN ('pass', 'monthly')),
      recipient jsonb NOT NULL DEFAULT '{}'::jsonb,
      payload jsonb,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'authorized', 'cancelled', 'needs_data', 'rejected', 'failed')),
      number text,
      pdf_url text,
      xml_url text,
      error_code text,
      error_details jsonb,
      attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (environment, source_id)
    );
    CREATE INDEX IF NOT EXISTS fiscal_invoices_due_idx ON fiscal_invoices(next_attempt_at)
      WHERE status IN ('pending', 'processing');
    CREATE INDEX IF NOT EXISTS fiscal_invoices_user_idx ON fiscal_invoices(user_id, created_at DESC);
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS error_details jsonb;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'nfse' CHECK (model IN ('nfse', 'nfsen'));
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;
    UPDATE fiscal_invoices SET paid_at = created_at WHERE paid_at IS NULL;
    ALTER TABLE fiscal_invoices ALTER COLUMN paid_at SET DEFAULT now();
    ALTER TABLE fiscal_invoices ALTER COLUMN paid_at SET NOT NULL;
    -- Registros anteriores conservam origem e documentos; nunca são reenviados ao novo emissor.
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'legacy_focus';
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS dps_id text;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS dps_number text;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS issuer_snapshot jsonb;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS access_key text;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS authorized_xml text;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS competence date;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS issue_at timestamptz;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS issuance_policy jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
    ALTER TABLE fiscal_invoices ADD COLUMN IF NOT EXISTS reprepare boolean NOT NULL DEFAULT false;
    CREATE UNIQUE INDEX IF NOT EXISTS fiscal_invoices_dps_idx ON fiscal_invoices(environment, dps_id) WHERE dps_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS fiscal_dps_counters (
      environment text NOT NULL, cnpj text NOT NULL, serie text NOT NULL,
      last_number numeric(15,0) NOT NULL, PRIMARY KEY(environment, cnpj, serie)
    );
    CREATE TABLE IF NOT EXISTS fiscal_billing_events (
      event_id text PRIMARY KEY, environment text NOT NULL, event jsonb NOT NULL,
      processed_at timestamptz, error_code text, attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fiscal_attempts (
      id bigserial PRIMARY KEY, invoice_id uuid NOT NULL REFERENCES fiscal_invoices(id),
      operation text NOT NULL, outcome text NOT NULL, error_code text, details jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fiscal_manual_releases (
      id bigserial PRIMARY KEY, invoice_id uuid NOT NULL REFERENCES fiscal_invoices(id),
      competence date NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS billing_refund_cases (
      environment text NOT NULL CHECK (environment IN ('homologacao', 'producao')),
      charge_id text NOT NULL,
      payment_intent_id text,
      currency text NOT NULL,
      last_event_id text NOT NULL,
      last_event_created bigint NOT NULL,
      review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed')),
      review_note text,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (environment, charge_id)
    );
    CREATE TABLE IF NOT EXISTS billing_operation_audit (
      id uuid PRIMARY KEY,
      action text NOT NULL CHECK (action IN ('enqueue_fiscal', 'review_refund')),
      environment text NOT NULL CHECK (environment IN ('homologacao', 'producao')),
      source_id text NOT NULL,
      note text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
