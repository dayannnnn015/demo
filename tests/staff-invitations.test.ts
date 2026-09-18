import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import request from 'supertest';
import pino from 'pino';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/http-app.js';
import {testDatabase,ids} from './helpers/database.js';
import {invitationResponses as responses} from '../src/modules/staff-invitations/contracts.js';

describe('Staff invitation records without a privileged runtime credential',()=>{
  let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
  const base='/api/v1/staff-invitations',reason='Synthetic invitation recorded for testing only.';
  const post=(path:string,body:object,actor=ids.principal)=>request(app).post(path).set('Authorization',`Bearer ${actor}`).send(body);
  const get=(path:string,actor=ids.principal)=>request(app).get(path).set('Authorization',`Bearer ${actor}`);
  const address=()=>`synthetic.${randomUUID().slice(0,8)}@example.test`;
  const req=(extra:object={},actor=ids.principal)=>post(base,{email:address(),display_name:'Synthetic teacher',role:'teacher',reason,...extra},actor);
  const made=async(extra:object={},actor=ids.principal)=>{const r=await req(extra,actor);expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data;};
  const provision=(i:any,extra:object={},actor=ids.principal)=>post(`${base}/${i.id}/provision`,{version:i.version,user_id:randomUUID(),reason,...extra},actor);
  const cancel=(i:any,extra:object={},actor=ids.principal)=>post(`${base}/${i.id}/cancellation`,{version:i.version,reason,...extra},actor);
  // The Auth identity must already exist: EDUNEXUS never creates one.
  const identity=async()=>{const id=randomUUID();await db.pg.query('insert into auth.users(id) values($1)',[id]);return id;};
  beforeAll(async()=>{db=await testDatabase();app=createApp({database:db.database,logger:pino({enabled:false}),origins:[],auth:{async verify(token){return {userId:token};}}});});
  beforeEach(async()=>{
    await db.pg.query('delete from edunexus.request_buckets');
    await db.pg.query('delete from edunexus.staff_invitation_events');
    await db.pg.query('delete from edunexus.staff_invitations');
    await db.pg.query('delete from edunexus.staff where user_id not in (select unnest($1::uuid[]))',[Object.values(ids)]);
  });
  afterAll(async()=>db?.database.close());

  it('records a request with a normalized email and journals it',async()=>{
    expect((await get(base)).body.data.items).toEqual([]);
    const r=await req({email:'  Synthetic.Mixed@Example.Test  '});
    expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(responses.invitationCreate!.safeParse(r.body.data).success).toBe(true);
    expect(r.body.data).toMatchObject({email:'synthetic.mixed@example.test',role:'teacher',status:'requested',linked_user_id:null,requested_by:ids.principal,version:1});
    const h=await get(`${base}/${r.body.data.id}/events`);
    expect(h.body.data.items[0]).toMatchObject({action:'request',before_snapshot:null,actor_user_id:ids.principal,request_id:r.body.requestId,reason});
  });

  it('authorizes school access and links the identity in one transaction',async()=>{
    const invitation=await made(),user=await identity();
    const r=await provision(invitation,{user_id:user});
    expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(r.body.data).toMatchObject({status:'provisioned',linked_user_id:user,version:2});
    const staff=(await get('/api/v1/staff?limit=100')).body.data.items.find((s:any)=>s.user_id===user);
    expect(staff).toMatchObject({display_name:invitation.display_name,role:'teacher',active:true});
    expect((await get(`${base}/${invitation.id}/events`)).body.data.items[0]).toMatchObject({action:'provision',invitation_version:2});
  });

  it('never creates the Auth identity itself and rolls back an unknown one',async()=>{
    const invitation=await made();
    const missing=await provision(invitation,{user_id:randomUUID()});
    expect(missing.status).toBe(409);
    expect((await get(base+'/'+invitation.id)).body.data).toEqual(invitation);
    expect(Number((await db.pg.query<{count:number}>('select count(*) from edunexus.staff_invitation_events where invitation_id=$1',[invitation.id])).rows[0]!.count)).toBe(1);
  });

  it('refuses a duplicate identity and keeps one open request per email',async()=>{
    const first=await made(),user=await identity();
    expect((await provision(first,{user_id:user})).status).toBe(201);
    const second=await made();
    expect((await provision(second,{user_id:user})).body.error.code).toBe('ALREADY_EXISTS');
    const email=address();
    expect((await req({email})).status).toBe(201);
    expect((await req({email})).body.error.code).toBe('ALREADY_EXISTS');
  });

  it('completes or cancels once, on the current version',async()=>{
    const invitation=await made();
    expect((await cancel(invitation,{version:99})).body.error.code).toBe('VERSION_CONFLICT');
    const c=await cancel(invitation);expect(c.status,JSON.stringify(c.body)).toBe(201);
    expect(c.body.data).toMatchObject({status:'cancelled',linked_user_id:null,version:2});
    expect((await cancel(c.body.data)).body.error.code).toBe('INVITATION_STATE');
    expect((await provision(c.body.data)).body.error.code).toBe('INVITATION_STATE');
    expect((await req({email:invitation.email})).status).toBe(201);
    const h=await get(`${base}/${invitation.id}/events?limit=1`);
    expect(responses.invitationHistory!.safeParse(h.body.data).success).toBe(true);
    expect(h.body.data.pagination.next_before_version).toBe(2);
    expect((await get(`${base}/${invitation.id}/events?before_version=2`)).body.data.items[0].action).toBe('request');
  });

  it('holds administrative officers to the teacher permission level they may already grant',async()=>{
    expect((await req({role:'teacher'},ids.officer)).status).toBe(201);
    for(const role of ['principal','administrative_officer'])expect((await req({role},ids.officer)).status).toBe(403);
    const managerial=await made({role:'administrative_officer'});
    expect((await provision(managerial,{},ids.officer)).status).toBe(403);
    expect((await cancel(managerial,{},ids.officer)).status).toBe(403);
    expect((await provision(managerial,{user_id:await identity()})).status).toBe(201);
    await expect(db.asUser(ids.officer,tx=>tx.query("select edunexus.request_staff_invitation($1,'Synthetic','principal',$2)",[address(),reason])))
      .rejects.toMatchObject({code:'42501'});
  });

  it('rejects malformed emails, names and permission levels at both boundaries',async()=>{
    for(const extra of [{email:'not-an-address'},{email:'two@ad@dress.test'},{email:'with space@example.test'},{email:'a@b'},
      {display_name:''},{display_name:'Bad\nname'},{role:'headmaster'},{reason:'short'},{user_id:randomUUID()}])
      expect((await req(extra)).status).toBe(422);
    for(const email of ['no-at-sign','x@y','two@ad@dress.test','with space@example.test'])
      await expect(db.asUser(ids.principal,tx=>tx.query("select edunexus.request_staff_invitation($1,'Synthetic','teacher',$2)",[email,reason])))
        .rejects.toMatchObject({code:'23514'});
  });

  it('restricts invitations to active managers in HTTP and SQL',async()=>{
    const invitation=await made();
    for(const actor of [ids.teacher,ids.otherTeacher,ids.inactive]){
      for(const path of [base,base+'/'+invitation.id,`${base}/${invitation.id}/events`])expect((await get(path,actor)).status).toBe(403);
      expect((await req({},actor)).status).toBe(403);expect((await provision(invitation,{},actor)).status).toBe(403);
      expect(await db.asUser(actor,tx=>tx.query('select id from edunexus.staff_invitations'))).toEqual([]);
    }
    expect((await request(app).get(base)).status).toBe(401);
    expect(await db.asUser(null,tx=>tx.query('select id from edunexus.staff_invitation_events'))).toEqual([]);
    for(const sql of ["update edunexus.staff_invitations set status='cancelled'",'delete from edunexus.staff_invitation_events',
      "select edunexus.write_staff_invitation(null,0,'request','a@b.test','Synthetic','teacher',null,'Synthetic reason text')",
      "select edunexus.assert_may_grant_role('principal')"])
      await expect(db.asUser(ids.principal,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
    expect((await get(base+'/'+invitation.id,ids.officer)).status).toBe(200);
  });

  it('rolls back the request, provisioning and audits if history cannot be written',async()=>{
    const invitation=await made(),user=await identity();
    const before=(await db.pg.query('select count(*) from edunexus.audit_events')).rows;
    await db.pg.exec("create function edunexus.synthetic_invitation_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$; create trigger synthetic_failure before insert on edunexus.staff_invitation_events for each row execute function edunexus.synthetic_invitation_failure();");
    try{
      expect((await req()).status).toBe(500);
      expect((await provision(invitation,{user_id:user})).status).toBe(500);
      expect((await get(base+'/'+invitation.id)).body.data).toEqual(invitation);
      expect((await db.pg.query('select user_id from edunexus.staff where user_id=$1',[user])).rows).toEqual([]);
      expect((await db.pg.query('select count(*) from edunexus.audit_events')).rows).toEqual(before);
    } finally{await db.pg.exec('drop trigger synthetic_failure on edunexus.staff_invitation_events; drop function edunexus.synthetic_invitation_failure();');}
  });

  it('filters before pagination and adds no credential-bearing endpoint',async()=>{
    const created=[];
    for(let i=0;i<4;i++)created.push(await made({role:i===3?'administrative_officer':'teacher'}));
    expect((await cancel(created[0])).status).toBe(201);
    const page=(await get(base+'?limit=2')).body.data;
    expect(responses.invitationList!.safeParse(page).success).toBe(true);
    const next=(await get(`${base}?limit=2&after_id=${page.pagination.next_after_id}`)).body.data;
    expect(new Set([...page.items,...next.items].map((v:any)=>v.id)).size).toBe(3);
    expect((await get(base+'?status=cancelled')).body.data.items.map((v:any)=>v.id)).toEqual([created[0].id]);
    expect((await get(base+'?role=administrative_officer')).body.data.items.map((v:any)=>v.id)).toEqual([created[3].id]);
    expect((await get(base+'?limit=101')).status).toBe(422);
    expect((await get(base+'/'+randomUUID())).status).toBe(404);
    const api=(await request(app).get('/openapi.json')).body;
    for(const path of [base+'/{id}/send',base+'/{id}/email','/api/v1/auth/invite','/api/v1/auth/admin'])expect(api.paths[path]).toBeUndefined();
  });
});
