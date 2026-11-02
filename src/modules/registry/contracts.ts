import { z } from 'zod';
import { lrnDigits, plainName, plainNameMessage, singleSpaced } from '../../core/text.js';
import { uuid } from '../foundation/contracts.js';
const text = (max: number) => z.string().trim().overwrite(singleSpaced).min(1).max(max).regex(plainName, plainNameMessage);
const version = z.number().int().min(1).max(2147483646);
const date = z.iso.date();
const lrn = z.string().overwrite(lrnDigits).regex(/^[0-9]{12}$/, 'LRN must contain exactly 12 digits.');
const birthDate = date.refine(value => value >= '1900-01-01' && value <= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), 'Birth date must be a past or current date from 1900 onward.');
const page = { limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0) };
const profile = { first_name: text(100), middle_name: text(100).nullable(), last_name: text(100), name_extension: text(20).nullable(), birth_date: birthDate, sex: z.enum(['male', 'female']) };
export const registrySchemas = {
  // Every new learner carries an LRN (the user's decision of 14 October). A record from before, without one, is still read and completed through learnerLrn.
  learnerCreate: z.strictObject({ ...profile, middle_name: profile.middle_name.default(null), name_extension: profile.name_extension.default(null), lrn: z.string({ error: 'The LRN is required: all twelve digits.' }).overwrite(lrnDigits).regex(/^[0-9]{12}$/, 'LRN must contain exactly 12 digits.') }),
  learnerUpdate: z.strictObject({ ...profile, version }),
  learnerLrn: z.strictObject({ version, lrn }),
  learnerQuery: z.strictObject({ ...page, search: text(100).min(2).optional(), birth_date: date.optional(), lrn: lrn.optional(), sex: z.enum(['male', 'female']).optional(), include_linked: z.enum(['true','false']).default('false') }),
  enrollmentCreate: z.strictObject({ learner_id: uuid, section_id: uuid, enrolled_on: date, entry_kind: z.enum(['regular', 'transfer_in']).default('regular') }),
  enrollmentQuery: z.strictObject({ ...page, academic_year_id: uuid.optional(), section_id: uuid.optional(), learner_id: uuid.optional(), status: z.enum(['enrolled', 'withdrawn']).optional(), record_state: z.enum(['valid', 'voided', 'all']).default('valid') }),
  movement: z.strictObject({ version, action: z.enum(['reassigned', 'withdrawn', 'reentered']), effective_on: date, section_id: uuid.nullable().default(null), exit_reason: z.enum(['transfer_out', 'withdrawal', 'dropout', 'death']).nullable().default(null) }).refine(v => v.action === 'withdrawn' ? v.section_id === null && v.exit_reason !== null : v.section_id !== null && v.exit_reason === null, 'Withdrawals require exit_reason and no section; reassignment/reentry require section_id and no exit_reason.'),
  historyQuery: z.strictObject(page),
  countQuery: z.strictObject({ academic_year_id: uuid }),
  accessQuery: z.strictObject({ limit: page.limit, before_id: z.string().regex(/^[1-9][0-9]{0,17}$/).optional(), actor_user_id: uuid.optional(), record_id: uuid.optional() }),
};
export const registryOperations = ([
  { id: 'learnerList', method: 'get', path: '/api/v1/learners', summary: 'Search learners visible to the current staff member', query: registrySchemas.learnerQuery },
  { id: 'learnerCreate', method: 'post', path: '/api/v1/learners', summary: 'Create a learner with their twelve-digit LRN, which every new learner must carry', body: registrySchemas.learnerCreate, manager: true },
  { id: 'learnerGet', method: 'get', path: '/api/v1/learners/:id', summary: 'Read a visible learner profile' },
  { id: 'learnerUpdate', method: 'patch', path: '/api/v1/learners/:id', summary: 'Correct learner profile fields without changing an assigned LRN', body: registrySchemas.learnerUpdate, manager: true },
  { id: 'learnerLrn', method: 'patch', path: '/api/v1/learners/:id/lrn', summary: 'Assign the official LRN to a learner whose LRN is pending', body: registrySchemas.learnerLrn, manager: true },
  { id: 'enrollmentList', method: 'get', path: '/api/v1/enrollments', summary: 'List visible annual enrollments', query: registrySchemas.enrollmentQuery },
  { id: 'enrollmentCreate', method: 'post', path: '/api/v1/enrollments', summary: 'Enroll a learner once in a school year and assign a section', body: registrySchemas.enrollmentCreate, manager: true },
  { id: 'enrollmentGet', method: 'get', path: '/api/v1/enrollments/:id', summary: 'Read a visible annual enrollment' },
  { id: 'enrollmentMove', method: 'post', path: '/api/v1/enrollments/:id/movements', summary: 'Append a dated section change, withdrawal, or reentry; supply the current enrollment version', body: registrySchemas.movement, manager: true },
  { id: 'enrollmentHistory', method: 'get', path: '/api/v1/enrollments/:id/history', summary: 'Read original movement records, which may be superseded by corrections; use /timeline for effective history', query: registrySchemas.historyQuery, manager: true },
  { id: 'enrollmentCounts', method: 'get', path: '/api/v1/enrollment-counts', summary: 'Count valid annual enrollments by grade and status within what the caller may read; names no learner or enrollment and writes no access record', query: registrySchemas.countQuery },
  { id: 'recordAccessList', method: 'get', path: '/api/v1/record-access-events', summary: 'Review access to learner and enrollment records without raw search terms or profile values, optionally narrowed to one staff member or one record ID', query: registrySchemas.accessQuery, manager: true },
] as const).map(operation => ({ ...operation, module: 'registry' as const }));
export type RegistryOperationId = typeof registryOperations[number]['id'];

