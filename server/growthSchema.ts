import type { Pool } from 'pg';

/**
 * Fase 7: origem do cadastro (primeiro toque), consentimentos e motor de ciclo de vida.
 * Separado de migrations.ts para não disputar o mesmo bloco SQL; roda no fim de `migrateDatabase`.
 */
export async function migrateGrowth(pool: Pool) {
  await pool.query(`
    -- Primeiro toque do cadastro (UTMs, grupo de canal calculado no servidor, página de entrada).
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS acq_source text,
      ADD COLUMN IF NOT EXISTS acq_medium text,
      ADD COLUMN IF NOT EXISTS acq_campaign text,
      ADD COLUMN IF NOT EXISTS acq_content text,
      ADD COLUMN IF NOT EXISTS acq_term text,
      ADD COLUMN IF NOT EXISTS acq_channel_group text,
      ADD COLUMN IF NOT EXISTS acq_referrer_host text,
      ADD COLUMN IF NOT EXISTS acq_landing_path text,
      ADD COLUMN IF NOT EXISTS acq_first_seen_at timestamptz,
      -- Só com consentimento de anúncios: identificadores de clique e o client_id do GA4 (conversões do servidor).
      ADD COLUMN IF NOT EXISTS acq_gclid text,
      ADD COLUMN IF NOT EXISTS acq_fbclid text,
      ADD COLUMN IF NOT EXISTS ga_client_id text,
      ADD COLUMN IF NOT EXISTS ad_consent_at timestamptz,
      -- E-mails de ciclo de vida: consentimento próprio, separado dos termos (NULL = sem consentimento).
      ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
      ADD COLUMN IF NOT EXISTS marketing_consent_source text,
      ADD COLUMN IF NOT EXISTS marketing_consent_version text,
      ADD COLUMN IF NOT EXISTS marketing_unsubscribed_at timestamptz,
      ADD COLUMN IF NOT EXISTS marketing_paused_until timestamptz,
      ADD COLUMN IF NOT EXISTS marketing_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
      -- Link de /preferencias e do descadastro com um clique (sem login).
      ADD COLUMN IF NOT EXISTS preferences_token text;
    CREATE UNIQUE INDEX IF NOT EXISTS users_preferences_token_idx ON users(preferences_token) WHERE preferences_token IS NOT NULL;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_acq_channel_group_valid;
    ALTER TABLE users ADD CONSTRAINT users_acq_channel_group_valid CHECK (acq_channel_group IS NULL OR acq_channel_group IN
      ('paid_search', 'paid_social', 'email', 'organic_search', 'organic_social', 'referral', 'direct'));

    CREATE TABLE IF NOT EXISTS lifecycle_messages (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      enxoval_id uuid REFERENCES enxovais(id) ON DELETE CASCADE,
      flow_key text NOT NULL,
      step text NOT NULL,
      channel text NOT NULL DEFAULT 'email',
      locale text NOT NULL DEFAULT 'pt-BR',
      template_version text NOT NULL,
      holdout boolean NOT NULL DEFAULT false,
      status text NOT NULL,
      suppressed_reason text,
      provider_message_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz,
      CONSTRAINT lifecycle_messages_status_valid CHECK (status IN ('pending', 'sent', 'failed', 'holdout', 'simulated'))
    );
    -- Nunca o mesmo passo duas vezes (a simulação não conta: ligar o envio depois não fica bloqueado por ela).
    CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_messages_once_idx
      ON lifecycle_messages(user_id, flow_key, step, COALESCE(enxoval_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE status <> 'simulated';
    CREATE INDEX IF NOT EXISTS lifecycle_messages_user_sent_idx ON lifecycle_messages(user_id, sent_at DESC) WHERE status = 'sent';

    CREATE TABLE IF NOT EXISTS lifecycle_events (
      id uuid PRIMARY KEY,
      message_id uuid NOT NULL REFERENCES lifecycle_messages(id) ON DELETE CASCADE,
      type text NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lifecycle_events_type_valid CHECK (type IN ('delivered', 'clicked', 'bounced', 'complained', 'unsubscribed'))
    );
    CREATE INDEX IF NOT EXISTS lifecycle_events_message_idx ON lifecycle_events(message_id);

    -- Rejeição definitiva, reclamação de spam ou pedido explícito: nada de marketing para o endereço.
    CREATE TABLE IF NOT EXISTS email_suppressions (
      email text PRIMARY KEY,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Retorno do provedor (webhooks do Resend) e volta ao app pelo link do e-mail. O id do evento evita contar duas
    -- vezes a mesma entrega quando o provedor reenvia o webhook.
    ALTER TABLE lifecycle_events ADD COLUMN IF NOT EXISTS provider_event_id text;
    CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_events_provider_event_idx ON lifecycle_events(provider_event_id)
      WHERE provider_event_id IS NOT NULL;
    ALTER TABLE lifecycle_events DROP CONSTRAINT IF EXISTS lifecycle_events_type_valid;
    ALTER TABLE lifecycle_events ADD CONSTRAINT lifecycle_events_type_valid
      CHECK (type IN ('delivered', 'clicked', 'bounced', 'complained', 'unsubscribed', 'returned'));
    CREATE INDEX IF NOT EXISTS lifecycle_messages_provider_idx ON lifecycle_messages(provider_message_id)
      WHERE provider_message_id IS NOT NULL;

    -- Dias em que a pessoa usou o app (um registro por dia). Mede retorno depois de cada e-mail e a retenção,
    -- inclusive do grupo de controle, que não recebe link nenhum.
    CREATE TABLE IF NOT EXISTS user_activity_days (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day date NOT NULL,
      PRIMARY KEY (user_id, day)
    );

    -- L9: pesquisa de pós-mudança (nota de 0 a 10 e comentário opcional), uma resposta por pessoa e data de mudança.
    CREATE TABLE IF NOT EXISTS survey_responses (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      survey text NOT NULL,
      score smallint NOT NULL CHECK (score BETWEEN 0 AND 10),
      comment text,
      message_id uuid REFERENCES lifecycle_messages(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, survey)
    );

    -- Disparos pontuais da equipe para um segmento salvo (/admin). As mensagens ficam em lifecycle_messages com
    -- flow_key 'campaign' e step = id da campanha, então valem o mesmo limite, a supressão e o retorno do provedor.
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      segment text NOT NULL,
      subject text NOT NULL,
      body text NOT NULL,
      cta_label text NOT NULL,
      cta_path text NOT NULL,
      status text NOT NULL DEFAULT 'sending',
      audience_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      CONSTRAINT marketing_campaigns_status_valid CHECK (status IN ('sending', 'sent', 'failed'))
    );

    -- Rotinas agendadas: última execução, último sucesso e última falha, para avisar quando uma rotina para de rodar.
    CREATE TABLE IF NOT EXISTS job_runs (
      job text PRIMARY KEY,
      interval_ms integer NOT NULL,
      app_version text,
      registered_at timestamptz NOT NULL DEFAULT now(),
      seen_at timestamptz NOT NULL DEFAULT now(),
      last_started_at timestamptz,
      last_succeeded_at timestamptz,
      last_failed_at timestamptz,
      last_error text,
      last_duration_ms integer,
      last_alerted_at timestamptz
    );
  `);
}
