import { z } from 'zod';
import { uuid } from '../foundation/contracts.js';
import { registrySchemas, registryResponses } from '../registry/contracts.js';

const reason = z.string().trim().min(10).max(500).regex(/^[^\u0000-\u001f\u007f]*$/, 'Use a single line of text.');
const version = z.number().int().min(1).max(2147483646);
const row = z.number().int().min(1).max(50);
const resolution = z.discriminatedUnion('action', [
  z.strictObject({ row, action: z.literal('use_existing'), learner_id: uuid, version }),
  z.strictObject({ row, action: z.literal('create_distinct'), reason }),
]);
const importBody = {
  section_id: uuid, enrolled_on: z.iso.date(), entry_kind: z.enum(['regular', 'transfer_in']).default('regular'),
  csv: z.string().min(1).max(24000), resolutions: z.array(resolution).max(50).default([]),
};
export const reviewSchemas = {
  preview: z.strictObject(importBody),
  commit: z.strictObject({ ...importBody, confirmed: z.literal(true) }),
  correction: z.strictObject({ version, previous_lrn: registrySchemas.learnerLrn.shape.lrn, corrected_lrn: registrySchemas.learnerLrn.shape.lrn, reason, reviewed: z.literal(true) }),
};
export type ImportInput = z.infer<typeof reviewSchemas.preview>;
export const reviewOperations = ([
  { id: 'importTemplate', method: 'get', path: '/api/v1/roster-imports/template', summary: 'Get the minimal EDUNEXUS UTF-8 CSV roster template and limits' },
  { id: 'importPreview', method: 'post', path: '/api/v1/roster-imports/preview', summary: 'Validate a class roster and review explicit duplicate resolutions without creating learners', body: reviewSchemas.preview },
  { id: 'importGet', method: 'get', path: '/api/v1/roster-imports/:id', summary: 'Read your preview status or committed import receipt' },
  { id: 'importCommit', method: 'post', path: '/api/v1/roster-imports/:id/commit', summary: 'Confirm the identical reviewed payload; commit all rows atomically or return the original receipt on retry', body: reviewSchemas.commit },
  { id: 'lrnCorrect', method: 'post', path: '/api/v1/learners/:id/lrn-corrections', summary: 'Record a manager-reviewed LRN correction with previous value, version, and reason', body: reviewSchemas.correction },
  { id: 'lrnCorrectionHistory', method: 'get', path: '/api/v1/learners/:id/lrn-corrections', summary: 'Read protected, immutable LRN correction history', query: registrySchemas.historyQuery },
] as const).map(operation => ({ ...operation, module: 'registry-review' as const, manager: true as const }));
export type ReviewOperationId = typeof reviewOperations[number]['id'];

const profile = z.object({ lrn: z.string().nullable(), first_name: z.string(), middle_name: z.string().nullable(), last_name: z.string(), name_extension: z.string().nullable(), birth_date: z.iso.date(), sex: z.enum(['male', 'female']) });
export const candidateSchema = profile.extend({ id: uuid, version: z.number().int() });
export const previewRowSchema = z.object({ row, profile: profile.nullable(), action: z.enum(['create', 'use_existing']).nullable(), learner_id: uuid.nullable(), candidates: z.array(candidateSchema), candidates_truncated: z.boolean() });
export const issueSchema = z.object({ row: z.number().int().min(0), field: z.string(), code: z.string(), message: z.string() });
export const receiptSchema = z.object({ preview_id: uuid, section_id: uuid, academic_year_id: uuid, items: z.array(z.object({ row, learner_id: uuid, enrollment_id: uuid, action: z.enum(['create', 'use_existing']), resolution_reason: z.string().nullable() })) });
export const reviewResponses: Record<string, z.ZodType> = {
  importTemplate: z.object({ format: z.literal('edunexus-roster-v1'), csv: z.string(), max_rows: z.literal(50), max_csv_bytes: z.literal(24000), max_request_bytes: z.literal(32768), preview_minutes: z.literal(30), instructions: z.array(z.string()) }),
  importPreview: z.object({ can_commit: z.boolean(), preview_id: uuid.nullable(), expires_at: z.iso.datetime().nullable(), section: z.object({ id: uuid, name: z.string(), grade_level: z.number(), academic_year_id: uuid, version: z.number() }), rows: z.array(previewRowSchema), issues: z.array(issueSchema) }),
  importGet: z.object({ id: uuid, row_count: z.number(), created_at: z.iso.datetime(), expires_at: z.iso.datetime(), committed_at: z.iso.datetime().nullable(), status: z.enum(['pending', 'expired', 'committed']), receipt: receiptSchema.nullable() }),
  importCommit: receiptSchema,
  lrnCorrect: registryResponses.learnerGet!,
  lrnCorrectionHistory: z.object({ items: z.array(z.object({ id: uuid, learner_id: uuid, learner_version: z.number(), previous_lrn: z.string(), corrected_lrn: z.string(), reason: z.string(), actor_user_id: uuid, request_id: uuid, recorded_at: z.iso.datetime() })), pagination: z.object({ limit: z.number(), offset: z.number(), has_more: z.boolean() }) }),
};
