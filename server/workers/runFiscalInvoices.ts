// Operação do servidor, indisponível pela API pública. Nunca altera acesso ou cobra na Stripe.
import { getPool, withTransaction } from '../database.ts';
import { runFiscalInvoices } from '../fiscal/service.ts';
import { fiscalEnvironment } from '../fiscal/provider.ts';
import { logger, stopPosthogLogs } from '../logger.ts';
const argument = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
try {
  const retry = argument('--retry'); const release = argument('--release');
  if (process.argv.includes('--retry') && !retry || process.argv.includes('--release') && !release) throw new Error('Informe o UUID da nota.');
  if (retry && release) throw new Error('Use uma operação por vez.');
  if (retry || release) {
    const id = retry || release;
    const reason = argument('--reason')?.trim();
    if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id!) || !reason || reason.length < 10) throw new Error('Informe UUID e --reason com a orientação para regularização.');
    await withTransaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(726351912)');
      if (release) {
        const competence = argument('--competence');
        if (!competence || !/^\d{4}-\d{2}-\d{2}$/.test(competence) || new Date(competence).toISOString().slice(0,10) !== competence) throw new Error('Informe --competence AAAA-MM-DD.');
        const row = await db.query(`UPDATE fiscal_invoices SET competence=$3::date,issue_at=now(),error_code=NULL,updated_at=now()
          WHERE id=$1 AND environment=$2 AND provider='national' AND status='pending' AND submitted_at IS NULL AND payload IS NULL RETURNING id`, [id, fiscalEnvironment(), competence]);
        if (!row.rowCount) throw new Error('Nota não pode ser liberada neste estado/ambiente.');
        await db.query('INSERT INTO fiscal_manual_releases(invoice_id,competence,reason) VALUES ($1,$2::date,$3)', [id, competence, reason]);
      } else {
        const row = await db.query(`UPDATE fiscal_invoices SET status='pending',attempts=0,next_attempt_at=now(),
          reprepare=CASE WHEN status='rejected' THEN true ELSE reprepare END,updated_at=now()
          WHERE id=$1 AND environment=$2 AND provider='national' AND status IN ('failed','rejected','needs_data') RETURNING id`, [id, fiscalEnvironment()]);
        if (!row.rowCount) throw new Error('Nota não pode ser reprocessada neste estado/ambiente.');
        await db.query("INSERT INTO fiscal_attempts(invoice_id,operation,outcome,details) VALUES ($1,'manual_retry','requested',$2::jsonb)", [id, JSON.stringify({ reason })]);
      }
    });
  }
  logger.info({ event: 'fiscal.manual.completed', ...await runFiscalInvoices() }, 'Rodada fiscal concluída.');
} catch {
  logger.error({ event: 'fiscal.manual.failed' }, 'Falha na operação fiscal. Confira estado, UUID, competência e motivo.'); process.exitCode = 1;
} finally { await Promise.allSettled([getPool().end(), stopPosthogLogs()]); }
