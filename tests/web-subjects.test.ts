// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byLabel, byText, choose, click, fill, showRoute, waitFor } from './helpers/dom';
import { byDisplay, changed, gradesText } from '../web/screens/Subjects';
import { routes } from '../web/routes';

describe('subject rules the screen applies', () => {
  it('writes grade applicability the way a register would', () => {
    expect(gradesText([0])).toBe('Kindergarten');
    expect(gradesText([1, 2, 3])).toBe('Grades 1–3');
    expect(gradesText([0, 1, 2, 3, 4, 5, 6])).toBe('Kindergarten, Grades 1–6');
    expect(gradesText([4])).toBe('Grade 4');
    expect(gradesText([1, 2, 5])).toBe('Grades 1, 2, 5');
    expect(gradesText([3, 1, 2, 6])).toBe('Grades 1–3, 6');
  });

  it('names what a revision changed', () => {
    const before = { name: 'Reading', kind: 'learning_area' as const, grade_levels: [1, 2], active: true };
    expect(changed(null, before)).toEqual(['Created']);
    expect(changed(before, { ...before, name: 'Reading and Literacy' })).toEqual(['Name: Reading → Reading and Literacy']);
    expect(changed(before, { ...before, grade_levels: [1, 2, 3], active: false })).toEqual(['Grades: Grades 1, 2 → Grades 1–3', 'Archived']);
  });

  it('orders offerings by display order, then code, then id', () => {
    const o = (id: string, order: number, code: string) => ({ id, display_order: order, subject_snapshot: { code } }) as never;
    const sorted = [o('c', 2, 'MATH'), o('b', 1, 'SCI'), o('a', 1, 'ENG'), o('d', 1, 'ENG')].sort(byDisplay).map((x: { id: string }) => x.id);
    expect(sorted).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a built screen advisers can open', () => {
    const route = routes.find(r => r.id === 'subjects')!;
    expect(route.built).toBe(true);
    expect(route.manager).toBeFalsy();
  });
});

