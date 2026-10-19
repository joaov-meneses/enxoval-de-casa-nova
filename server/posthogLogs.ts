import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider, type LogRecordExporter } from '@opentelemetry/sdk-logs';

// Only names controlled by application code may become log bodies or attributes.
const events = new Set([
  'http.request.completed', 'http.request.failed', 'http.request.aborted',
  'server.starting', 'server.listening', 'server.startup.failed', 'server.listen.failed',
  'database.migrated', 'database.pool.error',
  'billing.account_not_found', 'billing.cancellation_failed', 'billing.price_sync_failed',
  'billing.reconciliation_failed', 'billing.webhook.completed', 'billing.webhook.failed',
  'feedback.notification_failed', 'invitation.configuration_missing', 'invitation.email_failed',
  'password_changed.notification_failed', 'password_reset.configuration_missing', 'password_reset.failed',
  'jev.budget_exhausted', 'jev.request.failed',
  'catalog.refresh.completed', 'catalog.refresh.failed',
  'prices.refresh.completed', 'prices.refresh.failed',
  'trial.notification.failed', 'trial.worker.failed', 'observability.logs.check',
]);
const infoEvents = new Set([
  'server.starting', 'server.listening', 'database.migrated', 'billing.webhook.completed',
  'catalog.refresh.completed', 'prices.refresh.completed', 'observability.logs.check',
]);
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const stripeTypes = new Set([
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
]);
const errorTypes = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'HttpError', 'AbortError', 'TimeoutError', 'DatabaseError']);
const errorCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'EADDRINUSE', '23505', '23503', '57014', '53300', '57P01']);
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
export const requestId = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;

export function sanitizeLog(input: unknown) {
  const log = object(input);
  const event = events.has(log.event) ? log.event as string : undefined;
  const level = log.level;
  if (!event || ![30, 40, 50, 60].includes(level) || (level === 30 && !infoEvents.has(event))) return null;
  const attributes: Record<string, string | number | boolean> = { 'event.name': event };
  const id = requestId(log.reqId);
  if (id) attributes['request.id'] = id;
  const req = object(log.req);
  const res = object(log.res);
  if (methods.has(req.method)) attributes['http.request.method'] = req.method;
  // Express's registered route pattern only. Never fall back to the actual URL/path.
  if (typeof log.route === 'string' && /^\/api(?:\/[A-Za-z0-9_:-]+)*\/?$/.test(log.route) && log.route.length <= 160) {
    attributes['http.route'] = log.route;
  }
  if (Number.isInteger(res.statusCode) && res.statusCode >= 100 && res.statusCode <= 599) attributes['http.response.status_code'] = res.statusCode;
  if (typeof log.responseTime === 'number' && Number.isFinite(log.responseTime) && log.responseTime >= 0) attributes['duration_ms'] = Math.min(log.responseTime, 86_400_000);
  if (typeof log.slow === 'boolean') attributes.slow = log.slow;
  const err = object(log.err);
  if (log.err) attributes['error.type'] = errorTypes.has(err.type) ? err.type : 'Error';
  if (errorCodes.has(err.code)) attributes['error.code'] = err.code;
  if (stripeTypes.has(log.stripeEventType)) attributes['stripe.event.type'] = log.stripeEventType;
  for (const key of ['skipped', 'linked', 'promoted', 'priceRanges', 'urgencies', 'checked', 'updated', 'failed', 'alertsSent']) {
    if (typeof log[key] === 'boolean' && key === 'skipped') attributes[key] = log[key];
    else if (Number.isSafeInteger(log[key]) && log[key] >= 0) attributes[key] = log[key];
  }
  return {
    body: event,
    severityNumber: ({ 30: 9, 40: 13, 50: 17, 60: 21 })[level] as number,
    severityText: ({ 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' })[level] as string,
    attributes,
  };
}

function positive(value: string | undefined, fallback: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

export function createPosthogLogs(env = process.env, production = false, options: { exporter?: LogRecordExporter; now?: () => number } = {}) {
  const key = (env.POSTHOG_KEY || env.VITE_POSTHOG_KEY || '').trim();
  if (!key.startsWith('phc_') || env.POSTHOG_LOGS === 'false' || (!production && env.POSTHOG_ENABLE_DEV !== 'true')) return null;
  const host = new URL(env.POSTHOG_HOST || env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com');
  const exporter = options.exporter ?? new OTLPLogExporter({
    url: new URL('/i/v1/logs', host).href,
    headers: { Authorization: `Bearer ${key}` },
    timeoutMillis: 2000,
  });
  const provider = new LoggerProvider({
    resource: resourceFromAttributes({ 'service.name': 'casamia', 'deployment.environment.name': production ? 'production' : 'development' }),
    processors: [new BatchLogRecordProcessor({ exporter, maxQueueSize: 512, maxExportBatchSize: 50, scheduledDelayMillis: 5000, exportTimeoutMillis: 2000 })],
    logRecordLimits: { attributeCountLimit: 24, attributeValueLengthLimit: 160 },
  });
  const sink = provider.getLogger('casamia.pino');
  const now = options.now ?? Date.now;
  const limit = positive(env.POSTHOG_LOGS_MAX_PER_MINUTE, 600, 6000);
  let window = -1;
  let sent = 0;
  let info = 0;
  let stopped = false;
  return {
    write(line: string) {
      // Nothing in logging may change a request's outcome, including malformed custom logs.
      try {
        if (stopped) return;
        const log = sanitizeLog(JSON.parse(line));
        if (!log) return;
        const current = Math.floor(now() / 60_000);
        if (current !== window) { window = current; sent = 0; info = 0; }
        // Keep most of the budget available for warnings/errors, not successful operations.
        if (sent >= limit || (log.severityNumber === 9 && info >= Math.floor(limit / 5))) return;
        sink.emit(log);
        sent++;
        if (log.severityNumber === 9) info++;
      } catch { /* Best effort; never log exporter payloads or recurse into Pino. */ }
    },
    async flush() { try { await provider.forceFlush({ timeoutMillis: 2000 }); } catch { /* Best effort. */ } },
    async shutdown() {
      stopped = true;
      let timer: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([provider.shutdown(), new Promise<void>(resolve => { timer = setTimeout(resolve, 2500); timer.unref(); })]);
      } catch { /* Best effort. */ }
      finally { clearTimeout(timer!); }
    },
  };
}
