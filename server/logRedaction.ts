// Redação central dos logs: nada que carregue segredo ou dado pessoal sai do processo.
export const REDACTED = '[redigido]';

// Fragmentos (comparados na chave normalizada: minúscula, sem separadores).
const SENSITIVE_KEY = /password|passwd|senha|token|secret|authorization|cookie|apikey|signature|credential|session|pix|cpf|cnpj|document|card|email|phone|telefone|celular|address|endereco|birth|nascimento|jwt|otp|csrf/;
const ALWAYS_REDACTED_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization']);
// Campos de erro (pg, parsers) que trazem valores do usuário, mesmo sem nome sensível.
const ERROR_VALUE_FIELDS = new Set(['detail', 'query', 'parameters', 'params', 'body', 'rawbody', 'sql', 'values', 'where']);

export const isSensitiveKey = (key: string) => SENSITIVE_KEY.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));

/** Copia profunda em que toda chave sensível, em qualquer profundidade, vira `[redigido]`. */
export function redactDeep(value: unknown, extraKeys?: Set<string>, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return REDACTED;
  if (depth > 12 || seen.has(value)) return '[profundidade excedida]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => redactDeep(item, extraKeys, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const item = (value as Record<string, unknown>)[key];
    out[key] = isSensitiveKey(key) || extraKeys?.has(key.toLowerCase()) ? REDACTED : redactDeep(item, extraKeys, depth + 1, seen);
  }
  return out;
}

/** Erros: mantém mensagem, pilha, código e causas; redige valores sensíveis e campos que ecoam dados de entrada. */
export function redactError(error: Record<string, any>) {
  const out = redactDeep(error, ERROR_VALUE_FIELDS) as Record<string, any>;
  // A mensagem do parser de JSON cita um trecho do corpo recebido.
  if (out.type === 'entity.parse.failed' || out.type === 'SyntaxError') {
    const message = 'JSON inválido no corpo da requisição.';
    out.message = message;
    if (typeof out.stack === 'string') out.stack = out.stack.replace(/^[\s\S]*?(?=\n\s+at )/, `SyntaxError: ${message}`);
  }
  return out;
}

export const redactHeaders = (headers: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) =>
  [key, ALWAYS_REDACTED_HEADERS.has(key.toLowerCase()) || isSensitiveKey(key) ? REDACTED : value]));

/** Mantém só os nomes dos parâmetros de query; os valores são sempre redigidos. */
export function redactUrl(url: string) {
  const [path, query] = url.split('?', 2);
  if (query === undefined) return path;
  const names = [...new URLSearchParams(query).keys()];
  return names.length ? `${path}?${names.map(name => `${encodeURIComponent(name)}=${REDACTED}`).join('&')}` : path;
}

export const redactQuery = (query: unknown) => query && typeof query === 'object'
  ? Object.fromEntries(Object.keys(query).map(key => [key, REDACTED]))
  : undefined;

/** Metadados de um corpo: nomes das chaves, tipos e tamanho. Nunca os valores. */
export function describeBody(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (Buffer.isBuffer(value)) return { type: 'buffer', byteLength: value.length };
  if (typeof value === 'string') return { type: 'string', length: value.length };
  if (typeof value !== 'object') return { type: typeof value };
  const keys: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) keys[key] = item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item;
  return { type: Array.isArray(value) ? 'array' : 'object', ...(Array.isArray(value) ? { length: value.length } : { keys }), byteLength: Buffer.byteLength(JSON.stringify(value) ?? '') };
}
