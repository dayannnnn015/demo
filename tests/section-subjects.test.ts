import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {offeringResponses as responses} from '../src/modules/section-subjects/contracts.js';
describe('Section 4A.2 subject offerings',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>,year:string,section:string,other:string,n=1999;
  const reason='Synthetic section curriculum setup verified.';
  const post=(path:string,body:object,actor=ids.principal)=>request(app).post(path).set('Authorization',`Bearer ${actor}`).send(body);
  const get=(path:string,actor=ids.principal)=>request(app).get(path).set('Authorization',`Bearer ${actor}`);
  const catalog=async(extra:object={})=>{
    const r=await post('/api/v1/subjects',{code:'C'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic area',kind:'learning_area',grade_levels:[1],active:true,reason,...extra});expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data;
  };
  const catalogChange=async(s:any,extra:object={})=>{
    const r=await request(app).patch('/api/v1/subjects/'+s.id).set('Authorization',`Bearer ${ids.principal}`).send({version:s.version,name:s.name,kind:s.kind,grade_levels:s.grade_levels,active:s.active,reason,...extra});expect(r.status).toBe(200);return r.body.data;
  };
  const add=(s:any,extra:object={},target=section,actor=ids.principal)=>post(`/api/v1/sections/${target}/subjects`,{subject_id:s.id,subject_version:s.version,display_order:10,reason,...extra},actor);
  const make=async(s:any,target=section)=>{const r=await add(s,{},target);expect(r.status,JSON.stringify(r.body)).toBe(201);expect(responses.offeringCreate!.safeParse(r.body.data).success).toBe(true);return r.body.data;};
  const change=(r:any,extra:object={},actor=ids.principal)=>request(app).patch('/api/v1/section-subjects/'+r.id).set('Authorization',`Bearer ${actor}`).send({version:r.version,active:r.active,display_order:r.display_order,refresh_subject:false,subject_version:null,reason,...extra});
  const activate=()=>db.pg.query("update edunexus.academic_years set status='active' where id=$1",[year]);
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token,aal:'aal2'};}}});});
  beforeEach(async()=>{
    await db.pg.query('delete from edunexus.request_buckets');if(year)await db.pg.query("update edunexus.academic_years set status='closed' where id=$1 and status='active'",[year]);
    n++;year=randomUUID();section=randomUUID();other=randomUUID();await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[year,n,`${n}-06-01`,`${n+1}-03-31`]);
    for(const [id,teacher]of [[section,ids.teacher],[other,ids.otherTeacher]])await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,$3,$4)',[id,year,id,teacher]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term',$2,$3)",[year,`${n}-06-01`,`${n+1}-03-31`]);
  });
  afterAll(async()=>db?.database.close());
  it('reads an empty assigned section without creating offerings and captures selected subject revisions',async()=>{
    const r=await get(`/api/v1/sections/${section}/subjects`,ids.teacher);expect(r.status).toBe(200);expect(responses.offeringList!.safeParse(r.body.data).success).toBe(true);expect(r.body.data.items).toEqual([]);
    const s=await catalog(),off=await make(s);expect(off).toMatchObject({academic_year_id:year,section_id:section,subject_id:s.id,subject_snapshot:{version:1,name:s.name},version:1});
    const h=await get('/api/v1/section-subjects/'+off.id+'/events');expect(h.body.data.items[0]).toMatchObject({action:'create',before_snapshot:null,actor_user_id:ids.principal});
  });
  it('rejects stale catalog versions, duplicates, inactive subjects and grade mismatches',async()=>{
    const s=await catalog(),updated=await catalogChange(s,{name:'Revised synthetic'});expect((await add(s)).body.error.code).toBe('VERSION_CONFLICT');await make(updated);
    expect((await add(updated)).body.error.code).toBe('ALREADY_EXISTS');expect((await add(await catalog({active:false}))).body.error.code).toBe('OFFERING_SUBJECT');
    expect((await add(await catalog({grade_levels:[2]}))).body.error.code).toBe('OFFERING_SUBJECT');expect((await add(updated,{display_order:0})).status).toBe(422);
  });
  it('supports explicit Kindergarten domains without assigning numeric assessment behavior',async()=>{
    const kindergarten=randomUUID();await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,0,'Synthetic Kindergarten',$3)",[kindergarten,year,ids.teacher]);
    const s=await catalog({kind:'developmental_domain',grade_levels:[0]}),r=await make(s,kindergarten);expect(r.subject_snapshot.kind).toBe('developmental_domain');expect(r.subject_snapshot).not.toHaveProperty('grading_policy');
  });
  it('pins existing details across catalog edits and refreshes only through an explicit draft-year update',async()=>{
    const s=await catalog(),off=await make(s),updated=await catalogChange(s,{name:'Changed catalog title'});
    expect((await get('/api/v1/section-subjects/'+off.id)).body.data.record.subject_snapshot.name).toBe(s.name);
    const stale=await change(off,{refresh_subject:true,subject_version:s.version});expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    const r=await change(off,{refresh_subject:true,subject_version:updated.version});expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.data.subject_snapshot.name).toBe(updated.name);
    const h=await get('/api/v1/section-subjects/'+off.id+'/events');expect(responses.offeringHistory!.safeParse(h.body.data).success).toBe(true);expect(h.body.data.items[0]).toMatchObject({action:'refresh',before_snapshot:{subject_snapshot:{name:s.name}}});
  });
  it('retains active-year subject snapshots while allowing explicit retirement, order changes and reactivation',async()=>{
    const s=await catalog(),off=await make(s);await activate();const updated=await catalogChange(s,{name:'Later catalog title',grade_levels:[2]});
    expect((await change(off,{refresh_subject:true,subject_version:updated.version})).body.error.code).toBe('OFFERING_REFRESH_LOCKED');
    const retired=await change(off,{active:false,display_order:20});expect(retired.status).toBe(200);expect((await get(`/api/v1/sections/${section}/subjects`)).body.data.items).toEqual([]);
    const restored=await change(retired.body.data,{active:true});expect(restored.status).toBe(200);expect(restored.body.data.subject_snapshot.grade_levels).toEqual([1]);
    expect((await get('/api/v1/section-subjects/'+off.id+'/events?limit=2')).body.data.pagination.next_before_version).toBe(2);
  });
  it('keeps existing offerings after subject archival but blocks new use and reactivation',async()=>{
    const s=await catalog(),off=await make(s);const archived=await catalogChange(s,{active:false});
    expect((await get('/api/v1/section-subjects/'+off.id)).body.data.record.active).toBe(true);expect((await add(archived,{},other)).body.error.code).toBe('OFFERING_SUBJECT');
    const retired=await change(off,{active:false});expect((await change(retired.body.data,{active:true})).body.error.code).toBe('OFFERING_SUBJECT');
  });
  it('preserves closed-year manager reads while denying every offering write and teacher access',async()=>{
    const s=await catalog(),off=await make(s);await activate();await db.pg.query("update edunexus.academic_years set status='closed' where id=$1",[year]);
    expect((await get('/api/v1/section-subjects/'+off.id)).status).toBe(200);expect((await get(`/api/v1/sections/${section}/subjects`,ids.teacher)).status).toBe(404);
    expect((await change(off,{active:false})).body.error.code).toBe('OFFERING_YEAR_CLOSED');expect((await add(await catalog())).body.error.code).toBe('OFFERING_YEAR_CLOSED');
  });
  it('uses current adviser access without expanding teacher learner permissions',async()=>{
    const s=await catalog(),off=await make(s);expect((await get('/api/v1/section-subjects/'+off.id,ids.teacher)).status).toBe(200);expect((await get('/api/v1/section-subjects/'+off.id,ids.otherTeacher)).status).toBe(404);
    expect((await add(s,{},other,ids.teacher)).status).toBe(403);expect((await change(off,{active:false},ids.teacher)).status).toBe(403);expect((await get('/api/v1/section-subjects/'+off.id+'/events',ids.teacher)).status).toBe(403);
    await db.pg.query('update edunexus.sections set adviser_user_id=$2 where id=$1',[section,ids.otherTeacher]);expect((await get('/api/v1/section-subjects/'+off.id,ids.teacher)).status).toBe(404);expect((await get('/api/v1/section-subjects/'+off.id,ids.otherTeacher)).status).toBe(200);
    expect(await db.asUser(ids.teacher,tx=>tx.query('select id from edunexus.section_subjects where id=$1',[off.id]))).toEqual([]);
    for(const sql of ["update edunexus.section_subjects set active=false","delete from edunexus.section_subject_events","select edunexus.section_subject_context($1)"])
      await expect(db.asUser(ids.principal,tx=>tx.query(sql,sql.includes('$1')?[section]:[]))).rejects.toMatchObject({code:'42501'});
    await expect(db.asUser(null,tx=>tx.query('select edunexus.read_section_subject($1)',[off.id]))).rejects.toMatchObject({code:'42501'});
  });
  it('rejects no-ops and competing saves without losing the winning revision',async()=>{
    const off=await make(await catalog());expect((await change(off)).body.error.code).toBe('OFFERING_UNCHANGED');
    const results=await Promise.all([change(off,{display_order:1}),change(off,{display_order:2})]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await get('/api/v1/section-subjects/'+off.id+'/events')).body.data.items).toHaveLength(2);
  });
  it('rolls back the offering and audits when its journal cannot be recorded',async()=>{
    const s=await catalog(),before=(await db.pg.query('select count(*) from edunexus.audit_events')).rows;
    await db.pg.exec("create function edunexus.synthetic_offering_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.section_subject_events for each row execute function edunexus.synthetic_offering_failure();");
    try{expect((await add(s)).status).toBe(500);expect((await get(`/api/v1/sections/${section}/subjects`)).body.data.items).toEqual([]);expect((await db.pg.query('select count(*) from edunexus.audit_events')).rows).toEqual(before);}
    finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.section_subject_events; drop function edunexus.synthetic_offering_failure();');}
  });
  it('filters before pagination and allows duplicate presentation positions',async()=>{
    const offerings=[];for(let i=0;i<4;i++)offerings.push(await make(await catalog()));await change(offerings[3],{active:false});
    const first=await get(`/api/v1/sections/${section}/subjects?limit=2`),last=await get(`/api/v1/sections/${section}/subjects?limit=2&after_id=${first.body.data.pagination.next_after_id}`);
    expect(first.body.data.items).toHaveLength(2);expect(last.body.data.items).toHaveLength(1);expect(new Set([...first.body.data.items,...last.body.data.items].map(r=>r.id)).size).toBe(3);
    expect((await get(`/api/v1/sections/${section}/subjects?active=false`)).body.data.items[0].id).toBe(offerings[3].id);
    expect((await get(`/api/v1/sections/${section}/subjects?limit=101`)).status).toBe(422);expect((await request(app).get(`/api/v1/sections/${section}/subjects`)).status).toBe(401);
  });
});
