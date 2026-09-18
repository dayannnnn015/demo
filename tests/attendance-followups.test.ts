import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {followupResponses as responses} from '../src/modules/attendance-followups/contracts.js';

describe('Section 3B.4 manual attendance follow-up',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>,year:string,section:string,other:string,n=1999;
  const date=(d=1)=>`${n}-06-${String(d).padStart(2,'0')}`,reason='Synthetic attendance evidence reviewed for follow-up.';
  const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
  const post=(url:string,body:object,actor=ids.principal)=>request(app).post(url).set('Authorization',`Bearer ${actor}`).send(body);
  const get=(url:string,actor=ids.principal)=>request(app).get(url).set('Authorization',`Bearer ${actor}`);
  const base=(id:string)=>`/api/v1/attendance-follow-ups/${id}`;
  const startUrl=(id:string)=>`/api/v1/enrollments/${id}/attendance-follow-ups`;
  const proposal=(extra:object={})=>({section_id:section,from:date(),to:date(2),category:'recording_gap',assignee_user_id:ids.principal,due_on:null,reason,...extra});
  const preview=(id:string,body=proposal(),actor=ids.principal)=>post(startUrl(id)+'/preview',body,actor);
  const confirm=(id:string,body:object,p:any,actor=ids.principal)=>post(startUrl(id),{...body,review_hash:p.review_hash??'0'.repeat(64),reviewed:true},actor);
  const open=async(id:string,extra:object={})=>{
    const body=proposal(extra),p=await preview(id,body);expect(p.status,JSON.stringify(p.body)).toBe(201);expect(responses.followupOpenPreview!.safeParse(p.body.data).success).toBe(true);
    const c=await confirm(id,body,p.body.data);expect(c.status,JSON.stringify(c.body)).toBe(201);expect(responses.followupOpen!.safeParse(c.body.data).success).toBe(true);return c.body.data;
  };
  const change=async(id:string,version:number,action='update',extra:object={})=>{
    const body={version,action,assignee_user_id:ids.principal,due_on:null,reason,...extra};const p=await post(base(id)+'/preview',body);expect(p.status,JSON.stringify(p.body)).toBe(201);
    expect(responses.followupChangePreview!.safeParse(p.body.data).success).toBe(true);
    const c=await post(base(id)+'/events',{...body,review_hash:p.body.data.review_hash??'0'.repeat(64),reviewed:true});expect(c.status,JSON.stringify(c.body)).toBe(201);expect(responses.followupChange!.safeParse(c.body.data).success).toBe(true);return c.body.data;
  };
  const make=async()=>{
    const learner=randomUUID();await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Synthetic','Follow-up','1993-01-01','female')",[learner]);
    const rows=await db.asUser(ids.principal,tx=>tx.query("select * from edunexus.enroll_learner($1,$2,$3,'regular')",[learner,section,date()]));return {id:String(rows[0]!.id),learner};
  };
  const cal=async(changes:object[])=>{
    const version=(await db.pg.query<{version:number}>('select version from edunexus.instructional_calendars where id=$1',[year])).rows[0]?.version??0;
    const url=`/api/v1/academic-years/${year}/calendar`,body={version,section_id:null,changes,reason},p=await post(url+'/preview',body);
    expect(p.status,JSON.stringify(p.body)).toBe(201);const c=await post(url+'/corrections',{...body,review_hash:p.body.data.review_hash,reviewed:true});expect(c.status,JSON.stringify(c.body)).toBe(201);
  };
  const mark=async(id:string,d=1,am:string|null='absent',pm:string|null='absent')=>{
    const version=(await db.pg.query<{version:number}>('select version from edunexus.attendance_days where section_id=$1 and day_on=$2',[section,date(d)])).rows[0]?.version??0;
    const url=`/api/v1/sections/${section}/attendance`,body={day_on:date(d),version,changes:[{enrollment_id:id,am,pm}],reason},p=await post(url+'/preview',body);
    expect(p.status,JSON.stringify(p.body)).toBe(201);const c=await post(url+'/corrections',{...body,review_hash:p.body.data.review_hash,reviewed:true});expect(c.status,JSON.stringify(c.body)).toBe(201);
  };
  const counts=async()=>(await db.pg.query<{cases:number;events:number;audits:number}>(`select (select count(*)::int from edunexus.attendance_followups) cases,
    (select count(*)::int from edunexus.attendance_followup_events) events,(select count(*)::int from edunexus.audit_events) audits`)).rows;
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token};}}});});
  beforeEach(async()=>{
    await db.pg.query('delete from edunexus.request_buckets');if(year)await db.pg.query("update edunexus.academic_years set status='closed' where id=$1 and status='active'",[year]);
    n++;year=randomUUID();section=randomUUID();other=randomUUID();
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[year,n,date(),`${n+1}-03-31`]);
    for(const [id,teacher]of [[section,ids.teacher],[other,ids.otherTeacher]])await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,$3,$4)',[id,year,id,teacher]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term',$2,$3)",[year,date(),`${n+1}-03-31`]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1",[year]);
    await cal([1,2].map(d=>({day_on:date(d),action:'set',am:'classroom',pm:'classroom',day_type:'regular',label:'Synthetic classroom'})));
  });
  afterAll(async()=>db?.database.close());

  it('previews an exact learner without creating cases, journals or change audits',async()=>{
    const e=await make();await make();const before=await counts(),p=await preview(e.id);
    expect(p.status,JSON.stringify(p.body)).toBe(201);expect(p.body.data).toMatchObject({can_commit:true,action:'open',version:0,current_evidence:{available:true,summary:{missing_sessions:4,absent_sessions:0},snapshot:{member:{enrollment_id:e.id}}}});
    expect(await counts()).toEqual(before);
  });
  it('opens an attributable case with immutable opening evidence and unchanged current evidence',async()=>{
    const e=await make(),c=await open(e.id,{due_on:today()});expect(c).toMatchObject({action:'open',case_version:1,actor_user_id:ids.principal});
    const r=await get(base(c.case_id));expect(responses.followupGet!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({evidence_changed:false,overdue:false,record:{status:'open',due_on:today(),created_by:ids.principal,opening_evidence:{evidence_version:1}}});
    const logs=(await db.pg.query<{record_ids:string[]}>('select record_ids from edunexus.record_access_events where request_id=$1',[r.body.requestId])).rows;expect(logs[0]!.record_ids).toEqual([c.case_id]);
  });
  it('requires matching evidence for the chosen category and an active year',async()=>{
    const e=await make(),body=proposal({category:'absence'}),p=await preview(e.id,body);expect(p.body.data).toMatchObject({can_commit:false,review_hash:null,issues:['NO_MATCHING_EVIDENCE']});
    expect((await confirm(e.id,body,p.body.data)).body.error.code).toBe('FOLLOWUP_BLOCKED');await mark(e.id);await mark(e.id,2,'present','present');
    const gap=await preview(e.id);expect(gap.body.data.issues).toEqual(['NO_MATCHING_EVIDENCE']);await open(e.id,{category:'absence'});
    const otherE=await make();await db.pg.query("update edunexus.academic_years set status='closed' where id=$1",[year]);expect((await preview(otherE.id)).body.data.issues).toContain('YEAR_NOT_ACTIVE');
  });
  it('treats unknown calendars and ADM as recording gaps without declaring absences',async()=>{
    const e=await make();await cal([{day_on:date(),action:'clear'},{day_on:date(2),action:'set',am:'alternative_delivery',pm:'suspended',day_type:'suspension',label:'Synthetic continuity'}]);
    const p=await preview(e.id);expect(p.body.data.current_evidence.summary).toEqual({absent_sessions:0,missing_sessions:0,unconfigured_dates:1,unsupported_sessions:1});expect(p.body.data.can_commit).toBe(true);
    expect((await preview(e.id,proposal({category:'absence'}))).body.data.can_commit).toBe(false);
  });
  it('updates ownership and notes, resolves, reopens and cancels with paged history',async()=>{
    const e=await make(),c=await open(e.id);await change(c.case_id,1,'update',{assignee_user_id:ids.officer,due_on:today()});await change(c.case_id,2);
    await change(c.case_id,3,'resolve');await change(c.case_id,4,'reopen');await change(c.case_id,5,'cancel');
    const r=await get(base(c.case_id));expect(r.body.data.record).toMatchObject({version:6,status:'cancelled',due_on:null});
    const h=await get(base(c.case_id)+'/events?limit=2');expect(responses.followupHistory!.safeParse(h.body.data).success).toBe(true);expect(h.body.data.items.map((e:any)=>e.action)).toEqual(['cancel','reopen']);
    expect(h.body.data.pagination.next_before_version).toBe(5);expect((await get(base(c.case_id)+'/events?before_version=5')).body.data.items.map((e:any)=>e.action)).toEqual(['resolve','update','update','open']);
  });
  it('rejects invalid transitions, malformed reasons, due dates and unsupported assignees',async()=>{
    const e=await make();for(const assignee of [ids.teacher,ids.inactive,randomUUID()])expect((await preview(e.id,proposal({assignee_user_id:assignee}))).body.error.code).toBe('FOLLOWUP_ASSIGNEE');
    expect((await preview(e.id,proposal({due_on:'1999-01-01'}))).body.error.code).toBe('FOLLOWUP_DUE_DATE');expect((await preview(e.id,proposal({reason:'short'}))).status).toBe(422);
    expect((await preview(e.id,proposal({to:`${n}-07-02`}))).body.error.code).toBe('MONITOR_RANGE');
    const c=await open(e.id);const b={version:1,action:'reopen',assignee_user_id:ids.principal,due_on:null,reason};expect((await post(base(c.case_id)+'/preview',b)).body.error.code).toBe('FOLLOWUP_TRANSITION');
    expect((await post(base(c.case_id)+'/preview',{...b,action:'resolve',due_on:today()})).body.error.code).toBe('FOLLOWUP_DUE_DATE');
    await change(c.case_id,1,'resolve');expect((await post(base(c.case_id)+'/preview',{...b,version:2,action:'update'})).body.error.code).toBe('FOLLOWUP_TRANSITION');
  });
  it('serializes competing creation and rejects a second open case across categories',async()=>{
    const e=await make();await mark(e.id);const b=proposal(),p=(await preview(e.id,b)).body.data,before=await counts();
    const results=await Promise.all([confirm(e.id,b,p),confirm(e.id,b,p)]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);
    const after=await counts();expect(after[0]!.cases).toBe(before[0]!.cases+1);expect(after[0]!.events).toBe(before[0]!.events+1);
    expect((await preview(e.id,proposal({category:'absence'}))).body.data.issues).toContain('OPEN_CASE_EXISTS');
  });
  it('prevents reopening an old case while a newer case remains open',async()=>{
    const e=await make(),first=await open(e.id);await change(first.case_id,1,'resolve');const second=await open(e.id);
    const b={version:2,action:'reopen',assignee_user_id:ids.principal,due_on:null,reason},p=await post(base(first.case_id)+'/preview',b);
    expect(p.body.data).toMatchObject({can_commit:false,issues:['OPEN_CASE_EXISTS']});expect((await post(base(first.case_id)+'/events',{...b,review_hash:'0'.repeat(64),reviewed:true})).body.error.code).toBe('FOLLOWUP_BLOCKED');
    await change(second.case_id,1,'cancel');await change(first.case_id,2,'reopen');
  });
  it('binds creation review to the actor, proposal, evidence and assignee version',async()=>{
    const e=await make(),b=proposal(),p=(await preview(e.id,b)).body.data;
    expect((await confirm(e.id,b,p,ids.officer)).body.error.code).toBe('FOLLOWUP_REVIEW_CHANGED');expect((await confirm(e.id,{...b,reason:'Different reviewed synthetic reason.'},p)).body.error.code).toBe('FOLLOWUP_REVIEW_CHANGED');
    await db.pg.query("update edunexus.staff set display_name='Updated synthetic principal' where user_id=$1",[ids.principal]);expect((await confirm(e.id,b,p)).body.error.code).toBe('FOLLOWUP_REVIEW_CHANGED');
    const next=(await preview(e.id,b)).body.data;await mark(e.id);expect((await confirm(e.id,b,next)).body.error.code).toBe('FOLLOWUP_REVIEW_CHANGED');
  });
  it('binds case actions to current version and evidence without rewriting opening evidence',async()=>{
    const e=await make(),c=await open(e.id),b={version:1,action:'resolve',assignee_user_id:ids.principal,due_on:null,reason},p=await post(base(c.case_id)+'/preview',b);
    await mark(e.id,1,'present','present');expect((await post(base(c.case_id)+'/events',{...b,review_hash:p.body.data.review_hash,reviewed:true})).body.error.code).toBe('FOLLOWUP_REVIEW_CHANGED');
    const r=await get(base(c.case_id));expect(r.body.data).toMatchObject({evidence_changed:true,record:{opening_evidence:{summary:{missing_sessions:4}}},current_evidence:{summary:{missing_sessions:2}}});
    await change(c.case_id,1,'resolve');expect((await post(base(c.case_id)+'/events',{...b,review_hash:p.body.data.review_hash,reviewed:true})).body.error.code).toBe('VERSION_CONFLICT');
  });
  it('preserves cases after void and year closure and permits managerial resolution',async()=>{
    const e=await make(),c=await open(e.id),b={version:1,action:'void',reason_code:'incorrect_entry',reason},url=`/api/v1/enrollments/${e.id}/record-review`,p=await post(url+'/preview',b);
    expect((await post(url,{...b,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1",[year]);const r=await get(base(c.case_id));
    expect(r.body.data).toMatchObject({evidence_changed:true,record:{opening_evidence:{available:true}},current_evidence:{available:false,record_state:'voided',snapshot:{member:null}}});
    await change(c.case_id,1,'resolve');expect((await preview(e.id)).body.data.issues).toContain('NO_ELIGIBLE_MEMBERSHIP');
  });
  it('allows timeline repair without deleting evidence and detects unavailable section membership',async()=>{
    const e=await make(),c=await open(e.id),url=`/api/v1/enrollments/${e.id}/timeline`,b={version:1,reason,entries:[{event_type:'enrolled',effective_on:date(),section_id:other,reason:'regular'}]},p=await post(url+'/preview',b);
    expect((await post(url+'/corrections',{...b,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
    const r=await get(base(c.case_id));expect(r.body.data.current_evidence.available).toBe(false);expect(r.body.data.record.opening_evidence.snapshot.member.enrollment_id).toBe(e.id);await change(c.case_id,1,'cancel');
  });
  it('keeps frozen attendance untouched while allowing independent case work',async()=>{
    const e=await make();await mark(e.id);await mark(e.id,2);await cal(Array.from({length:28},(_,i)=>({day_on:date(i+3),action:'set',am:'no_class',pm:'no_class',day_type:'school_break',label:'Explicit break'})));
    const url=`/api/v1/sections/${section}/attendance/months`,b={month_on:date(),version:0,action:'submit',reason},p=await post(url+'/preview',b);
    expect((await post(url+'/transitions',{...b,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
    const c=await open(e.id,{category:'absence'});await change(c.case_id,1,'resolve');
    expect((await db.pg.query('select status,version from edunexus.attendance_months where section_id=$1',[section])).rows[0]).toEqual({status:'submitted',version:1});
    expect(c.review_snapshot.current_evidence.snapshot.days[0].month_status).toBe('submitted');
  });
  it('retains overdue work and supports reassignment when the original manager is inactive',async()=>{
    const e=await make(),c=await open(e.id,{assignee_user_id:ids.officer,due_on:today()});
    // Age this isolated fixture to represent a due date that has elapsed.
    await db.pg.query("update edunexus.attendance_followups set due_on=timezone('Asia/Manila',now())::date-1 where id=$1",[c.case_id]);
    const r=await get(base(c.case_id));expect(r.body.data.overdue).toBe(true);
    await change(c.case_id,2,'update',{due_on:r.body.data.record.due_on});
    await db.pg.query('update edunexus.staff set active=false where user_id=$1',[ids.officer]);
    try{expect((await post(base(c.case_id)+'/preview',{version:3,action:'update',assignee_user_id:ids.officer,due_on:null,reason})).body.error.code).toBe('FOLLOWUP_ASSIGNEE');await change(c.case_id,3,'resolve');}
    finally{await db.pg.query('update edunexus.staff set active=true where user_id=$1',[ids.officer]);}
  });
  it('keeps HTTP and SQL case evidence manager-only and denies direct mutation and helpers',async()=>{
    const e=await make(),c=await open(e.id);
    for(const actor of [ids.teacher,ids.otherTeacher,ids.inactive]){
      expect((await get(base(c.case_id),actor)).status).toBe(403);expect((await get(base(c.case_id)+'/events',actor)).status).toBe(403);
      expect((await get(`/api/v1/attendance-follow-ups?academic_year_id=${year}`,actor)).status).toBe(403);expect((await preview(e.id,proposal(),actor)).status).toBe(403);
      await expect(db.asUser(actor,tx=>tx.query('select edunexus.read_attendance_followup($1)',[c.case_id]))).rejects.toMatchObject({code:'42501'});
    }
    expect(await db.asUser(ids.teacher,tx=>tx.query('select id from edunexus.attendance_followup_events'))).toEqual([]);
    for(const statement of ["update edunexus.attendance_followups set status='resolved'","delete from edunexus.attendance_followup_events","select edunexus.followup_assignee($1)","select edunexus.attendance_monitor_evidence($1,null,null,'all',1,null,null)"])
      await expect(db.asUser(ids.principal,tx=>tx.query(statement,statement.includes('$1')?[ids.principal]:[]))).rejects.toMatchObject({code:'42501'});
    expect((await request(app).get(base(c.case_id))).status).toBe(401);expect((await get(base(randomUUID()))).status).toBe(404);
  });
  it('rolls back opening and action writes if their final journal insert fails',async()=>{
    const e=await make(),b=proposal(),p=(await preview(e.id,b)).body.data,before=await counts();
    await db.pg.exec("create function edunexus.synthetic_followup_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.attendance_followup_events for each row execute function edunexus.synthetic_followup_failure();");
    try{expect((await confirm(e.id,b,p)).status).toBe(500);expect(await counts()).toEqual(before);}finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.attendance_followup_events;');}
    const c=await open(e.id),body={version:1,action:'resolve',assignee_user_id:ids.principal,due_on:null,reason},cp=(await post(base(c.case_id)+'/preview',body)).body.data,prior=await counts();
    await db.pg.exec('create trigger synthetic_failure before insert on edunexus.attendance_followup_events for each row execute function edunexus.synthetic_followup_failure();');
    try{expect((await post(base(c.case_id)+'/events',{...body,review_hash:cp.review_hash,reviewed:true})).status).toBe(500);expect(await counts()).toEqual(prior);expect((await get(base(c.case_id))).body.data.record.version).toBe(1);}
    finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.attendance_followup_events; drop function edunexus.synthetic_followup_failure();');}
  });
  it('selects exact evidence beyond 100 enrollments and filters case queues before paging',async()=>{
    const es:{id:string;learner:string}[]=[];for(let i=0;i<101;i++)es.push(await make());await db.pg.exec('analyze');const cases:string[]=[];
    await db.asUser(ids.principal,async tx=>{
      await tx.query("select set_config('edunexus.request_id',$1,true)",[randomUUID()]);
      for(const [index,e]of es.entries()){
        const params=[e.id,section,date(),date(2),'recording_gap',index%2?ids.officer:ids.principal,null,reason];
        const [p]=await tx.query('select edunexus.preview_attendance_followup_open($1,$2,$3,$4,$5,$6,$7,$8) p',params);
        expect((p!.p as any).current_evidence.snapshot.member.enrollment_id).toBe(e.id);
        const [c]=await tx.query('select case_id from edunexus.commit_attendance_followup_open($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...params,(p!.p as any).review_hash]);cases.push(String(c!.case_id));
      }
    });
    const url=`/api/v1/attendance-follow-ups?academic_year_id=${year}`,first=await get(url+'&limit=100');expect(responses.followupList!.safeParse(first.body.data).success).toBe(true);expect(first.body.data.items).toHaveLength(100);
    const next=await get(url+'&limit=100&after_id='+first.body.data.pagination.next_after_id);expect(next.body.data.items).toHaveLength(1);expect(new Set([...first.body.data.items,...next.body.data.items].map(c=>c.id)).size).toBe(101);
    expect((await get(url+'&assignee_user_id='+ids.officer+'&limit=100')).body.data.items).toHaveLength(50);expect((await get(url+'&overdue_only=true')).body.data.items).toEqual([]);
    await change(cases[0]!,1,'resolve');const resolved=await get(url+'&status=resolved&limit=1');expect(resolved.body.data.items.map((c:any)=>c.id)).toEqual([cases[0]]);
    expect((await get(url+'&section_id='+other)).body.data.items).toEqual([]);expect((await get(url+'&limit=101')).status).toBe(422);
  });
  it('rejects competing case actions without losing the winning update or adding duplicate history',async()=>{
    const e=await make(),c=await open(e.id),b={version:1,action:'update',assignee_user_id:ids.officer,due_on:null,reason},p=(await post(base(c.case_id)+'/preview',b)).body.data;
    const results=await Promise.all([post(base(c.case_id)+'/events',{...b,review_hash:p.review_hash,reviewed:true}),post(base(c.case_id)+'/events',{...b,review_hash:p.review_hash,reviewed:true})]);
    expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect((await get(base(c.case_id))).body.data.record).toMatchObject({version:2,assignee_user_id:ids.officer});
    expect((await get(base(c.case_id)+'/events')).body.data.items).toHaveLength(2);
  });
  it('preserves recorded identities through reconciliation while showing changed current evidence',async()=>{
    const e=await make(),c=await open(e.id),canonical=randomUUID();
    await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Retained','Synthetic','1993-01-01','female')",[canonical]);
    const b={canonical_id:canonical,duplicate_id:e.learner,canonical_version:1,duplicate_version:1,action:'link',reason},p=await post('/api/v1/learner-reconciliations/preview',b);
    expect((await post('/api/v1/learner-reconciliations',{...b,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
    const r=await get(base(c.case_id));expect(r.body.data.evidence_changed).toBe(true);
    expect(r.body.data.record.opening_evidence.snapshot.member).toMatchObject({learner_id:e.learner,recorded_learner_id:e.learner});expect(r.body.data.current_evidence.snapshot.member).toMatchObject({learner_id:canonical,recorded_learner_id:e.learner});
  });
});
