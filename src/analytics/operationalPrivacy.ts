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

/** Caminho da API sem query e com ids, tokens e e-mails trocados por `:id` (ex.: /api/invitations/:id). */
export function apiPathTemplate(value: unknown): string | undefined {
  const path = stripUrl(value);
  if (!path) return undefined;
  return path.split('/').map(segment =>
    segment && (/\d|@|%/.test(segment) || segment.length >= 16) ? ':id' : segment).join('/');
}

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
    href: cutQueryAndHash(attr(element, 'href') ?? '') || undefined,
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
      if (isPrimitive(value)) out[key] = typeof value === 'string' && URL_KEY.test(key) ? cutQueryAndHash(value) : value;
      continue;
    }
    if (!OPERATIONAL_ALLOWED.has(key) || !isPrimitive(value)) continue;
    if (key === 'url' || key === 'href') out[key] = stripUrl(value, base);
    else if (key === 'path') out[key] = apiPathTemplate(value);
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
    if (key === 'path') out[key] = apiPathTemplate(value);
    else if (key === 'componentStack') out[key] = typeof value === 'string' ? value.slice(0, 4000) : undefined;
    else if (typeof value === 'string' || typeof value === 'number') out[key] = value;
  }
  return out;
}

/**
 * Lista de permissão para as propriedades de um `$exception` já montado: `$exception_*` do SDK (mensagem e pilha do
 * erro são mantidas), transporte, chaves do SDK, `$initial_*` e o contexto permitido. Valores `$exception_*` podem
 * ser objetos; todo o resto precisa ser primitivo. URLs saem sem query nem hash.
 */
export function allowExceptionProperties(properties: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (key.startsWith('$exception')) { out[key] = value; continue; }
    const allowed = TRANSPORT_KEYS.has(key) || SDK_PROPERTY_KEYS.has(key) || /^\$initial_/.test(key) || ERROR_CONTEXT_ALLOWED.has(key);
    if (!allowed || !isPrimitive(value)) continue;
    if (typeof value === 'string' && URL_KEY.test(key)) out[key] = cutQueryAndHash(value);
    else if (key === 'path') out[key] = apiPathTemplate(value);
    else out[key] = value;
  }
  return out;
}

/** `$set` e `$set_once` de eventos operacionais: só primitivos, URLs sem query nem hash. */
export function cleanPersonProperties(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (!isPrimitive(child) || /referr|search|title|user_agent|utm_|gclid|fbclid|msclkid|ttclid|dclid|host/i.test(key)) continue;
    out[key] = typeof child === 'string' && URL_KEY.test(key) ? cutQueryAndHash(child) : child;
  }
  return out;
}
