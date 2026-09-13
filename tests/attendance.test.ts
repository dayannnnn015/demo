import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { attendanceResponses as responses } from '../src/modules/attendance/contracts.js';

describe('Section 3B.1 reviewed classroom attendance', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApp>, n = 0;
  const year = randomUUID(), a = randomUUID(), b = randomUUID(), grade2 = randomUUID(), reason = 'Synthetic attendance checked against class observations.';
  const day = (d = n) => `2025-06-${String(d).padStart(2, '0')}`;
  const route = (section = a) => `/api/v1/sections/${section}/attendance`;
  const post = (url: string, body: object, actor = ids.principal) => request(app).post(url).set('Authorization', `Bearer ${actor}`).send(body);
  const get = (url: string, actor = ids.principal) => request(app).get(url).set('Authorization', `Bearer ${actor}`);
  const read = (section = a, actor = ids.principal, extra = '') => get(route(section) + `?day_on=${day()}${extra}`, actor);
  const make = async (section = a, enrolled = day(1)) => {
    const learner = randomUUID(); await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Synthetic',$2,'2017-01-01','female')", [learner, learner]);
    const rows = await db.asUser(ids.principal, async tx => { await tx.query("select set_config('edunexus.request_id',$1,true)", [randomUUID()]); return tx.query("select * from edunexus.enroll_learner($1,$2,$3,'regular')", [learner, section, enrolled]); });
    return { id: String(rows[0]!.id), learner };
  };
  const marks = (id: string, am: string | null = 'present', pm: string | null = null) => ({ enrollment_id: id, am, pm });
  const preview = (changes: object[], extra: object = {}, actor = ids.principal, section = a) => post(route(section) + '/preview', { day_on: day(), version: 0, changes, reason, ...extra }, actor);
  const commit = (p: any, extra: object = {}, actor = ids.principal) => post(route(p.section.id) + '/corrections', { day_on: p.day_on, version: p.version, changes: p.changes.map((v: any) => ({ enrollment_id: v.enrollment_id, ...v.after })), reason: p.reason, review_hash: p.review_hash, reviewed: true, ...extra }, actor);
  const save = async (changes: object[], extra: object = {}, actor = ids.principal, section = a) => {
    const p = await preview(changes, extra, actor, section); expect(p.status, JSON.stringify(p.body)).toBe(201); expect(responses.attendancePreview!.safeParse(p.body.data).success).toBe(true);
    const c = await commit(p.body.data, {}, actor); expect(c.status, JSON.stringify(c.body)).toBe(201); expect(responses.attendanceCommit!.safeParse(c.body.data).success).toBe(true); return c.body.data;
  };
  const calendar = async (changes: object[], section_id: string | null = null) => {
    const version = (await db.pg.query<{ version: number }>('select version from edunexus.instructional_calendars where id=$1', [year])).rows[0]?.version ?? 0;
    const body = { version, section_id, changes, reason }, url = `/api/v1/academic-years/${year}/calendar`;
    const p = await post(url + '/preview', body); expect(p.status, JSON.stringify(p.body)).toBe(201);
    return post(url + '/corrections', { ...body, review_hash: p.body.data.review_hash, reviewed: true });
  };
  const counts = async () => (await db.pg.query(`select (select count(*)::int from edunexus.attendance_days) days,(select count(*)::int from edunexus.attendance_marks) marks,
    (select count(*)::int from edunexus.attendance_review_events) reviews,(select count(*)::int from edunexus.audit_events) audits`)).rows;
  beforeAll(async () => {
    db = await testDatabase(); app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token, aal: 'aal2' }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2025,'2025-06-01','2026-03-31')", [year]);
    for (const [id, grade, actor] of [[a,1,ids.teacher],[b,1,ids.otherTeacher],[grade2,2,ids.otherTeacher]]) await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,$3,$4,$5)', [id, year, grade, id, actor]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2025-06-01','2026-03-31')", [year]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    expect((await calendar(Array.from({ length: 30 }, (_, i) => ({ day_on: day(i+1), action: 'set', am: 'classroom', pm: 'classroom', day_type: 'regular', label: 'Synthetic class' })))).status).toBe(201);
  });
  beforeEach(() => { n++; });
  afterAll(async () => db?.database.close());

  it('reads unknown marks without writes and commits an attributable teacher review', async () => {
    const e = await make(), before = await counts(), r = await read(a, ids.teacher);
    expect(r.status, JSON.stringify(r.body)).toBe(200); expect(responses.attendanceGet!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({ version: 0, recording_available: true, visibility: 'current_access_only' }); expect(r.body.data.items.find((v: any) => v.enrollment_id === e.id)).toMatchObject({ am: null, pm: null });
    const p = await preview([marks(e.id)], {}, ids.teacher); expect(p.status).toBe(201); expect(await counts()).toEqual(before);
    const c = await commit(p.body.data, {}, ids.teacher); expect(c.status, JSON.stringify(c.body)).toBe(201); expect(c.body.data).toMatchObject({ attendance_version: 1, actor_user_id: ids.teacher, request_id: c.body.requestId });
    expect((await read(a, ids.teacher)).body.data.items.find((v: any) => v.enrollment_id === e.id)).toMatchObject({ am: 'present', pm: null });
  });
  it('retains corrections and cleared tombstones with manager-only cursor history', async () => {
    const e = await make(); await save([marks(e.id, 'present', 'absent')]); await save([marks(e.id, null, null)], { version: 1 }, ids.officer);
    const h = await get(route() + `/corrections?day_on=${day()}&limit=1`); expect(responses.attendanceHistory!.safeParse(h.body.data).success).toBe(true);
    expect(h.body.data.pagination.next_before_version).toBe(2); expect(h.body.data.items[0].review_snapshot.changes[0]).toMatchObject({ before: { am: 'present', pm: 'absent' }, after: { am: null, pm: null } });
    expect((await get(route() + `/corrections?day_on=${day()}&before_version=2`)).body.data.items[0].attendance_version).toBe(1);
    expect((await get(route() + `/corrections?day_on=${day()}`, ids.teacher)).status).toBe(403);
    expect((await db.pg.query('select version,am,pm from edunexus.attendance_marks where enrollment_id=$1', [e.id])).rows).toEqual([{ version: 2, am: null, pm: null }]);
  });
  it('uses effective movement dates and preserves current teacher access on historical sheets', async () => {
    const e = await make(); expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 1, action: 'reassigned', effective_on: day(), section_id: b })).status).toBe(201);
    expect((await preview([marks(e.id)])).body.error.code).toBe('ATTENDANCE_ENROLLMENT');
    await save([marks(e.id)], {}, ids.otherTeacher, b);
    const old = await get(route(a) + `?day_on=${day(n-1)}`); expect(old.body.data.items.some((v: any) => v.enrollment_id === e.id)).toBe(true);
    expect((await get(route(a) + `?day_on=${day(n-1)}`, ids.teacher)).body.data.items.some((v: any) => v.enrollment_id === e.id)).toBe(false);
    expect((await read(b, ids.teacher)).status).toBe(404);
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 2, action: 'withdrawn', effective_on: day(n+1), exit_reason: 'transfer_out' })).status).toBe(201);
    expect((await get(route(b) + `?day_on=${day(n+1)}`)).body.data.items.some((v: any) => v.enrollment_id === e.id)).toBe(false);
  });
  it('excludes not-yet-enrolled and voided records and honors corrected dates', async () => {
    const e = await make(a, day(n+1)); expect((await preview([marks(e.id)])).body.error.code).toBe('ATTENDANCE_ENROLLMENT');
    const body = { version: 1, reason, entries: [{ event_type: 'enrolled', effective_on: day(), section_id: a, reason: 'regular' }] };
    const p = await post(`/api/v1/enrollments/${e.id}/timeline/preview`, body);
    expect((await post(`/api/v1/enrollments/${e.id}/timeline/corrections`, { ...body, review_hash: p.body.data.review_hash, reviewed: true })).status).toBe(201);
    expect((await preview([marks(e.id)])).status).toBe(201);
    const v = { version: 2, action: 'void', reason_code: 'incorrect_entry', reason }; const vp = await post(`/api/v1/enrollments/${e.id}/record-review/preview`, v);
    expect((await post(`/api/v1/enrollments/${e.id}/record-review`, { ...v, review_hash: vp.body.data.review_hash, reviewed: true })).status).toBe(201);
    expect((await preview([marks(e.id)])).status).toBe(404); expect((await read()).body.data.items.some((v: any) => v.enrollment_id === e.id)).toBe(false);
  });
  it('rejects unconfigured, no-class and ADM marks without inventing attendance credits', async () => {
    const e = await make(); expect((await calendar([{ day_on: day(), action: 'set', am: 'classroom', pm: 'no_class', day_type: 'regular', label: 'Morning only' }])).status).toBe(201);
    expect((await preview([marks(e.id, null, 'absent')])).body.error.code).toBe('ATTENDANCE_SESSION');
    await save([marks(e.id)]); await save([marks(e.id, null, null)], { version: 1 });
    expect((await calendar([{ day_on: day(), action: 'set', am: 'alternative_delivery', pm: 'suspended', day_type: 'suspension', label: 'Synthetic ADM' }])).status).toBe(201);
    expect((await preview([marks(e.id)], { version: 2 })).body.error.code).toBe('ATTENDANCE_SESSION'); expect((await read()).body.data.recording_available).toBe(false);
    expect((await calendar([{ day_on: day(), action: 'clear' }])).status).toBe(201);
    expect((await preview([marks(e.id)], { version: 2 })).body.error.code).toBe('ATTENDANCE_SESSION'); expect((await read()).body.data.schedule.source).toBe('unconfigured');
  });
  it('binds reviews to actor, reason, marks, learner, section, calendar and enrollment context', async () => {
    const e = await make(); let p = (await preview([marks(e.id)])).body.data;
    expect((await commit(p, {}, ids.teacher)).body.error.code).toBe('ATTENDANCE_REVIEW_CHANGED'); expect((await commit(p, { reason: 'Another synthetic observed record reason.' })).body.error.code).toBe('ATTENDANCE_REVIEW_CHANGED');
    expect((await commit(p, { changes: [marks(e.id, 'absent')] })).body.error.code).toBe('ATTENDANCE_REVIEW_CHANGED'); expect((await commit(p, { reviewed: false })).status).toBe(422);
    for (const sql of ["update edunexus.learners set first_name='Revised' where id=$1", "update edunexus.sections set name=name || ' revised' where id=$1"]) {
      await db.pg.query(sql, [sql.includes('learners') ? e.learner : a]); expect((await commit(p)).body.error.code).toBe('ATTENDANCE_REVIEW_CHANGED'); p = (await preview([marks(e.id)])).body.data;
    }
    expect((await calendar([{ day_on: day(), action: 'set', am: 'classroom', pm: 'classroom', day_type: 'regular', label: 'Updated label' }])).status).toBe(201);
    expect((await commit(p)).body.error.code).toBe('ATTENDANCE_REVIEW_CHANGED'); p = (await preview([marks(e.id)])).body.data;
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 1, action: 'withdrawn', effective_on: day(n+1), exit_reason: 'withdrawal' })).status).toBe(201);
    expect((await commit(p)).body.error.code).toBe('ATTENDANCE_REVIEW_CHANGED');
  });
  it('prevents lost updates across learners sharing a sheet and rejects replay/no-ops', async () => {
    const e = await make(), f = await make(), p = (await preview([marks(e.id)])).body.data, q = (await preview([marks(f.id)])).body.data;
    const results = await Promise.all([commit(p), commit(q)]); expect(results.map(r => r.status).sort()).toEqual([201,409]);
    expect((await commit(p)).body.error.code).toBe('VERSION_CONFLICT');
    const selected = results[0]!.status === 201 ? e : f; expect((await preview([marks(selected.id)], { version: 1 })).body.error.code).toBe('ATTENDANCE_UNCHANGED');
  });
  it('blocks conflicting calendar changes and permits reviewed clearing before a closure', async () => {
    const e = await make(); await save([marks(e.id)]); const before = await counts();
    expect((await calendar([{ day_on: day(), action: 'clear' }])).body.error.code).toBe('ATTENDANCE_DEPENDENCY'); expect(await counts()).toEqual(before);
    expect((await calendar([{ day_on: day(), action: 'set', am: 'no_class', pm: 'classroom', day_type: 'regular', label: 'PM only' }], a)).body.error.code).toBe('ATTENDANCE_DEPENDENCY');
    await save([marks(e.id, null, null)], { version: 1 }); expect((await calendar([{ day_on: day(), action: 'clear' }])).status).toBe(201);
  });
  it('blocks a timeline or grade repair that displaces marks, retaining all original state on rejection', async () => {
    const e = await make(); await save([marks(e.id)]);
    for (const placement of [false, true]) {
      const path = `/api/v1/enrollments/${e.id}/${placement ? 'placement' : 'timeline'}`;
      const body = { version: 1, reason, entries: [{ event_type: 'enrolled', effective_on: day(1), section_id: placement ? grade2 : b, reason: 'regular' }], ...(placement ? { grade_level: 2 } : {}) };
      const p = await post(path + '/preview', body); expect(p.status).toBe(201); const before = await counts();
      expect((await post(path + '/corrections', { ...body, review_hash: p.body.data.review_hash, reviewed: true })).body.error.code).toBe('ATTENDANCE_DEPENDENCY'); expect(await counts()).toEqual(before);
      expect((await db.pg.query('select version,section_id from edunexus.enrollments where id=$1', [e.id])).rows).toEqual([{ version: 1, section_id: a }]);
    }
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 1, action: 'withdrawn', effective_on: day(), exit_reason: 'withdrawal' })).body.error.code).toBe('ATTENDANCE_DEPENDENCY');
  });
  it('requires clearing before void and permits a subsequent reviewed repair and re-recording', async () => {
    const e = await make(); await save([marks(e.id)]);
    const body = { version: 1, action: 'void', reason_code: 'incorrect_entry', reason }, path = `/api/v1/enrollments/${e.id}/record-review`;
    const p = await post(path + '/preview', body); expect((await post(path, { ...body, review_hash: p.body.data.review_hash, reviewed: true })).body.error.code).toBe('ATTENDANCE_DEPENDENCY');
    await save([marks(e.id, null, null)], { version: 1 });
    const timeline = { version: 1, reason, entries: [{ event_type: 'enrolled', effective_on: day(1), section_id: b, reason: 'regular' }] };
    const tp = await post(`/api/v1/enrollments/${e.id}/timeline/preview`, timeline);
    expect((await post(`/api/v1/enrollments/${e.id}/timeline/corrections`, { ...timeline, review_hash: tp.body.data.review_hash, reviewed: true })).status).toBe(201);
    await save([marks(e.id, 'absent')], {}, ids.otherTeacher, b);
    expect((await db.pg.query('select id from edunexus.attendance_marks where enrollment_id=$1 and day_on=$2', [e.id, day()])).rows).toHaveLength(1);
    expect((await get(route(a) + `/corrections?day_on=${day()}`)).body.data.items).toHaveLength(2);
  });
  it('denies unrelated/inactive staff, raw writes, private resolvers and unapproved history access', async () => {
    const e = await make(), p = (await preview([marks(e.id)])).body.data;
    for (const actor of [ids.otherTeacher, ids.inactive, ids.outsider]) {
      expect((await read(a, actor)).status).toBe(actor === ids.otherTeacher ? 404 : 403); expect((await commit(p, {}, actor)).status).toBe(actor === ids.otherTeacher ? 404 : 403);
    }
    expect((await request(app).get(route())).status).toBe(401);
    for (const actor of [null, ids.inactive]) await expect(db.asUser(actor, tx => tx.query('select edunexus.read_daily_attendance($1,$2,50,null)', [a, day()]))).rejects.toMatchObject({ code: '42501' });
    for (const sql of ['update edunexus.attendance_marks set am=null', 'delete from edunexus.attendance_review_events', 'update edunexus.attendance_days set version=2', 'select edunexus.attendance_context($1,current_date)', 'select edunexus.enrollment_state_on($1,current_date)']) await expect(db.asUser(ids.principal, tx => tx.query(sql, sql.includes('$1') ? [a] : []))).rejects.toMatchObject({ code: '42501' });
    await save([marks(e.id)]); expect(await db.asUser(ids.otherTeacher, tx => tx.query('select id from edunexus.attendance_marks where enrollment_id=$1', [e.id]))).toEqual([]);
  });
  it('validates dates, limits, duplicate IDs, strict fields and SQL mark shapes', async () => {
    const e = await make();
    for (const changes of [[], [marks(e.id), marks(e.id)], [marks(e.id, 'late')], [{ ...marks(e.id), extra: true }]]) expect([409,422]).toContain((await preview(changes)).status);
    expect((await preview([marks(e.id)], { day_on: '2025-05-31' })).body.error.code).toBe('ATTENDANCE_DATE');
    expect((await read(a, ids.principal, '&limit=101')).status).toBe(422);
    for (const changes of [null, {}, [{ enrollment_id: e.id, am: true, pm: null }], [{ enrollment_id: 'bad', am: null, pm: null }]]) await expect(db.asUser(ids.principal, tx => tx.query('select edunexus.preview_daily_attendance($1,$2,0,$3::jsonb,$4)', [a, day(), JSON.stringify(changes), reason]))).rejects.toMatchObject({ code: '23514' });
  });
  it('handles 100 learners atomically, paginates by stable IDs and logs all accessed enrollment IDs', async () => {
    const enrollments = []; for (let i = 0; i < 100; i++) enrollments.push(await make());
    await save(enrollments.map(e => marks(e.id, 'present', 'absent')));
    expect((await preview([...enrollments.map(e => marks(e.id)), marks(enrollments[0]!.id)], { version: 1 })).status).toBe(422);
    let cursor: string | null = null; const seen: string[] = [];
    do { const r = await read(a, ids.principal, `&limit=50${cursor ? '&after_id=' + cursor : ''}`); expect(r.status).toBe(200); seen.push(...r.body.data.items.map((v: any) => v.enrollment_id)); cursor = r.body.data.pagination.next_after_id; } while (cursor);
    expect(new Set(seen).size).toBe(seen.length); for (const e of enrollments) expect(seen).toContain(e.id);
    const logs = (await db.pg.query<{ record_ids: string[] }>("select record_ids from edunexus.record_access_events where resource='attendanceCommit' and $1=any(record_ids)", [enrollments[0]!.id])).rows;
    expect(logs[0]!.record_ids).toHaveLength(100);
  });
  it('rolls back earlier marks, sheet version, journal and audits on a later mark failure', async () => {
    const e = await make(), f = await make(), p = (await preview([marks(e.id), marks(f.id)])).body.data, before = await counts();
    const last = [e.id,f.id].sort()[1];
    await db.pg.exec(`create function edunexus.synthetic_attendance_failure() returns trigger language plpgsql as $$ begin if new.enrollment_id='${last}'::uuid then raise exception 'synthetic failure'; end if; return new; end $$;
      create trigger synthetic_failure before insert on edunexus.attendance_marks for each row execute function edunexus.synthetic_attendance_failure();`);
    try { expect((await commit(p)).status).toBe(500); expect(await counts()).toEqual(before); }
    finally { await db.pg.exec('drop trigger synthetic_failure on edunexus.attendance_marks; drop function edunexus.synthetic_attendance_failure();'); }
    expect((await commit(p)).status).toBe(201);
  });
  it('keeps recorded identity history while resolving a reviewed retained learner', async () => {
    const e = await make(); await save([marks(e.id)]); const canonical = randomUUID();
    await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Retained','Synthetic','2017-01-01','female')", [canonical]);
    const body = { canonical_id: canonical, duplicate_id: e.learner, canonical_version: 1, duplicate_version: 1, action: 'link', reason };
    const p = await post('/api/v1/learner-reconciliations/preview', body); expect((await post('/api/v1/learner-reconciliations', { ...body, review_hash: p.body.data.review_hash, reviewed: true })).status).toBe(201);
    expect((await read(a, ids.teacher)).body.data.items.find((v: any) => v.enrollment_id === e.id)).toMatchObject({ learner_id: canonical, recorded_learner_id: e.learner, am: 'present' });
    expect((await get(route() + `/corrections?day_on=${day()}`)).body.data.items[0].review_snapshot.changes[0].learner_id).toBe(e.learner);
  });
  it('resolves withdrawal and reentry boundaries without creating marks during the gap', async () => {
    const e = await make();
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 1, action: 'withdrawn', effective_on: day(n-1), exit_reason: 'withdrawal' })).status).toBe(201);
    expect((await preview([marks(e.id)])).body.error.code).toBe('ATTENDANCE_ENROLLMENT');
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 2, action: 'reentered', effective_on: day(), section_id: a })).status).toBe(201);
    await save([marks(e.id)], {}, ids.teacher);
    expect((await get(route() + `?day_on=${day(n-1)}`)).body.data.items.some((v: any) => v.enrollment_id === e.id)).toBe(false);
  });
  it('denies closed-year changes and teacher reads while preserving manager history', async () => {
    const e = await make(); await save([marks(e.id)]); const p = (await preview([marks(e.id, 'absent')], { version: 1 })).body.data;
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1", [year]);
    expect((await read(a, ids.teacher)).status).toBe(404); expect((await read()).body.data.recording_available).toBe(false); expect((await commit(p)).body.error.code).toBe('ATTENDANCE_YEAR');
    expect((await get(route() + `/corrections?day_on=${day()}`)).status).toBe(200);
    const futureYear = randomUUID(), futureSection = randomUUID();
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2027,'2027-01-01','2027-12-31')", [futureYear]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name) values($1,$2,1,'Synthetic future')", [futureSection, futureYear]);
    expect((await preview([marks(e.id)], { day_on: '2027-01-01' }, ids.principal, futureSection)).body.error.code).toBe('ATTENDANCE_YEAR');
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Future term','2027-01-01','2027-12-31')", [futureYear]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [futureYear]);
    expect((await preview([marks(e.id)], { day_on: '2027-01-01' }, ids.principal, futureSection)).body.error.code).toBe('ATTENDANCE_YEAR');
  });
});
