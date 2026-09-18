import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {subjectResponses as responses} from '../src/modules/subjects/contracts.js';
describe('Section 4A.1 subject catalog',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
  const reason='Synthetic catalog details verified for this test.';
  const body=(extra:object={})=>({code:'S'+randomUUID().replaceAll('-','').slice(0,12),name:'Synthetic learning area',kind:'learning_area',grade_levels:[1,2],active:true,reason,...extra});
  const create=(b=body(),actor=ids.principal)=>request(app).post('/api/v1/subjects').set('Authorization',`Bearer ${actor}`).send(b);
  const get=(path:string,actor=ids.principal)=>request(app).get(path).set('Authorization',`Bearer ${actor}`);
  const update=(row:any,extra:object={},actor=ids.principal)=>request(app).patch('/api/v1/subjects/'+row.id).set('Authorization',`Bearer ${actor}`).send({version:row.version,name:row.name,kind:row.kind,grade_levels:row.grade_levels,active:row.active,reason,...extra});
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token};}}});});
  beforeEach(async()=>db.pg.query('delete from edunexus.request_buckets'));
  afterAll(async()=>db?.database.close());
  it('starts with no seeded curriculum and creates canonical codes with explicit Kindergarten applicability',async()=>{
    expect((await get('/api/v1/subjects')).body.data.items).toEqual([]);
    const r=await create(body({code:'syn_domain',kind:'developmental_domain',grade_levels:[1,0]}));expect(r.status,JSON.stringify(r.body)).toBe(201);expect(responses.subjectCreate!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({code:'SYN_DOMAIN',grade_levels:[0,1],version:1});
    const h=await get(`/api/v1/subjects/${r.body.data.id}/events`);expect(h.body.data.items[0]).toMatchObject({action:'create',before_snapshot:null,actor_user_id:ids.principal,request_id:r.body.requestId});
  });
  it('enforces code uniqueness, distinct bounded grades and safe input',async()=>{
    const b=body();expect((await create(b)).status).toBe(201);expect((await create({...b,code:b.code.toLowerCase()})).body.error.code).toBe('ALREADY_EXISTS');
    expect((await create(body({grade_levels:[1,1]}))).status).toBe(409);expect((await create(body({grade_levels:[]}))).status).toBe(422);
    expect((await create(body({grade_levels:[7]}))).status).toBe(422);expect((await create(body({name:'Bad\nname'}))).status).toBe(422);
  });
  it('archives and restores metadata while preserving old values and immutable codes',async()=>{
    const r=(await create()).body.data;const archived=await update(r,{name:'Revised synthetic area',grade_levels:[3],active:false},ids.officer);expect(archived.status).toBe(200);
    expect((await get(`/api/v1/subjects?active=false&q=${r.code}`)).body.data.items[0].id).toBe(r.id);expect((await get(`/api/v1/subjects?q=${r.code}`)).body.data.items).toEqual([]);
    expect((await update(archived.body.data,{active:true})).status).toBe(200);const h=await get(`/api/v1/subjects/${r.id}/events?limit=2`);
    expect(responses.subjectHistory!.safeParse(h.body.data).success).toBe(true);expect(h.body.data.pagination.next_before_version).toBe(2);expect(h.body.data.items[1].before_snapshot.name).toBe(r.name);
    expect((await update(archived.body.data,{code:'NEW_CODE'})).status).toBe(422);
  });
  it('rejects stale and no-op updates and serializes competing saves',async()=>{
    const r=(await create()).body.data;expect((await update(r)).body.error.code).toBe('SUBJECT_UNCHANGED');
    const results=await Promise.all([update(r,{name:'Synthetic one'}),update(r,{name:'Synthetic two'})]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await update(r,{name:'Stale synthetic'})).body.error.code).toBe('VERSION_CONFLICT');
    expect((await get(`/api/v1/subjects/${r.id}/events`)).body.data.items).toHaveLength(2);
  });
  it('allows staff metadata reads while restricting revisions, histories and direct SQL',async()=>{
    const r=(await create()).body.data;expect((await get(`/api/v1/subjects/${r.id}`,ids.teacher)).status).toBe(200);expect((await create(body(),ids.teacher)).status).toBe(403);
    expect((await update(r,{active:false},ids.teacher)).status).toBe(403);expect((await get(`/api/v1/subjects/${r.id}/events`,ids.teacher)).status).toBe(403);
    expect((await get('/api/v1/subjects',ids.inactive)).status).toBe(403);expect((await request(app).get('/api/v1/subjects')).status).toBe(401);
    expect(await db.asUser(null,tx=>tx.query('select id from edunexus.subjects'))).toEqual([]);
    expect(await db.asUser(ids.teacher,tx=>tx.query('select id from edunexus.subject_events'))).toEqual([]);
    for(const sql of ["update edunexus.subjects set active=false","delete from edunexus.subject_events","select edunexus.write_subject(null,0,'X','Synthetic','learning_area',array[1],true,'Synthetic reason')"])
      await expect(db.asUser(ids.principal,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
    await expect(db.asUser(ids.teacher,tx=>tx.query("select edunexus.create_subject('X','Synthetic','learning_area',array[1],true,'Synthetic reason')"))).rejects.toMatchObject({code:'42501'});
  });
  it('rolls back the subject and change audit if the journal insert fails',async()=>{
    const before=(await db.pg.query('select count(*) from edunexus.audit_events')).rows,b=body();
    await db.pg.exec("create function edunexus.synthetic_subject_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.subject_events for each row execute function edunexus.synthetic_subject_failure();");
    try{expect((await create(b)).status).toBe(500);expect((await db.pg.query('select id from edunexus.subjects where code=$1',[b.code])).rows).toEqual([]);expect((await db.pg.query('select count(*) from edunexus.audit_events')).rows).toEqual(before);}
    finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.subject_events; drop function edunexus.synthetic_subject_failure();');}
  });
  it('filters before UUID pagination and treats search characters literally',async()=>{
    const prefix='P'+randomUUID().slice(0,8);for(let i=0;i<5;i++)await create(body({code:prefix+'_'+i,active:i!==4}));
    const first=await get(`/api/v1/subjects?q=${prefix}&limit=2`);expect(first.body.data.items).toHaveLength(2);
    const second=await get(`/api/v1/subjects?q=${prefix}&limit=2&after_id=${first.body.data.pagination.next_after_id}`);expect(new Set([...first.body.data.items,...second.body.data.items].map(r=>r.id)).size).toBe(4);
    expect((await get('/api/v1/subjects?q=%25')).body.data.items).toEqual([]);expect((await get('/api/v1/subjects?limit=101')).status).toBe(422);expect((await get('/api/v1/subjects/'+randomUUID())).status).toBe(404);
  });
});
