// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byLabel, byText, check, click, fill, mount, serverApi, waitFor } from './helpers/dom';
import { Due, actionsFor, changeBody, dueProblem, issueText, monitorView, Followups } from '../web/screens/Followups';
import { routes } from '../web/routes';

/**
 * The follow-up screen is the manager's only way to open, act on and read a
 * case, and every rule it states is one the API also enforces. The first block
 * pins the pure rules; the rest drive the real screen against the real API.
 */
describe('follow-up rules the screen applies before a request is spent', () => {
  it('offers only the actions each state allows', () => {
    expect(actionsFor('open')).toEqual(['update', 'resolve', 'cancel']);
    expect(actionsFor('resolved')).toEqual(['reopen']);
    expect(actionsFor('cancelled')).toEqual(['reopen']);
  });

  it('finds candidates with the same test the database applies', () => {
    expect(monitorView).toEqual({ absence: 'with_absences', recording_gap: 'incomplete' });
  });

  it('refuses a new due date in the past but lets an update keep an elapsed one', () => {
    expect(dueProblem('open', '2026-01-01', null, '2026-06-10')).toContain('cannot be in the past');
    expect(dueProblem('reopen', '2026-06-09', null, '2026-06-10')).toContain('cannot be in the past');
    expect(dueProblem('update', '2026-06-01', '2026-06-01', '2026-06-10')).toBeNull();
    expect(dueProblem('update', '2026-06-02', '2026-06-01', '2026-06-10')).toContain('cannot be in the past');
    expect(dueProblem('open', '2026-06-10', null, '2026-06-10')).toBeNull();
    expect(dueProblem('open', '', null, '2026-06-10')).toBeNull();
    expect(dueProblem('resolve', '2020-01-01', null, '2026-06-10')).toBeNull();
  });

  it('always sends a due date key, and clears it when a case closes', () => {
    const resolve = changeBody('resolve', 3, 'u', '2099-01-01', '  Followed up   with the family. ');
    expect(resolve).toEqual({ version: 3, action: 'resolve', assignee_user_id: 'u', due_on: null, reason: 'Followed up with the family.' });
    expect(changeBody('cancel', 1, 'u', '2099-01-01', 'Opened twice by mistake.').due_on).toBeNull();
    expect(changeBody('update', 1, 'u', '', 'Handed over to the officer.')).toHaveProperty('due_on', null);
    expect(changeBody('update', 1, 'u', '2099-01-01', 'Due next week.').due_on).toBe('2099-01-01');
  });

  it('explains every blocking issue the API can report', () => {
    for (const code of ['YEAR_NOT_ACTIVE', 'NO_ELIGIBLE_MEMBERSHIP', 'NO_MATCHING_EVIDENCE', 'OPEN_CASE_EXISTS']) {
      expect(issueText[code]!.length, code).toBeGreaterThan(40);
    }
  });

  it('draws a missing due date rather than blanking it', () => {
    const html = renderToString(createElement(Due, { due: null }));
    expect(html).toContain('unrecorded');
    expect(html).not.toContain('—');
    expect(renderToString(createElement(Due, { due: '2026-06-01', overdue: true }))).toContain('Overdue');
  });

  it('is a built, manager-only screen', () => {
    const route = routes.find(r => r.id === 'followups')!;
    expect(route.built).toBe(true);
    expect(route.manager).toBe(true);
  });
});

