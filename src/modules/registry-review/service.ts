import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import type { z } from 'zod';
import type { Row, Query } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import type { Context } from '../foundation/service.js';
import { registrySchemas } from '../registry/contracts.js';
import { executeRegistry } from '../registry/service.js';
import { candidateSchema, reviewSchemas, type ImportInput, type ReviewOperationId, type issueSchema, type previewRowSchema, type receiptSchema } from './contracts.js';

const columns = ['lrn', 'first_name', 'middle_name', 'last_name', 'name_extension', 'birth_date', 'sex'];
const header = columns.join(',') + '\r\n';
type Profile = z.infer<typeof registrySchemas.learnerCreate>;
type Candidate = z.infer<typeof candidateSchema>;
type Issue = z.infer<typeof issueSchema>;
type PreviewRow = z.infer<typeof previewRowSchema>;
type Receipt = z.infer<typeof receiptSchema>;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inputDigest = (b: ImportInput) => digest({ format: 'edunexus-roster-v1', section_id: b.section_id, enrolled_on: b.enrolled_on, entry_kind: b.entry_kind, csv: b.csv, resolutions: [...b.resolutions].sort((a, c) => a.row - c.row) });
const missing = () => new AppError(404, 'NOT_FOUND', 'The record was not found.');
const conflict = () => new AppError(409, 'PREVIEW_CHANGED', 'The roster or school records changed. Create and review a new preview.');

async function record(tx: Query, resource: string, ids: string[]) {
  const unique = [...new Set(ids)];
  // A bounded preview can inspect up to six candidates per row; keep each log
  // entry within the existing database limit and record every disclosed ID.
  if (!unique.length) await tx.query('select edunexus.record_access($1,$2::uuid[])', [resource, []]);
  for (let i = 0; i < unique.length; i += 100) await tx.query('select edunexus.record_access($1,$2::uuid[])', [resource, unique.slice(i, i + 100)]);
}

function readCsv(csv: string): { profiles: (Profile | null)[]; issues: Issue[] } {
  if (Buffer.byteLength(csv, 'utf8') > 24000) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'CSV content must be at most 24,000 UTF-8 bytes.');
  let records: string[][];
  try { records = parse(csv, { bom: true, skip_empty_lines: true, max_record_size: 2048, cast: false, relax_column_count: false }) as string[][]; }
  catch { throw new AppError(422, 'INVALID_CSV', 'Use a comma-separated UTF-8 file with the template header and correctly quoted fields.'); }
  if (JSON.stringify(records.shift()) !== JSON.stringify(columns)) throw new AppError(422, 'INVALID_CSV_HEADER', 'Use the exact EDUNEXUS roster template header and column order.');
  if (records.length < 1 || records.length > 50) throw new AppError(422, 'INVALID_ROW_COUNT', 'Each import must contain 1 to 50 learner rows.');
  const issues: Issue[] = [];
  const profiles = records.map((values, index) => {
    const row = index + 1;
    if (values.some(value => /[\u0000-\u001f\u007f\ufffd]/u.test(value))) {
      issues.push({ row, field: 'csv', code: 'INVALID_TEXT', message: 'Fields must contain valid single-line text.' }); return null;
    }
    const fields = Object.fromEntries(columns.map((key, i) => [key, values[i]!.trim() || (['lrn', 'middle_name', 'name_extension'].includes(key) ? null : '')]));
    const result = registrySchemas.learnerCreate.safeParse(fields);
    if (!result.success) {
      for (const issue of result.error.issues) issues.push({ row, field: issue.path.join('.'), code: 'INVALID_FIELD', message: issue.message });
      return null;
    }
    return result.data;
  });
  return { profiles, issues };
}

