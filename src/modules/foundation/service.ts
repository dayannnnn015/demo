import type { z } from 'zod';
import type { Identity } from '../../core/auth.js';
import type { Query, Row } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { schemas, type OperationId, type StaffRole } from './contracts.js';

export interface Staff extends Row { user_id: string; display_name: string; role: StaffRole; active: boolean; version: number; }
export interface Context { tx: Query; identity: Identity; staff: Staff; }

export async function currentStaff(tx: Query, identity: Identity): Promise<Staff> {
  const [staff] = await tx.query<Staff>('select * from edunexus.staff where user_id = $1', [identity.userId]);
  if (!staff?.active) throw new AppError(403, 'STAFF_ACCESS_REQUIRED', 'An active school staff account is required.');
  return staff;
}

function found(rows: Row[]) {
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'The record was not found.');
  return rows[0];
}
function updated(rows: Row[]) {
  if (!rows[0]) throw new AppError(409, 'VERSION_CONFLICT', 'The record changed or is unavailable. Refresh before saving.');
  return rows[0];
}
function list(rows: Row[], limit: number, offset: number) {
  return { items: rows.slice(0, limit), pagination: { limit, offset, has_more: rows.length > limit } };
}

export async function executeOperation(id: OperationId, ctx: Context, input: { body: unknown; query: unknown; id?: string }) {
  const { tx, staff, identity } = ctx;
  switch (id) {
    case 'me': return { ...staff, assurance_level: identity.aal };
    case 'schoolGet': return found(await tx.query('select * from edunexus.school_profile where id = 1'));
    case 'schoolUpdate': {
      const b = input.body as z.infer<typeof schemas.schoolUpdate>;
      return updated(await tx.query('update edunexus.school_profile set name=$1, school_code=$2, address=$3 where id=1 and version=$4 returning *', [b.name, b.school_code, b.address, b.version]));
    }
    case 'staffList': {
      const q = input.query as z.infer<typeof schemas.staffQuery>;
      return list(await tx.query('select * from edunexus.staff where ($1::edunexus.staff_role is null or role=$1) order by user_id limit $2 offset $3', [q.role ?? null, q.limit + 1, q.offset]), q.limit, q.offset);
    }
    case 'staffCreate': {
      const b = input.body as z.infer<typeof schemas.staffCreate>;
      if (staff.role !== 'principal' && b.role !== 'teacher') throw new AppError(403, 'FORBIDDEN', 'Only the principal can authorize administrative accounts.');
      return found(await tx.query('insert into edunexus.staff (user_id, display_name, role) values ($1,$2,$3) returning *', [b.user_id, b.display_name, b.role]));
    }
    case 'staffUpdate': {
      const b = input.body as z.infer<typeof schemas.staffUpdate>;
      if (input.id === staff.user_id && (b.role !== undefined || b.active !== undefined)) throw new AppError(409, 'SELF_ACCESS_CHANGE', 'You cannot change your own role or active status.');
      if (staff.role !== 'principal' && b.role !== undefined && b.role !== 'teacher') throw new AppError(403, 'FORBIDDEN', 'Only the principal can authorize administrative accounts.');
      await tx.query('select pg_advisory_xact_lock(82412001)');
      const target = found(await tx.query('select * from edunexus.staff where user_id=$1', [input.id]));
      if (staff.role !== 'principal' && target.role !== 'teacher') throw new AppError(403, 'FORBIDDEN', 'Only the principal can manage administrative accounts.');
      return updated(await tx.query('update edunexus.staff set display_name=coalesce($1,display_name), role=coalesce($2,role), active=coalesce($3,active) where user_id=$4 and version=$5 returning *', [b.display_name ?? null, b.role ?? null, b.active ?? null, input.id, b.version]));
    }
    case 'yearList': return { items: await tx.query('select * from edunexus.academic_years order by start_year desc') };
    case 'yearCreate': {
      const b = input.body as z.infer<typeof schemas.yearCreate>;
      return found(await tx.query('insert into edunexus.academic_years (start_year,starts_on,ends_on) values ($1,$2,$3) returning *', [b.start_year, b.starts_on, b.ends_on]));
    }
    case 'yearTransition': {
      const b = input.body as z.infer<typeof schemas.yearTransition>;
      return updated(await tx.query('update edunexus.academic_years set status=$1 where id=$2 and version=$3 returning *', [b.status, input.id, b.version]));
    }
    case 'periodList': {
      found(await tx.query('select id from edunexus.academic_years where id=$1', [input.id]));
      return { items: await tx.query('select * from edunexus.reporting_periods where academic_year_id=$1 order by ordinal', [input.id]) };
    }
    case 'periodCreate': {
      const b = input.body as z.infer<typeof schemas.periodCreate>;
      return found(await tx.query('insert into edunexus.reporting_periods (academic_year_id,ordinal,name,starts_on,ends_on) values ($1,$2,$3,$4,$5) returning *', [input.id, b.ordinal, b.name, b.starts_on, b.ends_on]));
    }
    case 'periodUpdate': {
      const b = input.body as z.infer<typeof schemas.periodUpdate>;
      return updated(await tx.query('update edunexus.reporting_periods set ordinal=$1,name=$2,starts_on=$3,ends_on=$4 where id=$5 and version=$6 returning *', [b.ordinal, b.name, b.starts_on, b.ends_on, input.id, b.version]));
    }
    case 'sectionList': {
      const q = input.query as z.infer<typeof schemas.sectionQuery>;
      return list(await tx.query('select * from edunexus.sections where ($1::uuid is null or academic_year_id=$1) order by academic_year_id,grade_level,name,id limit $2 offset $3', [q.academic_year_id ?? null, q.limit + 1, q.offset]), q.limit, q.offset);
    }
    case 'sectionGet': return found(await tx.query('select * from edunexus.sections where id=$1', [input.id]));
    case 'sectionCreate': {
      const b = input.body as z.infer<typeof schemas.sectionCreate>;
      return found(await tx.query('insert into edunexus.sections (academic_year_id,grade_level,name,adviser_user_id) values ($1,$2,$3,$4) returning *', [b.academic_year_id, b.grade_level, b.name, b.adviser_user_id]));
    }
    case 'sectionUpdate': {
      const b = input.body as z.infer<typeof schemas.sectionUpdate>;
      return updated(await tx.query('update edunexus.sections set name=coalesce($1,name), adviser_user_id=case when $2::boolean then $3::uuid else adviser_user_id end where id=$4 and version=$5 returning *', [b.name ?? null, Object.hasOwn(b, 'adviser_user_id'), b.adviser_user_id ?? null, input.id, b.version]));
    }
    case 'auditList': {
      const q = input.query as z.infer<typeof schemas.auditQuery>;
      const rows = await tx.query('select id::text,occurred_at,actor_user_id,request_id,operation,entity_table,entity_id,changed_fields from edunexus.audit_events where ($1::bigint is null or id < $1) order by id desc limit $2', [q.before_id ?? null, q.limit + 1]);
      return { items: rows.slice(0, q.limit), pagination: { limit: q.limit, next_before_id: rows.length > q.limit ? rows[q.limit - 1]!.id : null } };
    }
  }
}
