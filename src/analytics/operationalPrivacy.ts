/**
 * Privacidade dos eventos operacionais `application.*`.
 * Regra: nunca sai do navegador o que a pessoa digitou ou escolheu, nem query string ou hash de URL.
 */

const MAX_TEXT = 80;
const TEXT_ENTRY_TAGS = new Set(['input', 'textarea', 'select', 'option', 'form']);

/** Propriedades operacionais permitidas. O que não está aqui é descartado antes do envio. */
export const OPERATIONAL_ALLOWED = new Set([
  // Ação de interface
  'action', 'tag', 'id', 'name', 'type', 'checked', 'label', 'text', 'href', 'role', 'expanded', 'selected', 'fields', 'trusted',
  // Chamadas da API (sem corpo, cabeçalhos nem resposta)
  'path', 'method', 'http_status', 'duration_ms', 'request_id', 'phase', 'error',
  // Comuns
  'url', 'timestamp',
]);

/** Campos do SDK que o filtro não pode remover (transporte e sessão). */
const SDK_KEYS = new Set(['token', 'distinct_id', 'uuid']);

/** Origin + pathname: sem query, hash nem credenciais. Valor inválido vira undefined. */
export function stripUrl(value: unknown, base = 'http://localhost'): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value, base);
    const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//');
    return isRelative ? url.pathname : `${url.origin}${url.pathname}`;
  } catch { return undefined; }
}

function limit(text: string | null | undefined) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, MAX_TEXT) : undefined;
}

type ControlLike = {
  tagName: string; id?: string; name?: string; type?: string; value?: string; checked?: boolean; textContent?: string | null;
  getAttribute(name: string): string | null;
};

const CHECKABLE = new Set(['checkbox', 'radio']);

/** Descrição de um campo de formulário: nunca inclui o valor digitado, só se foi preenchido. */
export function describeField(field: ControlLike) {
  const type = field.type ?? '';
  return {
    name: field.name || undefined, id: field.id || undefined, type: type || undefined,
    filled: CHECKABLE.has(type) ? Boolean(field.checked) : Boolean(field.value),
    ...(CHECKABLE.has(type) ? { checked: Boolean(field.checked) } : {}),
  };
}

/** Propriedades de `application.ui.action` para um controle, sem valores digitados. */
export function describeControl(element: ControlLike, form?: { querySelectorAll(selector: string): ArrayLike<ControlLike> } | null) {
  const tag = element.tagName.toLowerCase();
  const type = element.type || undefined;
  return {
    tag, id: element.id || undefined, name: element.name || undefined, type,
    ...(type && CHECKABLE.has(type) ? { checked: Boolean(element.checked) } : {}),
    label: element.getAttribute('aria-label') ?? undefined,
    // Texto de botões e links apenas; campos e formulários podem conter texto digitado.
    text: TEXT_ENTRY_TAGS.has(tag) ? undefined : limit(element.textContent),
    href: stripUrl(element.getAttribute('href')),
    role: element.getAttribute('role') ?? undefined,
    expanded: element.getAttribute('aria-expanded') ?? undefined,
    selected: element.getAttribute('aria-selected') ?? undefined,
    fields: form ? Array.from(form.querySelectorAll('input,select,textarea'), describeField) : undefined,
  };
}

function safeError(error: unknown) {
  if (!error || typeof error !== 'object') return typeof error === 'string' ? error.slice(0, 200) : undefined;
  const { name, message, code, stack } = error as Record<string, unknown>;
  const text = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : undefined;
  return { name: text(name, 80), message: text(message, 300), code: text(code, 80), stack: text(stack, 2000) };
}

/** Filtro final dos eventos operacionais: só propriedades permitidas, URLs sem query/hash. */
export function sanitizeOperational(properties: Record<string, unknown>, base?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (SDK_KEYS.has(key) || key.startsWith('$')) { out[key] = value; continue; }
    if (!OPERATIONAL_ALLOWED.has(key) || value === undefined) continue;
    if (key === 'url' || key === 'href' || key === 'path') out[key] = stripUrl(value, base);
    else if (key === 'error') out[key] = safeError(value);
    else if (key === 'fields') {
      out[key] = Array.isArray(value) ? value.map(field => {
        const f = (field ?? {}) as Record<string, unknown>;
        return { name: f.name, id: f.id, type: f.type, filled: Boolean(f.filled), ...(typeof f.checked === 'boolean' ? { checked: f.checked } : {}) };
      }) : undefined;
    } else if (key === 'text' || key === 'label') out[key] = typeof value === 'string' ? limit(value) : undefined;
    else out[key] = value;
  }
  return out;
}
