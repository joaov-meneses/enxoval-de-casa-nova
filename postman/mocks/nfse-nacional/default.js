// Contrato: Manual Contribuintes API v1.2 + DPS XSD v1.01-20260209 (gov.br/nfse).
// A simulação HTTP não atesta mTLS, cadeia ICP-Brasil nem habilitação fiscal.
const http = require('node:http');
const { gunzipSync, gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('content-type', 'application/json');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (path === '/test/reset') {
    for (const [k,v] of Object.entries({ records: {}, requests: [], mode: 'normal' })) await pm.state.set(`national.${k}`,v);
    return send(200, {});
  }
  if (path === '/test/mode') { const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    await pm.state.set('national.mode', body.mode); return send(200, {}); }
  if (path === '/test/requests') return send(200, await pm.state.get('national.requests') || []);
  const requests = await pm.state.get('national.requests') || [];
  requests.push({ method: req.method, path, body: req.body }); await pm.state.set('national.requests', requests);
  const mode = await pm.state.get('national.mode') || 'normal';
  if (mode === 'unavailable') return send(503, { erros: [{ Codigo: 'E999', Descricao: 'Indisponível' }] });
  if (mode === 'html-error') { res.setHeader('content-type','text/html'); res.statusCode=502; return res.end('<h1>Bad Gateway</h1>'); }
  const records = await pm.state.get('national.records') || {};
  if (req.method === 'POST' && path === '/nfse') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    let xml;
    try { xml = gunzipSync(Buffer.from(body.dpsXmlGZipB64,'base64')).toString('utf8'); }
    catch { return send(400, { erros: [{ Codigo: 'E_SCHEMA', Descricao: 'DPS inválida' }] }); }
    const id = xml.match(/<infDPS Id="(DPS\d{42})"/)?.[1];
    if (mode === 'rejected' || !id || !xml.includes('<Signature')) return send(400, { erros: [{ Codigo: 'E_TEST', Descricao: 'Rejeição de teste' }] });
    if (records[id]) return send(400, { erros: [{ Codigo: 'E_DUPLICATE', Descricao: 'DPS já convertida' }] });
    const key = '2' + BigInt('0x' + createHash('sha256').update(id).digest('hex')).toString().slice(0,49).padStart(49,'0');
    const number = String(Object.keys(records).length + 1);
    const nfse = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${key}"><nNFSe>${number}</nNFSe>${xml}</infNFSe></NFSe>`;
    records[id] = { chaveAcesso: key, nfseXmlGZipB64: gzipSync(Buffer.from(nfse)).toString('base64') };
    await pm.state.set('national.records',records);
    if (mode === 'accepted-error') return send(503, { erros: [{ Codigo: 'E999' }] });
    if (mode === 'accepted-timeout') return setTimeout(() => send(201, records[id]), 700);
    if (mode === 'malformed-success') return send(201, {});
    return send(201, records[id]);
  }
  if (req.method === 'GET' && /^\/dps\/DPS\d{42}$/.test(path)) {
    const record = records[path.split('/').at(-1)];
    return record ? send(200, { chaveAcesso: record.chaveAcesso }) : send(404, { erros: [{ Codigo: 'E_NOT_FOUND' }] });
  }
  if (req.method === 'GET' && /^\/nfse\/\d{50}$/.test(path)) {
    const record = Object.values(records).find(r => r.chaveAcesso === path.split('/').at(-1));
    return record ? send(200, record) : send(404, { erros: [{ Codigo: 'E_NOT_FOUND' }] });
  }
  send(501, { error: 'Outside this simulation contract' });
}).listen(process.env.PORT || 4912);
