import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider, type LogRecordExporter } from '@opentelemetry/sdk-logs';

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
export const requestId = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;

export function formatLog(input: unknown) {
  const log = object(input);
  const level = log.level;
  if (![10, 20, 30, 40, 50, 60].includes(level)) return null;
  const attributes: Record<string, string | number | boolean> = {};
  if (typeof log.event === 'string') attributes['event.name'] = log.event;
  if (typeof log.reqId === 'string') attributes['request.id'] = log.reqId;
  if (typeof log.userId === 'string') attributes['user.id'] = log.userId;
  const req = object(log.req);
  const res = object(log.res);
  if (typeof req.method === 'string') attributes['http.request.method'] = req.method;
  if (typeof log.route === 'string') attributes['http.route'] = log.route;
  if (typeof res.statusCode === 'number') attributes['http.response.status_code'] = res.statusCode;
  if (typeof log.responseTime === 'number') attributes.duration_ms = log.responseTime;
  const err = object(log.err);
  for (const [field, attribute] of Object.entries({ type: 'error.type', code: 'error.code', message: 'exception.message', stack: 'exception.stacktrace' })) {
    if (typeof err[field] === 'string') attributes[attribute] = err[field];
  }
  return {
    // JSON remains parseable while the UI shows a readable, indented record.
    body: JSON.stringify(log, null, 2),
    severityNumber: ({ 10: 1, 20: 5, 30: 9, 40: 13, 50: 17, 60: 21 })[level] as number,
    severityText: ({ 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' })[level] as string,
    attributes,
  };
}

export function createPosthogLogs(env = process.env, production = false, options: { exporter?: LogRecordExporter } = {}) {
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
  });
  const sink = provider.getLogger('casamia.pino');
  let stopped = false;
  return {
    write(line: string) {
      // Nothing in logging may change a request's outcome, including malformed custom logs.
      try {
        if (stopped) return;
        const log = formatLog(JSON.parse(line));
        if (!log) return;
        sink.emit(log);
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
