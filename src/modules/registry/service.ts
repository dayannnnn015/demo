import type { z } from 'zod';
import type { Row } from '../../core/db.js';
import type { Context } from '../foundation/service.js';
import { AppError } from '../../core/errors.js';
import { registrySchemas as s, type RegistryOperationId } from './contracts.js';

function found(rows: Row[], update = false) {
  if (!rows[0]) throw new AppError(update ? 409 : 404, update ? 'VERSION_CONFLICT' : 'NOT_FOUND', update ? 'The record changed or is unavailable. Refresh before saving.' : 'The record was not found.');
  return rows[0];
}
function page(rows: Row[], limit: number, offset: number) { return { items: rows.slice(0, limit), pagination: { limit, offset, has_more: rows.length > limit } }; }
export async function executeRegistry(id: RegistryOperationId, ctx: Context, input: { body: unknown; query: unknown; id?: string }) {
  const { tx } = ctx;
  const enrollmentSelect = 'select e.*,e.learner_id as recorded_learner_id,edunexus.visible_learner_identity(e.learner_id) as learner_id from edunexus.enrollments e';
  const enrollmentRow = async (id: unknown) => found(await tx.query(`${enrollmentSelect} where e.id=$1`, [id]));
  async function record(ids: unknown[]) { await tx.query('select edunexus.record_access($1,$2::uuid[])', [id, ids]); }
  switch (id) {
    case 'learnerCreate': {
      const b = input.body as z.infer<typeof s.learnerCreate>;
      return found(await tx.query('insert into edunexus.learners(lrn,first_name,middle_name,last_name,name_extension,birth_date,sex) values($1,$2,$3,$4,$5,$6,$7) returning *', [b.lrn, b.first_name, b.middle_name, b.last_name, b.name_extension, b.birth_date, b.sex]));
    }
    case 'learnerUpdate': {
      const b = input.body as z.infer<typeof s.learnerUpdate>;
      return found(await tx.query('update edunexus.learners set first_name=$1,middle_name=$2,last_name=$3,name_extension=$4,birth_date=$5,sex=$6 where id=$7 and version=$8 returning *', [b.first_name, b.middle_name, b.last_name, b.name_extension, b.birth_date, b.sex, input.id, b.version]), true);
    }
    case 'learnerLrn': {
      const b = input.body as z.infer<typeof s.learnerLrn>;
      return found(await tx.query('update edunexus.learners set lrn=$1 where id=$2 and version=$3 and lrn is null returning *', [b.lrn, input.id, b.version]), true);
    }
    case 'learnerGet': {
      const row = found(await tx.query('select * from edunexus.learners where id=$1', [input.id]));
      await record([row.id]); return row;
    }
    case 'learnerList': {
      const q = input.query as z.infer<typeof s.learnerQuery>;
      const rows = await tx.query(`select * from edunexus.learners where
        ($1::text is null or position(lower($1) in lower(concat_ws(' ',last_name,first_name,middle_name)))>0 or lrn=$1)
        and ($2::date is null or birth_date=$2) and ($3::text is null or lrn=$3) and ($6::boolean or merged_into is null)
        order by lower(last_name),lower(first_name),id limit $4 offset $5`, [q.search ?? null, q.birth_date ?? null, q.lrn ?? null, q.limit + 1, q.offset,q.include_linked==='true']);
      const result = page(rows, q.limit, q.offset); await record(result.items.map(row => row.id)); return result;
    }
    case 'enrollmentCreate': {
      const b = input.body as z.infer<typeof s.enrollmentCreate>;
      const row=found(await tx.query('select * from edunexus.enroll_learner($1,$2,$3,$4)', [b.learner_id, b.section_id, b.enrolled_on, b.entry_kind])); return enrollmentRow(row.id);
    }
    case 'enrollmentMove': {
      const b = input.body as z.infer<typeof s.movement>;
      const row=found(await tx.query('select * from edunexus.move_enrollment($1,$2,$3,$4,$5,$6)', [input.id, b.version, b.action, b.effective_on, b.section_id, b.exit_reason])); return enrollmentRow(row.id);
    }
    case 'enrollmentGet': {
      const row = await enrollmentRow(input.id); await record([row.id]); return row;
    }
    case 'enrollmentList': {
      const q = input.query as z.infer<typeof s.enrollmentQuery>;
      const rows = await tx.query(`${enrollmentSelect} where ($1::uuid is null or academic_year_id=$1)
        and ($2::uuid is null or section_id=$2) and ($3::uuid is null or e.learner_id=$3 or edunexus.visible_learner_identity(e.learner_id)=$3) and ($4::text is null or status=$4)
        and ($7::text='all' or e.record_state=$7) order by e.id limit $5 offset $6`, [q.academic_year_id ?? null, q.section_id ?? null, q.learner_id ?? null, q.status ?? null, q.limit + 1, q.offset, q.record_state]);
      const result = page(rows, q.limit, q.offset); await record(result.items.map(row => row.id)); return result;
    }
    case 'enrollmentHistory': {
      const state = found(await tx.query('select edunexus.get_enrollment_timeline($1) as timeline', [input.id])).timeline as { version: number; latest_correction_id: string | null; record_state: string; usable_for_reporting: boolean };
      const q = input.query as z.infer<typeof s.historyQuery>;
      const result = page(await tx.query('select * from edunexus.enrollment_events where enrollment_id=$1 order by enrollment_version limit $2 offset $3', [input.id, q.limit + 1, q.offset]), q.limit, q.offset);
      await record([input.id]); return { ...result, interpretation: 'original_movements', timeline_version: state.version, has_corrections: state.latest_correction_id !== null, record_state: state.record_state, usable_for_reporting: state.usable_for_reporting };
    }
    case 'recordAccessList': {
      const q = input.query as z.infer<typeof s.accessQuery>;
      const rows = await tx.query('select id::text,occurred_at,actor_user_id,request_id,resource,record_ids from edunexus.record_access_events where ($1::bigint is null or id<$1) order by edunexus.record_access_events.id desc limit $2', [q.before_id ?? null, q.limit + 1]);
      return { items: rows.slice(0, q.limit), pagination: { limit: q.limit, next_before_id: rows.length > q.limit ? rows[q.limit - 1]!.id : null } };
    }
  }
}
