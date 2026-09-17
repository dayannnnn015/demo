import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {adoptionResponses as responses} from '../src/modules/assessment-adoptions/contracts.js';

describe('Section 4A.4 reviewed immutable assessment-policy adoption',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>,year:string,draft:any,n=2099;
  const base='/api/v1/assessment-policy-adoptions',drafts='/api/v1/assessment-policy-drafts';
  const reason='Synthetic adoption recorded for testing only.',reference='Synthetic school record reference for testing.';
  const post=(path:string,body:object,actor=ids.principal)=>request(app).post(path).set('Authorization',`Bearer ${actor}`).send(body);
  const get=(path:string,actor=ids.principal)=>request(app).get(path).set('Authorization',`Bearer ${actor}`);
  const newDraft=async(extra:object={})=>{
    const r=await post(drafts,{code:'P'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic draft',source_reference:'Synthetic source for testing only',
      grade_levels:[1,2],components:[{code:'A',name:'Synthetic A',weight_basis_points:4000},{code:'B',name:'Synthetic B',weight_basis_points:6000}],status:'draft',reason,...extra});
    expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data;
  };
  const reviseDraft=async(d:any,extra:object={})=>{
    const r=await request(app).patch(drafts+'/'+d.id).set('Authorization',`Bearer ${ids.principal}`)
      .send({version:d.version,name:d.name,source_reference:d.source_reference,grade_levels:d.grade_levels,components:d.components,status:d.status,reason,...extra});
    return r;
  };
  const adopt=(extra:object={},actor=ids.principal)=>post(base,{academic_year_id:year,policy_id:draft.id,policy_version:draft.version,
    adopted_on:`${n}-06-15`,adoption_reference:reference,reason,...extra},actor);
  const made=async(extra:object={})=>{const r=await adopt(extra);expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data;};
  const withdraw=(a:any,extra:object={},actor=ids.principal)=>post(`${base}/${a.id}/withdrawal`,{version:a.version,reason,...extra},actor);
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token,aal:'aal2'};}}});});
  beforeEach(async()=>{
    await db.pg.query('delete from edunexus.request_buckets');
    n++;year=randomUUID();
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[year,n,`${n}-06-01`,`${n+1}-03-31`]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term',$2,$3)",[year,`${n}-06-01`,`${n+1}-03-31`]);
    draft=await newDraft();
  });
  afterAll(async()=>db?.database.close());

  it('freezes the exact adopted draft revision and journals the decision',async()=>{
    expect((await get(base)).body.data.items).toEqual([]);
    const r=await adopt();expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(responses.adoptionCreate!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({academic_year_id:year,policy_id:draft.id,policy_version:draft.version,status:'adopted',version:1,grade_levels:[1,2],adopted_on:`${n}-06-15`});
    expect(r.body.data.policy_snapshot).toMatchObject({id:draft.id,code:draft.code,components:draft.components,grade_levels:draft.grade_levels});
    expect(r.body.data.policy_snapshot).not.toHaveProperty('created_at');
    const h=await get(`${base}/${r.body.data.id}/events`);
    expect(h.body.data.items[0]).toMatchObject({action:'adopt',before_snapshot:null,actor_user_id:ids.principal,request_id:r.body.requestId,reason});
  });

  it('keeps the frozen revision unchanged when the draft is revised afterwards',async()=>{
    const a=await made();
    const revised=await reviseDraft(draft,{name:'Synthetic renamed',components:[{code:'A',name:'Synthetic A',weight_basis_points:10000}]});
    expect(revised.status,JSON.stringify(revised.body)).toBe(200);
    expect(revised.body.data.version).toBe(2);
    const current=(await get(base+'/'+a.id)).body.data;
    expect(current.policy_version).toBe(1);
    expect(current.policy_snapshot.name).toBe('Synthetic draft');
    expect(current.policy_snapshot.components).toEqual(draft.components);
    expect(current.version).toBe(1);
    expect((await adopt({policy_version:1})).body.error.code).toBe('VERSION_CONFLICT');
  });

  it('requires a current unarchived draft, an open school year and an in-year date',async()=>{
    const archived=await newDraft();
    expect((await reviseDraft(archived,{status:'archived'})).status).toBe(200);
    expect((await adopt({policy_id:archived.id,policy_version:2})).body.error.code).toBe('ADOPTION_STATE');
    for(const date of [`${n}-05-31`,`${n+1}-04-01`])expect((await adopt({adopted_on:date})).body.error.code).toBe('ADOPTION_YEAR');
    for(const extra of [{policy_version:99},{policy_id:randomUUID()},{academic_year_id:randomUUID()},{adoption_reference:'short'},{reason:'short'},{adopted_on:'not-a-date'},{status:'adopted'}])
      expect([404,409,422]).toContain((await adopt(extra)).status);
    for(const status of ['active','closed'])await db.pg.query('update edunexus.academic_years set status=$2 where id=$1',[year,status]);
    expect((await adopt()).body.error.code).toBe('ADOPTION_YEAR');
  });

  it('allows one standing adoption per school year and policy, and re-adoption after withdrawal',async()=>{
    const a=await made();
    expect((await adopt()).body.error.code).toBe('ALREADY_EXISTS');
    const other=await newDraft();
    expect((await adopt({policy_id:other.id,policy_version:other.version})).status).toBe(201);
    expect((await withdraw(a)).status).toBe(201);
    const again=await adopt();expect(again.status,JSON.stringify(again.body)).toBe(201);
    expect(again.body.data.id).not.toBe(a.id);
    expect((await get(base+'?status=all&policy_id='+draft.id)).body.data.items).toHaveLength(2);
    expect((await get(base+'?policy_id='+draft.id)).body.data.items.map((v:any)=>v.id)).toEqual([again.body.data.id]);
  });

  it('withdraws once with a current version and preserves the frozen evidence',async()=>{
    const a=await made();
    expect((await withdraw(a,{version:99})).body.error.code).toBe('VERSION_CONFLICT');
    const w=await withdraw(a);expect(w.status,JSON.stringify(w.body)).toBe(201);
    expect(w.body.data).toMatchObject({status:'withdrawn',version:2,policy_version:1});
    expect(w.body.data.policy_snapshot).toEqual(a.policy_snapshot);
    expect((await withdraw(w.body.data)).body.error.code).toBe('ADOPTION_STATE');
    for(const extra of [{adopted_on:`${n}-06-16`},{adoption_reference:reference},{policy_version:1}])expect((await withdraw(w.body.data,extra)).status).toBe(422);
    const h=await get(`${base}/${a.id}/events?limit=1`);
    expect(responses.adoptionHistory!.safeParse(h.body.data).success).toBe(true);
    expect(h.body.data.items[0]).toMatchObject({action:'withdraw',adoption_version:2});
    expect(h.body.data.items[0].before_snapshot.status).toBe('adopted');
    expect(h.body.data.pagination.next_before_version).toBe(2);
    expect((await get(`${base}/${a.id}/events?before_version=2`)).body.data.items[0].action).toBe('adopt');
  });

  it('blocks archiving a draft while its adoption stands, in HTTP and SQL',async()=>{
    const a=await made();
    const blocked=await reviseDraft(draft,{status:'archived'});
    expect(blocked.body.error.code).toBe('POLICY_DRAFT_ADOPTED');
    expect((await reviseDraft(draft,{name:'Synthetic renamed while adopted'})).status).toBe(200);
    await expect(db.asUser(ids.principal,tx=>tx.query(
      "select edunexus.update_assessment_policy_draft($1,2,'Synthetic draft','Synthetic source for testing only',array[1,2],$2::jsonb,'archived',$3)",
      [draft.id,JSON.stringify(draft.components),reason]))).rejects.toMatchObject({code:'P1302'});
    expect((await withdraw(a)).status).toBe(201);
    const revised=(await get(drafts+'/'+draft.id)).body.data;
    expect((await reviseDraft(revised,{status:'archived'})).status).toBe(200);
  });

  it('restricts every adoption read and write to active managers in HTTP and SQL',async()=>{
    const a=await made();
    for(const actor of [ids.teacher,ids.otherTeacher,ids.inactive]){
      for(const path of [base,base+'/'+a.id,`${base}/${a.id}/events`])expect((await get(path,actor)).status).toBe(403);
      expect((await adopt({},actor)).status).toBe(403);expect((await withdraw(a,{},actor)).status).toBe(403);
      expect(await db.asUser(actor,tx=>tx.query('select id from edunexus.assessment_policy_adoptions'))).toEqual([]);
    }
    expect((await request(app).get(base)).status).toBe(401);
    expect(await db.asUser(null,tx=>tx.query('select id from edunexus.assessment_policy_adoption_events'))).toEqual([]);
    for(const sql of ["update edunexus.assessment_policy_adoptions set status='withdrawn'",'delete from edunexus.assessment_policy_adoption_events',
      "select edunexus.write_assessment_policy_adoption(null,0,null,null,null,null,'Synthetic reference text','Synthetic reason text')"])
      await expect(db.asUser(ids.principal,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
    await expect(db.asUser(ids.teacher,tx=>tx.query('select edunexus.adopt_assessment_policy($1,$2,1,$3::date,$4,$5)',
      [year,draft.id,`${n}-06-15`,reference,reason]))).rejects.toMatchObject({code:'42501'});
    expect((await get(base+'/'+a.id,ids.officer)).status).toBe(200);
    expect((await withdraw(a,{},ids.officer)).status).toBe(201);
  });

  it('rolls back the adoption, withdrawal and audits if immutable history cannot be written',async()=>{
    const a=await made(),other=await newDraft();
    const before=(await db.pg.query('select count(*) from edunexus.audit_events')).rows;
    await db.pg.exec("create function edunexus.synthetic_adoption_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.assessment_policy_adoption_events for each row execute function edunexus.synthetic_adoption_failure();");
    try{
      expect((await adopt({policy_id:other.id,policy_version:other.version})).status).toBe(500);
      expect((await withdraw(a)).status).toBe(500);
      expect((await get(base+'/'+a.id)).body.data).toEqual(a);
      expect((await db.pg.query('select id from edunexus.assessment_policy_adoptions where policy_id=$1',[other.id])).rows).toEqual([]);
      expect((await db.pg.query('select count(*) from edunexus.audit_events')).rows).toEqual(before);
    } finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.assessment_policy_adoption_events; drop function edunexus.synthetic_adoption_failure();');}
  });

  it('filters adoptions by year, policy and status before UUID pagination',async()=>{
    const ours=[await made()];
    for(let i=0;i<3;i++){const d=await newDraft();ours.push(await made({policy_id:d.id,policy_version:d.version}));}
    expect((await withdraw(ours[3])).status).toBe(201);
    const first=(await get(`${base}?academic_year_id=${year}&limit=2`)).body.data;
    expect(responses.adoptionList!.safeParse(first).success).toBe(true);
    const second=(await get(`${base}?academic_year_id=${year}&limit=2&after_id=${first.pagination.next_after_id}`)).body.data;
    expect(new Set([...first.items,...second.items].map((v:any)=>v.id)).size).toBe(3);
    expect(second.pagination.next_after_id).toBeNull();
    expect((await get(`${base}?status=withdrawn&academic_year_id=${year}`)).body.data.items.map((v:any)=>v.id)).toEqual([ours[3].id]);
    expect((await get(`${base}?academic_year_id=${randomUUID()}`)).body.data.items).toEqual([]);
    expect((await get(base+'?limit=101')).status).toBe(422);
    expect((await get(base+'/'+randomUUID())).status).toBe(404);
  });

  it('adds no offering binding, score entry or grade calculation surface',async()=>{
    const offerings=(await db.pg.query('select * from edunexus.section_subjects')).rows;
    const a=await made();
    expect(a).not.toHaveProperty('computed_grade');expect(a).not.toHaveProperty('transmutation_table');
    expect((await db.pg.query('select * from edunexus.section_subjects')).rows).toEqual(offerings);
    const api=(await request(app).get('/openapi.json')).body;
    expect(api.paths[base].post.responses['201']).toBeDefined();
    for(const path of [base+'/{id}/calculate',base+'/{id}/scores',base+'/{id}/offerings','/api/v1/grades'])expect(api.paths[path]).toBeUndefined();
    expect(Object.keys(api.paths).some(p=>/transmut|gwa|mps/i.test(p))).toBe(false);
  });
});
