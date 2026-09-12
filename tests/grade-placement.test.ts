import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { placementResponses } from '../src/modules/grade-placement/contracts.js';
import { timelineResponses } from '../src/modules/enrollment-timeline/contracts.js';

describe('Section 2B.5 reviewed whole-year grade placement', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApp>;
  const year = randomUUID(), oldYear = randomUUID(), a1 = randomUUID(), b1 = randomUUID(), a2 = randomUUID(), b2 = randomUUID(), kindergarten = randomUUID(), sixth = randomUUID(), oldSection = randomUUID();
  const reason = 'Synthetic school placement records checked and corrected.';
  const headers = (actor = ids.principal) => ({ Authorization: `Bearer ${actor}` });
  const post = (url: string, body: object, actor = ids.principal) => request(app).post(url).set(headers(actor)).send(body);
  const get = (url: string, actor = ids.principal) => request(app).get(url).set(headers(actor));
  const initial = (section_id = a2, effective_on = '2025-06-01') => ({ event_type: 'enrolled', effective_on, section_id, reason: 'regular' });
  const endpoint = (id: string) => `/api/v1/enrollments/${id}/placement`;
  const make = async (old = false) => {
    const learner = randomUUID();
    await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Synthetic',$2,'2018-01-01','female')", [learner, learner]);
    const rows = await db.asUser(ids.principal, async tx => {
      await tx.query("select set_config('edunexus.request_id',$1,true)", [randomUUID()]);
      return tx.query("select * from edunexus.enroll_learner($1,$2,$3,'regular')", [learner, old ? oldSection : a1, old ? '2024-06-01' : '2025-06-01']);
    });
    return { id: String(rows[0]!.id), learner };
  };
  const preview = (id: string, entries: object[] = [initial()], extra: object = {}, actor = ids.principal) => post(endpoint(id) + '/preview', { version: 1, grade_level: 2, entries, reason, ...extra }, actor);
  const commit = (id: string, p: any, actor = ids.principal, extra: object = {}) => post(endpoint(id) + '/corrections', { version: p.version, grade_level: p.corrected_grade_level, entries: p.after_entries, reason: p.reason, review_hash: p.review_hash, reviewed: true, ...extra }, actor);
  const correct = async (id: string, entries = [initial()], extra: object = {}) => {
    const p = await preview(id, entries, extra); expect(p.status, JSON.stringify(p.body)).toBe(201);
    const r = await commit(id, p.body.data); expect(r.status, JSON.stringify(r.body)).toBe(201); return r;
  };
  const counts = async () => (await db.pg.query(`select (select count(*)::int from edunexus.enrollment_corrections) as corrections,
    (select count(*)::int from edunexus.enrollment_correction_sections) as refs,(select count(*)::int from edunexus.enrollment_events) as movements,
    (select count(*)::int from edunexus.audit_events) as audits`)).rows;
  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token, aal: 'aal2' }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2025,'2025-06-01','2026-03-31'),($2,2024,'2024-06-01','2025-03-31')", [year, oldYear]);
    for (const [id, y, grade, actor] of [[a1,year,1,ids.teacher],[b1,year,1,ids.teacher],[a2,year,2,ids.otherTeacher],[b2,year,2,ids.otherTeacher],[kindergarten,year,0,ids.otherTeacher],[sixth,year,6,ids.otherTeacher],[oldSection,oldYear,1,ids.teacher]]) {
      await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,$3,$4,$5)', [id, y, grade, `Synthetic ${id}`, actor]);
    }
  });
  afterAll(async () => db?.database.close());

  it('previews without mutation and corrects grade and section while preserving learner, year, dates and original history', async () => {
    const e = await make(), before = await counts(), original = (await db.pg.query('select * from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows;
    const p = await preview(e.id, [initial()], {}, ids.officer); expect(p.status, JSON.stringify(p.body)).toBe(201);
    expect(placementResponses.placementPreview!.safeParse(p.body.data).success).toBe(true); expect(await counts()).toEqual(before);
    expect(p.body.data).toMatchObject({ correction_kind: 'placement', previous_grade_level: 1, corrected_grade_level: 2, before_entries: [initial(a1)], after_entries: [initial()] });
    const r = await commit(e.id, p.body.data, ids.officer); expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(placementResponses.placementCorrect!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({ correction_kind: 'placement', previous_grade_level: 1, corrected_grade_level: 2, actor_user_id: ids.officer, request_id: r.body.requestId, enrollment_version: 2 });
    expect((await get(`/api/v1/enrollments/${e.id}`)).body.data).toMatchObject({ grade_level: 2, section_id: a2, academic_year_id: year, recorded_learner_id: e.learner, enrolled_on: '2025-06-01', version: 2 });
    expect((await db.pg.query('select * from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows).toEqual(original);
    expect((await get(`/api/v1/learners/${e.learner}`, ids.teacher)).status).toBe(404); expect((await get(`/api/v1/learners/${e.learner}`, ids.otherTeacher)).status).toBe(200);
    expect((await get(`/api/v1/enrollments/${e.id}/history`)).body.data).toMatchObject({ interpretation: 'original_movements', current_grade_level: 2, academic_year_id: year, has_corrections: true });
  });
  it('maps the complete effective timeline, retaining withdrawals, reentries and dates', async () => {
    const e = await make();
    await post(`/api/v1/enrollments/${e.id}/movements`, { version: 1, action: 'withdrawn', effective_on: '2025-07-01', exit_reason: 'transfer_out' });
    await post(`/api/v1/enrollments/${e.id}/movements`, { version: 2, action: 'reentered', effective_on: '2025-08-01', section_id: b1 });
    const current = (await get(`/api/v1/enrollments/${e.id}/timeline`)).body.data.entries;
    const entries = current.map((v: any) => ({ ...v, section_id: v.section_id === a1 ? a2 : b2 }));
    await correct(e.id, entries, { version: 3 });
    const timeline = (await get(`/api/v1/enrollments/${e.id}/timeline`)).body.data;
    expect(timeline).toMatchObject({ grade_level: 2, version: 4, entries });
    expect((await db.pg.query('select id from edunexus.enrollment_events where enrollment_id=$1', [e.id])).rows).toHaveLength(3);
  });
  it('supports later movements, timeline corrections and a reviewed reversal of the placement', async () => {
    const e = await make(); await correct(e.id);
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 2, action: 'reassigned', effective_on: '2025-07-01', section_id: b1 })).status).toBe(409);
    expect((await post(`/api/v1/enrollments/${e.id}/movements`, { version: 2, action: 'reassigned', effective_on: '2025-07-01', section_id: b2 })).status).toBe(201);
    const entries = [initial(a2, '2025-06-02'), { event_type: 'reassigned', effective_on: '2025-07-01', section_id: b2, reason: 'section_change' }];
    const body = { version: 3, entries, reason }, p = await post(`/api/v1/enrollments/${e.id}/timeline/preview`, body);
    expect(p.status).toBe(201); expect(p.body.data).toMatchObject({ correction_kind: 'timeline', previous_grade_level: 2, corrected_grade_level: 2 });
    expect((await post(`/api/v1/enrollments/${e.id}/timeline/corrections`, { ...body, review_hash: p.body.data.review_hash, reviewed: true })).status).toBe(201);
    await correct(e.id, entries.map(v => ({ ...v, section_id: v.section_id === a2 ? a1 : b1 })), { version: 4, grade_level: 1 });
    const all = (await get(`/api/v1/enrollments/${e.id}/timeline/corrections`)).body.data;
    expect(all.items.map((v: any) => v.correction_kind)).toEqual(['placement','timeline','placement']);
    expect(timelineResponses.timelineCorrectionHistory!.safeParse(all).success).toBe(true);
    const history = await get(endpoint(e.id) + '/corrections?limit=1'); expect(placementResponses.placementHistory!.safeParse(history.body.data).success).toBe(true);
    expect(history.body.data.pagination.next_before_version).toBe(5);
    expect((await get(endpoint(e.id) + '/corrections?before_version=5')).body.data.items.map((v: any) => v.enrollment_version)).toEqual([2]);
    expect((await db.pg.query('select enrollment_version from edunexus.enrollment_events where enrollment_id=$1 order by enrollment_version', [e.id])).rows).toEqual([{enrollment_version:1},{enrollment_version:3}]);
  });
  it('rejects altered dates, added/removed events, changed reasons and invalid section mapping', async () => {
    const e = await make();
    for (const entries of [[initial(a2,'2025-06-02')], [{ ...initial(), reason: 'transfer_in' }], [initial(), {event_type:'withdrawn',effective_on:'2025-07-01',section_id:a2,reason:'withdrawal'}]]) {
      expect((await preview(e.id, entries)).body.error.code).toBe('PLACEMENT_HISTORY_CHANGED');
    }
    expect((await preview(e.id, [initial()], { grade_level: 1 })).body.error.code).toBe('PLACEMENT_UNCHANGED');
    for (const section of [a1,oldSection,randomUUID()]) expect((await preview(e.id, [initial(section)])).body.error.code).toBe('TIMELINE_SECTION');
    await post(`/api/v1/enrollments/${e.id}/movements`, { version: 1, action: 'reassigned', effective_on: '2025-07-01', section_id: b1 });
    expect((await preview(e.id, [initial()], {version:2})).body.error.code).toBe('PLACEMENT_HISTORY_CHANGED');
    expect((await preview(e.id, [initial(), {event_type:'reassigned',effective_on:'2025-07-01',section_id:a2,reason:'section_change'}], {version:2})).body.error.code).toBe('TIMELINE_TRANSITION');
  });
  it('handles Kindergarten and Grade 6 explicitly while rejecting invalid grades and malformed requests', async () => {
    for (const [grade, section] of [[0,kindergarten],[6,sixth]] as const) {
      const e = await make(); await correct(e.id,[initial(section)],{grade_level:grade}); expect((await get(`/api/v1/enrollments/${e.id}`)).body.data.grade_level).toBe(grade);
    }
    const e = await make();
    for (const grade of [-1,7,1.5,null,'2']) expect((await preview(e.id,[initial()],{grade_level:grade})).status).toBe(422);
    expect((await preview(e.id,[])).status).toBe(422); expect((await preview(e.id,[{...initial(),extra:true}])).status).toBe(422);
    expect((await get(endpoint(e.id)+'/corrections?limit=11')).status).toBe(422);
  });
  it('binds review to actor, reason, both sets of sections, learner and school-year context', async () => {
    const e = await make(); let p = await preview(e.id);
    expect((await commit(e.id,p.body.data,ids.officer)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
    expect((await commit(e.id,p.body.data,ids.principal,{reason:'Another checked synthetic record reason.'})).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
    expect((await commit(e.id,p.body.data,ids.principal,{reviewed:false})).status).toBe(422);
    for (const section of [a1,a2]) {
      await db.pg.query("update edunexus.sections set name=name || ' revised' where id=$1",[section]);
      expect((await commit(e.id,p.body.data)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED'); p=await preview(e.id);
    }
    await db.pg.query("update edunexus.learners set first_name='Synthetic revised' where id=$1",[e.learner]);
    expect((await commit(e.id,p.body.data)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');p=await preview(e.id);
    await db.pg.query('update edunexus.academic_years set status=status where id=$1',[year]);
    expect((await commit(e.id,p.body.data)).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
  });
  it('uses retained identity and invalidates earlier timeline and record-state reviews', async () => {
    const e=await make(), c=randomUUID();
    await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Synthetic','Retained','2018-01-01','female')",[c]);
    const body={canonical_id:c,duplicate_id:e.learner,canonical_version:1,duplicate_version:1,action:'link',reason};
    const ip=await post('/api/v1/learner-reconciliations/preview',body);
    expect((await post('/api/v1/learner-reconciliations',{...body,review_hash:ip.body.data.review_hash,reviewed:true})).status).toBe(201);
    const p=await preview(e.id);expect(p.body.data).toMatchObject({learner_id:c,recorded_learner_id:e.learner,learner_version:2});
    const vbody={version:1,action:'void',reason_code:'incorrect_entry',reason};const vp=await post(`/api/v1/enrollments/${e.id}/record-review/preview`,vbody);
    const tBody={version:1,reason,entries:[initial(a1,'2025-06-02')]};const tp=await post(`/api/v1/enrollments/${e.id}/timeline/preview`,tBody);
    expect((await commit(e.id,p.body.data)).status).toBe(201);
    expect((await post(`/api/v1/enrollments/${e.id}/record-review`,{...vbody,review_hash:vp.body.data.review_hash,reviewed:true})).body.error.code).toBe('VERSION_CONFLICT');
    expect((await post(`/api/v1/enrollments/${e.id}/timeline/corrections`,{...tBody,review_hash:tp.body.data.review_hash,reviewed:true})).body.error.code).toBe('VERSION_CONFLICT');
  });
  it('requires manager authorization and denies private helper or direct grade/journal writes', async () => {
    const e=await make(),p=await preview(e.id);
    for(const actor of [ids.teacher,ids.otherTeacher,ids.inactive,ids.outsider]) {
      expect((await preview(e.id,[initial()],{},actor)).status).toBe(403);expect((await commit(e.id,p.body.data,actor)).status).toBe(403);expect((await get(endpoint(e.id)+'/corrections',actor)).status).toBe(403);
    }
    expect((await request(app).post(endpoint(e.id)+'/preview').send({})).status).toBe(401);
    for(const actor of [ids.teacher,ids.inactive,null]) {
      await expect(db.asUser(actor,tx=>tx.query('select edunexus.preview_enrollment_placement($1,1,2,$2::jsonb,$3)',[e.id,JSON.stringify([initial()]),reason]))).rejects.toMatchObject({code:'42501'});
      await expect(db.asUser(actor,tx=>tx.query('select edunexus.correct_enrollment_placement($1,1,2,$2::jsonb,$3,$4)',[e.id,JSON.stringify([initial()]),reason,'0'.repeat(64)]))).rejects.toMatchObject({code:'42501'});
    }
    for(const sql of ['select edunexus.preview_enrollment_revision($1,1,$2::jsonb,$3,2)','select edunexus.apply_enrollment_revision($1,1,$2::jsonb,$3,$4,2)']) await expect(db.asUser(ids.principal,tx=>tx.query(sql,sql.includes('$4')?[e.id,JSON.stringify([initial()]),reason,'0'.repeat(64)]:[e.id,JSON.stringify([initial()]),reason]))).rejects.toMatchObject({code:'42501'});
    for(const sql of ["update edunexus.enrollments set grade_level=2", "update edunexus.enrollment_corrections set correction_kind='placement'",'delete from edunexus.enrollment_correction_sections']) await expect(db.asUser(ids.principal,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
    await expect(db.pg.query('update edunexus.enrollments set grade_level=2,section_id=$2 where id=$1',[e.id,a2])).rejects.toMatchObject({code:'42501'});
    await expect(db.pg.query('update edunexus.enrollments set academic_year_id=$2 where id=$1',[e.id,oldYear])).rejects.toMatchObject({code:'23514'});
    await expect(db.asUser(ids.principal,tx=>tx.query('select edunexus.preview_enrollment_placement($1,1,null,$2::jsonb,$3)',[e.id,JSON.stringify([initial()]),reason]))).rejects.toMatchObject({code:'23514'});
  });
  it('rolls back snapshot, section references, grade, roster and audit on a late projection failure', async () => {
    const e=await make(),p=await preview(e.id),before=await counts();
    await db.pg.exec(`create function edunexus.synthetic_placement_failure() returns trigger language plpgsql as $$ begin if new.id='${e.id}'::uuid then raise exception using errcode='23514',message='Synthetic failure'; end if; return new; end $$;
      create trigger synthetic_placement_failure before update on edunexus.enrollments for each row execute function edunexus.synthetic_placement_failure();`);
    try {expect((await commit(e.id,p.body.data)).status).toBe(409);expect(await counts()).toEqual(before);expect((await get(`/api/v1/enrollments/${e.id}`,ids.teacher)).body.data).toMatchObject({grade_level:1,version:1});}
    finally {await db.pg.exec('drop trigger synthetic_placement_failure on edunexus.enrollments;drop function edunexus.synthetic_placement_failure();');}
    expect((await commit(e.id,p.body.data)).status).toBe(201);
  });
  it('serializes competing corrections and rejects stale retries', async () => {
    const e=await make(),a=await preview(e.id),b=await preview(e.id,[initial(sixth)],{grade_level:6});
    const r=await Promise.all([commit(e.id,a.body.data),commit(e.id,b.body.data)]);expect(r.map(v=>v.status).sort()).toEqual([201,409]);
    expect((await commit(e.id,a.body.data)).body.error.code).toBe('VERSION_CONFLICT');expect((await get(endpoint(e.id)+'/corrections')).body.data.items).toHaveLength(1);
  });
  it('retains section references, records disclosures, and does not copy reasons into general audit', async () => {
    const e=await make(),p=await preview(e.id),r=await commit(e.id,p.body.data),h=await get(endpoint(e.id)+'/corrections');
    for(const requestId of [p.body.requestId,r.body.requestId,h.body.requestId]) expect((await db.pg.query('select record_ids from edunexus.record_access_events where request_id=$1',[requestId])).rows).toEqual([{record_ids:[e.id]}]);
    await expect(db.pg.query('delete from edunexus.sections where id=$1',[a1])).rejects.toMatchObject({code:'23001'});
    const refs=(await db.pg.query('select section_id from edunexus.enrollment_correction_sections where correction_id=$1',[r.body.data.id])).rows;expect(refs.map((v:any)=>v.section_id)).toEqual(expect.arrayContaining([a1,a2]));
    expect(JSON.stringify((await db.pg.query('select * from edunexus.audit_events where request_id=$1',[r.body.requestId])).rows)).not.toContain(reason);
  });
  it('accepts a complete 260-entry placement review while keeping other request limits intact', async () => {
    const e=await make();
    const entries=Array.from({length:260},(_,i)=>({event_type:i?'reassigned':'enrolled',effective_on:new Date(Date.UTC(2025,5,1+i)).toISOString().slice(0,10),section_id:i%2?b1:a1,reason:i?'section_change':'regular'}));
    const body={version:1,entries,reason},p=await post(`/api/v1/enrollments/${e.id}/timeline/preview`,body);
    expect((await post(`/api/v1/enrollments/${e.id}/timeline/corrections`,{...body,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
    const mapped=entries.map(v=>({...v,section_id:v.section_id===a1?a2:b2}));await correct(e.id,mapped,{version:2});
    expect((await get(`/api/v1/enrollments/${e.id}/timeline`)).body.data.entries).toHaveLength(260);
    expect((await post(endpoint(e.id)+'/preview',{text:'x'.repeat(262145)})).status).toBe(413);
    expect((await post('/api/v1/learners',{text:'x'.repeat(33000)})).status).toBe(413);
  });
  it('keeps legacy unknown grade metadata nullable and prevents changes to voided and closed-year records', async () => {
    const e=await make(),tBody={version:1,reason,entries:[initial(a1,'2025-06-02')]},tp=await post(`/api/v1/enrollments/${e.id}/timeline/preview`,tBody);
    const corrected=await post(`/api/v1/enrollments/${e.id}/timeline/corrections`,{...tBody,review_hash:tp.body.data.review_hash,reviewed:true});
    await db.pg.query('update edunexus.enrollment_corrections set previous_grade_level=null,corrected_grade_level=null where id=$1',[corrected.body.data.id]);
    const legacy=await get(`/api/v1/enrollments/${e.id}/timeline/corrections`);expect(timelineResponses.timelineCorrectionHistory!.safeParse(legacy.body.data).success).toBe(true);expect(legacy.body.data.items[0].previous_grade_level).toBeNull();
    const vbody={version:2,action:'void',reason_code:'incorrect_entry',reason},vp=await post(`/api/v1/enrollments/${e.id}/record-review/preview`,vbody);
    expect((await post(`/api/v1/enrollments/${e.id}/record-review`,{...vbody,review_hash:vp.body.data.review_hash,reviewed:true})).status).toBe(201);
    expect((await preview(e.id,[initial(a2,'2025-06-02')],{version:3})).body.error.code).toBe('VOIDED_ENROLLMENT_READ_ONLY');
    const closed=await make(true);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2024-06-01','2025-03-31')",[oldYear]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1",[oldYear]);await db.pg.query("update edunexus.academic_years set status='closed' where id=$1",[oldYear]);
    expect((await preview(closed.id,[initial(a2,'2024-06-01')])).body.error.code).toBe('YEAR_CLOSED');expect((await get(endpoint(closed.id)+'/corrections')).status).toBe(200);
  });
});
