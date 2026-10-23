// Local fixtures follow BootstrapData/EnxovalWorkspace and the existing /bootstrap fallback contract.
const http = require('node:http');
const user = { id: 'owner', name: 'Ana', email: 'ana@example.invalid', plan: 'monthly', isGuest: false, emailVerified: true, onboardingCompleted: true };
const home = { id: 'home', name: 'Nossa casa nova', ownerId: 'owner', role: 'owner', discountCents: 0, moveDate: null, state: 'BA', city: null, spendingTier: 'equilibrado' };
const other = { ...home, id: 'other', name: 'Casa compartilhada', ownerId: 'leo', ownerName: 'Léo', role: 'editor' };
function workspace(enxoval) {
  const categories = enxoval.id === 'home'
    ? [{ id: 'bedroom', name: 'Quarto', sortOrder: 0 }, { id: 'bath', name: 'Banheiro', sortOrder: 1 }]
    : [{ id: 'office', name: 'Escritório', sortOrder: 0 }];
  const items = (enxoval.id === 'home'
    ? [{ id: 'bed', name: 'Cama', categoryId: 'bedroom', category: 'Quarto' }, { id: 'towel', name: 'Toalhas de banho', categoryId: 'bath', category: 'Banheiro' }]
    : [{ id: 'desk', name: 'Mesa de trabalho', categoryId: 'office', category: 'Escritório' }])
    .map(item => ({ ...item, checked: false, status: 'researching', link: '', description: '', quantity: 1, priceCents: null, discountCents: 0, sortOrder: 0, priceCategory: null, priority: null, timing: null, buyWeek: -1, updatedAt: '2026-10-19T12:00:00Z' }));
  return { enxoval, categories, items, members: [] };
}
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (url.pathname === '/test/configure' && req.method === 'POST') {
    await pm.state.set('workspace.config', typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    return send(200, {});
  }
  const config = await pm.state.get('workspace.config') || {};
  if (url.pathname === '/api/auth/login') {
    await pm.state.set('workspace.config', { ...config, signedOut: false });
    return send(200, { user, enxovais: [home, other], activeEnxoval: home, ...workspace(home) });
  }
  if (config.signedOut) return send(401, { error: 'Faça login para continuar.' });
  const homes = [home, other].filter(item => !config.homes || config.homes.includes(item.id));
  if (url.pathname === '/api/bootstrap') {
    const requested = url.searchParams.get('enxovalId');
    if (config.delayFor === requested) await new Promise(resolve => setTimeout(resolve, 800));
    if (config.failFor === requested) return send(503, { error: 'Não foi possível abrir o enxoval.' });
    const selected = homes.find(item => item.id === requested) || homes[0];
    return send(200, { user, enxovais: homes, activeEnxoval: selected || null, ...(selected ? workspace(selected) : { categories: [], items: [], members: [] }) });
  }
  if (url.pathname.startsWith('/api/enxovais/')) {
    const selected = homes.find(item => url.pathname === `/api/enxovais/${item.id}`);
    return selected ? send(200, workspace(selected)) : send(404, { error: 'Enxoval não encontrado.' });
  }
  if (url.pathname === '/api/billing/status') return send(200, { available: true, plan: 'monthly', status: 'active', accessAllowed: true, isOwner: url.searchParams.get('enxovalId') !== 'other', trialUsed: true, trialNotice: null });
  if (url.pathname === '/api/ai/status' || url.pathname.startsWith('/api/ai/')) return send(200, { available: false });
  if (url.pathname === '/api/auth/activity') { res.statusCode = 204; return res.end(); }
  if (url.pathname === '/api/catalog/suggestions') return send(200, { items: [] });
  send(501, { error: 'Outside the workspace navigation contract' });
}).listen(process.env.PORT || 4906);
