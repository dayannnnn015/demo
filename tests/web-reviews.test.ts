// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byLabel, byText, check, choose, click, expand, fill, showRoute, waitFor } from './helpers/dom';
import { identityIssues, normalise, recordIssues, remap, sectionsOf, timelineProblems, type Entry } from '../web/screens/Reviews';
import { routes } from '../web/routes';

const e = (event_type: Entry['event_type'], effective_on: string, section_id: string, reason: string): Entry => ({ event_type, effective_on, section_id, reason });

describe('timeline rules the screen checks before a review', () => {
  const good = [e('enrolled', '2001-06-01', 'A', 'regular'), e('reassigned', '2001-06-10', 'B', 'section_change'), e('withdrawn', '2001-07-01', 'B', 'transfer_out'), e('reentered', '2001-08-01', 'A', 'return_to_school')];

  it('accepts a valid sequence', () => { expect(timelineProblems(good)).toEqual([]); });

  it('names each broken rule on the entry that breaks it', () => {
    expect(timelineProblems([e('reassigned', '2001-06-01', 'A', 'section_change')])).toEqual([
      { index: 0, text: 'The first entry must be the enrollment.' },
      { index: 0, text: 'A move needs the learner to be enrolled at the time.' },
    ]);
    expect(timelineProblems([good[0]!, { ...good[1]!, effective_on: '2001-06-01' }])[0]).toMatchObject({ index: 1, text: expect.stringContaining('strictly increase') });
    expect(timelineProblems([good[0]!, { ...good[1]!, section_id: 'A' }])[0]!.text).toContain('different section');
    expect(timelineProblems([good[0]!, e('reentered', '2001-06-10', 'A', 'return_to_school')])[0]!.text).toContain('withdrawn at the time');
    expect(timelineProblems([good[0]!, e('withdrawn', '2001-06-10', 'A', 'death'), e('reentered', '2001-07-01', 'A', 'return_to_school')])[0]!.text).toContain('after a recorded death');
    expect(timelineProblems([good[0]!, e('reassigned', '2001-06-10', 'B', 'transfer_out')])[0]!.text).toContain('is not a reason');
    expect(timelineProblems([{ ...good[0]!, effective_on: '' }])[0]!.text).toContain('Give this entry a date');
    expect(timelineProblems([])).toHaveLength(1);
  });

  it('keeps a withdrawal in the section it left', () => {
    expect(normalise([good[0]!, good[1]!, { ...good[2]!, section_id: '' }])[2]!.section_id).toBe('B');
  });

  it('remaps every section of a year to its counterpart in the corrected grade, keeping dates and reasons', () => {
    expect(sectionsOf(good)).toEqual(['A', 'B']);
    const mapped = remap(good, { A: 'X', B: 'Y' });
    expect(mapped.map(x => x.section_id)).toEqual(['X', 'Y', 'Y', 'X']);
    expect(mapped.map(x => [x.effective_on, x.reason])).toEqual(good.map(x => [x.effective_on, x.reason]));
  });

  it('explains every identity and record-review issue the API reports', () => {
    for (const code of ['SOURCE_HAS_LRN', 'IDENTITY_FIELDS_DIFFER', 'OVERLAPPING_ENROLLMENT_YEARS', 'TARGET_IS_LINKED', 'SOURCE_IS_LINKED', 'SOURCE_HAS_LINKS', 'LINK_NOT_FOUND', 'BIRTH_DATE_CONFLICT']) expect(identityIssues[code], code).toBeTruthy();
    for (const code of ['YEAR_CLOSED', 'RECORD_STATE_UNCHANGED', 'INVALID_REPLACEMENT', 'REPLACEMENT_IDENTITY_CONFLICT', 'REPLACEMENT_IN_USE', 'ANNUAL_ENROLLMENT_EXISTS', 'BIRTH_DATE_CONFLICT']) expect(recordIssues[code], code).toBeTruthy();
  });
});

