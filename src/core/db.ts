import { Pool, types } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { databaseTls } from './database-tls.js';

export type Row = Record<string, unknown>;
export interface Query {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
}
export interface Database {
  transaction<T>(work: (tx: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDatabase(url: string, ssl: boolean): Database {
  const pool = new Pool({
    connectionString: url,
    ssl: databaseTls(url, ssl),
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    maxLifetimeSeconds: 1200,
    types: { getTypeParser(oid, format) { return oid === 1082 ? (value: string) => value : types.getTypeParser(oid, format); } },
  });
  pool.on('error', () => console.error('An idle database connection failed; the pool will reconnect.'));
  attachDatabasePool(pool);
  return {
    async transaction<T>(work: (tx: Query) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query('begin');
        const result = await work({ async query<R extends Row>(text: string, params: unknown[] = []) { return (await client.query<R>(text, params)).rows; } });
        await client.query('commit');
        return result;
      } catch (error) {
        try { await client.query('rollback'); } catch { discard = true; }
        throw error;
      } finally { client.release(discard); }
    },
    async close() { await pool.end(); },
  };
}

export async function assertRuntimeRole(tx: Query) {
  const [role] = await tx.query<{ safe: boolean }>(
    `select current_user = 'edunexus_app' and not rolsuper and not rolbypassrls
      and not rolcreaterole and not rolcreatedb
      and not exists (select 1 from pg_auth_members where member = r.oid) as safe
     from pg_roles r where rolname = current_user`,
  );
  if (!role?.safe) throw new Error('Unsafe database runtime role');
}
