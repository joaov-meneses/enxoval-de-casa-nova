import { foldText } from '../../src/catalog/normalize.ts';

export interface ShoppingOffer {
  title: string;
  merchant: string;
  url: string;
  priceCents: number;
}

export class SerpApiError extends Error {
  constructor(public readonly code: string) { super(`SerpAPI: ${code}`); }
}

export function isSerpApiConfigured() { return Boolean(process.env.SERPAPI_API_KEY?.trim()); }

async function request(path: string, parameters: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) throw new SerpApiError('not_configured');
  const base = process.env.SERPAPI_BASE_URL?.trim() || 'https://serpapi.com';
  const url = new URL(`${base.replace(/\/$/, '')}/${path}`);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw new SerpApiError('insecure_base_url');
  }
  for (const [name, value] of Object.entries({ ...parameters, api_key: key })) url.searchParams.set(name, value);
  const configuredTimeout = Number(process.env.SERPAPI_TIMEOUT_MS);
  const timeout = Number.isFinite(configuredTimeout) && configuredTimeout >= 50 ? Math.min(configuredTimeout, 60_000) : 20_000;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'error' });
    if (!response.ok) throw new SerpApiError(`http_${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SerpApiError('invalid_response');
    if (data.error) throw new SerpApiError('provider_error');
    return data;
  } catch (error) {
    if (error instanceof SerpApiError) throw error;
    // Nunca propaga URL, chave ou corpo do provedor para logs/monitoramento.
    throw new SerpApiError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'request_failed');
  }
}

/** Esta consulta não consome buscas. Só usa a franquia do plano; não considera créditos extras. */
export async function serpApiSearchesLeft(): Promise<number> {
  const account = await request('account.json');
  const remaining = account.plan_searches_left;
  if (typeof remaining !== 'number' || !Number.isInteger(remaining) || remaining < 0) throw new SerpApiError('invalid_account');
  return remaining;
}

/** Somente preços totais em reais, produtos novos e fontes identificadas. Não segue paginação ou detalhes. */
export function parseShoppingOffers(data: Record<string, unknown>): ShoppingOffer[] {
  if (!Array.isArray(data.shopping_results)) return [];
  const offers: ShoppingOffer[] = [];
  for (const raw of data.shopping_results.slice(0, 100)) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 300 || typeof row.source !== 'string' || !row.source.trim()) continue;
    if (typeof row.extracted_price !== 'number' || !Number.isFinite(row.extracted_price) || row.extracted_price <= 0 || row.extracted_price > 1_000_000) continue;
    if (typeof row.price !== 'string' || !/^\s*R\$/i.test(row.price) || /(?:\d\s*x\b|\/\s*m[eê]s|por\s+m[eê]s)/i.test(row.price)) continue;
    if (row.second_hand_condition && !/^(new|novo|nova)$/i.test(String(row.second_hand_condition))) continue;
    if (/\b(usad[oa]s?|seminov[oa]s?|recondicionad[oa]s?|aluguel|loca[cç][aã]o)\b/.test(foldText(row.title))) continue;
    const rawUrl = row.product_link ?? row.link;
    if (typeof rawUrl !== 'string') continue;
    let url: URL;
    try { url = new URL(rawUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    offers.push({ title: row.title.trim(), merchant: foldText(row.source).slice(0, 120), url: url.href, priceCents: Math.round(row.extracted_price * 100) });
  }
  return offers;
}

export async function searchShoppingPrices(query: string): Promise<ShoppingOffer[]> {
  const data = await request('search.json', { engine: 'google_shopping', q: query, gl: 'br', hl: 'pt', no_cache: 'true' });
  if (data.search_metadata && (data.search_metadata as Record<string, unknown>).status !== 'Success') throw new SerpApiError('search_not_completed');
  return parseShoppingOffers(data);
}
