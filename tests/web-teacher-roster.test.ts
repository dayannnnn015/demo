// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ids, testDatabase, type TestDatabase } from './helpers/database.js';
import { mountScreen, serverApi, type ServerApi } from './helpers/dom.js';
import { Learners } from '../web/screens/Learners';
import { PriorRecords } from '../web/screens/PriorRecords';
import { routes } from '../web/routes';

/**
 * The two new screens' data paths, in a real DOM against the real API.
 *
 * Both are about a permission, so a test that mocked the server would prove
 * nothing: what has to hold is that **the row policy and the role gate decide
 * what appears**, not the screen's guess at the role. So an adviser really
 * signs in, really reads their own sections, really takes a learner in through
 * `place_enrollment`, and the refusals really come back with the server's own
 * codes.
 */

let db: TestDatabase;
let server: ServerApi;
const year2026 = '00000000-0000-4000-9000-000000000001';
const masigla = '00000000-0000-4000-9000-00000000000a';
const narra = '00000000-0000-4000-9000-00000000000b';
let unplaced = '';

const teacher = { user_id: ids.teacher, role: 'teacher', display_name: 'Teacher' };
const principal = { user_id: ids.principal, role: 'principal', display_name: 'Principal' };
const route = routes.find(r => r.id === 'learners')!;
const historyRoute = routes.find(r => r.id === 'prior-records')!;

beforeAll(async () => {
  db = await testDatabase();
  server = await serverApi(db);
  await db.pg.query(`select set_config('edunexus.actor_id',$1,false)`, [ids.principal]);
  await db.pg.query(`select set_config('edunexus.request_id',$1,false)`, ['00000000-0000-4000-7000-000000000001']);
  await db.pg.query(`insert into edunexus.academic_years(id,start_year,starts_on,ends_on,status) values($1,2026,'2026-06-01','2027-03-31','draft')`, [year2026]);
  await db.pg.query(`insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values
    ($1,$3,3,'Masigla',$4),($2,$3,3,'Narra',$5)`, [masigla, narra, year2026, ids.teacher, ids.otherTeacher]);
  await db.pg.query(`insert into edunexus.learners(id,lrn,first_name,last_name,sex,birth_date) values
    ('00000000-0000-4000-9001-000000000001','136170000001','Ana','Reyes','female','2017-05-02'),
    ('00000000-0000-4000-9001-000000000002','136170000002','Ben','Lacsamana','male','2017-03-11')`);
  unplaced = '00000000-0000-4000-9001-000000000001';
  // Ana is registered at Grade 3 with no class; Ben is already in Narra.
  await db.pg.query(`select * from edunexus.place_enrollment($1::uuid,$2::uuid,3::smallint,null,'2026-06-01','regular')`, [unplaced, year2026]);
  await db.pg.query(`select * from edunexus.place_enrollment('00000000-0000-4000-9001-000000000002'::uuid,$1::uuid,3::smallint,$2::uuid,'2026-06-01','regular')`,
    [year2026, narra]);
});
afterAll(async () => { await server.close(); await db.database.close(); });

describe('an adviser takes a learner into their class', () => {
  it('offers the action, lists only their own class, and the learner waiting for it', async () => {
    server.signInAs('teacher');
    const screen = await mountScreen(Learners as never, server, teacher, { route });
    await screen.until(m => m.text().includes('Take learners into my class'), 'the adviser action');
    await screen.click(screen.byText('Take learners into my class', 'button'));
    // The class picker holds the sections row security gave them, and no more.
    await screen.until(m => m.text().includes('Masigla'), 'their own class');
    expect(screen.text()).not.toContain('Narra');
    // Ana is waiting; Ben is in somebody's class and so is not offered.
    await screen.until(m => m.text().includes('Reyes'), 'the waiting learner');
    expect(screen.text()).toContain('Give them this class');
    expect(screen.text()).not.toContain('Lacsamana');
    screen.unmount();
  });

  it('takes the learner in, and the class is theirs afterwards', async () => {
    server.signInAs('teacher');
    const screen = await mountScreen(Learners as never, server, teacher, { route });
    await screen.until(m => m.text().includes('Take learners into my class'), 'the adviser action');
    await screen.click(screen.byText('Take learners into my class', 'button'));
    await screen.until(m => m.text().includes('Reyes'), 'the waiting learner');
    // Tick the row, then send it: the batch is one request per learner.
    const tick = screen.all('input.batch-check')[0]!;
    await screen.click(tick);
    await screen.until(m => m.all('button').some(b => /Take 1 learner into my class/.test(b.textContent ?? '')), 'the send button');
    await screen.submit(screen.all('button').find(b => /Take 1 learner into my class/.test(b.textContent ?? ''))!);
    await screen.until(m => m.text().includes('In my class'), 'the learner taken in');

    // The record, not the screen: one enrolment, now in Masigla.
    const rows = await db.pg.query<{ section_id: string | null }>(
      `select section_id from edunexus.enrollments where learner_id=$1 and record_state='valid'`, [unplaced]);
    expect(rows.length).toBe(1);
    expect(rows[0]!.section_id).toBe(masigla);
    screen.unmount();
  });

  it('shows a manager the register’s own action instead, never the adviser one', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(Learners as never, server, principal, { route });
    await screen.until(m => m.text().includes('Register a learner'), 'the manager action');
    expect(screen.text()).not.toContain('Take learners into my class');
    screen.unmount();
  });
});

describe('school-wide encoding oversight', () => {
  it('shows a manager every class, its adviser and the work left, naming no learner', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(PriorRecords as never, server, principal, { route: historyRoute });
    await screen.until(m => m.text().includes('Across the school'), 'the oversight card');
    await screen.until(m => m.text().includes('Masigla'), 'the classes');
    const text = screen.text();
    expect(text).toContain('Narra');
    expect(text).toContain('Teacher');
    expect(text).toContain('Not started');
    // Counts only: no learner's name appears anywhere on it.
    expect(text).not.toContain('Reyes');
    expect(text).not.toContain('Lacsamana');
    screen.unmount();
  });

  it('is not shown to an adviser at all', async () => {
    server.signInAs('teacher');
    const screen = await mountScreen(PriorRecords as never, server, teacher, { route: historyRoute });
    await screen.until(m => m.text().includes('You encode your own learners'), 'the adviser notice');
    expect(screen.text()).not.toContain('Across the school');
    screen.unmount();
  });

  it('writes no privacy access row when a manager opens it', async () => {
    const before = await db.pg.query<{ n: string }>('select count(*) n from edunexus.record_access_events');
    server.signInAs('principal');
    const screen = await mountScreen(PriorRecords as never, server, principal, { route: historyRoute });
    await screen.until(m => m.text().includes('Masigla'), 'the classes');
    const after = await db.pg.query<{ n: string }>('select count(*) n from edunexus.record_access_events');
    // The whole reason this view is counts rather than a list.
    expect(Number(after[0]!.n)).toBe(Number(before[0]!.n));
    screen.unmount();
  });
});
