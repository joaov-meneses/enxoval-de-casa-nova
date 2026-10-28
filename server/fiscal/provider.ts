import { readFileSync } from 'node:fs';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';
import type { FiscalAddress } from '../../shared/fiscal.ts';

export type FiscalEnvironment = 'homologacao' | 'producao';
export type FiscalModel = 'nfsen';
export interface FiscalRecipient { name?: string; document?: string; email?: string; address?: FiscalAddress }
export interface FiscalTaxConfig {
  cnpj: string; inscricaoMunicipal?: string; municipio: string; municipioPrestacao: string;
  serie: string; primeiroNumero: string; opSimpNac: '2' | '3'; regApTribSN?: '1' | '2' | '3';
  regEspTrib: string; cTribNac: string; cTribMun?: string; cNBS?: string; descricao: string;
  tribISSQN: '1'; tpRetISSQN: '1'; pAliq?: string; pTotTribSN?: string;
  IBSCBS?: Record<string, unknown>;
}
export interface FiscalConfig {
  baseUrl: string; environment: FiscalEnvironment; model: FiscalModel; tax: FiscalTaxConfig;
  cert: string; key: string; requireAddress: boolean; timeoutMs: number;
}
export const fiscalEnabled = () => process.env.NFSE_NACIONAL_ENABLED === 'true';
export const fiscalEnvironment = (): FiscalEnvironment => process.env.NFSE_NACIONAL_ENVIRONMENT === 'producao' ? 'producao' : 'homologacao';
export const fiscalAddressRequired = () => process.env.NFSE_NACIONAL_REQUIRE_ADDRESS !== 'false';
export const fiscalModel = (): FiscalModel => 'nfsen';
export function validTaxDocument(value: string) {
  if (!/^\d{11}$|^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = (length: number, weights: number[]) => {
    const remainder = digits.slice(0, length).reduce((sum, digit, index) => sum + digit * weights[index], 0) % 11;
    return (remainder < 2 ? 0 : 11 - remainder) === digits[length];
  };
  return value.length === 11
    ? check(9, [10,9,8,7,6,5,4,3,2]) && check(10, [11,10,9,8,7,6,5,4,3,2])
    : check(12, [5,4,3,2,9,8,7,6,5,4,3,2]) && check(13, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
}

export function fiscalPolicy() {
  const timing = process.env.NFSE_NACIONAL_ISSUE_ON || 'manual';
  const competence = process.env.NFSE_NACIONAL_COMPETENCE || 'payment_date';
  if (!['manual', 'payment_confirmed', 'period_end'].includes(timing) ||
      !['payment_date', 'period_start', 'period_end'].includes(competence)) throw new Error('FISCAL_ACCOUNTING_POLICY_REQUIRED');
  return { timing, competence, accountingReference: process.env.NFSE_NACIONAL_ACCOUNTING_REFERENCE?.trim() || '' };
}

export function fiscalConfig(): FiscalConfig {
  try {
    const environment = fiscalEnvironment();
    if (!['homologacao', 'producao'].includes(process.env.NFSE_NACIONAL_ENVIRONMENT || 'homologacao')) throw new Error();
    const tax: FiscalTaxConfig = JSON.parse(process.env.NFSE_NACIONAL_TAX_CONFIG || '{}');
    const policy = fiscalPolicy();
    if (!policy.accountingReference || process.env.NFSE_NACIONAL_ISSUER_ENABLED !== 'true' ||
        !validTaxDocument(tax.cnpj || '') || tax.cnpj.length !== 14 || tax.municipio !== '2905701' ||
        !/^\d{7}$/.test(tax.municipioPrestacao) || typeof tax.serie !== 'string' || !/^\d{1,5}$/.test(tax.serie) || Number(tax.serie) > 49999 ||
        !/^[1-9]\d{0,14}$/.test(tax.primeiroNumero) || !['2','3'].includes(tax.opSimpNac) ||
        (tax.opSimpNac === '3' && (!['1','2','3'].includes(tax.regApTribSN!) || !/^\d{1,2}\.\d{2}$/.test(tax.pTotTribSN || ''))) ||
        !/^\d$/.test(tax.regEspTrib) || !/^\d{6}$/.test(tax.cTribNac) || !tax.descricao ||
        tax.tribISSQN !== '1' || tax.tpRetISSQN !== '1') throw new Error();
    const official = environment === 'producao' ? 'https://sefin.nfse.gov.br/SefinNacional'
      : 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional';
    const baseUrl = (process.env.NFSE_NACIONAL_BASE_URL || official).replace(/\/+$/, '');
    const url = new URL(baseUrl);
    const local = environment === 'homologacao' && process.env.NFSE_NACIONAL_ALLOW_LOCAL_SIMULATION === 'true' &&
      url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((!local && baseUrl !== official) || url.username || url.password || url.search || url.hash) throw new Error();
    const cert = readFileSync(process.env.NFSE_NACIONAL_CERT_PATH || '', 'utf8');
    const privateKey = createPrivateKey({ key: readFileSync(process.env.NFSE_NACIONAL_KEY_PATH || ''),
      passphrase: process.env.NFSE_NACIONAL_KEY_PASSPHRASE || undefined });
    const certificate = new X509Certificate(cert);
    if (!certificate.checkPrivateKey(privateKey) || Date.parse(certificate.validFrom) > Date.now() ||
        Date.parse(certificate.validTo) <= Date.now() || !certificate.keyUsage?.includes('1.3.6.1.5.5.7.3.2')) throw new Error();
    const timeoutMs = local ? Number(process.env.NFSE_NACIONAL_TIMEOUT_MS || 15000) : 15000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 60000) throw new Error();
    return { baseUrl, environment, model: 'nfsen', tax, cert, key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      requireAddress: fiscalAddressRequired(), timeoutMs };
  } catch { throw new Error('FISCAL_CONFIGURATION'); }
}

export class FiscalProviderError extends Error {
  constructor(public status: number, public details: unknown = null, public definitiveRejection = false) { super('FISCAL_PROVIDER_ERROR'); }
}

/** Sem redirecionamentos. Certificado enviado apenas por mTLS aos hosts oficiais. */
export function nationalRequest(config: FiscalConfig, path: string, payload?: unknown): Promise<any> {
  const url = new URL(config.baseUrl + path);
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const request = (secure ? httpsRequest : httpRequest)(url, {
      method: body === undefined ? 'GET' : 'POST',
      ...(secure ? { cert: config.cert, key: config.key, minVersion: 'TLSv1.2' as const, rejectUnauthorized: true } : {}),
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) },
    }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 8_000_000) request.destroy(new Error('FISCAL_RESPONSE_TOO_LARGE')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        const status = response.statusCode || 0;
        let data: any;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(new FiscalProviderError(status)); }
        if (status === 404 && body === undefined) return resolve(null);
        if (status < 200 || status >= 300) {
          const rejected = body !== undefined && status === 400 && Array.isArray(data?.erros) && data.erros.length > 0;
          return reject(new FiscalProviderError(status, rejected ? data.erros : null, rejected));
        }
        resolve(data);
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('FISCAL_TIMEOUT')), config.timeoutMs);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

