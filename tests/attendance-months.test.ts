import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { monthResponses as responses } from '../src/modules/attendance-months/contracts.js';

describe('Section 3B.2 monthly attendance review and locks', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApp>, year: string, section: string, other: string, start = 1999;
  const reason = 'Synthetic month reconciled against classroom records.';
  const day = (n = 1) => `${start}-06-${String(n).padStart(2,'0')}`;
  const base = (s = section) => `/api/v1/sections/${s}/attendance/months`;
  const post = (url: string, body: object, actor = ids.principal) => request(app).post(url).set('Authorization', `Bearer ${actor}`).send(body);
  const get = (suffix = '', actor = ids.principal, s = section) => request(app).get(base(s) + suffix + `${suffix.includes('?') ? '&' : '?'}month_on=${day()}`).set('Authorization', `Bearer ${actor}`);
  const preview = (action = 'submit', version = 0, actor = ids.principal) => post(base() + '/preview', { month_on: day(), action, version, reason }, actor);
  const commit = (p: any, extra: object = {}, actor = ids.principal) => post(base() + '/transitions', { month_on: p.month_on, version: p.version, action: p.action, reason: p.reason, review_hash: p.review_hash ?? '0'.repeat(64), reviewed: true, ...extra }, actor);
  const transition = async (action = 'submit', version = 0, actor = ids.principal) => {
    const p = await preview(action, version, actor); expect(p.status, JSON.stringify(p.body)).toBe(201); expect(responses.monthPreview!.safeParse(p.body.data).success).toBe(true);
    const c = await commit(p.body.data, {}, actor); expect(c.status, JSON.stringify(c.body)).toBe(201); expect(responses.monthCommit!.safeParse(c.body.data).success).toBe(true); return c.body.data;
  };
  const make = async (s = section, enrolled = day(), learner?: string) => {
    const id = learner ?? randomUUID();
    if (!learner) await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Synthetic',$2,'1993-01-01','female')", [id,id]);
    const rows = await db.asUser(ids.principal, async tx => { await tx.query("select set_config('edunexus.request_id',$1,true)", [randomUUID()]); return tx.query("select * from edunexus.enroll_learner($1,$2,$3,'regular')", [id,s,enrolled]); });
    return { id: String(rows[0]!.id), learner: id };
  };
  const calendar = async (changes: object[], s: string | null = null) => {
    const version = (await db.pg.query<{version:number}>('select version from edunexus.instructional_calendars where id=$1',[year])).rows[0]?.version ?? 0;
    const url = `/api/v1/academic-years/${year}/calendar`, body = { version, changes, section_id: s, reason };
    const p = await post(url+'/preview', body); expect(p.status,JSON.stringify(p.body)).toBe(201);
    return post(url+'/corrections', {...body,review_hash:p.body.data.review_hash,reviewed:true});
  };
  const classroom = () => calendar([{day_on:day(),action:'set',am:'classroom',pm:'classroom',day_type:'regular',label:'Synthetic class'}],section);
  const attendance = async (id: string, am = 'present', pm = 'absent', version = 0) => {
    const url = `/api/v1/sections/${section}/attendance`,body={day_on:day(),version,changes:[{enrollment_id:id,am,pm}],reason};
    const p=await post(url+'/preview',body); expect(p.status,JSON.stringify(p.body)).toBe(201);
    const c=await post(url+'/corrections',{...body,review_hash:p.body.data.review_hash,reviewed:true});expect(c.status,JSON.stringify(c.body)).toBe(201);return c.body.data;
  };
  const counts=async()=>(await db.pg.query(`select (select count(*)::int from edunexus.attendance_months) roots,(select count(*)::int from edunexus.attendance_month_snapshots) snapshots,
    (select count(*)::int from edunexus.attendance_month_events) events,(select count(*)::int from edunexus.audit_events) audits`)).rows;
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token};}}});});
  beforeEach(async()=>{
    // These business cases are independent of the limiter's separate test suite.
    await db.pg.query('delete from edunexus.request_buckets');
    if(year)await db.pg.query("update edunexus.academic_years set status='closed' where id=$1 and status='active'",[year]);
    start++;year=randomUUID();section=randomUUID();other=randomUUID();
    await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[year,start,day(),`${start+1}-03-31`]);
    for(const [id,actor] of [[section,ids.teacher],[other,ids.otherTeacher]])await db.pg.query('insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,$3,$4)',[id,year,id,actor]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term',$2,$3)",[year,day(),`${start+1}-03-31`]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1",[year]);
    expect((await calendar(Array.from({length:30},(_,i)=>({day_on:day(i+1),action:'set',am:'no_class',pm:'no_class',day_type:'school_break',label:'Explicit synthetic nonclass day'})))).status).toBe(201);
  });
  afterAll(async()=>db?.database.close());

  it('reads complete dated membership and missing sessions without creating workflow rows',async()=>{
    const e=await make();expect((await classroom()).status).toBe(201);const before=await counts();
    const r=await get();expect(r.status,JSON.stringify(r.body)).toBe(200);expect(responses.monthGet!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({status:'draft',version:0,source:'live',can_submit:false,issues:['MISSING_MARKS'],review:{summary:{member_count:1,dates_requested:30,expected_sessions:2,missing_sessions:2}}});
    expect(await counts()).toEqual(before);const m=await get('/members');expect(responses.monthSnapshot!.safeParse(m.body.data).success).toBe(true);
    expect(m.body.data.items[0].enrollment_id).toBe(e.id);expect(m.body.data.items[0].dates[0]).toEqual({day_on:day(),am:null,pm:null});expect(m.body.data.items[0].dates).toHaveLength(30);
    const p=await preview();expect(p.body.data).toMatchObject({can_commit:false,review_hash:null});expect((await commit(p.body.data)).body.error.code).toBe('MONTH_INCOMPLETE');
  });
  it('freezes a complete submission and locks it with attributable immutable evidence',async()=>{
    const e=await make();await classroom();await attendance(e.id);const before=await counts(),p=await preview();expect(await counts()).toEqual(before);
    const c=await commit(p.body.data);expect(c.status,JSON.stringify(c.body)).toBe(201);expect(c.body.data).toMatchObject({month_version:1,action:'submit',actor_user_id:ids.principal,request_id:c.body.requestId});
    const locked=await transition('lock',1,ids.officer);expect(locked.snapshot_id).toBe(c.body.data.snapshot_id);
    const r=await get();expect(r.body.data).toMatchObject({status:'locked',version:2,source:'submission_snapshot',review:{summary:{present_sessions:1,absent_sessions:1,missing_sessions:0}}});
    const s=await get('/status',ids.teacher);expect(responses.monthStatus!.safeParse(s.body.data).success).toBe(true);expect(s.body.data.status).toBe('locked');expect(s.body.data).not.toHaveProperty('review');expect(s.body.data).not.toHaveProperty('snapshot_id');
  });
  it('rejects unconfigured dates and ADM even where classroom marks are complete',async()=>{
    await make();expect((await calendar([{day_on:day(2),action:'clear'}])).status).toBe(201);
    expect((await preview()).body.data.issues).toContain('UNCONFIGURED_DATES');
    expect((await calendar([{day_on:day(2),action:'set',am:'alternative_delivery',pm:'suspended',day_type:'suspension',label:'Synthetic continuity'}])).status).toBe(201);
    const p=await preview();expect(p.body.data).toMatchObject({can_commit:false,issues:['UNSUPPORTED_ADM']});expect((await commit(p.body.data)).body.error.code).toBe('MONTH_INCOMPLETE');
  });
  it('blocks attendance editing while submitted and invalidates pre-submission daily reviews after return',async()=>{
    const e=await make();await classroom();await attendance(e.id);
    const url=`/api/v1/sections/${section}/attendance`,body={day_on:day(),version:1,changes:[{enrollment_id:e.id,am:'absent',pm:'absent'}],reason};
    const p=await post(url+'/preview',body);await transition();
    expect((await post(url+'/preview',body)).body.error.code).toBe('MONTH_FROZEN');expect((await post(url+'/corrections',{...body,review_hash:p.body.data.review_hash,reviewed:true})).body.error.code).toBe('MONTH_FROZEN');
    const sheet=await request(app).get(url+`?day_on=${day()}`).set('Authorization',`Bearer ${ids.teacher}`);expect(sheet.body.data).toMatchObject({month_status:'submitted',month_version:1,recording_available:false});
    await transition('return',1);expect((await post(url+'/corrections',{...body,review_hash:p.body.data.review_hash,reviewed:true})).body.error.code).toBe('ATTENDANCE_REVIEW_CHANGED');
    await attendance(e.id,'absent','absent',1);
  });
  it('preserves old snapshots through reopening, corrections and resubmission',async()=>{
    const e=await make();await classroom();await attendance(e.id);const first=await transition();await transition('lock',1);await transition('reopen',2);
    await attendance(e.id,'absent','present',1);const next=await transition('submit',3);expect(next.snapshot_id).not.toBe(first.snapshot_id);
    const old=await get('/members?snapshot_id='+first.snapshot_id);expect(old.body.data.items[0].dates[0]).toMatchObject({am:'present',pm:'absent'});
    expect((await get('/members')).body.data.items[0].dates[0]).toMatchObject({am:'absent',pm:'present'});
    const h=await get('/transitions?limit=2');expect(responses.monthHistory!.safeParse(h.body.data).success).toBe(true);expect(h.body.data.pagination.next_before_version).toBe(3);
    expect((await get('/transitions?before_version=3')).body.data.items.map((v:any)=>v.action)).toEqual(['lock','submit']);
  });
  it('rejects stale, altered and competing transitions without duplicate snapshots',async()=>{
    await make();const p=(await preview()).body.data;
    expect((await commit(p,{},ids.officer)).body.error.code).toBe('MONTH_REVIEW_CHANGED');expect((await commit(p,{reason:'Another checked month review reason.'})).body.error.code).toBe('MONTH_REVIEW_CHANGED');
    expect((await commit(p,{reviewed:false})).status).toBe(422);
    const results=await Promise.all([commit(p),commit(p)]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect((await commit(p)).body.error.code).toBe('VERSION_CONFLICT');
    expect((await db.pg.query('select id from edunexus.attendance_month_snapshots where section_id=$1',[section])).rows).toHaveLength(1);
    expect((await preview('reopen',1)).body.error.code).toBe('MONTH_TRANSITION');
  });
  it('invalidates submission review after changes to marks, roster or learner display',async()=>{
    const e=await make();await classroom();await attendance(e.id);let p=(await preview()).body.data;
    await attendance(e.id,'absent','present',1);expect((await commit(p)).body.error.code).toBe('MONTH_REVIEW_CHANGED');p=(await preview()).body.data;
    await db.pg.query("update edunexus.learners set first_name='Revised' where id=$1",[e.learner]);expect((await commit(p)).body.error.code).toBe('MONTH_REVIEW_CHANGED');p=(await preview()).body.data;
    await make(section,day(2));expect((await commit(p)).body.error.code).toBe('MONTH_REVIEW_CHANGED');
  });
  it('blocks calendar changes throughout frozen months, including new section overrides',async()=>{
    await make();await transition();const before=await counts();
    expect((await calendar([{day_on:day(2),action:'set',am:'no_class',pm:'no_class',day_type:'holiday',label:'Changed notice'}])).body.error.code).toBe('MONTH_FROZEN');expect(await counts()).toEqual(before);
    expect((await calendar([{day_on:day(2),action:'set',am:'classroom',pm:'no_class',day_type:'makeup',label:'New exception'}],section)).body.error.code).toBe('MONTH_FROZEN');
    expect((await calendar([{day_on:day(2),action:'set',am:'classroom',pm:'no_class',day_type:'makeup',label:'Unrelated section'}],other)).status).toBe(201);
  });
  it('freezes membership even on no-class dates and allows later unrelated movements',async()=>{
    const e=await make();await transition();
    await expect(make(section,day(2))).rejects.toMatchObject({code:'P0708'});
    const move=(effective_on:string)=>post(`/api/v1/enrollments/${e.id}/movements`,{version:1,action:'withdrawn',effective_on,exit_reason:'withdrawal'});
    expect((await move(day(15))).body.error.code).toBe('MONTH_DEPENDENCY');expect((await move(`${start}-07-01`)).status).toBe(201);
    expect((await get('/members')).body.data.items[0].dates).toHaveLength(30);
  });
  it('rejects void and historical reassignment until returned, rolling back correction evidence',async()=>{
    const e=await make();await transition();const before=await counts();
    const body={version:1,action:'void',reason_code:'incorrect_entry',reason},url=`/api/v1/enrollments/${e.id}/record-review`;
    const p=await post(url+'/preview',body);expect((await post(url,{...body,review_hash:p.body.data.review_hash,reviewed:true})).body.error.code).toBe('MONTH_DEPENDENCY');expect(await counts()).toEqual(before);
    const t={version:1,reason,entries:[{event_type:'enrolled',effective_on:day(),section_id:other,reason:'regular'}]},turl=`/api/v1/enrollments/${e.id}/timeline`;
    const tp=await post(turl+'/preview',t);expect((await post(turl+'/corrections',{...t,review_hash:tp.body.data.review_hash,reviewed:true})).body.error.code).toBe('MONTH_DEPENDENCY');
    const grade2=randomUUID();await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name) values($1,$2,2,'Synthetic corrected grade')",[grade2,year]);
    const placement={version:1,grade_level:2,reason,entries:[{event_type:'enrolled',effective_on:day(),section_id:grade2,reason:'regular'}]},purl=`/api/v1/enrollments/${e.id}/placement`;
    const pp=await post(purl+'/preview',placement);expect((await post(purl+'/corrections',{...placement,review_hash:pp.body.data.review_hash,reviewed:true})).body.error.code).toBe('MONTH_DEPENDENCY');
    await transition('return',1);expect((await post(turl+'/corrections',{...t,review_hash:tp.body.data.review_hash,reviewed:true})).status).toBe(201);
  });
  it('blocks identity reconciliation while frozen and retains frozen names across profile and adviser edits',async()=>{
    const e=await make();const first=await transition(),canonical=randomUUID();
    await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) values($1,'Retained','Synthetic','1993-01-01','female')",[canonical]);
    const b={canonical_id:canonical,duplicate_id:e.learner,canonical_version:1,duplicate_version:1,action:'link',reason};const p=await post('/api/v1/learner-reconciliations/preview',b);
    expect((await post('/api/v1/learner-reconciliations',{...b,review_hash:p.body.data.review_hash,reviewed:true})).body.error.code).toBe('MONTH_DEPENDENCY');
    await db.pg.query("update edunexus.learners set first_name='Updated display' where id=$1",[e.learner]);
    await db.pg.query('update edunexus.sections set adviser_user_id=$2 where id=$1',[section,ids.otherTeacher]);
    expect((await get('/status',ids.teacher)).status).toBe(404);expect((await get('/status',ids.otherTeacher)).status).toBe(200);
    expect((await get('/members?snapshot_id='+first.snapshot_id)).body.data.items[0].first_name).toBe('Synthetic');
  });
  it('keeps teacher and anonymous access limited to assigned status without hidden roster snapshots',async()=>{
    await make();const first=await transition();
    for(const suffix of ['', '/members','/transitions'])expect((await get(suffix,ids.teacher)).status).toBe(403);
    expect((await preview('lock',1,ids.teacher)).status).toBe(403);expect((await get('/status',ids.otherTeacher)).status).toBe(404);expect((await get('/status',ids.inactive)).status).toBe(403);
    expect((await request(app).get(base()+`?month_on=${day()}`)).status).toBe(401);
    expect(await db.asUser(ids.teacher,tx=>tx.query('select id from edunexus.attendance_month_snapshots'))).toEqual([]);
    expect((await get('/members?snapshot_id='+first.snapshot_id,ids.principal,other)).status).toBe(404);
    for(const actor of [null,ids.teacher,ids.inactive])await expect(db.asUser(actor,tx=>tx.query('select edunexus.read_attendance_month($1,$2)',[section,day()]))).rejects.toMatchObject({code:'42501'});
    for(const sql of ['update edunexus.attendance_months set status=\'draft\'','delete from edunexus.attendance_month_events','update edunexus.attendance_month_snapshots set payload=\'{}\'','select edunexus.build_attendance_month(\'{}\')','select edunexus.read_daily_attendance_before_months($1,$2,50,null)','select edunexus.preview_daily_attendance_before_months($1,$2,0,\'[]\',\'Synthetic reason\')'])await expect(db.asUser(ids.principal,tx=>tx.query(sql,sql.includes('$1')?[section,day()]:[]))).rejects.toMatchObject({code:'42501'});
  });
  it('paginates more than 100 frozen members without loss and audits only returned IDs',async()=>{
    const enrolled=[];for(let n=0;n<101;n++)enrolled.push(await make());await transition();
    const first=await get('/members?limit=100');expect(first.body.data.items).toHaveLength(100);const next=await get('/members?limit=100&after_id='+first.body.data.pagination.next_after_id);expect(next.body.data.items).toHaveLength(1);
    expect(new Set([...first.body.data.items,...next.body.data.items].map(v=>v.enrollment_id)).size).toBe(101);
    const logs=(await db.pg.query<{record_ids:string[]}>("select record_ids from edunexus.record_access_events where resource='monthSnapshot' and $1=any(record_ids)",[next.body.data.items[0].enrollment_id])).rows;expect(logs[0]!.record_ids).toHaveLength(1);
  });
  it('rolls back snapshots, roots and audits if the final transition journal fails',async()=>{
    await make();const p=(await preview()).body.data,before=await counts();
    await db.pg.exec("create function edunexus.synthetic_month_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.attendance_month_events for each row execute function edunexus.synthetic_month_failure();");
    try{expect((await commit(p)).status).toBe(500);expect(await counts()).toEqual(before);}finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.attendance_month_events; drop function edunexus.synthetic_month_failure();');}
    expect((await commit(p)).status).toBe(201);
  });
  it('validates month boundaries and page limits and preserves closed-year manager reads',async()=>{
    expect((await request(app).get(base()+'?month_on='+day(2)).set('Authorization',`Bearer ${ids.principal}`)).status).toBe(422);
    expect((await get('/members?limit=101')).status).toBe(422);expect((await get('/transitions?limit=11')).status).toBe(422);
    await expect(db.asUser(ids.principal,tx=>tx.query('select edunexus.read_attendance_month($1,$2)',[section,`${start}-05-01`]))).rejects.toMatchObject({code:'P0700'});
    await make();await transition();await transition('lock',1);await db.pg.query("update edunexus.academic_years set status='closed' where id=$1",[year]);
    expect((await get()).status).toBe(200);expect((await get('/status',ids.teacher)).status).toBe(404);expect((await preview('reopen',2)).body.error.code).toBe('MONTH_YEAR');
  });
  it('clips partial school-year months and includes leap-day dates exactly once',async()=>{
    const y=randomUUID(),s=randomUUID();await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2023,'2023-06-15','2024-03-15')",[y]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name) values($1,$2,1,'Synthetic partial year')",[s,y]);
    for(const [month,from,to,count] of [['2023-06-01','2023-06-15','2023-06-30',16],['2024-02-01','2024-02-01','2024-02-29',29],['2024-03-01','2024-03-01','2024-03-15',15]]) {
      const r=await request(app).get(base(s)+'?month_on='+month).set('Authorization',`Bearer ${ids.principal}`);expect(r.status).toBe(200);expect(r.body.data).toMatchObject({from,to,review:{summary:{dates_requested:count,unconfigured_dates:count}}});
      expect(new Set(r.body.data.review.days.map((v:any)=>v.day_on)).size).toBe(count);
    }
  });
  it('does not accept a month ending today even when every configured session is nonclass',async()=>{
    await db.pg.query("update edunexus.academic_years set status='closed' where id=$1",[year]);
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}),currentYear=Number(today.slice(0,4)),month=today.slice(0,8)+'01';
    year=randomUUID();section=randomUUID();await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)',[year,currentYear-1,`${currentYear-1}-12-01`,today]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name) values($1,$2,1,'Synthetic current month')",[section,year]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Current term',$2,$3)",[year,`${currentYear-1}-12-01`,today]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1",[year]);
    expect((await calendar(Array.from({length:Number(today.slice(8))},(_,i)=>({day_on:today.slice(0,8)+String(i+1).padStart(2,'0'),action:'set',am:'no_class',pm:'no_class',day_type:'school_break',label:'Synthetic nonclass date'})))).status).toBe(201);
    const p=await post(base()+'/preview',{month_on:month,action:'submit',version:0,reason});expect(p.body.data).toMatchObject({can_commit:false,issues:['MONTH_NOT_ENDED']});
  });
  it('fails explicitly beyond the supported monthly processing size',async()=>{
    const learners=Array.from({length:1001},()=>randomUUID());
    await db.pg.query("insert into edunexus.learners(id,first_name,last_name,birth_date,sex) select id,'Synthetic','Large review','1993-01-01','female' from unnest($1::uuid[]) id",[learners]);
    // PGlite has no autovacuum worker to refresh planner statistics after the
    // preceding cases and this bulk fixture. Keep all enrollment guards enabled.
    await db.pg.exec('analyze');
    await db.asUser(ids.principal,async tx=>{await tx.query("select set_config('edunexus.request_id',$1,true)",[randomUUID()]);await tx.query("select (edunexus.enroll_learner(id,$2,$3,'regular')).id from unnest($1::uuid[]) id",[learners,section,day()]);});
    expect((await get()).body.error.code).toBe('MONTH_SIZE');expect((await get('/members')).body.error.code).toBe('MONTH_SIZE');
  });
});
