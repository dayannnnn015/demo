import { z } from 'zod';
import { staffRole, uuid } from './modules/foundation/contracts.js';
import { operations } from './operations.js';
import { registryResponses } from './modules/registry/contracts.js';
import { reviewResponses } from './modules/registry-review/contracts.js';
import { timelineResponses } from './modules/enrollment-timeline/contracts.js';
import { enrollmentRecordResponses } from './modules/enrollment-records/contracts.js';
import { identityResponses } from './modules/learner-identity/contracts.js';
import { placementResponses } from './modules/grade-placement/contracts.js';
import { offeringResponses } from './modules/section-subjects/contracts.js';
import { subjectResponses } from './modules/subjects/contracts.js';
import { followupResponses } from './modules/attendance-followups/contracts.js';
import { monitorResponses } from './modules/attendance-monitor/contracts.js';
import { monthResponses } from './modules/attendance-months/contracts.js';
import { attendanceResponses } from './modules/attendance/contracts.js';
import { calendarResponses } from './modules/calendar/contracts.js';

const timestamps = { version: z.number().int(), created_at: z.iso.datetime(), updated_at: z.iso.datetime() };
const staff = z.object({ user_id: uuid, display_name: z.string(), role: staffRole, active: z.boolean(), ...timestamps });
const school = z.object({ id: z.literal(1), name: z.string(), school_code: z.string().nullable(), address: z.string(), timezone: z.literal('Asia/Manila'), ...timestamps });
const year = z.object({ id: uuid, start_year: z.number().int(), starts_on: z.iso.date(), ends_on: z.iso.date(), status: z.enum(['draft', 'active', 'closed']), ...timestamps });
const period = z.object({ id: uuid, academic_year_id: uuid, ordinal: z.number().int(), name: z.string(), starts_on: z.iso.date(), ends_on: z.iso.date(), ...timestamps });
const section = z.object({ id: uuid, academic_year_id: uuid, grade_level: z.number().int(), name: z.string(), adviser_user_id: uuid.nullable(), ...timestamps });
const audit = z.object({ id: z.string(), occurred_at: z.iso.datetime(), actor_user_id: uuid.nullable(), request_id: uuid.nullable(), operation: z.enum(['INSERT', 'UPDATE']), entity_table: z.string(), entity_id: z.string(), changed_fields: z.array(z.string()) });
const items = (s: z.ZodType) => z.object({ items: z.array(s) });
const paginated = (s: z.ZodType) => z.object({ items: z.array(s), pagination: z.object({ limit: z.number(), offset: z.number(), has_more: z.boolean() }) });
const responseSchemas: Record<string, z.ZodType> = {
  ...registryResponses,
  ...reviewResponses,
  ...timelineResponses,
  ...identityResponses,
  ...enrollmentRecordResponses,
  ...placementResponses,
  ...calendarResponses,
  ...attendanceResponses,
  ...monthResponses,
  ...monitorResponses,
  ...followupResponses,
  ...subjectResponses,
  ...offeringResponses,
  me: staff.extend({ assurance_level: z.enum(['aal1', 'aal2']) }), schoolGet: school, schoolUpdate: school,
  staffList: paginated(staff), staffCreate: staff, staffUpdate: staff,
  yearList: items(year), yearCreate: year, yearTransition: year,
  periodList: items(period), periodCreate: period, periodUpdate: period,
  sectionList: paginated(section), sectionGet: section, sectionCreate: section, sectionUpdate: section,
  auditList: z.object({ items: z.array(audit), pagination: z.object({ limit: z.number(), next_before_id: z.string().nullable() }) }),
};

function jsonSchema(schema: z.ZodType, io: 'input' | 'output' = 'output') {
  const { $schema: _schema, ...result } = z.toJSONSchema(schema, { target: 'draft-2020-12', io });
  return result;
}

const paths: Record<string, Record<string, unknown>> = {};
for (const op of operations) {
  const path = op.path.replace(':id', '{id}');
  const parameters: unknown[] = [];
  if (op.path.includes(':id')) parameters.push({ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
  if ('query' in op) {
    const schema = jsonSchema(op.query, 'input');
    for (const [name, value] of Object.entries(schema.properties ?? {})) parameters.push({ name, in: 'query', required: schema.required?.includes(name) ?? false, schema: value });
  }
  const success = jsonSchema(z.object({ data: responseSchemas[op.id]!, requestId: uuid }));
  paths[path] ??= {};
  paths[path]![op.method] = {
    operationId: op.id,
    summary: op.summary,
    tags: ['module' in op ? op.module === 'section-subjects' ? 'Section subject offerings' : op.module === 'subjects' ? 'Subject catalog' : op.module === 'attendance-followups' ? 'Attendance follow-up' : op.module === 'attendance-monitor' ? 'Classroom absence monitoring' : op.module === 'attendance-months' ? 'Monthly attendance review' : op.module === 'attendance' ? 'Daily attendance' : op.module === 'calendar' ? 'Instructional calendar' : op.module === 'grade-placement' ? 'Grade placement review' : op.module === 'registry-review' ? 'Registry review and import' : op.module === 'enrollment-timeline' ? 'Enrollment timeline review' : op.module==='enrollment-records' ? 'Enrollment record review' : op.module==='learner-identity' ? 'Learner identity review' : 'Learners and enrollment' : 'Foundation'],
    description: `${'manager' in op ? 'Requires principal or administrative_officer. ' : 'Requires active staff. '}${op.method === 'patch' ? 'Supply the last-read version; refresh after HTTP 409. ' : ''}${op.id === 'staffCreate' ? 'Provision the identity in Supabase Auth first. This endpoint grants school access; it does not send an invitation. Administrative officers may only authorize teachers.' : ''}`,
    security: [{ staffBearer: [] }],
    parameters,
    ...('body' in op ? { requestBody: { required: true, content: { 'application/json': { schema: jsonSchema(op.body, 'input') } } } } : {}),
    responses: {
      [op.method === 'post' ? '201' : '200']: { description: 'Success', content: { 'application/json': { schema: success } } },
      ...Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 503].map(code => [code, { $ref: '#/components/responses/Error' }])),
    },
  };
}

