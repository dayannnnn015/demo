import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { identityResponses } from '../src/modules/learner-identity/contracts.js';

describe('Section 2B.3 reviewed learner identity links', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApp>;
  const year = randomUUID(), oldYear = randomUUID(), section = randomUUID(), oldSection = randomUUID();
  const reason = 'Synthetic school records verified as the same learner.';
  const headers = (actor = ids.principal) => ({ Authorization: `Bearer ${actor}` });
  const post = (url: string, body: object, actor = ids.principal) => request(app).post(url).set(headers(actor)).send(body);
  const get = (url: string, actor = ids.principal) => request(app).get(url).set(headers(actor));
  const profile = async (extra: Record<string, unknown> = {}) => {
    const id = randomUUID();
    await db.pg.query('insert into edunexus.learners(id,first_name,last_name,birth_date,sex,lrn) values($1,$2,$3,$4,$5,$6)', [id, 'Synthetic', extra.last_name ?? id, extra.birth_date ?? '2018-01-01', extra.sex ?? 'female', extra.lrn ?? null]);
    return id;
  };
  const pair = async () => ({ c: await profile(), d: await profile() });
  const proposal = async (c: string, d: string, action = 'link', actor = ids.principal) => {
    const rows = (await db.pg.query<{id: string; version: number}>('select id,version from edunexus.learners where id in ($1,$2)', [c,d])).rows;
    return post('/api/v1/learner-reconciliations/preview', {canonical_id:c,duplicate_id:d,canonical_version:rows.find(r=>r.id===c)!.version,duplicate_version:rows.find(r=>r.id===d)!.version,action,reason}, actor);
  };
  const commit = (p: any, actor = ids.principal, extra: object = {}) => post('/api/v1/learner-reconciliations', {canonical_id:p.canonical.id,duplicate_id:p.duplicate.id,canonical_version:p.canonical.version,duplicate_version:p.duplicate.version,action:p.action,reason:p.reason,review_hash:p.review_hash,reviewed:true,...extra}, actor);
  const enroll = async (id: string, old = false) => {
    const r = await post('/api/v1/enrollments', {learner_id:id,section_id:old?oldSection:section,enrolled_on:old?'2024-06-01':'2025-06-01'});
    expect(r.status,JSON.stringify(r.body)).toBe(201); return r.body.data.id as string;
  };
  const link = async (c: string,d: string) => {
    const p=await proposal(c,d); expect(p.status,JSON.stringify(p.body)).toBe(201);
    expect(p.body.data.can_commit,JSON.stringify(p.body)).toBe(true);
    const r=await commit(p.body.data); expect(r.status,JSON.stringify(r.body)).toBe(201);return r;
  };
  const counts = async () => (await db.pg.query(`select (select count(*)::int from edunexus.learner_identity_events) as identities,
    (select count(*)::int from edunexus.enrollment_events) as movements,(select count(*)::int from edunexus.audit_events) as audits`)).rows;
  beforeAll(async () => {
    db=await testDatabase();
    app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token};}}});
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2025,'2025-06-01','2026-03-31'),($2,2024,'2024-06-01','2025-03-31')",[year,oldYear]);
    for(const [id,y] of [[section,year],[oldSection,oldYear]]) await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,$3,$4)',[id,y,`Synthetic ${id}`,ids.teacher]);
  });
  afterAll(async()=>db?.database.close());

  it('previews without changing records, then preserves original enrollment ownership and movement history',async()=>{
    const {c,d}=await pair(), a=await enroll(c,true),b=await enroll(d);
    const before=(await db.pg.query('select * from edunexus.enrollments where id in ($1,$2) order by id',[a,b])).rows;
    const events=(await db.pg.query('select * from edunexus.enrollment_events where enrollment_id in ($1,$2) order by id',[a,b])).rows;
    const total=await counts(),p=await proposal(c,d);
    expect(p.status).toBe(201);expect(identityResponses.identityPreview!.safeParse(p.body.data).success).toBe(true);
    expect(p.body.data.enrollments).toHaveLength(2);expect(await counts()).toEqual(total);
    const r=await commit(p.body.data);expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(identityResponses.identityReconcile!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({canonical_version:2,duplicate_version:2,request_id:r.body.requestId,actor_user_id:ids.principal});
    expect((await db.pg.query('select * from edunexus.enrollments where id in ($1,$2) order by id',[a,b])).rows).toEqual(before);
    expect((await db.pg.query('select * from edunexus.enrollment_events where enrollment_id in ($1,$2) order by id',[a,b])).rows).toEqual(events);
    expect((await get(`/api/v1/enrollments/${b}`)).body.data).toMatchObject({learner_id:c,recorded_learner_id:d,version:1});
    expect((await get(`/api/v1/enrollments?learner_id=${c}`)).body.data.items).toHaveLength(2);
  });
  it('shows the retained profile to assigned teachers without exposing the linked profile or other rosters',async()=>{
    const {c,d}=await pair();await enroll(d);await link(c,d);
    expect((await get(`/api/v1/learners/${c}`,ids.teacher)).status).toBe(200);
    expect((await get(`/api/v1/learners/${d}`,ids.teacher)).status).toBe(404);
    expect((await get(`/api/v1/learners/${c}`,ids.otherTeacher)).status).toBe(404);
    expect((await get(`/api/v1/learners/${d}`)).body.data.merged_into).toBe(c);
    expect((await get(`/api/v1/learners?search=${d}`)).body.data.items).toHaveLength(0);
    expect((await get(`/api/v1/learners?search=${d}&include_linked=true`)).body.data.items).toHaveLength(1);
    expect((await get(`/api/v1/learners?search=${d}&include_linked=true`,ids.teacher)).body.data.items).toHaveLength(0);
    expect(await db.asUser(ids.otherTeacher,tx=>tx.query('select edunexus.visible_learner_identity($1) as id',[d]))).toEqual([{id:null}]);
  });
  it('blocks overlapping years even after withdrawal and blocks assigned source LRNs and identity field conflicts',async()=>{
    const {c,d}=await pair();await enroll(c);const e=await enroll(d);
    await post(`/api/v1/enrollments/${e}/movements`,{version:1,action:'withdrawn',effective_on:'2025-07-01',exit_reason:'withdrawal'});
    const p=await proposal(c,d);expect(p.body.data).toMatchObject({can_commit:false,review_hash:null,issues:['OVERLAPPING_ENROLLMENT_YEARS'],conflicting_year_ids:[year]});
    expect((await commit(p.body.data,ids.principal,{review_hash:'0'.repeat(64)})).body.error.code).toBe('IDENTITY_CONFLICT');
    for(const [extra,issue] of [[{lrn:'123456789012'},'SOURCE_HAS_LRN'],[{birth_date:'2018-01-02'},'IDENTITY_FIELDS_DIFFER'],[{sex:'male'},'IDENTITY_FIELDS_DIFFER']] as const){
      const other=await profile(extra);expect((await proposal(c,other)).body.data.issues).toContain(issue);
    }
  });
  it('freezes linked profiles and enforces one annual enrollment across the identity group',async()=>{
    const {c,d}=await pair();await enroll(d);await link(c,d);
    await expect(db.asUser(ids.principal,tx=>tx.query("update edunexus.learners set first_name='Changed' where id=$1",[d]))).rejects.toMatchObject({code:'P0201'});
    await expect(db.asUser(ids.principal,tx=>tx.query("update edunexus.learners set lrn='123456789013' where id=$1",[d]))).rejects.toMatchObject({code:'P0201'});
    const newAlias=await post('/api/v1/enrollments',{learner_id:d,section_id:oldSection,enrolled_on:'2024-06-01'});expect(newAlias.body.error.code).toBe('LINKED_LEARNER_READ_ONLY');
    expect((await post('/api/v1/enrollments',{learner_id:c,section_id:section,enrolled_on:'2025-06-01'})).status).toBe(409);
    await expect(db.asUser(ids.principal,tx=>tx.query("update edunexus.learners set birth_date='2025-06-01' where id=$1",[c]))).rejects.toMatchObject({code:'23514'});
  });
  it('reverses links without undoing subsequent movements and restores the original teacher-visible identity',async()=>{
    const {c,d}=await pair(),e=await enroll(d);await link(c,d);
    expect((await post(`/api/v1/enrollments/${e}/movements`,{version:1,action:'withdrawn',effective_on:'2025-07-01',exit_reason:'withdrawal'})).status).toBe(201);
    expect((await post(`/api/v1/enrollments/${e}/movements`,{version:2,action:'reentered',effective_on:'2025-08-01',section_id:section})).status).toBe(201);
    const before=(await db.pg.query('select * from edunexus.enrollments where id=$1',[e])).rows;
    const p=await proposal(c,d,'unlink',ids.officer),r=await commit(p.body.data,ids.officer);expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect((await db.pg.query('select * from edunexus.enrollments where id=$1',[e])).rows).toEqual(before);
    expect((await get(`/api/v1/enrollments/${e}`)).body.data).toMatchObject({learner_id:d,recorded_learner_id:d,version:3});
    expect((await get(`/api/v1/learners/${d}`,ids.teacher)).status).toBe(200);expect((await get(`/api/v1/learners/${c}`,ids.teacher)).status).toBe(404);
    const h=await get(`/api/v1/learners/${d}/identity-history?limit=1`);expect(identityResponses.identityHistory!.safeParse(h.body.data).success).toBe(true);
    expect(h.body.data.items[0].action).toBe('unlink');expect(h.body.data.pagination.has_more).toBe(true);
    expect((await get(`/api/v1/learners/${d}/identity-history?offset=1`)).body.data.items[0].action).toBe('link');
  });
  it('rejects chains, cycles, relinking and sources that already retain another profile',async()=>{
    const {c,d}=await pair(),third=await profile();await link(c,d);
    expect((await proposal(d,c)).body.data.issues).toEqual(expect.arrayContaining(['TARGET_IS_LINKED','SOURCE_HAS_LINKS']));
    expect((await proposal(third,d)).body.data.issues).toContain('SOURCE_IS_LINKED');
    expect((await proposal(third,c)).body.data.issues).toContain('SOURCE_HAS_LINKS');
    expect((await proposal(third,d,'unlink')).body.data.issues).toContain('LINK_NOT_FOUND');
    await link(c,third);
    expect((await proposal(c,d,'unlink')).body.data.member_ids).toHaveLength(3);
  });
  it('binds review to actor, reason, profile versions, school-year state and enrollment changes',async()=>{
    const {c,d}=await pair(),e=await enroll(d);let p=await proposal(c,d);
    expect((await commit(p.body.data,ids.officer)).body.error.code).toBe('IDENTITY_REVIEW_CHANGED');
    expect((await commit(p.body.data,ids.principal,{reason:'Another independently checked reason.'})).body.error.code).toBe('IDENTITY_REVIEW_CHANGED');
    expect((await commit(p.body.data,ids.principal,{reviewed:false})).status).toBe(422);
    await db.pg.query('update edunexus.academic_years set status=status where id=$1',[year]);
    expect((await commit(p.body.data)).body.error.code).toBe('IDENTITY_REVIEW_CHANGED');p=await proposal(c,d);
    await post(`/api/v1/enrollments/${e}/movements`,{version:1,action:'withdrawn',effective_on:'2025-07-01',exit_reason:'withdrawal'});
    expect((await commit(p.body.data)).body.error.code).toBe('IDENTITY_REVIEW_CHANGED');p=await proposal(c,d);
    await db.pg.query("update edunexus.learners set first_name='Synthetic revised' where id=$1",[c]);
    expect((await commit(p.body.data)).body.error.code).toBe('VERSION_CONFLICT');
  });
  it('invalidates timeline reviews when linking and binds subsequent review to the retained profile',async()=>{
    const {c,d}=await pair(),e=await enroll(d);
    const body={version:1,reason,entries:[{event_type:'enrolled',effective_on:'2025-06-02',section_id:section,reason:'regular'}]};
    const p=await post(`/api/v1/enrollments/${e}/timeline/preview`,body);await link(c,d);
    expect((await post(`/api/v1/enrollments/${e}/timeline/corrections`,{...body,review_hash:p.body.data.review_hash,reviewed:true})).body.error.code).toBe('TIMELINE_REVIEW_CHANGED');
    const fresh=await post(`/api/v1/enrollments/${e}/timeline/preview`,body);expect(fresh.body.data).toMatchObject({learner_id:c,recorded_learner_id:d,learner_version:2});
    expect((await post(`/api/v1/enrollments/${e}/timeline/corrections`,{...body,review_hash:fresh.body.data.review_hash,reviewed:true})).status).toBe(201);
    const reversed=await proposal(c,d,'unlink');expect((await commit(reversed.body.data)).status).toBe(201);
    expect((await get(`/api/v1/enrollments/${e}/timeline`)).body.data.entries).toEqual(body.entries);
  });
  it('requires manager authorization in both API and SQL and denies direct identity or history writes',async()=>{
    const {c,d}=await pair(),p=await proposal(c,d);
    for(const actor of [ids.teacher,ids.otherTeacher,ids.inactive,ids.outsider]){
      expect((await proposal(c,d,'link',actor)).status).toBe(403);expect((await commit(p.body.data,actor)).status).toBe(403);
      expect((await get(`/api/v1/learners/${c}/identity-history`,actor)).status).toBe(403);
    }
    for(const actor of [ids.teacher,ids.inactive,null]){
      await expect(db.asUser(actor,tx=>tx.query("select edunexus.preview_learner_identity($1,$2,1,1,'link',$3)",[c,d,reason]))).rejects.toMatchObject({code:'42501'});
      await expect(db.asUser(actor,tx=>tx.query("select edunexus.reconcile_learner_identity($1,$2,1,1,'link',$3,$4)",[c,d,reason,'0'.repeat(64)]))).rejects.toMatchObject({code:'42501'});
    }
    expect((await request(app).post('/api/v1/learner-reconciliations/preview').send({})).status).toBe(401);
    for(const sql of ['update edunexus.learners set merged_into=id','update edunexus.learners set identity_revision=1','delete from edunexus.learner_identity_events',"insert into edunexus.learner_identity_events(action) values('link')"]){
      await expect(db.asUser(ids.principal,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
    }
    expect(await db.asUser(ids.teacher,tx=>tx.query('select * from edunexus.learner_identity_events'))).toEqual([]);
  });
  it('commits only one competing proposal and rejects retries using stale versions',async()=>{
    const {c,d}=await pair(),p=await proposal(c,d),r=await Promise.all([commit(p.body.data),commit(p.body.data)]);
    expect(r.map(x=>x.status).sort()).toEqual([201,409]);expect((await commit(p.body.data)).body.error.code).toBe('VERSION_CONFLICT');
    expect((await get(`/api/v1/learners/${d}/identity-history`)).body.data.items).toHaveLength(1);
  });
  it('rolls back both profiles, identity event and audit if the final profile update fails',async()=>{
    const {c,d}=await pair(),p=await proposal(c,d),before=await counts();
    await db.pg.exec(`create function edunexus.synthetic_identity_failure() returns trigger language plpgsql as $$ begin if new.id='${c}'::uuid then raise exception using errcode='23514',message='Synthetic failure'; end if; return new; end $$;
      create trigger synthetic_identity_failure before update on edunexus.learners for each row execute function edunexus.synthetic_identity_failure();`);
    try{expect((await commit(p.body.data)).status).toBe(409);expect(await counts()).toEqual(before);expect((await get(`/api/v1/learners/${d}`)).body.data).toMatchObject({version:1,merged_into:null,identity_revision:0});}
    finally{await db.pg.exec('drop trigger synthetic_identity_failure on edunexus.learners;drop function edunexus.synthetic_identity_failure();');}
    expect((await commit(p.body.data)).status).toBe(201);
  });
  it('records disclosures with identifiers and keeps snapshots out of the general audit',async()=>{
    const {c,d}=await pair(),p=await proposal(c,d),r=await commit(p.body.data);
    const logs=(await db.pg.query('select resource,record_ids from edunexus.record_access_events where request_id in ($1,$2) order by id',[p.body.requestId,r.body.requestId])).rows;
    expect(logs).toHaveLength(2);expect(logs[0]).toMatchObject({resource:'identityPreview',record_ids:expect.arrayContaining([c,d])});
    expect(logs[1]).toMatchObject({resource:'identityReconcile',record_ids:[c,d]});
    const audit=JSON.stringify((await db.pg.query('select * from edunexus.audit_events where request_id=$1',[r.body.requestId])).rows);
    expect(audit).not.toContain('Synthetic');expect(audit).not.toContain(reason);
  });
  it('matches linked names to the retained import candidate and detects existing annual enrollment through the link',async()=>{
    const {c,d}=await pair();await enroll(d);await link(c,d);
    const input={section_id:section,enrolled_on:'2025-06-01',csv:`lrn,first_name,middle_name,last_name,name_extension,birth_date,sex\r\n,Synthetic,,${d},,2018-01-01,female`};
    const alias=await post('/api/v1/roster-imports/preview',input);
    expect(alias.status,JSON.stringify(alias.body)).toBe(201);expect(alias.body.data.rows[0].candidates.map((r:any)=>r.id)).toEqual([c]);
    const retained=await post('/api/v1/roster-imports/preview',{...input,csv:input.csv.replace(d,c),resolutions:[{row:1,action:'use_existing',learner_id:c,version:2}]});
    expect(retained.body.data.can_commit).toBe(false);expect(retained.body.data.issues.map((i:any)=>i.code)).toContain('ALREADY_ENROLLED');
    const oldVersion=await post('/api/v1/roster-imports/preview',{...input,resolutions:[{row:1,action:'use_existing',learner_id:d,version:2}]});
    expect(oldVersion.body.data.issues.map((i:any)=>i.code)).toContain('VERSION_CONFLICT');
  });
  it('blocks reversal if later corrected dates conflict with the frozen original birth date',async()=>{
    const c=await profile({birth_date:'2025-06-03'}),d=await profile({birth_date:'2025-06-03'});
    const enrolled=await post('/api/v1/enrollments',{learner_id:d,section_id:section,enrolled_on:'2025-06-05'});
    expect(enrolled.status).toBe(201);const e=enrolled.body.data.id;await link(c,d);
    await db.pg.query("update edunexus.learners set birth_date='2018-01-01' where id=$1",[c]);
    const correction={version:1,reason,entries:[{event_type:'enrolled',effective_on:'2025-06-02',section_id:section,reason:'regular'}]};
    const review=await post(`/api/v1/enrollments/${e}/timeline/preview`,correction);
    expect((await post(`/api/v1/enrollments/${e}/timeline/corrections`,{...correction,review_hash:review.body.data.review_hash,reviewed:true})).status).toBe(201);
    const p=await proposal(c,d,'unlink');expect(p.body.data).toMatchObject({can_commit:false,issues:['BIRTH_DATE_CONFLICT']});
    expect((await commit(p.body.data,ids.principal,{review_hash:'0'.repeat(64)})).body.error.code).toBe('IDENTITY_CONFLICT');
    expect((await get(`/api/v1/enrollments/${e}`)).body.data.recorded_learner_id).toBe(d);
  });
  it('can associate closed-year records while leaving those enrollments unchanged and closed',async()=>{
    const {c,d}=await pair(),e=await enroll(d,true);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2024-06-01','2025-03-31')",[oldYear]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1",[oldYear]);
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1",[oldYear]);
    const before=(await db.pg.query('select * from edunexus.enrollments where id=$1',[e])).rows;await link(c,d);
    expect((await db.pg.query('select * from edunexus.enrollments where id=$1',[e])).rows).toEqual(before);
    expect((await post(`/api/v1/enrollments/${e}/movements`,{version:1,action:'withdrawn',effective_on:'2024-07-01',exit_reason:'withdrawal'})).status).toBe(409);
  });
});
