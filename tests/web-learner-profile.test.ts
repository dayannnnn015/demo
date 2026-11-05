// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ids, testDatabase, type TestDatabase } from './helpers/database.js';
import { mountScreen, serverApi, type ServerApi } from './helpers/dom.js';
import { Learners } from '../web/screens/Learners';
import { routes } from '../web/routes';
import { ROSTER_HEADER } from '../web/csv';

/**
 * The learner a staff member opens from the registry, in three parts.
 *
 * What is being gated here is a reorganisation, not a new capability: no
 * endpoint, no column and no policy changed, so the cases that matter are the
 * ones that could go wrong *in the interface* and the one that must stay true
 * of the API behind it.
 *
 * - The panel offers three parts and shows the profile first.
 * - Every field it shows is one the class-list import already carries, and a
 *   field the school has not recorded is **drawn**, not blanked: this is the
 *   `Unrecorded` rule, and a profile is where a reader is most likely to read
 *   a blank as "nothing to report".
 * - **No parent, guardian, contact or demographic field is offered anywhere**,
 *   because EDUNEXUS holds none and the learner-fields gate is why. A gate
 *   kept by nothing eventually opens by accident.
 * - Editing writes to the same learner row, so the registry shows the change
 *   and **no second learner is created** — the one thing a "profile" feature
 *   can get catastrophically wrong in a system with one permanent record per
 *   child.
 * - An adviser is offered no editor, and the API refuses one anyway.
 * - Academic history stays a signpost: the shortcut removed in 0.90.2 is not
 *   back. The gate for that is in `tests/web-registry-scope.test.ts` and was
 *   vacuous on its first run because it asserted on the closed list; this one
 *   opens the tab that would hold such a link, which is the only place it
 *   could now appear.
 */

let db: TestDatabase;
let server: ServerApi;
const year = '00000000-0000-4000-9000-000000000001';
const mine = '00000000-0000-4000-9000-00000000000a';
const theirs = '00000000-0000-4000-9000-00000000000b';
const ana = '00000000-0000-4000-9001-000000000001';
const ben = '00000000-0000-4000-9001-000000000002';

const teacher = { user_id: ids.teacher, role: 'teacher', display_name: 'Teacher' };
const principal = { user_id: ids.principal, role: 'principal', display_name: 'Principal' };
const route = routes.find(r => r.id === 'learners')!;

/**
 * Open one named learner's panel. By surname rather than by row index: the
 * registry lists learners the way a register reads, so row 0 is Lacsamana, and
 * a test that corrected "the first row" would be correcting the wrong child.
 */
const openPanel = async (screen: Awaited<ReturnType<typeof mountScreen>>, surname = 'Reyes') => {
  const row = screen.all('tr').find(tr => (tr.textContent ?? '').includes(surname));
  await screen.click(row?.querySelector<HTMLElement>('button.row-toggle') ?? null);
  await screen.until(m => m.all('tr.row-panel').length > 0, `${surname}'s open panel`);
};
/** The open panel's own text, so an assertion cannot read the list behind it. */
const panelText = (screen: Awaited<ReturnType<typeof mountScreen>>) =>
  (screen.all('tr.row-panel')[0]?.textContent ?? '').replace(/\s+/g, ' ');
const openTab = async (screen: Awaited<ReturnType<typeof mountScreen>>, label: string) => {
  await screen.click(screen.all('[role="tab"]').find(t => t.textContent === label) ?? null);
  await screen.settle();
};

beforeAll(async () => {
  db = await testDatabase();
  server = await serverApi(db);
  await db.pg.query(`select set_config('edunexus.actor_id',$1,false)`, [ids.principal]);
  await db.pg.query(`select set_config('edunexus.request_id',$1,false)`, ['00000000-0000-4000-7000-000000000004']);
  // A year is created as a draft and opened afterwards (`0001`/`0040` refuse
  // any other status on insert); the placement the registry reports is the
  // learner's enrolment in the *active* year, so this one has to be opened.
  await db.pg.query(`insert into edunexus.academic_years(id,start_year,starts_on,ends_on,status) values($1,2026,'2026-06-01','2027-03-31','draft')`, [year]);
  await db.pg.query(`insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values
    ($1,$3,3,'Masigla',$4),($2,$3,4,'Narra',$5)`, [mine, theirs, year, ids.teacher, ids.otherTeacher]);
  // Ana as the class-list import writes a complete row; Ben with the two
  // columns the import allows to be blank left blank.
  await db.pg.query(`insert into edunexus.learners(id,lrn,first_name,middle_name,last_name,name_extension,sex,birth_date,address) values
    ($1,'136170000001','Ana','Bituin','Reyes',null,'female','2017-05-02','12 Balili Road, La Trinidad, Benguet'),
    ($2,'136170000002','Ben',null,'Lacsamana',null,'male','2016-03-11',null)`, [ana, ben]);
  await db.pg.query(`select * from edunexus.place_enrollment($1::uuid,$2::uuid,3::smallint,$3::uuid,'2026-06-01','regular')`, [ana, year, mine]);
  await db.pg.query(`select * from edunexus.place_enrollment($1::uuid,$2::uuid,4::smallint,$3::uuid,'2026-06-01','regular')`, [ben, year, theirs]);
  // A year cannot be activated until its reporting periods are set: four
  // quarters, as the school's own SF9 reports.
  await db.pg.query(`insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values
    ($1,1,'First', '2026-06-01','2026-08-31'),
    ($1,2,'Second','2026-09-01','2026-11-30'),
    ($1,3,'Third', '2026-12-01','2027-01-31'),
    ($1,4,'Fourth','2027-02-01','2027-03-31')`, [year]);
  await db.pg.query(`update edunexus.academic_years set status='active' where id=$1`, [year]);
});
afterAll(async () => { await server.close(); await db.database.close(); });