export const openapi = {
  openapi: '3.1.0',
  info: { title: 'EDUNEXUS API', version: '0.14.0', description: 'Sections 1 through 4A.2: staff/school setup, learner registry/enrollment, roster imports, LRN and timeline corrections, reviewed reversible identity links, and reviewed enrollment void/restoration. Managers maintain the registry; teachers read current assigned learners and may review classroom attendance for accessible learners in their sections. Linked profiles remain manager-readable but frozen; normal lists return retained profiles. Enrollment learner_id identifies the retained profile, while recorded_learner_id preserves original ownership. Identity links never reparent or delete enrollment history; assigned source LRNs and overlapping enrollment years block reconciliation. Effective timelines include corrections, while /history explicitly returns original movements. All review commits require current versions, unchanged context, a reason and explicit confirmation. Closed-year enrollment dates/state remain immutable. Imports use the EDUNEXUS template with stored preview/commit receipts. Enrollment record_state is valid or voided; voided records retain their histories but are excluded from default enrollment lists, teacher access, and annual uniqueness. Timeline/history responses label record_state and usable_for_reporting. Duplicate voids identify a retained same-year enrollment. Restore is blocked by annual conflicts. Grade-placement review corrects a whole-year grade and all timeline sections while preserving dates and movements. Shared correction history labels timeline versus placement revisions and old/new grades; older timeline rows may have null grade metadata. This is not promotion or a midyear grade transition. Reviewed school and section instructional calendars now distinguish classroom, alternative delivery, no-class and suspended AM/PM sessions. Missing dates remain unconfigured. Reads and change batches are limited to 62 dates; school-wide edits block when reviewed section overrides require resolution. Calendar totals count scheduled session categories, not learner attendance or official form credits. Dated attendance sheets and reviewed classroom AM/PM present/absent marks are implemented in batches of up to 100 learners. Null marks remain unknown. Only active years and nonfuture dates accept changes. Managers can read historical rosters; teacher sheets retain current learner-access restrictions and are not complete historical reports. Attendance blocks conflicting calendar, timeline, placement and void corrections until affected marks are reviewed and cleared. Manager monthly readiness review, submission, return, locking and reopening now preserve immutable historical snapshots. Submitted and locked months freeze marks, calendars and roster membership; identity reconciliation involving frozen members is blocked. Teachers see assigned-section workflow status without historical learner snapshots. All overlapping calendar dates must be configured, classroom marks complete, and the clipped month ended before submission; ADM months are blocked. Monthly counts are session counts, not official credits. Read-only classroom absence monitoring now provides 1-31 date windows, current-access teacher scope, filtered cursor pagination, raw session observations, completion gaps and within-window absent-classroom-date runs. Unknowns, ADM and enrollment gaps break runs; explicit nonclass dates skip them. No school alert thresholds, dropout labels or automated messages are assigned. Manual manager-only follow-up now preserves opening evidence, current-evidence comparisons and reviewed action history. One open case is allowed per annual enrollment. Managers can assign active managerial staff, set due dates, update, resolve, cancel and reopen cases; existing cases remain manageable after year closure or source correction. Creation requires matching absence or recording-gap evidence in an active year. Automatic alerts remain disabled because the school has no approved rule. An explicit subject catalog now provides immutable normalized codes, versioned names/kinds/grade applicability, archival and protected change history. No official curriculum, grade weights or numeric Kindergarten policy is seeded. Section offerings pin subject metadata and grade applicability at an explicit catalog version. Managers may add, retire, reactivate and reorder offerings in open years; only draft years permit explicit snapshot refresh. Catalog changes never automatically rewrite section subject details. Teachers read offerings of their current advised open-year sections; no learner permissions are expanded. ADM participation/conversion, official attendance arithmetic, academic grades, promotion, official forms and closed-year record correction remain unimplemented. Supabase bearer authentication and deployed MFA are required. Calendar dates are YYYY-MM-DD in Asia/Manila; timestamps are UTC. JSON bodies are limited to 32 KiB, except timeline and placement preview/correction POST routes (256 KiB/1000 entries).' },
  servers: [{ url: '/' }],
  paths,
  components: {
    securitySchemes: { staffBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses: { Error: { description: 'Request failed. Error codes are stable; messages are for display.', content: { 'application/json': { schema: jsonSchema(z.object({ error: z.object({ code: z.string(), message: z.string(), fields: z.array(z.object({ path: z.string(), message: z.string() })).optional() }), requestId: uuid })) } } } },
  },
};
