import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getLogger } from './logger.ts';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const { Pool: PgPool, types } = pg;
types.setTypeParser(20, value => Number(value));

let pool: Pool | undefined;

function shouldUseSsl(connectionString: string) {
  if (process.env.DATABASE_SSL === 'true') return true;
  if (process.env.DATABASE_SSL === 'false') return false;

  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');
  return sslMode === 'require' || sslMode === 'verify-full';
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL não foi configurada.');
  }

  if (!pool) {
    pool = new PgPool({
      connectionString,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
    }) as Pool;
    pool.on('error', err => {
      getLogger().error({ event: 'database.pool.error', err }, 'Conexão ociosa com o PostgreSQL falhou; o pool descartou a conexão.');
    });
  }

  return pool;
}

export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
};

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const transactionId = randomUUID();
  const started = Date.now();
  const client = await getPool().connect();
  getLogger().info({ event: 'database.transaction.started', transactionId }, 'Database transaction started.');
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    getLogger().info({ event: 'database.transaction.committed', transactionId, duration_ms: Date.now() - started }, 'Database transaction committed.');
    return result;
  } catch (err) {
    getLogger().error({ event: 'database.transaction.failed', transactionId, err, duration_ms: Date.now() - started }, 'Database transaction failed.');
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}
