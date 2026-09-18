import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { calendarResponses } from '../src/modules/calendar/contracts.js';

describe('Section 3A reviewed instructional calendar', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApp>;
  let year: string, section: string, other: string, start = 1999;
  const reason = 'Synthetic schedule checked against school instructions.';
  const day = (n = 1) => `${start}-06-${String(n).padStart(2, '0')}`;
  const set = (n = 1, extra: object = {}) => ({ day_on: day(n), action: 'set', am: 'classroom', pm: 'classroom', day_type: 'regular', label: 'Synthetic classes', ...extra });
  const clear = (n = 1) => ({ day_on: day(n), action: 'clear' });
  const base = () => `/api/v1/academic-years/${year}/calendar`;
  const post = (suffix: string, body: object, actor = ids.principal) => request(app).post(base() + suffix).set('Authorization', `Bearer ${actor}`).send(body);
  const get = (suffix: string, actor = ids.principal) => request(app).get(base() + suffix).set('Authorization', `Bearer ${actor}`);
  const preview = (changes: object[] = [set()], extra: object = {}, actor = ids.principal) => post('/preview', { version: 0, changes, reason, ...extra }, actor);
  const commit = (p: any, extra: object = {}, actor = ids.principal) => post('/corrections', {
    version: p.calendar_version, section_id: p.section_id, reason: p.reason,
    changes: p.changes.map((v: any) => v.action === 'clear' ? { day_on: v.day_on, action: 'clear' } : { day_on: v.day_on, action: 'set', am: v.after.am, pm: v.after.pm, day_type: v.after.day_type, label: v.after.label }),
    review_hash: p.review_hash ?? '0'.repeat(64), reviewed: true, ...extra,
  }, actor);
  const save = async (changes: object[] = [set()], extra: object = {}, actor = ids.principal) => {
    const p = await preview(changes, extra, actor); expect(p.status, JSON.stringify(p.body)).toBe(201);
    expect(calendarResponses.calendarPreview!.safeParse(p.body.data).success).toBe(true);
    const c = await commit(p.body.data, {}, actor); expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(calendarResponses.calendarCommit!.safeParse(c.body.data).success).toBe(true); return c.body.data;
  };
  const read = (scope?: string, actor = ids.principal, n = 3) => get(`?from=${day()}&to=${day(n)}${scope ? `&section_id=${scope}` : ''}`, actor);
  const counts = async () => (await db.pg.query(`select (select count(*)::int from edunexus.instructional_calendars) roots,
    (select count(*)::int from edunexus.instructional_days) days,(select count(*)::int from edunexus.calendar_review_events) reviews,
    (select count(*)::int from edunexus.audit_events) audits`)).rows;
  beforeAll(async () => {
    db = await testDatabase(); app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
  });
  beforeEach(async () => {
    year = randomUUID(); section = randomUUID(); other = randomUUID(); start++;
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)', [year, start, day(), `${start + 1}-03-31`]);
    for (const [id, actor] of [[section, ids.teacher], [other, ids.otherTeacher]]) await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,$3,$4)', [id, year, id, actor]);
  });
  afterAll(async () => db?.database.close());

  it('returns unknown dates without creating a calendar or assuming weekends and absences', async () => {
    const before = await counts(), r = await read(undefined, ids.teacher, 7);
    expect(r.status).toBe(200); expect(calendarResponses.calendarGet!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({ calendar_version: 0, summary: { configured_days: 0, unconfigured_days: 7, classroom_sessions: 0, no_class_sessions: 0 } });
    for (const d of r.body.data.days) expect(d).toMatchObject({ source: 'unconfigured', configured: false, am: null, pm: null });
    expect(await counts()).toEqual(before);
  });
  it('previews without writes and commits ordered dates, session counts and attributable history atomically', async () => {
    const changes = [set(3, { day_type: 'suspension', am: 'alternative_delivery', pm: 'suspended' }), set(1, { pm: 'no_class' }), set(2, { day_type: 'holiday', am: 'no_class', pm: 'no_class' })];
    const before = await counts(), p = await preview(changes, {}, ids.officer);
    expect(p.status, JSON.stringify(p.body)).toBe(201); expect(await counts()).toEqual(before);
    expect(p.body.data.changes.map((v: any) => v.day_on)).toEqual([day(1), day(2), day(3)]);
    const c = await commit(p.body.data, {}, ids.officer); expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.data).toMatchObject({ calendar_version: 1, actor_user_id: ids.officer, request_id: c.body.requestId });
    expect(calendarResponses.calendarCommit!.safeParse(c.body.data).success).toBe(true);
    expect((await read()).body.data.summary).toEqual({ dates_requested: 3, configured_days: 3, unconfigured_days: 0, classroom_sessions: 1, alternative_delivery_sessions: 1, no_class_sessions: 3, suspended_sessions: 1 });
    expect((await db.pg.query('select version from edunexus.academic_years where id=$1', [year])).rows).toEqual([{ version: 1 }]);
  });
  it('inherits school days and limits section reads and raw RLS to the assigned adviser', async () => {
    await save(); await save([set(1, { pm: 'no_class' })], { version: 1, section_id: section });
    expect((await read(section, ids.teacher)).body.data.days[0]).toMatchObject({ source: 'section', pm: 'no_class' });
    expect((await read(other, ids.otherTeacher)).body.data.days[0]).toMatchObject({ source: 'school', pm: 'classroom' });
    expect((await read(section, ids.otherTeacher)).status).toBe(404);
    expect((await read(randomUUID())).status).toBe(404);
    expect(await db.asUser(ids.otherTeacher, tx => tx.query('select section_id from edunexus.instructional_days where academic_year_id=$1', [year]))).toEqual([{ section_id: null }]);
    expect(await db.asUser(ids.teacher, tx => tx.query('select id from edunexus.calendar_review_events'))).toEqual([]);
    await db.pg.query('update edunexus.sections set adviser_user_id=$2 where id=$1', [section, ids.otherTeacher]);
    expect((await read(section, ids.teacher)).status).toBe(404); expect((await read(section, ids.otherTeacher)).status).toBe(200);
  });
  it('blocks section configuration without an explicitly configured school day', async () => {
    const p = await preview([set()], { section_id: section }); expect(p.body.data).toMatchObject({ can_commit: false, review_hash: null, issues: ['BASE_DAY_UNCONFIGURED'], conflicts: [{ day_on: day(), section_ids: [section] }] });
    const before = await counts(); expect((await commit(p.body.data)).body.error.code).toBe('CALENDAR_CONFLICT'); expect(await counts()).toEqual(before);
  });
  it('requires clearing overrides before a school closure, then resolves inheritance to the new baseline', async () => {
    await save(); await save([set(1, { pm: 'no_class' })], { version: 1, section_id: section });
    for (const changes of [[clear()], [set(1, { day_type: 'suspension', am: 'suspended', pm: 'suspended' })]]) {
      const p = await preview(changes, { version: 2 }); expect(p.body.data).toMatchObject({ can_commit: false, issues: ['SECTION_OVERRIDES_PRESENT'], conflicts: [{ section_ids: [section] }] });
      expect((await commit(p.body.data)).body.error.code).toBe('CALENDAR_CONFLICT');
    }
    const c = await save([clear()], { version: 2, section_id: section });
    expect(c.review_snapshot.changes[0]).toMatchObject({ after: { configured: false }, after_effective: { source: 'school', pm: 'classroom' } });
    await save([set(1, { day_type: 'suspension', am: 'suspended', pm: 'suspended' })], { version: 3 });
    expect((await read(section, ids.teacher)).body.data.days[0]).toMatchObject({ source: 'school', am: 'suspended' });
  });
  it('retains cleared rows and review history while returning unconfigured effective dates', async () => {
    await save(); await save([clear()], { version: 1 });
    expect((await read()).body.data).toMatchObject({ calendar_version: 2, days: [{ configured: false, source: 'unconfigured' }, {}, {}] });
    expect((await db.pg.query('select configured,version,am,label from edunexus.instructional_days where academic_year_id=$1', [year])).rows).toEqual([{ configured: false, version: 2, am: null, label: null }]);
    const h = await get('/corrections?limit=1'); expect(calendarResponses.calendarHistory!.safeParse(h.body.data).success).toBe(true);
    expect(h.body.data.pagination.next_before_version).toBe(2);
    expect((await get('/corrections?before_version=2')).body.data.items[0].review_snapshot.changes[0].after.am).toBe('classroom');
  });
  it('binds reviews to actor, reason, proposal and year/section context', async () => {
    let p = (await preview()).body.data;
    expect((await commit(p, {}, ids.officer)).body.error.code).toBe('CALENDAR_REVIEW_CHANGED');
    expect((await commit(p, { reason: 'A different checked schedule instruction.' })).body.error.code).toBe('CALENDAR_REVIEW_CHANGED');
    expect((await commit(p, { changes: [set(1, { pm: 'no_class' })] })).body.error.code).toBe('CALENDAR_REVIEW_CHANGED');
    expect((await commit(p, { reviewed: false })).status).toBe(422);
    await db.pg.query('update edunexus.academic_years set status=status where id=$1', [year]);
    expect((await commit(p)).body.error.code).toBe('CALENDAR_REVIEW_CHANGED');
    await save(); p = (await preview([set(1, { pm: 'no_class' })], { version: 1, section_id: section })).body.data;
    await db.pg.query("update edunexus.sections set name=name || ' revised' where id=$1", [section]);
    expect((await commit(p)).body.error.code).toBe('CALENDAR_REVIEW_CHANGED');
  });
  it('rejects competing first commits, replay and cross-scope stale versions', async () => {
    const p = (await preview()).body.data;
    const results = await Promise.all([commit(p), commit(p)]); expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await commit(p)).body.error.code).toBe('VERSION_CONFLICT');
    const a = (await preview([set(2)], { version: 1 })).body.data;
    await save([set(1, { pm: 'no_class' })], { version: 1, section_id: section });
    expect((await commit(a)).body.error.code).toBe('VERSION_CONFLICT');
  });
  it('skips unchanged dates in mixed batches and rejects full no-ops', async () => {
    await save(); expect((await preview([set()], { version: 1 })).body.error.code).toBe('CALENDAR_UNCHANGED');
    const c = await save([set(), set(2), clear(3)], { version: 1 }); expect(c.review_snapshot.changed_count).toBe(1);
    expect((await db.pg.query('select day_on,version from edunexus.instructional_days where academic_year_id=$1 order by day_on', [year])).rows).toEqual([{ day_on: day(), version: 1 }, { day_on: day(2), version: 1 }]);
  });
  it('rejects out-of-year, reversed and excessive read ranges and duplicate change dates', async () => {
    for (const range of [`from=${day(2)}&to=${day()}`, `from=${start}-05-31&to=${day()}`, `from=${day()}&to=${start}-08-02`]) expect((await get('?' + range)).body.error.code).toBe('CALENDAR_DATES');
    expect((await preview([set(), set()])).body.error.code).toBe('CALENDAR_DATES');
    expect((await preview([set(1, { day_on: `${start}-05-31` })])).body.error.code).toBe('CALENDAR_DATES');
    for (const suffix of ['', '?from=bad&to=bad', `?from=${day()}&to=${day()}&extra=true`, '/corrections?limit=11']) expect((await get(suffix)).status).toBe(422);
    expect((await preview([set(1, { day_on: `${start}-02-30` })])).status).toBe(422);
  });
  it('accepts exactly 62 dates and keeps both the count and UTF-8 body limits enforced', async () => {
    const changes = Array.from({ length: 62 }, (_, n) => set(1, { day_on: new Date(Date.UTC(start, 5, 1 + n)).toISOString().slice(0, 10) }));
    await save(changes); const r = await get(`?from=${day()}&to=${start}-08-01`); expect(r.body.data.days).toHaveLength(62);
    expect((await preview([...changes, set()], { version: 1 })).status).toBe(422);
    const large = { version: 1, changes: changes.map(c => ({ ...c, am: 'alternative_delivery', pm: 'alternative_delivery', label: '學'.repeat(120) })), reason: '學'.repeat(500) };
    const encoded = JSON.stringify(large, null, 2);
    expect(Buffer.byteLength(encoded)).toBeGreaterThan(32768);
    expect((await request(app).post(base() + '/preview').set('Authorization', `Bearer ${ids.principal}`).type('json').send(encoded)).status).toBe(413);
  });
  it('validates day classifications in SQL as well as API field shapes', async () => {
    for (const extra of [{ day_type: 'holiday' }, { day_type: 'regular', am: 'suspended' }, { am: 'no_class', pm: 'no_class' }, { day_type: 'suspension' }]) expect((await preview([set(1, extra)])).body.error.code).toBe('RULE_VIOLATION');
    for (const change of [{ ...set(), extra: true }, { ...set(), am: null }, { ...set(), label: 'bad\nlabel' }, { ...clear(), label: 'extra' }]) expect((await preview([change])).status).toBe(422);
    for (const changes of [null, {}, [], [set(1, { day_on: `${start}-06-31` })], [set(1, { am: null })], [{ ...clear(), extra: 1 }]]) await expect(db.asUser(ids.principal, tx => tx.query('select edunexus.preview_instructional_calendar($1,null,0,$2::jsonb,$3)', [year, JSON.stringify(changes), reason]))).rejects.toMatchObject({ code: '23514' });
  });
  it('denies teacher writes, inactive staff, anonymous calls and direct table/private-helper mutation', async () => {
    const p = (await preview()).body.data;
    for (const actor of [ids.teacher, ids.inactive, ids.outsider]) {
      expect((await preview([set()], {}, actor)).status).toBe(403); expect((await commit(p, {}, actor)).status).toBe(403); expect((await get('/corrections', actor)).status).toBe(403);
    }
    expect((await request(app).get(base() + `?from=${day()}&to=${day()}`)).status).toBe(401);
    for (const actor of [null, ids.inactive]) await expect(db.asUser(actor, tx => tx.query('select edunexus.read_instructional_calendar($1,null,$2,$2)', [year, day()]))).rejects.toMatchObject({ code: '42501' });
    for (const actor of [null, ids.inactive, ids.teacher]) await expect(db.asUser(actor, tx => tx.query('select edunexus.commit_instructional_calendar($1,null,0,$2::jsonb,$3,$4)', [year, JSON.stringify([set()]), reason, p.review_hash]))).rejects.toMatchObject({ code: '42501' });
    for (const sql of ['update edunexus.instructional_days set configured=false', 'delete from edunexus.calendar_review_events', 'update edunexus.instructional_calendars set version=2', 'insert into edunexus.instructional_calendars(id) values($1)', 'select edunexus.calendar_scope_day($1,null,current_date)', 'select edunexus.effective_calendar_day($1,null,current_date)']) await expect(db.asUser(ids.principal, tx => tx.query(sql, sql.includes('$1') ? [year] : []))).rejects.toMatchObject({ code: '42501' });
    expect(await db.asUser(null, tx => tx.query('select id from edunexus.instructional_days'))).toEqual([]);
  });
  it('rolls back the calendar root, earlier dates, journal and audit on a later-row failure', async () => {
    const p = (await preview([set(), set(2)])).body.data, before = await counts();
    await db.pg.exec(`create function edunexus.synthetic_calendar_failure() returns trigger language plpgsql as $$ begin if new.day_on='${day(2)}'::date then raise exception 'synthetic failure'; end if; return new; end $$;
      create trigger synthetic_failure before insert on edunexus.instructional_days for each row execute function edunexus.synthetic_calendar_failure();`);
    try { expect((await commit(p)).status).toBe(500); expect(await counts()).toEqual(before); }
    finally { await db.pg.exec('drop trigger synthetic_failure on edunexus.instructional_days; drop function edunexus.synthetic_calendar_failure();'); }
    expect((await commit(p)).status).toBe(201);
  });
  it('provides all-scope cursor history and logs calendar reads by year without copying labels', async () => {
    await save(); await save([set(1, { pm: 'no_class' })], { version: 1, section_id: section }); await read(section, ids.teacher);
    const h = await get('/corrections'); expect(h.body.data.items.map((v: any) => v.section_id)).toEqual([section, null]);
    const logs = (await db.pg.query<{ resource: string; record_ids: string[] }>("select resource,record_ids from edunexus.record_access_events where resource like 'calendar%' and $1=any(record_ids)", [year])).rows;
    expect(logs.length).toBeGreaterThan(4); for (const log of logs) expect(log.record_ids).toEqual([year]);
  });
  it('keeps closed calendars readable but rejects preview and commit after closure', async () => {
    await save(); const p = (await preview([set(2)], { version: 1 })).body.data;
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term',$2,$3)", [year, day(), `${start + 1}-03-31`]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1", [year]);
    expect((await read(section, ids.teacher)).status).toBe(200);
    expect((await preview([set(2)], { version: 1 })).body.error.code).toBe('YEAR_CLOSED'); expect((await commit(p)).body.error.code).toBe('YEAR_CLOSED');
    expect(calendarResponses.calendarHistory!.safeParse((await get('/corrections')).body.data).success).toBe(true);
  });
});
