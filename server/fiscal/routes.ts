import type { Request, Router } from 'express';
import { getPool, withTransaction } from '../database.ts';
import { asyncHandler, HttpError } from '../security.ts';
import type { AuthUser } from '../../src/types.ts';
import { fiscalEnabled, fiscalAddressRequired, validTaxDocument, type FiscalRecipient } from './provider.ts';
import type { FiscalAddress } from '../../shared/fiscal.ts';

export function registerFiscalRoutes(router: Router, requireUser: (req: Request) => Promise<AuthUser>) {
  router.get('/billing/fiscal', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    res.set('Cache-Control', 'no-store');
    const profile = (await getPool().query<{ fiscal_profile: FiscalRecipient }>('SELECT fiscal_profile FROM users WHERE id = $1', [user.id])).rows[0]?.fiscal_profile || {};
    const invoices = (await getPool().query(`SELECT id, status, environment, amount_cents AS "amountCents", currency,
      number, pdf_url AS "pdfUrl", CASE WHEN authorized_xml IS NOT NULL THEN '/api/billing/fiscal/' || id::text || '/xml' ELSE xml_url END AS "xmlUrl",
      access_key AS "accessKey", competence::text, issue_at AS "issueAt", error_code AS "errorCode", created_at AS "createdAt"
      FROM fiscal_invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [user.id])).rows;
    res.json({ enabled: fiscalEnabled(), requireAddress: fiscalAddressRequired(), profile: { name: profile.name || '', document: profile.document || '', address: profile.address || null }, invoices });
  }));
  router.get('/billing/fiscal/:id/xml', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const row = (await getPool().query('SELECT authorized_xml FROM fiscal_invoices WHERE id::text=$1 AND user_id=$2', [req.params.id, user.id])).rows[0];
    if (!row?.authorized_xml) throw new HttpError(404, 'Documento fiscal não encontrado.');
    res.set('Cache-Control', 'no-store').set('Content-Disposition', 'attachment; filename="nfse.xml"')
      .type('application/xml').send(row.authorized_xml);
  }));
  router.put('/billing/fiscal/profile', asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    const document = typeof req.body?.document === 'string' ? req.body.document.replace(/[.\-/\s]/g, '') : '';
    if (user.isGuest) throw new HttpError(403, 'Somente o titular pode alterar os dados de cobrança.');
    if (name.length < 2 || name.length > 120) throw new HttpError(400, 'Informe o nome completo ou a razão social.');
    if (!validTaxDocument(document)) throw new HttpError(400, 'Informe um CPF ou CNPJ válido.');
    let address: FiscalAddress | undefined;
    if (req.body?.address != null) {
      const raw = req.body.address;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Confira o endereço de cobrança.');
      const field = (key: string) => typeof raw[key] === 'string' ? raw[key].trim() : '';
      address = { logradouro: field('logradouro'), numero: field('numero'), complemento: field('complemento'), bairro: field('bairro'),
        codigo_municipio: field('codigo_municipio'), uf: field('uf'), cep: field('cep').replace(/[-\s]/g, '') };
      if (Object.values(address).some(value => value.length > 150) || !address.logradouro || !address.numero || !address.bairro ||
        !/^\d{7}$/.test(address.codigo_municipio) || !/^[A-Z]{2}$/.test(address.uf) || !/^\d{8}$/.test(address.cep)) throw new HttpError(400, 'Preencha o endereço, número, bairro, cidade, estado e CEP para a nota fiscal.');
    } else if (fiscalAddressRequired()) throw new HttpError(400, 'Informe o endereço de cobrança para a nota fiscal.');
    const profile = { name, document, ...(address ? { address } : {}) };
    await withTransaction(async client => {
      await client.query('UPDATE users SET fiscal_profile = fiscal_profile || $2::jsonb WHERE id = $1', [user.id, JSON.stringify(profile)]);
      await client.query(`UPDATE fiscal_invoices SET status = 'pending', error_code = NULL, attempts = 0, next_attempt_at = now(), updated_at = now()
        WHERE user_id = $1 AND provider = 'national' AND status = 'needs_data'`, [user.id]);
    });
    res.set('Cache-Control', 'no-store').json(profile);
  }));
}
