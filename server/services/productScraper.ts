import { getLogger } from '../logger.ts';
// Lê o link de um produto de loja online e devolve nome, foto, preço e variações.
//
// Como a página é obtida (para na primeira camada que funcionar):
//   1. API do Mercado Livre (com as credenciais do aplicativo, quando configuradas);
//   2. leitura direta imitando o Chrome (TLS, HTTP/2 e cabeçalhos de navegador, via `impit`), sem JavaScript;
//   3. desbloqueador pago (ZenRows ou ScraperAPI: navegador real + proxy residencial), só se SCRAPER_API_KEY existir
//      e só quando a camada 2 foi barrada ou voltou sem preço;
//   4. o nome tirado do próprio link, para o formulário não ficar vazio (resultado `partial`).
// Do HTML, os dados saem em cascata: JSON-LD (schema.org) -> OpenGraph/meta tags -> heurísticas.
// O acesso à rede passa por `assertPublicHost`/`safeGet`, que só conectam em endereços públicos (proteção contra SSRF).
import { lookup as dnsLookup } from 'node:dns';
import { lookup as dnsLookupAll } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import zlib from 'node:zlib';
import * as cheerio from 'cheerio';
import type { ScrapedProductPreview } from '../../src/types.ts';

export type { ScrapedProductPreview };

export type ScrapeErrorCode = 'invalid_url' | 'blocked' | 'not_found' | 'timeout' | 'no_data' | 'failed';

export class ScrapeError extends Error {
  constructor(public code: ScrapeErrorCode, message: string) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 200;

type Voltage = NonNullable<NonNullable<ScrapedProductPreview['variations']>['voltage']>[number];

// ---------------------------------------------------------------------------------------------
// URL: normalização e validação
// ---------------------------------------------------------------------------------------------

const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|gbraid|wbraid|msclkid|igshid|mc_cid|mc_eid|ref|ref_|tag|spm|pd_rd_.*|pf_rd_.*|matt_.*)$/i;

/** Endereço canônico do produto: sem fragmento nem parâmetros de rastreio, para o mesmo produto ter sempre a mesma chave. */
export function normalizeProductUrl(raw: string): string {
  const text = raw.trim();
  if (!text || text.length > MAX_URL_LENGTH) throw new ScrapeError('invalid_url', 'O link informado é inválido.');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ScrapeError('invalid_url', 'O link informado é inválido.');
  }
  assertAllowedUrl(url);
  url.hash = '';
  const kept = [...url.searchParams.entries()].filter(([key]) => !TRACKING_PARAMS.test(key));
  kept.sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);
  return url.href;
}

export function domainOf(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

const BLOCKED_ADDRESSES = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
] as const) BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv6');

/** Endereço que não é de um servidor público (rede local, loopback, link-local, reservado...). */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return BLOCKED_ADDRESSES.check(address, 'ipv4');
  if (version !== 6) return true;
  const mapped = address.toLowerCase().match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (mapped) {
    if (mapped[1]) return isBlockedAddress(mapped[1]);
    const high = parseInt(mapped[2], 16);
    const low = parseInt(mapped[3], 16);
    return isBlockedAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return BLOCKED_ADDRESSES.check(address, 'ipv6');
}

/** Barra o que não é uma página pública da web: outros protocolos, credenciais na URL, portas incomuns e hosts locais. */
export function assertAllowedUrl(url: URL) {
  const invalid = () => new ScrapeError('invalid_url', 'O link informado não pode ser lido. Use o endereço de um produto de uma loja online.');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid();
  if (url.username || url.password) throw invalid();
  if (url.port && url.port !== '80' && url.port !== '443') throw invalid();
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) throw invalid();
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw invalid();
    return;
  }
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) throw invalid();
}

// ---------------------------------------------------------------------------------------------
// Rede: GET seguro com validação do IP no momento da conexão, redirecionamentos manuais e limite de tamanho
// ---------------------------------------------------------------------------------------------

// Valida o IP que será de fato usado na conexão (e não só o nome), o que fecha a brecha de DNS rebinding.
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 4);
      return;
    }
    const allowed = addresses.filter(entry => !isBlockedAddress(entry.address));
    if (!allowed.length) {
      callback(new ScrapeError('invalid_url', 'O endereço do link não é público.') as unknown as NodeJS.ErrnoException, '', 4);
      return;
    }
    if (options.all) callback(null, allowed);
    else callback(null, allowed[0].address, allowed[0].family);
  });
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Upgrade-Insecure-Requests': '1',
};

interface RawResponse {
  status: number;
  headers: { location?: string };
  body: string;
  url: URL;
}

