import { safeRoute } from './events';

/**
 * Privacidade dos eventos operacionais `application.*` e das exceções `$exception`.
 * Regra: nunca sai do navegador o que a pessoa digitou ou escolheu, conteúdo de tela, mensagens do servidor,
 * nem query string ou hash de URL. Tudo aqui funciona por lista de permissão e aceita só valores primitivos.
 */

/** Propriedades operacionais permitidas (valores string, number, boolean ou null). */
export const OPERATIONAL_ALLOWED = new Set([
  // Ação de interface: só estrutura, nunca rótulo, texto ou valor.
  'action', 'tag', 'id', 'name', 'type', 'role', 'checked', 'href', 'expanded', 'selected', 'data_analytics', 'trusted',
  // Chamadas da API (sem corpo, cabeçalhos, resposta nem mensagem de erro)
  'path', 'method', 'http_status', 'duration_ms', 'request_id', 'phase',
  // Comuns
  'url', 'timestamp',
]);

/** Chaves `$` do SDK que podem passar. Qualquer outra chave `$` é descartada. */
export const SDK_PROPERTY_KEYS = new Set([
  '$session_id', '$window_id', '$device_id', '$user_id', '$lib', '$lib_version', '$browser', '$browser_version',
  '$os', '$os_version', '$device_type', '$process_person_profile', '$current_url', '$pathname', '$host', '$referrer',
  '$referring_domain', '$insert_id', '$time', '$is_identified', '$sent_at',
]);

/** Campos de transporte do SDK que o filtro não pode remover. */
const TRANSPORT_KEYS = new Set(['token', 'distinct_id', 'uuid']);

/** Chaves cujo valor é uma URL: saem sem query nem hash. */
const URL_KEY = /(?:current_url|_url|referrer|pathname)$/i;

const isPrimitive = (value: unknown): value is string | number | boolean | null =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** Corta query e hash de qualquer texto de URL, sem reinterpretá-lo. */
export function cutQueryAndHash(value: string) {
  return value.split(/[?#]/)[0];
}

/** Origin + pathname: sem query, hash ou credenciais. Valor inválido vira undefined. */
export function stripUrl(value: unknown, base = 'http://localhost'): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value, base);
    const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//');
    return isRelative ? url.pathname : `${url.origin}${url.pathname}`;
  } catch { return undefined; }
}

/**
 * Segmentos de texto livre ou identificador logo após um prefixo conhecido. O slug do Chá e a chave de alias do
 * catálogo vêm de texto digitado e nunca podem sair; os ids são trocados mesmo quando curtos.
 */
const PATH_PARAMS: Array<[RegExp, string]> = [
  [/^\/api\/public\/housewarming\/[^/]+/, '/api/public/housewarming/:slug'],
  [/^\/api\/admin\/catalog\/aliases\/[^/]+/, '/api/admin/catalog/aliases/:key'],
  [/^\/api\/admin\/(bans|users|feedback|catalog\/items)\/[^/]+/, '/api/admin/$1/:id'],
  [/^\/api\/(categories|documents|enxovais|items)\/[^/]+/, '/api/$1/:id'],
  [/^(\/api\/enxovais\/:id\/(?:invitations|members))\/[^/]+/, '$1/:id'],
  [/^(\/api\/items\/:id\/offers)\/[^/]+/, '$1/:id'],
];

/** Caminho da API sem query e com ids, slugs, tokens e e-mails trocados por `:id`, `:slug` ou `:key`. */
export function apiPathTemplate(value: unknown): string | undefined {
  let path = stripUrl(value);
  if (!path) return undefined;
  for (const [pattern, replacement] of PATH_PARAMS) path = path.replace(pattern, replacement);
  return path.split('/').map(segment =>
    segment && !segment.startsWith(':') && (/\d|@|%/.test(segment) || segment.length >= 16) ? ':id' : segment).join('/');
}

/** Rota da tela como modelo (`/cha/:slug`, `/app/:enxoval/...`), igual à do `$pageview`. */
export function routeTemplate(pathname: string): string {
  return pathname.startsWith('/api/') ? (apiPathTemplate(pathname) ?? '/') : safeRoute(cutQueryAndHash(pathname));
}

/** URL de página como origem mais rota-modelo, sem query nem hash. Outros textos só perdem query e hash. */
export function routeUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    try { const url = new URL(value); return `${url.origin}${safeRoute(url.pathname)}`; } catch { return cutQueryAndHash(value); }
  }
  return value.startsWith('/') ? routeTemplate(value) : cutQueryAndHash(value);
}

/** Chave de propriedade que guarda a URL da própria página (vira rota-modelo). */
const PAGE_URL_KEY = /(?:^url|current_url|pathname)$/i;
const cleanUrlValue = (key: string, value: string) => PAGE_URL_KEY.test(key) ? routeUrl(value) : cutQueryAndHash(value);

