// Local OTLP collector: validates the batch envelope and retains it for assertions.
const http = require('node:http');
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST' && path === '/v1/logs') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !Array.isArray(body.resourceLogs)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Expected an OTLP resourceLogs array' }));
    }
    const batches = await pm.state.get('telemetry.batches') || [];
    batches.push(body);
    await pm.state.set('telemetry.batches', batches);
    return res.end('{}');
  }
  // Local test support endpoints; not part of the provider's API.
  if (req.method === 'GET' && path === '/test/records') {
    return res.end(JSON.stringify(await pm.state.get('telemetry.batches') || []));
  }
  if (req.method === 'POST' && path === '/test/reset') {
    await pm.state.set('telemetry.batches', []);
    return res.end('{}');
  }
  res.statusCode = 501;
  res.end(JSON.stringify({ error: 'Outside this simulation contract' }));
}).listen(process.env.PORT || 4901);
