import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createApp} from '../src/http-app.js';
import type {Database,Query,Row} from '../src/core/db.js';
import {ids} from './helpers/database.js';

/**
 * The lock-ordering races the 20 September review found in the score writers,
 * reproduced on a real multi-connection PostgreSQL rather than asserted as
 * text. PGlite runs one transaction at a time, so the ordinary suite cannot
 * show two writers interleaving at all.
 *
 * Before 0022, `write_assessment_task` and `record_assessment_scores` read the
 * task, then took the shared academic lock. A second writer could therefore
 * read the task, wait on the lock while the first changed it, and carry on
 * with what it had read: a lost update, or a mark above a maximum that had
 * just been lowered. 0022 takes the lock first. Each scenario runs against the
 * 0021 definition to prove the race is real and visible to this test, then
 * against the 0022 definition to prove it is closed.
 *
 * Opt-in: set EDUNEXUS_RACE_PG_URL to a superuser URL of a disposable server,
 * for example a local container. The test creates and drops its own database
 * and the edunexus_app role, so never point it at a shared or hosted server.
 * `npm run test:race` starts a container, runs this, and removes it.
 */
const url=process.env.EDUNEXUS_RACE_PG_URL;

describe.skipIf(!url)('academic writers and attendance readers under real concurrency',{timeout:60000},()=>{
  const name='edunexus_race';
  let admin:pg.Pool,pool:pg.Pool,app:ReturnType<typeof createApp>;
  const year=randomUUID(),section=randomUUID(),period=randomUUID(),other=randomUUID();
  let offering='',enrollment='',otherEnrollment='',sequence=0;
  const reason='Synthetic race regression on a disposable database.';
  const http=(method:'post'|'get',path:string,body?:object)=>{const r=request(app)[method](`/api/v1${path}`).set('Authorization',`Bearer ${ids.principal}`);return body?r.send(body):r;};
  const sql=(text:string,params:unknown[]=[])=>pool.query(text,params);

  /** The body of one function as a given migration defined it, made replaceable. */
  const definition=async(file:string,fn:string)=>{
    const text=await readFile(`database/migrations/${file}`,'utf8');
    const start=text.search(new RegExp(`create (or replace )?function edunexus\\.${fn}\\(`));
    const end=text.indexOf('\nend $$;',start);
    expect(start,`${fn} in ${file}`).toBeGreaterThanOrEqual(0);
    return text.slice(start,end+'\nend $$;'.length).replace(/^create function/,'create or replace function');
  };
  const install=async(file:string)=>{for(const fn of ['write_assessment_task','record_assessment_scores'])await sql(await definition(file,fn));};

  /** A transaction on its own connection, as the runtime role, acting as the principal. */
  const session=async()=>{
    const client=await pool.connect();
    await client.query('begin');
    await client.query('set local role edunexus_app');
    // The same context the HTTP layer sets on every transaction: actor, request and timeouts.
    await client.query(`select set_config('edunexus.actor_id',$1,true),set_config('edunexus.request_id',$2,true),set_config('statement_timeout','15000',true)`,[ids.principal,randomUUID()]);
    const [{pid}]=(await client.query<{pid:number}>('select pg_backend_pid() pid')).rows as [{pid:number}];
    return {client,pid};
  };
  /** Waits until a backend is genuinely blocked on a lock, so the interleaving is certain rather than hoped for. */
  const waiting=async(pid:number)=>{
    for(let i=0;i<200;i++){
      const [row]=(await admin.query(`select wait_event_type from pg_stat_activity where datname=$1 and pid=$2`,[name,pid])).rows;
      if(row?.wait_event_type==='Lock')return;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw new Error('The second writer never waited on the lock');
  };
  const outcome=async(work:Promise<unknown>)=>work.then(()=>'saved',(error:{code?:string})=>error.code??'failed');
  const newTask=async()=>{
    const r=await http('post',`/section-subjects/${offering}/assessment-tasks`,{reporting_period_id:period,component_code:'WW',sequence:++sequence,title:`Synthetic quiz ${sequence}`,max_score:20,reason});
    expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data as {id:string;version:number};
  };

  /** Runs a two-session scenario and always hands both connections back, even when an assertion fails mid-race. */
  const pair=async<T>(work:(a:Awaited<ReturnType<typeof session>>,b:Awaited<ReturnType<typeof session>>)=>Promise<T>)=>{
    const a=await session(),b=await session();
    try{return await work(a,b);}
    finally{for(const s of [a,b]){await s.client.query('rollback').catch(()=>{});s.client.release();}}
  };

  /** Two managers retitle the same task from the same version. */
  const retitle=async()=>{
    const task=await newTask();
    return pair(async(first,second)=>{
    // The granted wrapper the service calls; the private writer it delegates to is where the lock is taken.
    const write=`select * from edunexus.update_assessment_task($1,$2,$3,20,'open',$4)`;
    await first.client.query(write,[task.id,task.version,'Retitled by the first manager',reason]);
    const pending=outcome(second.client.query(write,[task.id,task.version,'Retitled by the second manager',reason]));
    await waiting(second.pid);
    await first.client.query('commit');
    const result=await pending;
    await second.client.query(result==='saved'?'commit':'rollback');
    const [row]=(await sql('select title,version from edunexus.assessment_tasks where id=$1',[task.id])).rows;
    return {second:result,title:row.title as string,version:row.version as number};
    });
  };

  /** One manager lowers a maximum while an adviser records a mark the old maximum allowed. */
  const markAboveNewMaximum=async()=>{
    const task=await newTask();
    return pair(async(lower,mark)=>{
    await lower.client.query(`select * from edunexus.update_assessment_task($1,$2,$3,10,'open',$4)`,[task.id,task.version,`Synthetic quiz ${sequence}`,reason]);
    const pending=outcome(mark.client.query(`select edunexus.record_assessment_scores($1,$2::jsonb,$3)`,[task.id,JSON.stringify([{enrollment_id:enrollment,raw_score:15,version:0}]),reason]));
    await waiting(mark.pid);
    await lower.client.query('commit');
    const result=await pending;
    await mark.client.query(result==='saved'?'commit':'rollback');
    const [task2]=(await sql('select max_score from edunexus.assessment_tasks where id=$1',[task.id])).rows;
    const scores=(await sql('select raw_score from edunexus.assessment_scores where task_id=$1',[task.id])).rows;
    return {mark:result,maximum:Number(task2.max_score),scores:scores.map(s=>Number(s.raw_score))};
    });
  };

  // ------------------------------------------------------------ attendance
  // Migration 0023: attendance reads take the academic lock shared, and the one
  // writer that relied on them for its exclusive lock takes it itself, first.
  const day='2001-06-04';
  /** 0011 named the context attendance_context; 0012 renamed it to wrap it, so that is where its body lives now. */
  const installAttendance=async(context:string,commit:string)=>{
    const named=context.startsWith('0011')?'attendance_context':'attendance_context_before_months';
    await sql((await definition(context,named)).replace('edunexus.attendance_context(','edunexus.attendance_context_before_months('));
    await sql(await definition(commit,'commit_daily_attendance'));
  };
  const read=(s:Awaited<ReturnType<typeof session>>)=>s.client.query(`select edunexus.read_daily_attendance($1,$2,100,null) sheet`,[section,day]);
  const commit=(s:Awaited<ReturnType<typeof session>>,version:number,mark:string|null,hash:string,where=section,who=enrollment)=>
    s.client.query(`select * from edunexus.commit_daily_attendance($1,$2,$3,$4::jsonb,$5,$6)`,[where,day,version,JSON.stringify([{enrollment_id:who,am:mark,pm:mark}]),reason,hash]);
  /** The reviewed hash for marking a learner, as the screen gets it before confirming. */
  const reviewed=async(version:number,mark:string|null,where=section,who=enrollment)=>{
    const r=await http('post',`/sections/${where}/attendance/preview`,{day_on:day,version,changes:[{enrollment_id:who,am:mark,pm:mark}],reason});
    expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data.review_hash as string;
  };
  const dayVersion=async(where=section)=>(await sql('select version from edunexus.attendance_days where section_id=$1 and day_on=$2',[where,day])).rows[0]?.version as number??0;
  const markOnFile=async(who=enrollment)=>(await sql('select am from edunexus.attendance_marks where enrollment_id=$1 and day_on=$2',[who,day])).rows[0]?.am as string|undefined;
  /** A mark different from the one on file, so a proposal is never an unchanged no-op. */
  const another=async(who=enrollment)=>{const current=(await markOnFile(who))??null;return current==='present'?'absent':'present';};
  /** Resolves with the query's result if it finishes within the window, or 'blocked' if it is still waiting. */
  const within=<T,>(work:Promise<T>,ms:number)=>Promise.race([work,new Promise<'blocked'>(resolve=>setTimeout(()=>resolve('blocked'),ms))]);

  beforeAll(async()=>{
    admin=new pg.Pool({connectionString:url,max:2});
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.query('drop role if exists edunexus_app');
    await admin.query(`create database ${name}`);
    const target=new URL(url!);target.pathname=`/${name}`;
    pool=new pg.Pool({connectionString:target.toString(),max:6,types:{getTypeParser(oid:number,format?:string){return oid===1082?((v:string)=>v):pg.types.getTypeParser(oid,format as never);}} as never});
    await sql('create schema auth; create table auth.users (id uuid primary key);');
    for(const file of (await readdir('database/migrations')).filter(f=>f.endsWith('.sql')).sort())await sql(await readFile(`database/migrations/${file}`,'utf8'));
    for(const id of Object.values(ids))await sql('insert into auth.users(id) values($1)',[id]);
    for(const [key,role,active] of [['principal','principal',true],['officer','administrative_officer',true],['teacher','teacher',true],['otherTeacher','teacher',true],['inactive','teacher',false]] as const)
      await sql('insert into edunexus.staff(user_id,display_name,role,active) values($1,$2,$3,$4)',[ids[key],`Synthetic ${key}`,role,active]);
    await sql("insert into edunexus.school_profile(name,address) values('Synthetic race school','Synthetic address')");

    // The runtime's own transaction shape, over real connections.
    const database:Database={
      async transaction<T>(work:(tx:Query)=>Promise<T>){
        const client=await pool.connect();
        try{
          await client.query('begin');await client.query('set local role edunexus_app');
          const result=await work({async query<R extends Row>(text:string,params:unknown[]=[]){return (await client.query(text,params)).rows as R[];}});
          await client.query('commit');return result;
        }catch(error){await client.query('rollback');throw error;}finally{client.release();}
      },
      async close(){await pool.end();},
    };
    app=createApp({database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token};}}});

    await sql("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-01','2002-03-31')",[year]);
    await sql("insert into edunexus.reporting_periods(id,academic_year_id,ordinal,name,starts_on,ends_on) values($1,$2,1,'Synthetic term','2001-06-01','2002-03-31')",[period,year]);
    await sql("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,4,'Synthetic Race',$3),($4,$2,4,'Synthetic Other',$5)",[section,year,ids.teacher,other,ids.otherTeacher]);
    await sql("update edunexus.academic_years set status='active' where id=$1",[year]);
    const subject=await http('post','/subjects',{code:'SCI4',name:'Science',kind:'learning_area',grade_levels:[4],active:true,reason});
    const offered=await http('post',`/sections/${section}/subjects`,{subject_id:subject.body.data.id,subject_version:1,display_order:1,reason});offering=offered.body.data.id;
    const draft=await http('post','/assessment-policy-drafts',{code:'RACE',name:'Synthetic race policy',source_reference:'Synthetic reference for a race test only.',grade_levels:[4],
      components:[{code:'WW',name:'Written work',weight_basis_points:10000}],status:'draft',reason});
    expect(draft.status,JSON.stringify(draft.body)).toBe(201);
    const adopted=await http('post','/assessment-policy-adoptions',{academic_year_id:year,policy_id:draft.body.data.id,policy_version:1,adopted_on:'2001-06-01',adoption_reference:'Synthetic memorandum for a race test.',reason});
    expect(adopted.status,JSON.stringify(adopted.body)).toBe(201);
    const bound=await http('post','/assessment-policy-bindings',{offering_id:offering,offering_version:offered.body.data.version,adoption_id:adopted.body.data.id,adoption_version:adopted.body.data.version,reason});
    expect(bound.status,JSON.stringify(bound.body)).toBe(201);
    const learner=await http('post','/learners',{first_name:'Synthetic',last_name:'Racer',birth_date:'1994-01-01',sex:'female'});
    const enrolled=await http('post','/enrollments',{learner_id:learner.body.data.id,section_id:section,enrolled_on:'2001-06-01'});
    expect(enrolled.status,JSON.stringify(enrolled.body)).toBe(201);enrollment=enrolled.body.data.id;
    const second=await http('post','/learners',{first_name:'Synthetic',last_name:'Neighbour',birth_date:'1994-01-01',sex:'male'});
    const placed=await http('post','/enrollments',{learner_id:second.body.data.id,section_id:other,enrolled_on:'2001-06-01'});
    expect(placed.status,JSON.stringify(placed.body)).toBe(201);otherEnrollment=placed.body.data.id;
    const calendar={version:0,section_id:null,reason,changes:[{day_on:day,action:'set',am:'classroom',pm:'classroom',day_type:'regular',label:'Synthetic day'}]};
    const cp=await http('post',`/academic-years/${year}/calendar/preview`,calendar);expect(cp.status,JSON.stringify(cp.body)).toBe(201);
    expect((await http('post',`/academic-years/${year}/calendar/corrections`,{...calendar,review_hash:cp.body.data.review_hash,reviewed:true})).status).toBe(201);
  },120000);

  afterAll(async()=>{
    await pool?.end();
    if(admin){await admin.query(`drop database if exists ${name} with (force)`);await admin.query('drop role if exists edunexus_app');await admin.end();}
  });

  it('loses the first manager’s change under the 0021 definition, which is the race the review described',async()=>{
    await install('0021_assessment_scores.sql');
    const result=await retitle();
    expect(result).toEqual({second:'saved',title:'Retitled by the second manager',version:3});
  });

  it('refuses the stale writer under 0022 instead of overwriting',async()=>{
    await install('0022_assessment_score_corrections.sql');
    const result=await retitle();
    expect(result).toEqual({second:'P0003',title:'Retitled by the first manager',version:2});
  });

  it('records a mark above a just-lowered maximum under 0021',async()=>{
    await install('0021_assessment_scores.sql');
    const result=await markAboveNewMaximum();
    expect(result).toEqual({mark:'saved',maximum:10,scores:[15]});
  });

  it('refuses that mark under 0022, because the maximum is read after the lock',async()=>{
    await install('0022_assessment_score_corrections.sql');
    const result=await markAboveNewMaximum();
    expect(result).toEqual({mark:'P1605',maximum:10,scores:[]});
  });

  it('queues one register read behind another under 0011, which is what failed at 27 advisers',async()=>{
    await installAttendance('0011_daily_attendance.sql','0011_daily_attendance.sql');
    await pair(async(first,second)=>{
      await read(first);
      const pending=read(second);
      await waiting(second.pid);
      await first.client.query('commit');
      expect((await pending).rows[0].sheet.items).toHaveLength(1);
    });
  });

  it('lets register reads run side by side under 0023',async()=>{
    await installAttendance('0023_attendance_read_lock.sql','0023_attendance_read_lock.sql');
    await pair(async(first,second)=>{
      await read(first);
      // The first read still holds its lock, uncommitted; the second no longer waits for it.
      const result=await within(read(second),3000);
      expect(result).not.toBe('blocked');
    });
  });

  it('still keeps a reader and a writer apart under 0023, in both orders',async()=>{
    await installAttendance('0023_attendance_read_lock.sql','0023_attendance_read_lock.sql');
    // A writer holding the lock makes a reader wait, and the reader then sees the finished write.
    const before=await dayVersion(),hash=await reviewed(before,'present');
    await pair(async(writer,reader)=>{
      await commit(writer,before,'present',hash);
      const pending=read(reader);
      await waiting(reader.pid);
      await writer.client.query('commit');
      const sheet=(await pending).rows[0].sheet;
      expect(sheet.version).toBe(before+1);
      expect(sheet.items[0]).toMatchObject({am:'present',pm:'present'});
    });
    // A reader holding the lock makes a writer wait until the read is over.
    const next=await dayVersion(),absent=await reviewed(next,'absent');
    await pair(async(reader,writer)=>{
      await read(reader);
      const pending=outcome(commit(writer,next,'absent',absent));
      await waiting(writer.pid);
      await reader.client.query('commit');
      expect(await pending).toBe('saved');
      await writer.client.query('commit');
    });
    expect(await markOnFile()).toBe('absent');
  });

  it('refuses the second of two writers from the same version with a version conflict under 0023',async()=>{
    // With the shared context but 0011's commit, two confirmations interleave: only the journal's
    // unique key stops the second, as a raw constraint violation rather than a version conflict.
    await installAttendance('0023_attendance_read_lock.sql','0011_daily_attendance.sql');
    const race=async()=>{
      // Two proposals that both differ from what is on file, so neither is an unchanged no-op.
      const version=await dayVersion(),current=(await markOnFile())??null;
      const [x,y]=(['present','absent',null] as (string|null)[]).filter(m=>m!==current) as [string|null,string|null];
      const hx=await reviewed(version,x),hy=await reviewed(version,y);
      return pair(async(first,second)=>{
        // Each confirmation ends its transaction the moment its call returns, as the API's does.
        const settle=(s:Awaited<ReturnType<typeof session>>,work:Promise<unknown>)=>outcome(work).then(async r=>{await s.client.query(r==='saved'?'commit':'rollback');return r;});
        const [a,b]=await Promise.all([settle(first,commit(first,version,x,hx)),settle(second,commit(second,version,y,hy))]);
        return {outcomes:[a,b].sort(),version:(await dayVersion())-version};
      });
    };
    expect(await race()).toEqual({outcomes:['23505','saved'],version:1});
    // With 0023's commit taking the lock first, the second waits, then fails the version check it exists for.
    await installAttendance('0023_attendance_read_lock.sql','0023_attendance_read_lock.sql');
    expect(await race()).toEqual({outcomes:['P0003','saved'],version:1});
  });

  it('lets confirmations for two different sections run side by side under 0023',async()=>{
    await installAttendance('0023_attendance_read_lock.sql','0023_attendance_read_lock.sql');
    const mine=await another(),theirs=await another(otherEnrollment);
    const va=await dayVersion(),vb=await dayVersion(other);
    const ha=await reviewed(va,mine),hb=await reviewed(vb,theirs,other,otherEnrollment);
    await pair(async(first,second)=>{
      await commit(first,va,mine,ha);
      // The first confirmation is still open; the other section's does not wait for it.
      const result=await within(outcome(commit(second,vb,theirs,hb,other,otherEnrollment)),3000);
      expect(result).toBe('saved');
      await first.client.query('commit');await second.client.query('commit');
    });
    expect([await markOnFile(),await markOnFile(otherEnrollment)]).toEqual([mine,theirs]);
  });

  it('still makes a confirmation and a school-wide writer wait for each other under 0023',async()=>{
    await installAttendance('0023_attendance_read_lock.sql','0023_attendance_read_lock.sql');
    const lockSchool=(s:Awaited<ReturnType<typeof session>>)=>s.client.query('select pg_advisory_xact_lock(82412001)');
    // A school-wide writer — a calendar change, a timeline correction, a month submission — holds the lock first.
    let mark=await another(),version=await dayVersion(),hash=await reviewed(version,mark);
    await pair(async(writer,adviser)=>{
      await lockSchool(writer);
      const pending=outcome(commit(adviser,version,mark,hash));
      await waiting(adviser.pid);
      await writer.client.query('commit');
      expect(await pending).toBe('saved');
      await adviser.client.query('commit');
    });
    // And the other way round: an open confirmation holds the school-wide writer back.
    mark=await another();version=await dayVersion();hash=await reviewed(version,mark);
    await pair(async(adviser,writer)=>{
      await commit(adviser,version,mark,hash);
      const pending=outcome(lockSchool(writer));
      await waiting(writer.pid);
      await adviser.client.query('commit');
      expect(await pending).toBe('saved');
    });
    expect(await markOnFile()).toBe(mark);
  });
});
