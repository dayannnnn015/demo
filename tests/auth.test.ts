import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type KeyObject } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createAuthenticator } from '../src/core/auth.js';
import { readConfig } from '../src/core/config.js';
import { ids } from './helpers/database.js';

describe('Supabase authentication boundary', () => {
  let privateKey: CryptoKey | KeyObject;
  let publicKeys: ReturnType<typeof createLocalJWKSet>;
  const issuer = 'https://test.supabase.co/auth/v1';
  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    publicKeys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test-key', alg: 'ES256' }] });
  });
  const sign = async (claims: Record<string, unknown> = {}, overrides: { issuer?: string; audience?: string; expires?: number } = {}) => new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' }).setSubject(ids.principal).setIssuedAt()
    .setIssuer(overrides.issuer ?? issuer).setAudience(overrides.audience ?? 'authenticated')
    .setExpirationTime(overrides.expires ?? Math.floor(Date.now() / 1000) + 300).sign(privateKey);
  const verifier = (fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: ids.principal }))) => ({ fetcher, auth: createAuthenticator({ url: 'https://test.supabase.co', publishableKey: 'test-public-key', keySet: publicKeys, fetcher }) });

  it('verifies signatures, issuer, audience, and live user identity', async () => {
    const { auth, fetcher } = verifier();
    expect(await auth.verify(await sign())).toEqual({ userId: ids.principal });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(`${issuer}/user`);
  });
  it.each([
    [{}, { issuer: 'https://attacker.example/auth/v1' }],
    [{}, { audience: 'service_role' }],
    [{}, { expires: 1 }],
    [{ role: 'service_role' }, {}],
  ])('rejects invalid token claims', async (claims, overrides) => {
    const { auth, fetcher } = verifier();
    await expect(auth.verify(await sign(claims, overrides))).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects unsigned and modified tokens before any identity service call', async () => {
    const { auth, fetcher } = verifier();
    await expect(auth.verify('eyJhbGciOiJub25lIn0.e30.')).rejects.toMatchObject({ status: 401 });
    const token = await sign();
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: ids.outsider })).toString('base64url');
    await expect(auth.verify(parts.join('.'))).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fails closed for banned/deleted identities and service outages', async () => {
    const token = await sign();
    await expect(verifier(vi.fn(async () => new Response(null, { status: 401 }))).auth.verify(token)).rejects.toMatchObject({ status: 401 });
    await expect(verifier(vi.fn(async () => Response.json({ id: ids.outsider }))).auth.verify(token)).rejects.toMatchObject({ status: 401 });
    await expect(verifier(vi.fn(async () => new Response(null, { status: 503 }))).auth.verify(token)).rejects.toMatchObject({ status: 503 });
    await expect(verifier(vi.fn(async () => { throw new TypeError('network'); })).auth.verify(token)).rejects.toMatchObject({ status: 503 });
  });
});

describe('deployment configuration', () => {
  const valid = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://edunexus_app:secret@db.example/test', DATABASE_SSL: 'true', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', ALLOWED_ORIGINS: 'https://school.example' };
  it('requires TLS, exact origins, and safe URL structure', () => {
    expect(readConfig(valid).origins).toEqual(['https://school.example']);
    for (const bad of [{ DATABASE_SSL: 'false' }, { ALLOWED_ORIGINS: '*' }, { ALLOWED_ORIGINS: 'http://school.example' }, { SUPABASE_URL: 'http://test.supabase.co' }, { DATABASE_URL: valid.DATABASE_URL + '?sslmode=no-verify' }]) {
      expect(() => readConfig({ ...valid, ...bad })).toThrow();
    }
    expect(() => readConfig({ ...valid, NODE_ENV: 'development', VERCEL: '1', DATABASE_SSL: 'false' })).toThrow();
    expect(() => readConfig({ ...valid, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_expose' })).toThrow();
  });
  it('pairs the account service settings and keeps a service key out of the runtime', () => {
    const url = 'https://project.functions.test/create-staff-identity', secret = 'x'.repeat(40);
    expect(readConfig({ ...valid, PROVISION_FUNCTION_URL: url, PROVISION_FUNCTION_SECRET: secret }).PROVISION_FUNCTION_SECRET).toBe(secret);
    expect(readConfig(valid).PROVISION_FUNCTION_URL).toBeUndefined();
    for (const bad of [
      { PROVISION_FUNCTION_URL: url },
      { PROVISION_FUNCTION_SECRET: secret },
      { PROVISION_FUNCTION_URL: 'http://project.functions.test/create-staff-identity', PROVISION_FUNCTION_SECRET: secret },
      { PROVISION_FUNCTION_URL: url, PROVISION_FUNCTION_SECRET: 'too-short' },
      { PROVISION_FUNCTION_URL: url, PROVISION_FUNCTION_SECRET: 'sb_secret_' + 'y'.repeat(40) },
    ]) expect(() => readConfig({ ...valid, ...bad })).toThrow();
  });

  it('reports configuration field names without secret values', () => {
    expect(() => readConfig({ ...valid, DATABASE_URL: 'very-private-secret' })).toThrow('Invalid configuration fields: DATABASE_URL');
  });
});
