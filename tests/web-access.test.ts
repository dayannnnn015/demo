// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byLabel, byText, choose, click, expand, fill, showRoute, waitFor } from './helpers/dom';
import { describeResource, recordFromHash } from '../web/screens/Access';
import { routes } from '../web/routes';

/**
 * The privacy access log is the one screen a privacy owner will ask for first:
 * who was shown which learner record. It reads the append-only log and nothing
 * else, so the tests below also check that looking at the log leaves no trace
 * in it.
 */
describe('access log rules', () => {
  it('names every read in words, and falls back to the stored code', () => {
    expect(describeResource('learnerGet')).toBe('Opened a learner record');
    expect(describeResource('attendanceMonitor')).toBe('Read the absence monitor');
    expect(describeResource('attendancePreview')).toBe('Daily attendance register');
    expect(describeResource('enrollmentRecordHistory')).toBe('Enrollment record review');
    expect(describeResource('scoreSheet')).toBe('Assessment scores');
    expect(describeResource('somethingNew')).toBe('somethingNew');
  });

  it('takes a record filter from the address, and only a well-formed one', () => {
    const id = randomUUID();
    expect(recordFromHash(`#/access?record=${id}`)).toBe(id);
    expect(recordFromHash(`#/access?record=${id.toUpperCase()}`)).toBe(id);
    expect(recordFromHash('#/access?record=not-an-id')).toBe('');
    expect(recordFromHash('#/access')).toBe('');
  });

  it('is a built, manager-only screen', () => {
    const route = routes.find(r => r.id === 'access')!;
    expect(route.built).toBe(true);
    expect(route.manager).toBe(true);
  });
});

describe('the access log screen against the API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const first = randomUUID(), second = randomUUID();
  const route = routes.find(r => r.id === 'access')!;
  const read = (actor: string, id: string) => request(app).get(`/api/v1/learners/${id}`).set('Authorization', `Bearer ${actor}`);
  const logged = async () => (await db.pg.query<{ n: number }>('select count(*)::integer as n from edunexus.record_access_events')).rows[0]!.n;
  const rows = (host: HTMLElement) => [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('row-panel'));
  /** The table's text alone: the staff filter lists every name, so the page's whole text proves nothing. */
  const table = (host: HTMLElement) => rows(host).map(tr => tr.textContent).join(' | ');

  const show = async (log: string[] = []) => {
    const view = await showRoute(app, route, { actor: ids.principal, manager: true, log });
    unmount = view.unmount;
    return view.host;
  };

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    for (const [id, last] of [[first, 'Alpha'], [second, 'Beta']]) {
      await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Synthetic',$2,'2015-01-01','female')", [id, last]);
    }
    expect((await read(ids.officer, first)).status).toBe(200);
    expect((await read(ids.principal, second)).status).toBe(200);
  });

  afterEach(async () => {
    if (unmount) await unmount();
    unmount = null;
    location.hash = '';
  });
  afterAll(async () => db?.database.close());

  it('lists who was shown which record, names the reader, and writes nothing itself', async () => {
    const before = await logged();
    const host = await show();
    await waitFor(() => rows(host).length >= 2 && host.textContent?.includes('Synthetic officer'), 'both reads');
    expect(host.textContent).toContain('Opened a learner record');
    expect(host.textContent).toContain('Synthetic principal');
    expect(host.textContent).not.toContain('Alpha');
    expect(await logged(), 'reading the log is not itself a record read').toBe(before);
  });

  it('narrows to one staff member', async () => {
    const log: string[] = [];
    const host = await show(log);
    await choose(host, 'Staff member', ids.officer);
    await click(byText(host, 'Search'));
    await waitFor(() => log.some(line => line.includes(`actor_user_id=${ids.officer}`)), 'the filtered request');
    await waitFor(() => rows(host).length === 1 && !table(host).includes('Synthetic principal'), 'only the officer’s read');
    expect(table(host)).toContain('Synthetic officer');
  });

  it('follows one record from a row, and says so when nothing matches', async () => {
    const host = await show();
    await waitFor(() => rows(host).length >= 2, 'the log');
    const officerRow = rows(host).find(tr => tr.textContent?.includes('Synthetic officer'))!;
    await expand(officerRow);
    expect(host.textContent).toContain(first);
    await click(byText(host, 'Every read of this record'));
    await waitFor(() => byLabel(host, 'Record ID')?.value === first, 'the record filter');
    await waitFor(() => rows(host).length === 1, 'the one read of that record');

    await fill(byLabel(host, 'Record ID'), randomUUID());
    await click(byText(host, 'Search'));
    await waitFor(() => host.textContent?.includes('No reads match'), 'the filtered empty state');
  });

  it('opens already narrowed when a link names a record', async () => {
    location.hash = `#/access?record=${second}`;
    const log: string[] = [];
    const host = await show(log);
    await waitFor(() => rows(host).length === 1, 'the linked record’s reads');
    expect(log.some(line => line.includes(`record_id=${second}`))).toBe(true);
    expect(byLabel(host, 'Record ID')?.value).toBe(second);
    expect(table(host)).toContain('Synthetic principal');
    expect(table(host)).not.toContain('Synthetic officer');
  });

  it('is linked from a learner’s record in the registry, for managers only', async () => {
    const learners = routes.find(r => r.id === 'learners')!;
    const view = await showRoute(app, learners, { actor: ids.principal, manager: true });
    unmount = view.unmount;
    const row = await waitFor(() => [...view.host.querySelectorAll('tbody tr')].find(tr => tr.textContent?.includes('Alpha')), 'the learner row');
    await expand(row);
    const link = await waitFor(() => view.host.querySelector<HTMLAnchorElement>(`a[href="#/access?record=${first}"]`), 'the access-log link');
    expect(link.textContent).toBe('Who has opened this record');
  });
});
