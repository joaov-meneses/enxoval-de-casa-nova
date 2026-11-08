import { AsyncLocalStorage } from 'node:async_hooks';
import dotenv from 'dotenv';
import pino, { type DestinationStream, type Logger } from 'pino';
import { createPosthogLogs } from './posthogLogs.ts';
import { redactDeep, redactError } from './logRedaction.ts';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

export const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const context = new AsyncLocalStorage<{ logger: Logger; userId?: string }>();
let posthogLogs: ReturnType<typeof createPosthogLogs> = null;
try { posthogLogs = createPosthogLogs(process.env, isProduction); } catch { /* A configuration failure must not prevent startup. */ }
export const stopPosthogLogs = async () => { await posthogLogs?.shutdown(); };

// Mensagem, pilha, código e causas ficam; valores sensíveis e campos que ecoam dados de entrada são redigidos.
export function serializeError(value: unknown) {
  return value instanceof Error ? redactError(pino.stdSerializers.errWithCause(value)) : redactDeep(value) as any;
}

function redactLine(line: string) {
  try { return `${JSON.stringify(redactDeep(JSON.parse(line)))}\n`; } catch { return line; }
}

export function createLogger(destination?: DestinationStream, remote = destination ? null : posthogLogs) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'casamia', environment: isProduction ? 'production' : 'development', pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: serializeError },
    // Toda linha (stdout e PostHog) passa pela redação aqui, então nenhum log manual sai sem ela.
    hooks: { streamWrite: line => { const safe = redactLine(line); try { remote?.write(safe); } catch { /* Preserve local logging. */ } return safe; } },
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
