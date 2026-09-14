import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {summarizeAttendance} from '../src/modules/attendance-monitor/service.js';
import {monitorResponses} from '../src/modules/attendance-monitor/contracts.js';

describe('Classroom absence evidence',()=>{
  const summarize=(entries:{mode?:string;am?:string|null;pm?:string|null;eligible?:boolean}[])=>summarizeAttendance(
    entries.map((e,i)=>({day_on:`2020-06-${String(i+1).padStart(2,'0')}`,eligible:e.eligible??true,am:e.am===undefined?'absent':e.am,pm:e.pm===undefined?'absent':e.pm})) as any,
    entries.map((e,i)=>({day_on:`2020-06-${String(i+1).padStart(2,'0')}`,configured:e.mode!=='unknown',am:e.mode==='unknown'?null:e.mode??'classroom',pm:e.mode==='unknown'?null:e.mode??'classroom'})) as any);
  it('skips explicit nonclass dates but keeps raw observations separate from date runs',()=>{
    const r=summarize([{}, {mode:'no_class',am:null,pm:null},{}, {mode:'suspended',am:null,pm:null},{}]);
    expect(r.summary).toMatchObject({expected_sessions:6,absent_sessions:6,absent_classroom_dates:3,longest_absent_date_run:3,trailing_absent_date_run:3,needs_completion:false});
  });
  it.each(['unknown','alternative_delivery','missing','present','gap'])('breaks absence runs for %s',kind=>{
    const barrier=kind==='missing'?{am:null}:kind==='present'?{am:'present'}:kind==='gap'?{eligible:false,am:null,pm:null}:{mode:kind,am:null,pm:null};
    const r=summarize([{},barrier,{}]);expect(r.summary.longest_absent_date_run).toBe(1);expect(r.summary.trailing_absent_date_run).toBe(1);
    expect(r.summary.needs_completion).toBe(['unknown','alternative_delivery','missing'].includes(kind));
  });
  it('keeps trailing run zero after a gap even when followed by nonclass dates',()=>{
    expect(summarize([{}, {eligible:false,am:null,pm:null},{mode:'no_class',am:null,pm:null}]).summary.trailing_absent_date_run).toBe(0);
  });
});

