import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import type { Database, Query, Row } from '../../src/core/db.js';

export const ids = {
  principal: '00000000-0000-4000-8000-000000000001',
  officer: '00000000-0000-4000-8000-000000000002',
  teacher: '00000000-0000-4000-8000-000000000003',
  otherTeacher: '00000000-0000-4000-8000-000000000004',
  inactive: '00000000-0000-4000-8000-000000000005',
  outsider: '00000000-0000-4000-8000-000000000006',
  secondPrincipal: '00000000-0000-4000-8000-000000000007',
};

export async function testDatabase() {
  const pg = await PGlite.create();
  // The production migration uses Supabase's real auth.users table. Only this
  // isolated test database has the synthetic identity fixture below.
  await pg.exec(`create schema auth; create table auth.users (id uuid primary key);`);
  for (const file of (await readdir('database/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await pg.exec(await readFile(`database/migrations/${file}`, 'utf8'));
  }
  for (const id of Object.values(ids)) await pg.query('insert into auth.users(id) values ($1)', [id]);
  for (const [key, role, active] of [
    ['principal', 'principal', true], ['officer', 'administrative_officer', true],
    ['teacher', 'teacher', true], ['otherTeacher', 'teacher', true], ['inactive', 'teacher', false],
  ] as const) {
    await pg.query('insert into edunexus.staff (user_id,display_name,role,active) values ($1,$2,$3,$4)', [ids[key], `Synthetic ${key}`, role, active]);
  }
  await pg.query(`insert into edunexus.school_profile(name,address) values ('Synthetic test school','Synthetic test address')`);
  const database: Database = {
    async transaction<T>(work: (query: Query) => Promise<T>) {
      return pg.transaction(async tx => {
        await tx.exec('set local role edunexus_app');
        return work({ async query<R extends Row>(sql: string, params: unknown[] = []) { return (await tx.query<R>(sql, params)).rows; } });
      });
    },
    async close() { await pg.close(); },
  };
  const asUser = <T>(userId: string | null, work: (tx: Query) => Promise<T>) => database.transaction(async tx => {
    if (userId) await tx.query(`select set_config('edunexus.actor_id',$1,true)`, [userId]);
    return work(tx);
  });
  return { pg, database, asUser };
}