async function planImport(tx: Query, b: ImportInput) {
  const { profiles, issues } = readCsv(b.csv);
  const issue = (row: number, field: string, code: string, message: string) => issues.push({ row, field, code, message });
  // The same lock is taken by all learner writes, enrollment commands, and
  // section/adviser changes. The year row lock additionally blocks year closure.
  await tx.query('select pg_advisory_xact_lock(82412001)');
  const [section] = await tx.query<{ id: string; name: string; grade_level: number; academic_year_id: string; version: number }>('select id,name,grade_level,academic_year_id,version from edunexus.sections where id=$1', [b.section_id]);
  if (!section) throw missing();
  const [year] = await tx.query<{ id: string; version: number; status: string; starts_on: string; ends_on: string }>('select id,version,status,starts_on,ends_on from edunexus.academic_years where id=$1 for update', [section.academic_year_id]);
  if (!year) throw missing();
  if (year.status === 'closed') issue(0, 'section_id', 'YEAR_CLOSED', 'Import requires an open school year.');
  if (b.enrolled_on < year.starts_on || b.enrolled_on > year.ends_on) issue(0, 'enrolled_on', 'INVALID_ENROLLMENT_DATE', 'Enrollment must fall within the selected school year.');
  const resolutions = new Map<number, ImportInput['resolutions'][number]>();
  for (const resolution of b.resolutions) {
    if (resolution.row > profiles.length || resolutions.has(resolution.row)) issue(resolution.row, 'resolutions', 'INVALID_RESOLUTION', 'Supply at most one resolution for each existing CSV row.');
    resolutions.set(resolution.row, resolution);
  }
  const incoming = profiles.flatMap((p, i) => {
    const r = resolutions.get(i + 1);
    return p ? [{ row: i + 1, ...p, use_id: r?.action === 'use_existing' ? r.learner_id : null }] : [];
  });
  const matches = await tx.query(`select x.row,l.* from jsonb_to_recordset($1::jsonb)
    as x(row integer,lrn text,first_name text,last_name text,birth_date date,use_id uuid)
    cross join lateral (select id,lrn,first_name,middle_name,last_name,name_extension,birth_date,sex,version from edunexus.learners l
      where merged_into is null and (id=x.use_id or (x.lrn is not null and lrn=x.lrn)
        or (birth_date=x.birth_date and lower(btrim(first_name))=lower(x.first_name) and lower(btrim(last_name))=lower(x.last_name))
        or exists(select 1 from edunexus.learners a where a.merged_into=l.id and a.birth_date=x.birth_date
          and lower(btrim(a.first_name))=lower(x.first_name) and lower(btrim(a.last_name))=lower(x.last_name)))
      order by (id=x.use_id) desc nulls last,(lrn=x.lrn) desc nulls last,id limit 6) l order by x.row,l.id`, [JSON.stringify(incoming)]);
  const candidates = new Map<number, Candidate[]>();
  for (const match of matches) {
    const row = Number(match.row); const items = candidates.get(row) ?? [];
    items.push(candidateSchema.parse(match)); candidates.set(row, items);
  }
  const candidateIds = matches.map(m => String(m.id));
  const enrolled = new Set((await tx.query('select edunexus.visible_learner_identity(learner_id) as learner_id from edunexus.enrollments where academic_year_id=$1 and edunexus.visible_learner_identity(learner_id)=any($2::uuid[])', [year.id, candidateIds])).map(e => e.learner_id));
  const seenLrn = new Set<string>(), seenName = new Set<string>(), seenId = new Set<string>();
  const rows: PreviewRow[] = profiles.map((profile, index) => {
    const row = index + 1, choices = candidates.get(row) ?? [], resolution = resolutions.get(row);
    const result: PreviewRow = { row, profile, action: profile ? 'create' : null, learner_id: null, candidates: choices, candidates_truncated: choices.length === 6 };
    if (!profile) return result;
    if (profile.birth_date >= b.enrolled_on) issue(row, 'birth_date', 'INVALID_BIRTH_DATE', 'Birth date must precede enrollment.');
    const nameKey = JSON.stringify([profile.first_name.toLowerCase(), profile.last_name.toLowerCase(), profile.birth_date]);
    if ((profile.lrn && seenLrn.has(profile.lrn)) || seenName.has(nameKey)) issue(row, 'csv', 'DUPLICATE_INPUT', 'This batch repeats an LRN or the same first name, last name, and birth date. Review and split distinct namesakes into separate imports.');
    if (profile.lrn) seenLrn.add(profile.lrn); seenName.add(nameKey);
    if (resolution?.action === 'use_existing') {
      const existing = choices.find(c => c.id === resolution.learner_id);
      result.action = 'use_existing'; result.learner_id = resolution.learner_id;
      if (!existing || existing.version !== resolution.version) issue(row, 'resolutions', 'VERSION_CONFLICT', 'The selected learner is unavailable or changed. Refresh the resolution.');
      else {
        if (columns.some(key => key === 'lrn' && profile.lrn === null ? false : profile[key as keyof Profile] !== existing[key as keyof Candidate])) issue(row, 'csv', 'PROFILE_MISMATCH', 'CSV fields must match the selected learner. Imports cannot overwrite existing profiles or assign LRNs.');
        if (enrolled.has(existing.id)) issue(row, 'resolutions', 'ALREADY_ENROLLED', 'The learner already has enrollment history in this year. Use the existing enrollment workflow.');
        if (seenId.has(existing.id)) issue(row, 'resolutions', 'DUPLICATE_INPUT', 'The same learner cannot appear twice in a batch.');
        seenId.add(existing.id);
      }
    } else {
      if (profile.lrn && choices.some(c => c.lrn === profile.lrn)) issue(row, 'lrn', 'LRN_EXISTS', 'This LRN already exists. Review and explicitly select the existing learner.');
      else if (choices.length && resolution?.action !== 'create_distinct') issue(row, 'resolutions', 'POSSIBLE_DUPLICATE', 'Review possible matches. Select an existing learner or explain why this is a distinct person.');
      if (!choices.length && resolution?.action === 'create_distinct') issue(row, 'resolutions', 'UNNEEDED_RESOLUTION', 'No duplicate candidate remains. Remove the distinct-person resolution and preview again.');
    }
    return result;
  });
  return { section, year, rows, issues, candidateIds, hash: digest({ format: 'edunexus-roster-v1', section, year, rows }) };
}

