import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { AppError } from './errors.js';

export interface Identity { userId: string; }
export interface Authenticator { verify(token: string): Promise<Identity>; }

export function createAuthenticator(options: {
  url: string;
  publishableKey: string;
  keySet?: JWTVerifyGetKey;
  fetcher?: typeof fetch;
}): Authenticator {
  const issuer = `${options.url}/auth/v1`;
  const jwks = options.keySet ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 5000 });
  const fetcher = options.fetcher ?? fetch;
  return {
    async verify(token) {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256'], requiredClaims: ['exp', 'iat', 'sub'], clockTolerance: 5 }));
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'ERR_JWKS_TIMEOUT' || error instanceof TypeError) throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
        throw new AppError(401, 'INVALID_TOKEN', 'A valid staff access token is required.');
      }
      if (!z.uuid().safeParse(payload.sub).success || payload.role !== 'authenticated') throw new AppError(401, 'INVALID_TOKEN', 'A valid staff access token is required.');
      // Check the managed identity service too, so deleted/banned Auth users do
      // not remain usable until their signed access token expires.
      let response: Response;
      try {
        response = await fetcher(`${issuer}/user`, { headers: { Authorization: `Bearer ${token}`, apikey: options.publishableKey }, signal: AbortSignal.timeout(5000), redirect: 'error' });
      } catch { throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.'); }
      if (response.status === 429 || response.status >= 500) throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
      if (!response.ok) throw new AppError(401, 'INVALID_TOKEN', 'A valid staff access token is required.');
      let user: { id?: string };
      try { user = await response.json() as { id?: string }; }
      catch { throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.'); }
      if (user.id !== payload.sub) throw new AppError(401, 'INVALID_TOKEN', 'A valid staff access token is required.');
      return { userId: payload.sub! };
    },
  };
}
