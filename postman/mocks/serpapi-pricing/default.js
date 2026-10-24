// From postman/contracts/catalog-pricing.openapi.yaml and SerpApi's published response fields.
const http = require('node:http');
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const json = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
  if (req.method === 'POST' && path === '/test/state') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    for (const [key, value] of Object.entries(body)) await pm.state.set(`serpapi.pricing.${key}`, value);
    return json(200, {});
  }
  if (req.method === 'GET' && path === '/test/state') return json(200, {
    searches: await pm.state.get('serpapi.pricing.searches') || 0,
    queries: await pm.state.get('serpapi.pricing.queries') || [],
  });
  const mode = await pm.state.get('serpapi.pricing.mode') || 'success';
  if (req.method === 'GET' && path === '/account.json') {
    if (req.query.api_key !== 'simulation-key') return json(401, { error: 'Invalid API key' });
    return json(200, { plan_searches_left: await pm.state.get('serpapi.pricing.remaining') ?? 250 });
  }
  if (req.method === 'GET' && path === '/search.json') {
    const q = req.query;
    if (q.api_key !== 'simulation-key' || q.engine !== 'google_shopping' || q.gl !== 'br' || q.hl !== 'pt' || String(q.no_cache) !== 'true' || !q.q) return json(400, { error: 'Invalid search contract' });
    await pm.state.set('serpapi.pricing.searches', (await pm.state.get('serpapi.pricing.searches') || 0) + 1);
    await pm.state.set('serpapi.pricing.queries', [...(await pm.state.get('serpapi.pricing.queries') || []), q.q]);
    if (mode === 'timeout') { await new Promise(resolve => setTimeout(resolve, 600)); }
    if (mode === 'html') { res.statusCode = 500; return res.end('<html>upstream unavailable</html>'); }
    if (mode === 'unauthorized') return json(401, { error: 'secret-provider-body' });
    if (mode === 'rate-limit') return json(429, { error: 'limit' });
    if (mode === 'error') return json(500, { error: 'upstream unavailable' });
    if (mode === 'invalid') return json(200, { error: 'invalid query' });
    const name = q.q.replace(/ novo$/, '');
    const make = (source, price, title = name) => ({ title, source, price: `R$ ${price},00`, extracted_price: price, product_link: `https://loja.example.invalid/${encodeURIComponent(source)}` });
    return json(200, { search_metadata: { status: 'Success' }, shopping_results: mode === 'empty' ? [] : [
      make('Loja A', 100), make('Loja A', 120), make('Loja B', 140),
      make('Loja C', 1, `Acessório incompatível para ${name}`),
      { ...make('Usados', 5), second_hand_condition: 'used' },
      { ...make('Parcela', 10), price: '10x R$ 10,00' },
      { ...make('Dólar', 10), price: '$10.00' },
    ] });
  }
  return json(501, { error: 'Outside pricing dependency contract' });
}).listen(process.env.PORT);
