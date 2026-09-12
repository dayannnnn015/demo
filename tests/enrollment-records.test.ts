import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { enrollmentRecordResponses } from '../src/modules/enrollment-records/contracts.js';
import { timelineResponses } from '../src/modules/enrollment-timeline/contracts.js';

describe('Section 2B.4 reviewed annual enrollment void and restoration', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApp>;
  const year = randomUUID(), otherYear = randomUUID(), section = randomUUID(), otherSection = randomUUID();
  const reason = 'Synthetic source records checked for this administrative correction.';
  const headers = (actor = ids.principal) => ({ Authorization: `Bearer ${actor}` });
  const post = (url: string, body: object, actor = ids.principal) => request(app).post(url).set(headers(actor)).send(body);
  const get = (url: string, actor = ids.principal) => request(app).get(url).set(headers(actor));
  const endpoint = (id: string) => `/api/v1/enrollments/${id}/record-review`;
  const make = async (extra: Record<string, unknown> = {}, old = false) => {
    const learner = randomUUID();
    await db.pg.query('insert into edunexus.learners(id,first_name,last_name,birth_date,sex,lrn) values($1,$2,$3,$4,$5,$6)', [learner, 'Synthetic', learner, extra.birth_date ?? '2018-01-01', extra.sex ?? 'female', extra.lrn ?? null]);
    const rows = await db.asUser(ids.principal, async tx => {
      await tx.query("select set_config('edunexus.request_id',$1,true)", [randomUUID()]);
      return tx.query("select * from edunexus.enroll_learner($1,$2,$3,'regular')", [learner, old ? otherSection : section, old ? '2024-06-01' : '2025-06-05']);
    });
    return { id: String(rows[0]!.id), learner };
  };
  const preview = (id: string, extra: object = {}, actor = ids.principal) => post(endpoint(id) + '/preview', { version: 1, action: 'void', reason_code: 'incorrect_entry', reason, ...extra }, actor);
  const commit = (p: any, actor = ids.principal, extra: object = {}) => post(endpoint(p.enrollment.id), {
    version: p.enrollment.version, action: p.action, reason_code: p.reason_code, reason: p.reason,
    replacement_enrollment_id: p.replacement_enrollment_id, review_hash: p.review_hash, reviewed: true, ...extra,
  }, actor);
  const voidRecord = async (id: string, extra: object = {}) => {
    const p = await preview(id, extra); expect(p.status, JSON.stringify(p.body)).toBe(201); expect(p.body.data.can_commit, JSON.stringify(p.body)).toBe(true);
    const r = await commit(p.body.data); expect(r.status, JSON.stringify(r.body)).toBe(201); return r;
  };
  const restore = (id: string, version = 2) => preview(id, { version, action: 'restore', reason_code: 'restoration' });
  const counts = async () => (await db.pg.query(`select (select count(*)::int from edunexus.enrollment_record_events) as reviews,
    (select count(*)::int from edunexus.enrollment_events) as movements,(select count(*)::int from edunexus.enrollment_corrections) as corrections,
    (select count(*)::int from edunexus.audit_events) as audits`)).rows;
  const link = async (c: string, d: string) => {
    const p = await post('/api/v1/learner-reconciliations/preview', { canonical_id: c, duplicate_id: d, canonical_version: 1, duplicate_version: 1, action: 'link', reason });
    expect(p.body.data.can_commit, JSON.stringify(p.body)).toBe(true);
    const r = await post('/api/v1/learner-reconciliations', { canonical_id: c, duplicate_id: d, canonical_version: 1, duplicate_version: 1, action: 'link', reason, review_hash: p.body.data.review_hash, reviewed: true });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  };
  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token, aal: 'aal2' }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2025,'2025-06-01','2026-03-31'),($2,2024,'2024-06-01','2025-03-31')", [year, otherYear]);
    for (const [id, y] of [[section, year], [otherSection, otherYear]]) await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,$3,$4)', [id, y, `Synthetic ${id}`, ids.teacher]);
  });
  afterAll(async () => db?.database.close());

  it('previews without changing records and voids without fabricating withdrawal or deleting original history', async () => {
    const e = await make(), before = await counts();
    const original = (await db.pg.query('select * from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows;
    const p = await preview(e.id, {}, ids.officer); expect(p.status).toBe(201); expect(p.body.data.can_commit).toBe(true);
    expect(enrollmentRecordResponses.enrollmentRecordPreview!.safeParse(p.body.data).success).toBe(true); expect(await counts()).toEqual(before);
    const r = await commit(p.body.data, ids.officer); expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(enrollmentRecordResponses.enrollmentRecordReview!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({ action: 'void', enrollment_version: 2, actor_user_id: ids.officer, request_id: r.body.requestId });
    expect((await get(`/api/v1/enrollments/${e.id}`)).body.data).toMatchObject({ version: 2, record_state: 'voided', status: 'enrolled', enrolled_on: '2025-06-05', effective_on: '2025-06-05' });
    expect((await db.pg.query('select * from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows).toEqual(original);
    expect((await db.pg.query('select id from edunexus.learners where id=$1', [e.learner])).rows).toHaveLength(1);
  });
  it('removes teacher access and default roster membership while keeping manager-visible, explicitly labeled history', async () => {
    const e = await make(); await voidRecord(e.id);
    expect((await get(`/api/v1/enrollments/${e.id}`, ids.teacher)).status).toBe(404);
    expect((await get(`/api/v1/learners/${e.learner}`, ids.teacher)).status).toBe(404);
    expect((await get(`/api/v1/enrollments?learner_id=${e.learner}`)).body.data.items).toHaveLength(0);
    expect((await get(`/api/v1/enrollments?learner_id=${e.learner}&record_state=voided`)).body.data.items).toHaveLength(1);
    expect((await get(`/api/v1/enrollments?learner_id=${e.learner}&record_state=all`, ids.teacher)).body.data.items).toHaveLength(0);
    const timeline = await get(`/api/v1/enrollments/${e.id}/timeline`);
    expect(timeline.body.data).toMatchObject({ record_state: 'voided', usable_for_reporting: false }); expect(timeline.body.data.entries).toHaveLength(1);
    expect(timelineResponses.timelineGet!.safeParse(timeline.body.data).success).toBe(true);
    expect((await get(`/api/v1/enrollments/${e.id}/history`)).body.data).toMatchObject({ record_state: 'voided', usable_for_reporting: false, interpretation: 'original_movements' });
  });
  it('restores the same record and resumes ordinary movements without losing corrected history', async () => {
    const e = await make(), correction = { version: 1, reason, entries: [{ event_type: 'enrolled', effective_on: '2025-06-06', section_id: section, reason: 'regular' }] };
    const p = await post(`/api/v1/enrollments/${e.id}/timeline/preview`, correction);
    expect((await post(`/api/v1/enrollments/${e.id}/timeline/corrections`, { ...correction, review_hash: p.body.data.review_hash, reviewed: true })).status).toBe(201);
    await voidRecord(e.id, { version: 2 }); const r = await restore(e.id, 3); expect((await commit(r.body.data)).status).toBe(201);
    expect((await get(`/api/v1/enrollments/${e.id}`, ids.teacher)).body.data).toMatchObject({ record_state: 'valid', version: 4, enrolled_on: '2025-06-06' });
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 4, action: 'withdrawn', effective_on: '2025-07-01', exit_reason: 'withdrawal' })).status).toBe(201);
    const timeline = (await get(`/api/v1/enrollments/${e.id}/timeline`)).body.data;
    expect(timeline.entries).toHaveLength(2); expect(timeline.entries[0].effective_on).toBe('2025-06-06');
    expect((await db.pg.query('select enrollment_version from edunexus.enrollment_events where enrollment_id=$1 order by enrollment_version', [e.id])).rows).toEqual([{ enrollment_version: 1 }, { enrollment_version: 5 }]);
    const h = await get(endpoint(e.id) + '?limit=1'); expect(enrollmentRecordResponses.enrollmentRecordHistory!.safeParse(h.body.data).success).toBe(true);
    expect(h.body.data.pagination.next_before_version).toBe(4); expect(h.body.data.items[0].action).toBe('restore');
    expect((await get(endpoint(e.id) + '?before_version=4')).body.data.items[0].action).toBe('void');
  });
  it('allows a corrected annual enrollment after voiding but refuses to restore a second valid record', async () => {
    const e = await make(); await voidRecord(e.id);
    const replacement = await post('/api/v1/enrollments', { learner_id: e.learner, section_id: section, enrolled_on: '2025-06-07' });
    expect(replacement.status, JSON.stringify(replacement.body)).toBe(201); expect(replacement.body.data.id).not.toBe(e.id);
    const r = await restore(e.id); expect(r.body.data).toMatchObject({ can_commit: false, issues: ['ANNUAL_ENROLLMENT_EXISTS'] });
    expect((await commit(r.body.data, ids.principal, { review_hash: '0'.repeat(64) })).body.error.code).toBe('ENROLLMENT_RECORD_CONFLICT');
    expect((await get(`/api/v1/enrollments?learner_id=${e.learner}&record_state=all`)).body.data.items).toHaveLength(2);
  });
  it('resolves duplicate annual records before identity linking and prevents conflicting restoration across that link', async () => {
    const kept = await make(), duplicate = await make();
    const p = await preview(duplicate.id, { reason_code: 'duplicate_record', replacement_enrollment_id: kept.id });
    expect(p.body.data.replacement).toMatchObject({ enrollment: { id: kept.id }, learner: { id: kept.learner } });
    expect((await commit(p.body.data)).status).toBe(201); await link(kept.learner, duplicate.learner);
    const r = await restore(duplicate.id); expect(r.body.data.issues).toContain('ANNUAL_ENROLLMENT_EXISTS');
    expect((await get(`/api/v1/enrollments?learner_id=${kept.learner}`)).body.data.items.map((x: any) => x.id)).toEqual([kept.id]);
    const history = (await get(endpoint(duplicate.id))).body.data.items[0]; expect(history.review_snapshot.recorded_learner.id).toBe(duplicate.learner);
    expect((await preview(kept.id)).body.data.issues).toContain('REPLACEMENT_IN_USE');
  });
  it('validates replacement year, validity, identity fields, assigned LRNs, and request combinations', async () => {
    const e = await make({ lrn: '123456789014' }), other = await make({}, true), wrongIdentity = await make({ sex: 'male' }), wrongLrn = await make({ lrn: '123456789015' });
    for (const id of [e.id, other.id]) expect((await preview(e.id, { reason_code: 'duplicate_record', replacement_enrollment_id: id })).body.data.issues).toContain('INVALID_REPLACEMENT');
    for (const id of [wrongIdentity.id, wrongLrn.id]) expect((await preview(e.id, { reason_code: 'duplicate_record', replacement_enrollment_id: id })).body.data.issues).toContain('REPLACEMENT_IDENTITY_CONFLICT');
    const voided = await make(); await voidRecord(voided.id);
    expect((await preview(e.id, { reason_code: 'duplicate_record', replacement_enrollment_id: voided.id })).body.data.issues).toContain('INVALID_REPLACEMENT');
    for (const extra of [{ reason_code: 'duplicate_record' }, { replacement_enrollment_id: other.id }, { action: 'restore' }, { reason: 'short' }, { reviewed: true }, { reason: 'Synthetic\nmultiline' }]) expect((await preview(e.id, extra)).status).toBe(422);
    expect((await preview(e.id, { reason_code: 'duplicate_record', replacement_enrollment_id: randomUUID() })).status).toBe(404);
    expect((await get(endpoint(e.id) + '?limit=11')).status).toBe(422);
  });
  it('rejects movements and corrections on voided records and invalidates pre-void timeline reviews', async () => {
    const e = await make(), body = { version: 1, reason, entries: [{ event_type: 'enrolled', effective_on: '2025-06-06', section_id: section, reason: 'regular' }] };
    const p = await post(`/api/v1/enrollments/${e.id}/timeline/preview`, body); await voidRecord(e.id);
    expect((await post(`/api/v1/enrollments/${e.id}/timeline/corrections`, { ...body, review_hash: p.body.data.review_hash, reviewed: true })).body.error.code).toBe('VERSION_CONFLICT');
    expect((await post(`/api/v1/enrollments/${e.id}/timeline/preview`, { ...body, version: 2 })).body.error.code).toBe('VOIDED_ENROLLMENT_READ_ONLY');
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 2, action: 'withdrawn', effective_on: '2025-07-01', exit_reason: 'withdrawal' })).body.error.code).toBe('VOIDED_ENROLLMENT_READ_ONLY');
    await expect(db.asUser(ids.principal, tx => tx.query("select edunexus.move_enrollment($1,2,'withdrawn','2025-07-01',null,'withdrawal')", [e.id]))).rejects.toMatchObject({ code: 'P0301' });
  });
  it('revalidates enrollment, retained record, learner, year, reason and actor against the reviewed hash', async () => {
    const e = await make(), kept = await make(); const extra = { reason_code: 'duplicate_record', replacement_enrollment_id: kept.id };
    let p = await preview(e.id, extra);
    expect((await commit(p.body.data, ids.officer)).body.error.code).toBe('ENROLLMENT_RECORD_REVIEW_CHANGED');
    expect((await commit(p.body.data, ids.principal, { reason: 'Another reviewed synthetic reason.' })).body.error.code).toBe('ENROLLMENT_RECORD_REVIEW_CHANGED');
    expect((await commit(p.body.data, ids.principal, { reviewed: false })).status).toBe(422);
    await db.pg.query("update edunexus.learners set first_name='Synthetic revised' where id=$1", [kept.learner]);
    expect((await commit(p.body.data)).body.error.code).toBe('ENROLLMENT_RECORD_REVIEW_CHANGED'); p = await preview(e.id, extra);
    await db.pg.query('update edunexus.academic_years set status=status where id=$1', [year]);
    expect((await commit(p.body.data)).body.error.code).toBe('ENROLLMENT_RECORD_REVIEW_CHANGED'); p = await preview(e.id, extra);
    await post(`/api/v1/enrollments/${kept.id}/movements`, { version: 1, action: 'withdrawn', effective_on: '2025-07-01', exit_reason: 'withdrawal' });
    expect((await commit(p.body.data)).body.error.code).toBe('ENROLLMENT_RECORD_REVIEW_CHANGED'); p = await preview(e.id, extra);
    await post(`/api/v1/enrollments/${e.id}/movements`, { version: 1, action: 'withdrawn', effective_on: '2025-07-01', exit_reason: 'withdrawal' });
    expect((await commit(p.body.data)).body.error.code).toBe('VERSION_CONFLICT');
  });
  it('permits profile correction after voiding but blocks restoration when the preserved timeline conflicts with birth date', async () => {
    const e = await make(); await voidRecord(e.id);
    await db.asUser(ids.principal, tx => tx.query("update edunexus.learners set birth_date='2025-06-05' where id=$1", [e.learner]));
    const p = await restore(e.id); expect(p.body.data.issues).toContain('BIRTH_DATE_CONFLICT');
    expect((await commit(p.body.data, ids.principal, { review_hash: '0'.repeat(64) })).body.error.code).toBe('ENROLLMENT_RECORD_CONFLICT');
  });
  it('requires managers in API and SQL and prohibits direct state and history mutation', async () => {
    const e = await make(), p = await preview(e.id);
    for (const actor of [ids.teacher, ids.inactive, ids.outsider]) {
      expect((await preview(e.id, {}, actor)).status).toBe(403); expect((await commit(p.body.data, actor)).status).toBe(403); expect((await get(endpoint(e.id), actor)).status).toBe(403);
    }
    expect((await request(app).post(endpoint(e.id) + '/preview').send({})).status).toBe(401);
    for (const actor of [ids.teacher, ids.inactive, null]) {
      for (const name of ['preview_enrollment_record', 'review_enrollment_record']) {
        const sql = name === 'preview_enrollment_record' ? `select edunexus.${name}($1,1,'void','incorrect_entry',$2,null)` : `select edunexus.${name}($1,1,'void','incorrect_entry',$2,null,$3)`;
        await expect(db.asUser(actor, tx => tx.query(sql, name === 'preview_enrollment_record' ? [e.id, reason] : [e.id, reason, '0'.repeat(64)]))).rejects.toMatchObject({ code: '42501' });
      }
    }
    for (const sql of ["update edunexus.enrollments set record_state='voided'", 'delete from edunexus.enrollment_record_events', "insert into edunexus.enrollment_record_events(action) values('void')"]) await expect(db.asUser(ids.principal, tx => tx.query(sql))).rejects.toMatchObject({ code: '42501' });
    for (const params of [[e.id, 1, 'invalid', 'incorrect_entry', reason, null], [e.id, 1, 'void', 'duplicate_record', reason, null], [e.id, 1, 'restore', 'restoration', reason, e.id]]) await expect(db.asUser(ids.principal, tx => tx.query('select edunexus.preview_enrollment_record($1,$2,$3,$4,$5,$6)', params))).rejects.toMatchObject({ code: '23514' });
    expect(await db.asUser(ids.teacher, tx => tx.query('select * from edunexus.enrollment_record_events'))).toEqual([]);
  });
  it('rolls back the review snapshot and audit if the enrollment update fails', async () => {
    const e = await make(), p = await preview(e.id), before = await counts();
    await db.pg.exec(`create function edunexus.synthetic_record_failure() returns trigger language plpgsql as $$ begin if new.id='${e.id}'::uuid then raise exception using errcode='23514',message='Synthetic failure'; end if; return new; end $$;
      create trigger synthetic_record_failure before update on edunexus.enrollments for each row execute function edunexus.synthetic_record_failure();`);
    try { expect((await commit(p.body.data)).status).toBe(409); expect(await counts()).toEqual(before); expect((await get(`/api/v1/enrollments/${e.id}`)).body.data).toMatchObject({ record_state: 'valid', version: 1 }); }
    finally { await db.pg.exec('drop trigger synthetic_record_failure on edunexus.enrollments;drop function edunexus.synthetic_record_failure();'); }
    expect((await commit(p.body.data)).status).toBe(201);
  });
  it('commits only one competing review and rejects stale retries without duplicate events', async () => {
    const e = await make(), p = await preview(e.id), results = await Promise.all([commit(p.body.data), commit(p.body.data)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect((await commit(p.body.data)).body.error.code).toBe('VERSION_CONFLICT');
    expect((await get(endpoint(e.id))).body.data.items).toHaveLength(1);
    const unchanged = await preview(e.id, { version: 2 }); expect(unchanged.body.data.issues).toContain('RECORD_STATE_UNCHANGED');
  });
  it('allows reviewed import into a vacated year and preserves old committed import receipts after voiding', async () => {
    const e = await make(); await voidRecord(e.id);
    const input = { section_id: section, enrolled_on: '2025-06-08', csv: `lrn,first_name,middle_name,last_name,name_extension,birth_date,sex\r\n,Synthetic,,${e.learner},,2018-01-01,female`, resolutions: [{ row: 1, action: 'use_existing', learner_id: e.learner, version: 1 }] };
    const p = await post('/api/v1/roster-imports/preview', input); expect(p.body.data.can_commit, JSON.stringify(p.body)).toBe(true);
    const imported = await post(`/api/v1/roster-imports/${p.body.data.preview_id}/commit`, { ...input, confirmed: true }); expect(imported.status).toBe(201);
    await voidRecord(imported.body.data.items[0].enrollment_id);
    const retry = await post(`/api/v1/roster-imports/${p.body.data.preview_id}/commit`, { ...input, confirmed: true }); expect(retry.body.data).toEqual(imported.body.data);
    expect((await get(`/api/v1/enrollments?learner_id=${e.learner}`)).body.data.items).toHaveLength(0);
  });
  it('logs every disclosed enrollment identifier and keeps sensitive snapshots out of general audit', async () => {
    const e = await make(), kept = await make(), p = await preview(e.id, { reason_code: 'duplicate_record', replacement_enrollment_id: kept.id });
    const r = await commit(p.body.data), h = await get(endpoint(e.id));
    for (const requestId of [p.body.requestId, r.body.requestId, h.body.requestId]) {
      const logs = (await db.pg.query('select record_ids from edunexus.record_access_events where request_id=$1', [requestId])).rows;
      expect(logs.flatMap((v: any) => v.record_ids)).toEqual(expect.arrayContaining([e.id, kept.id]));
    }
    const audit = JSON.stringify((await db.pg.query('select * from edunexus.audit_events where request_id=$1', [r.body.requestId])).rows);
    expect(audit).not.toContain(reason); expect(audit).not.toContain('Synthetic');
  });
  it('blocks voiding and restoration in closed school years, including a proposal reviewed before closure', async () => {
    const valid = await make({}, true), voided = await make({}, true); await voidRecord(voided.id);
    const p = await preview(valid.id);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2024-06-01','2025-03-31')", [otherYear]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [otherYear]);
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1", [otherYear]);
    expect((await commit(p.body.data)).body.error.code).toBe('ENROLLMENT_RECORD_CONFLICT');
    expect((await preview(valid.id)).body.data.issues).toContain('YEAR_CLOSED'); expect((await restore(voided.id)).body.data.issues).toContain('YEAR_CLOSED');
    expect((await get(endpoint(voided.id))).status).toBe(200);
  });
});
