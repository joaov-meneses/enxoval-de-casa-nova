import type { PoolClient } from 'pg';
import { channelGroup, sanitizeTouch } from '../shared/acquisition.ts';

/** Versão do texto da caixa de e-mails no cadastro; muda quando o texto mudar (prova do consentimento). */
export const MARKETING_CONSENT_VERSION = '2026-10';

export interface SignupGrowth {
  touch: ReturnType<typeof sanitizeTouch>;
  channel: ReturnType<typeof channelGroup>;
  adConsent: boolean;
  gaClientId: string | null;
  emailMarketing: boolean;
}

/**
 * Lê o corpo opcional do cadastro. Nada aqui é obrigatório nem confiável: campos desconhecidos são descartados,
 * o grupo de canal é recalculado e os identificadores de anúncio só ficam com o consentimento de anúncios.
 */
export function parseSignupGrowth(body: unknown): SignupGrowth {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const acquisition = raw.acquisition && typeof raw.acquisition === 'object' ? raw.acquisition as Record<string, unknown> : {};
  const adConsent = acquisition.adConsent === true;
  const touch = sanitizeTouch(acquisition.touch);
  if (!adConsent) {
    delete touch.gclid;
    delete touch.fbclid;
  }
  const gaClientId = adConsent && typeof acquisition.gaClientId === 'string' && /^\d{1,20}\.\d{1,20}$/.test(acquisition.gaClientId)
    ? acquisition.gaClientId
    : null;
  return { touch, channel: channelGroup(touch), adConsent, gaClientId, emailMarketing: raw.emailMarketing === true };
}

/** Grava origem e consentimentos na conta recém-criada, dentro da mesma transação do cadastro. */
export async function saveSignupGrowth(client: PoolClient, userId: string, body: unknown, source: 'cadastro' | 'convite') {
  const growth = parseSignupGrowth(body);
  const { touch } = growth;
  await client.query(`
    UPDATE users SET
      acq_source = $2, acq_medium = $3, acq_campaign = $4, acq_content = $5, acq_term = $6,
      acq_channel_group = $7, acq_referrer_host = $8, acq_landing_path = $9, acq_first_seen_at = $10,
      acq_gclid = $11, acq_fbclid = $12, ga_client_id = $13,
      ad_consent_at = CASE WHEN $14 THEN now() END,
      marketing_consent_at = CASE WHEN $15 THEN now() END,
      marketing_consent_source = CASE WHEN $15 THEN $16 END,
      marketing_consent_version = CASE WHEN $15 THEN $17 END
    WHERE id = $1
  `, [
    userId, touch.source ?? null, touch.medium ?? null, touch.campaign ?? null, touch.content ?? null, touch.term ?? null,
    growth.channel, touch.referrerHost ?? null, touch.landingPath ?? null, touch.firstSeenAt ?? null,
    touch.gclid ?? null, touch.fbclid ?? null, growth.gaClientId,
    growth.adConsent, growth.emailMarketing, source, MARKETING_CONSENT_VERSION,
  ]);
  return growth;
}
