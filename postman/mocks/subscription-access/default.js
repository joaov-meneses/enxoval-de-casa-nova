// Contrato existente de GET /api/billing/status, exercitado pelo cliente HTTP do app.
const http = require('node:http');
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/test/configure') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    await pm.state.set('subscription.config', body);
    return res.end('{}');
  }
  if (req.method === 'GET' && url.pathname === '/api/billing/status') {
    const config = await pm.state.get('subscription.config') || {};
    const room = url.searchParams.get('enxovalId') || 'account';
    const selected = config.scopes?.[room] || config;
    if (selected.delayMs) await new Promise(resolve => setTimeout(resolve, selected.delayMs));
    res.statusCode = selected.httpStatus || 200;
    if (res.statusCode !== 200) return res.end(JSON.stringify({ error: selected.httpStatus === 401 ? 'Sua sessão terminou.' : 'Não foi possível atualizar seu acesso.' }));
    return res.end(JSON.stringify({
      fiscalEnabled: false, fiscalNeedsData: false, available: true, accessAllowed: true,
      isOwner: true, trialUsed: true, plan: 'monthly', status: 'active',
      trialNotice: null, trialEndsAt: null, subscriptionId: 'sub_test', passExpiresAt: null,
      passNotice: null, monthlyPrice: { amount: 2990, currency: 'brl' },
      ...selected.status,
    }));
  }
  res.statusCode = 501;
  res.end(JSON.stringify({ error: 'Outside this UI simulation contract' }));
}).listen(process.env.PORT || 4904);
