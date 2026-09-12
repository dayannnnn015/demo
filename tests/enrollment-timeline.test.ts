import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { timelineResponses } from '../src/modules/enrollment-timeline/contracts.js';

describe('Section 2B.2 effective enrollment timelines and immutable corrections', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApp>;
  const year = randomUUID(), otherYear = randomUUID();
  const sectionA = randomUUID(), sectionB = randomUUID(), sectionC = randomUUID(), wrongGrade = randomUUID(), wrongYear = randomUUID();
  const reason = 'Synthetic school record checked and corrected.';
  const header = (actor = ids.principal) => ({ Authorization: `Bearer ${actor}` });
  const initial = (date = '2025-06-01', section_id = sectionA) => ({ event_type: 'enrolled', effective_on: date, section_id, reason: 'regular' });
  const movement = (event_type: string, date: string, section_id: string, reason: string) => ({ event_type, effective_on: date, section_id, reason });
  const endpoint = (id: string) => `/api/v1/enrollments/${id}/timeline`;
  const get = (id: string, actor = ids.principal) => request(app).get(endpoint(id)).set(header(actor));
  const preview = (id: string, entries: object[], version = 1, actor = ids.principal) => request(app).post(endpoint(id) + '/preview').set(header(actor)).send({ entries, version, reason });
  const commit = (id: string, p: any, actor = ids.principal, overrides: object = {}) => request(app).post(endpoint(id) + '/corrections').set(header(actor)).send({ entries: p.after_entries, version: p.version, reason: p.reason, review_hash: p.review_hash, reviewed: true, ...overrides });
  const make = async () => {
    const learner = await request(app).post('/api/v1/learners').set(header()).send({ first_name: 'Synthetic', last_name: randomUUID(), birth_date: '2018-01-01', sex: 'female' });
    expect(learner.status).toBe(201);
    const enrolled = await request(app).post('/api/v1/enrollments').set(header()).send({ learner_id: learner.body.data.id, section_id: sectionA, enrolled_on: '2025-06-01' });
    expect(enrolled.status).toBe(201); return { id: enrolled.body.data.id as string, learner: learner.body.data.id as string };
  };
  const counts = async () => (await db.pg.query(`select (select count(*)::int from edunexus.enrollment_corrections) as corrections,
    (select count(*)::int from edunexus.enrollment_correction_sections) as refs,
    (select count(*)::int from edunexus.enrollment_events) as events,
    (select count(*)::int from edunexus.audit_events) as audit`)).rows;
  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token, aal: 'aal2' }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2025,'2025-06-01','2026-03-31'),($2,2024,'2024-06-01','2025-03-31')", [year, otherYear]);
    for (const [id, y, grade, teacher] of [[sectionA, year, 1, ids.teacher], [sectionB, year, 1, ids.otherTeacher], [sectionC, year, 1, ids.otherTeacher], [wrongGrade, year, 2, ids.teacher], [wrongYear, otherYear, 1, ids.teacher]]) {
      await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,$3,$4,$5)', [id, y, grade, `Synthetic ${id}`, teacher]);
    }
  });
  afterAll(async () => db?.database.close());

  it('returns the effective baseline and previews a correction without changing enrollment/history', async () => {
    const e = await make(), current = await get(e.id);
    expect(current.status).toBe(200); expect(current.body.data.entries).toEqual([initial()]); expect(current.body.data.latest_correction_id).toBeNull();
    expect(timelineResponses.timelineGet!.safeParse(current.body.data).success).toBe(true);
    const before = await counts(), p = await preview(e.id, [initial('2025-06-02', sectionB)]);
    expect(p.status, JSON.stringify(p.body)).toBe(201); expect(timelineResponses.timelinePreview!.safeParse(p.body.data).success).toBe(true);
    expect(p.body.data.first_affected_on).toBe('2025-06-01'); expect(p.body.data.previous_state.section_id).toBe(sectionA); expect(p.body.data.proposed_state.section_id).toBe(sectionB);
    expect(p.body.data.sections).toHaveLength(2); expect(await counts()).toEqual(before); expect((await get(e.id)).body.data).toEqual(current.body.data);
  });
  it('corrects initial dates and assignment atomically, updates teacher access, and leaves original movements intact', async () => {
    const e = await make(), original = (await db.pg.query('select * from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows;
    const p = await preview(e.id, [initial('2025-06-03', sectionB)], 1, ids.officer), r = await commit(e.id, p.body.data, ids.officer);
    expect(r.status, JSON.stringify(r.body)).toBe(201); expect(timelineResponses.timelineCorrect!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({ before_entries: [initial()], after_entries: [initial('2025-06-03', sectionB)], actor_user_id: ids.officer, request_id: r.body.requestId, enrollment_version: 2 });
    const state = (await request(app).get(`/api/v1/enrollments/${e.id}`).set(header())).body.data;
    expect(state).toMatchObject({ version: 2, enrolled_on: '2025-06-03', effective_on: '2025-06-03', section_id: sectionB });
    expect((await request(app).get(`/api/v1/learners/${e.learner}`).set(header(ids.teacher))).status).toBe(404);
    expect((await request(app).get(`/api/v1/learners/${e.learner}`).set(header(ids.otherTeacher))).status).toBe(200);
    expect((await db.pg.query('select * from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows).toEqual(original);
    const raw = await request(app).get(`/api/v1/enrollments/${e.id}/history`).set(header());
    expect(raw.body.data).toMatchObject({ interpretation: 'original_movements', timeline_version: 2, has_corrections: true }); expect(raw.body.data.items).toHaveLength(1);
    expect((await get(e.id)).body.data.latest_correction_id).toBe(r.body.data.id);
  });
  it('can insert missing historical movements and remove mistakes while retaining every correction snapshot', async () => {
    const e = await make();
    await request(app).post(`/api/v1/enrollments/${e.id}/movements`).set(header()).send({ version: 1, action: 'reassigned', effective_on: '2025-09-01', section_id: sectionB });
    const entries = [initial(), movement('withdrawn', '2025-07-01', sectionA, 'transfer_out'), movement('reentered', '2025-08-01', sectionA, 'return_to_school'), movement('reassigned', '2025-09-01', sectionB, 'section_change')];
    const p = await preview(e.id, entries, 2), r = await commit(e.id, p.body.data);
    expect(r.status).toBe(201); expect((await get(e.id)).body.data.entries).toEqual(entries);
    const removed = [initial(), entries[3]!], p2 = await preview(e.id, removed, 3), r2 = await commit(e.id, p2.body.data);
    expect(r2.status).toBe(201); expect(r2.body.data.before_entries).toEqual(entries); expect((await get(e.id)).body.data.entries).toEqual(removed);
    const history = await request(app).get(endpoint(e.id) + '/corrections?limit=1').set(header());
    expect(history.body.data.items[0].id).toBe(r2.body.data.id); expect(history.body.data.pagination.next_before_version).toBe(4);
    const older = await request(app).get(endpoint(e.id) + '/corrections?before_version=4').set(header());
    expect(older.body.data.items[0].id).toBe(r.body.data.id); expect(timelineResponses.timelineCorrectionHistory!.safeParse(older.body.data).success).toBe(true);
    expect((await db.pg.query('select id from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows).toHaveLength(2);
  });
  it('appends ordinary movements after corrections and bases subsequent review on the effective timeline', async () => {
    const e = await make(), p = await preview(e.id, [initial('2025-06-04', sectionB)]);
    expect((await commit(e.id, p.body.data)).status).toBe(201);
    const moved = await request(app).post(`/api/v1/enrollments/${e.id}/movements`).set(header()).send({ version: 2, action: 'withdrawn', effective_on: '2025-08-01', exit_reason: 'withdrawal' });
    expect(moved.status).toBe(201);
    const expected = [initial('2025-06-04', sectionB), movement('withdrawn', '2025-08-01', sectionB, 'withdrawal')];
    expect((await get(e.id)).body.data).toMatchObject({ version: 3, entries: expected });
    const p2 = await preview(e.id, [expected[0]!, { ...expected[1]!, effective_on: '2025-08-02' }], 3);
    expect(p2.body.data.before_entries).toEqual(expected); expect((await commit(e.id, p2.body.data)).status).toBe(201);
    const raw = (await db.pg.query<{ enrollment_version: number }>('select enrollment_version from edunexus.enrollment_events where enrollment_id=$1 order by enrollment_version', [e.id])).rows;
    expect(raw.map(row => row.enrollment_version)).toEqual([1, 3]);
    const reentry = await request(app).post(`/api/v1/enrollments/${e.id}/movements`).set(header()).send({ version: 4, action: 'reentered', effective_on: '2025-09-01', section_id: sectionA });
    expect(reentry.status).toBe(201); expect((await get(e.id)).body.data.entries).toHaveLength(3);
  });
  it('rejects invalid temporal order, dates, state transitions, reasons, sections and empty/unchanged timelines', async () => {
    const e = await make(), before = await counts();
    const bad: [object[], string][] = [
      [[initial()], 'TIMELINE_UNCHANGED'], [[initial('2025-05-31')], 'TIMELINE_DATES'],
      [[initial(), movement('reassigned', '2025-06-01', sectionB, 'section_change')], 'TIMELINE_DATES'],
      [[initial(), movement('reassigned', '2199-01-01', sectionB, 'section_change')], 'TIMELINE_DATES'],
      [[initial('2025-06-02', wrongGrade)], 'TIMELINE_SECTION'], [[initial('2025-06-02', wrongYear)], 'TIMELINE_SECTION'],
      [[initial('2025-06-02', randomUUID())], 'TIMELINE_SECTION'],
      [[movement('withdrawn', '2025-06-02', sectionA, 'withdrawal')], 'TIMELINE_TRANSITION'],
      [[initial(), movement('reassigned', '2025-07-01', sectionA, 'section_change')], 'TIMELINE_TRANSITION'],
      [[initial(), movement('withdrawn', '2025-07-01', sectionB, 'withdrawal')], 'TIMELINE_TRANSITION'],
      [[initial(), movement('reentered', '2025-07-01', sectionB, 'return_to_school')], 'TIMELINE_TRANSITION'],
      [[initial(), movement('reassigned', '2025-07-01', sectionB, 'transfer_out')], 'TIMELINE_TRANSITION'],
      [[initial(), movement('withdrawn', '2025-07-01', sectionA, 'death'), movement('reentered', '2025-08-01', sectionA, 'return_to_school')], 'TIMELINE_TRANSITION'],
    ];
    for (const [entries, code] of bad) { const r = await preview(e.id, entries); expect(r.status, JSON.stringify(r.body)).toBe(409); expect(r.body.error.code).toBe(code); }
    for (const entries of [[], [{ ...initial(), effective_on: '2025-02-30' }], [{ ...initial(), unexpected: true }], Array.from({ length: 1001 }, () => initial())]) expect((await preview(e.id, entries)).status).toBe(422);
    expect(await counts()).toEqual(before);
  });
  it('requires manager access in SQL and HTTP, and makes all correction history append-only', async () => {
    const e = await make(), p = await preview(e.id, [initial('2025-06-02')]);
    for (const actor of [ids.teacher, ids.otherTeacher, ids.inactive, ids.outsider]) {
      expect((await get(e.id, actor)).status).toBe(403); expect((await preview(e.id, [initial('2025-06-02')], 1, actor)).status).toBe(403);
      expect((await commit(e.id, p.body.data, actor)).status).toBe(403);
      expect((await request(app).get(endpoint(e.id) + '/corrections').set(header(actor))).status).toBe(403);
      await expect(db.asUser(actor, tx => tx.query('select edunexus.get_enrollment_timeline($1)', [e.id]))).rejects.toMatchObject({ code: '42501' });
    }
    expect((await request(app).get(endpoint(e.id))).status).toBe(401);
    for (const statement of ['delete from edunexus.enrollment_corrections', "update edunexus.enrollment_corrections set reason='Tampered reason'", 'delete from edunexus.enrollment_correction_sections', "update edunexus.enrollments set enrolled_on='2025-06-02'", 'select edunexus.resolve_enrollment_timeline($1)']) {
      await expect(db.asUser(ids.principal, tx => tx.query(statement, statement.includes('$1') ? [e.id] : []))).rejects.toMatchObject({ code: '42501' });
    }
    expect((await commit(e.id, p.body.data)).status).toBe(201);
    expect(await db.asUser(ids.teacher, tx => tx.query('select * from edunexus.enrollment_corrections'))).toEqual([]);
  });
  it('binds confirmation to the proposal, reason, actor and related learner/section versions', async () => {
    const e = await make(), entries = [initial('2025-06-02', sectionB)], p = await preview(e.id, entries);
    expect((await commit(e.id, p.body.data, ids.principal, { reviewed: false })).status).toBe(422);
    for (const overrides of [{ entries: [initial('2025-06-03', sectionB)] }, { reason: 'Synthetic changed review reason.' }, { review_hash: '0'.repeat(64) }]) {
      expect((await commit(e.id, p.body.data, ids.principal, overrides)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
    }
    expect((await commit(e.id, p.body.data, ids.officer)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
    await db.pg.query("update edunexus.learners set first_name='Synthetic changed' where id=$1", [e.learner]);
    expect((await commit(e.id, p.body.data)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
    const p2 = await preview(e.id, entries);
    await db.pg.query("update edunexus.sections set name=name || ' revised' where id=$1", [sectionB]);
    expect((await commit(e.id, p2.body.data)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
    const p3 = await preview(e.id, entries); expect((await commit(e.id, p3.body.data)).status).toBe(201);
  });
  it('enforces SQL command validation and cannot suppress ordinary history using a session flag', async () => {
    const e = await make();
    for (const actor of [ids.teacher, ids.inactive, null]) {
      await expect(db.asUser(actor, tx => tx.query('select edunexus.preview_enrollment_timeline($1,1,$2::jsonb,$3)', [e.id, JSON.stringify([initial('2025-06-02')]), reason]))).rejects.toMatchObject({ code: '42501' });
      await expect(db.asUser(actor, tx => tx.query('select edunexus.correct_enrollment_timeline($1,1,$2::jsonb,$3,$4)', [e.id, JSON.stringify([initial('2025-06-02')]), reason, '0'.repeat(64)]))).rejects.toMatchObject({ code: '42501' });
    }
    for (const malformed of [null, {}, [], [{ ...initial(), section_id: null }], [{ ...initial(), reason: null }], [{ ...initial(), extra: true }]]) {
      await expect(db.asUser(ids.principal, tx => tx.query('select edunexus.preview_enrollment_timeline($1,1,$2::jsonb,$3)', [e.id, JSON.stringify(malformed), reason]))).rejects.toMatchObject({ code: '23514' });
    }
    await db.asUser(ids.principal, async tx => {
      await tx.query("select set_config('edunexus.skip_enrollment_event','true',true),set_config('edunexus.request_id',$1,true)", [randomUUID()]);
      await tx.query("select * from edunexus.move_enrollment($1,1,'reassigned','2025-07-01',$2,null)", [e.id, sectionB]);
    });
    expect((await db.pg.query('select id from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows).toHaveLength(2);
    expect((await get(e.id)).body.data.entries).toHaveLength(2);
  });
  it('rejects competing corrections and stale proposals without duplicating or losing correction history', async () => {
    const e = await make(), a = await preview(e.id, [initial('2025-06-02')]), b = await preview(e.id, [initial('2025-06-03')]);
    const results = await Promise.all([commit(e.id, a.body.data), commit(e.id, b.body.data)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect(results.find(r => r.status === 409)!.body.error.code).toBe('VERSION_CONFLICT');
    expect((await request(app).get(endpoint(e.id) + '/corrections').set(header())).body.data.items).toHaveLength(1);
    expect((await commit(e.id, results[0]!.status === 201 ? a.body.data : b.body.data)).body.error.code).toBe('VERSION_CONFLICT');
    const p = await preview(e.id, [initial('2025-06-04')], 2);
    expect((await request(app).post(`/api/v1/enrollments/${e.id}/movements`).set(header()).send({ version: 2, action: 'reassigned', effective_on: '2025-07-01', section_id: sectionB })).status).toBe(201);
    expect((await commit(e.id, p.body.data)).body.error.code).toBe('VERSION_CONFLICT');
  });
  it('rolls back snapshot, references, projection and audit together if updating the projection fails', async () => {
    const e = await make(), p = await preview(e.id, [initial('2025-06-05')]), before = await counts();
    await db.pg.exec(`create function edunexus.synthetic_correction_failure() returns trigger language plpgsql as $$ begin
      if new.id='${e.id}'::uuid then raise exception using errcode='23514',message='Synthetic projection failure'; end if; return new; end $$;
      create trigger synthetic_correction_failure before update on edunexus.enrollments for each row execute function edunexus.synthetic_correction_failure();`);
    try { expect((await commit(e.id, p.body.data)).status).toBe(409); expect(await counts()).toEqual(before); expect((await get(e.id)).body.data.entries).toEqual([initial()]); }
    finally { await db.pg.exec('drop trigger synthetic_correction_failure on edunexus.enrollments; drop function edunexus.synthetic_correction_failure();'); }
    expect((await commit(e.id, p.body.data)).status).toBe(201);
  });
  it('protects newly referenced sections and updates birth-date constraints from the corrected initial date', async () => {
    const e = await make(), p = await preview(e.id, [initial('2025-06-04', sectionC)]);
    expect((await commit(e.id, p.body.data)).status).toBe(201);
    await expect(db.pg.query('delete from edunexus.sections where id=$1', [sectionA])).rejects.toMatchObject({ code: '23001' });
    const back = await preview(e.id, [initial('2025-06-04')], 2); expect((await commit(e.id, back.body.data)).status).toBe(201);
    // C is now historical-only, but correction references still protect it.
    await expect(db.pg.query('delete from edunexus.sections where id=$1', [sectionC])).rejects.toMatchObject({ code: '23001' });
    await expect(db.asUser(ids.principal, tx => tx.query("update edunexus.learners set birth_date='2025-06-04' where id=$1", [e.learner]))).rejects.toMatchObject({ code: '23514' });
  });
  it('logs timeline disclosure by enrollment ID without copying snapshots or review text into access logs', async () => {
    const e = await make(), p = await preview(e.id, [initial('2025-06-02')]), r = await commit(e.id, p.body.data);
    const fetched = await get(e.id);
    const history = await request(app).get(endpoint(e.id) + '/corrections').set(header());
    for (const response of [p, r, fetched, history]) {
      const rows = (await db.pg.query<{ record_ids: string[] }>('select record_ids from edunexus.record_access_events where request_id=$1', [response.body.requestId])).rows;
      expect(rows).toEqual([{ record_ids: [e.id] }]); expect(JSON.stringify(rows)).not.toContain(reason);
    }
  });
  it('supports a long annual timeline above 32 KiB while keeping larger requests bounded to the two correction routes', async () => {
    const e = await make();
    const entries = Array.from({ length: 260 }, (_, i) => i === 0 ? initial() : movement('reassigned', new Date(Date.UTC(2025, 5, 1 + i)).toISOString().slice(0, 10), i % 2 ? sectionB : sectionA, 'section_change'));
    expect(Buffer.byteLength(JSON.stringify({ entries, version: 1, reason }))).toBeGreaterThan(32768);
    const p = await preview(e.id, entries); expect(p.status, JSON.stringify(p.body)).toBe(201);
    expect((await commit(e.id, p.body.data)).status).toBe(201); expect((await get(e.id)).body.data.entries).toHaveLength(260);
    expect((await request(app).post('/api/v1/learners').set(header()).send({ text: 'x'.repeat(33000) })).status).toBe(413);
    expect((await request(app).post(endpoint(e.id) + '/preview').set(header()).send({ text: 'x'.repeat(262145) })).status).toBe(413);
  });
  it('keeps closed-year timelines readable to managers but rejects corrections and invalid history cursors', async () => {
    const e = await make(), p = await preview(e.id, [initial('2025-06-02')]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2025-06-01','2026-03-31')", [year]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    expect((await commit(e.id, p.body.data)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1", [year]);
    expect((await preview(e.id, [initial('2025-06-02')])).body.error.code).toBe('YEAR_CLOSED');
    expect((await commit(e.id, p.body.data)).body.error.code).toBe('YEAR_CLOSED'); expect((await get(e.id)).status).toBe(200);
    expect((await request(app).get(endpoint(e.id) + '/corrections?limit=11').set(header())).status).toBe(422);
    expect((await get(randomUUID())).status).toBe(404);
  });
});
