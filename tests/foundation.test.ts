import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../src/http-app.js';
import { ids, testDatabase } from './helpers/database.js';
import { AppError } from '../src/core/errors.js';

describe('Section 1 API and PostgreSQL authorization', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let yearId: string;
  let sectionId: string;
  let periodId: string;
  const header = (id = ids.principal) => ({ Authorization: `Bearer ${id}` });
  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, origins: ['http://localhost:3000'], logger: pino({ level: 'silent' }), auth: {
      async verify(token) {
        if (!Object.values(ids).includes(token)) throw new AppError(401, 'INVALID_TOKEN', 'Invalid token');
        return { userId: token };
      },
    } });
  });
  afterAll(async () => { await db?.database.close(); });

  it('offers health and an OpenAPI contract without exposing school records', async () => {
    expect((await request(app).get('/health/live')).status).toBe(200);
    expect((await request(app).get('/health/ready')).status).toBe(200);
    const spec = await request(app).get('/openapi.json');
    expect(spec.body.openapi).toBe('3.1.0');
    expect(spec.body.paths['/api/v1/sections/{id}'].get.security).toEqual([{ staffBearer: [] }]);
  });
  it('denies absent, invalid, inactive, and unregistered identities', async () => {
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/me').set(header('invalid'))).status).toBe(401);
    expect((await request(app).get('/api/v1/me').set(header(ids.inactive))).body.error.code).toBe('STAFF_ACCESS_REQUIRED');
    expect((await request(app).get('/api/v1/me').set(header(ids.outsider))).status).toBe(403);
  });
  it('uses database roles and protects response caching and browser origins', async () => {
    const r = await request(app).get('/api/v1/me').set(header(ids.teacher));
    expect(r.body.data.role).toBe('teacher');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-request-id']).toBe(r.body.requestId);
    expect((await request(app).get('/api/v1/me').set(header()).set('Origin', 'https://untrusted.example')).status).toBe(403);
    const preflight = await request(app).options('/api/v1/me').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'GET');
    expect(preflight.status).toBe(204);
  });
  it('rejects malformed, unknown, oversize, and invalid date fields', async () => {
    expect((await request(app).post('/api/v1/academic-years').set(header()).send({ start_year: 2026, starts_on: '2026-02-30', ends_on: '2027-03-31' })).status).toBe(422);
    expect((await request(app).patch('/api/v1/school').set(header()).send({ version: 1, name: 'School', address: 'Address', school_code: null, role: 'principal' })).status).toBe(422);
    expect((await request(app).post('/api/v1/academic-years').set(header()).set('Content-Type', 'application/json').send('{')).status).toBe(400);
    expect((await request(app).post('/api/v1/academic-years').set(header()).send({ data: 'x'.repeat(40000) })).status).toBe(413);
    expect((await request(app).get('/api/v1/staff?limit=1000').set(header())).status).toBe(422);
    expect((await request(app).get('/api/v1/staff?limit=2&limit=3').set(header())).status).toBe(422);
  });
  it('denies teacher administration in the API and at the database', async () => {
    const body = { start_year: 2026, starts_on: '2026-06-08', ends_on: '2027-03-31' };
    expect((await request(app).post('/api/v1/academic-years').set(header(ids.teacher)).send(body)).status).toBe(403);
    await expect(db.asUser(ids.teacher, tx => tx.query("insert into edunexus.academic_years(start_year,starts_on,ends_on) values (2026,'2026-06-08','2027-03-31')"))).rejects.toMatchObject({ code: '42501' });
  });
  it('creates draft years and enforces duplicate and activation rules', async () => {
    const body = { start_year: 2026, starts_on: '2026-06-08', ends_on: '2027-03-31' };
    const result = await request(app).post('/api/v1/academic-years').set(header()).send(body);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    yearId = result.body.data.id;
    expect(result.body.data.status).toBe('draft');
    expect((await request(app).post('/api/v1/academic-years').set(header()).send(body)).status).toBe(409);
    expect((await request(app).patch(`/api/v1/academic-years/${yearId}/status`).set(header()).send({ version: 1, status: 'active' })).status).toBe(409);
  });
  it('supports three reporting periods and prevents overlapping or out-of-year dates', async () => {
    for (const [ordinal, starts_on, ends_on] of [[1, '2026-06-08', '2026-09-30'], [2, '2026-10-01', '2026-12-31'], [3, '2027-01-01', '2027-03-31']] as const) {
      const r = await request(app).post(`/api/v1/academic-years/${yearId}/periods`).set(header()).send({ ordinal, name: `Term ${ordinal}`, starts_on, ends_on });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      periodId = r.body.data.id;
    }
    expect((await request(app).post(`/api/v1/academic-years/${yearId}/periods`).set(header()).send({ ordinal: 4, name: 'Overlap', starts_on: '2026-09-30', ends_on: '2026-10-01' })).status).toBe(409);
    expect((await request(app).post(`/api/v1/academic-years/${yearId}/periods`).set(header()).send({ ordinal: 4, name: 'Outside', starts_on: '2027-04-01', ends_on: '2027-04-02' })).status).toBe(409);
    const activation = await request(app).patch(`/api/v1/academic-years/${yearId}/status`).set(header()).send({ version: 1, status: 'active' });
    expect(activation.status, JSON.stringify(activation.body)).toBe(200);
    expect((await request(app).patch(`/api/v1/reporting-periods/${periodId}`).set(header()).send({ version: 1, ordinal: 3, name: 'Changed', starts_on: '2027-01-01', ends_on: '2027-03-31' })).status).toBe(409);
  });
  it('creates sections only with active teacher advisers', async () => {
    const r = await request(app).post('/api/v1/sections').set(header()).send({ academic_year_id: yearId, grade_level: 1, name: 'Daisy', adviser_user_id: ids.teacher });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    sectionId = r.body.data.id;
    expect((await request(app).post('/api/v1/sections').set(header()).send({ academic_year_id: yearId, grade_level: 1, name: ' daisy ' })).status).toBe(409);
    expect((await request(app).post('/api/v1/sections').set(header()).send({ academic_year_id: yearId, grade_level: 2, name: 'Invalid adviser', adviser_user_id: ids.inactive })).status).toBe(409);
    expect((await request(app).post('/api/v1/sections').set(header()).send({ academic_year_id: yearId, grade_level: 2, name: 'Principal adviser', adviser_user_id: ids.principal })).status).toBe(409);
  });
  it('isolates teachers even when they guess another section ID or query SQL directly', async () => {
    expect((await request(app).get(`/api/v1/sections/${sectionId}`).set(header(ids.teacher))).status).toBe(200);
    expect((await request(app).get(`/api/v1/sections/${sectionId}`).set(header(ids.otherTeacher))).status).toBe(404);
    expect((await request(app).get('/api/v1/sections').set(header(ids.otherTeacher))).body.data.items).toEqual([]);
    expect(await db.asUser(ids.otherTeacher, tx => tx.query('select * from edunexus.sections'))).toEqual([]);
    expect(await db.asUser(null, tx => tx.query('select * from edunexus.sections'))).toEqual([]);
    expect(await db.asUser(ids.inactive, tx => tx.query('select * from edunexus.academic_years'))).toEqual([]);
  });
  it('prevents lost updates and commits only one competing change', async () => {
    const results = await Promise.all(['Daisy A', 'Daisy B'].map(name => request(app).patch(`/api/v1/sections/${sectionId}`).set(header()).send({ version: 1, name })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(results.find(r => r.status === 409)!.body.error.code).toBe('VERSION_CONFLICT');
    expect((await request(app).get(`/api/v1/sections/${sectionId}`).set(header())).body.data.version).toBe(2);
  });
  it('audits the committed change without storing record values', async () => {
    const r = await request(app).get('/api/v1/audit-events?limit=100').set(header());
    const eventIds = r.body.data.items.map((event: { id: string }) => Number(event.id));
    expect(eventIds).toEqual([...eventIds].sort((a, b) => b - a));
    const changes = r.body.data.items.filter((e: { entity_id: string; operation: string }) => e.entity_id === sectionId && e.operation === 'UPDATE');
    expect(changes).toHaveLength(1);
    expect(changes[0].changed_fields).toEqual(['name']);
    expect(changes[0].actor_user_id).toBe(ids.principal);
    expect(changes[0].request_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(changes)).not.toContain('Daisy');
    expect((await request(app).get('/api/v1/audit-events').set(header(ids.teacher))).status).toBe(403);
    await expect(db.asUser(ids.principal, tx => tx.query('delete from edunexus.audit_events'))).rejects.toMatchObject({ code: '42501' });
    await expect(db.asUser(ids.principal, tx => tx.query("update edunexus.audit_events set operation='INSERT'"))).rejects.toMatchObject({ code: '42501' });
  });
  it('protects role grants, unknown identities, and a principal from self lockout', async () => {
    expect((await request(app).post('/api/v1/staff').set(header(ids.officer)).send({ user_id: ids.outsider, display_name: 'Escalation', role: 'principal' })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/staff/${ids.principal}`).set(header()).send({ version: 1, active: false })).body.error.code).toBe('SELF_ACCESS_CHANGE');
    expect((await request(app).post('/api/v1/staff').set(header()).send({ user_id: '99999999-9999-4999-8999-999999999999', display_name: 'Missing Auth user', role: 'teacher' })).status).toBe(409);
    await expect(db.asUser(ids.officer, tx => tx.query("insert into edunexus.staff(user_id,display_name,role) values ($1,'Escalation','principal')", [ids.outsider]))).rejects.toMatchObject({ code: '42501' });
    await expect(db.pg.query('update edunexus.staff set active=false where user_id=$1', [ids.principal])).rejects.toMatchObject({ code: '23514' });
  });
  it('requires adviser reassignment before suspension and immediately revokes suspended access', async () => {
    expect((await request(app).patch(`/api/v1/staff/${ids.teacher}`).set(header()).send({ version: 1, active: false })).status).toBe(409);
    expect((await request(app).patch(`/api/v1/sections/${sectionId}`).set(header()).send({ version: 2, adviser_user_id: ids.otherTeacher })).status).toBe(200);
    expect((await request(app).get(`/api/v1/sections/${sectionId}`).set(header(ids.teacher))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/staff/${ids.teacher}`).set(header()).send({ version: 1, active: false })).status).toBe(200);
    expect((await request(app).get('/api/v1/me').set(header(ids.teacher))).status).toBe(403);
  });
  it('supports concurrent staff reads without cross-request identity leakage', async () => {
    const results = await Promise.all(Array.from({ length: 27 }, (_, i) => request(app).get('/api/v1/me').set(header(i % 2 ? ids.officer : ids.otherTeacher))));
    results.forEach((r, i) => { expect(r.status).toBe(200); expect(r.body.data.user_id).toBe(i % 2 ? ids.officer : ids.otherTeacher); });
    expect(await db.asUser(null, tx => tx.query('select * from edunexus.school_profile'))).toEqual([]);
  });
  it('closes a year permanently and denies changes to its sections', async () => {
    const r = await request(app).patch(`/api/v1/academic-years/${yearId}/status`).set(header()).send({ version: 2, status: 'closed' });
    expect(r.status).toBe(200);
    expect((await request(app).patch(`/api/v1/sections/${sectionId}`).set(header()).send({ version: 3, name: 'Changed after closure' })).status).toBe(409);
    expect((await request(app).patch(`/api/v1/academic-years/${yearId}/status`).set(header()).send({ version: 3, status: 'active' })).status).toBe(409);
  });
  it('enforces a persistent per-user rate limit', async () => {
    await db.pg.query(`insert into edunexus.request_buckets(user_id,window_start,request_count) values ($1,date_trunc('minute',clock_timestamp()),180)
      on conflict(user_id) do update set window_start=excluded.window_start,request_count=180`, [ids.officer]);
    const r = await request(app).get('/api/v1/me').set(header(ids.officer));
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('60');
  });
});
