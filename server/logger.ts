import { AsyncLocalStorage } from 'node:async_hooks';
import dotenv from 'dotenv';
import pino, { type DestinationStream, type Logger } from 'pino';
import { createPosthogLogs } from './posthogLogs.ts';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

export const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const context = new AsyncLocalStorage<{ logger: Logger; userId?: string }>();
let posthogLogs: ReturnType<typeof createPosthogLogs> = null;
try { posthogLogs = createPosthogLogs(process.env, isProduction); } catch { /* A configuration failure must not prevent startup. */ }
export const stopPosthogLogs = async () => { await posthogLogs?.shutdown(); };

// Whitelist error fields: database details, SQL parameters and parser bodies may contain secrets.
export function serializeError(value: unknown) {
  const error = value instanceof Error ? value : new Error('Erro lançado sem instância de Error.');
  const serialized = pino.stdSerializers.err(error);
  return {
    type: serialized.type,
    message: serialized.message,
    stack: serialized.stack,
    code: typeof serialized.code === 'string' ? serialized.code : undefined,
    status: typeof serialized.status === 'number' ? serialized.status : undefined,
  };
}

export function createLogger(destination?: DestinationStream, remote = destination ? null : posthogLogs) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'casamia', environment: isProduction ? 'production' : 'development', pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: serializeError },
    hooks: { streamWrite: line => { try { remote?.write(line); } catch { /* Preserve local logging. */ } return line; } },
    redact: {
      paths: ['password', 'confirmation', 'token', 'secret', 'authorization', 'cookie', 'apiKey', '*.password', '*.token', '*.secret', '*.authorization', '*.cookie', '*.apiKey'],
      censor: '[REDACTED]',
    },
    ...(!destination && (process.env.LOG_FORMAT === 'pretty' || (!isProduction && process.env.LOG_FORMAT !== 'json')) ? {
      transport: { target: 'pino-pretty', options: { colorize: process.stdout.isTTY === true, translateTime: 'SYS:standard', errorLikeObjectKeys: ['err'], ignore: 'pid,hostname' } },
    } : {}),
  }, destination);
}

export const logger = createLogger();
export const getLogger = () => context.getStore()?.logger ?? logger;
export const runWithLogger = (requestLogger: Logger, next: () => void) => context.run({ logger: requestLogger }, next);
export function setLogUser(userId: string) {
  const store = context.getStore();
  if (store) {
    store.userId = userId;
    store.logger = store.logger.child({ userId });
  }
}
export const getLogUserId = () => context.getStore()?.userId;
