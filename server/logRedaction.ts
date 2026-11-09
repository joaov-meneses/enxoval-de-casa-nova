// Redação central dos logs: nada que carregue segredo ou dado pessoal sai do processo.
export const REDACTED = '[redigido]';

// A chave é dividida em segmentos (camelCase, snake_case, kebab-case). É sensível quando o nome inteiro
// está em EXACT_KEYS ou quando o ÚLTIMO segmento (o substantivo principal) está em LAST_SEGMENTS.
// Sem busca por substring: `stripeSessionId`, `documentId`, `inputTokens`, `emailType`, `pixels` e
// `cardinality` continuam visíveis; `userEmail`, `newPassword` e `pixKey` saem.
const LAST_SEGMENTS = new Set([
  'password', 'passwd', 'senha', 'token', 'secret', 'authorization', 'cookie', 'cookies', 'credential', 'credentials',
  'signature', 'jwt', 'otp', 'csrf', 'pix', 'cpf', 'cnpj', 'document', 'card', 'email', 'name', 'nome', 'to', 'from',
  'replyto', 'subject', 'text', 'html', 'message', 'note', 'recado', 'comment', 'cep', 'rua', 'endereco', 'address',
  'bairro', 'cidade', 'location', 'phone', 'telefone', 'celular', 'chave', 'ip', 'ips', 'useragent', 'agent',
]);
const EXACT_KEYS = new Set([
  'apikey', 'pixkey', 'accesstoken', 'refreshtoken', 'xapikey', 'setcookie', 'xforwardedfor', 'xrealip', 'forwardedfor',
  'proxyauthorization', 'birthdate', 'nascimento', 'datanascimento',
]);
// Chaves de erros e campos que ecoam dados de entrada (pg, parsers).
const ERROR_VALUE_FIELDS = new Set(['detail', 'query', 'parameters', 'params', 'body', 'rawbody', 'sql', 'values', 'where']);
const ERROR_KEEP_KEYS = new Set(['message', 'name', 'stack', 'type', 'code']);
const ALWAYS_REMOVED_HEADERS = new Set(['x-forwarded-for', 'x-real-ip', 'forwarded', 'user-agent', 'x-client-ip', 'cf-connecting-ip', 'true-client-ip']);
const REDACTED_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization']);

const segments = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function isSensitiveKey(key: string) {
  const parts = segments(key);
  if (!parts.length) return false;
  const last = parts[parts.length - 1];
  if (last === 'id' || last === 'ids') return false;
  return EXACT_KEYS.has(parts.join('')) || LAST_SEGMENTS.has(last) || LAST_SEGMENTS.has(parts.join(''));
}

const isUrlKey = (key: string) => segments(key).at(-1) === 'url' || segments(key).at(-1) === 'href';
const binary = (bytes: number) => `[binário ${bytes} bytes]`;
const looksLikeError = (value: object) => typeof (value as { stack?: unknown }).stack === 'string';

