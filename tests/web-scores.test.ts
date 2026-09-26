// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byLabel, byText, choose, click, fill, showRoute, waitFor } from './helpers/dom';
import { byName, markProblem, nextSequence, pendingEntries, shownMark, taskChanges, type SheetRow, type Task } from '../web/screens/Scores';
import { routes } from '../web/routes';

const row = (id: string, raw: number | string | null, version = raw === null ? 0 : 1): SheetRow =>
  ({ enrollment_id: id, last_name: id, first_name: 'Synthetic', middle_name: null, name_extension: null, raw_score: raw, version });

describe('score sheet rules the screen applies before a request is spent', () => {
  it('accepts a blank, refuses a third decimal place, and holds the task maximum', () => {
    expect(markProblem('', 20)).toBeNull();
    expect(markProblem('  ', 20)).toBeNull();
    expect(markProblem('17.5', 20)).toBeNull();
    expect(markProblem('20', 20)).toBeNull();
    expect(markProblem('17.555', 20)).toContain('two decimal places');
    expect(markProblem('-1', 20)).toContain('two decimal places');
    expect(markProblem('abc', 20)).toContain('two decimal places');
    expect(markProblem('20.01', 20)).toContain('maximum for this assessment is 20');
  });

  it('sends only what changed, and a blank against a recorded mark as an explicit null', () => {
    const rows = [row('a', '18.00'), row('b', null), row('c', 12), row('d', null)];
    const entries = pendingEntries(rows, { a: '18', b: '', c: '', d: '9.5' });
    expect(entries.map(({ enrollment_id, raw_score, version, before }) => ({ enrollment_id, raw_score, version, before }))).toEqual([
      { enrollment_id: 'c', raw_score: null, version: 1, before: 12 },
      { enrollment_id: 'd', raw_score: 9.5, version: 0, before: null },
    ]);
    expect(pendingEntries(rows, {})).toEqual([]);
  });

  it('shows a mark as given, without rounding or padding it', () => {
    expect(shownMark('17.50')).toBe('17.5');
    expect(shownMark(20)).toBe('20');
    expect(shownMark(null)).toBe('');
    expect(shownMark('0')).toBe('0');
  });

  it('numbers the next assessment of a component after the last one', () => {
    const task = (component_code: string, sequence: number) => ({ component_code, sequence }) as Task;
    expect(nextSequence([task('WW', 1), task('WW', 2), task('PT', 1)], 'WW')).toBe(3);
    expect(nextSequence([task('PT', 1)], 'WW')).toBe(1);
  });

  it('orders a sheet by surname and names each revision of an assessment', () => {
    const rows = [row('b', null), row('a', null)].map((r, i) => ({ ...r, last_name: ['Zamora', 'Abad'][i]! }));
    expect([...rows].sort(byName).map(r => r.last_name)).toEqual(['Abad', 'Zamora']);
    const before = { title: 'Quiz', max_score: '20.00', status: 'open' } as Task;
    expect(taskChanges(null, before)).toEqual(['Added, out of 20']);
    expect(taskChanges(before, { ...before, title: 'Quiz 1', max_score: 25 })).toEqual(['Title “Quiz” → “Quiz 1”', 'Maximum 20 → 25']);
    expect(taskChanges(before, { ...before, status: 'archived' })).toEqual(['Archived']);
    expect(taskChanges(before, { ...before })).toEqual(['No field changed']);
  });

  it('is a built screen every role can open', () => {
    const route = routes.find(r => r.id === 'scores')!;
    expect(route.built).toBe(true);
    expect(route.manager).toBeFalsy();
  });
});

