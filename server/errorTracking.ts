import { PostHog } from 'posthog-node';
import type { ErrorRequestHandler } from 'express';
import { exceptionProperties } from '../shared/errorTracking.ts';
import { isProduction, serializeError } from './logger.ts';
import { requestId } from './posthogLogs.ts';
import { appVersion } from './version.ts';

export function createErrorTracking(env = process.env, production = isProduction) {
  const key = (env.POSTHOG_KEY || env.VITE_POSTHOG_KEY || '').trim();
  if (!key || env.POSTHOG_ERROR_TRACKING === 'false' || (!production && env.POSTHOG_ENABLE_DEV !== 'true')) return null;
  const client = new PostHog(key, {
    host: env.POSTHOG_HOST || env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    enableExceptionAutocapture: true,
    disableGeoip: true,
    // A versão (commit publicado) em toda exceção permite alertar por versão: "quebrou no deploy X".
    before_send: event => event.event === '$exception'
      ? { ...event, properties: { ...exceptionProperties(event.properties), app_version: appVersion(env) } }
      : null,
  });
  // Transport failures must not become application failures or log event payloads.
  client.on('error', () => {});
  return client;
}

let client: ReturnType<typeof createErrorTracking>;
export function startErrorTracking() {
  try { client = createErrorTracking(); } catch { client = null; }
}
export async function stopErrorTracking() {
  try { await client?.shutdown(2000); } catch { /* Best effort on shutdown. */ }
}

export function errorTrackingHandler(sink: Pick<PostHog, 'captureException'> | null): ErrorRequestHandler {
  return (error, req, _res, next) => {
    const id = requestId(req.id);
    try {
      sink?.captureException(error, undefined, {
        ...(id ? { request_id: id } : {}),
        method: req.method, url: req.originalUrl || req.url,
        params: req.params, query: req.query, body: req.body, headers: req.headers,
        original_error: serializeError(error),
      });
    } catch { /* Telemetry never changes the response. */ }
    next(error);
  };
}

/** Falhas fora de uma requisição (rotinas agendadas), agrupadas pelo `kind` e pela rotina. */
export function captureOperationalException(error: unknown, properties: Record<string, string>) {
  try {
    client?.captureException(error, undefined, {
      ...properties,
      $exception_fingerprint: `${properties.kind ?? 'operational'}:${properties.job ?? ''}`,
      original_error: serializeError(error),
    });
  } catch { /* Telemetry never interrupts the job. */ }
}

export const captureServerError: ErrorRequestHandler = (error, req, res, next) => errorTrackingHandler(client)(error, req, res, next);
