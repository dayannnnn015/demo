import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, retryable } from '../web/api';

/**
 * A register read that meets a busy database is sent again, up to twice; a
 * write never is. The server answers RETRY_REQUIRED only when a lock or
 * serialization wait ran out and the transaction rolled back, so a repeated
 * read cannot record anything twice — while a repeated write would bypass the
 * review a refused change needs.
 */
describe('the workspace API client', () => {
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic' } } }) } } as never;
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const busy = () => answer(409, { error: { code: 'RETRY_REQUIRED', message: 'Another change is in progress. Refresh the record and try again.' } });
  const waits: number[] = [];
  const api = () => createApi(client, () => {}, async ms => { waits.push(ms); });
  afterEach(() => { vi.unstubAllGlobals(); waits.length = 0; });

  it('retries a read the database was too busy to answer, then returns it', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(answer(200, { data: { items: [1] } }));
    vi.stubGlobal('fetch', fetch);
    await expect(api()('/sections/x/attendance')).resolves.toEqual({ items: [1] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(250);
  });

  it('gives up after two retries and reports the refusal', async () => {
    const fetch = vi.fn().mockImplementation(async () => busy());
    vi.stubGlobal('fetch', fetch);
    await expect(api()('/sections/x/attendance')).rejects.toMatchObject({ code: 'RETRY_REQUIRED' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('never retries a write, even when the database was busy', async () => {
    const fetch = vi.fn().mockImplementation(async () => busy());
    vi.stubGlobal('fetch', fetch);
    await expect(api()('/sections/x/attendance/corrections', 'POST', { reviewed: true })).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('never retries a read refused for any other reason', async () => {
    const fetch = vi.fn().mockImplementation(async () => answer(409, { error: { code: 'VERSION_CONFLICT', message: 'Changed.' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(api()('/learners/x')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries exactly the busy code on a read', () => {
    expect(retryable('GET', new ApiError(409, 'RETRY_REQUIRED', ''))).toBe(true);
    expect(retryable('POST', new ApiError(409, 'RETRY_REQUIRED', ''))).toBe(false);
    expect(retryable('PATCH', new ApiError(409, 'RETRY_REQUIRED', ''))).toBe(false);
    expect(retryable('GET', new ApiError(503, 'SERVICE_UNAVAILABLE', ''))).toBe(false);
    expect(retryable('GET', new Error('network'))).toBe(false);
  });
});
