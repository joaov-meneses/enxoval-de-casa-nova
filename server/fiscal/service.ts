import { createHash, randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { getPool, type Queryable } from '../database.ts';
import { getLogger } from '../logger.ts';
import { fiscalConfig, fiscalEnabled, fiscalEnvironment, fiscalModel, fiscalPolicy, nationalRequest, parseNationalInvoice,
  queryNationalInvoice, FiscalProviderError, type FiscalRecipient, type FiscalConfig, type FiscalResult, type FiscalTaxConfig } from './provider.ts';
import { buildFiscalPayload, dpsIdentifier, FiscalDpsSchemaError, type DpsPayload } from './dps.ts';

export const fiscalReference = (sourceId: string, environment = fiscalEnvironment()) =>
  `casamia-${createHash('sha256').update(`${environment}:${sourceId}`).digest('hex').slice(0, 40)}`;
const dateOf = (seconds: number) => new Date(seconds * 1000);
const localDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(date);
function recipientOf(details: { name?: string | null; email?: string | null; tax_ids?: { type?: string; value?: string | null }[] | null } | null | undefined, document?: string): FiscalRecipient {
  return { name: details?.name || undefined, email: details?.email || undefined,
    document: (document || details?.tax_ids?.find(t => ['br_cpf', 'br_cnpj'].includes(t.type || ''))?.value || '').replace(/\D/g, '') || undefined };
}

/** Inbox durável na transação Stripe, mesmo com emissão desligada/configuração inválida. Sem preparar XML ou chamar SEFIN. */
export async function enqueueFiscalEvent(db: Queryable, event: Stripe.Event) {
  if (!['invoice.paid', 'checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return;
  await db.query(`INSERT INTO fiscal_billing_events(event_id, environment, event) VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (event_id) DO NOTHING`, [event.id, event.livemode === true ? 'producao' : 'homologacao', JSON.stringify(event)]);
}

/** Executado pelo worker; falha de associação/configuração fica no inbox sem afetar o acesso. */
export async function materializeFiscalEvent(db: Queryable, event: Stripe.Event) {
  const environment = event.livemode === true ? 'producao' : 'homologacao';
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.userId;
    if (!userId || !['pass', 'monthly'].includes(session.metadata?.plan || '')) return;
    const recipient = recipientOf(session.customer_details, session.custom_fields?.find(field => field.key === 'fiscal_document')?.numeric?.value);
    await db.query('UPDATE users SET fiscal_profile = fiscal_profile || $2::jsonb WHERE id::text = $1', [userId, JSON.stringify(recipient)]);
    await db.query(`UPDATE fiscal_invoices SET status = 'pending', next_attempt_at = now(), attempts = 0, error_code = NULL
      WHERE user_id::text = $1 AND provider = 'national' AND status = 'needs_data'`, [userId]);
    // Assinaturas só emitem por invoice.paid, incluindo primeira cobrança e renovações.
    if (session.mode !== 'payment' || session.metadata?.plan !== 'pass' || session.payment_status !== 'paid' || !session.amount_total || session.currency !== 'brl') return;
    await enqueue(db, userId, session.id, session.amount_total, 'pass', recipient, event.created, environment);
  } else if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice;
    if (invoice.status !== 'paid' || invoice.amount_paid <= 0 || invoice.currency !== 'brl') return;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    const parent = invoice.parent?.subscription_details;
    const legacy = invoice as unknown as { subscription?: string; subscription_details?: { metadata?: Record<string, string> } };
    const subscriptionId = typeof parent?.subscription === 'string' ? parent.subscription : parent?.subscription?.id || legacy.subscription;
    if (!subscriptionId) return;
    const userId = parent?.metadata?.userId || legacy.subscription_details?.metadata?.userId;
    const user = (await db.query<{ id: string }>(`SELECT id FROM users WHERE stripe_customer_id = $1
      AND (stripe_subscription_id = $2 OR id::text = $3) LIMIT 1`, [customerId || null, subscriptionId, userId || null])).rows[0];
    if (!user) throw new Error('FISCAL_BILLING_ACCOUNT_NOT_READY');
    // Período da linha da assinatura; faturas agregadas/prorrata exigem liberação manual.
    const lines = invoice.lines?.data || [];
    const period = lines.length === 1 && !invoice.lines?.has_more ? lines[0].period : undefined;
    await enqueue(db, user.id, invoice.id, invoice.amount_paid, 'monthly', recipientOf({ name: invoice.customer_name,
      email: invoice.customer_email, tax_ids: invoice.customer_tax_ids }), invoice.status_transitions?.paid_at || event.created, environment, period);
  }
}

async function enqueue(db: Queryable, userId: string, sourceId: string, amount: number, plan: string,
  recipient: FiscalRecipient, paidAt: number, environment: string, period?: { start: number; end: number }) {
  const policy = fiscalPolicy();
  const competenceAt = policy.competence === 'payment_date' ? paidAt : policy.competence === 'period_start' ? period?.start : period?.end;
  const issueAt = !policy.accountingReference || policy.timing === 'manual' ? null : policy.timing === 'payment_confirmed' ? dateOf(paidAt) : period?.end ? dateOf(period.end) : null;
  const inserted = await db.query(`INSERT INTO fiscal_invoices (id, user_id, source_id, reference, environment, amount_cents, currency,
      plan, recipient, model, paid_at, provider, competence, issue_at, issuance_policy)
    SELECT $1, id, $3, $4, $5, $6, 'brl', $7, $8::jsonb, $9, $10, 'national', $11::date, $12, $13::jsonb FROM users WHERE id::text = $2
    ON CONFLICT (environment, source_id) DO NOTHING RETURNING id`,
  [randomUUID(), userId, sourceId, fiscalReference(sourceId, environment as any), environment, amount, plan, JSON.stringify(recipient), fiscalModel(), dateOf(paidAt),
    competenceAt ? localDate(dateOf(competenceAt)) : null, issueAt, JSON.stringify(policy)]);
  if (!inserted.rowCount && !(await db.query('SELECT id FROM fiscal_invoices WHERE environment=$1 AND source_id=$2', [environment, sourceId])).rowCount)
    throw new Error('FISCAL_BILLING_ACCOUNT_NOT_READY');
}

async function drainInbox(db: Queryable, environment: string) {
  const events = (await db.query<{ event_id: string; event: Stripe.Event }>(`SELECT event_id, event FROM fiscal_billing_events
    WHERE environment=$1 AND processed_at IS NULL AND next_attempt_at <= now() ORDER BY created_at LIMIT 100`, [environment])).rows;
  for (const item of events) {
    await db.query('BEGIN');
    try {
      await materializeFiscalEvent(db, item.event);
      await db.query('UPDATE fiscal_billing_events SET processed_at=now(), error_code=NULL WHERE event_id=$1', [item.event_id]);
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      const code = err instanceof Error && ['FISCAL_BILLING_ACCOUNT_NOT_READY', 'FISCAL_ACCOUNTING_POLICY_REQUIRED'].includes(err.message) ? err.message : 'FISCAL_EVENT_PREPARATION_FAILED';
      await db.query(`UPDATE fiscal_billing_events SET error_code=$2, attempts=attempts+1,
        next_attempt_at=now()+interval '5 minutes' WHERE event_id=$1`, [item.event_id, code]);
      getLogger().warn({ event: 'fiscal.event_pending', stripeEventId: item.event_id, code }, 'Obrigação fiscal pendente; acesso preservado.');
    }
  }
}

interface InvoiceJob {
  id: string; reference: string; amount_cents: number; plan: string; recipient: FiscalRecipient;
  fiscal_profile: FiscalRecipient | null; email: string | null; payload: DpsPayload | null; attempts: number;
  dps_id: string | null; dps_number: string | null; issuer_snapshot: FiscalTaxConfig | null; competence: string;
  submitted_at: Date | null; reprepare: boolean;
}
export async function saveFiscalAuthorization(db: Queryable, id: string, result: FiscalResult) {
  await db.query(`UPDATE fiscal_invoices SET status='authorized', number=$2, access_key=$3, authorized_xml=$4,
    error_code=NULL, error_details=NULL, attempts=0, reprepare=false, updated_at=now()
    WHERE id=$1 AND status <> 'cancelled'`, [id, result.number, result.accessKey, result.xml]);
}

export async function runFiscalInvoices() {
  const summary = { processed: 0, authorized: 0, failed: 0, skipped: false };
  const client = await getPool().connect(); let locked = false;
  try {
    locked = (await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(726351912) AS locked')).rows[0].locked;
    if (!locked) return { ...summary, skipped: true };
    // Registrar obrigações continua mesmo antes da ativação da transmissão.
    await drainInbox(client, fiscalEnvironment());
    if (!fiscalEnabled()) return { ...summary, skipped: true };
    let config: FiscalConfig;
    try { config = fiscalConfig(); } catch {
      await client.query(`UPDATE fiscal_invoices SET error_code='FISCAL_CONFIGURATION', updated_at=now()
        WHERE provider='national' AND environment=$1 AND status IN ('pending','processing')`, [fiscalEnvironment()]);
      getLogger().warn({ event: 'fiscal.configuration_missing' }, 'Emissão fiscal aguardando certificado, habilitação e configuração contábil.');
      return { ...summary, skipped: true };
    }
    const jobs = (await client.query<InvoiceJob>(`SELECT f.*, f.competence::text, u.fiscal_profile, u.email FROM fiscal_invoices f
      LEFT JOIN users u ON u.id=f.user_id WHERE f.provider='national' AND f.environment=$1
      AND f.status IN ('pending','processing') AND f.issue_at <= now() AND f.competence IS NOT NULL
      AND f.next_attempt_at <= now() ORDER BY f.created_at LIMIT 25`, [config.environment])).rows;
    for (const job of jobs) {
      summary.processed++;
      let operation = 'prepare';
      try {
        const jobConfig = job.issuer_snapshot ? { ...config, tax: job.issuer_snapshot } : config;
        if (jobConfig.tax.cnpj !== config.tax.cnpj) throw new Error('FISCAL_ISSUER_CHANGED');
        if (!job.dps_id) {
          // Uma reserva por nota, gravada atomicamente antes da primeira comunicação externa.
          await client.query('BEGIN');
          try {
            const number = (await client.query<{ number: string }>(`INSERT INTO fiscal_dps_counters(environment,cnpj,serie,last_number)
              VALUES ($1,$2,$3,$4::numeric) ON CONFLICT(environment,cnpj,serie) DO UPDATE
              SET last_number=fiscal_dps_counters.last_number+1 RETURNING last_number::text AS number`,
              [config.environment, config.tax.cnpj, config.tax.serie.padStart(5,'0'), config.tax.primeiroNumero])).rows[0].number;
            job.dps_id = dpsIdentifier(config, number); job.dps_number = number;
            await client.query('UPDATE fiscal_invoices SET dps_id=$2,dps_number=$3,issuer_snapshot=$4::jsonb WHERE id=$1',
              [job.id, job.dps_id, number, JSON.stringify(config.tax)]);
            await client.query('COMMIT');
          } catch (err) { await client.query('ROLLBACK'); throw err; }
        }
        operation = 'query';
        let result = await queryNationalInvoice(jobConfig, job.dps_id);
        if (!result) {
          // Correção explícita só após rejeição definitiva + consulta confirmando ausência.
          if (!job.payload || job.reprepare) {
            const preparedConfig = job.reprepare ? { ...config, tax: { ...config.tax, cnpj: jobConfig.tax.cnpj,
              municipio: jobConfig.tax.municipio, serie: jobConfig.tax.serie, primeiroNumero: jobConfig.tax.primeiroNumero } } : jobConfig;
            job.payload = await buildFiscalPayload(preparedConfig, { ...job.recipient, ...job.fiscal_profile,
              email: job.recipient.email || job.email || undefined }, job.amount_cents, new Date(), job.plan, job.competence, job.dps_number!);
            await client.query('UPDATE fiscal_invoices SET payload=$2::jsonb,issuer_snapshot=$3::jsonb,reprepare=false WHERE id=$1',
              [job.id, JSON.stringify(job.payload), JSON.stringify(preparedConfig.tax)]);
          }
          // XML, identificador, série e número permanecem iguais após falha ambígua.
          operation = 'submit';
          await client.query("UPDATE fiscal_invoices SET status='processing',submitted_at=now() WHERE id=$1", [job.id]);
          result = parseNationalInvoice(await nationalRequest(jobConfig, '/nfse', { dpsXmlGZipB64: job.payload.dpsXmlGZipB64 }), job.dps_id);
        }
        await saveFiscalAuthorization(client, job.id, result);
        await client.query("INSERT INTO fiscal_attempts(invoice_id,operation,outcome) VALUES ($1,$2,'authorized')", [job.id, operation]);
        summary.authorized++;
      } catch (err) {
        summary.failed++;
        const missing = err instanceof Error && err.message === 'FISCAL_RECIPIENT_REQUIRED';
        const rejected = err instanceof FiscalProviderError && err.definitiveRejection;
        const localInvalid = err instanceof Error && ['FISCAL_DPS_SCHEMA_INVALID','FISCAL_ISSUER_CHANGED'].includes(err.message);
        const attempts = job.attempts + 1;
        const status = missing ? 'needs_data' : rejected || localInvalid ? 'rejected' : attempts >= 8 ? 'failed' : 'processing';
        const code = missing ? 'FISCAL_RECIPIENT_REQUIRED' : rejected ? 'FISCAL_REJECTED' : localInvalid ? (err as Error).message : 'FISCAL_PROVIDER_UNAVAILABLE';
        const details = JSON.stringify(err instanceof FiscalProviderError || err instanceof FiscalDpsSchemaError ? err.details : null);
        await client.query(`UPDATE fiscal_invoices SET status=$2,error_code=$3,attempts=$4,error_details=$6::jsonb,
          next_attempt_at=now()+make_interval(secs=>$5::int),updated_at=now() WHERE id=$1`,
          [job.id, status, code, attempts, Math.min(3600,60*2**Math.min(attempts,6)), details]);
        await client.query('INSERT INTO fiscal_attempts(invoice_id,operation,outcome,error_code,details) VALUES ($1,$2,$3,$4,$5::jsonb)',
          [job.id, operation, status, code, details]);
        getLogger().warn({ event: 'fiscal.issue_failed', invoiceId: job.id, code }, 'Emissão fiscal pendente; acesso pago preservado.');
      }
    }
    return summary;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(726351912)');
    client.release();
  }
}