function decodeBody(buffer: Buffer, contentType: string | undefined) {
  const charset = contentType?.match(/charset=["']?([\w-]+)/i)?.[1]
    ?? buffer.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
    ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

interface RequestInit {
  accept?: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function requestOnce(url: URL, init: RequestInit = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      action();
    };
    const request = lib.request(url, {
      method: init.method ?? 'GET',
      headers: {
        ...BROWSER_HEADERS,
        ...(init.accept ? { Accept: init.accept } : {}),
        ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(Buffer.byteLength(init.body)) } : {}),
        ...init.headers,
      },
      lookup: safeLookup,
      agent: false,
    }, response => {
      const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
      const stream = encoding === 'gzip' || encoding === 'x-gzip' ? response.pipe(zlib.createGunzip())
        : encoding === 'deflate' ? response.pipe(zlib.createInflate())
          : encoding === 'br' ? response.pipe(zlib.createBrotliDecompress())
            : response;
      const chunks: Buffer[] = [];
      let size = 0;
      const done = () => finish(() => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: decodeBody(Buffer.concat(chunks), response.headers['content-type']),
        url,
      }));
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        size += chunk.length;
        // Páginas gigantes: o que interessa (cabeçalho e dados do produto) vem primeiro.
        if (size >= MAX_BODY_BYTES) {
          request.destroy();
          done();
        }
      });
      stream.on('end', done);
      const fail = () => finish(() => reject(new ScrapeError('failed', 'Não foi possível ler a resposta da loja.')));
      response.on('error', fail);
      stream.on('error', fail);
    });
    const deadline = setTimeout(() => {
      request.destroy();
      finish(() => reject(new ScrapeError('timeout', 'A loja demorou demais para responder.')));
    }, init.timeoutMs ?? REQUEST_TIMEOUT_MS);
    request.on('error', error => finish(() => {
      reject(error instanceof ScrapeError || (error as { cause?: unknown }).cause instanceof ScrapeError
        ? new ScrapeError('invalid_url', 'O endereço do link não é público.')
        : new ScrapeError('failed', 'Não foi possível acessar a loja.'));
    }));
    request.end(init.body);
  });
}

/** GET que segue redirecionamentos validando cada destino. */
async function safeGet(start: URL, init: RequestInit = {}): Promise<RawResponse> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertAllowedUrl(current);
    const response = await requestOnce(current, init);
    const location = response.headers.location;
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      try {
        current = new URL(location, current);
      } catch {
        throw new ScrapeError('failed', 'A loja redirecionou para um endereço inválido.');
      }
      continue;
    }
    return response;
  }
  throw new ScrapeError('failed', 'A loja redirecionou o link vezes demais.');
}

// ---------------------------------------------------------------------------------------------
// Camada 2: leitura direta imitando o Chrome. Muitas lojas barram o cliente HTTP do Node só pela "impressão
// digital" do TLS/HTTP2; o `impit` reproduz a do Chrome. Continua sem executar JavaScript.
// ---------------------------------------------------------------------------------------------

type ChromeResponse = {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
};
type ChromeClient = { fetch(url: string, init?: { signal?: AbortSignal }): Promise<ChromeResponse> };

let chromeClient: Promise<ChromeClient | null> | undefined;

/** `null` quando o módulo nativo não carrega neste sistema: aí a leitura cai para o cliente HTTP do Node. */
function getChromeClient() {
  chromeClient ??= import('impit')
    .then(module => {
      const Impit = (module as { Impit?: unknown }).Impit ?? (module as { default?: { Impit?: unknown } }).default?.Impit;
      if (typeof Impit !== 'function') return null;
      return new (Impit as new (options: object) => ChromeClient)({
        browser: 'chrome',
        // Os redirecionamentos são seguidos à mão, validando cada destino.
        followRedirects: false,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'Accept-Language': BROWSER_HEADERS['Accept-Language'] },
      });
    })
    .catch(() => null);
  return chromeClient;
}

/**
 * Confere, antes de cada requisição do `impit`, que o nome resolve só para endereços públicos. Diferente do
 * `safeLookup`, isso não prende o IP usado na conexão; por isso o endereço é conferido a cada redirecionamento.
 */
async function assertPublicHost(url: URL) {
  assertAllowedUrl(url);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  let addresses: { address: string }[];
  try {
    addresses = await dnsLookupAll(host, { all: true });
  } catch {
    throw new ScrapeError('failed', 'Não foi possível acessar a loja.');
  }
  if (!addresses.length || addresses.some(entry => isBlockedAddress(entry.address))) {
    throw new ScrapeError('invalid_url', 'O endereço do link não é público.');
  }
}

async function readCapped(body: ReadableStream<Uint8Array> | null): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    size += value.length;
    if (size >= MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return Buffer.concat(chunks);
}

/** GET imitando o Chrome. `null` quando o `impit` não está disponível. */
async function chromeGet(start: URL): Promise<RawResponse | null> {
  const client = await getChromeClient();
  if (!client) return null;
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(current);
    let response: ChromeResponse;
    let buffer: Buffer;
    try {
      response = await client.fetch(current.href, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS + 3_000) });
      buffer = await readCapped(response.body);
    } catch (error) {
      const timedOut = /timeout|timed out|abort/i.test(`${(error as Error)?.name} ${(error as Error)?.message}`);
      throw timedOut
        ? new ScrapeError('timeout', 'A loja demorou demais para responder.')
        : new ScrapeError('failed', 'Não foi possível acessar a loja.');
    }
    const location = response.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      try {
        current = new URL(location, current);
      } catch {
        throw new ScrapeError('failed', 'A loja redirecionou para um endereço inválido.');
      }
      continue;
    }
    return {
      status: response.status,
      headers: {},
      body: decodeBody(buffer, response.headers.get('content-type') ?? undefined),
      url: current,
    };
  }
  throw new ScrapeError('failed', 'A loja redirecionou o link vezes demais.');
}

/** Leitura direta: Chrome imitado e, se ele não estiver disponível ou falhar na rede, o cliente do Node. */
async function fetchPage(start: URL): Promise<RawResponse> {
  try {
    const response = await chromeGet(start);
    if (response) return response;
  } catch (error) {
    getLogger().warn({ event: 'scraper.read.failed', err: error }, 'Scraper read attempt failed.');
    if (error instanceof ScrapeError && error.code === 'invalid_url') throw error;
  }
  return safeGet(start);
}

// ---------------------------------------------------------------------------------------------
// Camada 3: desbloqueador pago (navegador real + proxy residencial, com captcha resolvido por eles).
// Opcional: sem SCRAPER_API_KEY nada muda. Só é chamado quando a leitura direta falhou, e há um teto diário.
// ---------------------------------------------------------------------------------------------

