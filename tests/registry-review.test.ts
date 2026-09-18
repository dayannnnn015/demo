import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { reviewResponses } from '../src/modules/registry-review/contracts.js';

describe('Section 2B.1 reviewed imports and LRN corrections', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  const year = randomUUID(), section = randomUUID();
  const csvHeader = 'lrn,first_name,middle_name,last_name,name_extension,birth_date,sex\r\n';
  let serial = 0;
  const next = () => `Synthetic${++serial}`;
  const lrn = () => `0099${String(++serial).padStart(8, '0')}`;
  const header = (id = ids.principal) => ({ Authorization: `Bearer ${id}` });
  const profile = (name = next(), reference: string | null = null) => ({ first_name: name, middle_name: null, last_name: 'Import Fixture', name_extension: null, birth_date: '2018-01-01', sex: 'female', lrn: reference });
  const csv = (p: ReturnType<typeof profile>) => [p.lrn ?? '', p.first_name, '', p.last_name, '', p.birth_date, p.sex].map(v => `"${v.replaceAll('"', '""')}"`).join(',');
  const input = (...people: ReturnType<typeof profile>[]) => ({ section_id: section, enrolled_on: '2025-06-01', csv: csvHeader + people.map(csv).join('\r\n') });
  const preview = (b: object, actor = ids.principal) => request(app).post('/api/v1/roster-imports/preview').set(header(actor)).send(b);
  const commit = (id: string, b: object, actor = ids.principal) => request(app).post(`/api/v1/roster-imports/${id}/commit`).set(header(actor)).send({ ...b, confirmed: true });
  const create = async (p: ReturnType<typeof profile>) => {
    const r = await request(app).post('/api/v1/learners').set(header()).send(p);
    expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data;
  };
  const counts = async () => (await db.pg.query(`select
    (select count(*)::int from edunexus.learners) as learners,
    (select count(*)::int from edunexus.enrollments) as enrollments,
    (select count(*)::int from edunexus.enrollment_events) as events,
    (select count(*)::int from edunexus.audit_events) as audit`)).rows;
  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2025,'2025-06-01','2026-03-31')", [year]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,'Synthetic import section',$3)", [section, year, ids.teacher]);
  });
  beforeEach(async () => {
    // Expire abandoned synthetic previews so tests exercise their own quota.
    await db.pg.query("update edunexus.import_previews set expires_at=clock_timestamp()-interval '1 second' where committed_at is null");
  });
  afterAll(async () => db?.database.close());

  it('publishes a bounded canonical template and limits it to managers', async () => {
    const r = await request(app).get('/api/v1/roster-imports/template').set(header());
    expect(r.status).toBe(200); expect(r.body.data.csv).toBe(csvHeader);
    expect(reviewResponses.importTemplate!.safeParse(r.body.data).success).toBe(true);
    expect((await request(app).get('/api/v1/roster-imports/template').set(header(ids.teacher))).status).toBe(403);
    expect((await request(app).get('/api/v1/roster-imports/template')).status).toBe(401);
  });
  it('parses BOM, CRLF, leading-zero LRNs, quoted commas and escaped quotes without writing learners', async () => {
    const p = profile('Synthetic, "Quoted"', lrn()), b = input(p); b.csv = '\ufeff' + b.csv;
    const before = await counts(), r = await preview(b);
    expect(r.status, JSON.stringify(r.body)).toBe(201); expect(r.body.data.can_commit).toBe(true);
    expect(r.body.data.rows[0].profile).toEqual(p);
    expect(reviewResponses.importPreview!.safeParse(r.body.data).success).toBe(true);
    expect(await counts()).toEqual(before);
    const stored = JSON.stringify((await db.pg.query('select * from edunexus.import_previews where id=$1', [r.body.data.preview_id])).rows);
    expect(stored).not.toContain(p.first_name); expect(stored).not.toContain(p.lrn);
  });
  it('rejects malformed CSV, unexpected headers, excess rows and oversized content without leaking field values', async () => {
    const b = input(profile()), sensitive = 'SENSITIVE_TEST_VALUE';
    for (const content of [csvHeader + `"${sensitive}`, b.csv.replace('lrn,first_name', 'lrn,lrn'), csvHeader, csvHeader + Array.from({ length: 51 }, () => csv(profile())).join('\n')]) {
      const r = await preview({ ...b, csv: content }); expect(r.status).toBe(422); expect(JSON.stringify(r.body)).not.toContain(sensitive);
    }
    expect((await preview({ ...b, csv: 'x'.repeat(24001) })).status).toBe(422);
    expect((await preview({ ...b, csv: '界'.repeat(8100) })).status).toBe(413);
    expect((await preview({ ...b, csv: 'x'.repeat(33000) })).status).toBe(413);
  });
  it('reports per-row invalid fields and repeated input; never issues a committable token for errors', async () => {
    const p = profile(), b = input(p, p, { ...profile(), birth_date: '2018-02-30' }, { ...profile(), first_name: 'Bad\u0000Text' });
    const before = await counts(), r = await preview(b);
    expect(r.status).toBe(201); expect(r.body.data.can_commit).toBe(false); expect(r.body.data.preview_id).toBeNull();
    expect(r.body.data.issues.map((v: { code: string }) => v.code)).toEqual(expect.arrayContaining(['DUPLICATE_INPUT', 'INVALID_FIELD', 'INVALID_TEXT']));
    expect(await counts()).toEqual(before);
  });
  it('commits a roster atomically, attributes history, and safely returns the same receipt on competing retries', async () => {
    const p = profile(next(), lrn()), b = input(p, profile());
    const r = await preview(b, ids.officer), id = r.body.data.preview_id;
    expect(r.body.data.can_commit).toBe(true);
    const results = await Promise.all([commit(id, b, ids.officer), commit(id, b, ids.officer)]);
    for (const result of results) { expect(result.status, JSON.stringify(result.body)).toBe(201); expect(reviewResponses.importCommit!.safeParse(result.body.data).success).toBe(true); }
    expect(results[0]!.body.data).toEqual(results[1]!.body.data);
    const receipt = results[0]!.body.data;
    expect(receipt.items).toHaveLength(2);
    for (const item of receipt.items) {
      const history = await request(app).get(`/api/v1/enrollments/${item.enrollment_id}/history`).set(header());
      expect(history.body.data.items).toHaveLength(1); expect(history.body.data.items[0].actor_user_id).toBe(ids.officer);
      expect((await request(app).get(`/api/v1/learners/${item.learner_id}`).set(header(ids.teacher))).status).toBe(200);
      expect((await request(app).get(`/api/v1/learners/${item.learner_id}`).set(header(ids.otherTeacher))).status).toBe(404);
    }
    await db.pg.query("update edunexus.import_previews set expires_at=clock_timestamp()-interval '1 second' where id=$1", [id]);
    expect((await commit(id, b, ids.officer)).body.data).toEqual(receipt);
    const status = await request(app).get(`/api/v1/roster-imports/${id}`).set(header(ids.officer));
    expect(status.body.data.status).toBe('committed'); expect(status.body.data.receipt).toEqual(receipt);
    expect(reviewResponses.importGet!.safeParse(status.body.data).success).toBe(true);
  });
  it('requires confirmation, the original payload, the preview owner, and current manager access', async () => {
    const b = input(profile()), r = await preview(b), id = r.body.data.preview_id;
    expect((await request(app).post(`/api/v1/roster-imports/${id}/commit`).set(header()).send(b)).status).toBe(422);
    expect((await commit(id, { ...b, enrolled_on: '2025-06-02' })).body.error.code).toBe('PREVIEW_CHANGED');
    expect((await commit(id, b, ids.officer)).status).toBe(404);
    expect((await request(app).get(`/api/v1/roster-imports/${id}`).set(header(ids.officer))).status).toBe(404);
    expect((await preview(b, ids.teacher)).status).toBe(403);
    expect((await commit(id, b, ids.teacher)).status).toBe(403);
    expect((await commit(id, b, ids.inactive)).status).toBe(403);
    expect((await db.asUser(ids.teacher, tx => tx.query('select * from edunexus.import_previews')))).toEqual([]);
    await expect(db.asUser(ids.teacher, tx => tx.query('select * from edunexus.lock_import_preview($1,$2)', [id, '0'.repeat(64)]))).rejects.toMatchObject({ code: '42501' });
    for (const sql of ['delete from edunexus.import_previews', "update edunexus.import_previews set receipt='{}'::jsonb"]) await expect(db.asUser(ids.principal, tx => tx.query(sql))).rejects.toMatchObject({ code: '42501' });
  });
  it('expires pending previews and caps abandoned review tokens', async () => {
    const b = input(profile()), r = await preview(b), id = r.body.data.preview_id;
    await db.pg.query("update edunexus.import_previews set expires_at=clock_timestamp()-interval '1 second' where id=$1", [id]);
    expect((await request(app).get(`/api/v1/roster-imports/${id}`).set(header())).body.data.status).toBe('expired');
    expect((await commit(id, b)).body.error.code).toBe('PREVIEW_EXPIRED');
    for (let i = 0; i < 10; i++) expect((await preview(b)).status).toBe(201);
    expect((await preview(b)).body.error.code).toBe('PREVIEW_LIMIT');
    expect((await db.pg.query('select id from edunexus.import_previews where id=$1', [id])).rows).toEqual([]);
  });
  it('requires explicit existing-learner selection and never overwrites profiles or assigns a pending LRN', async () => {
    const p = profile(next(), lrn()), existing = await create(p), b = input(p);
    const unresolved = await preview(b);
    expect(unresolved.body.data.issues[0].code).toBe('LRN_EXISTS');
    expect(unresolved.body.data.rows[0].candidates[0].id).toBe(existing.id);
    const resolved = { ...b, resolutions: [{ row: 1, action: 'use_existing', learner_id: existing.id, version: existing.version }] };
    const r = await preview(resolved); expect(r.body.data.can_commit).toBe(true);
    const receipt = await commit(r.body.data.preview_id, resolved);
    expect(receipt.status).toBe(201); expect(receipt.body.data.items[0]).toMatchObject({ action: 'use_existing', learner_id: existing.id });
    expect((await request(app).get(`/api/v1/learners/${existing.id}`).set(header())).body.data.version).toBe(1);
    expect((await preview(resolved)).body.data.issues.map((i: { code: string }) => i.code)).toContain('ALREADY_ENROLLED');
    const pending = profile(), pendingRecord = await create(pending);
    const mismatch = await preview({ ...input({ ...pending, lrn: lrn() }), resolutions: [{ row: 1, action: 'use_existing', learner_id: pendingRecord.id, version: 1 }] });
    expect(mismatch.body.data.issues.map((i: { code: string }) => i.code)).toContain('PROFILE_MISMATCH');
  });
  it('lets a manager distinguish a namesake with a retained reason but cannot override an occupied LRN', async () => {
    const p = profile(), existing = await create(p), b = input(p);
    expect((await preview(b)).body.data.issues[0].code).toBe('POSSIBLE_DUPLICATE');
    const resolved = { ...b, resolutions: [{ row: 1, action: 'create_distinct', reason: 'Synthetic reviewed distinct namesake.' }] };
    const r = await preview(resolved), saved = await commit(r.body.data.preview_id, resolved);
    expect(saved.status, JSON.stringify(saved.body)).toBe(201); expect(saved.body.data.items[0].learner_id).not.toBe(existing.id);
    expect(saved.body.data.items[0].resolution_reason).toBe(resolved.resolutions[0]!.reason);
    const withLrn = profile(next(), lrn()); await create(withLrn);
    const blocked = await preview({ ...input(withLrn), resolutions: resolved.resolutions });
    expect(blocked.body.data.issues[0].code).toBe('LRN_EXISTS');
    const empty = await preview({ ...input(profile()), resolutions: resolved.resolutions });
    expect(empty.body.data.issues[0].code).toBe('UNNEEDED_RESOLUTION');
  });
  it('revalidates profiles, section versions, and newly appearing duplicates before any commit', async () => {
    const p = profile(), b = input(p), r = await preview(b);
    await create(p);
    const before = await counts(); expect((await commit(r.body.data.preview_id, b)).body.error.code).toBe('PREVIEW_CHANGED'); expect(await counts()).toEqual(before);
    const p2 = profile(), existing = await create(p2), b2 = { ...input(p2), resolutions: [{ row: 1, action: 'use_existing', learner_id: existing.id, version: 1 }] };
    const r2 = await preview(b2);
    await request(app).patch(`/api/v1/learners/${existing.id}`).set(header()).send({ ...p2, lrn: undefined, first_name: next(), version: 1 });
    expect((await commit(r2.body.data.preview_id, b2)).body.error.code).toBe('PREVIEW_CHANGED');
    const b3 = input(profile()), r3 = await preview(b3);
    await db.pg.query("update edunexus.sections set name='Synthetic revised section' where id=$1", [section]);
    expect((await commit(r3.body.data.preview_id, b3)).body.error.code).toBe('PREVIEW_CHANGED');
  });
  it('rolls back earlier rows, movement events, audit writes, and the receipt if a later row fails', async () => {
    const failureName = next(), b = input(profile(), profile(failureName)), r = await preview(b);
    // A database-side failure on the second row proves the HTTP transaction
    // rolls back already successful inserts, not merely pre-validation failures.
    await db.pg.exec(`create function edunexus.synthetic_import_failure() returns trigger language plpgsql as $$
      begin if exists(select 1 from edunexus.learners where id=new.learner_id and first_name='${failureName}') then
        raise exception using errcode='23514',message='Synthetic later-row rejection'; end if; return new; end $$;
      create trigger synthetic_import_failure before insert on edunexus.enrollments for each row execute function edunexus.synthetic_import_failure();`);
    const before = await counts();
    try { expect((await commit(r.body.data.preview_id, b)).status).toBe(409); expect(await counts()).toEqual(before); }
    finally { await db.pg.exec('drop trigger synthetic_import_failure on edunexus.enrollments; drop function edunexus.synthetic_import_failure();'); }
    expect((await request(app).get(`/api/v1/roster-imports/${r.body.data.preview_id}`).set(header())).body.data.receipt).toBeNull();
    expect((await commit(r.body.data.preview_id, b)).status).toBe(201);
  });
  it('handles a full 50-row roster and records candidate access without CSV content in metadata logs', async () => {
    const people = Array.from({ length: 50 }, () => profile()), b = input(...people), r = await preview(b);
    expect(r.body.data.can_commit).toBe(true);
    const committed = await commit(r.body.data.preview_id, b); expect(committed.status, JSON.stringify(committed.body)).toBe(201); expect(committed.body.data.items).toHaveLength(50);
    const again = await preview(b);
    expect(again.body.data.can_commit).toBe(false);
    const access = (await db.pg.query<{ resource: string; record_ids: string[] }>('select resource,record_ids from edunexus.record_access_events where request_id=$1', [again.body.requestId])).rows;
    expect(access).toHaveLength(1); expect((access[0]!.record_ids as unknown[])).toHaveLength(50);
    expect(JSON.stringify(access)).not.toContain(people[0]!.first_name);
  });
  it('records LRN correction values, manager, request and reason, with version protection and protected history', async () => {
    const p = profile(next(), lrn()), existing = await create(p), corrected = lrn();
    const body = { version: 1, previous_lrn: p.lrn, corrected_lrn: corrected, reason: 'Synthetic official record checked.', reviewed: true };
    const url = `/api/v1/learners/${existing.id}/lrn-corrections`;
    const r = await request(app).post(url).set(header(ids.officer)).send(body);
    expect(r.status, JSON.stringify(r.body)).toBe(201); expect(r.body.data).toMatchObject({ lrn: corrected, version: 2 });
    const history = await request(app).get(url).set(header());
    expect(history.body.data.items).toHaveLength(1);
    expect(history.body.data.items[0]).toMatchObject({ previous_lrn: p.lrn, corrected_lrn: corrected, reason: body.reason, actor_user_id: ids.officer, request_id: r.body.requestId, learner_version: 2 });
    expect(reviewResponses.lrnCorrectionHistory!.safeParse(history.body.data).success).toBe(true);
    expect((await request(app).post(url).set(header()).send(body)).body.error.code).toBe('VERSION_CONFLICT');
    expect((await request(app).get(url).set(header(ids.teacher))).status).toBe(403);
    expect(await db.asUser(ids.teacher, tx => tx.query('select * from edunexus.lrn_corrections'))).toEqual([]);
    for (const sql of ['delete from edunexus.lrn_corrections', "update edunexus.lrn_corrections set reason='Changed reason'"]) await expect(db.asUser(ids.principal, tx => tx.query(sql))).rejects.toMatchObject({ code: '42501' });
  });
  it('cannot bypass LRN review with direct writes or invented session settings, and competing corrections cannot lose history', async () => {
    const p = profile(next(), lrn()), existing = await create(p), url = `/api/v1/learners/${existing.id}/lrn-corrections`;
    await expect(db.asUser(ids.principal, async tx => {
      await tx.query("select set_config('edunexus.allow_lrn_correction','true',true)");
      await tx.query('update edunexus.learners set lrn=$1 where id=$2', [lrn(), existing.id]);
    })).rejects.toMatchObject({ code: '23514' });
    const body = { version: 1, previous_lrn: p.lrn, reason: 'Synthetic document review completed.', reviewed: true };
    expect((await request(app).post(url).set(header(ids.teacher)).send({ ...body, corrected_lrn: lrn() })).status).toBe(403);
    const results = await Promise.all([lrn(), lrn()].map(corrected_lrn => request(app).post(url).set(header()).send({ ...body, corrected_lrn })));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await request(app).get(url).set(header())).body.data.items).toHaveLength(1);
  });
  it('rejects duplicate LRNs, unchanged values and missing review without leaving a correction record', async () => {
    const p = profile(next(), lrn()), existing = await create(p), other = await create(profile(next(), lrn()));
    const url = `/api/v1/learners/${existing.id}/lrn-corrections`, body = { version: 1, previous_lrn: p.lrn, corrected_lrn: other.lrn, reason: 'Synthetic source reviewed correctly.', reviewed: true };
    expect((await request(app).post(url).set(header()).send(body)).body.error.code).toBe('ALREADY_EXISTS');
    expect((await request(app).post(url).set(header()).send({ ...body, corrected_lrn: p.lrn })).status).toBe(409);
    expect((await request(app).post(url).set(header()).send({ ...body, reviewed: false })).status).toBe(422);
    expect((await request(app).get(url).set(header())).body.data.items).toEqual([]);
    expect((await request(app).get(`/api/v1/learners/${existing.id}`).set(header())).body.data.version).toBe(1);
  });
  it('blocks imports into a closed year and invalid enrollment dates', async () => {
    const b = input(profile());
    expect((await preview({ ...b, enrolled_on: '2025-05-31' })).body.data.issues[0].code).toBe('INVALID_ENROLLMENT_DATE');
    const r = await preview(b);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic period','2025-06-01','2026-03-31')", [year]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1", [year]);
    expect((await commit(r.body.data.preview_id, b)).body.error.code).toBe('PREVIEW_CHANGED');
    expect((await preview(b)).body.data.issues[0].code).toBe('YEAR_CLOSED');
  });
});
