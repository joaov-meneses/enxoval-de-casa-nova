import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import pinoHttp, { startTime } from 'pino-http';
import type { Logger } from 'pino';
import { getLogUserId, logger, runWithLogger, serializeError } from './logger.ts';
import { HttpError } from './security.ts';

// Keep the original URL and payloads; serialization happens at completion, after parsers.
const pathname = (req: Request) => req.originalUrl || req.url;
const route = (req: Request) => req.route?.path ? `${req.baseUrl}${req.route.path}` : undefined;
// Asset/module loads (including Animate UI), telemetry and keepalives are routine noise.
// Decide the level again at completion so failures, slow requests and aborts stay visible.
const isRoutineRequest = (req: Request) => {
  const path = pathname(req).split('?')[0];
  return /^\/ingest(?:\/|$)/.test(path)
    || (req.method === 'POST' && path === '/api/auth/activity')
    || (['GET', 'HEAD'].includes(req.method)
      && (path === '/api/health' || !/^\/api(?:\/|$)/.test(path)));
};
const payload = (value: unknown) => Buffer.isBuffer(value)
  ? { encoding: 'base64', byteLength: value.length, data: value.toString('base64') }
  : value;

export function createHttpLogging(baseLogger: Logger = logger): RequestHandler {
  const configuredSlowMs = Number(process.env.LOG_SLOW_REQUEST_MS || 1000);
  const slowMs = Number.isFinite(configuredSlowMs) && configuredSlowMs > 0 ? configuredSlowMs : 1000;
  const httpLogger = pinoHttp<Request, Response>({
    logger: baseLogger,
    wrapSerializers: false,
    quietReqLogger: true,
    quietResLogger: true,
    genReqId: (_req, res) => {
      // Always generated here: client-controlled identifiers are not trustworthy correlation IDs.
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    serializers: {
      req: (req: Request) => ({
        id: req.id, method: req.method, url: pathname(req), path: req.path,
        params: req.res?.locals.logParams ?? req.params, query: req.query, body: payload(req.body),
        headers: req.headers, ip: req.ip, ips: req.ips,
      }),
      res: (res: Response) => ({ statusCode: res.statusCode, headers: res.getHeaders(), body: res.locals.logBody }),
      err: serializeError,
    },
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400 || (res.destroyed && !res.writableFinished) || (Date.now() - res[startTime]) >= slowMs) return 'warn';
      if (err || res.err) return 'error';
      return isRoutineRequest(req) ? 'silent' : 'info';
    },
    customReceivedMessage: req => `Requisição recebida: ${req.method} ${pathname(req)}`,
    customReceivedObject: req => ({ event: 'http.request.started', req }),
    customSuccessMessage: (req, res) => `${!res.writableFinished ? 'Requisição interrompida pelo cliente' : res.statusCode >= 400 ? 'Requisição recusada' : 'Requisição concluída'}: ${req.method} ${pathname(req)} → ${res.statusCode}`,
    customErrorMessage: (req, res) => `Falha na requisição: ${req.method} ${pathname(req)} → ${res.statusCode}`,
    customSuccessObject: (req, res, value) => ({ ...value, req, event: !res.writableFinished ? 'http.request.aborted' : 'http.request.completed', route: route(req), userId: getLogUserId(), slow: value.responseTime >= slowMs }),
    customErrorObject: (req, _res, _err, value) => ({ ...value, req, event: 'http.request.failed', route: route(req), userId: getLogUserId(), slow: value.responseTime >= slowMs }),
  });
  return (req, res, next) => {
    // Observe sends without reading/consuming the request stream or altering the response.
    const send = res.send;
    res.send = function (body) {
      res.locals.logParams = { ...req.params };
      if (/^\/api(?:\/|$)/.test(req.originalUrl || req.url)) {
        res.locals.logBody = payload(body);
        if (typeof body === 'string' && String(res.getHeader('content-type')).includes('application/json')) {
          try { res.locals.logBody = JSON.parse(body); } catch { /* Preserve non-JSON text. */ }
        }
      }
      return send.call(this, body);
    };
    httpLogger(req, res, () => runWithLogger(req.log, next));
  };
}

export const httpErrorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  // Preserve the original error for the single completion log emitted by pino-http.
  res.err = error instanceof Error ? error : Object.assign(new Error(typeof error === 'string' ? error : 'Non-Error value thrown.'), { thrown: error });
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) {
    res.status(error.status).json(error.code ? { error: error.message, code: error.code } : { error: error.message });
    return;
  }
  const parserError = error as { type?: string; status?: number } | null;
  if (parserError?.type === 'entity.parse.failed') {
    // Keep the original parser error for diagnostics and the public response unchanged.
    const publicError = new HttpError(400, 'JSON inválido no corpo da requisição.');
    res.status(400).json({ error: publicError.message });
    return;
  }
  if (parserError?.status === 413) {
    const publicError = new HttpError(413, 'Corpo da requisição excede o limite permitido.');
    res.status(413).json({ error: publicError.message });
    return;
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
};
