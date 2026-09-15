import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {policyResponses as responses} from '../src/modules/assessment-policies/contracts.js';

describe('Section 4A.3 non-operational assessment-policy drafts',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
  const base='/api/v1/assessment-policy-drafts',reason='Synthetic assessment draft prepared for testing.';
  const body=(extra:object={})=>({code:'P'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic draft',source_reference:'Synthetic source for testing only',grade_levels:[2,1],
    components:[{code:'b',name:'Synthetic B',weight_basis_points:6250},{code:'a',name:'Synthetic A',weight_basis_points:3750}],status:'draft',reason,...extra});
  const create=(b=body(),actor=ids.principal)=>request(app).post(base).set('Authorization',`Bearer ${actor}`).send(b);
  const get=(path=base,actor=ids.principal)=>request(app).get(path).set('Authorization',`Bearer ${actor}`);
  const update=(r:any,extra:object={},actor=ids.principal)=>request(app).patch(base+'/'+r.id).set('Authorization',`Bearer ${actor}`).send({version:r.version,name:r.name,source_reference:r.source_reference,grade_levels:r.grade_levels,components:r.components,status:r.status,reason,...extra});
  const sqlCreate=(components:unknown,grades=[1],status='draft')=>db.asUser(ids.principal,tx=>tx.query("select edunexus.create_assessment_policy_draft('SQL_TEST','Synthetic policy','Synthetic reference', $1::integer[],$2::jsonb,$3,$4)",[grades,JSON.stringify(components),status,reason]));
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token,aal:'aal2'};}}});});
  beforeEach(async()=>db.pg.query('delete from edunexus.request_buckets'));
  afterAll(async()=>db?.database.close());
  it('starts empty and canonicalizes explicit grade and component metadata without seeding rules',async()=>{
    expect((await get()).body.data.items).toEqual([]);const r=await create(body({code:'synthetic_policy'}));expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(responses.policyCreate!.safeParse(r.body.data).success).toBe(true);expect(r.body.data).toMatchObject({code:'SYNTHETIC_POLICY',grade_levels:[1,2],status:'draft',version:1});
    expect(r.body.data.components.map((v:any)=>v.code)).toEqual(['A','B']);
    const h=await get(base+'/'+r.body.data.id+'/events');expect(h.body.data.items[0]).toMatchObject({action:'create',before_snapshot:null,actor_user_id:ids.principal,request_id:r.body.requestId});
  });
  it('requires exact positive integer weights and distinct component codes at the API boundary',async()=>{
    for(const components of [[],[{code:'A',name:'A',weight_basis_points:9999}],[{code:'A',name:'A',weight_basis_points:10000.1}],
      [{code:'A',name:'A',weight_basis_points:0},{code:'B',name:'B',weight_basis_points:10000}],
      [{code:'a',name:'A',weight_basis_points:5000},{code:'A',name:'B',weight_basis_points:5000}],
      Array.from({length:11},(_,i)=>({code:'C'+i,name:'Synthetic',weight_basis_points:i===10?1000:900}))])expect((await create(body({components}))).status).toBe(422);
    expect((await create(body({components:[{code:'ONLY',name:'Synthetic whole',weight_basis_points:10000}]}))).status).toBe(201);
  });
  it('enforces component validation inside SQL including malformed JSON and hidden fields',async()=>{
    for(const components of [null,{},[null],[{}],[{code:'A',name:'A',weight_basis_points:'10000'}],[{code:'A',name:'A',weight_basis_points:10000,formula:'x'}],
      [{code:'A',name:'A',weight_basis_points:10001}],[{code:'A',name:'A',weight_basis_points:10000.5}],
      [{code:'a',name:'A',weight_basis_points:5000},{code:'A',name:'B',weight_basis_points:5000}],
      [{code:'A',name:'Bad\nname',weight_basis_points:10000}]])await expect(sqlCreate(components)).rejects.toMatchObject({code:'P1201'});
  });
  it('excludes Kindergarten and rejects unsupported policy metadata and approval states',async()=>{
    for(const extra of [{grade_levels:[0]},{grade_levels:[1,1]},{grade_levels:[7]},{grade_levels:[]},{source_reference:'short'},{status:'approved'},{formula:'invented'},{offering_id:randomUUID()}])
      expect((await create(body(extra))).status).toBe(422);
    for(const [grades,status] of [[[0],'draft'],[[1,1],'draft'],[[1],'approved']] as const)
      await expect(sqlCreate([{code:'A',name:'A',weight_basis_points:10000}],[...grades],status)).rejects.toMatchObject({code:'23514'});
  });
  it('archives and restores drafts with immutable codes and historical weights',async()=>{
    const r=(await create()).body.data;const archived=await update(r,{status:'archived',components:[{code:'ALL',name:'Synthetic revised',weight_basis_points:10000}]},ids.officer);expect(archived.status,JSON.stringify(archived.body)).toBe(200);
    expect((await get(base+'?q='+r.code)).body.data.items).toEqual([]);expect((await get(base+'?status=archived&q='+r.code)).body.data.items[0].id).toBe(r.id);
    expect((await update(archived.body.data,{status:'draft'})).status).toBe(200);const h=await get(base+'/'+r.id+'/events?limit=2');expect(responses.policyHistory!.safeParse(h.body.data).success).toBe(true);
    expect(h.body.data.pagination.next_before_version).toBe(2);expect(h.body.data.items[1].before_snapshot.components).toEqual(r.components);
    expect((await get(base+'/'+r.id+'/events?before_version=2')).body.data.items[0].action).toBe('create');
    expect((await update(r,{code:'REPLACEMENT'})).status).toBe(422);expect((await create(body({code:r.code.toLowerCase()}))).body.error.code).toBe('ALREADY_EXISTS');
  });
  it('treats reordered equivalent metadata as unchanged and prevents lost versioned saves',async()=>{
    const r=(await create()).body.data;expect((await update(r,{components:[...r.components].reverse(),grade_levels:[2,1]})).body.error.code).toBe('POLICY_DRAFT_UNCHANGED');
    const results=await Promise.all([update(r,{name:'Synthetic first'}),update(r,{name:'Synthetic second'})]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await update(r,{status:'archived'})).body.error.code).toBe('VERSION_CONFLICT');expect((await get(base+'/'+r.id+'/events')).body.data.items).toHaveLength(2);
  });
  it('restricts all draft reads and writes to active managers in HTTP and SQL',async()=>{
    const r=(await create()).body.data;
    for(const actor of [ids.teacher,ids.otherTeacher,ids.inactive]){
      expect((await get(base,actor)).status).toBe(403);expect((await get(base+'/'+r.id,actor)).status).toBe(403);expect((await get(base+'/'+r.id+'/events',actor)).status).toBe(403);
      expect((await create(body(),actor)).status).toBe(403);expect((await update(r,{status:'archived'},actor)).status).toBe(403);
      expect(await db.asUser(actor,tx=>tx.query('select id from edunexus.assessment_policy_drafts'))).toEqual([]);
    }
    expect((await request(app).get(base)).status).toBe(401);expect(await db.asUser(null,tx=>tx.query('select id from edunexus.assessment_policy_draft_events'))).toEqual([]);
    for(const sql of ['update edunexus.assessment_policy_drafts set status=\'archived\'','delete from edunexus.assessment_policy_draft_events',"select edunexus.normalize_policy_components('[]')",
      "select edunexus.write_assessment_policy_draft(null,0,'X','Synthetic','Synthetic source',array[1],'[]','draft','Synthetic reason')"])
      await expect(db.asUser(ids.principal,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
    await expect(db.asUser(ids.teacher,tx=>tx.query("select edunexus.create_assessment_policy_draft('X','Synthetic','Synthetic source',array[1],'[]','draft','Synthetic reason')"))).rejects.toMatchObject({code:'42501'});
    expect((await get(base+'/'+r.id,ids.officer)).status).toBe(200);
  });
  it('rolls back draft creation, update and audits if immutable history cannot be written',async()=>{
    const r=(await create()).body.data,b=body(),before=(await db.pg.query('select count(*) from edunexus.audit_events')).rows;
    await db.pg.exec("create function edunexus.synthetic_policy_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.assessment_policy_draft_events for each row execute function edunexus.synthetic_policy_failure();");
    try{expect((await create(b)).status).toBe(500);expect((await update(r,{name:'Failed change'})).status).toBe(500);expect((await get(base+'/'+r.id)).body.data).toEqual(r);
      expect((await db.pg.query('select id from edunexus.assessment_policy_drafts where code=$1',[b.code])).rows).toEqual([]);expect((await db.pg.query('select count(*) from edunexus.audit_events')).rows).toEqual(before);}
    finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.assessment_policy_draft_events; drop function edunexus.synthetic_policy_failure();');}
  });
  it('filters drafts before UUID pagination and treats search text literally',async()=>{
    const prefix='Q'+randomUUID().slice(0,8);for(let i=0;i<5;i++)expect((await create(body({code:prefix+'_'+i,status:i===4?'archived':'draft'}))).status).toBe(201);
    const first=(await get(base+`?q=${prefix}&limit=2`)).body.data;expect(responses.policyList!.safeParse(first).success).toBe(true);
    const second=(await get(base+`?q=${prefix}&limit=2&after_id=${first.pagination.next_after_id}`)).body.data;
    expect(new Set([...first.items,...second.items].map(r=>r.id)).size).toBe(4);expect(second.pagination.next_after_id).toBeNull();
    expect((await get(base+'?q=%25')).body.data.items).toEqual([]);expect((await get(base+'?limit=101')).status).toBe(422);expect((await get(base+'/'+randomUUID())).status).toBe(404);
  });
  it('creates no offerings or operational approval state when a draft is saved',async()=>{
    const before=(await db.pg.query('select * from edunexus.section_subjects')).rows;const r=(await create()).body.data;expect(r).not.toHaveProperty('approved_at');expect(r).not.toHaveProperty('grading_formula');
    expect((await db.pg.query('select * from edunexus.section_subjects')).rows).toEqual(before);
    const api=(await request(app).get('/openapi.json')).body;expect(api.paths[base].post.responses['201']).toBeDefined();expect(api.paths[base+'/{id}/approve']).toBeUndefined();
  });
});