describe('the subjects screen against the API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const active = randomUUID(), draft = randomUUID(), narra = randomUUID(), kinder = randomUUID(), planned = randomUUID();
  const reason = 'Synthetic subject setup for the screen test.';
  const route = routes.find(r => r.id === 'subjects')!;
  const as = (actor: string) => ({
    post: (url: string, body: object) => request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${actor}`).send(body),
    patch: (url: string, body: object) => request(app).patch(`/api/v1${url}`).set('Authorization', `Bearer ${actor}`).send(body),
  });
  const show = async (actor = ids.principal) => {
    const view = await showRoute(app, route, { actor, manager: actor !== ids.teacher });
    unmount = view.unmount;
    return view;
  };
  const sheet = () => document.querySelector('.sheet') as HTMLElement;
  const subject = async (code: string) => (await db.pg.query<{ id: string; code: string; name: string; grade_levels: number[]; version: number; active: boolean }>(
    'select id,code,name,grade_levels,version,active from edunexus.subjects where code=$1', [code])).rows[0];
  const offerings = async (section: string) => (await db.pg.query<{ id: string; active: boolean; display_order: number; version: number; pinned: number; name: string }>(
    "select id,active,display_order,version,(subject_snapshot->>'version')::int pinned,subject_snapshot->>'name' name from edunexus.section_subjects where section_id=$1 order by display_order", [section])).rows;
  /** Screens open on the first section returned; these tests read Narra unless they say otherwise. */
  const narraView = async (actor = ids.principal) => {
    const view = await show(actor);
    await choose(view.host, 'Section', narra);
    return view;
  };
  /** The two tables share subject codes, so a row is always looked up inside the card it belongs to. */
  const card = (host: HTMLElement, heading: string) => byText(host, heading, 'h2')?.closest('.card') as HTMLElement | undefined;
  const inCard = (heading: string) => (host: HTMLElement, text: string | RegExp) =>
    waitFor(() => { const c = card(host, heading); return c && (byText(c, text, 'td')?.closest('tr') as HTMLTableRowElement | undefined); }, `${text} under ${heading}`);
  const row = inCard('Section offerings');
  const catalogRow = inCard('Subject catalog');

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-01','2002-03-31'),($2,2002,'2002-06-01','2003-03-31')", [active, draft]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2001-06-01','2002-03-31')", [active]);
    await db.pg.query(`insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values
      ($1,$4,3,'Synthetic Narra',$5),($2,$4,0,'Synthetic Sampaguita',null),($3,$6,3,'Synthetic Planned',null)`, [narra, kinder, planned, active, ids.teacher, draft]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [active]);
  });
  beforeEach(async () => { await db.pg.query('delete from edunexus.request_buckets'); });
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });
  afterAll(async () => db?.database.close());

  it('adds a subject, with grades chosen as a set and the code stored in capitals', async () => {
    const { host } = await show();
    await waitFor(() => byText(host, 'The catalog is empty', 'h3'), 'the empty catalog');
    await click(byText(host, 'Add a subject'));
    await fill(byLabel(sheet(), 'Code'), 'read3');
    await fill(byLabel(sheet(), 'Name'), 'Reading');
    for (const grade of ['Grade 1', 'Grade 2', 'Grade 3']) await click(byText(sheet(), grade, 'label')!.querySelector('input'));
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Add to the catalog'));

    await waitFor(() => !document.querySelector('.sheet') && byText(host, 'READ3', 'b'), 'the new subject');
    expect((await catalogRow(host, 'Grades 1–3')).textContent).toContain('Reading');
    expect(await subject('READ3')).toMatchObject({ name: 'Reading', grade_levels: [1, 2, 3], version: 1, active: true });
  });

  it('puts a rejection beside the field that caused it', async () => {
    const { host } = await show();
    await click(await waitFor(() => byText(host, 'Add a subject'), 'the add action'));
    await fill(byLabel(sheet(), 'Code'), 'EMPTY');
    await fill(byLabel(sheet(), 'Name'), 'No grades chosen');
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Add to the catalog'));

    const bad = await waitFor(() => sheet().querySelector('.field.bad'), 'the marked field');
    expect(bad.textContent).toContain('Applies to');
    expect(sheet().querySelector('.error-summary')?.textContent).toContain('Applies to');
    expect(await subject('EMPTY')).toBeUndefined();
  });

  it('offers only available subjects that apply to the section grade, and pins the revision chosen', async () => {
    await as(ids.principal).post('/subjects', { code: 'KDOM', name: 'Kinder domain', kind: 'developmental_domain', grade_levels: [0], active: true, reason });
    const { host } = await narraView();
    await waitFor(() => byText(host, /No subjects offered to Grade 3/, 'h3'), 'the empty section');
    await click(byText(host, 'Offer a subject'));
    const choice = byLabel<HTMLSelectElement>(sheet(), 'Subject')!;
    const offered = [...choice.options].map(o => o.textContent);
    expect(offered).toEqual(['READ3 — Reading']);
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Offer this subject'));

    await waitFor(() => !document.querySelector('.sheet') && byText(host, 'Unchanged', 'span'), 'the new offering');
    expect(await offerings(narra)).toMatchObject([{ active: true, display_order: 1, pinned: 1, name: 'Reading' }]);
  });

  it('shows a section keeping its revision after the catalog moves on, and refuses a refresh in an active year', async () => {
    const read = (await subject('READ3'))!;
    expect((await as(ids.principal).patch(`/subjects/${read.id}`, { version: 1, name: 'Reading and Literacy', kind: 'learning_area', grade_levels: [1, 2, 3], active: true, reason })).status).toBe(200);

    const { host } = await narraView();
    const tr = await row(host, 'READ3');
    expect(tr.textContent).toContain('Version 2');
    expect(tr.textContent).toContain('Reading');
    expect(tr.textContent).not.toContain('Reading and Literacy');
    await click(byText(tr, 'Manage'));
    await waitFor(() => host.textContent?.includes('The catalog has moved on'), 'the pinned-revision notice');
    expect(host.textContent).toContain('only possible while the school year is a draft');
    expect(byText(host, /Refresh to catalog version/, 'summary')).toBeUndefined();
  });

  it('refreshes a draft-year offering to the current catalog revision when asked', async () => {
    const read = (await subject('READ3'))!;
    expect((await as(ids.principal).post(`/sections/${planned}/subjects`, { subject_id: read.id, subject_version: read.version, display_order: 1, reason })).status).toBe(201);
    expect((await as(ids.principal).patch(`/subjects/${read.id}`, { version: read.version, name: 'Reading, Revised', kind: 'learning_area', grade_levels: [1, 2, 3], active: true, reason })).status).toBe(200);

    const { host } = await show();
    await choose(host, 'School year', draft);
    const tr = await row(host, 'READ3');
    await click(byText(tr, 'Manage'));
    const task = await waitFor(() => byText(host, /Refresh to catalog version 3/, 'summary'), 'the refresh task');
    await click(task);
    const body = task.closest('details')!;
    await fill(byLabel(body, 'Reason'), 'Take the revised catalog name before the year starts.');
    await click(byText(body, 'Refresh the pinned details'));

    await waitFor(() => byText(host, 'Unchanged', 'span'), 'the refreshed offering');
    expect(await offerings(planned)).toMatchObject([{ pinned: 3, name: 'Reading, Revised', version: 2 }]);
  });

  it('retires an offering, which then shows only with retired ones included', async () => {
    const { host } = await narraView();
    const tr = await row(host, 'READ3');
    await click(byText(tr, 'Manage'));
    await fill(await waitFor(() => byLabel<HTMLSelectElement>(host, 'State'), 'the state field'), 'false');
    await fill(byLabel(host, 'Reason'), 'Not taught in this section this year.');
    await click(byText(host, 'Save'));

    await waitFor(() => byText(host, /No subjects offered to Grade 3/, 'h3'), 'the emptied list');
    await click(byText(host, 'Include retired', 'span')!.closest('label')!.querySelector('input'));
    expect((await row(host, 'READ3')).textContent).toContain('Retired');
    expect((await offerings(narra))[0]).toMatchObject({ active: false, version: 2 });
  });

  it('answers a stale catalog edit with a conflict instead of overwriting', async () => {
    const view = await narraView();
    const tr = await catalogRow(view.host, 'READ3');
    await click(byText(tr, 'Edit'));
    const before = (await subject('READ3'))!;
    expect((await as(ids.officer).patch(`/subjects/${before.id}`, { version: before.version, name: 'Changed elsewhere', kind: 'learning_area', grade_levels: [1, 2, 3], active: true, reason })).status).toBe(200);

    await fill(byLabel(view.host, 'Name'), 'My edit');
    await fill(byLabel(view.host, 'Reason'), reason);
    await click(byText(view.host, 'Save this revision'));
    await waitFor(() => view.lastStatus()?.kind === 'error', 'the conflict');
    expect(view.lastStatus()!.text.toLowerCase()).toMatch(/changed|version/);
    expect((await subject('READ3'))!.name).toBe('Changed elsewhere');
  });

  it('gives an adviser a read-only view of their own section', async () => {
    const read = (await subject('READ3'))!;
    const [offering] = await offerings(narra);
    expect((await as(ids.principal).patch(`/section-subjects/${offering!.id}`, { version: offering!.version, active: true, display_order: 1, refresh_subject: false, subject_version: null, reason })).status).toBe(200);

    const { host } = await show(ids.teacher);
    const tr = await row(host, 'READ3');
    expect(tr.textContent).not.toContain('Changed elsewhere');
    expect(tr.textContent).toContain('Reading');
    expect(byText(host, 'Offer a subject')).toBeUndefined();
    expect(byText(host, 'Add a subject')).toBeUndefined();
    expect(byText(host, 'Manage')).toBeUndefined();
    expect(byText(host, 'Edit')).toBeUndefined();
    // The only section they can pick is the one they advise.
    const sections = [...byLabel<HTMLSelectElement>(host, 'Section')!.options].map(o => o.textContent);
    expect(sections).toEqual(['Grade 3 · Synthetic Narra']);
    expect(read.code).toBe('READ3');
  });
});