const NS = 'http://www.sped.fazenda.gov.br/nfse';
export interface FiscalResult { status: 'authorized'; accessKey: string; number: string; xml: string }
export function parseNationalInvoice(data: any, dpsId: string): FiscalResult {
  if (!/^\d{50}$/.test(data?.chaveAcesso || '') || typeof data?.nfseXmlGZipB64 !== 'string') throw new Error('FISCAL_PROVIDER_RESPONSE');
  const xml = gunzipSync(Buffer.from(data.nfseXmlGZipB64, 'base64'), { maxOutputLength: 8_000_000 }).toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('FISCAL_PROVIDER_RESPONSE');
  const doc = new DOMParser({ onError: () => { throw new Error('FISCAL_PROVIDER_RESPONSE'); } }).parseFromString(xml, 'text/xml');
  const infos = doc.getElementsByTagNameNS(NS, 'infNFSe');
  const dps = doc.getElementsByTagNameNS(NS, 'infDPS');
  const numbers = doc.getElementsByTagNameNS(NS, 'nNFSe');
  if (infos.length !== 1 || dps.length !== 1 || dps[0].getAttribute('Id') !== dpsId ||
      infos[0].getAttribute('Id') !== `NFS${data.chaveAcesso}` || numbers.length !== 1 || !/^\d+$/.test(numbers[0].textContent || '')) throw new Error('FISCAL_PROVIDER_RESPONSE');
  return { status: 'authorized', accessKey: data.chaveAcesso, number: numbers[0].textContent!, xml };
}

export async function queryNationalInvoice(config: FiscalConfig, dpsId: string) {
  if (!/^DPS\d{42}$/.test(dpsId)) throw new Error('FISCAL_DPS_ID_REQUIRED');
  const lookup = await nationalRequest(config, `/dps/${dpsId}`);
  if (!lookup) return null;
  if (!/^\d{50}$/.test(lookup.chaveAcesso || '')) throw new Error('FISCAL_PROVIDER_RESPONSE');
  const note = await nationalRequest(config, `/nfse/${lookup.chaveAcesso}`);
  if (!note) throw new Error('FISCAL_PROVIDER_RESPONSE');
  return parseNationalInvoice({ ...note, chaveAcesso: lookup.chaveAcesso }, dpsId);
}

export function fiscalDocumentUrl(value: unknown, config: FiscalConfig) {
  if (typeof value !== 'string' || !value) return null;
  try { const url = new URL(value, config.baseUrl); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
