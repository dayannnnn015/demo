import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { AppError } from '../src/core/errors.js';

describe('Section 2A learner registry and enrollment boundaries', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let learnerId: string; let pendingId: string; let enrollmentId: string;
  const yearId = randomUUID(); const otherYearId = randomUUID();
  const sectionA = randomUUID(); const sectionB = randomUUID(); const sectionC = randomUUID(); const wrongGrade = randomUUID(); const wrongYear = randomUUID();
  const profile = { first_name: 'Synthetic', middle_name: null, last_name: 'Learner', name_extension: null, birth_date: '2018-02-28', sex: 'female' };
  const header = (id = ids.principal) => ({ Authorization: `Bearer ${id}` });
  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, origins: ['http://localhost:3000'], logger: pino({ level: 'silent' }), auth: {
      async verify(token) { if (!Object.values(ids).includes(token)) throw new AppError(401, 'INVALID_TOKEN', 'Invalid token'); return { userId: token, aal: 'aal2' }; },
    } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2025,'2025-06-01','2026-03-31'),($2,2024,'2024-06-01','2025-03-31')", [yearId, otherYearId]);
    for (const [id, year, grade, adviser] of [[sectionA, yearId, 1, ids.teacher], [sectionB, yearId, 1, ids.otherTeacher], [sectionC, yearId, 1, ids.otherTeacher], [wrongGrade, yearId, 2, ids.teacher], [wrongYear, otherYearId, 1, ids.teacher]]) {
      await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,$3,$5,$4)', [id, year, grade, adviser, `Synthetic ${id}`]);
    }
  });
  afterAll(async () => { await db?.database.close(); });
  it('creates a minimal profile, preserves leading-zero LRNs, and rejects malformed identities', async () => {
    const r = await request(app).post('/api/v1/learners').set(header()).send({ ...profile, lrn: '001234567890' });
    expect(r.status, JSON.stringify(r.body)).toBe(201); learnerId = r.body.data.id;
    expect(r.body.data.lrn).toBe('001234567890'); expect(r.body.data.birth_date).toBe(profile.birth_date);
    for (const body of [{ ...profile, lrn: 123456789012 }, { ...profile, lrn: '123' }, { ...profile, birth_date: '2018-02-30' }, { ...profile, birth_date: '2199-01-01' }, { ...profile, first_name: ' ' }, { ...profile, active: true }]) {
      expect((await request(app).post('/api/v1/learners').set(header()).send(body)).status).toBe(422);
    }
  });
  it('rejects duplicate LRNs without automatically merging same-name learners', async () => {
    expect((await request(app).post('/api/v1/learners').set(header()).send({ ...profile, lrn: '001234567890' })).body.error.code).toBe('ALREADY_EXISTS');
    const r = await request(app).post('/api/v1/learners').set(header(ids.officer)).send(profile);
    expect(r.status).toBe(201); pendingId = r.body.data.id; expect(r.body.data.lrn).toBeNull();
    const search = await request(app).get(`/api/v1/learners?search=Synthetic&birth_date=${profile.birth_date}&limit=1`).set(header());
    expect(search.body.data.items).toHaveLength(1); expect(search.body.data.pagination.has_more).toBe(true);
    expect((await request(app).get(`/api/v1/learners?lrn=001234567890`).set(header())).body.data.items).toHaveLength(1);
    expect((await request(app).get('/api/v1/learners?search=%25%25').set(header())).body.data.items).toEqual([]);
  });
  it('assigns a pending LRN once and prevents replacement through SQL or API', async () => {
    const r = await request(app).patch(`/api/v1/learners/${pendingId}/lrn`).set(header()).send({ version: 1, lrn: '001234567891' });
    expect(r.status).toBe(200); expect(r.body.data.version).toBe(2);
    expect((await request(app).patch(`/api/v1/learners/${pendingId}/lrn`).set(header()).send({ version: 2, lrn: '001234567892' })).status).toBe(409);
    await expect(db.asUser(ids.principal, tx => tx.query('update edunexus.learners set lrn=null where id=$1', [pendingId]))).rejects.toMatchObject({ code: '23514' });
    await expect(db.asUser(ids.principal, tx => tx.query("update edunexus.learners set birth_date='2199-01-01' where id=$1", [pendingId]))).rejects.toMatchObject({ code: '23514' });
  });
  it('denies teacher edits and unknown, unassigned, inactive, or unauthenticated reads', async () => {
    expect((await request(app).post('/api/v1/learners').set(header(ids.teacher)).send(profile)).status).toBe(403);
    expect((await request(app).get(`/api/v1/learners/${learnerId}`).set(header(ids.teacher))).status).toBe(404);
    expect((await request(app).get('/api/v1/learners').set(header(ids.teacher))).body.data.items).toEqual([]);
    expect((await request(app).get('/api/v1/learners').set(header(ids.inactive))).status).toBe(403);
    expect((await request(app).get('/api/v1/learners')).status).toBe(401);
    expect(await db.asUser(null, tx => tx.query('select * from edunexus.learners'))).toEqual([]);
    await expect(db.asUser(ids.teacher, tx => tx.query("insert into edunexus.learners(first_name,last_name,birth_date,sex) values('Unauthorized','Insert','2018-01-01','male')"))).rejects.toMatchObject({ code: '42501' });
    await expect(db.asUser(ids.teacher, tx => tx.query("select * from edunexus.enroll_learner($1,$2,'2025-06-01','regular')", [learnerId, sectionA]))).rejects.toMatchObject({ code: '42501' });
  });
  it('enrolls atomically once per school year and creates exactly one initial event under competing requests', async () => {
    const body = { learner_id: learnerId, section_id: sectionA, enrolled_on: '2025-06-01' };
    const results = await Promise.all([request(app).post('/api/v1/enrollments').set(header()).send(body), request(app).post('/api/v1/enrollments').set(header()).send(body)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    enrollmentId = results.find(r => r.status === 201)!.body.data.id;
    const history = await request(app).get(`/api/v1/enrollments/${enrollmentId}/history`).set(header());
    expect(history.body.data.items).toHaveLength(1); expect(history.body.data.items[0].event_type).toBe('enrolled');
    expect(history.body.data.items[0].actor_user_id).toBe(ids.principal);
    expect(history.body.data.items[0].request_id).toMatch(/^[a-f0-9-]{36}$/);
    expect((await request(app).post('/api/v1/enrollments').set(header()).send({ ...body, learner_id: pendingId, enrolled_on: '2025-05-31' })).status).toBe(409);
  });
  it('enforces adviser visibility in SQL and HTTP even with guessed learner or enrollment IDs', async () => {
    expect((await request(app).get(`/api/v1/learners/${learnerId}`).set(header(ids.teacher))).status).toBe(200);
    expect((await request(app).get(`/api/v1/enrollments/${enrollmentId}`).set(header(ids.teacher))).status).toBe(200);
    expect((await request(app).get(`/api/v1/learners/${learnerId}`).set(header(ids.otherTeacher))).status).toBe(404);
    expect((await request(app).get(`/api/v1/enrollments?section_id=${sectionA}`).set(header(ids.otherTeacher))).body.data.items).toEqual([]);
    expect(await db.asUser(ids.otherTeacher, tx => tx.query('select * from edunexus.enrollments'))).toEqual([]);
    expect((await request(app).get(`/api/v1/enrollments/${enrollmentId}/history`).set(header(ids.teacher))).status).toBe(403);
    expect(await db.asUser(ids.teacher, tx => tx.query('select * from edunexus.enrollment_events'))).toEqual([]);
    const writes = await db.asUser(ids.teacher, tx => tx.query("update edunexus.learners set first_name='Changed' where id=$1 returning *", [learnerId]));
    expect(writes).toEqual([]);
  });
  it('preserves optimistic profile versions and checks birth dates against existing enrollment', async () => {
    const results = await Promise.all(['Corrected A', 'Corrected B'].map(first_name => request(app).patch(`/api/v1/learners/${learnerId}`).set(header()).send({ ...profile, first_name, version: 1 })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await request(app).patch(`/api/v1/learners/${learnerId}`).set(header()).send({ ...profile, version: 2, birth_date: '2025-06-01' })).status).toBe(409);
  });
  it('rejects cross-grade, cross-year, backdated, future, and malformed movements without recording them', async () => {
    const url = `/api/v1/enrollments/${enrollmentId}/movements`;
    for (const body of [{ version: 1, action: 'reassigned', effective_on: '2025-07-01', section_id: wrongGrade }, { version: 1, action: 'reassigned', effective_on: '2025-07-01', section_id: wrongYear }, { version: 1, action: 'reassigned', effective_on: '2025-06-01', section_id: sectionB }, { version: 1, action: 'reassigned', effective_on: '2199-01-01', section_id: sectionB }]) {
      expect((await request(app).post(url).set(header()).send(body)).status).toBe(409);
    }
    expect((await request(app).post(url).set(header()).send({ version: 1, action: 'withdrawn', effective_on: '2025-07-01' })).status).toBe(422);
    expect((await request(app).post(url).set(header(ids.teacher)).send({ version: 1, action: 'reassigned', effective_on: '2025-07-01', section_id: sectionB })).status).toBe(403);
    expect((await request(app).get(`/api/v1/enrollments/${enrollmentId}/history`).set(header())).body.data.items).toHaveLength(1);
    expect((await request(app).get(`/api/v1/enrollments/${enrollmentId}`).set(header())).body.data.version).toBe(1);
  });
  it('moves adviser access with the assignment and retains its earlier event', async () => {
    const r = await request(app).post(`/api/v1/enrollments/${enrollmentId}/movements`).set(header(ids.officer)).send({ version: 1, action: 'reassigned', effective_on: '2025-07-01', section_id: sectionB });
    expect(r.status, JSON.stringify(r.body)).toBe(201); expect(r.body.data.version).toBe(2);
    expect((await request(app).get(`/api/v1/learners/${learnerId}`).set(header(ids.teacher))).status).toBe(404);
    expect((await request(app).get(`/api/v1/learners/${learnerId}`).set(header(ids.otherTeacher))).status).toBe(200);
    const history = (await request(app).get(`/api/v1/enrollments/${enrollmentId}/history`).set(header())).body.data.items;
    expect(history.map((r: { section_id: string }) => r.section_id)).toEqual([sectionA, sectionB]);
  });
  it('withdraws and reenters without losing history or creating another annual enrollment', async () => {
    const url = `/api/v1/enrollments/${enrollmentId}/movements`;
    expect((await request(app).post(url).set(header()).send({ version: 2, action: 'withdrawn', effective_on: '2025-08-01', exit_reason: 'transfer_out' })).status).toBe(201);
    expect((await request(app).get(`/api/v1/learners/${learnerId}`).set(header(ids.otherTeacher))).status).toBe(404);
    expect((await request(app).post(url).set(header()).send({ version: 3, action: 'withdrawn', effective_on: '2025-08-02', exit_reason: 'transfer_out' })).status).toBe(409);
    expect((await request(app).post(url).set(header()).send({ version: 3, action: 'reentered', effective_on: '2025-09-01', section_id: sectionA })).status).toBe(201);
    const history = (await request(app).get(`/api/v1/enrollments/${enrollmentId}/history`).set(header())).body.data.items;
    expect(history.map((r: { event_type: string }) => r.event_type)).toEqual(['enrolled', 'reassigned', 'withdrawn', 'reentered']);
    expect((await request(app).get(`/api/v1/enrollments?learner_id=${learnerId}`).set(header())).body.data.items).toHaveLength(1);
  });
  it('serializes competing movements and denies direct enrollment/history mutations', async () => {
    const url = `/api/v1/enrollments/${enrollmentId}/movements`;
    const results = await Promise.all([sectionB, sectionC].map(section_id => request(app).post(url).set(header()).send({ version: 4, action: 'reassigned', effective_on: '2025-10-01', section_id })));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect(results.find(r => r.status === 409)!.body.error.code).toBe('VERSION_CONFLICT');
    for (const sql of ['delete from edunexus.enrollment_events', "update edunexus.enrollments set status='withdrawn'", 'delete from edunexus.learners']) {
      await expect(db.asUser(ids.principal, tx => tx.query(sql))).rejects.toMatchObject({ code: '42501' });
    }
    const first = await request(app).get(`/api/v1/enrollments/${enrollmentId}/history?limit=2`).set(header());
    expect(first.body.data.items).toHaveLength(2); expect(first.body.data.pagination.has_more).toBe(true);
  });
  it('rolls back enrollment, history, and change audit together if the transaction fails', async () => {
    const before = await db.pg.query('select count(*)::integer as n from edunexus.audit_events');
    await expect(db.asUser(ids.principal, async tx => {
      await tx.query("select * from edunexus.enroll_learner($1,$2,'2025-06-01','regular')", [pendingId, sectionA]);
      throw new Error('Synthetic rollback');
    })).rejects.toThrow('Synthetic rollback');
    expect((await db.pg.query('select count(*)::integer as n from edunexus.audit_events')).rows).toEqual(before.rows);
    expect((await request(app).get(`/api/v1/enrollments?learner_id=${pendingId}`).set(header())).body.data.items).toEqual([]);
  });
  it('logs successful record access without copying names or search terms, and protects the read log', async () => {
    const r = await request(app).get(`/api/v1/learners/${learnerId}`).set(header());
    const log = await request(app).get('/api/v1/record-access-events?limit=1').set(header());
    expect(log.body.data.items[0].request_id).toBe(r.body.requestId);
    expect(log.body.data.items[0].record_ids).toEqual([learnerId]);
    expect(log.body.data.pagination.next_before_id).toBeTruthy();
    expect(JSON.stringify(log.body)).not.toContain('Synthetic');
    expect((await request(app).get('/api/v1/record-access-events').set(header(ids.teacher))).status).toBe(403);
    await expect(db.asUser(ids.principal, tx => tx.query('delete from edunexus.record_access_events'))).rejects.toMatchObject({ code: '42501' });
    const changeAudit = (await db.pg.query('select changed_fields from edunexus.audit_events where entity_id=$1', [learnerId])).rows;
    expect(JSON.stringify(changeAudit)).not.toContain('Corrected');
  });
  it('denies closed-year mutations and removes teacher access while preserving managerial history', async () => {
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2025-06-01','2026-03-31')", [yearId]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [yearId]);
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1", [yearId]);
    expect((await request(app).post('/api/v1/enrollments').set(header()).send({ learner_id: pendingId, section_id: sectionA, enrolled_on: '2025-06-01' })).status).toBe(409);
    expect((await request(app).post(`/api/v1/enrollments/${enrollmentId}/movements`).set(header()).send({ version: 5, action: 'withdrawn', effective_on: '2025-11-01', exit_reason: 'withdrawal' })).status).toBe(409);
    expect((await request(app).get(`/api/v1/learners/${learnerId}`).set(header(ids.otherTeacher))).status).toBe(404);
    expect((await request(app).get(`/api/v1/enrollments/${enrollmentId}/history`).set(header())).body.data.items).toHaveLength(5);
    expect((await request(app).get('/openapi.json')).body.paths['/api/v1/learners/{id}'].get.tags).toEqual(['Learners and enrollment']);
  });
});
