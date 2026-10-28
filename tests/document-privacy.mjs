import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createLogger } from '../server/logger.ts';
import { createHttpLogging } from '../server/httpLogging.ts';

test('logs de documentos omitem bytes, dados da nota, nome do arquivo, cookies e URL assinada', async () => {
  const logs = [];
  const app = express();
  app.use(createHttpLogging(createLogger({ write: line => logs.push(JSON.parse(line)) })));
  app.post('/api/items/item/documents', express.raw({ type: '*/*' }), (_req, res) => res.json({ fileName: 'PRIVATE_DOCUMENT_NAME.png' }));
  app.post('/api/documents/doc/read-receipt', (_req, res) => res.json({ preview: { storeName: 'PRIVATE_RECEIPT_STORE', totalCents: 12345 } }));
  app.get('/api/documents/doc/file', (_req, res) => res.redirect('https://example.invalid/file?X-Amz-Signature=PRIVATE_SIGNED_URL'));
  app.get('/api/documents/raw/file', (_req, res) => res.set('Content-Disposition', 'attachment; filename="PRIVATE_DOWNLOAD_NAME.png"').send(Buffer.from('PRIVATE_DOWNLOAD_BYTES')));
  const server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const bytes = Buffer.from('PRIVATE_RECEIPT_IMAGE_BYTES');
  try {
    await (await fetch(`${base}/api/items/item/documents?name=PRIVATE_DOCUMENT_NAME.png`, { method: 'POST', headers: { 'Content-Type': 'image/png', Cookie: 'session=PRIVATE_COOKIE' }, body: bytes })).text();
    await (await fetch(`${base}/api/documents/doc/read-receipt`, { method: 'POST' })).text();
    await fetch(`${base}/api/documents/doc/file`, { redirect: 'manual' });
    await (await fetch(`${base}/api/documents/raw/file`)).arrayBuffer();
    const serialized = JSON.stringify(logs);
    for (const sensitive of ['PRIVATE_DOCUMENT_NAME', 'PRIVATE_RECEIPT_STORE', 'PRIVATE_RECEIPT_IMAGE_BYTES', bytes.toString('base64'), 'PRIVATE_COOKIE', 'PRIVATE_SIGNED_URL', 'PRIVATE_DOWNLOAD_NAME', 'PRIVATE_DOWNLOAD_BYTES']) assert.ok(!serialized.includes(sensitive), sensitive);
    assert.ok(logs.some(log => log.event === 'http.request.completed'));
    assert.ok(serialized.includes('redacted'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