describe('the follow-up screen against the API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const year = randomUUID(), section = randomUUID();
  const day = (d: number) => `2001-06-${String(d).padStart(2, '0')}`;
  const reason = 'Synthetic evidence reviewed for the screen test.';
  const post = (url: string, body: object) => request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${ids.principal}`).send(body);
  const route = routes.find(r => r.id === 'followups')!;

  /** The screen as the shell hosts it, with a real `reload` that re-keys every fetch. */
  function Host({ actor, log }: { actor: string; log: string[] }) {
    const [token, setToken] = useState(0);
    const api = serverApi(app, actor, log);
    return createElement(Followups, {
      api, me: { user_id: actor }, manager: true, setStatus: () => {}, reload: () => setToken(t => t + 1), token, route,
    });
  }
  const show = async (actor = ids.principal, log: string[] = []) => {
    const view = await mount(createElement(Host, { actor, log }));
    unmount = view.unmount;
    return view.host;
  };

  const learner = async (last: string) => {
    const id = randomUUID();
    await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Synthetic',$2,'1994-01-01','female')", [id, last]);
    const rows = await db.asUser(ids.principal, tx => tx.query("select * from edunexus.enroll_learner($1,$2,$3,'regular')", [id, section, day(1)]));
    return String(rows[0]!.id);
  };
  const mark = async (enrollment: string, d: number, am: string | null, pm: string | null) => {
    const version = (await db.pg.query<{ version: number }>('select version from edunexus.attendance_days where section_id=$1 and day_on=$2', [section, day(d)])).rows[0]?.version ?? 0;
    const body = { day_on: day(d), version, changes: [{ enrollment_id: enrollment, am, pm }], reason };
    const p = await post(`/sections/${section}/attendance/preview`, body);
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    const c = await post(`/sections/${section}/attendance/corrections`, { ...body, review_hash: p.body.data.review_hash, reviewed: true });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
  };
  const cases = async () => (await db.pg.query<{ id: string; status: string; assignee_user_id: string; due_on: string | null; version: number; enrollment_id: string }>(
    'select id,status,assignee_user_id,due_on,version,enrollment_id from edunexus.attendance_followups order by created_at')).rows;
  const sheet = () => document.querySelector('.sheet') as HTMLElement;
  /** Enabled only once the owners have loaded: a case cannot be opened without one. */
  const openAction = (host: HTMLElement) => waitFor(() => {
    const button = byText(host, 'Open a case') as HTMLButtonElement | undefined;
    return button && !button.disabled && button;
  }, 'an enabled open action');

  /** Open a case through the screen, the way a manager would. */
  const openThroughScreen = async (host: HTMLElement, name: string, category?: 'recording_gap') => {
    await click(await openAction(host));
    await fill(byLabel(sheet(), 'From'), day(1));
    await fill(byLabel(sheet(), 'To'), day(3));
    if (category) await fill(byLabel<HTMLSelectElement>(sheet(), 'Category'), category);
    await click(byText(sheet(), 'Find learners with this evidence'));
    await check(await waitFor(() => sheet().querySelector<HTMLInputElement>(`input[aria-label^="${name}"]`), `${name} in the candidates`));
    await fill(byLabel<HTMLSelectElement>(sheet(), 'Owner'), ids.officer);
    await fill(byLabel(sheet(), 'Due date'), '2099-01-15');
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Review this case'));
  };

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-01','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,3,'Synthetic Narra',$3)", [section, year, ids.teacher]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2001-06-01','2002-03-31')", [year]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    const body = { version: 0, section_id: null, reason, changes: [1, 2, 3].map(d => ({ day_on: day(d), action: 'set', am: 'classroom', pm: 'classroom', day_type: 'regular', label: 'Synthetic classroom' })) };
    const p = await post(`/academic-years/${year}/calendar/preview`, body);
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    expect((await post(`/academic-years/${year}/calendar/corrections`, { ...body, review_hash: p.body.data.review_hash, reviewed: true })).status).toBe(201);
  });
  beforeEach(async () => { await db.pg.query('delete from edunexus.request_buckets'); });
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });
  afterAll(async () => db?.database.close());

  it('opens a case from a recorded absence, then lists it with its owner and due date', async () => {
    const enrollment = await learner('Absentia');
    await mark(enrollment, 1, 'absent', 'absent');
    for (const d of [2, 3]) await mark(enrollment, d, 'present', 'present');

    const host = await show();
    await waitFor(() => byText(host, 'No open cases', 'h3'), 'the empty queue');
    await openThroughScreen(host, 'Absentia');

    const confirm = await waitFor(() => byText(sheet(), 'Confirm and open the case'), 'the review');
    expect(sheet().textContent).toContain('Recorded absence');
    expect(sheet().textContent).toContain('Sessions marked absent');
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await click(confirm);

    await waitFor(() => !document.querySelector('.sheet') && byText(host, /Absentia/, 'td'), 'the new case in the queue');
    const row = byText(host, /Absentia/, 'td')!.closest('tr')!;
    expect(row.textContent).toContain('Synthetic officer');
    expect(row.textContent).toContain('2099-01-15');
    expect(row.textContent).toContain('Open');
    expect(await cases()).toMatchObject([{ status: 'open', assignee_user_id: ids.officer, due_on: '2099-01-15', enrollment_id: enrollment, version: 1 }]);
  });

  it('finds a learner with only unmarked sessions under a gap, never under absence', async () => {
    const enrollment = await learner('Unmarkedson');
    await mark(enrollment, 1, 'present', null);

    const host = await show();
    await click(await openAction(host));
    await fill(byLabel(sheet(), 'From'), day(1));
    await fill(byLabel(sheet(), 'To'), day(3));
    await click(byText(sheet(), 'Find learners with this evidence'));
    await waitFor(() => sheet().querySelector('input[type="radio"]'), 'the absence candidates');
    expect(sheet().querySelector('input[aria-label^="Unmarkedson"]')).toBeNull();

    await fill(byLabel<HTMLSelectElement>(sheet(), 'Category'), 'recording_gap');
    await click(byText(sheet(), 'Find learners with this evidence'));
    await waitFor(() => sheet().querySelector('input[aria-label^="Unmarkedson"]'), 'the gap candidate');
  });

  it('shows why a second open case is refused and offers no confirmation', async () => {
    const host = await show();
    await waitFor(() => byText(host, /Absentia/, 'td'), 'the queue');
    const before = (await cases()).length;
    await openThroughScreen(host, 'Absentia');

    await waitFor(() => sheet().textContent?.includes('already has an open case'), 'the refusal');
    expect((byText(sheet(), 'Confirm and open the case') as HTMLButtonElement).disabled).toBe(true);
    expect((await cases()).length).toBe(before);
  });

  it('compares opening evidence with current records, then resolves with the due date cleared', async () => {
    const [opened] = await cases();
    const host = await show();
    const row = await waitFor(() => byText(host, /Absentia/, 'td')?.closest('tr'), 'the queue row');
    await click(byText(row!, 'Case'));
    await waitFor(() => host.textContent?.includes('exactly as they were'), 'the unchanged evidence');

    // A correction behind the case: a present session becomes an absence.
    await mark(opened!.enrollment_id, 2, 'absent', 'present');
    await click(byText(row!, 'Case'));
    await click(byText(row!, 'Case'));
    await waitFor(() => host.textContent?.includes('The records have changed since this case was opened'), 'the change notice');

    await click(byText(host, 'Resolve'));
    expect(byLabel(sheet(), 'Due date')).toBeUndefined();
    await fill(byLabel(sheet(), 'Reason'), 'Spoke with the family; attendance has resumed.');
    await click(byText(sheet(), 'Review this change'));
    await click(await waitFor(() => byText(sheet(), 'Confirm this review'), 'the resolve review'));

    await waitFor(() => !document.querySelector('.sheet') && byText(host, 'No open cases', 'h3'), 'the emptied queue');
    expect(await cases()).toMatchObject([{ id: opened!.id, status: 'resolved', due_on: null, version: 2 }]);
  });

  it('stops a reopening with a past due date before any request is sent', async () => {
    const log: string[] = [];
    const host = await show(ids.principal, log);
    await fill(await waitFor(() => byLabel<HTMLSelectElement>(host, 'Status'), 'the status filter'), 'resolved');
    const row = await waitFor(() => byText(host, /Absentia/, 'td')?.closest('tr'), 'the resolved case');
    await click(byText(row!, 'Case'));
    await click(await waitFor(() => byText(host, 'Reopen'), 'the reopen action'));

    await fill(byLabel(sheet(), 'Due date'), '2001-06-03');
    await fill(byLabel(sheet(), 'Reason'), 'Absences have started again this week.');
    await click(byText(sheet(), 'Review this change'));
    expect(sheet().textContent).toContain('cannot be in the past');
    expect(log.filter(line => line.startsWith('POST'))).toEqual([]);
  });

  it('answers a stale version with a refusal instead of overwriting another manager', async () => {
    const [opened] = await cases();
    const host = await show();
    await fill(await waitFor(() => byLabel<HTMLSelectElement>(host, 'Status'), 'the status filter'), 'resolved');
    const row = await waitFor(() => byText(host, /Absentia/, 'td')?.closest('tr'), 'the resolved case');
    await click(byText(row!, 'Case'));
    await click(await waitFor(() => byText(host, 'Reopen'), 'the reopen action'));

    // Another manager reopens the case while this one is still typing.
    const current = (await cases()).find(c => c.id === opened!.id)!;
    const body = { version: current.version, action: 'reopen', assignee_user_id: ids.principal, due_on: null, reason };
    const p = await post(`/attendance-follow-ups/${opened!.id}/preview`, body);
    expect((await post(`/attendance-follow-ups/${opened!.id}/events`, { ...body, review_hash: p.body.data.review_hash, reviewed: true })).status).toBe(201);

    await fill(byLabel(sheet(), 'Reason'), 'Absences have started again this week.');
    await click(byText(sheet(), 'Review this change'));
    await waitFor(() => sheet().querySelector('.status.error'), 'the conflict');
    expect(byText(sheet(), 'Confirm this review')).toBeUndefined();
    expect((await cases()).find(c => c.id === opened!.id)).toMatchObject({ status: 'open', version: current.version + 1 });
  });

  it('shows a teacher no queue, because the API refuses every case read to them', async () => {
    const host = await show(ids.teacher);
    await waitFor(() => host.textContent?.includes('The queue could not be read'), 'the refusal');
    expect(byText(host, /Absentia/, 'td')).toBeUndefined();
  });
});
