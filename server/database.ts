import dotenv from 'dotenv';
import pg from 'pg';
import type { Pool, QueryResult, QueryResultRow } from 'pg';

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
  }

  return pool;
}

export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
};