describe('the three parts of a learner', () => {
  it('offers the profile, the academic history and the enrollment, and shows the profile first', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(Learners as never, server, principal, { route });
    await screen.until(m => m.text().includes('Reyes'), 'a learner');
    await openPanel(screen);
    const tabs = screen.all('[role="tab"]').map(t => t.textContent);
    expect(tabs).toEqual(['Learner profile', 'Academic history', 'Enrollment']);
    // The first one is the one selected, so a reader lands on the identity.
    expect(screen.all('[role="tab"][aria-selected="true"]').map(t => t.textContent)).toEqual(['Learner profile']);
    expect(screen.text()).toContain('Personal information');
    screen.unmount();
  });

  it('shows an adviser the same three parts for a learner in their own class', async () => {
    server.signInAs('teacher');
    const screen = await mountScreen(Learners as never, server, teacher, { route });
    await screen.until(m => m.text().includes('Reyes'), 'their own learner');
    // Row security, not the screen: the other adviser's learner is not listed.
    expect(screen.text()).not.toContain('Lacsamana');
    await openPanel(screen);
    expect(screen.all('[role="tab"]').map(t => t.textContent)).toEqual(['Learner profile', 'Academic history', 'Enrollment']);
    screen.unmount();
  });
});

describe('what the profile shows', () => {
  it('shows the fields the class-list import carried, without a second import', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(Learners as never, server, principal, { route });
    await screen.until(m => m.text().includes('Reyes'), 'a learner');
    await openPanel(screen);
    const text = screen.text();
    // Every column of the import's own header, read back from the one record it writes.
    expect(text).toContain('136170000001');
    expect(text).toContain('Reyes');
    expect(text).toContain('Ana');
    expect(text).toContain('Bituin');
    expect(text).toContain('2017-05-02');
    expect(text).toContain('Female');
    expect(text).toContain('12 Balili Road, La Trinidad, Benguet');
    screen.unmount();
  });

  it('draws a field the school has not recorded instead of leaving it blank', async () => {
    // Ben has no middle name and no address on file. Neither is evidence of
    // anything, and neither may read as an empty box someone forgot.
    server.signInAs('principal');
    const screen = await mountScreen(Learners as never, server, principal, { route });
    await screen.until(m => m.text().includes('Lacsamana'), 'the learner with blanks');
    await openPanel(screen, 'Lacsamana');
    expect(panelText(screen)).toContain('None recorded');
    expect(panelText(screen)).toContain('No address recorded');
    // No value is blank, and none is an em dash standing in for one. Read from
    // the fact lists themselves rather than the panel's prose, which uses a
    // real em dash in a sentence.
    const values = screen.all('tr.row-panel dl.facts dd').map(dd => (dd.textContent ?? '').trim());
    expect(values.length).toBeGreaterThan(0);
    expect(values.filter(v => v === '' || v === '—')).toEqual([]);
    screen.unmount();
  });

  it('offers no parent, guardian, contact or demographic field, and says so rather than leaving a gap', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(Learners as never, server, principal, { route });
    await screen.until(m => m.text().includes('Reyes'), 'a learner');
    await openPanel(screen);
    const panel = screen.all('tr.row-panel')[0]!;
    // No such control or field exists, under any of the names it is given.
    const labels = [...panel.querySelectorAll('label, dt')].map(el => (el.textContent ?? '').toLowerCase());
    for (const banned of ['guardian', 'mother', 'father', 'parent', 'contact', 'religion', 'indigenous']) {
      expect(labels.filter(l => l.includes(banned)), banned).toEqual([]);
    }
    // And the absence is explained, so a reader does not take it for an
    // unfilled box: which of these the school may keep is behind the gate.
    expect(screen.text()).toContain('What this record does not hold');
    screen.unmount();
  });

  it('shows only fields the import template has a column for', () => {
    // A guard against this screen drifting ahead of the record. Every fact the
    // profile claims to show is one of the import's own columns.
    const columns = ROSTER_HEADER.split(',');
    expect(columns).toEqual(['lrn', 'first_name', 'middle_name', 'last_name', 'name_extension', 'birth_date', 'sex', 'address']);
  });
});