describe('Section 3B.3 scoped absence monitoring',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>,year:string,section:string,other:string,n=1999;
  const date=(d=1)=>`${n}-06-${String(d).padStart(2,'0')}`,reason='Synthetic observations verified for this test.';
  const post=(url:string,body:object)=>request(app).post(url).set('Authorization',`Bearer ${ids.principal}`).send(body);
  const read=(q:object={},actor=ids.principal,s=section)=>request(app).get(`/api/v1/sections/${s}/attendance/monitor`).set('Authorization',`Bearer ${actor}`).query({from:date(),to:date(5),...q});
  const make=async(d=1,s=section)=>{
    const learner=randomUUID();await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Synthetic','Monitor','1993-01-01','female')",[learner]);
    const rows=await db.asUser(ids.principal,tx=>tx.query("select * from edunexus.enroll_learner($1,$2,$3,'regular')",[learner,s,date(d)]));return {id:String(rows[0]!.id),learner};
  };
  const cal=async(changes:object[],s:string|null=null)=>{
    const version=(await db.pg.query<{version:number}>('select version from edunexus.instructional_calendars where id=$1',[year])).rows[0]?.version??0;
    const url=`/api/v1/academic-years/${year}/calendar`,body={version,section_id:s,changes,reason};const p=await post(url+'/preview',body);expect(p.status,JSON.stringify(p.body)).toBe(201);
    const c=await post(url+'/corrections',{...body,review_hash:p.body.data.review_hash,reviewed:true});expect(c.status,JSON.stringify(c.body)).toBe(201);
  };
  const mark=async(id:string,d:number,am:string|null,pm:string|null)=>{
    const version=(await db.pg.query<{version:number}>('select version from edunexus.attendance_days where section_id=$1 and day_on=$2',[section,date(d)])).rows[0]?.version??0;
    const url=`/api/v1/sections/${section}/attendance`,body={day_on:date(d),version,reason,changes:[{enrollment_id:id,am,pm}]};const p=await post(url+'/preview',body);expect(p.status,JSON.stringify(p.body)).toBe(201);
    const c=await post(url+'/corrections',{...body,review_hash:p.body.data.review_hash,reviewed:true});expect(c.status,JSON.stringify(c.body)).toBe(201);
  };
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token,aal:'aal2'};}}});});
  beforeEach(async()=>{
    await db.pg.query('delete from edunexus.request_buckets');if(year)await db.pg.query("update edunexus.academic_years set status='closed' where id=$1 and status='active'",[year]);
    n++;year=randomUUID();section=randomUUID();other=randomUUID();
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[year,n,date(),`${n+1}-03-31`]);
    for(const [id,teacher]of [[section,ids.teacher],[other,ids.otherTeacher]])await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,$3,$4)',[id,year,id,teacher]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term',$2,$3)",[year,date(),`${n+1}-03-31`]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1",[year]);
    await cal(Array.from({length:5},(_,i)=>({day_on:date(i+1),action:'set',am:'classroom',pm:'classroom',day_type:'regular',label:'Synthetic classroom'})));
  });
  afterAll(async()=>db?.database.close());
  it('reads unknowns without creating marks or month roots and audits only returned identities',async()=>{
    const e=await make();const before=(await db.pg.query('select count(*) from edunexus.audit_events')).rows;
    const r=await read();expect(r.status,JSON.stringify(r.body)).toBe(200);expect(monitorResponses.attendanceMonitor.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data.items[0]).toMatchObject({enrollment_id:e.id,summary:{missing_sessions:10,absent_sessions:0,needs_completion:true,longest_absent_date_run:0}});
    expect((await db.pg.query('select count(*) from edunexus.audit_events')).rows).toEqual(before);
    expect((await db.pg.query('select id from edunexus.attendance_days')).rows).toHaveLength(0);
    const logs=await db.pg.query<{record_ids:string[]}>('select record_ids from edunexus.record_access_events where request_id=$1',[r.body.requestId]);expect(logs.rows[0]!.record_ids).toEqual([e.id]);
  });
  it('resolves section schedules, AM-only observations and filtered absence/completion views',async()=>{
    const e=await make();await cal([{day_on:date(2),action:'set',am:'no_class',pm:'no_class',day_type:'holiday',label:'Explicit holiday'},{day_on:date(3),action:'set',am:'classroom',pm:'suspended',day_type:'suspension',label:'AM only'}],section);
    await mark(e.id,1,'absent','absent');await mark(e.id,3,'absent',null);await mark(e.id,4,'present','absent');
    const r=await read({view:'with_absences'});expect(r.body.data.items[0].summary).toMatchObject({absent_sessions:4,present_sessions:1,missing_sessions:2,absent_classroom_dates:2,longest_absent_date_run:2,trailing_absent_date_run:0});
    expect((await read({view:'incomplete'})).body.data.items).toHaveLength(1);
    await mark(e.id,5,'present','present');expect((await read({view:'incomplete'})).body.data.items).toEqual([]);
    expect((await read({from:date(3),to:date(3)})).body.data.items[0].summary.longest_absent_date_run).toBe(1);
  });
  it('keeps ADM and unconfigured dates unresolved and breaks runs without inferring absence',async()=>{
    const e=await make();await cal([{day_on:date(2),action:'clear'},{day_on:date(4),action:'set',am:'alternative_delivery',pm:'classroom',day_type:'regular',label:'Mixed delivery'}]);
    for(const d of [1,3,5])await mark(e.id,d,'absent','absent');await mark(e.id,4,null,'absent');
    const r=await read();expect(r.body.data.items[0].summary).toMatchObject({absent_sessions:7,unconfigured_dates:1,unsupported_sessions:1,missing_sessions:0,longest_absent_date_run:1,trailing_absent_date_run:1,needs_completion:true});
    expect(r.body.data.items[0].dates.map((d:any)=>d.classification)).toEqual(['absent','unconfigured','absent','unsupported_adm','absent']);
  });
  it('enforces current teacher scope while managers retain historical membership and gaps',async()=>{
    const e=await make(2);await mark(e.id,2,'absent','absent');
    expect((await post(`/api/v1/enrollments/${e.id}/movements`,{version:1,action:'withdrawn',effective_on:date(3),exit_reason:'withdrawal'})).status).toBe(201);
    expect((await read({},ids.teacher)).body.data.items).toEqual([]);
    const r=await read();expect(r.body.data.items[0].summary).toMatchObject({eligible_dates:1,expected_sessions:2,trailing_absent_date_run:0});
    expect(r.body.data.items[0].dates.map((d:any)=>d.eligible)).toEqual([false,true,false,false,false]);
    expect((await read({},ids.otherTeacher)).status).toBe(404);expect((await read({},ids.inactive)).status).toBe(403);
  });
  it('uses corrected timelines and excludes voided records without exposing unrelated marks',async()=>{
    const e=await make();const url=`/api/v1/enrollments/${e.id}/timeline`,body={version:1,reason,entries:[{event_type:'enrolled',effective_on:date(3),section_id:other,reason:'regular'}]};
    const p=await post(url+'/preview',body);expect((await post(url+'/corrections',{...body,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
    expect((await read()).body.data.items).toEqual([]);expect((await read({},ids.principal,other)).body.data.items[0].summary.eligible_dates).toBe(3);
    const v={version:2,action:'void',reason_code:'incorrect_entry',reason},vu=`/api/v1/enrollments/${e.id}/record-review`,vp=await post(vu+'/preview',v);
    expect((await post(vu,{...v,review_hash:vp.body.data.review_hash,reviewed:true})).status).toBe(201);expect((await read({},ids.principal,other)).body.data.items).toEqual([]);
  });
  it('filters before pagination and records no hidden learner IDs',async()=>{
    const es=[];for(let i=0;i<4;i++)es.push(await make());for(const e of es.slice(1))await mark(e.id,1,'absent','present');
    const found:string[]=[];let cursor:string|undefined;
    do{const r=await read({view:'with_absences',limit:1,...(cursor?{after_id:cursor}:{})});expect(r.status).toBe(200);found.push(...r.body.data.items.map((e:any)=>e.enrollment_id));cursor=r.body.data.pagination.next_after_id;}while(cursor);
    expect(found.sort()).toEqual(es.slice(1).map(e=>e.id).sort());expect(found).not.toContain(es[0]!.id);
  });
  it('recomputes after reviewed corrections and preserves closed-year manager access',async()=>{
    const e=await make();await mark(e.id,1,'absent','absent');expect((await read({view:'with_absences'})).body.data.items).toHaveLength(1);
    await mark(e.id,1,'present','present');expect((await read({view:'with_absences'})).body.data.items).toEqual([]);
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1",[year]);expect((await read()).status).toBe(200);expect((await read({},ids.teacher)).status).toBe(404);
  });
  it('validates scope, nonfuture 31-date limits and direct SQL authorization',async()=>{
    expect((await read({limit:101})).status).toBe(422);expect((await read({view:'dropout'})).status).toBe(422);expect((await read({to:date(1),from:date(2)})).body.error.code).toBe('MONITOR_RANGE');
    expect((await read({to:`${n}-07-02`})).body.error.code).toBe('MONITOR_RANGE');expect((await read({to:`${n}-07-01`})).status).toBe(200);
    for(const actor of [null,ids.inactive])await expect(db.asUser(actor,tx=>tx.query('select edunexus.read_attendance_monitor($1,$2,$3,\'all\',100,null)',[section,date(),date(5)]))).rejects.toMatchObject({code:'42501'});
    await expect(db.asUser(ids.principal,tx=>tx.query('select edunexus.read_attendance_monitor($1,$2,$3,\'all\',101,null)',[section,date(),date(5)]))).rejects.toMatchObject({code:'23514'});
    expect((await request(app).get(`/api/v1/sections/${section}/attendance/monitor`)).status).toBe(401);
    const future= new Date().getUTCFullYear()+1,y=randomUUID(),s=randomUUID();
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[y,future,`${future}-06-01`,`${future+1}-03-31`]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name) values($1,$2,1,'Future synthetic section')",[s,y]);
    expect((await read({from:`${future}-06-01`,to:`${future}-06-01`},ids.principal,s)).body.error.code).toBe('MONITOR_RANGE');
  });
  it('pages 101 learners across the maximum 31-date window without loss',async()=>{
    for(let i=0;i<101;i++)await make();
    const a=await read({to:`${n}-07-01`,view:'incomplete',limit:100});expect(a.status,JSON.stringify(a.body)).toBe(200);
    expect(monitorResponses.attendanceMonitor.safeParse(a.body.data).success).toBe(true);expect(a.body.data.items).toHaveLength(100);
    expect(a.body.data.items[0].dates).toHaveLength(31);expect(a.body.data.items[0].summary).toMatchObject({unconfigured_dates:26,missing_sessions:10});
    const b=await read({to:`${n}-07-01`,view:'incomplete',limit:100,after_id:a.body.data.pagination.next_after_id});expect(b.body.data.items).toHaveLength(1);
    expect(new Set([...a.body.data.items,...b.body.data.items].map(e=>e.enrollment_id)).size).toBe(101);
  });
  it('resolves retained names while preserving original enrollment ownership',async()=>{
    const e=await make(),canonical=randomUUID();await mark(e.id,1,'absent','absent');
    await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Retained','Monitor','1993-01-01','female')",[canonical]);
    const body={canonical_id:canonical,duplicate_id:e.learner,canonical_version:1,duplicate_version:1,action:'link',reason};
    const p=await post('/api/v1/learner-reconciliations/preview',body);expect((await post('/api/v1/learner-reconciliations',{...body,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
    const r=await read({},ids.teacher);expect(r.body.data.items[0]).toMatchObject({learner_id:canonical,recorded_learner_id:e.learner,first_name:'Retained',summary:{absent_sessions:2}});
  });
  it('labels frozen months while keeping monitoring live and leaving snapshots intact',async()=>{
    const e=await make();for(let d=1;d<=5;d++)await mark(e.id,d,'absent','absent');
    await cal(Array.from({length:25},(_,i)=>({day_on:date(i+6),action:'set',am:'no_class',pm:'no_class',day_type:'school_break',label:'Explicit nonclass date'})));
    const url=`/api/v1/sections/${section}/attendance/months`,body={month_on:date(),version:0,action:'submit',reason},p=await post(url+'/preview',body);
    expect((await post(url+'/transitions',{...body,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
    await db.pg.query("update edunexus.learners set first_name='Revised' where id=$1",[e.learner]);
    const r=await read({},ids.teacher);expect(r.body.data.source).toBe('live');expect(r.body.data.days.every((d:any)=>d.month_status==='submitted')).toBe(true);
    expect(r.body.data.items[0]).toMatchObject({first_name:'Revised',summary:{longest_absent_date_run:5,absent_sessions:10}});
    const snapshot=await db.pg.query<{name:string}>("select payload->'members'->0->>'first_name' name from edunexus.attendance_month_snapshots where section_id=$1",[section]);expect(snapshot.rows[0]!.name).toBe('Synthetic');
  });
});
