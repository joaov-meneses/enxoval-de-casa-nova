import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import pinoHttp, { startTime } from 'pino-http';
import type { Logger } from 'pino';
import { getLogUserId, logger, runWithLogger, serializeError } from './logger.ts';
import { HttpError } from './security.ts';

// Query values may contain reset tokens, e-mail addresses or signed URLs.
const pathname = (req: Request) => (req.originalUrl || req.url).split(/[?#]/, 1)[0].replace(/[\r\n\t]/g, '').slice(0, 2048);
const route = (req: Request) => req.route?.path ? `${req.baseUrl}${req.route.path}` : undefined;

export function createHttpLogging(baseLogger: Logger = logger): RequestHandler {
  const configuredSlowMs = Number(process.env.LOG_SLOW_REQUEST_MS || 1000);
  const slowMs = Number.isFinite(configuredSlowMs) && configuredSlowMs > 0 ? configuredSlowMs : 1000;
  const httpLogger = pinoHttp<Request, Response>({
    logger: baseLogger,
    wrapSerializers: false,
    quietReqLogger: true,
    genReqId: (_req, res) => {
      // Always generated here: client-controlled identifiers are not trustworthy correlation IDs.
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    serializers: {
      req: (req: Request) => ({ id: req.id, method: req.method, path: pathname(req), ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 256), contentLength: req.get('content-length') }),
      res: (res: Response) => ({ statusCode: res.statusCode, contentLength: res.getHeader('content-length') }),
      err: serializeError,
    },
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400 || (res.destroyed && !res.writableFinished) || (Date.now() - res[startTime]) >= slowMs) return 'warn';
      return err || res.err ? 'error' : 'info';
    },
    customReceivedMessage: req => `Requisição recebida: ${req.method} ${pathname(req)}`,
    customReceivedObject: req => ({ event: 'http.request.started', req }),
    customSuccessMessage: (req, res) => `${!res.writableFinished ? 'Requisição interrompida pelo cliente' : res.statusCode >= 400 ? 'Requisição recusada' : 'Requisição concluída'}: ${req.method} ${pathname(req)} → ${res.statusCode}`,
    customErrorMessage: (req, res) => `Falha na requisição: ${req.method} ${pathname(req)} → ${res.statusCode}`,
    customSuccessObject: (req, res, value) => ({ ...value, event: !res.writableFinished ? 'http.request.aborted' : 'http.request.completed', route: route(req), userId: getLogUserId(), slow: value.responseTime >= slowMs }),
    customErrorObject: (req, _res, _err, value) => ({ ...value, event: 'http.request.failed', route: route(req), userId: getLogUserId(), slow: value.responseTime >= slowMs }),
  });
  return (req, res, next) => httpLogger(req, res, () => runWithLogger(req.log, next));
}

export const httpErrorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  // Preserve the original error for the single completion log emitted by pino-http.
  res.err = error instanceof Error ? error : new Error('Erro lançado sem instância de Error.');
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) {
    res.status(error.status).json(error.code ? { error: error.message, code: error.code } : { error: error.message });
    return;
  }
  const parserError = error as { type?: string; status?: number } | null;
  if (parserError?.type === 'entity.parse.failed') {
    // SyntaxError messages can quote the submitted body (including passwords).
    res.err = new HttpError(400, 'JSON inválido no corpo da requisição.');
    res.status(400).json({ error: res.err.message });
    return;
  }
  if (parserError?.status === 413) {
    res.err = new HttpError(413, 'Corpo da requisição excede o limite permitido.');
    res.status(413).json({ error: res.err.message });
    return;
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
};
