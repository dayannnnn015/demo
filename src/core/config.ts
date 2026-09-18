import { z } from 'zod';
import { decodeJwt } from 'jose';

const booleanString = z.enum(['true', 'false']).transform(v => v === 'true');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  DATABASE_SSL: booleanString.default(true),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  ALLOWED_ORIGINS: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid configuration fields: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const c = parsed.data;
  let isPublicKey = c.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_');
  if (!isPublicKey) {
    try { isPublicKey = decodeJwt(c.SUPABASE_PUBLISHABLE_KEY).role === 'anon'; } catch { /* Invalid public key. */ }
  }
  if (!isPublicKey) throw new Error('SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key, never a secret/service key');
  const databaseUrl = new URL(c.DATABASE_URL);
  const authUrl = new URL(c.SUPABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) throw new Error('DATABASE_URL must use PostgreSQL');
  if (databaseUrl.search) throw new Error('Set TLS with DATABASE_SSL; DATABASE_URL must not contain query options');
  if (authUrl.pathname !== '/' || authUrl.search || authUrl.hash || authUrl.username || authUrl.password) throw new Error('SUPABASE_URL must be a base URL');
  const origins = c.ALLOWED_ORIGINS.split(',').map(s => s.trim());
  for (const origin of origins) {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin !== origin || !['http:', 'https:'].includes(parsedOrigin.protocol)) throw new Error('ALLOWED_ORIGINS must contain exact HTTP origins');
  }
  const deployed = c.NODE_ENV === 'production' || Boolean(env.VERCEL);
  if (deployed && (!c.DATABASE_SSL || authUrl.protocol !== 'https:' || origins.some(o => !o.startsWith('https://')))) {
    throw new Error('Deployed environments require database TLS and HTTPS origins/auth');
  }
  return { ...c, SUPABASE_URL: authUrl.origin, origins };
}
export type Config = ReturnType<typeof readConfig>;
