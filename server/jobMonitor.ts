// Monitoramento das rotinas agendadas (preços, catálogo, ciclo de vida, garantias, notas fiscais...). Cada rodada
// grava início, sucesso ou falha em job_runs; o vigia avisa (log de erro + exceção no Error Tracking, com a versão)
// quando uma rotina falha ou passa de 2,5 intervalos sem concluir. O painel /admin mostra a mesma tabela.
import { getPool } from './database.ts';
import { captureOperationalException } from './errorTracking.ts';
import { logger } from './logger.ts';
import { appVersion } from './version.ts';

const WATCH_INTERVAL_MS = 10 * 60_000;
/** Um aviso por rotina parada a cada 6 horas, para o alerta não virar ruído. */
const REALERT_MS = 6 * 60 * 60_000;
export const STALE_FACTOR = 2.5;

const registered = new Map<string, number>();

async function safely(action: () => Promise<unknown>) {
  try { await action(); } catch (err) {
    logger.warn({ event: 'jobs.monitor.failed', err }, 'Job monitor bookkeeping failed.');
  }
}

/**
 * Declara que esta instância roda a rotina, com o intervalo esperado entre rodadas. `registered_at` marca a subida
 * (o prazo do primeiro sucesso conta dali); `seen_at` é renovado pelo vigia enquanto a rotina continuar ligada.
 */
export function registerJob(job: string, intervalMs: number) {
  registered.set(job, intervalMs);
  void safely(() => getPool().query(`
    INSERT INTO job_runs (job, interval_ms, app_version, registered_at, seen_at) VALUES ($1, $2, $3, now(), now())
    ON CONFLICT (job) DO UPDATE SET interval_ms = EXCLUDED.interval_ms, app_version = EXCLUDED.app_version,
      registered_at = now(), seen_at = now()
  `, [job, intervalMs, appVersion()]));
}

/**
 * Envolve uma rodada: grava início, duração e sucesso ou falha. A falha também vai ao Error Tracking agrupada pela
 * rotina. `skipped` (outra instância com o lock) não conta como sucesso nem como falha.
 */
export async function trackJob<T>(job: string, run: () => Promise<T>, isSkipped: (result: T) => boolean = () => false): Promise<T> {
  const started = Date.now();
  await safely(() => getPool().query('UPDATE job_runs SET last_started_at = now() WHERE job = $1', [job]));
  try {
    const result = await run();
    if (!isSkipped(result)) {
      await safely(() => getPool().query(
        'UPDATE job_runs SET last_succeeded_at = now(), last_duration_ms = $2, last_error = NULL WHERE job = $1',
        [job, Date.now() - started]));
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await safely(() => getPool().query(
      'UPDATE job_runs SET last_failed_at = now(), last_duration_ms = $2, last_error = $3 WHERE job = $1',
      [job, Date.now() - started, message.slice(0, 500)]));
    captureOperationalException(err, { job, kind: 'scheduled_job_failed' });
    throw err;
  }
}

export interface JobRow {
  job: string;
  interval_ms: number;
  app_version: string | null;
  registered_at: Date;
  seen_at: Date;
  last_started_at: Date | null;
  last_succeeded_at: Date | null;
  last_failed_at: Date | null;
  last_error: string | null;
  last_duration_ms: number | null;
  last_alerted_at: Date | null;
}

/** Rotina atrasada: registrada há mais de 2,5 intervalos e sem sucesso nesse prazo. */
export function isStale(row: Pick<JobRow, 'interval_ms' | 'registered_at' | 'last_succeeded_at'>, now = Date.now()) {
  const limit = row.interval_ms * STALE_FACTOR;
  const reference = row.last_succeeded_at ?? row.registered_at;
  return now - new Date(row.registered_at).getTime() > limit && now - new Date(reference).getTime() > limit;
}

export async function listJobs() {
  const result = await getPool().query<JobRow>('SELECT * FROM job_runs ORDER BY job');
  return result.rows.map(row => ({ ...row, stale: isStale(row) }));
}

/** Uma checagem do vigia. Só olha rotinas vistas nas últimas 24 horas (as desligadas deixam de alertar). */
export async function checkStaleJobs(now = Date.now()) {
  const rows = (await getPool().query<JobRow>("SELECT * FROM job_runs WHERE seen_at > now() - interval '1 day'")).rows;
  const stale = rows.filter(row => isStale(row, now)
    && (!row.last_alerted_at || now - new Date(row.last_alerted_at).getTime() > REALERT_MS));
  for (const row of stale) {
    logger.error({ event: 'jobs.stale', job: row.job, lastSucceededAt: row.last_succeeded_at, intervalMs: row.interval_ms }, 'Scheduled job is late.');
    captureOperationalException(new Error(`Rotina agendada atrasada: ${row.job}`), { job: row.job, kind: 'scheduled_job_stale' });
    await getPool().query('UPDATE job_runs SET last_alerted_at = now() WHERE job = $1', [row.job]);
  }
  return stale.map(row => row.job);
}

export function startJobWatchdog() {
  const tick = () => {
    // Renova o sinal das rotinas desta instância: as que continuam ligadas seguem sendo vigiadas.
    void safely(() => getPool().query('UPDATE job_runs SET seen_at = now() WHERE job = ANY($1::text[])', [[...registered.keys()]]));
    void checkStaleJobs().catch(err => logger.warn({ event: 'jobs.watchdog.failed', err }, 'Job watchdog failed.'));
  };
  const timer = setInterval(tick, WATCH_INTERVAL_MS);
  timer.unref();
  return timer;
}
