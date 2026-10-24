// Contrato do SDK instalado (@typesafe-ai/sdk 0.7), restrito à consulta sintética de check-jev.mjs.
const http = require('node:http');
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const path = new URL(req.url, 'http://localhost').pathname;
  // Controles locais do teste, fora do contrato do provedor.
  if (req.method === 'POST' && path === '/test/mode') {
    await pm.state.set('jev.mode', req.body.mode);
    return res.end('{}');
  }
  if (req.method === 'POST' && path === '/v1/systemone') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body?.state?.item !== 'Panela de cozinha' || body.questions?.ambiente?.type !== 'choice'
      || !Object.hasOwn(body.questions.ambiente.criteria, 'Cozinha') || !body.model) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Unexpected verification request' }));
    }
    const mode = await pm.state.get('jev.mode');
    if (mode === 'unauthorized') {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: 'Invalid API key: do-not-print-provider-body' }));
    }
    return res.end(JSON.stringify({
      model: body.model,
      answers: { ambiente: { type: 'choice', choice: mode === 'invalid' ? 'Quarto' : 'Cozinha', confidence: 0.99, probabilities: { Cozinha: 0.99, Quarto: 0.01 } } },
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
  }
  res.statusCode = 501;
  res.end(JSON.stringify({ error: 'Outside this simulation contract' }));
}).listen(process.env.PORT || 4902);
