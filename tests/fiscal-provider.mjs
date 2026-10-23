import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildFiscalPayload, FiscalDpsSchemaError } from '../server/fiscal/dps.ts';
import { fiscalConfig, fiscalPolicy, parseNationalInvoice } from '../server/fiscal/provider.ts';

const tax = { cnpj:'04252011000110',municipio:'2905701',municipioPrestacao:'2905701',serie:'40000',primeiroNumero:'1',
  opSimpNac:'3',regApTribSN:'1',regEspTrib:'0',cTribNac:'010701',descricao:'Teste sintético',tribISSQN:'1',tpRetISSQN:'1',pTotTribSN:'6.00' };
function configEnv() {
  Object.assign(process.env,{NFSE_NACIONAL_ENVIRONMENT:'homologacao',NFSE_NACIONAL_BASE_URL:'',NFSE_NACIONAL_ISSUER_ENABLED:'true',
    NFSE_NACIONAL_CERT_PATH:'tests/fixtures/nfse/test-cert.pem',NFSE_NACIONAL_KEY_PATH:'tests/fixtures/nfse/test-key.pem',
    NFSE_NACIONAL_ACCOUNTING_REFERENCE:'Orientação sintética',NFSE_NACIONAL_TAX_CONFIG:JSON.stringify(tax),NFSE_NACIONAL_REQUIRE_ADDRESS:'false'});
}
test('certificado/chave, host oficial e orientação são exigidos; política padrão manual',()=>{
  configEnv(); delete process.env.NFSE_NACIONAL_ISSUE_ON;
  assert.equal(fiscalPolicy().timing,'manual');
  assert.equal(fiscalConfig().baseUrl,'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional');
  for (const [name,value] of [['NFSE_NACIONAL_BASE_URL','https://example.invalid'],['NFSE_NACIONAL_ISSUER_ENABLED','false'],
    ['NFSE_NACIONAL_ACCOUNTING_REFERENCE',''],['NFSE_NACIONAL_KEY_PATH','missing-key.pem']]) {
    configEnv(); process.env[name]=value; assert.throws(()=>fiscalConfig(),/FISCAL_CONFIGURATION/);
  }
  configEnv(); process.env.NFSE_NACIONAL_ENVIRONMENT='producao';
  assert.equal(fiscalConfig().baseUrl,'https://sefin.nfse.gov.br/SefinNacional');
  process.env.NFSE_NACIONAL_BASE_URL='http://127.0.0.1:4928/national';
  process.env.NFSE_NACIONAL_ALLOW_LOCAL_SIMULATION='true'; assert.throws(()=>fiscalConfig());
});
test('XSD rejeita tributação malformada antes da transmissão e registra diagnóstico',async()=>{
  configEnv(); const config=fiscalConfig();
  await assert.rejects(()=>buildFiscalPayload({...config,tax:{...tax,cTribNac:'INVALID'}},{name:'Pessoa de Teste',document:'52998224725'},2990,new Date(),'monthly','2026-10-01','1'),
    error=>error instanceof FiscalDpsSchemaError && Array.isArray(error.details) && error.details.length>0);
});
test('resposta só autoriza a DPS esperada; rejeita chave divergente e entidade XML externa',()=>{
  const id='DPS290570120425201100011040000000000000000001';
  const key='2'.repeat(50);
  const xml=`<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${key}"><nNFSe>123</nNFSe><DPS><infDPS Id="${id}"/></DPS></infNFSe></NFSe>`;
  const data={chaveAcesso:key,nfseXmlGZipB64:gzipSync(Buffer.from(xml)).toString('base64')};
  assert.equal(parseNationalInvoice(data,id).number,'123');
  assert.throws(()=>parseNationalInvoice(data,id+'1'));
  assert.throws(()=>parseNationalInvoice({...data,chaveAcesso:'3'.repeat(50)},id));
  const malicious='<!DOCTYPE NFSe [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'+xml;
  assert.throws(()=>parseNationalInvoice({...data,nfseXmlGZipB64:gzipSync(Buffer.from(malicious)).toString('base64')},id));
});
test('transporte HTTPS autentica certificado de cliente em servidor mTLS local',async()=>{
  configEnv();
  let authenticated=false;
  const server=createServer({key:readFileSync('tests/fixtures/nfse/test-server-key.pem'),cert:readFileSync('tests/fixtures/nfse/test-server-cert.pem'),
    ca:readFileSync('tests/fixtures/nfse/test-cert.pem'),requestCert:true,rejectUnauthorized:true},(req,res)=>{
    authenticated=req.socket.authorized && req.socket.getPeerCertificate().subject.CN.includes('LOCAL TEST ONLY');
    res.setHeader('content-type','application/json');res.end(JSON.stringify({authenticated}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const result=await promisify(execFile)(process.execPath,['--import','tsx','tests/fixtures/nfse/mtls-client.mjs',`https://127.0.0.1:${server.address().port}`],
      {env:{...process.env,NODE_EXTRA_CA_CERTS:resolve('tests/fixtures/nfse/test-server-cert.pem')},timeout:15000});
    assert.match(result.stdout,/authenticated/);assert.equal(authenticated,true);
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});