/** Copia profunda em que toda chave sensível, em qualquer profundidade, vira `[redigido]`. */
export function redactDeep(value: unknown, extraKeys?: Set<string>, depth = 0, seen = new WeakSet<object>(), insideError = false): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return binary(value.length);
  if (ArrayBuffer.isView(value)) return binary(value.byteLength);
  if (value instanceof ArrayBuffer) return binary(value.byteLength);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const asBuffer = value as { type?: unknown; data?: unknown };
  if (asBuffer.type === 'Buffer' && Array.isArray(asBuffer.data)) return binary(asBuffer.data.length);
  if (depth > 12) return '[profundidade excedida]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => redactDeep(item, extraKeys, depth + 1, seen));
    const error = insideError || value instanceof Error || looksLikeError(value);
    const out: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(value)) {
      const item = (value as Record<string, unknown>)[key];
      // `message`, `name` e `type` de um erro são texto do código; `msg` do log não está na lista.
      const keep = error && ERROR_KEEP_KEYS.has(key);
      if (!keep && (isSensitiveKey(key) || extraKeys?.has(key.toLowerCase()))) out[key] = REDACTED;
      else if (typeof item === 'string' && isUrlKey(key)) out[key] = redactUrl(item);
      else out[key] = redactDeep(item, extraKeys, depth + 1, seen, error && (key === 'cause' || key === 'errors'));
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/** Erros: mantém mensagem, pilha, código e causas; redige valores sensíveis e campos que ecoam dados de entrada. */
export function redactError(error: Record<string, any>) {
  const out = redactDeep(error, ERROR_VALUE_FIELDS, 0, new WeakSet(), true) as Record<string, any>;
  // A mensagem do parser de JSON cita um trecho do corpo recebido.
  if (out.type === 'entity.parse.failed' || out.type === 'SyntaxError') {
    const message = INVALID_JSON_MESSAGE;
    out.message = message;
    if (typeof out.stack === 'string') out.stack = out.stack.replace(/^[\s\S]*?(?=\n\s+at )/, `SyntaxError: ${message}`);
  }
  return out;
}
export const INVALID_JSON_MESSAGE = 'JSON inválido no corpo da requisição.';

export function redactHeaders(headers: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const name = key.toLowerCase();
    if (ALWAYS_REMOVED_HEADERS.has(name)) continue;
    if (name === 'referer' || name === 'origin') out[key] = typeof value === 'string' ? stripQueryAndHash(value) : REDACTED;
    else out[key] = REDACTED_HEADERS.has(name) || isSensitiveKey(key) ? REDACTED : value;
  }
  return out;
}

const stripQueryAndHash = (url: string) => url.split('#')[0].split('?')[0];

// O nome de um parâmetro também pode ser dado pessoal (`?maria@x.com`, `?1234567890`).
const looksLikeValue = (name: string) => name.includes('@') || name.length > 24 || /^\d+$/.test(name);

/** Sem query nem hash: no máximo os nomes dos parâmetros (valores redigidos), ou só a contagem se um nome parecer valor. */
export function redactUrl(url: string) {
  const [withoutHash] = url.split('#');
  const [path, ...rest] = withoutHash.split('?');
  const query = rest.join('?');
  if (!query) return path;
  if (/^\[\d+ parâmetros?\]$/.test(query)) return withoutHash; // já redigida
  const names = [...new URLSearchParams(query).keys()];
  if (!names.length) return path;
  if (names.some(looksLikeValue)) return `${path}?[${names.length} parâmetro${names.length > 1 ? 's' : ''}]`;
  return `${path}?${names.map(name => `${encodeURIComponent(name)}=${REDACTED}`).join('&')}`;
}

export function redactQuery(query: unknown) {
  if (!query || typeof query !== 'object') return undefined;
  const names = Object.keys(query);
  if (names.some(looksLikeValue)) return { count: names.length };
  return Object.fromEntries(names.map(key => [key, REDACTED]));
}

/** Metadados de um corpo: nomes das chaves, tipos e tamanho. Nunca os valores. `size` evita serializar de novo quando já se sabe. */
export function describeBody(value: unknown, size?: number) {
  if (value === undefined || value === null) return undefined;
  if (Buffer.isBuffer(value)) return { type: 'buffer', byteLength: value.length };
  if (typeof value === 'string') return { type: 'string', length: value.length, byteLength: size ?? Buffer.byteLength(value) };
  if (typeof value !== 'object') return { type: typeof value };
  // `campo:tipo` em texto, para o nome do campo não ser tratado como chave sensível.
  const keys = Object.entries(value).map(([key, item]) => `${key}:${item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item}`);
  const byteLength = size ?? Buffer.byteLength(JSON.stringify(value) ?? '');
  return { type: Array.isArray(value) ? 'array' : 'object', ...(Array.isArray(value) ? { length: value.length } : { keys }), byteLength };
}
