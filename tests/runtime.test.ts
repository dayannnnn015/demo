import { describe, expect, it } from 'vitest';
import { createDatabase, assertRuntimeRole } from '../src/core/db.js';
import { databaseTls } from '../src/core/database-tls.js';
import { X509Certificate } from 'node:crypto';
import { supabaseCa } from '../src/core/supabase-ca.js';

describe('production adapter configuration', () => {
  it('constructs the actual driver with Vercel integration without connecting', async () => {
    const db = createDatabase('postgresql://edunexus_app:unused@127.0.0.1:1/test', false);
    await db.close();
  });
  it('rejects a privileged runtime connection before application queries', async () => {
    await expect(assertRuntimeRole({ query: async () => [{ safe: false }] as never })).rejects.toThrow('Unsafe database runtime role');
  });
  it('adds the official Supabase CA only for Supabase database hosts', () => {
    const settings = databaseTls('postgresql://user:secret@aws-0-ap-southeast-1.pooler.supabase.com/db', true);
    expect(settings).toMatchObject({ rejectUnauthorized: true });
    expect(settings && settings.ca).toContain(supabaseCa);
    expect(databaseTls('postgresql://user:secret@db.other.example/db', true)).toEqual({ rejectUnauthorized: true });
    const cert = new X509Certificate(supabaseCa);
    expect(cert.ca).toBe(true);
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.now());
  });
});
