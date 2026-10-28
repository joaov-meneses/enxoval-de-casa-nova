// Browser tests use a real HTTP fixture behind the production assets, so context.setOffline truly blocks API calls.
import express from 'express';
import path from 'node:path';
const app = express();
app.use(express.json());
let networkOffline = false;
app.post('/__test/network', (req, res) => { networkOffline = req.body.offline === true; res.json({ offline: networkOffline }); });
app.use((req, res, next) => {
  if (networkOffline && !req.path.startsWith('/__test/')) { res.destroy(); return; }
  next();
});
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const home = { id: 'home', name: 'Casa de teste', ownerId: 'owner', ownerName: 'Ana', role: 'owner', discountCents: 0, moveDate: '2026-12-05', state: 'SP', city: null, spendingTier: 'equilibrado' };
const user = { id: 'owner', name: 'Ana', email: 'ana@example.invalid', plan: 'monthly', onboardingCompleted: true, emailVerified: true };
const categories = [{ id: 'kitchen', name: 'Cozinha', sortOrder: 0 }];
let items, patches;
const reset = () => {
  networkOffline = false;
  patches = [];
  items = [{ id: 'fridge', name: 'Geladeira', status: 'bought', checked: true, documentCount: 1, purchasedAt: '2026-10-01', priceCents: 10000 },
    { id: 'pan', name: 'Panela', status: 'researching', checked: false, priceCents: 5000 },
    { id: 'toaster', name: 'Torradeira', status: 'researching', checked: false, priceCents: 8000 }].map((item, index) => ({ ...item, categoryId: 'kitchen', category: 'Cozinha', link: '', description: '', quantity: 1, discountCents: 0, sortOrder: index,
      buyWeek: null, priceCategory: null, priority: null, timing: null, offers: [], installments: 1, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-24T12:00:00Z' }));
};
reset();
app.post('/__test/reset', (_req, res) => { reset(); res.json({}); });
app.get('/__test/state', (_req, res) => res.json({ items, patches }));
app.get('/api/bootstrap', (_req, res) => res.json({ user, activeEnxoval: home, enxovais: [home], categories, items, members: [] }));
app.get('/api/billing/status', (_req, res) => res.json({ available: true, plan: 'monthly', status: 'active', accessAllowed: true, isOwner: true, trialUsed: true }));
app.get('/api/ai/status', (_req, res) => res.json({ enabled: false }));
app.get('/api/enxovais/:id/housewarming/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders(); res.write(': ready\n\n');
  req.on('close', () => res.end());
});
app.get('/api/items/fridge/documents', (_req, res) => res.json({ documents: [{ id: 'receipt', itemId: 'fridge', kind: 'invoice', fileName: 'nota-teste.png', contentType: 'image/png', sizeBytes: 12000, createdAt: '2026-10-24T12:00:00Z', url: '/api/documents/receipt/file' }] }));
app.post('/api/documents/receipt/read-receipt', (_req, res) => res.json({ preview: { storeName: 'CASA TESTE LTDA', purchasedAt: '2026-10-23', totalCents: 12345, confidence: .95, multipleItems: true, method: 'local_ocr' }, cached: false }));
app.patch('/api/items/:id', (req, res) => {
  patches.push({ id: req.params.id, ...req.body });
  items = items.map(item => item.id === req.params.id ? { ...item, ...req.body, checked: req.body.status ? req.body.status !== 'researching' : item.checked } : item);
  res.json(items.find(item => item.id === req.params.id));
});
app.use('/api', (_req, res) => res.json({}));
app.use(express.static(path.resolve('dist')));
app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
app.listen(Number(process.env.STORE_TEST_PORT ?? 4176), '127.0.0.1', () => console.log('Offline browser fixture listening on 4176'));