/** Propriedades de pessoa que nunca saem: origem, termos de busca, identificadores de anúncio. */
const PERSON_BLOCKED = /referr|search|title|user_agent|utm_|gclid|fbclid|msclkid|ttclid|dclid|host/i;

// Mensagens de ApiError que chegam ao SDK por rejeição não tratada: o texto do servidor é trocado pelo fixo.
const apiMessages = new Map<string, string>();
const FIXED_API_MESSAGE = /^ApiError \d+ [A-Z]+ \//;

/** Associa a mensagem mostrada na tela (`ApiError.message`) à mensagem fixa enviada ao analytics. */
export function rememberApiError(message: string, fixed: string) {
  apiMessages.set(message, fixed);
  if (apiMessages.size > 100) apiMessages.delete(apiMessages.keys().next().value as string);
}

const apiErrorValue = (value: unknown) =>
  typeof value === 'string' && FIXED_API_MESSAGE.test(value) ? value : (apiMessages.get(String(value)) ?? 'ApiError');

/** Link sem query nem hash; destinos do próprio app viram rota-modelo (ex.: /cha/:slug). */
const hrefValue = (href: string | undefined) => href ? (href.startsWith('/') && !href.startsWith('//') ? routeTemplate(href) : cutQueryAndHash(href)) || undefined : undefined;

type ControlLike = { tagName: string; getAttribute(name: string): string | null; checked?: unknown; value?: unknown };

const CHECKABLE = new Set(['checkbox', 'radio']);
const attr = (element: ControlLike, name: string) => {
  const value = element.getAttribute(name);
  return typeof value === 'string' && value ? value : undefined;
};

/** Descrição de um campo de formulário: nunca inclui o valor digitado, só se foi preenchido. */
export function describeField(field: ControlLike) {
  const type = attr(field, 'type') ?? (field.tagName.toLowerCase() === 'input' ? 'text' : undefined);
  const checkable = Boolean(type && CHECKABLE.has(type));
  const checked = checkable ? field.checked === true : undefined;
  return {
    name: attr(field, 'name'), id: attr(field, 'id'), type,
    filled: checkable ? Boolean(checked) : typeof field.value === 'string' && field.value.length > 0,
    ...(checkable ? { checked } : {}),
  };
}

/**
 * Propriedades de `application.ui.action` para um controle. Só estrutura: sem valor, rótulo (`aria-label`) nem texto,
 * que carregam dados digitados (e-mail de convite, nome de arquivo, nome de item). Os atributos vêm de `getAttribute`,
 * nunca de propriedades como `form.name`, que podem devolver um elemento.
 */
export function describeControl(element: ControlLike, form?: { querySelectorAll(selector: string): ArrayLike<ControlLike> } | null) {
  const type = attr(element, 'type');
  return {
    tag: element.tagName.toLowerCase(), id: attr(element, 'id'), name: attr(element, 'name'), type,
    ...(type && CHECKABLE.has(type) ? { checked: element.checked === true } : {}),
    data_analytics: attr(element, 'data-analytics'),
    href: hrefValue(attr(element, 'href')),
    role: attr(element, 'role'),
    expanded: attr(element, 'aria-expanded'),
    selected: attr(element, 'aria-selected'),
    fields: form ? Array.from(form.querySelectorAll('input,select,textarea'), describeField) : undefined,
  };
}

function sanitizeFields(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.map(field => {
    const f = (field && typeof field === 'object' ? field : {}) as Record<string, unknown>;
    const pick = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : undefined);
    return { name: pick(f.name), id: pick(f.id), type: pick(f.type), filled: f.filled === true, ...(typeof f.checked === 'boolean' ? { checked: f.checked } : {}) };
  });
}

/** Filtro final dos eventos operacionais: só propriedades permitidas e primitivas, URLs sem query/hash. */
export function sanitizeOperational(properties: Record<string, unknown>, base?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (key === 'error') {
      // Só o tipo e o código: a mensagem e a pilha podem trazer dado pessoal vindo do servidor.
      const { name, code } = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
      if (typeof name === 'string') out.error_name = name.slice(0, 80);
      if (typeof code === 'string') out.error_code = code.slice(0, 80);
      continue;
    }
    if (key === 'fields') { out.fields = sanitizeFields(value); continue; }
    if (TRANSPORT_KEYS.has(key) || SDK_PROPERTY_KEYS.has(key)) {
      if (isPrimitive(value)) out[key] = typeof value === 'string' && URL_KEY.test(key) ? cleanUrlValue(key, value) : value;
      continue;
    }
    if (!OPERATIONAL_ALLOWED.has(key) || !isPrimitive(value)) continue;
    if (key === 'url') out[key] = routeUrl(stripUrl(value, base) ?? '') || undefined;
    else if (key === 'href') out[key] = typeof value === 'string' ? hrefValue(stripUrl(value, base)) : undefined;
    else if (key === 'path') out[key] = typeof value === 'string' ? routeTemplate(value) : undefined;
    else out[key] = value;
  }
  return out;
}

