// Read-only readiness check. Does not print credentials, names or signed URLs.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getPool } from '../server/database.ts';
import { storageDriver } from '../server/objectStorage.ts';
import { documentQuotaBytes } from '../server/itemDocuments.ts';
import { stopPosthogLogs } from '../server/logger.ts';
const require = createRequire(import.meta.url);
try {
  const driver = storageDriver();
  const language = require('@tesseract.js-data/por');
  const modelPresent = existsSync(path.join(language.langPath, 'por.traineddata.gz'));
  const { rows: [state] } = await getPool().query(`SELECT count(*)::int AS documents,
    count(*) FILTER (WHERE d.storage_key LIKE 'db:%' AND b.document_id IS NULL)::int AS missing_blobs
    FROM item_documents d LEFT JOIN item_document_blobs b ON b.document_id = d.id`);
  console.log(JSON.stringify({ driver, quotaMb: documentQuotaBytes() / 1024 / 1024, documents: state.documents, missingBlobs: state.missing_blobs, localReceiptModel: modelPresent }));
  if (!modelPresent || state.missing_blobs > 0) process.exitCode = 1;
} catch (err) {
  console.error('A verificação de documentos falhou:', err instanceof Error ? err.message : 'erro desconhecido');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([getPool().end(), stopPosthogLogs()]);
}
