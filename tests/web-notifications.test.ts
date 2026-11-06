// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ids, testDatabase, type TestDatabase } from './helpers/database.js';
import { mountScreen, serverApi, type ServerApi } from './helpers/dom.js';
import { Notifications } from '../web/screens/Notifications';
import { routes } from '../web/routes';

/**
 * The notification centre's data paths, in a real DOM against the real API.
 *
 * This matters more than a rendering test because every property worth having
 * here belongs to the server, not the screen: **whose** notifications come
 * back is the row policy's answer, and **what a notification may say** is a
 * check constraint's. A mocked server would prove only that the screen agrees
 * with the mock.
 *
 * It also stands in for `tests/web-screens.test.ts`, which `AGENTS.md`
 * describes and which does not exist in this tree -- it was lost with the rest
 * of `tests/` in the 0.86.1 recovery -- so nothing else renders this route at
 * all.
 */

let db: TestDatabase;
let server: ServerApi;
const year2026 = '00000000-0000-4000-9000-000000000001';
const masigla = '00000000-0000-4000-9000-00000000000a';
const route = routes.find(r => r.id === 'notifications')!;
const teacher = { user_id: ids.teacher, role: 'teacher', display_name: 'Teacher' };
const principal = { user_id: ids.principal, role: 'principal', display_name: 'Principal' };

const header = 'lrn,first_name,middle_name,last_name,name_extension,birth_date,sex,address';
const csv = [header, '136170000401,Listed,,Child,,2017-05-02,female,Purok 4'].join('\r\n') + '\r\n';

beforeAll(async () => {
  db = await testDatabase();
  server = await serverApi(db);
  await db.pg.query(`select set_config('edunexus.actor_id',$1,false)`, [ids.principal]);
  await db.pg.query(`select set_config('edunexus.request_id',$1,false)`, ['00000000-0000-4000-7000-000000000001']);
  await db.pg.query(`insert into edunexus.academic_years(id,start_year,starts_on,ends_on,status) values($1,2026,'2026-06-01','2027-03-31','draft')`, [year2026]);
  await db.pg.query(`insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,3,'Masigla',$3)`,
    [masigla, year2026, ids.teacher]);

  // A real submission, so the notification under test was emitted by the writer
  // that made the change rather than inserted by the test.
  server.signInAs('teacher');
  await server.api('/roster-submissions', 'POST', {
    section_id: masigla, enrolled_on: '2026-06-01', entry_kind: 'regular', csv,
    reason: 'Submitting the class list for the office to import.',
  });
});
afterAll(async () => { await server.close(); await db.database.close(); });

describe('the notification centre', () => {
  it('shows a manager the waiting class list, naming the class and no learner', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(Notifications as never, server, principal, { route });
    await screen.until(m => m.text().includes('class list is waiting'), 'the roster notification');

    const text = screen.text();
    expect(text).toContain('Grade 3 — Masigla');
    // The learner in that very class list is not named, and cannot be: the
    // payload's keys are a closed list enforced by a check constraint.
    expect(text).not.toContain('Listed');
    expect(text).not.toContain('Child');
    // A manager may read the submitting teacher's staff row, so they are named.
    expect(text).toContain('Teacher');
  });

  it('shows an adviser nothing of a colleague’s inbox', async () => {
    // The same rows exist; the row policy answers none of them to this reader.
    server.signInAs('teacher');
    const screen = await mountScreen(Notifications as never, server, teacher, { route });
    await screen.until(m => m.text().includes('Nothing unread'), 'the empty state');
    expect(screen.text()).not.toContain('class list is waiting');
  });

  it('marks one as read, and then has nothing unread to show', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(Notifications as never, server, principal, { route });
    await screen.until(m => m.text().includes('Mark as read'), 'the row action');

    await screen.click(screen.byText('Mark as read', 'button'));
    await screen.until(m => m.text().includes('Nothing unread'), 'the inbox emptying');

    // Still there under Everything, now marked read rather than gone.
    await screen.click(screen.byText('Everything', 'button'));
    await screen.until(m => m.text().includes('class list is waiting'), 'the read notification');
    expect(screen.text()).toContain('Read');
  });

  it('names the screen it points at rather than linking a principal somewhere they are refused', async () => {
    server.signInAs('principal');
    const screen = await mountScreen(Notifications as never, server, principal, { route });
    // Everything, because the case above has already marked it read.
    await screen.until(m => m.text().includes('Everything'), 'the filter');
    await screen.click(screen.byText('Everything', 'button'));
    await screen.until(m => m.text().includes('class list is waiting'), 'the roster notification');
    // Roster import is hiddenFor principal, and routeFor would answer Overview
    // for it, so the row says where the work is instead of linking there.
    expect(screen.text()).toContain('On Roster import');
    expect(screen.all('a[href="#/imports"]')).toHaveLength(0);
  });

  it('links an adviser to the screen the notification is about', async () => {
    // The adviser's own list was declined, which is a notification addressed to
    // them, and Roster import *is* their screen.
    const [waiting] = await db.pg.query<{ id: string; version: number }>(
      `select id,version from edunexus.roster_submissions where section_id=$1 and status='submitted'`, [masigla]);
    server.signInAs('officer');
    await server.api(`/roster-submissions/${String(waiting!.id)}/decision`, 'POST', {
      version: waiting!.version, decision: 'declined', import_id: null,
      reason: 'Two birth dates look wrong. Please check and resend.',
    });

    server.signInAs('teacher');
    const screen = await mountScreen(Notifications as never, server, teacher, { route });
    await screen.until(m => m.text().includes('needs correcting'), 'the declined notification');
    expect(screen.all('a[href="#/imports"]').length).toBeGreaterThan(0);
    // And the manager who declined it is not named to them: staff_read is
    // own-row-or-manager, so this is the row policy answering, not a gap.
    expect(screen.text()).toContain('Not shown to you');
  });
});