export async function executeReview(id: ReviewOperationId, ctx: Context, input: { body: unknown; query: unknown; id?: string }) {
  const { tx } = ctx;
  switch (id) {
    case 'importTemplate': return { format: 'edunexus-roster-v1', csv: header, max_rows: 50, max_csv_bytes: 24000, max_request_bytes: 32768, preview_minutes: 30,
      instructions: ['Use UTF-8 comma-separated CSV with this exact header. This is an EDUNEXUS template, not a DepEd LIS import format.', 'Preserve LRN as text with all 12 digits; leave it blank only when pending. Dates use YYYY-MM-DD and sex is male or female.', 'One batch enrolls up to 50 learners in one section. Blank middle_name and name_extension are allowed.', 'Preview first. Resolve duplicates explicitly and preview again. Existing profiles are never overwritten.', 'Commit the same CSV, section, date, entry kind, and resolutions with confirmed=true within 30 minutes, using the same manager account.', 'Row numbers identify data records starting at 1, excluding the header. Do not put real learner data in source control or application logs.'] };
    case 'importPreview': {
      const b = input.body as ImportInput, plan = await planImport(tx, b);
      await record(tx, id, plan.candidateIds);
      const [preview] = plan.issues.length ? [] : await tx.query('select id,expires_at from edunexus.create_import_preview($1,$2,$3)', [inputDigest(b), plan.hash, plan.rows.length]);
      return { can_commit: plan.issues.length === 0, preview_id: preview?.id ?? null, expires_at: preview?.expires_at ?? null, section: plan.section, rows: plan.rows, issues: plan.issues };
    }
    case 'importGet': {
      const [preview] = await tx.query(`select id,row_count,created_at,expires_at,committed_at,receipt,
        case when committed_at is not null then 'committed' when expires_at<=clock_timestamp() then 'expired' else 'pending' end as status
        from edunexus.import_previews where id=$1`, [input.id]);
      if (!preview) throw missing();
      const receipt = preview.receipt as Receipt | null;
      await record(tx, id, receipt?.items.map(i => i.learner_id) ?? []); return preview;
    }
    case 'importCommit': {
      const b = input.body as z.infer<typeof reviewSchemas.commit>;
      const [preview] = await tx.query('select * from edunexus.lock_import_preview($1,$2)', [input.id, inputDigest(b)]);
      if (!preview) throw missing();
      if (preview.receipt) { const receipt = preview.receipt as Receipt; await record(tx, id, receipt.items.map(i => i.learner_id)); return receipt; }
      const plan = await planImport(tx, b);
      if (plan.issues.length || plan.hash !== preview.plan_hash) throw conflict();
      const items: Receipt['items'] = [];
      for (const row of plan.rows) {
        let learnerId = row.learner_id;
        if (row.action === 'create') {
          const created = await executeRegistry('learnerCreate', ctx, { body: row.profile, query: undefined });
          learnerId = String((created as Row).id);
        }
        const [enrollment] = await tx.query('select id from edunexus.enroll_learner($1,$2,$3,$4)', [learnerId, b.section_id, b.enrolled_on, b.entry_kind]);
        if (!enrollment || !learnerId || !row.action) throw new Error('Incomplete import plan');
        const resolution = b.resolutions.find(r => r.row === row.row);
        items.push({ row: row.row, learner_id: learnerId, enrollment_id: String(enrollment.id), action: row.action, resolution_reason: resolution?.action === 'create_distinct' ? resolution.reason : null });
      }
      const receipt: Receipt = { preview_id: input.id!, section_id: b.section_id, academic_year_id: plan.year.id, items };
      await tx.query('select edunexus.finish_import($1,$2,$3::jsonb)', [input.id, plan.hash, JSON.stringify(receipt)]);
      await record(tx, id, [...plan.candidateIds, ...items.map(i => i.learner_id)]);
      return receipt;
    }
    case 'lrnCorrect': {
      const b = input.body as z.infer<typeof reviewSchemas.correction>;
      const [learner] = await tx.query('select * from edunexus.correct_lrn($1,$2,$3,$4,$5)', [input.id, b.version, b.previous_lrn, b.corrected_lrn, b.reason]);
      return learner;
    }
    case 'lrnCorrectionHistory': {
      const [learner] = await tx.query('select id from edunexus.learners where id=$1', [input.id]);
      if (!learner) throw missing();
      const q = input.query as z.infer<typeof registrySchemas.historyQuery>;
      const rows = await tx.query(`select id,learner_id,learner_version,previous_lrn,corrected_lrn,reason,actor_user_id,request_id,recorded_at
        from edunexus.lrn_corrections where learner_id=$1 order by learner_version limit $2 offset $3`, [input.id, q.limit + 1, q.offset]);
      await record(tx, id, [String(learner.id)]);
      return { items: rows.slice(0, q.limit), pagination: { limit: q.limit, offset: q.offset, has_more: rows.length > q.limit } };
    }
  }
}
