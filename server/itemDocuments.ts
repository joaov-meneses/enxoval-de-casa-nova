// Fase 11.4: notas fiscais, garantias e manuais das compras do enxoval. Só membros do enxoval enviam e baixam; o tipo
// do arquivo é conferido pelo conteúdo (não pela extensão) e os arquivos saem junto com o item, o enxoval ou a conta.
import { randomUUID } from 'node:crypto';
import express, { type Request, type Router } from 'express';
import { getPool, withTransaction, type Queryable } from './database.ts';
import { getLogger } from './logger.ts';
import { asyncHandler, HttpError, rateLimit } from './security.ts';
import { discardStoredObject, presignedDownloadUrl, readDocument, saveDatabaseBlob, storeDocument } from './objectStorage.ts';
import { uniqueZipName, ZipWriter } from './zip.ts';
import type { AuthUser, EnxovalItem, ItemDocument, ItemDocumentKind } from '../src/types.ts';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_ITEM = 20;
const DOCUMENT_KINDS: readonly ItemDocumentKind[] = ['invoice', 'warranty', 'manual', 'other'];
const KIND_LABEL: Record<ItemDocumentKind, string> = { invoice: 'Nota fiscal', warranty: 'Garantia', manual: 'Manual', other: 'Documento' };
const EXTENSION: Record<string, string> = {
  'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic',
};

/** Cota de documentos de cada conta (dona dos enxovais), em MB. Ajustável conforme o custo do armazenamento. */
export function documentQuotaBytes(env: NodeJS.ProcessEnv = process.env) {
  const mb = Number(env.DOCUMENT_QUOTA_MB ?? 500);
  return (Number.isFinite(mb) && mb > 0 ? mb : 500) * 1024 * 1024;
}

/** Tipo real do arquivo pelos primeiros bytes. Qualquer outra coisa (HTML, SVG, executáveis) é recusada. */
export function sniffDocumentType(data: Buffer): string | null {
  if (data.length < 12) return null;
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (data.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|heif)$/.test(data.subarray(8, 12).toString('latin1'))) return 'image/heic';
  return null;
}

/** Nome exibido do arquivo: sem pastas nem caracteres de controle, com a extensão do tipo real. */
export function cleanFileName(raw: unknown, contentType: string, kind: ItemDocumentKind) {
  const base = (typeof raw === 'string' ? raw : '')
    .replace(/^.*[\\/]/, '')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .trim()
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .slice(0, 120) || KIND_LABEL[kind];
  return `${base}${EXTENSION[contentType] ?? ''}`;
}

interface DocumentRow {
  id: string;
  item_id: string;
  kind: ItemDocumentKind;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: Date;
}

function mapDocument(row: DocumentRow): ItemDocument {
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at.toISOString(),
    url: `/api/documents/${row.id}/file`,
  };
}

interface DocumentDeps {
  requireUser: (req: Request) => Promise<AuthUser>;
  requireEnxovalMember: (queryable: Queryable, userId: string, enxovalId: string) => Promise<'owner' | 'editor'>;
  fetchItemRow: (queryable: Queryable, itemId: string, enxovalId: string) => Promise<EnxovalItem>;
}

