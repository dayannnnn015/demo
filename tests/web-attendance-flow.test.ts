// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byLabel, byText, check, click, fill, showRoute, waitFor } from './helpers/dom';
import { routes } from '../web/routes';

/**
 * The four attendance screens from 0.30.0 and 0.31.0 were only ever rendered
 * to a string, so none of their fetches, reviews or confirmations had run in a
 * test. This walks the workflow the way a school would: configure the dates,
 * mark the class as its adviser, consolidate the month as a manager, then read
 * the evidence — every step through the real screen against the real API.
 *
 * The school year starts on 25 June 2001 so that June is a six-date month:
 * Monday 25 to Friday 29 are classroom days and Saturday 30 is a weekend,
 * which is the smallest month that can honestly be submitted.
 */
describe('the attendance workflow through its screens', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const year = randomUUID(), narra = randomUUID();
  const enrolments: Record<string, string> = {};
  const reason = 'Synthetic school calendar and register for the screen test.';
  const days = ['2001-06-25', '2001-06-26', '2001-06-27', '2001-06-28', '2001-06-29'];
  const post = (url: string, body: object) => request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${ids.principal}`).send(body);
  const sheet = () => document.querySelector('.sheet') as HTMLElement;
  const show = async (id: string, actor = ids.principal) => {
    const view = await showRoute(app, routes.find(r => r.id === id)!, { actor, manager: actor !== ids.teacher });
    unmount = view.unmount;
    return view;
  };
  const marks = async (day: string) => (await db.pg.query<{ last_name: string; am: string | null; pm: string | null }>(
    `select l.last_name,m.am,m.pm from edunexus.attendance_marks m join edunexus.attendance_days d on d.id=m.attendance_day_id
      join edunexus.enrollments e on e.id=m.enrollment_id join edunexus.learners l on l.id=e.learner_id where d.day_on=$1 order by l.last_name`, [day])).rows;
  /** Steps a month-at-a-time screen back until it shows June 2001. */
  const toJune = async (host: HTMLElement) => {
    await waitFor(() => host.querySelector('.month-nav b'), 'the month navigator');
    for (let guard = 0; guard < 24 && host.querySelector('.month-nav b')?.textContent !== 'June 2001'; guard++) {
      await click(host.querySelector('button[aria-label="Previous month"]'));
    }
    expect(host.querySelector('.month-nav b')?.textContent).toBe('June 2001');
  };
  /** Chooses a mark in the register the way an adviser taps a chip. */
  const tap = async (host: HTMLElement, session: 'Morning' | 'Afternoon', last: string, mark: 'present' | 'absent' | '') => {
    const legend = [...host.querySelectorAll('legend')].find(l => l.textContent === `${session}, ${last}, Synthetic`);
    const input = legend?.parentElement?.querySelector(`input[value="${mark}"]`);
    if (!input) throw new Error(`No ${mark} chip for ${session}, ${last}: ${legend?.parentElement?.outerHTML.slice(0, 600)} / legends: ${[...host.querySelectorAll('legend')].map(l => l.textContent).join(' | ')}`);
    await check(input);
  };

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-25','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2001-06-25','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,2,'Synthetic Narra',$3)", [narra, year, ids.teacher]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    for (const last of ['Alvarez', 'Bautista']) {
      const l = await post('/learners', { first_name: 'Synthetic', last_name: last, birth_date: '1994-01-01', sex: 'female' });
      const e = await post('/enrollments', { learner_id: l.body.data.id, section_id: narra, enrolled_on: '2001-06-25' });
      expect(e.status, JSON.stringify(e.body)).toBe(201);
      enrolments[last] = e.body.data.id;
    }
  });
  beforeEach(async () => { await db.pg.query('delete from edunexus.request_buckets'); });
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });
  afterAll(async () => db?.database.close());

  it('configures a week of classroom days and a weekend on the calendar screen', async () => {
    const { host } = await show('calendar');
    await toJune(host);
    await waitFor(() => host.querySelector('input[aria-label="Select 2001-06-25"]'), 'the June register');
    expect(byText(host, /2001-06-25/, 'tr')?.textContent).toContain('Not configured');

    for (const day of days) await check(host.querySelector(`input[aria-label="Select ${day}"]`));
    await click(byText(host, 'Set a schedule'));
    await fill(byLabel(sheet(), 'Label'), 'Synthetic school day');
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Review 5 dates'));
    await click(await waitFor(() => byText(sheet(), 'Confirm this review'), 'the calendar review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');

    await check(await waitFor(() => host.querySelector('input[aria-label="Select 2001-06-30"]'), 'the weekend row'));
    await click(byText(host, 'Set a schedule'));
    await fill(byLabel<HTMLSelectElement>(sheet(), 'What kind of day'), 'weekend');
    await fill(byLabel(sheet(), 'Label'), 'Saturday');
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Review 1 date'));
    await click(await waitFor(() => byText(sheet(), 'Confirm this review'), 'the weekend review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');

    const configured = await db.pg.query<{ day_on: string; am: string; pm: string }>("select day_on,am,pm from edunexus.instructional_days where section_id is null and day_on between '2001-06-25' and '2001-06-30' order by day_on");
    expect(configured.rows.map(r => [r.day_on, r.am, r.pm])).toEqual([...days.map(d => [d, 'classroom', 'classroom']), ['2001-06-30', 'no_class', 'no_class']]);
  });

  it('shows the adviser their own section’s calendar, read only', async () => {
    const other = randomUUID();
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,5,'Synthetic Molave',$3)", [other, year, ids.otherTeacher]);
    try {
      const { host } = await show('calendar', ids.teacher);
      const scope = await waitFor(() => {
        const select = byLabel<HTMLSelectElement>(host, 'Applies to');
        return select?.value === narra && select;
      }, 'the adviser’s own section chosen');
      expect([...scope.options].map(o => o.textContent)).toEqual(['Whole school', 'Grade 2 · Synthetic Narra']);
      await toJune(host);
      await waitFor(() => byText(host, /2001-06-25/, 'tr')?.textContent?.includes('Classroom'), 'the configured Monday');
      expect(byText(host, 'Set a schedule')).toBeUndefined();
      expect(host.querySelector('input[type="checkbox"]')).toBeNull();
      expect(host.textContent).not.toContain('Change history');
      expect(host.textContent).toContain('Read only');
    } finally {
      await db.pg.query('delete from edunexus.sections where id=$1', [other]);
    }
  });

  it('lets the adviser mark a class, clearing nothing that was not touched', async () => {
    const { host } = await show('attendance', ids.teacher);
    await fill(await waitFor(() => byLabel(host, 'Date'), 'the date picker'), '2001-06-25');
    await waitFor(() => [...host.querySelectorAll('legend')].some(l => l.textContent === 'Morning, Alvarez, Synthetic'), 'the register');
    await tap(host, 'Morning', 'Alvarez', 'present');
    await tap(host, 'Afternoon', 'Alvarez', 'present');
    await tap(host, 'Morning', 'Bautista', 'absent');
    await click(byText(host, /^Review 2 marks$/));
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(await waitFor(() => byText(sheet(), /^Review 2/), 'the review button'));
    await click(await waitFor(() => byText(sheet(), 'Confirm this review'), 'the register review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect(await marks('2001-06-25')).toEqual([{ last_name: 'Alvarez', am: 'present', pm: 'present' }, { last_name: 'Bautista', am: 'absent', pm: null }]);

    // Changing one session sends the untouched one back with it, so it survives.
    // A save must also leave the adviser on the date they were marking.
    await waitFor(() => [...host.querySelectorAll('legend')].some(l => l.textContent === 'Morning, Alvarez, Synthetic'), 'the register after saving', 4000)
      .catch(() => { throw new Error(`Register gone after save; date shows ${byLabel<HTMLInputElement>(host, 'Date')?.value}`); });
    expect(byLabel<HTMLInputElement>(host, 'Date')!.value).toBe('2001-06-25');
    await tap(host, 'Morning', 'Alvarez', 'absent');
    await click(byText(host, /^Review 1 marks$/));
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(await waitFor(() => byText(sheet(), /^Review 1/), 'the review button'));
    await click(await waitFor(() => byText(sheet(), 'Confirm this review'), 'the second review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect((await marks('2001-06-25'))[0]).toEqual({ last_name: 'Alvarez', am: 'absent', pm: 'present' });
  });

  it('shows an unconfigured date as unmarkable rather than offering chips', async () => {
    const { host } = await show('attendance', ids.teacher);
    await fill(await waitFor(() => byLabel(host, 'Date'), 'the date picker'), '2001-07-02');
    await waitFor(() => byText(host, /Alvarez, Synthetic/, 'span') && host.textContent?.includes('Not configured'), 'the unconfigured register');
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });

  it('keeps a month with unmarked sessions in draft, then submits it once every session is marked', async () => {
    let view = await show('months');
    await toJune(view.host);
    await waitFor(() => view.host.textContent?.includes('Not ready to submit'), 'the readiness check');
    expect(view.host.textContent).toContain('Some classroom sessions have no mark');
    await unmount!(); unmount = null;

    // The rest of the week, recorded through the API rather than the screen already tested above.
    for (const day of days) {
      const version = (await db.pg.query<{ version: number }>('select version from edunexus.attendance_days where section_id=$1 and day_on=$2', [narra, day])).rows[0]?.version ?? 0;
      // Monday keeps what the adviser recorded; only Bautista's unmarked afternoon is filled in.
      const changes = day === '2001-06-25'
        ? [{ enrollment_id: enrolments.Bautista!, am: 'absent', pm: 'present' }]
        : Object.values(enrolments).map(enrollment_id => ({ enrollment_id, am: 'present', pm: 'present' }));
      const body = { day_on: day, version, changes, reason };
      const p = await post(`/sections/${narra}/attendance/preview`, body);
      expect(p.status, JSON.stringify(p.body)).toBe(201);
      if (p.body.data.review_hash) expect((await post(`/sections/${narra}/attendance/corrections`, { ...body, review_hash: p.body.data.review_hash, reviewed: true })).status).toBe(201);
    }

    view = await show('months');
    await toJune(view.host);
    await waitFor(() => view.host.textContent?.includes('Ready to submit'), 'a ready month');
    await click(byText(view.host, 'Submit this month'));
    await fill(byLabel(sheet(), 'Reason'), 'Every session checked against the paper register.');
    await click(byText(sheet(), 'Review this change'));
    await click(await waitFor(() => byText(sheet(), 'Confirm this review'), 'the submission review'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    const month = await db.pg.query<{ status: string }>("select status from edunexus.attendance_months where section_id=$1 and month_on='2001-06-01'", [narra]);
    expect(month.rows).toEqual([{ status: 'submitted' }]);
  });

  it('reads the week back on the monitor as raw observations, for the adviser', async () => {
    const { host } = await show('monitor', ids.teacher);
    await fill(await waitFor(() => byLabel(host, 'From'), 'the window'), '2001-06-25');
    await fill(byLabel(host, 'To'), '2001-06-30');
    const row = await waitFor(() => byText(host, /^Bautista, Synthetic/, 'span')?.closest('tr'), 'the monitor row');
    const cells = [...row!.querySelectorAll('td')].map(td => td.textContent);
    // Present, absent, unmarked: Monday's morning absence is the only one recorded.
    expect(cells.slice(1, 4)).toEqual(['9', '1', '0']);
    expect(row!.textContent).toContain('Nothing missing');
    expect(host.textContent).toContain('Month submitted');
  });
});