describe('the reviewed corrections against the API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const year = randomUUID(), narra = randomUUID(), molave = randomUUID(), acacia = randomUUID();
  const reason = 'Checked against the school’s enrollment form for the screen test.';
  const call = (method: 'post' | 'patch', url: string, body: object) => request(app)[method](`/api/v1${url}`).set('Authorization', `Bearer ${ids.principal}`).send(body);
  const sheet = () => document.querySelector('.sheet') as HTMLElement;
  const show = async (id: string) => {
    const view = await showRoute(app, routes.find(r => r.id === id)!, { actor: ids.principal, manager: true });
    unmount = view.unmount;
    return view;
  };

  const learner = async (last: string, extra: object = {}) => {
    const r = await call('post', '/learners', { first_name: 'Synthetic', last_name: last, birth_date: '1994-02-03', sex: 'female', ...extra });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.data as { id: string; version: number };
  };
  const enrol = async (learnerId: string, section = narra, on = '2001-06-01') => {
    const r = await call('post', '/enrollments', { learner_id: learnerId, section_id: section, enrolled_on: on });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.data as { id: string; version: number };
  };
  const enrollment = async (id: string) => (await db.pg.query<{ grade_level: number; section_id: string; record_state: string; version: number; effective_on: string }>(
    'select grade_level,section_id,record_state,version,effective_on from edunexus.enrollments where id=$1', [id])).rows[0]!;
  const profile = async (id: string) => (await db.pg.query<{ lrn: string | null; merged_into: string | null }>('select lrn,merged_into from edunexus.learners where id=$1', [id])).rows[0]!;

  /** Opens the Enrollment screen on a section and expands the row for one learner. */
  const openRecord = async (section: string, last: string) => {
    const view = await show('enrollment');
    await choose(view.host, 'Section', section);
    const row = await waitFor(() => byText(view.host, new RegExp(`^${last}, Synthetic`), 'span')?.closest('tr'), `${last} in the class list`);
    await expand(row);
    return view;
  };

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-01','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2001-06-01','2002-03-31')", [year]);
    await db.pg.query(`insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values
      ($1,$4,3,'Synthetic Narra',$5),($2,$4,3,'Synthetic Molave',null),($3,$4,4,'Synthetic Acacia',null)`, [narra, molave, acacia, year, ids.teacher]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
  });
  beforeEach(async () => { await db.pg.query('delete from edunexus.request_buckets'); });
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });
  afterAll(async () => db?.database.close());

  it('corrects a movement date through the timeline review, keeping the original movement on file', async () => {
    const who = await learner('Timeliner');
    const record = await enrol(who.id);
    expect((await call('post', `/enrollments/${record.id}/movements`, { version: record.version, action: 'reassigned', effective_on: '2001-06-10', section_id: molave })).status).toBe(201);

    const { host } = await openRecord(molave, 'Timeliner');
    await click(await waitFor(() => byText(host, 'Correct the timeline'), 'the timeline action'));
    await fill(await waitFor(() => sheet().querySelector<HTMLInputElement>('input[aria-label="Entry 2: effective date"]'), 'the editable timeline'), '2001-06-08');
    await fill(byLabel(sheet(), 'Reason for this correction'), reason);
    await click(byText(sheet(), 'Review this correction'));

    await waitFor(() => byText(sheet(), 'Confirm this correction'), 'the review');
    expect(sheet().textContent).toContain('As recorded now');
    expect(sheet().textContent).toContain('2001-06-08');
    await click(byText(sheet(), 'Confirm this correction'));

    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect((await enrollment(record.id)).effective_on).toBe('2001-06-08');
    const original = await db.pg.query("select effective_on from edunexus.enrollment_events where enrollment_id=$1 and event_type='reassigned'", [record.id]);
    expect(original.rows).toEqual([{ effective_on: '2001-06-10' }]);
    expect((await db.pg.query('select count(*)::int n from edunexus.enrollment_corrections where enrollment_id=$1', [record.id])).rows[0]).toEqual({ n: 1 });
  });

  it('marks an impossible timeline on its entry and sends nothing', async () => {
    const { host, statuses } = await openRecord(molave, 'Timeliner');
    await click(await waitFor(() => byText(host, 'Correct the timeline'), 'the timeline action'));
    await fill(await waitFor(() => sheet().querySelector<HTMLInputElement>('input[aria-label="Entry 2: effective date"]'), 'the editable timeline'), '2001-05-20');
    await fill(byLabel(sheet(), 'Reason for this correction'), reason);
    await click(byText(sheet(), 'Review this correction'));
    expect(sheet().querySelector('tr.row-bad')?.textContent).toContain('strictly increase');
    expect(byText(sheet(), 'Confirm this correction')).toBeUndefined();
    expect(statuses.every(s => s.kind !== 'done')).toBe(true);
  });

  it('corrects a year recorded under the wrong grade, mapping each section', async () => {
    const who = await learner('Misplaced');
    const record = await enrol(who.id);

    const { host } = await openRecord(narra, 'Misplaced');
    await click(await waitFor(() => byText(host, 'Correct the grade'), 'the grade action'));
    await choose(sheet(), 'Corrected grade', '4');
    await choose(sheet(), 'Instead of Synthetic Narra', acacia);
    await fill(byLabel(sheet(), 'Reason for this correction'), reason);
    await click(byText(sheet(), 'Review this correction'));
    await click(await waitFor(() => byText(sheet(), 'Confirm the corrected grade'), 'the review'));

    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect(await enrollment(record.id)).toMatchObject({ grade_level: 4, section_id: acacia, effective_on: '2001-06-01' });
  });

  it('voids a record entered in error, then restores it', async () => {
    const who = await learner('Mistaken');
    const record = await enrol(who.id);

    let view = await openRecord(narra, 'Mistaken');
    await click(await waitFor(() => byText(view.host, 'Void this enrollment'), 'the void action'));
    await fill(byLabel(sheet(), 'Reason for this correction'), reason);
    await click(byText(sheet(), 'Review'));
    await click(await waitFor(() => byText(sheet(), 'Confirm and void'), 'the void review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect((await enrollment(record.id)).record_state).toBe('voided');
    await unmount!(); unmount = null;

    view = await openRecord(narra, 'Mistaken');
    expect(view.host.textContent).toContain('This record is voided');
    await click(await waitFor(() => byText(view.host, 'Restore this enrollment'), 'the restore action'));
    await fill(byLabel(sheet(), 'Reason for this correction'), reason);
    await click(byText(sheet(), 'Review'));
    await click(await waitFor(() => byText(sheet(), 'Confirm and restore'), 'the restore review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect((await enrollment(record.id)).record_state).toBe('valid');
  });

  it('voids a duplicate naming the enrollment that is kept, found through the registry', async () => {
    const kept = await learner('Keptrecord');
    const dup = await learner('Duperecord');
    const keptRecord = await enrol(kept.id, molave);
    const dupRecord = await enrol(dup.id);

    const { host } = await openRecord(narra, 'Duperecord');
    await click(await waitFor(() => byText(host, 'Void this enrollment'), 'the void action'));
    await choose(sheet(), 'Why it should not count', 'duplicate_record');
    await fill(byLabel(sheet(), 'Name or LRN'), 'Keptrecord');
    await click(byText(sheet(), 'Search'));
    await click(await waitFor(() => byText(sheet(), 'Choose'), 'the registry result'));
    await check(await waitFor(() => sheet().querySelector('input[type="radio"]'), 'the kept enrollment'));
    await fill(byLabel(sheet(), 'Reason for this correction'), reason);
    await click(byText(sheet(), 'Review'));
    await waitFor(() => byText(sheet(), 'Confirm and void'), 'the review');
    expect(sheet().textContent).toContain('Kept instead');
    await click(byText(sheet(), 'Confirm and void'));

    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect((await enrollment(dupRecord.id)).record_state).toBe('voided');
    expect((await db.pg.query('select replacement_enrollment_id from edunexus.enrollment_record_events where enrollment_id=$1', [dupRecord.id])).rows).toEqual([{ replacement_enrollment_id: keptRecord.id }]);
  });

  it('corrects an assigned LRN after showing the old and new numbers', async () => {
    const who = await learner('Lrnholder', { lrn: '100000000001' });
    const { host } = await show('learners');
    const row = await waitFor(() => byText(host, /^Lrnholder, Synthetic/, 'span')?.closest('tr'), 'the learner');
    await expand(row);
    await click(await waitFor(() => byText(host, /Correct the assigned LRN/, 'summary'), 'the LRN task'));
    await fill(byLabel(host, 'Corrected LRN'), '100000000002');
    await fill(byLabel(host, 'Reason for this correction'), reason);
    await click(byText(host, 'Review this correction'));
    await waitFor(() => byText(host, 'Confirm the corrected LRN'), 'the review');
    expect(host.textContent).toContain('100000000001');
    await click(byText(host, 'Confirm the corrected LRN'));

    await waitFor(() => host.textContent?.includes('LRN 100000000002'), 'the corrected list');
    expect((await profile(who.id)).lrn).toBe('100000000002');
  });

  it('links a duplicate record to the one kept, then reverses the link', async () => {
    const keep = await learner('Samechild', { lrn: '100000000010' });
    const dup = await learner('Samechilde');
    const view = await show('learners');
    const row = await waitFor(() => byText(view.host, /^Samechilde, Synthetic/, 'span')?.closest('tr'), 'the duplicate');
    await expand(row);
    await click(await waitFor(() => byText(view.host, /Identity links/, 'summary'), 'the identity task'));
    await click(byText(view.host, 'This is the same child as another record'));
    await fill(byLabel(sheet(), 'Name or LRN'), 'Samechild');
    await click(byText(sheet(), 'Search'));
    const found = await waitFor(() => byText(sheet(), /^Samechild, Synthetic/, 'span')?.closest('tr'), 'the kept record in the results');
    await click(byText(found!, 'Choose'));
    await check(byText(sheet(), /^Samechild, Synthetic/, 'span')!.closest('label')!.querySelector('input'));
    await fill(byLabel(sheet(), 'Reason for this correction'), reason);
    await click(byText(sheet(), 'Review'));
    await click(await waitFor(() => byText(sheet(), 'Confirm the link'), 'the link review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect((await profile(dup.id)).merged_into).toBe(keep.id);

    // The linked record is hidden until asked for, and then offers only reversal.
    await click(byText(view.host, 'Include records linked into another', 'span')!.closest('label')!.querySelector('input'));
    const linked = await waitFor(() => byText(view.host, /^Samechilde, Synthetic/, 'span')?.closest('tr'), 'the linked record');
    await expand(linked);
    await click(await waitFor(() => byText(view.host, 'Reverse this link'), 'the reversal'));
    await fill(await waitFor(() => byLabel(sheet(), 'Reason for this correction'), 'the reversal form'), reason);
    await click(byText(sheet(), 'Review'));
    await click(await waitFor(() => byText(sheet(), 'Confirm the reversal'), 'the reversal review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect((await profile(dup.id)).merged_into).toBeNull();
  });

  it('refuses to link away the record that carries the LRN, and says why', async () => {
    await learner('Lrnbearer', { lrn: '100000000020' });
    await learner('Lrnbearers');
    const view = await show('learners');
    const row = await waitFor(() => byText(view.host, /^Lrnbearers, Synthetic/, 'span')?.closest('tr'), 'the record');
    await expand(row);
    await click(await waitFor(() => byText(view.host, /Identity links/, 'summary'), 'the identity task'));
    await click(byText(view.host, 'This is the same child as another record'));
    await fill(byLabel(sheet(), 'Name or LRN'), 'Lrnbearer');
    await click(byText(sheet(), 'Search'));
    const found = await waitFor(() => byText(sheet(), /^Lrnbearer, Synthetic/, 'span')?.closest('tr'), 'the LRN record');
    await click(byText(found!, 'Choose'));
    // Keep the record without an LRN, linking the LRN-bearing one away.
    await check(byText(sheet(), /^Lrnbearers, Synthetic/, 'span')!.closest('label')!.querySelector('input'));
    await fill(byLabel(sheet(), 'Reason for this correction'), reason);
    await click(byText(sheet(), 'Review'));
    await waitFor(() => sheet().textContent?.includes('never clears one'), 'the LRN refusal');
    expect((byText(sheet(), 'Confirm the link') as HTMLButtonElement).disabled).toBe(true);
  });
});
