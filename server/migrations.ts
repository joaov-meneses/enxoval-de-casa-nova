import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DEFAULT_ENXOVAL_TEMPLATE_NAME, DEFAULT_TEMPLATE_CATEGORIES, DEFAULT_TEMPLATE_ITEMS } from '../src/data.ts';
import { getPool } from './database.ts';

interface UserRow {
  id: string;
  name: string;
}

interface EnxovalRow {
  id: string;
}

interface TemplateRow {
  id: string;
}

async function seedDefaultTemplate(pool: Pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingTemplate = await client.query<TemplateRow>(`
      SELECT id
      FROM enxoval_templates
      WHERE is_default = true OR name = $1
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
    `, [DEFAULT_ENXOVAL_TEMPLATE_NAME]);

    const templateId = existingTemplate.rows[0]?.id ?? randomUUID();

    if (existingTemplate.rows[0]) {
      await client.query(`
        UPDATE enxoval_templates
        SET name = $1, is_default = true, updated_at = now()
        WHERE id = $2
      `, [DEFAULT_ENXOVAL_TEMPLATE_NAME, templateId]);
    } else {
      await client.query(`
        INSERT INTO enxoval_templates (id, name, is_default)
        VALUES ($1, $2, true)
      `, [templateId, DEFAULT_ENXOVAL_TEMPLATE_NAME]);
    }

    await client.query(`
      UPDATE enxoval_templates
      SET is_default = false, updated_at = now()
      WHERE id <> $1 AND is_default = true
    `, [templateId]);

    await client.query('DELETE FROM template_categories WHERE template_id = $1', [templateId]);

    const categoryIds = new Map<string, string>();

    for (const [index, categoryName] of DEFAULT_TEMPLATE_CATEGORIES.entries()) {
      const categoryId = randomUUID();
      await client.query(`
        INSERT INTO template_categories (id, template_id, name, sort_order)
        VALUES ($1, $2, $3, $4)
      `, [categoryId, templateId, categoryName, index]);
      categoryIds.set(categoryName, categoryId);
    }

    const itemOrdersByCategory = new Map<string, number>();

    for (const item of DEFAULT_TEMPLATE_ITEMS) {
      const categoryId = categoryIds.get(item.category);
      if (!categoryId) continue;

      const sortOrder = itemOrdersByCategory.get(item.category) ?? 0;
      itemOrdersByCategory.set(item.category, sortOrder + 1);

      await client.query(`
        INSERT INTO template_items (id, template_id, category_id, name, sort_order)
        VALUES ($1, $2, $3, $4, $5)
      `, [randomUUID(), templateId, categoryId, item.name, sortOrder]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function migrateDatabase() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS enxovais (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      discount_cents integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS enxoval_members (
      enxoval_id uuid NOT NULL REFERENCES enxovais(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('owner', 'editor')),
      invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (enxoval_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS items (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name text NOT NULL,
      checked boolean NOT NULL DEFAULT false,
      link text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      price_cents integer,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS enxoval_templates (
      id uuid PRIMARY KEY,
      name text NOT NULL UNIQUE,
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS template_categories (
      id uuid PRIMARY KEY,
      template_id uuid NOT NULL REFERENCES enxoval_templates(id) ON DELETE CASCADE,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (template_id, name)
    );

    CREATE TABLE IF NOT EXISTS template_items (
      id uuid PRIMARY KEY,
      template_id uuid NOT NULL REFERENCES enxoval_templates(id) ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES template_categories(id) ON DELETE CASCADE,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
    -- Conta criada a partir de um convite: só usa enxovais de outras pessoas e não cria os seus.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS enxoval_invitations (
      id uuid PRIMARY KEY,
      enxoval_id uuid NOT NULL REFERENCES enxovais(id) ON DELETE CASCADE,
      email text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (enxoval_id, email)
    );
    CREATE INDEX IF NOT EXISTS enxoval_invitations_expires_at_idx ON enxoval_invitations(expires_at);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id uuid PRIMARY KEY,
      token_hash text NOT NULL UNIQUE,
      credential_version text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions(expires_at);

    ALTER TABLE enxovais ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
    ALTER TABLE enxovais DROP CONSTRAINT IF EXISTS enxovais_discount_cents_non_negative;
    ALTER TABLE enxovais ADD CONSTRAINT enxovais_discount_cents_non_negative CHECK (discount_cents >= 0);
    ALTER TABLE enxovais ADD COLUMN IF NOT EXISTS onboarding_profile jsonb;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS enxoval_id uuid REFERENCES enxovais(id) ON DELETE CASCADE;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS enxoval_id uuid REFERENCES enxovais(id) ON DELETE CASCADE;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS price_cents integer;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_price_cents_non_negative;
    ALTER TABLE items ADD CONSTRAINT items_price_cents_non_negative CHECK (price_cents IS NULL OR price_cents >= 0);
    ALTER TABLE items ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'needed';
    UPDATE items SET status = 'bought' WHERE checked AND status = 'needed';
    ALTER TABLE items ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_discount_cents_non_negative;
    ALTER TABLE items ADD CONSTRAINT items_discount_cents_non_negative CHECK (discount_cents >= 0);
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'items' AND column_name = 'quantity'
      ) THEN
        ALTER TABLE items ADD COLUMN quantity integer NOT NULL DEFAULT 1;
        -- Uma única vez: itens do funil que já dizem "4 un." na descrição passam a ter quantidade 4.
        UPDATE items
        SET quantity = LEAST(GREATEST((substring(description from '(\\d+) un\\.'))::int, 1), 999)
        WHERE description ~ '\\d+ un\\.' AND length(substring(description from '(\\d+) un\\.')) <= 3;
      END IF;
    END $$;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_quantity_valid;
    ALTER TABLE items ADD CONSTRAINT items_quantity_valid CHECK (quantity >= 1 AND quantity <= 999);
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_status_valid;
    ALTER TABLE items ADD CONSTRAINT items_status_valid CHECK (status IN ('needed', 'researching', 'bought', 'received', 'owned', 'not_needed', 'discarded'));

    -- Planejamento de compras: data da mudança, localização e perfil de gasto passam a ser do enxoval.
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'enxovais' AND column_name = 'spending_tier'
      ) THEN
        ALTER TABLE enxovais ADD COLUMN move_date date;
        ALTER TABLE enxovais ADD COLUMN state text;
        ALTER TABLE enxovais ADD COLUMN city text;
        ALTER TABLE enxovais ADD COLUMN spending_tier text NOT NULL DEFAULT 'equilibrado';
        -- Uma única vez: enxovais criados pelo funil levam as respostas (já validadas) para as colunas.
        UPDATE enxovais
        SET move_date = CASE WHEN onboarding_profile->>'moveDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (onboarding_profile->>'moveDate')::date END,
            state = onboarding_profile->>'state',
            spending_tier = CASE onboarding_profile->>'budget'
              WHEN 'lt10' THEN 'economico'
              WHEN '25-50' THEN 'confortavel'
              WHEN 'gt50' THEN 'premium'
              ELSE 'equilibrado'
            END
        WHERE onboarding_profile IS NOT NULL;
      END IF;
    END $$;
    ALTER TABLE enxovais DROP CONSTRAINT IF EXISTS enxovais_spending_tier_valid;
    ALTER TABLE enxovais ADD CONSTRAINT enxovais_spending_tier_valid CHECK (spending_tier IN ('economico', 'equilibrado', 'confortavel', 'premium'));
    -- Semana de compra escolhida pela pessoa (nula: vale a sugestão do algoritmo), contada a partir da semana da mudança.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS buy_week smallint;
    -- Dados do catálogo gravados quando o item vem do funil; nos demais, o planejamento infere pelo nome.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS price_category smallint;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS priority text;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS timing text;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_buy_week_valid;
    ALTER TABLE items ADD CONSTRAINT items_buy_week_valid CHECK (buy_week IS NULL OR (buy_week >= -52 AND buy_week <= 104));
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_price_category_valid;
    ALTER TABLE items ADD CONSTRAINT items_price_category_valid CHECK (price_category IS NULL OR (price_category >= 1 AND price_category <= 4));
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_priority_valid;
    ALTER TABLE items ADD CONSTRAINT items_priority_valid CHECK (priority IS NULL OR priority IN ('essential', 'optional'));
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_timing_valid;
    ALTER TABLE items ADD CONSTRAINT items_timing_valid CHECK (timing IS NULL OR timing IN ('first_night', 'first_week'));
    -- Urgência de compra (1 a 5) inferida pelo Jev, guardada para não gastar outra consulta. A chave diz para qual
    -- nome e ambiente a nota vale: se o item mudar de nome ou de ambiente, a nota deixa de valer e é inferida de novo.
    ALTER TABLE items ADD COLUMN IF NOT EXISTS ai_urgency real;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS ai_urgency_confidence real;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS ai_urgency_key text;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_ai_urgency_valid;
    ALTER TABLE items ADD CONSTRAINT items_ai_urgency_valid CHECK (ai_urgency IS NULL OR (ai_urgency >= 1 AND ai_urgency <= 10));

    -- Central de ajuda: problemas, sugestões e outros assuntos enviados por quem usa o app.
    CREATE TABLE IF NOT EXISTS feedback (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      user_name text NOT NULL,
      user_email text NOT NULL,
      kind text NOT NULL,
      title text NOT NULL,
      description text NOT NULL,
      area text,
      steps text NOT NULL DEFAULT '',
      expected text NOT NULL DEFAULT '',
      problem text NOT NULL DEFAULT '',
      frequency text,
      severity text,
      importance text,
      contact_ok boolean NOT NULL DEFAULT false,
      contact_email text NOT NULL DEFAULT '',
      tech jsonb,
      screenshot bytea,
      screenshot_type text,
      status text NOT NULL DEFAULT 'new',
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT feedback_kind_valid CHECK (kind IN ('bug', 'idea', 'other')),
      CONSTRAINT feedback_status_valid CHECK (status IN ('new', 'seen', 'planned', 'done', 'dismissed')),
      CONSTRAINT feedback_frequency_valid CHECK (frequency IS NULL OR frequency IN ('always', 'sometimes', 'once')),
      CONSTRAINT feedback_severity_valid CHECK (severity IS NULL OR severity IN ('blocked', 'annoying', 'minor')),
      CONSTRAINT feedback_importance_valid CHECK (importance IS NULL OR importance IN ('nice', 'helps', 'essential')),
      CONSTRAINT feedback_screenshot_type_valid CHECK (screenshot_type IS NULL OR screenshot_type IN ('image/jpeg', 'image/png', 'image/webp'))
    );
    CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at DESC);
    CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback(status);

    -- Acompanhamento de preços: produtos de loja (um por link, compartilhado entre itens) e o histórico de preços.
    CREATE TABLE IF NOT EXISTS tracked_products (
      id uuid PRIMARY KEY,
      url text NOT NULL,
      canonical_url text,
      domain text NOT NULL,
      title text NOT NULL,
      image_url text,
      current_price_cents integer,
      pix_price_cents integer,
      lowest_price_cents integer,
      highest_price_cents integer,
      in_stock boolean NOT NULL DEFAULT true,
      last_scraped_at timestamptz,
      last_scrape_status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tracked_products_url_unique ON tracked_products(url);
    CREATE INDEX IF NOT EXISTS tracked_products_domain_idx ON tracked_products(domain);
    CREATE INDEX IF NOT EXISTS tracked_products_last_scraped_idx ON tracked_products(last_scraped_at);

    CREATE TABLE IF NOT EXISTS product_price_snapshots (
      id uuid PRIMARY KEY,
      tracked_product_id uuid NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
      price_cents integer NOT NULL,
      pix_price_cents integer,
      in_stock boolean NOT NULL DEFAULT true,
      captured_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS price_snapshots_product_captured_idx
      ON product_price_snapshots(tracked_product_id, captured_at DESC);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'items' AND column_name = 'initial_price_cents'
      ) THEN
        ALTER TABLE items ADD COLUMN initial_price_cents integer;
        -- Uma única vez: o preço que os itens já tinham passa a ser o preço de referência.
        UPDATE items SET initial_price_cents = price_cents WHERE price_cents IS NOT NULL;
      END IF;
    END $$;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS tracked_product_id uuid REFERENCES tracked_products(id) ON DELETE SET NULL;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS target_price_cents integer;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS selected_variation text;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url text;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS price_alert_enabled boolean NOT NULL DEFAULT true;
    -- Qual preço da loja o item acompanha (normal ou no Pix) e o último preço avisado por e-mail (evita repetir o aviso).
    ALTER TABLE items ADD COLUMN IF NOT EXISTS price_basis text NOT NULL DEFAULT 'regular';
    ALTER TABLE items ADD COLUMN IF NOT EXISTS last_alert_price_cents integer;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_price_basis_valid;
    ALTER TABLE items ADD CONSTRAINT items_price_basis_valid CHECK (price_basis IN ('regular', 'pix'));
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_tracking_prices_non_negative;
    ALTER TABLE items ADD CONSTRAINT items_tracking_prices_non_negative CHECK (
      (initial_price_cents IS NULL OR initial_price_cents >= 0)
      AND (target_price_cents IS NULL OR target_price_cents >= 0)
    );
    CREATE INDEX IF NOT EXISTS items_tracked_product_id_idx ON items(tracked_product_id);

    ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_name_unique;

    CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS enxovais_owner_id_idx ON enxovais(owner_id);
    CREATE INDEX IF NOT EXISTS enxoval_members_user_id_idx ON enxoval_members(user_id);
    CREATE INDEX IF NOT EXISTS categories_user_id_idx ON categories(user_id);
    CREATE INDEX IF NOT EXISTS categories_enxoval_id_idx ON categories(enxoval_id);
    CREATE UNIQUE INDEX IF NOT EXISTS categories_enxoval_name_unique ON categories(enxoval_id, name);
    CREATE INDEX IF NOT EXISTS items_user_id_idx ON items(user_id);
    CREATE INDEX IF NOT EXISTS items_category_id_idx ON items(category_id);
    CREATE INDEX IF NOT EXISTS items_enxoval_id_idx ON items(enxoval_id);
    CREATE UNIQUE INDEX IF NOT EXISTS enxoval_templates_single_default_idx ON enxoval_templates(is_default) WHERE is_default;
    CREATE INDEX IF NOT EXISTS template_categories_template_id_idx ON template_categories(template_id);
    CREATE INDEX IF NOT EXISTS template_items_template_id_idx ON template_items(template_id);
    CREATE INDEX IF NOT EXISTS template_items_category_id_idx ON template_items(category_id);
  `);

  await seedDefaultTemplate(pool);

  const usersResult = await pool.query<UserRow>(`
    SELECT DISTINCT u.id, u.name
    FROM users u
    WHERE EXISTS (SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.enxoval_id IS NULL)
       OR EXISTS (SELECT 1 FROM items i WHERE i.user_id = u.id AND i.enxoval_id IS NULL)
  `);

  for (const user of usersResult.rows) {
    const existingResult = await pool.query<EnxovalRow>(`
      SELECT e.id
      FROM enxovais e
      INNER JOIN enxoval_members em ON em.enxoval_id = e.id
      WHERE em.user_id = $1 AND em.role = 'owner'
      ORDER BY e.created_at ASC
      LIMIT 1
    `, [user.id]);

    const enxovalId = existingResult.rows[0]?.id ?? randomUUID();

    if (!existingResult.rows[0]) {
      await pool.query(`
        INSERT INTO enxovais (id, name, owner_id)
        VALUES ($1, $2, $3)
      `, [enxovalId, 'Enxoval de Casa Nova', user.id]);
    }

    await pool.query(`
      INSERT INTO enxoval_members (enxoval_id, user_id, role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (enxoval_id, user_id) DO UPDATE SET role = 'owner'
    `, [enxovalId, user.id]);

    await pool.query(`
      UPDATE categories
      SET enxoval_id = $1
      WHERE user_id = $2 AND enxoval_id IS NULL
    `, [enxovalId, user.id]);

    await pool.query(`
      UPDATE items
      SET enxoval_id = $1
      WHERE user_id = $2 AND enxoval_id IS NULL
    `, [enxovalId, user.id]);
  }

  await pool.query(`
    ALTER TABLE categories ALTER COLUMN enxoval_id SET NOT NULL;
    ALTER TABLE items ALTER COLUMN enxoval_id SET NOT NULL;
  `);
}
