import { getLogger } from '../logger.ts';
/**
 * Cache compartilhado entre instâncias (L3 da Fase 6), num Redis opcional.
 *
 * Só existe com `REDIS_URL`. Sem ele, ou com o Redis fora do ar, cada função devolve "não sei" (null/false) na hora e
 * quem chama segue com o que já tinha por processo: o cache em memória do Jev, o teto diário por processo e o índice do
 * catálogo que vence sozinho. Nada aqui pode travar ou derrubar uma requisição: comandos não esperam reconexão
 * (`disableOfflineQueue`) e erros viram avisos estruturados completos no log.
 *
 * Usos: respostas do Jev (para outra instância não pagar a mesma pergunta), o teto diário de chamadas ao Jev (somado
 * entre instâncias) e o aviso de "o catálogo mudou" (para cada instância descartar o índice em memória na hora).
 */
import { createClient } from 'redis';

type Client = ReturnType<typeof build>;

/** Prefixo de todas as chaves e canais (`REDIS_KEY_PREFIX`), para dividir um Redis entre ambientes ou testes. */
const prefix = () => process.env.REDIS_KEY_PREFIX?.trim() || 'casamia:';
let client: Client | null = null;
let subscriber: Client | null = null;
let connecting: Promise<Client | null> | null = null;
let lastFailure = 0;
const RETRY_AFTER_FAILURE_MS = 30_000;
const handlers = new Map<string, Set<(message: string) => void>>();

function warn(message: string, err?: unknown) {
  getLogger().warn({ event: 'cache.operation.failed', err }, message);
}

export function isSharedCacheConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}

const CONNECT_TIMEOUT_MS = 2_000;

function build(url: string) {
  let connectedOnce = false;
  const created = createClient({
    url,
    // Comando com o Redis desconectado falha na hora, em vez de esperar numa fila.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      // Depois de já ter funcionado, tenta de novo com espera crescente (até 30 s) e o app segue sem o Redis enquanto
      // isso. Na primeira conexão, desiste: senão o `connect()` ficaria tentando para sempre.
      reconnectStrategy: (retries, cause) =>
        connectedOnce ? Math.min(30_000, 250 * 2 ** Math.min(retries, 7)) : cause
    }
  });
  created.on('ready', () => {
    connectedOnce = true;
  });
  created.on('error', err => warn('Redis indisponível; seguindo com o cache de cada processo.', err));
  return created;
}

/** Promessa que desiste depois de `ms`: nenhuma requisição espera o Redis mais que isso. */
function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis não respondeu em ${ms} ms.`)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Conecta na primeira vez que alguém precisa; devolve null sem Redis configurado ou se a conexão falhar. */
async function getClient(): Promise<Client | null> {
  if (client?.isReady) return client;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (client) return null; // conectado antes, reconectando agora: não espera.
  // Falhou há pouco: não tenta de novo a cada requisição (cada tentativa pode levar até 2 s).
  if (Date.now() - lastFailure < RETRY_AFTER_FAILURE_MS) return null;
  connecting ??= (async () => {
    const created = build(url);
    try {
      await withTimeout(created.connect(), CONNECT_TIMEOUT_MS + 500);
      // A conexão não segura o processo vivo: scripts e testes terminam sozinhos, como sem Redis.
      created.unref();
      client = created;
      return created;
    } catch (err) {
      warn('Não foi possível conectar ao Redis.', err);
      lastFailure = Date.now();
      created.destroy();
      return null;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

export async function sharedGet(key: string): Promise<string | null> {
  const redis = await getClient();
  if (!redis) return null;
  try {
    const value = await redis.get(prefix() + key);
    getLogger().info({ event: 'cache.get.completed', key, value, hit: value !== null }, 'Shared cache read.');
    return typeof value === 'string' ? value : null;
  } catch (err) {
    warn('Leitura no Redis falhou.', err);
    return null;
  }
}

export async function sharedSet(key: string, value: string, ttlSeconds: number) {
  const redis = await getClient();
  if (!redis) return false;
  try {
    await redis.set(prefix() + key, value, { EX: ttlSeconds });
    getLogger().info({ event: 'cache.set.completed', key, value, ttlSeconds }, 'Shared cache write.');
    return true;
  } catch (err) {
    warn('Gravação no Redis falhou.', err);
    return false;
  }
}

/** Soma 1 a um contador que vence sozinho. Devolve o valor novo, ou null sem Redis (quem chama conta por processo). */
export async function sharedIncrement(key: string, ttlSeconds: number): Promise<number | null> {
  const redis = await getClient();
  if (!redis) return null;
  try {
    const value = await redis.incr(prefix() + key);
    if (value === 1) await redis.expire(prefix() + key, ttlSeconds);
    getLogger().info({ event: 'cache.increment.completed', key, value, ttlSeconds }, 'Shared counter updated.');
    return value;
  } catch (err) {
    warn('Contador no Redis falhou.', err);
    return null;
  }
}

/** Avisa as outras instâncias. Sem Redis, não há outras instâncias para avisar (ou elas descobrem pelo prazo). */
export async function publish(channel: string, message: string) {
  const redis = await getClient();
  if (!redis) return;
  try {
    await redis.publish(prefix() + channel, message);
    getLogger().info({ event: 'cache.publish.completed', channel, message }, 'Shared cache notification published.');
  } catch (err) {
    warn('Aviso pelo Redis falhou.', err);
  }
}

/** Escuta um canal. A assinatura é feita uma vez por canal, numa conexão própria (exigência do Redis). */
export async function subscribe(channel: string, handler: (message: string) => void) {
  const set = handlers.get(channel) ?? new Set();
  const first = set.size === 0;
  set.add(handler);
  handlers.set(channel, set);
  if (!first) return;
  const redis = await getClient();
  if (!redis) return;
  try {
    subscriber ??= redis.duplicate();
    if (!subscriber.isOpen) {
      subscriber.on('error', err => warn('Assinatura do Redis caiu; seguindo sem avisos entre instâncias.', err));
      await subscriber.connect();
      subscriber.unref();
    }
    await subscriber.subscribe(prefix() + channel, message => {
      for (const listener of handlers.get(channel) ?? []) listener(message);
    });
  } catch (err) {
    warn('Não foi possível assinar o canal no Redis.', err);
  }
}

/** Fecha as conexões (testes e scripts que terminam). */
export async function closeSharedCache() {
  const open = [client, subscriber].filter((entry): entry is Client => Boolean(entry?.isOpen));
  client = null;
  subscriber = null;
  lastFailure = 0;
  handlers.clear();
  await Promise.all(open.map(entry => entry.quit().catch(() => entry.destroy())));
}