const UNLOCKER_TIMEOUT_MS = 60_000;
const DEFAULT_UNLOCKER_DAILY_LIMIT = 200;

const UNLOCKERS = {
  zenrows: { endpoint: 'https://api.zenrows.com/v1/', keyParam: 'apikey', defaults: { js_render: 'true', premium_proxy: 'true', proxy_country: 'br' } },
  scraperapi: { endpoint: 'https://api.scraperapi.com/', keyParam: 'api_key', defaults: { render: 'true', premium: 'true', country_code: 'br' } },
} as const;

type UnlockerName = keyof typeof UNLOCKERS;

function unlockerSettings(): { name: UnlockerName; key: string } | null {
  const key = process.env.SCRAPER_API_KEY?.trim();
  if (!key) return null;
  const name = (process.env.SCRAPER_API_PROVIDER?.trim().toLowerCase() || 'zenrows') as UnlockerName;
  return name in UNLOCKERS ? { name, key } : null;
}

/**
 * Endereço da chamada ao desbloqueador. SCRAPER_API_PARAMS (ex.: "premium=false") ajusta ou troca os parâmetros
 * padrão, útil para economizar créditos ou usar um modo mais forte.
 */
export function buildUnlockerUrl(name: UnlockerName, key: string, target: string, extra = ''): URL {
  const provider = UNLOCKERS[name];
  const url = new URL(provider.endpoint);
  url.searchParams.set(provider.keyParam, key);
  url.searchParams.set('url', target);
  for (const [param, value] of Object.entries(provider.defaults)) url.searchParams.set(param, value);
  for (const [param, value] of new URLSearchParams(extra)) {
    if (param !== provider.keyParam && param !== 'url') url.searchParams.set(param, value);
  }
  return url;
}

const unlockerUsage = { day: '', count: 0 };

/** Reserva uma chamada paga do dia. `false` quando o teto diário (SCRAPER_API_DAILY_LIMIT) foi atingido. */
function takeUnlockerBudget(): boolean {
  const parsed = Number(process.env.SCRAPER_API_DAILY_LIMIT);
  const limit = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_UNLOCKER_DAILY_LIMIT;
  const today = new Date().toISOString().slice(0, 10);
  if (unlockerUsage.day !== today) {
    unlockerUsage.day = today;
    unlockerUsage.count = 0;
  }
  if (unlockerUsage.count >= limit) return false;
  unlockerUsage.count += 1;
  return true;
}

async function fetchViaUnlocker(target: URL): Promise<RawResponse | null> {
  const settings = unlockerSettings();
  if (!settings) return null;
  assertAllowedUrl(target);
  if (!takeUnlockerBudget()) {
    getLogger().warn({ event: 'scraper.budget_exhausted', url: target.href, provider: settings.name }, 'Scraper daily budget exhausted.');
    return null;
  }
  const response = await safeGet(buildUnlockerUrl(settings.name, settings.key, target.href, process.env.SCRAPER_API_PARAMS), {
    accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    timeoutMs: UNLOCKER_TIMEOUT_MS,
  });
  if (response.status !== 200) {

    getLogger().warn({ event: 'scraper.provider.failed', provider: settings.name, url: target.href, status: response.status, body: response.body }, 'Scraper provider failed.');
    if (response.status === 404 || response.status === 410) return { ...response, url: target };
    return null;
  }
  return { ...response, url: target };
}

// ---------------------------------------------------------------------------------------------
// Valores: preço, título, voltagem, ambiente
// ---------------------------------------------------------------------------------------------

const MAX_PRICE_CENTS = 1_000_000_000;

/** Converte "R$ 1.899,00", "1899.00", 1899.9 ... em centavos. `null` quando não é um preço válido. */
export function parsePriceToCents(value: unknown): number | null {
  let amount: number;
  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string') {
    const match = value.replace(/ /g, ' ').match(/\d[\d.,]*/);
    if (!match) return null;
    let text = match[0].replace(/[.,]$/, '');
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      const decimal = lastComma > lastDot ? ',' : '.';
      const thousands = decimal === ',' ? '.' : ',';
      text = text.split(thousands).join('').replace(decimal, '.');
    } else if (lastComma >= 0) {
      text = /,\d{1,2}$/.test(text) && text.indexOf(',') === lastComma ? text.replace(',', '.') : text.split(',').join('');
    } else if (lastDot >= 0) {
      // "1.899" e "1.899.000" são milhares; "1899.00" e "18.99" são decimais.
      const thousands = text.split('.').length > 2 || /\.\d{3}$/.test(text);
      if (thousands) text = text.split('.').join('');
    }
    amount = Number(text);
  } else {
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return cents > 0 && cents <= MAX_PRICE_CENTS ? cents : null;
}

const STORE_SUFFIX = /\s*[|\-–—:]\s*(mercado\s?livre|amazon(\.com\.br)?|magazine\s?luiza|magalu|shopee(\s?brasil)?|americanas|casas\s?bahia|kabum!?|submarino|carrefour|leroy\s?merlin|fast\s?shop|ponto|shoptime|extra|aliexpress)\b.*$/i;
const STORE_PREFIX = /^\s*(amazon(\.com\.br)?|mercado\s?livre|magazine\s?luiza|magalu)\s*[:|\-–—]\s*/i;

