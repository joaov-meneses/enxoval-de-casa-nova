import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { X509Certificate } from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import { validateXML } from 'xmllint-wasm/index-node.js';
import { validTaxDocument, type FiscalConfig, type FiscalRecipient } from './provider.ts';

const namespace = 'http://www.sped.fazenda.gov.br/nfse';
const c14n = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const tag = (name: string, value: unknown) => value === undefined || value === '' ? '' : `<${name}>${escape(value)}</${name}>`;
function group(name: string, value: unknown): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || value === null || value === undefined) throw new Error('FISCAL_CONFIGURATION');
  if (Array.isArray(value)) return value.map(v => group(name, v)).join('');
  return typeof value === 'object' ? `<${name}>${Object.entries(value).map(([k,v]) => group(k,v)).join('')}</${name}>` : tag(name, value);
}
const schemas = ['DPS_v1.01.xsd', 'tiposComplexos_v1.01.xsd', 'tiposSimples_v1.01.xsd', 'xmldsig-core-schema.xsd']
  .map(fileName => ({ fileName, contents: readFileSync(new URL(`./schemas/1.01/${fileName}`, import.meta.url), 'utf8')
    // O XSD oficial usa âncoras ECMAScript nesta única expressão; libxml2 segue regex XSD,
    // em que ^/$ são literais. O campo série é validado também de forma estrita no config.
    .replace('value="^0{0,4}\\d{1,5}$"', 'value="0{0,4}\\d{1,5}"') }));
export const dpsIdentifier = (config: FiscalConfig, number: string) =>
  `DPS${config.tax.municipio}2${config.tax.cnpj}${config.tax.serie.padStart(5, '0')}${number.padStart(15, '0')}`;

export interface DpsPayload { idDPS: string; xml: string; dpsXmlGZipB64: string }
export class FiscalDpsSchemaError extends Error {
  constructor(public details: unknown) { super('FISCAL_DPS_SCHEMA_INVALID'); }
}
export async function buildFiscalPayload(config: FiscalConfig, recipient: FiscalRecipient, amountCents: number,
  issuedAt: Date, plan: string, competence: string, number: string): Promise<DpsPayload> {
  if (!recipient.name || !recipient.document || !validTaxDocument(recipient.document)) throw new Error('FISCAL_RECIPIENT_REQUIRED');
  const address = recipient.address;
  if (config.requireAddress && (!address?.logradouro || !address.numero || !address.bairro ||
      !/^\d{7}$/.test(address.codigo_municipio) || !/^\d{8}$/.test(address.cep))) throw new Error('FISCAL_RECIPIENT_REQUIRED');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(competence) || !/^[1-9]\d{0,14}$/.test(number)) throw new Error('FISCAL_CONFIGURATION');
  const t = config.tax;
  const idDPS = dpsIdentifier(config, number);
  const end = address?.logradouro ? `<end><endNac>${tag('cMun', address.codigo_municipio)}${tag('CEP', address.cep)}</endNac>${tag('xLgr', address.logradouro)}${tag('nro', address.numero)}${tag('xCpl', address.complemento)}${tag('xBairro', address.bairro)}</end>` : '';
  const xml = `<DPS xmlns="${namespace}" versao="1.01"><infDPS Id="${idDPS}">` +
    tag('tpAmb', config.environment === 'producao' ? '1' : '2') + tag('dhEmi', issuedAt.toISOString().replace(/\.\d{3}Z$/, '+00:00')) +
    tag('verAplic', 'CasaMia_1.0') + tag('serie', t.serie) + tag('nDPS', number) + tag('dCompet', competence) + tag('tpEmit', '1') + tag('cLocEmi', t.municipio) +
    `<prest>${tag('CNPJ', t.cnpj)}${tag('IM', t.inscricaoMunicipal)}<regTrib>${tag('opSimpNac', t.opSimpNac)}${tag('regApTribSN', t.regApTribSN)}${tag('regEspTrib', t.regEspTrib)}</regTrib></prest>` +
    `<toma>${tag(recipient.document.length === 11 ? 'CPF' : 'CNPJ', recipient.document)}${tag('xNome', recipient.name)}${end}${tag('email', recipient.email)}</toma>` +
    `<serv><locPrest>${tag('cLocPrestacao', t.municipioPrestacao)}</locPrest><cServ>${tag('cTribNac', t.cTribNac)}${tag('cTribMun', t.cTribMun)}${tag('xDescServ', `${t.descricao} — ${plan === 'pass' ? 'Passe da Casa Nova' : 'Assinatura mensal'}`)}${tag('cNBS', t.cNBS)}</cServ></serv>` +
    `<valores><vServPrest>${tag('vServ', (amountCents / 100).toFixed(2))}</vServPrest><trib><tribMun>${tag('tribISSQN', t.tribISSQN)}${tag('tpRetISSQN', t.tpRetISSQN)}${tag('pAliq', t.pAliq)}</tribMun><totTrib>${t.opSimpNac === '2' ? tag('indTotTrib', '0') : tag('pTotTribSN', t.pTotTribSN)}</totTrib></trib></valores>` +
    (t.IBSCBS ? group('IBSCBS', t.IBSCBS) : '') + '</infDPS></DPS>';
  const signature = new SignedXml({ privateKey: config.key, publicCert: new X509Certificate(config.cert).toString(),
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1', canonicalizationAlgorithm: c14n });
  signature.addReference({ xpath: "//*[local-name()='infDPS']", transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', c14n], digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1' });
  signature.computeSignature(xml, { location: { reference: "//*[local-name()='infDPS']", action: 'after' } });
  const signed = signature.getSignedXml();
  const validation = await validateXML({ xml: [{ fileName: 'DPS.xml', contents: signed }], schema: [schemas[0]], preload: schemas.slice(1) });
  if (!validation.valid) throw new FiscalDpsSchemaError(validation.errors);
  return { idDPS, xml: signed, dpsXmlGZipB64: gzipSync(Buffer.from(signed, 'utf8')).toString('base64') };
}
