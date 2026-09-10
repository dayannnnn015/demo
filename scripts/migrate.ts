import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { operatorDatabase, operatorFailure } from './operator-db.js';

try {
  const sql = operatorDatabase();
  try {
    const files = (await readdir('database/migrations')).filter(n => /^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(82412000)`;
      await tx.unsafe(`create schema if not exists edunexus_meta;
        revoke all on schema edunexus_meta from public;
        create table if not exists edunexus_meta.migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now());`);
      for (const file of files) {
        const source = (await readFile(`database/migrations/${file}`, 'utf8')).replace(/\r\n/g, '\n');
        const checksum = createHash('sha256').update(source).digest('hex');
        const [applied] = await tx`select checksum from edunexus_meta.migrations where name=${file}`;
        if (applied) {
          if (applied.checksum !== checksum) throw new Error('Previously applied migration was modified');
          continue;
        }
        await tx.unsafe(source);
        await tx`insert into edunexus_meta.migrations (name,checksum) values (${file},${checksum})`;
        console.log(`Applied ${file} (commit pending)`);
      }
    });
    console.log('All migrations committed successfully.');
  } finally { await sql.end({ timeout: 5 }); }
} catch (error) { operatorFailure(error); }
