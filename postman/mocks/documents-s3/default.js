// Minimal S3 PUT/GET/DELETE contract used by objectStorage.ts. No real credentials or customer files.
const http = require('node:http');
const objects = new Map();
const metrics = { put: 0, get: 0, delete: 0 };
let mode = 'success';
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/test/state') {
    if (req.method === 'POST') { const chunks = []; for await (const part of req) chunks.push(part); mode = JSON.parse(Buffer.concat(chunks).toString()).mode; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...metrics, size: objects.size, mode })); return;
  }
  if (!url.pathname.startsWith('/test-documents/documentos/')) { res.writeHead(501).end(); return; }
  if (mode === 'unavailable') { res.writeHead(503).end('<html>Storage unavailable</html>'); return; }
  if (!req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ') && !url.searchParams.has('X-Amz-Signature')) { res.writeHead(403).end(); return; }
  const key = url.pathname;
  if (req.method === 'PUT') {
    const chunks = []; for await (const part of req) chunks.push(part);
    objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); metrics.put++; res.writeHead(200).end(); return;
  }
  if (req.method === 'GET') {
    metrics.get++; const object = objects.get(key);
    if (!object) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', object.type || 'application/octet-stream'); res.end(object.body); return;
  }
  if (req.method === 'DELETE') { objects.delete(key); metrics.delete++; res.writeHead(204).end(); return; }
  res.writeHead(501).end();
}).listen(process.env.PORT);
