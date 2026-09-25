// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byText, showRoute, waitFor } from './helpers/dom';
import { routes } from '../web/routes';

/**
 * The Overview is loaded by every staff member on every visit, so it must not
 * read a single learner or enrollment record: each such read writes a row
 * naming the records returned, and a dashboard doing that on each load would
 * bury the privacy audit. Its learner count comes from an endpoint that
 * answers with numbers only. This drives the real screen and counts the
 * audit rows either side of it.
 */
describe('the Overview against the API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const year = randomUUID(), mine = randomUUID(), upper = randomUUID();
  const route = routes.find(r => r.id === 'overview')!;
  const post = (url: string, body: object) => request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${ids.principal}`).send(body);
  const access = async () => (await db.pg.query<{ n: number }>('select count(*)::int n from edunexus.record_access_events')).rows[0]!.n;
  const tile = (host: HTMLElement, label: string) => byText(host, label, 'span.tile-label')?.closest('.tile') as HTMLElement | undefined;

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-01','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2001-06-01','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$3,1,'Synthetic mine',$4),($2,$3,2,'Synthetic upper',null)", [mine, upper, year, ids.teacher]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    for (const [section, last] of [[mine, 'One'], [mine, 'Two'], [upper, 'Three']] as const) {
      const l = await post('/learners', { first_name: 'Synthetic', last_name: last, birth_date: '1994-01-01', sex: 'female' });
      expect((await post('/enrollments', { learner_id: l.body.data.id, section_id: section, enrolled_on: '2001-06-01' })).status).toBe(201);
    }
  });
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });
  afterAll(async () => db?.database.close());

  it('shows the school’s enrolled learners by grade without writing a single access row', async () => {
    const before = await access();
    const view = await showRoute(app, route, { actor: ids.principal, manager: true });
    unmount = view.unmount;
    const enrolled = await waitFor(() => tile(view.host, 'Learners enrolled'), 'the learner tile');
    await waitFor(() => enrolled.querySelector('.tile-value')?.textContent === '3', 'the count');
    expect(view.host.textContent).toContain('Learners by grade');
    expect(await access()).toBe(before);
  });

  it('shows a teacher only their own learners, again without an access row', async () => {
    const before = await access();
    const view = await showRoute(app, route, { actor: ids.teacher, manager: false });
    unmount = view.unmount;
    const yours = await waitFor(() => tile(view.host, 'Your learners'), 'the teacher tile');
    await waitFor(() => yours.querySelector('.tile-value')?.textContent === '2', 'the teacher count');
    expect(await access()).toBe(before);
  });
});