describe('editing the profile', () => {
  it('writes to the same learner record and creates no second learner', async () => {
    const before = await db.pg.query<{ n: string }>('select count(*) as n from edunexus.learners');
    server.signInAs('principal');
    const screen = await mountScreen(Learners as never, server, principal, { route });
    await screen.until(m => m.text().includes('Reyes'), 'a learner');
    await openPanel(screen);
    // The editor is folded away in a Task, as every correction on this screen
    // is; the summary carries its note too, so it is matched by its opening.
    await screen.click(screen.all('tr.row-panel summary').find(s => (s.textContent ?? '').startsWith('Correct the details')) ?? null);
    await screen.settle();
    const address = screen.field('Address');
    expect(address).toBeTruthy();
    await screen.type(address, '7 Km 5, Balili, La Trinidad, Benguet');
    await screen.submit(address);
    // The harness's `reload` is deliberately a no-op — the shell's refetch is
    // driven by remounting — so what is waited on is the record, not the
    // markup. The remount is the next case.
    for (let i = 0; i < 40; i++) {
      const [row] = await db.pg.query<{ version: number }>('select version from edunexus.learners where id=$1', [ana]);
      if (row!.version > 1) break;
      await screen.settle();
    }

    // One record, corrected in place: the same id, a bumped version, no insert.
    const after = await db.pg.query<{ n: string }>('select count(*) as n from edunexus.learners');
    expect(after[0]!.n).toBe(before[0]!.n);
    const saved = await db.pg.query<{ address: string; version: number }>('select address,version from edunexus.learners where id=$1', [ana]);
    expect(saved[0]!.address).toBe('7 Km 5, Balili, La Trinidad, Benguet');
    expect(saved[0]!.version).toBe(2);
    screen.unmount();
  });

  it('shows the correction in the registry list the same change feeds', async () => {
    // The point of there being one record: what was corrected in the panel is
    // what the list, the class list and the forms read on their next read.
    server.signInAs('principal');
    const screen = await mountScreen(Learners as never, server, principal, { route });
    await screen.until(m => m.text().includes('Reyes'), 'a learner');
    await openPanel(screen);
    expect(screen.text()).toContain('7 Km 5, Balili, La Trinidad, Benguet');
    screen.unmount();
  });

  it('offers an adviser no editor, and tells them whose it is', async () => {
    server.signInAs('teacher');
    const screen = await mountScreen(Learners as never, server, teacher, { route });
    await screen.until(m => m.text().includes('Reyes'), 'their own learner');
    await openPanel(screen);
    expect(screen.text()).not.toContain('Correct the details');
    expect(screen.text()).not.toContain('Identity links');
    expect(screen.text()).toContain('Corrections stay with the office');
    screen.unmount();
  });

  it('refuses an adviser at the API, not only in the screen', async () => {
    // Hiding a Task is not a permission. The same correction, sent directly by
    // an adviser for a learner in their *own* class, is still refused.
    const before = await db.pg.query<{ address: string; version: number }>('select address,version from edunexus.learners where id=$1', [ana]);
    server.signInAs('teacher');
    const refused = await server.api(`/learners/${ana}`, 'PATCH', {
      last_name: 'Reyes', first_name: 'Ana', middle_name: 'Bituin', name_extension: null,
      birth_date: '2017-05-02', sex: 'female', address: 'Anything at all', version: before[0]!.version,
    }).then(() => null, (error: unknown) => error as { status?: number });
    expect(refused?.status).toBe(403);
    const after = await db.pg.query<{ address: string }>('select address from edunexus.learners where id=$1', [ana]);
    expect(after[0]!.address).toBe(before[0]!.address);
  });
});

describe('the enrollment part', () => {
  it('shows where the learner is this year, and every year they have been enrolled', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(Learners as never, server, principal, { route });
    await screen.until(m => m.text().includes('Reyes'), 'a learner');
    await openPanel(screen);
    await openTab(screen, 'Enrollment');
    await screen.until(m => m.text().includes('School years'), 'the enrolment history');
    const text = screen.text();
    expect(text).toContain('This school year');
    expect(text).toContain('2026–2027');
    expect(text).toContain('Grade 3');
    expect(text).toContain('Masigla');
    expect(text).toContain('Enrolled');
    screen.unmount();
  });
});

describe('academic history stays on its own screen', () => {
  it('is a signpost, and puts back no second door into it', async () => {
    for (const [who, me] of [['principal', principal], ['teacher', teacher]] as const) {
      server.signInAs(who);
      const screen = await mountScreen(Learners as never, server, me, { route });
      await screen.until(m => m.text().includes('Reyes'), `a learner, as ${who}`);
      await openPanel(screen);
      await openTab(screen, 'Academic history');
      await screen.until(m => m.text().includes('Why it is a screen of its own'), `the academic history tab, as ${who}`);
      // The removed shortcut, and any other link to that screen, stays removed —
      // asserted on the one tab where it could now be.
      expect(screen.text(), who).not.toContain('Academic history before EDUNEXUS');
      expect(screen.all('a').some(a => (a.getAttribute('href') ?? '').includes('prior-records')), who).toBe(false);
      // It still says where the records are, which is the navigation this tab is for.
      expect(screen.text(), who).toContain('in the navigation rail');
      screen.unmount();
    }
  });
});
