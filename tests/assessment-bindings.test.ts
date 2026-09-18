import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {bindingResponses as responses} from '../src/modules/assessment-bindings/contracts.js';

describe('Section 4A.5 assessment-policy offering binding',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
  let year:string,section:string,gradeTwo:string,adoption:any,offering:any,n=2099;
  const base='/api/v1/assessment-policy-bindings';
  const reason='Synthetic binding recorded for testing only.',reference='Synthetic school record reference for testing.';
  const post=(path:string,body:object,actor=ids.principal)=>request(app).post(path).set('Authorization',`Bearer ${actor}`).send(body);
  const patch=(path:string,body:object,actor=ids.principal)=>request(app).patch(path).set('Authorization',`Bearer ${actor}`).send(body);
  const get=(path:string,actor=ids.principal)=>request(app).get(path).set('Authorization',`Bearer ${actor}`);
  const newDraft=async(grades=[1])=>{
    const r=await post('/api/v1/assessment-policy-drafts',{code:'P'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic draft',
      source_reference:'Synthetic source for testing only',grade_levels:grades,components:[{code:'A',name:'Synthetic A',weight_basis_points:10000}],status:'draft',reason});
    expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data;
  };
  const newAdoption=async(grades=[1])=>{
    const d=await newDraft(grades);
    const r=await post(base.replace('bindings','adoptions'),{academic_year_id:year,policy_id:d.id,policy_version:d.version,
      adopted_on:`${n}-06-15`,adoption_reference:reference,reason});
    expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data;
  };
  const newOffering=async(target=section)=>{
    const s=await post('/api/v1/subjects',{code:'C'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic area',kind:'learning_area',grade_levels:[1,2],active:true,reason});
    expect(s.status,JSON.stringify(s.body)).toBe(201);
    const r=await post(`/api/v1/sections/${target}/subjects`,{subject_id:s.body.data.id,subject_version:s.body.data.version,display_order:10,reason});
    expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data;
  };
  const bind=(extra:object={},actor=ids.principal)=>post(base,{offering_id:offering.id,offering_version:offering.version,
    adoption_id:adoption.id,adoption_version:adoption.version,reason,...extra},actor);
  const made=async(extra:object={})=>{const r=await bind(extra);expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data;};
  const release=(b:any,extra:object={},actor=ids.principal)=>post(`${base}/${b.id}/release`,{version:b.version,reason,...extra},actor);
  const retire=(o:any,active=false)=>patch('/api/v1/section-subjects/'+o.id,{version:o.version,active,display_order:o.display_order,refresh_subject:false,subject_version:null,reason});
  const withdrawAdoption=(a:any)=>post(`/api/v1/assessment-policy-adoptions/${a.id}/withdrawal`,{version:a.version,reason});
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token};}}});});
  beforeEach(async()=>{
    await db.pg.query('delete from edunexus.request_buckets');
    n++;year=randomUUID();section=randomUUID();gradeTwo=randomUUID();
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[year,n,`${n}-06-01`,`${n+1}-03-31`]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term',$2,$3)",[year,`${n}-06-01`,`${n+1}-03-31`]);
    for(const [id,grade] of [[section,1],[gradeTwo,2]] as const)
      await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,$3,$4,$5)',[id,year,grade,id,ids.teacher]);
    adoption=await newAdoption();offering=await newOffering();
  });
  afterAll(async()=>db?.database.close());

  it('records that a standing adoption governs one offering and journals it',async()=>{
    expect((await get(base)).body.data.items).toEqual([]);
    const r=await bind();expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(responses.bindingCreate!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({offering_id:offering.id,adoption_id:adoption.id,section_id:section,academic_year_id:year,status:'bound',version:1});
    const h=await get(`${base}/${r.body.data.id}/events`);
    expect(h.body.data.items[0]).toMatchObject({action:'bind',before_snapshot:null,actor_user_id:ids.principal,request_id:r.body.requestId,reason});
  });

  it('requires a standing adoption, matching school year, applicable grade and active offering',async()=>{
    const gradeTwoOnly=await newAdoption([2]);
    expect((await bind({adoption_id:gradeTwoOnly.id,adoption_version:gradeTwoOnly.version})).body.error.code).toBe('BINDING_SCOPE');
    const withdrawn=await newAdoption();
    expect((await withdrawAdoption(withdrawn)).status).toBe(201);
    expect((await bind({adoption_id:withdrawn.id,adoption_version:2})).body.error.code).toBe('BINDING_STATE');
    const retired=await newOffering();
    expect((await retire(retired)).status).toBe(200);
    expect((await bind({offering_id:retired.id,offering_version:2})).body.error.code).toBe('BINDING_SCOPE');
    for(const extra of [{offering_version:99},{adoption_version:99},{offering_id:randomUUID()},{adoption_id:randomUUID()},{reason:'short'}])
      expect([404,409,422]).toContain((await bind(extra)).status);
  });

  it('refuses an adoption from another school year', async()=>{
    const otherYear=randomUUID(),m=n+50;
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[otherYear,m,`${m}-06-01`,`${m+1}-03-31`]);
    const d=await newDraft();
    const foreign=await post('/api/v1/assessment-policy-adoptions',{academic_year_id:otherYear,policy_id:d.id,policy_version:d.version,
      adopted_on:`${m}-06-15`,adoption_reference:reference,reason});
    expect(foreign.status,JSON.stringify(foreign.body)).toBe(201);
    expect((await bind({adoption_id:foreign.body.data.id,adoption_version:foreign.body.data.version})).body.error.code).toBe('BINDING_SCOPE');
  });

  it('allows one standing binding per offering and rebinding after release',async()=>{
    const b=await made();
    expect((await bind()).body.error.code).toBe('ALREADY_EXISTS');
    const second=await newAdoption();
    expect((await bind({adoption_id:second.id,adoption_version:second.version})).body.error.code).toBe('ALREADY_EXISTS');
    expect((await release(b)).status).toBe(201);
    const again=await bind({adoption_id:second.id,adoption_version:second.version});
    expect(again.status,JSON.stringify(again.body)).toBe(201);
    expect(again.body.data.id).not.toBe(b.id);
    expect((await get(`${base}?status=all&offering_id=${offering.id}`)).body.data.items).toHaveLength(2);
    expect((await get(`${base}?offering_id=${offering.id}`)).body.data.items.map((v:any)=>v.id)).toEqual([again.body.data.id]);
  });

  it('releases once with a current version and preserves the binding history',async()=>{
    const b=await made();
    expect((await release(b,{version:99})).body.error.code).toBe('VERSION_CONFLICT');
    const r=await release(b);expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(r.body.data).toMatchObject({status:'released',version:2,adoption_id:adoption.id});
    expect((await release(r.body.data)).body.error.code).toBe('BINDING_STATE');
    for(const extra of [{offering_id:offering.id},{adoption_version:1}])expect((await release(r.body.data,extra)).status).toBe(422);
    const h=await get(`${base}/${b.id}/events?limit=1`);
    expect(responses.bindingHistory!.safeParse(h.body.data).success).toBe(true);
    expect(h.body.data.items[0]).toMatchObject({action:'release',binding_version:2});
    expect(h.body.data.items[0].before_snapshot.status).toBe('bound');
    expect(h.body.data.pagination.next_before_version).toBe(2);
    expect((await get(`${base}/${b.id}/events?before_version=2`)).body.data.items[0].action).toBe('bind');
  });

  it('protects a standing binding from adoption withdrawal and offering retirement',async()=>{
    const b=await made();
    expect((await withdrawAdoption(adoption)).body.error.code).toBe('ADOPTION_BOUND');
    const current=(await get('/api/v1/section-subjects/'+offering.id)).body.data.record;
    expect((await retire(current)).body.error.code).toBe('OFFERING_BOUND');
    expect((await patch('/api/v1/section-subjects/'+offering.id,{version:current.version,active:true,display_order:20,refresh_subject:false,subject_version:null,reason})).status).toBe(200);
    await expect(db.asUser(ids.principal,tx=>tx.query(
      'select edunexus.update_assessment_policy_draft($1,$2,$3,$4,$5::integer[],$6::jsonb,$7,$8)',
      [adoption.policy_snapshot.id,adoption.policy_snapshot.version,'Synthetic draft','Synthetic source for testing only',
        adoption.policy_snapshot.grade_levels,JSON.stringify(adoption.policy_snapshot.components),'archived',reason]))).rejects.toMatchObject({code:'P1302'});
    expect((await release(b)).status).toBe(201);
    expect((await withdrawAdoption(adoption)).status).toBe(201);
    const after=(await get('/api/v1/section-subjects/'+offering.id)).body.data.record;
    expect((await retire(after)).status).toBe(200);
  });

  it('keeps closed-year bindings read only',async()=>{
    const b=await made(),other=await newOffering();
    for(const status of ['active','closed'])await db.pg.query('update edunexus.academic_years set status=$2 where id=$1',[year,status]);
    expect((await release(b)).body.error.code).toBe('OFFERING_YEAR_CLOSED');
    expect((await bind({offering_id:other.id,offering_version:other.version})).body.error.code).toBe('OFFERING_YEAR_CLOSED');
    expect((await get(base+'/'+b.id)).body.data.status).toBe('bound');
  });

  it('restricts every binding read and write to active managers in HTTP and SQL',async()=>{
    const b=await made();
    for(const actor of [ids.teacher,ids.otherTeacher,ids.inactive]){
      for(const path of [base,base+'/'+b.id,`${base}/${b.id}/events`])expect((await get(path,actor)).status).toBe(403);
      expect((await bind({},actor)).status).toBe(403);expect((await release(b,{},actor)).status).toBe(403);
      expect(await db.asUser(actor,tx=>tx.query('select id from edunexus.assessment_policy_bindings'))).toEqual([]);
    }
    expect((await request(app).get(base)).status).toBe(401);
    expect(await db.asUser(null,tx=>tx.query('select id from edunexus.assessment_policy_binding_events'))).toEqual([]);
    for(const sql of ["update edunexus.assessment_policy_bindings set status='released'",'delete from edunexus.assessment_policy_binding_events',
      "select edunexus.write_assessment_policy_binding(null,0,null,null,null,null,'Synthetic reason text')"])
      await expect(db.asUser(ids.principal,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
    await expect(db.asUser(ids.teacher,tx=>tx.query('select edunexus.bind_assessment_policy($1,$2,$3,$4,$5)',
      [offering.id,offering.version,adoption.id,adoption.version,reason]))).rejects.toMatchObject({code:'42501'});
    expect((await get(base+'/'+b.id,ids.officer)).status).toBe(200);
    expect((await release(b,{},ids.officer)).status).toBe(201);
  });

  it('rolls back the binding, release and audits if immutable history cannot be written',async()=>{
    const b=await made(),other=await newOffering(gradeTwo),wide=await newAdoption([1,2]);
    const before=(await db.pg.query('select count(*) from edunexus.audit_events')).rows;
    await db.pg.exec("create function edunexus.synthetic_binding_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.assessment_policy_binding_events for each row execute function edunexus.synthetic_binding_failure();");
    try{
      expect((await bind({offering_id:other.id,offering_version:other.version,adoption_id:wide.id,adoption_version:wide.version})).status).toBe(500);
      expect((await release(b)).status).toBe(500);
      expect((await get(base+'/'+b.id)).body.data).toEqual(b);
      expect((await db.pg.query('select id from edunexus.assessment_policy_bindings where offering_id=$1',[other.id])).rows).toEqual([]);
      expect((await db.pg.query('select count(*) from edunexus.audit_events')).rows).toEqual(before);
    } finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.assessment_policy_binding_events; drop function edunexus.synthetic_binding_failure();');}
  });

  it('filters bindings before UUID pagination and adds no score or calculation surface',async()=>{
    const first=await made();
    const wide=await newAdoption([1,2]);
    for(const target of [gradeTwo,section,section]){
      const o=await newOffering(target);
      expect((await bind({offering_id:o.id,offering_version:o.version,adoption_id:wide.id,adoption_version:wide.version})).status).toBe(201);
    }
    const page=(await get(`${base}?section_id=${section}&limit=2`)).body.data;
    expect(responses.bindingList!.safeParse(page).success).toBe(true);
    const next=(await get(`${base}?section_id=${section}&limit=2&after_id=${page.pagination.next_after_id}`)).body.data;
    expect(new Set([...page.items,...next.items].map((v:any)=>v.id)).size).toBe(3);
    expect((await get(`${base}?adoption_id=${adoption.id}`)).body.data.items.map((v:any)=>v.id)).toEqual([first.id]);
    expect((await get(`${base}?section_id=${gradeTwo}`)).body.data.items).toHaveLength(1);
    expect((await get(base+'?limit=101')).status).toBe(422);
    expect((await get(base+'/'+randomUUID())).status).toBe(404);
    expect(first).not.toHaveProperty('computed_grade');expect(first).not.toHaveProperty('scores');
    const api=(await request(app).get('/openapi.json')).body;
    for(const path of [base+'/{id}/scores',base+'/{id}/calculate','/api/v1/scores','/api/v1/grades'])expect(api.paths[path]).toBeUndefined();
  });
});