async function itemEnxoval(queryable: Queryable, deps: DocumentDeps, userId: string, itemId: string, lock = false) {
  const result = await queryable.query<{ enxoval_id: string; owner_id: string }>(`
    SELECT i.enxoval_id, e.owner_id
    FROM items i
    INNER JOIN enxovais e ON e.id = i.enxoval_id
    INNER JOIN enxoval_members em ON em.enxoval_id = i.enxoval_id AND em.user_id = $2
    WHERE i.id = $1
    ${lock ? 'FOR UPDATE OF i' : ''}
  `, [itemId, userId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'Item não encontrado.');
  await deps.requireEnxovalMember(queryable, userId, row.enxoval_id);
  return row;
}

async function documentOf(queryable: Queryable, deps: DocumentDeps, userId: string, documentId: string) {
  const result = await queryable.query<DocumentRow & { enxoval_id: string; storage_key: string }>(`
    SELECT d.id, d.item_id, d.kind, d.file_name, d.content_type, d.size_bytes, d.created_at, d.enxoval_id, d.storage_key
    FROM item_documents d
    INNER JOIN enxoval_members em ON em.enxoval_id = d.enxoval_id AND em.user_id = $2
    WHERE d.id = $1
  `, [documentId, userId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'Documento não encontrado.');
  await deps.requireEnxovalMember(queryable, userId, row.enxoval_id);
  return row;
}

export function registerItemDocumentRoutes(router: Router, deps: DocumentDeps) {
  router.post('/items/:id/documents', rateLimit(40, 10 * 60_000),
    express.raw({ type: ['application/pdf', 'image/*', 'application/octet-stream'], limit: MAX_DOCUMENT_BYTES }),
    asyncHandler(async (req, res) => {
      const user = await deps.requireUser(req);
      const kind = typeof req.query.kind === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(req.query.kind)
        ? req.query.kind as ItemDocumentKind : 'invoice';
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(415, 'Envie uma foto (JPG, PNG, WebP ou HEIC) ou um PDF de até 10 MB.');
      const contentType = sniffDocumentType(req.body);
      if (!contentType) throw new HttpError(415, 'Este arquivo não parece uma foto ou um PDF. Envie JPG, PNG, WebP, HEIC ou PDF.');
      const data = req.body;
      const documentId = randomUUID();
      const fileName = cleanFileName(req.query.name, contentType, kind);

      const access = await itemEnxoval(getPool(), deps, user.id, req.params.id);
      // Confere os limites antes de gastar o envio ao bucket; a transação confere de novo, com o item travado.
      const checkLimits = async (queryable: Queryable) => {
        const counts = await queryable.query<{ item_total: number; used_bytes: string }>(`
          SELECT
            (SELECT COUNT(*)::int FROM item_documents WHERE item_id = $1) AS item_total,
            (SELECT COALESCE(SUM(d.size_bytes), 0) FROM item_documents d INNER JOIN enxovais e ON e.id = d.enxoval_id WHERE e.owner_id = $2) AS used_bytes
        `, [req.params.id, access.owner_id]);
        if (Number(counts.rows[0].item_total) >= MAX_DOCUMENTS_PER_ITEM) throw new HttpError(400, `Cada item guarda até ${MAX_DOCUMENTS_PER_ITEM} arquivos.`);
        if (Number(counts.rows[0].used_bytes) + data.length > documentQuotaBytes()) throw new HttpError(400, 'O espaço para documentos desta conta acabou. Apague arquivos que não precisa mais.', 'DOCUMENT_QUOTA');
      };
      await checkLimits(getPool());

      const storageKey = await storeDocument(getPool(), documentId, access.enxoval_id, data, contentType);
      try {
        const result = await withTransaction(async client => {
          await itemEnxoval(client, deps, user.id, req.params.id, true);
          await checkLimits(client);
          const inserted = await client.query<DocumentRow>(`
            INSERT INTO item_documents (id, item_id, enxoval_id, kind, storage_key, file_name, content_type, size_bytes, uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, item_id, kind, file_name, content_type, size_bytes, created_at
          `, [documentId, req.params.id, access.enxoval_id, kind, storageKey, fileName, contentType, data.length, user.id]);
          await saveDatabaseBlob(client, storageKey, documentId, data);
          await client.query('UPDATE items SET updated_at = now() WHERE id = $1', [req.params.id]);
          return { document: mapDocument(inserted.rows[0]), item: await deps.fetchItemRow(client, req.params.id, access.enxoval_id) };
        });
        res.status(201).json(result);
      } catch (err) {
        await discardStoredObject(storageKey);
        throw err;
      }
    }));

  router.get('/items/:id/documents', asyncHandler(async (req, res) => {
    const user = await deps.requireUser(req);
    await itemEnxoval(getPool(), deps, user.id, req.params.id);
    const result = await getPool().query<DocumentRow>(`
      SELECT id, item_id, kind, file_name, content_type, size_bytes, created_at
      FROM item_documents WHERE item_id = $1 ORDER BY created_at ASC
    `, [req.params.id]);
    res.json({ documents: result.rows.map(mapDocument) });
  }));

  // "Documentos da casa": tudo o que tem nota ou garantia no enxoval, com a cota usada pela conta dona.
  router.get('/enxovais/:id/documents', asyncHandler(async (req, res) => {
    const user = await deps.requireUser(req);
    await deps.requireEnxovalMember(getPool(), user.id, req.params.id);
    const result = await getPool().query<DocumentRow>(`
      SELECT d.id, d.item_id, d.kind, d.file_name, d.content_type, d.size_bytes, d.created_at
      FROM item_documents d WHERE d.enxoval_id = $1 ORDER BY d.created_at DESC
    `, [req.params.id]);
    const usage = await getPool().query<{ used: string }>(`
      SELECT COALESCE(SUM(d.size_bytes), 0) AS used FROM item_documents d
      INNER JOIN enxovais e ON e.id = d.enxoval_id
      WHERE e.owner_id = (SELECT owner_id FROM enxovais WHERE id = $1)
    `, [req.params.id]);
    res.json({ documents: result.rows.map(mapDocument), usedBytes: Number(usage.rows[0]?.used ?? 0), quotaBytes: documentQuotaBytes() });
  }));

  router.get('/documents/:id/file', asyncHandler(async (req, res) => {
    const user = await deps.requireUser(req);
    const document = await documentOf(getPool(), deps, user.id, req.params.id);
    const signed = presignedDownloadUrl(document.storage_key, document.file_name);
    if (signed) {
      res.redirect(302, signed);
      return;
    }
    const data = await readDocument(getPool(), document.storage_key);
    res.set({
      'Content-Type': document.content_type,
      'Content-Length': String(data.length),
      'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(data);
  }));

  router.delete('/documents/:id', asyncHandler(async (req, res) => {
    const user = await deps.requireUser(req);
    const item = await withTransaction(async client => {
      const document = await documentOf(client, deps, user.id, req.params.id);
      await client.query('DELETE FROM item_documents WHERE id = $1', [document.id]);
      await client.query('UPDATE items SET updated_at = now() WHERE id = $1', [document.item_id]);
      return deps.fetchItemRow(client, document.item_id, document.enxoval_id);
    });
    res.json(item);
  }));

  // Baixa os documentos do enxoval (ou de um ambiente) num ZIP, organizados por ambiente e item.
  router.get('/enxovais/:id/documents.zip', rateLimit(10, 10 * 60_000), asyncHandler(async (req, res) => {
    const user = await deps.requireUser(req);
    await deps.requireEnxovalMember(getPool(), user.id, req.params.id);
    const categoryId = typeof req.query.categoryId === 'string' && req.query.categoryId ? req.query.categoryId : null;
    const result = await getPool().query<{ storage_key: string; file_name: string; kind: ItemDocumentKind; item_name: string; category: string; created_at: Date; enxoval_name: string }>(`
      SELECT d.storage_key, d.file_name, d.kind, i.name AS item_name, c.name AS category, d.created_at, e.name AS enxoval_name
      FROM item_documents d
      INNER JOIN items i ON i.id = d.item_id
      INNER JOIN categories c ON c.id = i.category_id
      INNER JOIN enxovais e ON e.id = d.enxoval_id
      WHERE d.enxoval_id = $1 AND ($2::text IS NULL OR i.category_id::text = $2)
      ORDER BY c.sort_order, i.sort_order, d.created_at
    `, [req.params.id, categoryId]);
    if (result.rows.length === 0) throw new HttpError(404, 'Ainda não há documentos para baixar.');
    const base = (result.rows[0].enxoval_name.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'enxoval');
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`documentos-${base}.zip`)}`,
      'Cache-Control': 'private, no-store',
    });
    const zip = new ZipWriter(res);
    const taken = new Set<string>();
    try {
      for (const row of result.rows) {
        const data = await readDocument(getPool(), row.storage_key);
        await zip.add(uniqueZipName(taken, `${row.category}/${row.item_name} - ${KIND_LABEL[row.kind]} - ${row.file_name}`), data, row.created_at);
      }
      await zip.finish();
    } catch (err) {
      // Os cabeçalhos já saíram: não há como responder um erro JSON. Corta a conexão para o download não parecer completo.
      getLogger().error({ event: 'documents.zip.failed', enxovalId: req.params.id, err }, 'Document ZIP failed.');
      res.destroy(err instanceof Error ? err : undefined);
    }
  }));
}