/** Tira o nome da loja e o excesso de espaços do título da página. */
export function cleanTitle(raw: string, domain?: string): string {
  let title = raw.replace(/\s+/g, ' ').trim().replace(STORE_PREFIX, '').replace(STORE_SUFFIX, '').trim();
  const brand = domain?.split('.').find(label => label.length > 2 && label !== 'com');
  if (brand) {
    const parts = title.split(/\s+[|–—]\s+/);
    const last = parts.at(-1) ?? '';
    if (parts.length > 1 && last.length <= 30 && last.toLowerCase().replace(/\W/g, '').includes(brand.toLowerCase())) {
      title = parts.slice(0, -1).join(' | ').trim();
    }
  }
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : title;
}

const VOLTAGES: Voltage[] = ['110V', '127V', '220V', 'Bivolt'];

export function findVoltages(text: string): Voltage[] {
  const found = new Set<Voltage>();
  if (/bivolt/i.test(text)) found.add('Bivolt');
  for (const match of text.matchAll(/\b(110|127|220)(?:\s*\/\s*(110|127|220))?\s*(?:v\b|volts?\b)/gi)) {
    for (const value of [match[1], match[2]]) if (value) found.add(`${value}V` as Voltage);
  }
  for (const match of text.matchAll(/voltagem[^a-z0-9]{0,6}(110|127|220)\b/gi)) found.add(`${match[1]}V` as Voltage);
  return VOLTAGES.filter(voltage => found.has(voltage));
}

const CATEGORY_RULES: [string, RegExp][] = [
  ['Área de Serviço', /m[áa]quina de lavar|lavadora|secadora|tanquinho|tanque|varal|t[áa]bua de passar|ferro de passar|ferro a vapor|aspirador|vassoura|rodo\b|balde|cesto de roupa|lava e seca/i],
  ['Cozinha', /air ?fryer|fritadeira|micro-?ondas|liquidificador|batedeira|cafeteira|sanduicheira|processador|mixer|torradeira|forno|fog[ãa]o|geladeira|refrigerador|freezer|chaleira|lava-?lou[çc]as|panela|frigideira|talher|prato|copo|ta[çc]a|faca|jogo de jantar|assadeira|escorredor|garrafa t[ée]rmica|x[íi]cara|caneca|tigela|saladeira|pote|marmita|utens[íi]lio|cozinha/i],
  ['Quarto', /\bcama\b|colch[ãa]o|len[çc]ol|edredom|travesseiro|cobertor|guarda-?roupa|c[ôo]moda|criado-?mudo|cabideiro|fronha|\bmanta\b|roupeiro|quarto/i],
  ['Banheiro', /toalha|tapete de banheiro|saboneteira|porta-?escova|cortina de box|chuveiro|\bducha\b|banheiro|lavabo|lixeira de banheiro/i],
  ['Sala', /sof[áa]|\brack\b|painel de tv|televis[ãa]o|smart ?tv|\btv\b|mesa de centro|poltrona|estante|tapete|cortina|almofada|lumin[áa]ria|abajur|quadro decorativo|\bsala\b/i],
];

export function suggestCategory(title: string): string | undefined {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(title))?.[0];
}

// ---------------------------------------------------------------------------------------------
// Extração do HTML
// ---------------------------------------------------------------------------------------------

interface Extracted {
  title?: string;
  imageUrl?: string;
  canonicalUrl?: string;
  priceCents?: number | null;
  pixPriceCents?: number | null;
  currency?: string;
  inStock?: boolean;
  voltages: Voltage[];
  colors: string[];
}

const emptyExtraction = (): Extracted => ({ voltages: [], colors: [] });

function absoluteHttpUrl(value: unknown, base: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

type LdNode = Record<string, unknown>;

function collectLdNodes(value: unknown, out: LdNode[], depth = 0) {
  if (depth > 6 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) collectLdNodes(entry, out, depth + 1);
    return;
  }
  out.push(value as LdNode);
  collectLdNodes((value as LdNode)['@graph'], out, depth + 1);
}

function hasType(node: LdNode, type: string) {
  const declared = node['@type'];
  return (Array.isArray(declared) ? declared : [declared]).some(entry => typeof entry === 'string' && entry.toLowerCase().endsWith(type.toLowerCase()));
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as LdNode).name === 'string') return (value as LdNode).name as string;
  return undefined;
}

function ldImage(value: unknown, base: string): string | undefined {
  for (const entry of asArray(value)) {
    const candidate = typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? ((entry as LdNode).url ?? (entry as LdNode).contentUrl) : undefined;
    const url = absoluteHttpUrl(candidate, base);
    if (url) return url;
  }
  return undefined;
}

interface OfferReading { priceCents: number; inStock: boolean; currency?: string }

function readOffers(offers: unknown): OfferReading[] {
  const readings: OfferReading[] = [];
  for (const offer of asArray(offers as LdNode | LdNode[] | undefined)) {
    if (!offer || typeof offer !== 'object') continue;
    // Oferta agregada de vários vendedores: usa as ofertas internas e, na falta delas, o menor preço informado.
    const nested = readOffers(offer.offers);
    if (nested.length) {
      readings.push(...nested);
      continue;
    }
    const specification = asArray(offer.priceSpecification as LdNode | LdNode[] | undefined)[0];
    const priceCents = parsePriceToCents(offer.price ?? offer.lowPrice ?? specification?.price);
    if (priceCents === null) continue;
    const availability = String(offer.availability ?? '');
    readings.push({
      priceCents,
      inStock: !/OutOfStock|SoldOut|Discontinued/i.test(availability),
      currency: typeof offer.priceCurrency === 'string' ? offer.priceCurrency : typeof specification?.priceCurrency === 'string' ? specification.priceCurrency as string : undefined,
    });
  }
  return readings;
}

