import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {scoreResponses as responses} from '../src/modules/assessment-scores/contracts.js';

describe('Section 4B.1 assessment tasks and raw score entry',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
  let year:string,period:string,section:string,offering:any,learners:string[],enrollments:string[],task:any,n=2000;
  const reason='Synthetic assessment entry recorded for testing only.';
  const post=(path:string,body:object,actor=ids.principal)=>request(app).post(path).set('Authorization',`Bearer ${actor}`).send(body);
  const patch=(path:string,body:object,actor=ids.principal)=>request(app).patch(path).set('Authorization',`Bearer ${actor}`).send(body);
  const get=(path:string,actor=ids.principal)=>request(app).get(path).set('Authorization',`Bearer ${actor}`);
  const tasksOf=(o=offering)=>`/api/v1/section-subjects/${o.id}/assessment-tasks`;
  const newTask=(extra:object={},actor=ids.principal,o=offering)=>post(tasksOf(o),{reporting_period_id:period,component_code:'WW',sequence:1,title:'Synthetic written work',max_score:20,reason,...extra},actor);
  const record=(entries:object[],actor=ids.teacher,t=task)=>post(`/api/v1/assessment-tasks/${t.id}/scores`,{entries,reason},actor);
  const entry=(i:number,raw_score:number|null,version=0)=>({enrollment_id:enrollments[i],raw_score,version});
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token,aal:'aal2'};}}});});
  beforeEach(async()=>{
    await db.pg.query('delete from edunexus.request_buckets');
    n++;year=randomUUID();section=randomUUID();period=randomUUID();
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[year,n,`${n}-06-01`,`${n+1}-03-31`]);
    await db.pg.query("insert into edunexus.reporting_periods(id,academic_year_id,ordinal,name,starts_on,ends_on) values($1,$2,1,'Synthetic term',$3,$4)",[period,year,`${n}-06-01`,`${n+1}-03-31`]);
    await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,$3,$4)',[section,year,section,ids.teacher]);
    // Adopted policy with two components, then bound to the offering.
    const draft=(await post('/api/v1/assessment-policy-drafts',{code:'P'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic draft',
      source_reference:'Synthetic source for testing only',grade_levels:[1],status:'draft',reason,
      components:[{code:'WW',name:'Synthetic written',weight_basis_points:6000},{code:'PT',name:'Synthetic performance',weight_basis_points:4000}]})).body.data;
    const adoption=(await post('/api/v1/assessment-policy-adoptions',{academic_year_id:year,policy_id:draft.id,policy_version:draft.version,
      adopted_on:`${n}-06-15`,adoption_reference:'Synthetic school record reference.',reason})).body.data;
    const subject=(await post('/api/v1/subjects',{code:'C'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic area',kind:'learning_area',grade_levels:[1],active:true,reason})).body.data;
    offering=(await post(`/api/v1/sections/${section}/subjects`,{subject_id:subject.id,subject_version:subject.version,display_order:10,reason})).body.data;
    const bound=await post('/api/v1/assessment-policy-bindings',{offering_id:offering.id,offering_version:offering.version,adoption_id:adoption.id,adoption_version:adoption.version,reason});
    expect(bound.status,JSON.stringify(bound.body)).toBe(201);
    learners=[];enrollments=[];
    for(let i=0;i<3;i++){
      const l=(await post('/api/v1/learners',{first_name:'Synthetic',middle_name:null,last_name:`Learner${i}`,name_extension:null,birth_date:`${n-6}-05-05`,sex:'female',lrn:null})).body.data;
      learners.push(l.id);
      const e=await post('/api/v1/enrollments',{learner_id:l.id,section_id:section,enrolled_on:`${n}-06-02`,entry_kind:'regular'});
      expect(e.status,JSON.stringify(e.body)).toBe(201);enrollments.push(e.body.data.id);
    }
    const t=await newTask();expect(t.status,JSON.stringify(t.body)).toBe(201);task=t.body.data;
  });
  afterAll(async()=>db?.database.close());

  it('creates a task only under a component of the bound adopted revision',async()=>{
    expect(responses.taskCreate!.safeParse(task).success).toBe(true);
    expect(task).toMatchObject({component_code:'WW',sequence:1,status:'open',section_id:section,academic_year_id:year,version:1});
    expect(Number(task.max_score)).toBe(20);
    expect((await newTask({component_code:'QA',sequence:2})).body.error.code).toBe('TASK_COMPONENT');
    expect((await newTask({component_code:'pt',sequence:2})).body.data.component_code).toBe('PT');
    expect((await newTask({sequence:1})).body.error.code).toBe('ALREADY_EXISTS');
    expect((await newTask({reporting_period_id:randomUUID(),sequence:9})).body.error.code).toBe('TASK_PERIOD');
    const h=await get(`/api/v1/assessment-tasks/${task.id}/events`);
    expect(h.body.data.items[0]).toMatchObject({action:'create',before_snapshot:null,actor_user_id:ids.principal});
  });

  it('refuses tasks on an offering with no standing policy binding',async()=>{
    const subject=(await post('/api/v1/subjects',{code:'C'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic other',kind:'learning_area',grade_levels:[1],active:true,reason})).body.data;
    const unbound=(await post(`/api/v1/sections/${section}/subjects`,{subject_id:subject.id,subject_version:subject.version,display_order:20,reason})).body.data;
    expect((await newTask({},ids.principal,unbound)).body.error.code).toBe('TASK_COMPONENT');
    const binding=(await get(`/api/v1/assessment-policy-bindings?offering_id=${offering.id}`)).body.data.items[0];
    expect((await post(`/api/v1/assessment-policy-bindings/${binding.id}/release`,{version:binding.version,reason})).status).toBe(201);
    expect((await newTask({sequence:5})).body.error.code).toBe('TASK_COMPONENT');
  });

  it('records raw marks for the adviser and returns no total or grade',async()=>{
    const r=await record([entry(0,18),entry(1,15.5),entry(2,null)]);
    expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(responses.scoreRecord!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data.changed).toBe(2);
    const sheet=(await get(`/api/v1/assessment-tasks/${task.id}/scores`,ids.teacher)).body.data;
    expect(responses.scoreSheet!.safeParse(sheet).success).toBe(true);
    expect(sheet.recorded_scores_only).toBe(true);
    for(const key of ['total','average','percentage','grade','weighted_score','transmuted'])expect(sheet).not.toHaveProperty(key);
    const rows=Object.fromEntries(sheet.items.map((v:any)=>[v.enrollment_id,v]));
    expect(Number(rows[enrollments[0]!].raw_score)).toBe(18);
    expect(rows[enrollments[2]!].raw_score).toBeNull();
    expect(rows[enrollments[2]!].version).toBe(0);
    const api=(await request(app).get('/openapi.json')).body;
    for(const p of ['/api/v1/assessment-tasks/{id}/grade','/api/v1/assessment-tasks/{id}/total','/api/v1/grades','/api/v1/report-cards'])expect(api.paths[p]).toBeUndefined();
  });

  it('keeps an unrecorded learner unknown rather than zero, and clears without deleting history',async()=>{
    expect((await record([entry(0,12)])).status).toBe(201);
    const sheet=(await get(`/api/v1/assessment-tasks/${task.id}/scores`)).body.data;
    const row=sheet.items.find((v:any)=>v.enrollment_id===enrollments[0]);
    const cleared0=(await record([{enrollment_id:enrollments[0]!,raw_score:null,version:row.version}])).body.data.entries[0];
    expect(Number(cleared0.before)).toBe(12);expect(cleared0.after).toBeNull();
    const cleared=(await get(`/api/v1/assessment-tasks/${task.id}/scores`)).body.data.items.find((v:any)=>v.enrollment_id===enrollments[0]);
    expect(cleared.raw_score).toBeNull();expect(cleared.version).toBe(2);
    const history=(await get(`/api/v1/assessment-tasks/${task.id}/score-events`)).body.data;
    expect(responses.scoreHistory!.safeParse(history).success).toBe(true);
    expect(history.items).toHaveLength(2);
    expect(history.items[1].entries[0].before).toBeNull();expect(Number(history.items[1].entries[0].after)).toBe(12);
    // Newest first, and the cursor walks backwards in the same order.
    expect(history.items[0].entries[0].after).toBeNull();
    expect(Number(history.items[0].id)).toBeGreaterThan(Number(history.items[1].id));
    const older=(await get(`/api/v1/assessment-tasks/${task.id}/score-events?limit=1&before_id=${history.items[0].id}`)).body.data;
    expect(older.items).toHaveLength(1);expect(older.items[0].id).toBe(history.items[1].id);
  });

  it('bounds each mark by the task maximum and protects recorded marks from a lower maximum',async()=>{
    expect((await record([entry(0,21)])).body.error.code).toBe('SCORE_RANGE');
    expect((await record([entry(0,-1)])).status).toBe(422);
    expect((await record([entry(0,1.234)])).status).toBe(422);
    expect((await record([entry(0,20)])).status).toBe(201);
    const current=(await get(`/api/v1/assessment-tasks/${task.id}`)).body.data;
    expect((await patch(`/api/v1/assessment-tasks/${task.id}`,{version:current.version,title:current.title,max_score:15,status:'open',reason})).body.error.code).toBe('TASK_MAXIMUM');
    const raised=await patch(`/api/v1/assessment-tasks/${task.id}`,{version:current.version,title:'Synthetic revised',max_score:25,status:'open',reason});
    expect(raised.status,JSON.stringify(raised.body)).toBe(200);
    expect((await patch(`/api/v1/assessment-tasks/${task.id}`,{version:raised.body.data.version,title:'Synthetic revised',max_score:25,status:'open',reason})).body.error.code).toBe('ASSESSMENT_UNCHANGED');
  });

  it('rejects a stale score version and duplicate learners in one batch',async()=>{
    expect((await record([entry(0,10)])).status).toBe(201);
    expect((await record([entry(0,11)])).body.error.code).toBe('VERSION_CONFLICT');
    expect((await record([entry(0,11,1),entry(0,12,1)])).status).toBe(422);
    const results=await Promise.all([record([entry(1,8)]),record([entry(1,9)])]);
    expect(results.map(r=>r.status).sort()).toEqual([201,409]);
    expect((await record([{enrollment_id:randomUUID(),raw_score:5,version:0}])).body.error.code).toBe('SCORE_ENROLLMENT');
    expect((await record([entry(0,10,1)])).body.error.code).toBe('ASSESSMENT_UNCHANGED');
  });

  it('archives a task and closes the year to further entry',async()=>{
    const current=(await get(`/api/v1/assessment-tasks/${task.id}`)).body.data;
    expect((await patch(`/api/v1/assessment-tasks/${task.id}`,{version:current.version,title:current.title,max_score:20,status:'archived',reason})).status).toBe(200);
    expect((await record([entry(0,10)])).body.error.code).toBe('TASK_STATE');
    expect((await get(tasksOf())).body.data.items.map((v:any)=>v.id)).not.toContain(task.id);
    expect((await get(tasksOf()+'?status=archived')).body.data.items.map((v:any)=>v.id)).toContain(task.id);
    for(const status of ['active','closed'])await db.pg.query('update edunexus.academic_years set status=$2 where id=$1',[year,status]);
    expect((await newTask({sequence:7})).body.error.code).toBe('TASK_STATE');
  });

  it('limits teachers to their own current sections and denies unassigned staff',async()=>{
    expect((await get(tasksOf(),ids.teacher)).status).toBe(200);
    for(const path of [tasksOf(),`/api/v1/assessment-tasks/${task.id}`])expect((await get(path,ids.otherTeacher)).status).toBe(404);
    expect((await record([entry(0,10)],ids.otherTeacher)).status).toBe(404);
    expect((await get(tasksOf(),ids.inactive)).status).toBe(403);
    expect((await record([entry(0,10)],ids.inactive)).status).toBe(403);
    for(const actor of [ids.otherTeacher,ids.inactive])
      expect(await db.asUser(actor,tx=>tx.query('select id from edunexus.assessment_tasks'))).toEqual([]);
    for(const path of ['/events','/score-events'])expect((await get(`/api/v1/assessment-tasks/${task.id}${path}`,ids.teacher)).status).toBe(403);
    expect((await request(app).get(tasksOf())).status).toBe(401);
    expect(await db.asUser(null,tx=>tx.query('select id from edunexus.assessment_scores'))).toEqual([]);
    for(const sql of ["update edunexus.assessment_scores set raw_score=100",'delete from edunexus.assessment_score_events',
      "select edunexus.assessment_entry_context('00000000-0000-4000-8000-000000000001')",
      "select edunexus.write_assessment_task(null,0,null,null,null,null,'x',1,'open','Synthetic reason text')"])
      await expect(db.asUser(ids.principal,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
  });

  it('rolls back a whole batch and its audits if any entry fails',async()=>{
    expect((await record([entry(0,5)])).status).toBe(201);
    const before=(await db.pg.query('select count(*) from edunexus.audit_events')).rows;
    expect((await record([entry(1,7),entry(2,99)])).body.error.code).toBe('SCORE_RANGE');
    const sheet=(await get(`/api/v1/assessment-tasks/${task.id}/scores`)).body.data.items;
    expect(sheet.find((v:any)=>v.enrollment_id===enrollments[1]).raw_score).toBeNull();
    expect((await db.pg.query('select count(*) from edunexus.audit_events')).rows).toEqual(before);
    await db.pg.exec("create function edunexus.synthetic_score_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.assessment_score_events for each row execute function edunexus.synthetic_score_failure();");
    try{
      expect((await record([entry(1,7)])).status).toBe(500);
      expect((await get(`/api/v1/assessment-tasks/${task.id}/scores`)).body.data.items.find((v:any)=>v.enrollment_id===enrollments[1]).raw_score).toBeNull();
    } finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.assessment_score_events; drop function edunexus.synthetic_score_failure();');}
  });

  it('pages tasks and sheets, and keeps scores after the learner leaves the section',async()=>{
    for(let i=2;i<5;i++)expect((await newTask({sequence:i,title:'Synthetic work '+i})).status).toBe(201);
    const page=(await get(tasksOf()+'?limit=2')).body.data;
    expect(responses.taskList!.safeParse(page).success).toBe(true);
    const next=(await get(`${tasksOf()}?limit=2&after_id=${page.pagination.next_after_id}`)).body.data;
    expect(new Set([...page.items,...next.items].map((v:any)=>v.id)).size).toBe(4);
    expect((await get(tasksOf()+'?component_code=WW')).body.data.items.length).toBe(4);
    expect((await get(tasksOf()+'?limit=101')).status).toBe(422);
    expect((await record([entry(0,9)])).status).toBe(201);
    const enrolled=(await get(`/api/v1/enrollments/${enrollments[0]}`)).body.data;
    const moved=await post(`/api/v1/enrollments/${enrollments[0]}/movements`,{version:enrolled.version,action:'withdrawn',effective_on:`${n}-07-01`,section_id:null,exit_reason:'transfer_out'});
    expect(moved.status,JSON.stringify(moved.body)).toBe(201);
    const stored=await db.pg.query('select raw_score from edunexus.assessment_scores where enrollment_id=$1',[enrollments[0]]);
    expect(Number((stored.rows[0] as any).raw_score)).toBe(9);
    expect((await get(`/api/v1/assessment-tasks/${randomUUID()}`)).status).toBe(404);
  });
});
