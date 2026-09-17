import type { SupabaseClient } from '@supabase/supabase-js';

export type Row = Record<string, unknown>;
export type Page<T = Row> = { items: T[]; pagination?: { has_more?: boolean; next_after_id?: string | null; next_before_id?: string | null } };

/** An API error carrying the server's own code, so screens can react to specific ones. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields: { path: string; message: string }[] = []) {
    super(message);
  }
  /** A stale version or a changed review. The screen must refresh, never silently retry. */
  get isConflict() { return this.status === 409; }
}

export type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;

export function createApi(client: SupabaseClient, onSessionLost: () => void): Api {
  return async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const { data } = await client.auth.getSession();
    if (!data.session) { onSessionLost(); throw new ApiError(401, 'AUTH_REQUIRED', 'Please sign in again.'); }
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload.error ?? {};
      if (response.status === 401 || error.code === 'STAFF_ACCESS_REQUIRED') onSessionLost();
      throw new ApiError(response.status, error.code ?? 'REQUEST_FAILED', error.message ?? 'The request failed.', error.fields ?? []);
    }
    return payload.data as T;
  };
}

export const message = (error: unknown) =>
  error instanceof ApiError && error.fields.length
    ? [error.message, ...error.fields.map(f => `${f.path}: ${f.message}`)].join('\n')
    : error instanceof Error ? error.message : 'The request failed. Please try again.';

export const query = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};
