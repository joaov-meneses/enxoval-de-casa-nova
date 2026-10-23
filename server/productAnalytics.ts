// Eventos de produto que nascem no servidor (ex.: lifecycle_email_sent). Só o UUID da conta identifica a pessoa;
// nunca e-mail, nome ou texto livre. Mesmas variáveis e mesma regra de desenvolvimento do errorTracking.
import { PostHog } from 'posthog-node';
import { isProduction } from './logger.ts';
import { appVersion } from './version.ts';

let client: PostHog | null | undefined;

function getClient(env = process.env) {
  if (client !== undefined) return client;
  const key = (env.POSTHOG_KEY || env.VITE_POSTHOG_KEY || '').trim();
  if (!key || (!isProduction && env.POSTHOG_ENABLE_DEV !== 'true')) return (client = null);
  try {
    // VITE_POSTHOG_HOST pode ser o proxy relativo do navegador (/ingest); o servidor fala direto com o PostHog.
    const browserHost = /^https?:\/\//.test(env.VITE_POSTHOG_HOST ?? '') ? env.VITE_POSTHOG_HOST : undefined;
    client = new PostHog(key, { host: env.POSTHOG_HOST || browserHost || 'https://us.i.posthog.com', disableGeoip: true });
    client.on('error', () => {});
  } catch {
    client = null;
  }
  return client;
}

export type ServerEvent =
  | 'lifecycle_email_sent' | 'lifecycle_email_delivered' | 'lifecycle_email_clicked' | 'lifecycle_email_bounced'
  | 'lifecycle_email_complained' | 'lifecycle_email_returned' | 'price_alert_email_sent' | 'survey_answered'
  | 'subscription_payment_succeeded';

export function captureServerEvent(userId: string, event: ServerEvent, properties: Record<string, string | number | boolean>) {
  try {
    getClient()?.capture({
      distinctId: userId, event,
      properties: { ...properties, app_environment: isProduction ? 'production' : 'development', app_version: appVersion() },
    });
  } catch { /* Telemetria nunca interrompe o envio. */ }
}

export async function stopProductAnalytics() {
  try { await client?.shutdown(2000); } catch { /* Melhor esforço no desligamento. */ }
}