/** Contexto permitido em `$exception`. Nenhum chamador consegue enviar corpo, cabeçalhos ou resposta. */
export const ERROR_CONTEXT_ALLOWED = new Set([
  'path', 'method', 'http_status', 'request_id', 'phase', 'error_source', 'duration_ms', 'componentStack',
]);

export function sanitizeErrorContext(context: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!ERROR_CONTEXT_ALLOWED.has(key) || value === undefined || value === null) continue;
    if (key === 'path') out[key] = typeof value === 'string' ? routeTemplate(value) : undefined;
    else if (key === 'componentStack') out[key] = typeof value === 'string' ? value.slice(0, 4000) : undefined;
    else if (typeof value === 'string' || typeof value === 'number') out[key] = value;
  }
  return out;
}

const text = (value: unknown, max = 300) => (typeof value === 'string' ? value.slice(0, max) : undefined);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Itens de `$exception_list`: só tipo, valor, mecanismo e pilha (frames com arquivo sem query). */
export function cleanExceptionList(list: unknown) {
  if (!Array.isArray(list)) return undefined;
  return list.map(raw => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
    const type = text(item.type, 120);
    const mechanism = item.mechanism && typeof item.mechanism === 'object' ? item.mechanism : null;
    const frames = Array.isArray(item.stacktrace?.frames) ? item.stacktrace.frames : null;
    return {
      type,
      // Erros da API nunca levam o texto do servidor, que pode ter dado pessoal.
      value: type === 'ApiError' ? apiErrorValue(item.value) : text(item.value, 1000),
      ...(mechanism ? { mechanism: { type: text(mechanism.type, 80), handled: typeof mechanism.handled === 'boolean' ? mechanism.handled : undefined, synthetic: typeof mechanism.synthetic === 'boolean' ? mechanism.synthetic : undefined } } : {}),
      ...(frames ? { stacktrace: { type: text(item.stacktrace.type, 40), frames: frames.map((frame: any) => ({
        filename: typeof frame?.filename === 'string' ? cutQueryAndHash(frame.filename).slice(0, 500) : undefined,
        function: text(frame?.function, 200), lineno: num(frame?.lineno), colno: num(frame?.colno),
        in_app: typeof frame?.in_app === 'boolean' ? frame.in_app : undefined, platform: text(frame?.platform, 40), chunk_id: text(frame?.chunk_id, 80),
      })) } } : {}),
    };
  });
}

/**
 * Lista de permissão para as propriedades de um `$exception` já montado. Das chaves `$exception_*` só passam as que o
 * SDK gera e são seguras (`$exception_list`, `_level`, `_fingerprint`, `_types`); `$exception_values`, `_steps` e
 * `_message` levam texto livre e saem. O resto é transporte, chaves do SDK, `$initial_*` (com o filtro das propriedades
 * de pessoa) e o contexto permitido, sempre primitivos. URLs saem sem query nem hash.
 */
export function allowExceptionProperties(properties: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (key === '$exception_list') { out[key] = cleanExceptionList(value); continue; }
    if (key === '$exception_types') { if (Array.isArray(value)) out[key] = value.map(v => text(v, 120)).filter(Boolean); continue; }
    if (key === '$exception_level' || key === '$exception_fingerprint') { if (isPrimitive(value)) out[key] = value; continue; }
    const initial = /^\$initial_/.test(key);
    const allowed = TRANSPORT_KEYS.has(key) || SDK_PROPERTY_KEYS.has(key) || initial || ERROR_CONTEXT_ALLOWED.has(key);
    if (!allowed || !isPrimitive(value) || (initial && PERSON_BLOCKED.test(key))) continue;
    if (key === 'path') out[key] = typeof value === 'string' ? routeTemplate(value) : undefined;
    else out[key] = typeof value === 'string' && URL_KEY.test(key) ? cleanUrlValue(key, value) : value;
  }
  return out;
}

/** `$set` e `$set_once` de eventos operacionais: só primitivos, URLs sem query nem hash. */
export function cleanPersonProperties(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (!isPrimitive(child) || PERSON_BLOCKED.test(key)) continue;
    out[key] = typeof child === 'string' && URL_KEY.test(key) ? cleanUrlValue(key, child) : child;
  }
  return out;
}
