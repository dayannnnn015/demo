import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {registryResponses} from '../src/modules/registry/contracts.js';

/**
 * The Overview needs to say how many learners are enrolled without naming any
 * of them. Every list under /enrollments writes an access row per record it
 * returns, so counting a roster by paging it would bury the privacy audit.
 * This endpoint answers with numbers only and must never write such a row.
 */
describe('enrollment counts without naming a record',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
  const year=randomUUID(),other=randomUUID(),mine=randomUUID(),theirs=randomUUID(),upper=randomUUID(),old=randomUUID();
  const get=(query:string,actor=ids.principal)=>request(app).get(`/api/v1/enrollment-counts${query}`).set('Authorization',`Bearer ${actor}`);
  const post=(url:string,body:object)=>request(app).post(`/api/v1${url}`).set('Authorization',`Bearer ${ids.principal}`).send(body);
  const access=async()=>(await db.pg.query<{n:number}>('select count(*)::int n from edunexus.record_access_events')).rows[0]!.n;
  const enrol=async(section:string,last:string)=>{
    const l=await post('/learners',{first_name:'Synthetic',last_name:last,birth_date:'1994-01-01',sex:'female'});expect(l.status,JSON.stringify(l.body)).toBe(201);
    const e=await post('/enrollments',{learner_id:l.body.data.id,section_id:section,enrolled_on:'2001-06-01'});expect(e.status,JSON.stringify(e.body)).toBe(201);return e.body.data as {id:string;version:number};
  };
  beforeAll(async()=>{
    db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token};}}});
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-01','2002-03-31'),($2,2000,'2000-06-01','2001-03-31')",[year,other]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2001-06-01','2002-03-31')",[year]);
    await db.pg.query(`insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$5,1,'Synthetic mine',$6),($2,$5,1,'Synthetic theirs',$7),
      ($3,$5,2,'Synthetic upper',null),($4,$8,1,'Synthetic old',null)`,[mine,theirs,upper,old,year,ids.teacher,ids.otherTeacher,other]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1",[year]);
    await enrol(mine,'One');await enrol(mine,'Two');await enrol(theirs,'Three');await enrol(upper,'Four');
    const leaving=await enrol(upper,'Five');
    expect((await post(`/enrollments/${leaving.id}/movements`,{version:leaving.version,action:'withdrawn',effective_on:'2001-06-05',exit_reason:'transfer_out'})).status).toBe(201);
    const mistaken=await enrol(mine,'Six');
    const body={version:mistaken.version,action:'void',reason_code:'incorrect_entry',reason:'Entered in error during synthetic setup.',replacement_enrollment_id:null};
    const p=await post(`/enrollments/${mistaken.id}/record-review/preview`,body);expect(p.status,JSON.stringify(p.body)).toBe(201);
    expect((await post(`/enrollments/${mistaken.id}/record-review`,{...body,review_hash:p.body.data.review_hash,reviewed:true})).status).toBe(201);
  });
  afterAll(async()=>db?.database.close());

  it('counts a school year by grade and status for a manager, leaving voided records out',async()=>{
    const r=await get(`?academic_year_id=${year}`);expect(r.status,JSON.stringify(r.body)).toBe(200);
    expect(registryResponses.enrollmentCounts!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toEqual({academic_year_id:year,scope:'school',record_state:'valid',enrolled:4,withdrawn:1,
      grades:[{grade_level:1,enrolled:3,withdrawn:0},{grade_level:2,enrolled:1,withdrawn:1}]});
    expect((await get(`?academic_year_id=${year}`,ids.officer)).body.data.enrolled).toBe(4);
  });
  it('writes no access record, because it names nobody',async()=>{
    const before=await access();
    expect((await get(`?academic_year_id=${year}`)).status).toBe(200);
    expect((await get(`?academic_year_id=${year}`,ids.teacher)).status).toBe(200);
    expect(await access()).toBe(before);
    // The paged list beside it still does, which is the contrast the endpoint exists for.
    expect((await request(app).get(`/api/v1/enrollments?academic_year_id=${year}`).set('Authorization',`Bearer ${ids.principal}`)).status).toBe(200);
    expect(await access()).toBe(before+1);
  });
  it('counts only what a teacher may already read',async()=>{
    const r=await get(`?academic_year_id=${year}`,ids.teacher);
    expect(r.body.data).toMatchObject({scope:'current_access',enrolled:2,withdrawn:0,grades:[{grade_level:1,enrolled:2,withdrawn:0}]});
    expect((await get(`?academic_year_id=${year}`,ids.otherTeacher)).body.data).toMatchObject({enrolled:1,grades:[{grade_level:1,enrolled:1}]});
  });
  it('answers an empty year with zeros rather than an error, and refuses a missing or malformed year',async()=>{
    expect((await get(`?academic_year_id=${other}`)).body.data).toMatchObject({enrolled:0,withdrawn:0,grades:[]});
    expect((await get('')).status).toBe(422);
    expect((await get('?academic_year_id=not-a-year')).status).toBe(422);
    expect((await get(`?academic_year_id=${year}&section_id=${mine}`)).status).toBe(422);
  });
  it('refuses a caller without school access',async()=>{
    expect((await get(`?academic_year_id=${year}`,ids.inactive)).status).toBe(403);
    expect((await get(`?academic_year_id=${year}`,ids.outsider)).status).toBe(403);
  });
});
