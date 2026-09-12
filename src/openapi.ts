import { z } from 'zod';
import { staffRole, uuid } from './modules/foundation/contracts.js';
import { operations } from './operations.js';
import { registryResponses } from './modules/registry/contracts.js';
import { reviewResponses } from './modules/registry-review/contracts.js';

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
    tags: ['module' in op ? op.module === 'registry-review' ? 'Registry review and import' : 'Learners and enrollment' : 'Foundation'],
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
  info: { title: 'EDUNEXUS API', version: '0.3.0', description: 'Sections 1, 2A, and 2B.1: school setup, learner registry, annual enrollment, dated movement history, reviewed LRN corrections, and class-roster CSV preview/commit. Managers edit learner records; teachers read only current assigned open-year rosters. Imports require an explicit confirmation by the same manager within 30 minutes, identical input, and unchanged relevant records; retries return the original committed receipt. CSV imports use an EDUNEXUS template, not a LIS file format. Assigned LRNs can change only through the reviewed correction endpoint. Movement effective_on must strictly follow the previous event; enrollment timeline corrections and existing-record merges remain unimplemented. Bearer tokens come from Supabase Auth and deployed access requires MFA. Dates are YYYY-MM-DD in Asia/Manila; timestamps are UTC. Attendance, grades, and official forms are not implemented.' },
  servers: [{ url: '/' }],
  paths,
  components: {
    securitySchemes: { staffBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses: { Error: { description: 'Request failed. Error codes are stable; messages are for display.', content: { 'application/json': { schema: jsonSchema(z.object({ error: z.object({ code: z.string(), message: z.string(), fields: z.array(z.object({ path: z.string(), message: z.string() })).optional() }), requestId: uuid })) } } } },
  },
};