function extractJsonLd($: cheerio.CheerioAPI, pageUrl: string, into: Extracted) {
  const nodes: LdNode[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;
    try {
      collectLdNodes(JSON.parse(raw), nodes);
    } catch {
      // JSON-LD malformado é comum; a estratégia seguinte cobre.
    }
  });
  const product = nodes.find(node => hasType(node, 'Product') || hasType(node, 'ProductGroup'));
  if (!product) return;

  const variants = asArray(product.hasVariant as LdNode | LdNode[] | undefined).filter(entry => entry && typeof entry === 'object');
  into.title ??= textOf(product.name);
  into.imageUrl ??= ldImage(product.image, pageUrl) ?? ldImage(variants[0]?.image, pageUrl);
  into.canonicalUrl ??= absoluteHttpUrl(product.url, pageUrl);

  const readings = readOffers(product.offers).concat(variants.flatMap(variant => readOffers(variant.offers)));
  const available = readings.filter(reading => reading.inStock);
  const pool = available.length ? available : readings;
  if (pool.length) {
    const best = pool.reduce((lowest, reading) => (reading.priceCents < lowest.priceCents ? reading : lowest));
    into.priceCents ??= best.priceCents;
    into.inStock ??= available.length > 0;
    into.currency ??= best.currency;
  }

  for (const entry of [product, ...variants]) {
    const color = textOf(entry.color);
    if (color) into.colors.push(color);
    const name = textOf(entry.name);
    if (name) into.voltages.push(...findVoltages(name));
  }
}

function meta($: cheerio.CheerioAPI, ...keys: string[]) {
  for (const key of keys) {
    const value = $(`meta[property="${key}"], meta[name="${key}"], meta[itemprop="${key}"]`).first().attr('content')?.trim();
    if (value) return value;
  }
  return undefined;
}

function extractOpenGraph($: cheerio.CheerioAPI, pageUrl: string, into: Extracted) {
  into.title ??= meta($, 'og:title', 'twitter:title');
  into.imageUrl ??= absoluteHttpUrl(meta($, 'og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'), pageUrl);
  into.canonicalUrl ??= absoluteHttpUrl($('link[rel="canonical"]').attr('href') ?? meta($, 'og:url'), pageUrl);
  const price = parsePriceToCents(meta($, 'product:price:amount', 'og:price:amount', 'product:sale_price:amount'));
  if (price !== null) {
    into.priceCents ??= price;
    into.currency ??= meta($, 'product:price:currency', 'og:price:currency');
  }
  const availability = meta($, 'product:availability', 'og:availability');
  if (availability && into.inStock === undefined) into.inStock = !/out.?of.?stock|oos|sold.?out/i.test(availability);
}

const PRICE_PATTERN = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d{1,3}(?:\.\d{3})+|\d+)/;
const PIX_PATTERNS = [
  /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:\(\s*)?(?:[àa] vista\s*)?(?:no|via|com|pagando com|pelo)\s*pix/i,
  /pix[^R\d]{0,30}R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i,
];

function pageText($: cheerio.CheerioAPI) {
  const clone = $.root().clone();
  clone.find('script, style, noscript, template, svg').remove();
  return clone.text().replace(/\s+/g, ' ').slice(0, 300_000);
}

function extractHeuristics($: cheerio.CheerioAPI, into: Extracted, pageUrl: string) {
  into.title ??= $('h1').first().text().trim() || $('title').first().text().trim() || undefined;
  // Amazon e lojas que não usam OpenGraph: foto principal do produto.
  into.imageUrl ??= absoluteHttpUrl(
    $('#landingImage').attr('data-old-hires') || $('#landingImage').attr('src') || $('link[rel="image_src"]').attr('href'),
    pageUrl,
  );
  const text = pageText($);

  if (into.priceCents === undefined || into.priceCents === null) {
    const itemprop = parsePriceToCents($('[itemprop="price"]').first().attr('content') ?? $('[itemprop="price"]').first().text());
    let price = itemprop;
    if (price === null) {
      $('[class*="price" i], [id*="price" i], [class*="preco" i], [id*="preco" i], [data-testid*="price" i]').each((_, element) => {
        const match = $(element).text().replace(/\s+/g, ' ').match(PRICE_PATTERN);
        const cents = match ? parsePriceToCents(match[1]) : null;
        if (cents !== null) {
          price = cents;
          return false;
        }
        return undefined;
      });
    }
    if (price === null) {
      const match = text.match(PRICE_PATTERN);
      price = match ? parsePriceToCents(match[1]) : null;
    }
    if (price !== null) into.priceCents = price;
  }

  for (const pattern of PIX_PATTERNS) {
    const match = text.match(pattern);
    const cents = match ? parsePriceToCents(match[1]) : null;
    if (cents !== null) {
      into.pixPriceCents = cents;
      break;
    }
  }

  const voltageSources = [
    into.title ?? '',
    meta($, 'description', 'og:description') ?? '',
    $('[class*="voltag" i], [id*="voltag" i], [data-testid*="voltag" i], [aria-label*="voltag" i]').slice(0, 20).text(),
    ...(text.match(/voltagem[^a-z0-9]{0,6}(?:110|127|220|bivolt)\w*/gi) ?? []),
  ];
  into.voltages.push(...findVoltages(voltageSources.join(' ')));
}

/** Extrai o que for possível de uma página HTML de produto. Exportada para teste. */
export function extractFromHtml(html: string, pageUrl: string): Extracted {
  const $ = cheerio.load(html);
  const found = emptyExtraction();
  extractJsonLd($, pageUrl, found);
  extractOpenGraph($, pageUrl, found);
  extractHeuristics($, found, pageUrl);
  return found;
}

