// Contratos: https://docs.stripe.com/api/checkout/sessions/create (API 2026-09-30), prices/retrieve e customers/create.
const http = require('node:http');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  res.setHeader('content-type', 'application/json');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (path === '/test/reset') { await pm.state.set('stripe.requests', []); await pm.state.set('stripe.fixtures', {}); return send(200, {}); }
  if (path === '/test/fixtures' && req.method === 'POST') {
    await pm.state.set('stripe.fixtures', typeof req.body === 'string' ? JSON.parse(req.body) : req.body); return send(200, {});
  }
  if (path === '/test/requests') return send(200, await pm.state.get('stripe.requests') || []);
  if (req.headers.authorization !== 'Bearer sk_test_simulation') return send(401, { error: { message: 'Invalid API key' } });
  const raw = typeof req.body === 'string' ? req.body : new URLSearchParams(req.body || {}).toString();
  const requests = await pm.state.get('stripe.requests') || [];
  requests.push({ method: req.method, path, body: raw }); await pm.state.set('stripe.requests', requests);
  const fixtures = await pm.state.get('stripe.fixtures') || {};
  if (fixtures.failure === path) return send(503, { error: { message: 'Simulated upstream unavailable' } });
  const list = (items) => {
    const after = url.searchParams.get('starting_after');
    const start = after ? items.findIndex(x => x.id === after) + 1 : 0;
    const size = fixtures.pageSize || 100;
    return send(200, { object: 'list', data: items.slice(start, start + size), has_more: start + size < items.length, url: `/v1${path}` });
  };
  if (req.method === 'GET' && path === '/checkout/sessions') {
    const intent = url.searchParams.get('payment_intent');
    return list((fixtures.sessions || []).filter(x => !intent || x.payment_intent === intent));
  }
  if (req.method === 'GET' && path === '/invoices') return list(fixtures.invoices || []);
  if (req.method === 'GET' && path === '/refunds') return list((fixtures.refunds || []).filter(x => !url.searchParams.get('charge') || x.charge === url.searchParams.get('charge')));
  if (req.method === 'GET' && path === '/invoice_payments') return list((fixtures.invoicePayments || []).filter(x =>
    (!url.searchParams.get('invoice') || x.invoice === url.searchParams.get('invoice')) &&
    (!url.searchParams.get('payment[payment_intent]') || x.payment.payment_intent === url.searchParams.get('payment[payment_intent]'))));
  if (req.method === 'GET') {
    for (const [prefix, name] of [['/checkout/sessions/', 'sessions'], ['/invoices/', 'invoices'], ['/charges/', 'charges'], ['/payment_intents/', 'intents']]) {
      if (path.startsWith(prefix)) {
        const item = (fixtures[name] || []).find(x => x.id === path.slice(prefix.length));
        return item ? send(200, item) : send(404, { error: { code: 'resource_missing', message: 'No such test fixture' } });
      }
    }
  }
  if (req.method === 'GET' && path.startsWith('/prices/')) {
    const pass = path.endsWith('price_pass');
    return send(200, { id: pass ? 'price_pass' : 'price_monthly', object: 'price', active: true, unit_amount: pass ? 9900 : 2990, currency: 'brl', type: pass ? 'one_time' : 'recurring', recurring: pass ? null : { interval: 'month', interval_count: 1 } });
  }
  if (req.method === 'POST' && path === '/customers') return send(200, { id: 'cus_simulation', object: 'customer' });
  if (req.method === 'POST' && path === '/checkout/sessions') {
    const params = new URLSearchParams(raw);
    if ([...params.keys()].some(key => key.startsWith('payment_method_types'))) return send(400, { error: { message: 'payment_method_types is no longer supported' } });
    return send(200, { id: 'cs_simulation', object: 'checkout.session', url: 'https://checkout.stripe.test/pay', expires_at: Math.floor(Date.now() / 1000) + 3600 });
  }
  send(501, { error: { message: 'Outside this simulation contract' } });
}).listen(process.env.PORT || 4911);
