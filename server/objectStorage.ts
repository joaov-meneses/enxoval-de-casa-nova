// Onde ficam os comprovantes e garantias dos itens. Produção usa um bucket de objetos compatível com S3 (Cloudflare R2
// ou S3) com download por URL assinada de 5 minutos; sem bucket configurado, os arquivos ficam numa tabela própria do
// Postgres (desenvolvimento e homologação). O banco guarda só a referência (`storage_key`).
import { createHash, createHmac } from 'node:crypto';
import type { Queryable } from './database.ts';
import { getLogger } from './logger.ts';

export type StorageDriver = 'database' | 's3';

interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export const SIGNED_URL_SECONDS = 300;

function s3Config(env: NodeJS.ProcessEnv = process.env): S3Config | null {
  const endpoint = env.S3_ENDPOINT?.trim().replace(/\/+$/, '');
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: env.S3_REGION?.trim() || 'auto' };
}

/** `DOCUMENT_STORAGE=s3` exige o bucket completo: configuração pela metade não pode cair em silêncio no banco. */
export function storageDriver(env: NodeJS.ProcessEnv = process.env): StorageDriver {
  const wanted = (env.DOCUMENT_STORAGE ?? '').trim().toLowerCase();
  if (wanted === 's3') {
    if (!s3Config(env)) throw new Error('DOCUMENT_STORAGE=s3 requer S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY.');
    return 's3';
  }
  return 'database';
}

const rfc3986 = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

function amzDate(now: Date) {
  const iso = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { stamp: iso, day: iso.slice(0, 8) };
}

function objectUrl(config: S3Config, key: string) {
  const path = `/${rfc3986(config.bucket)}/${key.split('/').map(rfc3986).join('/')}`;
  return new URL(`${config.endpoint}${path}`);
}

function signature(config: S3Config, day: string, stringToSign: string) {
  const kDate = hmac(`AWS4${config.secretAccessKey}`, day);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  return createHmac('sha256', kSigning).update(stringToSign).digest('hex');
}

function canonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .map(([key, value]) => [rfc3986(key), rfc3986(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/** Requisição assinada (AWS Signature V4 no cabeçalho) para PUT, GET e DELETE de um objeto. */
async function s3Request(config: S3Config, method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Buffer, contentType?: string) {
  const url = objectUrl(config, key);
  const { stamp, day } = amzDate(new Date());
  const payloadHash = sha256Hex(body ?? '');
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': stamp,
    ...(contentType ? { 'content-type': contentType } : {}),
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(name => `${name}:${headers[name].trim()}\n`).join('');
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n');
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature(config, day, stringToSign)}`;
  const { host: _host, ...sent } = headers;
  const response = await fetch(url, {
    method,
    headers: { ...sent, authorization },
    body: body ? new Uint8Array(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
    throw new Error(`Armazenamento respondeu ${response.status} ao ${method} do documento.`);
  }
  return response;
}

/** URL de download assinada (válida por 5 minutos) que já pede ao navegador o nome original do arquivo. */
export function presignedDownloadUrl(storageKey: string, fileName: string, now = new Date(), env: NodeJS.ProcessEnv = process.env) {
  const config = s3Config(env);
  if (!config || !storageKey.startsWith('s3:')) return null;
  const key = storageKey.slice(3);
  const url = objectUrl(config, key);
  const { stamp, day } = amzDate(now);
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(SIGNED_URL_SECONDS),
    'X-Amz-SignedHeaders': 'host',
    'response-content-disposition': `attachment; filename*=UTF-8''${rfc3986(fileName)}`,
  });
  const query = canonicalQuery(params);
  const canonicalRequest = ['GET', url.pathname, query, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n');
  return `${url.origin}${url.pathname}?${query}&X-Amz-Signature=${signature(config, day, stringToSign)}`;
}

/** Grava o arquivo e devolve a referência. No modo banco, a linha do documento precisa existir antes (chave estrangeira). */
export async function storeDocument(queryable: Queryable, documentId: string, enxovalId: string, data: Buffer, contentType: string) {
  if (storageDriver() === 's3') {
    const key = `documentos/${enxovalId}/${documentId}`;
    await s3Request(s3Config()!, 'PUT', key, data, contentType);
    return `s3:${key}`;
  }
  return `db:${documentId}`;
}

/** Segunda metade do modo banco: os bytes vão para a tabela própria, na mesma transação da linha do documento. */
export async function saveDatabaseBlob(queryable: Queryable, storageKey: string, documentId: string, data: Buffer) {
  if (!storageKey.startsWith('db:')) return;
  await queryable.query('INSERT INTO item_document_blobs (document_id, data) VALUES ($1, $2)', [documentId, data]);
}

export async function readDocument(queryable: Queryable, storageKey: string) {
  if (storageKey.startsWith('s3:')) {
    const config = s3Config();
    if (!config) throw new Error('Bucket de documentos não configurado.');
    return Buffer.from(await (await s3Request(config, 'GET', storageKey.slice(3))).arrayBuffer());
  }
  const result = await queryable.query<{ data: Buffer }>(
    'SELECT b.data FROM item_document_blobs b INNER JOIN item_documents d ON d.id = b.document_id WHERE d.storage_key = $1', [storageKey]);
  if (!result.rows[0]) throw new Error('Arquivo do documento não encontrado.');
  return result.rows[0].data;
}

/** Remove do bucket um arquivo que ficou sem linha (upload feito e transação desfeita depois). */
export async function discardStoredObject(storageKey: string) {
  if (!storageKey.startsWith('s3:')) return;
  const config = s3Config();
  if (!config) return;
  try {
    await s3Request(config, 'DELETE', storageKey.slice(3));
  } catch (err) {
    getLogger().warn({ event: 'documents.storage.discard_failed', storageKey, err }, 'Could not discard orphan document object.');
  }
}

/** Esvazia a fila de exclusões do bucket (documentos apagados com o item, o enxoval ou a conta). */
export async function processStorageDeletions(queryable: Queryable, limit = 50) {
  const config = s3Config();
  if (!config) return { deleted: 0, failed: 0 };
  const pending = await queryable.query<{ storage_key: string }>(
    'SELECT storage_key FROM storage_deletions WHERE attempts < 10 ORDER BY created_at LIMIT $1', [limit]);
  let deleted = 0;
  let failed = 0;
  for (const { storage_key: storageKey } of pending.rows) {
    try {
      await s3Request(config, 'DELETE', storageKey.slice(3));
      await queryable.query('DELETE FROM storage_deletions WHERE storage_key = $1', [storageKey]);
      deleted += 1;
    } catch (err) {
      failed += 1;
      await queryable.query('UPDATE storage_deletions SET attempts = attempts + 1 WHERE storage_key = $1', [storageKey]);
      getLogger().warn({ event: 'documents.storage.delete_failed', storageKey, err }, 'Document object deletion failed; will retry.');
    }
  }
  return { deleted, failed };
}