// ---------------------------------------------------------------------------------------------
// Mercado Livre (API pública de itens)
// ---------------------------------------------------------------------------------------------

const MERCADO_LIVRE_HOST = /(^|\.)mercadoli[vb]re\.com(\.br)?$/;

export function mercadoLivreItemId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!MERCADO_LIVRE_HOST.test(parsed.hostname)) return null;
    const wid = parsed.searchParams.get('wid')?.match(/^MLB-?(\d{6,})$/i);
    if (wid) return `MLB${wid[1]}`;
    // "/p/MLB123" é um produto de catálogo, não um anúncio: a API de itens não o conhece.
    if (/\/p\/MLB/i.test(parsed.pathname)) return null;
    const match = parsed.pathname.match(/MLB-?(\d{6,})/i);
    return match ? `MLB${match[1]}` : null;
  } catch {
    return null;
  }
}

/** Interpreta a resposta de `GET /items/MLB...`. Exportada para teste. */
export function parseMercadoLivreItem(data: unknown): Extracted | null {
  if (!data || typeof data !== 'object') return null;
  const item = data as Record<string, unknown>;
  const price = parsePriceToCents(item.price);
  if (typeof item.title !== 'string' || price === null) return null;

  const found = emptyExtraction();
  found.title = item.title;
  found.priceCents = price;
  found.currency = typeof item.currency_id === 'string' ? item.currency_id : 'BRL';
  found.inStock = item.status === 'active' && Number(item.available_quantity ?? 1) > 0;
  found.canonicalUrl = absoluteHttpUrl(item.permalink, 'https://www.mercadolivre.com.br');
  const picture = asArray(item.pictures as LdNode[] | undefined)[0];
  found.imageUrl = absoluteHttpUrl(picture?.secure_url ?? picture?.url, 'https://www.mercadolivre.com.br')
    ?? absoluteHttpUrl(typeof item.thumbnail === 'string' ? item.thumbnail.replace(/-I\.jpg$/, '-O.jpg') : undefined, 'https://www.mercadolivre.com.br');

  const attributes = asArray(item.attributes as LdNode[] | undefined)
    .concat(asArray(item.variations as LdNode[] | undefined).flatMap(variation => asArray(variation.attribute_combinations as LdNode[] | undefined)));
  for (const attribute of attributes) {
    const value = typeof attribute.value_name === 'string' ? attribute.value_name : '';
    if (!value) continue;
    if (attribute.id === 'VOLTAGE') found.voltages.push(...findVoltages(value));
    if (attribute.id === 'COLOR' || attribute.id === 'MAIN_COLOR') found.colors.push(value);
  }
  return found;
}

// A API de itens do Mercado Livre responde 403 para quem não se identifica. Com um aplicativo cadastrado no
// Mercado Livre (MERCADOLIVRE_CLIENT_ID e MERCADOLIVRE_CLIENT_SECRET) o servidor pede um token de aplicativo,
// válido por algumas horas, e o reaproveita. Sem essas variáveis, a leitura cai para a página do anúncio.
let mercadoLivreToken: { value: string; expires: number } | null = null;

async function getMercadoLivreToken(): Promise<string | null> {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID?.trim();
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  if (mercadoLivreToken && mercadoLivreToken.expires > Date.now()) return mercadoLivreToken.value;
  try {
    const response = await safeGet(new URL('https://api.mercadolibre.com/oauth/token'), {
      method: 'POST',
      accept: 'application/json',
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
    });
    const data = JSON.parse(response.body) as { access_token?: unknown; expires_in?: unknown };
    if (response.status !== 200 || typeof data.access_token !== 'string') return null;
    const lifetimeMs = (typeof data.expires_in === 'number' ? data.expires_in : 3600) * 1000;
    mercadoLivreToken = { value: data.access_token, expires: Date.now() + Math.max(lifetimeMs - 5 * 60_000, 60_000) };
    return mercadoLivreToken.value;
  } catch {
    return null;
  }
}

