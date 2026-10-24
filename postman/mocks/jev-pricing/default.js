// SDK systemOne envelope follows the existing Jev contract; this mock adds the price-comparison question shape.
const http = require('node:http');
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const json = (code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  if (req.method === 'POST' && path === '/test/mode') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    await pm.state.set('jev.pricing.mode', body.mode); return json(200, {});
  }
  if (req.method !== 'POST' || path !== '/v1/systemone') return json(501, { error: 'Outside price comparison contract' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (body.state?.tarefa !== 'comparabilidade_de_precos_v1' || !Array.isArray(body.state.candidatos) || !body.model) return json(400, { error: 'Invalid comparison contract' });
  const mode = await pm.state.get('jev.pricing.mode');
  if (mode === 'unavailable') return json(503, { error: 'unavailable' });
  const answers = {};
  for (const [key, question] of Object.entries(body.questions)) {
    if (!/^preco_\d+$/.test(key) || question.type !== 'choice' || !question.criteria.comparavel || !question.criteria.diferente) return json(400, { error: 'Invalid question' });
    const name = body.state.candidatos[Number(key.slice(6))];
    answers[key] = { type: 'choice', choice: /incompat[ií]vel|filtro|acess[oó]rio/i.test(name) ? 'diferente' : 'comparavel', confidence: mode === 'uncertain' ? 0.4 : 0.99 };
  }
  return json(200, { model: body.model, answers, usage: { input_tokens: 10, output_tokens: 5 } });
}).listen(process.env.PORT);