const timestamps = { version: z.number().int(), created_at: z.iso.datetime(), updated_at: z.iso.datetime() };
// Response schemas describe persisted values, without date-relative input refinements.
const learner = z.object({ id: uuid, lrn: lrn.nullable(), first_name: z.string(), middle_name: z.string().nullable(), last_name: z.string(), name_extension: z.string().nullable(), birth_date: date, sex: z.enum(['male', 'female']), merged_into: uuid.nullable(), identity_revision:z.number().int(), ...timestamps });
const enrollment = z.object({ id: uuid, learner_id: uuid, recorded_learner_id:uuid, record_state: z.enum(['valid', 'voided']), academic_year_id: uuid, grade_level: z.number().int(), section_id: uuid, enrolled_on: date, effective_on: date, status: z.enum(['enrolled', 'withdrawn']), last_reason: z.string(), ...timestamps });
const event = z.object({ id: uuid, enrollment_id: uuid, enrollment_version: z.number().int(), event_type: z.enum(['enrolled', 'reassigned', 'withdrawn', 'reentered']), effective_on: date, section_id: uuid, reason: z.string(), actor_user_id: uuid, request_id: uuid.nullable(), recorded_at: z.iso.datetime() });
const paginated = (schema: z.ZodType) => z.object({ items: z.array(schema), pagination: z.object({ limit: z.number(), offset: z.number(), has_more: z.boolean() }) });
export const registryResponses: Record<string, z.ZodType> = {
  learnerList: paginated(learner), learnerGet: learner, learnerCreate: learner, learnerUpdate: learner, learnerLrn: learner,
  enrollmentList: paginated(enrollment.extend({ learner: z.object({ id: uuid, last_name: z.string(), first_name: z.string(), middle_name: z.string().nullable(), name_extension: z.string().nullable(), lrn: z.string().nullable() }).nullable().describe('The learner this enrollment belongs to, or null when the caller may not read them') })), enrollmentGet: enrollment, enrollmentCreate: enrollment, enrollmentMove: enrollment,
  enrollmentHistory: paginated(event).extend({ interpretation: z.literal('original_movements'), timeline_version: z.number().int(), has_corrections: z.boolean(), record_state: z.enum(['valid', 'voided']), usable_for_reporting: z.boolean(), current_grade_level: z.number().int(), academic_year_id: uuid }),
  enrollmentCounts: z.object({ academic_year_id: uuid, scope: z.enum(['school', 'current_access']), record_state: z.literal('valid'), enrolled: z.number().int(), withdrawn: z.number().int(),
    grades: z.array(z.object({ grade_level: z.number().int(), enrolled: z.number().int(), withdrawn: z.number().int() })) }),
  recordAccessList: z.object({ items: z.array(z.object({ id: z.string(), occurred_at: z.iso.datetime(), actor_user_id: uuid, request_id: uuid, resource: z.string(), record_ids: z.array(uuid) })), pagination: z.object({ limit: z.number(), next_before_id: z.string().nullable() }) }),
};