async function fetchMercadoLivreItem(itemId: string): Promise<Extracted | null> {
  try {
    const token = await getMercadoLivreToken();
    const response = await safeGet(new URL(`https://api.mercadolibre.com/items/${itemId}`), {
      accept: 'application/json',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return response.status === 200 ? parseMercadoLivreItem(JSON.parse(response.body)) : null;
  } catch {
    // A API é só um atalho: se falhar, a leitura da página assume.
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------------------------

// Só são consultados em páginas sem preço: um produto legítimo pode citar "akamai" ou "captcha" em scripts.
const BLOCK_MARKERS = /captcha|robot check|are you a human|access denied|unusual traffic|suspicious-traffic|cf-chl|px-captcha|verificação de segurança|acesso negado|sec-if-cpt|akamai|incapsula|_incap_|datadome|perimeterx|just a moment|challenge-platform|enable javascript|habilite o javascript/i;

const BLOCKED_MESSAGE = 'A loja bloqueou a leitura automática desse link. Preencha as informações manualmente.';
const NO_DATA_MESSAGE = 'Não conseguimos encontrar as informações desse produto na página.';

function mergeExtractions(...parts: (Extracted | null)[]): Extracted {
  const merged = emptyExtraction();
  for (const part of parts) {
    if (!part) continue;
    merged.title ??= part.title;
    merged.imageUrl ??= part.imageUrl;
    merged.canonicalUrl ??= part.canonicalUrl;
    merged.priceCents ??= part.priceCents;
    merged.pixPriceCents ??= part.pixPriceCents;
    merged.currency ??= part.currency;
    merged.inStock ??= part.inStock;
    merged.voltages.push(...part.voltages);
    merged.colors.push(...part.colors);
  }
  return merged;
}

function buildPreview(url: string, finalUrl: string, found: Extracted): ScrapedProductPreview {
  const domain = domainOf(finalUrl);
  const title = cleanTitle(found.title ?? '', domain);
  const regular = found.priceCents ?? null;
  const pix = found.pixPriceCents ?? null;
  // Um "preço no Pix" só vale se for de fato um desconto razoável sobre o preço normal.
  const validPix = pix !== null && (regular === null || (pix < regular && pix >= regular * 0.5)) ? pix : null;
  const voltage = VOLTAGES.filter(entry => found.voltages.includes(entry));
  const colors = [...new Set(found.colors.map(color => color.trim()).filter(Boolean))].slice(0, 12);
  const variations = voltage.length || colors.length ? { ...(voltage.length ? { voltage } : {}), ...(colors.length ? { colors } : {}) } : undefined;
  return {
    url,
    canonicalUrl: found.canonicalUrl,
    domain,
    title,
    imageUrl: found.imageUrl,
    priceCents: regular ?? validPix,
    pixPriceCents: regular === null ? null : validPix,
    currency: found.currency?.toUpperCase() || 'BRL',
    inStock: found.inStock ?? true,
    variations,
    suggestedCategory: suggestCategory(title),
  };
}

function failureForStatus(status: number): ScrapeError {
  if (status === 404 || status === 410) return new ScrapeError('not_found', 'Não encontramos esse produto. Confira o link.');
  if ([401, 403, 429, 503].includes(status)) return new ScrapeError('blocked', BLOCKED_MESSAGE);
  return new ScrapeError('failed', 'Não foi possível ler a página desse produto.');
}

/** O título é só o nome da própria loja (ex.: "Mercado Livre" em mercadolivre.com.br). */
function isStoreNameOnly(title: string, hostname: string) {
  const flat = (text: string) => plain(text).replace(/[^a-z0-9]/g, '');
  const flatTitle = flat(title);
  const labels = hostname.split('.').map(flat).filter(label => label.length > 2 && !GENERIC_HOST_LABELS.has(label));
  return labels.some(label => flatTitle === label || (flatTitle.startsWith(label) && flatTitle.length <= label.length + 6));
}

const GENERIC_HOST_LABELS = new Set(['www', 'com', 'produto', 'lista', 'loja', 'shop', 'store', 'app']);
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface PageRead {
  page: Extracted | null;
  finalUrl: string;
  error: ScrapeError | null;
}

/** Interpreta a resposta de uma loja: os dados do produto ou o motivo de não haver. Exportada para teste. */
export function readPage(response: { status: number; body: string; url: URL }): { page: Extracted | null; error: ScrapeError | null } {
  if (response.status >= 400) return { page: null, error: failureForStatus(response.status) };
  const page = extractFromHtml(response.body, response.url.href);
  // Telas de verificação trazem só o nome e o logo da loja ("Mercado Livre"): não são o produto.
  if (page.title && isStoreNameOnly(page.title, response.url.hostname)) {
    page.title = undefined;
    page.imageUrl = undefined;
  }
  if (page.priceCents == null) {
    const blocked = BLOCK_MARKERS.test(response.body.slice(0, 200_000));
    // Sem preço, só vale uma página com nome e foto do produto e que não seja uma tela de bloqueio. Telas de
    // desafio (Akamai, Cloudflare...) respondem 200 com uma página minúscula e sem produto.
    const looksLikeProduct = Boolean(page.title && page.imageUrl);
    const challenge = (blocked && !looksLikeProduct) || (!page.title && response.body.length < 20_000);
    if (challenge || !looksLikeProduct) {
      return { page: null, error: new ScrapeError(challenge ? 'blocked' : 'no_data', challenge ? BLOCKED_MESSAGE : NO_DATA_MESSAGE) };
    }
  }
  return { page, error: null };
}

async function readDirect(start: URL): Promise<PageRead> {
  try {
    const response = await fetchPage(start);
    return { ...readPage(response), finalUrl: response.url.href };
  } catch (error) {
    getLogger().warn({ event: 'scraper.read.failed', url: start.href, layer: 'direct', err: error }, 'Scraper read attempt failed.');
    if (error instanceof ScrapeError && error.code === 'invalid_url') throw error;
    return { page: null, finalUrl: start.href, error: error instanceof ScrapeError ? error : new ScrapeError('failed', 'Não foi possível acessar a loja.') };
  }
}

async function readUnlocked(target: URL): Promise<PageRead | null> {
  try {
    const response = await fetchViaUnlocker(target);
    return response ? { ...readPage(response), finalUrl: response.url.href } : null;
  } catch (error) {
    getLogger().warn({ event: 'scraper.read.failed', url: target.href, layer: 'unlocker', err: error }, 'Scraper read attempt failed.');
    if (error instanceof ScrapeError && error.code === 'invalid_url') throw error;
    return null;
  }
}

// Falhas em que vale tentar o desbloqueador; link inexistente ou inválido não melhora com navegador real.
const UNLOCKABLE: ReadonlySet<ScrapeErrorCode> = new Set(['blocked', 'no_data', 'failed', 'timeout']);

const NAME_FILLER = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'a', 'o']);
const NON_NAME_SEGMENT = /^(dp|gp|p|b|ep|afr|produto|produtos|product|products|item|itens|catalogo|catalog|loja|store|s)$/i;

/**
 * Nome aproximado do produto a partir do endereço (muitas lojas põem o título no caminho: ".../air-fryer-mondial-4l/p/123").
 * É o último recurso quando a loja não deixa ler a página. `undefined` se o endereço não tiver um nome que valha usar.
 */
export function titleFromUrl(rawUrl: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return undefined;
  }
  const candidates = pathname.split('/').flatMap(segment => {
    let text: string;
    try {
      text = decodeURIComponent(segment);
    } catch {
      text = segment;
    }
    text = text
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/-i\.\d+\.\d+$/i, '') // Shopee
      .replace(/^MLB-?\d+-?/i, '') // Mercado Livre
      .replace(/-?_JM$/i, '');
    if (!text || NON_NAME_SEGMENT.test(text)) return [];
    const words = text.split(/[-_+\s]+/).filter(word => word && !/^\d{5,}$/.test(word) && !/^(?=.*\d)(?=.*[a-z])[a-z0-9]{9,}$/i.test(word));
    return words.length >= 2 && words.some(word => /[a-zà-ú]{3,}/i.test(word)) ? [words] : [];
  });
  const best = candidates.sort((a, b) => b.join(' ').length - a.join(' ').length)[0];
  if (!best) return undefined;
  const name = best
    .map((word, index) => {
      if (/^\d+(l|w|v|kg|g|ml|cm|mm|m|pcs)$/i.test(word)) return word.toUpperCase();
      const lower = word.toLowerCase();
      return index > 0 && NAME_FILLER.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
  return name.length >= 6 ? cleanTitle(name) : undefined;
}

export interface ScrapeOptions {
  /** Aceita um resultado só com o nome tirado do link quando a loja não deixa ler a página (formulário). */
  allowPartial?: boolean;
  /** `false` nunca usa o desbloqueador pago. */
  unlocker?: boolean;
}

/** Lê o link de um produto. Lança `ScrapeError` quando o link é inválido, a loja bloqueia ou não há dados do produto. */
export async function scrapeProduct(rawUrl: string, options: ScrapeOptions = {}): Promise<ScrapedProductPreview> {
  const url = normalizeProductUrl(rawUrl);
  const start = new URL(url);
  const trail: string[] = [];

  let api: Extracted | null = null;
  let apiTried = false;
  const itemId = mercadoLivreItemId(url);
  if (itemId) {
    apiTried = true;
    api = await fetchMercadoLivreItem(itemId);
    trail.push(`api=${api ? 'ok' : 'falhou'}`);
  }

  let read: PageRead = { page: null, finalUrl: url, error: null };
  // A página só é necessária quando a API não trouxe título e preço.
  if (!api?.title || api.priceCents == null) {
    read = await readDirect(start);
    trail.push(`direto=${read.error?.code ?? (read.page?.priceCents == null ? 'sem-preco' : 'ok')}`);

    // Barrada ou sem preço: tenta o navegador real, se houver chave. O que a leitura direta já trouxe fica como reserva.
    const needsHelp = read.error ? UNLOCKABLE.has(read.error.code) : read.page?.priceCents == null;
    if (needsHelp && options.unlocker !== false) {
      const unlocked = await readUnlocked(new URL(read.finalUrl));
      if (unlocked) {
        trail.push(`desbloqueador=${unlocked.error?.code ?? (unlocked.page?.priceCents == null ? 'sem-preco' : 'ok')}`);
        if (unlocked.page && (unlocked.page.priceCents != null || !read.page)) read = unlocked;
      }
    }

    // Link curto ou de campanha do Mercado Livre: o ID só aparece no endereço final.
    if (!apiTried && !read.page?.priceCents) {
      const finalId = mercadoLivreItemId(read.finalUrl);
      if (finalId) api = await fetchMercadoLivreItem(finalId);
    }
  }

  const found = mergeExtractions(api, read.page);
  if (!found.title) {
    const guessed = options.allowPartial ? titleFromUrl(read.finalUrl) ?? titleFromUrl(url) : undefined;
    getLogger().warn({ event: 'scraper.partial', url, finalUrl: read.finalUrl, trail, guessed, err: read.error, extracted: found }, 'Scraper returned partial data.');
    if (guessed) return { ...buildPreview(url, read.finalUrl, { ...emptyExtraction(), title: guessed }), partial: true };
    throw read.error ?? new ScrapeError('no_data', NO_DATA_MESSAGE);
  }
  getLogger().info({ event: 'scraper.completed', url, finalUrl: read.finalUrl, trail, extracted: found }, 'Product scraping completed.');
  return buildPreview(url, read.finalUrl, found);
}

// ---------------------------------------------------------------------------------------------
// Cache curto das leituras feitas pelo formulário: ao salvar o item, o produto acompanhado nasce com
// esses dados (confiáveis, lidos pelo servidor) em vez de depender do que o navegador enviar.
// ---------------------------------------------------------------------------------------------

const PREVIEW_TTL_MS = 30 * 60_000;
const PREVIEW_CACHE_LIMIT = 200;
const previewCache = new Map<string, { preview: ScrapedProductPreview; expires: number }>();

export function rememberPreview(preview: ScrapedProductPreview) {
  const now = Date.now();
  for (const [key, entry] of previewCache) if (entry.expires <= now) previewCache.delete(key);
  if (previewCache.size >= PREVIEW_CACHE_LIMIT) previewCache.delete(previewCache.keys().next().value as string);
  previewCache.set(preview.url, { preview, expires: now + PREVIEW_TTL_MS });
}

export function recallPreview(normalizedUrl: string): ScrapedProductPreview | null {
  const entry = previewCache.get(normalizedUrl);
  if (!entry || entry.expires <= Date.now()) return null;
  return entry.preview;
}