describe('the score screen against the API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const year = randomUUID(), section = randomUUID(), period = randomUUID();
  const enrollments: Record<string, string> = {};
  let bound = '', unbound = '';
  const reason = 'Synthetic class record for the score screen test.';
  const post = (url: string, body: object, actor = ids.principal) => request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${actor}`).send(body);
  const route = routes.find(r => r.id === 'scores')!;
  const sheet = () => document.querySelector('.sheet') as HTMLElement;
  const scores = async () => Object.fromEntries((await db.pg.query<{ last_name: string; raw_score: string | null; version: number }>(
    `select l.last_name,s.raw_score,s.version from edunexus.assessment_scores s join edunexus.enrollments e on e.id=s.enrollment_id
      join edunexus.learners l on l.id=e.learner_id order by l.last_name`)).rows.map(r => [r.last_name, r.raw_score === null ? null : Number(r.raw_score)]));
  const box = (host: HTMLElement, last: string) => byLabel(host, `Raw score, ${last}, Synthetic`) ?? host.querySelector<HTMLInputElement>(`input[aria-label="Raw score, ${last}, Synthetic"]`)!;

  const show = async (actor = ids.teacher) => {
    const view = await showRoute(app, route, { actor, manager: actor !== ids.teacher });
    unmount = view.unmount;
    return view.host;
  };
  /** The teacher's screen with its one assessment's sheet on show. */
  const sheetShown = async () => {
    const host = await show();
    await waitFor(() => box(host, 'Alvarez'), 'the class sheet');
    return host;
  };

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2003,'2003-06-01','2004-03-31')", [year]);
    await db.pg.query("insert into edunexus.reporting_periods(id,academic_year_id,ordinal,name,starts_on,ends_on) values($1,$2,1,'Synthetic first term','2003-06-01','2004-03-31')", [period, year]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,'Synthetic Acacia',$3)", [section, year, ids.teacher]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    const draft = (await post('/assessment-policy-drafts', { code: 'SYNPOL', name: 'Synthetic draft', source_reference: 'Synthetic source for testing only', grade_levels: [1], status: 'draft', reason,
      components: [{ code: 'WW', name: 'Synthetic written', weight_basis_points: 6000 }, { code: 'PT', name: 'Synthetic performance', weight_basis_points: 4000 }] })).body.data;
    const adoption = (await post('/assessment-policy-adoptions', { academic_year_id: year, policy_id: draft.id, policy_version: draft.version, adopted_on: '2003-06-15', adoption_reference: 'Synthetic school record reference.', reason })).body.data;
    for (const [code, name, order] of [['SYNMATH', 'Synthetic mathematics', 10], ['SYNART', 'Synthetic arts', 20]] as const) {
      const subject = (await post('/subjects', { code, name, kind: 'learning_area', grade_levels: [1], active: true, reason })).body.data;
      const offering = (await post(`/sections/${section}/subjects`, { subject_id: subject.id, subject_version: subject.version, display_order: order, reason })).body.data;
      if (code === 'SYNMATH') bound = offering.id; else unbound = offering.id;
    }
    const offering = (await request(app).get(`/api/v1/section-subjects/${bound}`).set('Authorization', `Bearer ${ids.principal}`)).body.data.record;
    const binding = await post('/assessment-policy-bindings', { offering_id: bound, offering_version: offering.version, adoption_id: adoption.id, adoption_version: adoption.version, reason });
    expect(binding.status, JSON.stringify(binding.body)).toBe(201);
    for (const last of ['Alvarez', 'Bautista', 'Cruz']) {
      const l = await post('/learners', { first_name: 'Synthetic', last_name: last, birth_date: '1997-01-01', sex: 'female' });
      const e = await post('/enrollments', { learner_id: l.body.data.id, section_id: section, enrolled_on: '2003-06-02' });
      expect(e.status, JSON.stringify(e.body)).toBe(201);
      enrollments[last] = e.body.data.id;
    }
  });
  beforeEach(async () => { await db.pg.query('delete from edunexus.request_buckets'); });
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });
  afterAll(async () => db?.database.close());

  it('lets the adviser add an assessment under a component of the bound policy', async () => {
    const host = await show();
    await waitFor(() => host.textContent?.includes('No assessments in this period'), 'the empty assessment list');
    await click(await waitFor(() => { const b = byText(host, 'Add an assessment') as HTMLButtonElement | undefined; return b && !b.disabled && b; }, 'an enabled add action'));
    const options = [...byLabel<HTMLSelectElement>(sheet(), 'Component')!.options].map(o => o.textContent);
    expect(options).toEqual(['Synthetic performance (PT)', 'Synthetic written (WW)']);
    await fill(byLabel<HTMLSelectElement>(sheet(), 'Component'), 'WW');
    await fill(byLabel(sheet(), 'Title'), 'Synthetic quiz');
    await fill(byLabel(sheet(), 'Maximum score'), '20');
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Add assessment'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    await waitFor(() => box(host, 'Alvarez'), 'the new class sheet');
    const tasks = (await db.pg.query<{ component_code: string; sequence: number; max_score: string }>('select component_code,sequence,max_score from edunexus.assessment_tasks')).rows;
    expect(tasks.map(t => [t.component_code, t.sequence, Number(t.max_score)])).toEqual([['WW', 1, 20]]);
    expect(host.textContent).toContain('Synthetic written 1: Synthetic quiz');
    expect(host.querySelectorAll('.unrecorded').length, 'every learner starts unrecorded').toBeGreaterThanOrEqual(3);
  });

  it('holds an out-of-range mark beside its box, then records only what changed', async () => {
    const host = await sheetShown();
    await fill(box(host, 'Alvarez'), '18');
    await fill(box(host, 'Bautista'), '25');
    expect(host.textContent).toContain('The maximum for this assessment is 20.');
    expect(box(host, 'Bautista').getAttribute('aria-invalid')).toBe('true');
    expect((byText(host, 'Record 2 marks') as HTMLButtonElement).disabled).toBe(true);
    await fill(box(host, 'Bautista'), '17.5');
    await click(byText(host, 'Record 2 marks'));
    expect(sheet().textContent).toContain('Not recorded');
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Record these marks'));
    await waitFor(() => !document.querySelector('.sheet'), 'the review to close');
    expect(await scores()).toEqual({ Alvarez: 18, Bautista: 17.5 });
    await waitFor(() => box(host, 'Bautista')?.value === '17.5', 'the reloaded sheet');
    expect(box(host, 'Cruz').value, 'an unrecorded learner stays blank, not zero').toBe('');
  });

  it('clears a mark only when its box is emptied, keeping the row and its history', async () => {
    const host = await sheetShown();
    await waitFor(() => box(host, 'Alvarez').value === '18', 'the recorded mark');
    await fill(box(host, 'Alvarez'), '');
    expect(host.textContent).toContain('Will be cleared');
    await click(byText(host, 'Record 1 mark'));
    expect(sheet().textContent).toContain('Cleared');
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Record these marks'));
    await waitFor(() => !document.querySelector('.sheet'), 'the review to close');
    expect(await scores()).toEqual({ Alvarez: null, Bautista: 17.5 });
    const history = await db.pg.query('select count(*)::integer as n from edunexus.assessment_score_events');
    expect(history.rows[0]).toEqual({ n: 2 });
  });

  it('shows a colleague’s newer mark before recording over it', async () => {
    const host = await sheetShown();
    await fill(box(host, 'Cruz'), '11');
    const task = (await db.pg.query<{ id: string }>('select id from edunexus.assessment_tasks')).rows[0]!.id;
    expect((await post(`/assessment-tasks/${task}/scores`, { entries: [{ enrollment_id: enrollments.Cruz, raw_score: 14, version: 0 }], reason })).status).toBe(201);
    await click(byText(host, 'Record 1 mark'));
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Record these marks'));
    await waitFor(() => sheet()?.textContent?.includes('Someone recorded a mark'), 'the conflict explained');
    expect((await scores()).Cruz, 'nothing was overwritten').toBe(14);
    await waitFor(() => sheet().querySelector('tbody')?.textContent?.includes('14'), 'the colleague’s mark shown as before');
    await click(byText(sheet(), 'Record these marks'));
    await waitFor(() => !document.querySelector('.sheet'), 'the second review to close');
    expect((await scores()).Cruz).toBe(11);
  });

  it('says a subject has no bound policy and offers nothing to type into', async () => {
    const host = await show();
    await choose(host, 'Subject', unbound);
    await waitFor(() => host.textContent?.includes('No assessment policy is bound to Synthetic arts'), 'the unbound explanation');
    expect((byText(host, 'Add an assessment') as HTMLButtonElement).disabled).toBe(true);
    expect(host.querySelector('.score-input')).toBeNull();
  });

  it('moves to the next learner on Enter and records nothing by itself', async () => {
    const host = await sheetShown();
    const first = box(host, 'Alvarez');
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => document.activeElement === box(host, 'Bautista'), 'the next learner’s box');
    expect(document.querySelector('.sheet'), 'Enter never opens the review').toBeNull();
  });

  it('shows a manager every recorded batch, newest first, with what each mark was', async () => {
    const host = await show(ids.principal);
    await waitFor(() => box(host, 'Alvarez'), 'the class sheet');
    await click(byText(host, 'Show changes to these marks'));
    const card = () => [...host.querySelectorAll('.card')].find(c => c.textContent?.includes('Changes to these marks'));
    const rows = await waitFor(() => { const r = card()?.querySelectorAll('tbody tr'); return r && r.length >= 4 && [...r]; }, 'the batch history');
    expect(rows[0]!.textContent).toContain(reason);
    await click(rows[rows.length - 1]!.querySelector('button.row-toggle'));
    const panel = card()!.querySelector('.row-panel')!;
    expect(panel.textContent).toContain('Alvarez, Synthetic');
    expect(panel.textContent).toContain('Not recorded');
  });

  it('never draws a total, average or percentage', async () => {
    const host = await sheetShown();
    const text = host.textContent ?? '';
    expect(text).not.toMatch(/\b(total|average|mean|percent|grade)\s*[:=]?\s*\d/i);
    expect(text).not.toMatch(/\d\s*%/);
    const headers = [...host.querySelectorAll('th')].map(th => th.textContent?.toLowerCase() ?? '');
    for (const word of ['total', 'average', 'percentage', 'grade', 'mps', 'gwa', 'transmuted']) expect(headers.some(h => h.includes(word)), word).toBe(false);
  });

  it('keeps another adviser out of the sheet', async () => {
    const view = await showRoute(app, route, { actor: ids.otherTeacher, manager: false });
    unmount = view.unmount;
    await waitFor(() => view.host.textContent?.includes('You are not the current adviser of any section'), 'the empty adviser scope');
    expect(view.host.querySelector('.score-input')).toBeNull();
  });
});
