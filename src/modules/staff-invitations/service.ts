import type {z} from 'zod';
import type {Context} from '../foundation/service.js';
import {AppError} from '../../core/errors.js';
import {invitationSchemas as s,type InvitationOperationId} from './contracts.js';
const columns='id,email,display_name,role,status,linked_user_id,requested_by,version,created_at,updated_at';
export async function executeInvitation(id:InvitationOperationId,ctx:Context,input:{id?:string;body:unknown;query:unknown}) {
  const {tx}=ctx;
  if(id==='invitationList'){
    const q=input.query as z.infer<typeof s.list>;
    const rows=await tx.query(`select ${columns} from edunexus.staff_invitations where ($1='all' or status=$1)
      and ($2::text is null or role=$2::edunexus.staff_role) and ($3::uuid is null or id>$3) order by id limit $4`,
      [q.status,q.role??null,q.after_id??null,q.limit+1]);
    return {items:rows.slice(0,q.limit),pagination:{limit:q.limit,next_after_id:rows.length>q.limit?rows[q.limit-1]!.id:null}};
  }
  if(id==='invitationGet'||id==='invitationHistory'){
    const [row]=await tx.query(`select ${columns} from edunexus.staff_invitations where id=$1`,[input.id]);
    if(!row)throw new AppError(404,'NOT_FOUND','The staff invitation was not found.');
    if(id==='invitationGet')return row;
    const q=input.query as z.infer<typeof s.history>;
    const rows=await tx.query(`select id,invitation_id,invitation_version,action,before_snapshot,after_snapshot,reason,actor_user_id,request_id,recorded_at
      from edunexus.staff_invitation_events where invitation_id=$1 and ($2::integer is null or invitation_version<$2) order by invitation_version desc limit $3`,
      [input.id,q.before_version??null,q.limit+1]);
    return {items:rows.slice(0,q.limit),pagination:{limit:q.limit,next_before_version:rows.length>q.limit?rows[q.limit-1]!.invitation_version:null}};
  }
  if(id==='invitationCreate'){
    const b=input.body as z.infer<typeof s.request>;
    const [row]=await tx.query(`select ${columns} from edunexus.request_staff_invitation($1,$2,$3::edunexus.staff_role,$4)`,[b.email,b.display_name,b.role,b.reason]);
    return row;
  }
  if(id==='invitationProvision'){
    const b=input.body as z.infer<typeof s.provision>;
    const [row]=await tx.query(`select ${columns} from edunexus.provision_staff_invitation($1,$2,$3,$4)`,[input.id,b.version,b.user_id,b.reason]);
    return row;
  }
  const b=input.body as z.infer<typeof s.cancel>;
  const [row]=await tx.query(`select ${columns} from edunexus.cancel_staff_invitation($1,$2,$3)`,[input.id,b.version,b.reason]);
  return row;
}
