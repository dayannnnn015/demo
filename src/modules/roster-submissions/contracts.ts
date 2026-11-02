import {z} from 'zod';
import {uuid} from '../foundation/contracts.js';
import {subjectReason} from '../subjects/contracts.js';
import {issueSchema} from '../registry-review/contracts.js';
const version=z.number().int().min(1).max(2147483646),date=z.iso.date(),time=z.iso.datetime({offset:true});
const list={section_id:uuid,enrolled_on:date,entry_kind:z.enum(['regular','transfer_in']).default('regular'),csv:z.string().min(1).max(24000)};
export const submissionSchemas={
  check:z.strictObject(list),create:z.strictObject({...list,reason:subjectReason}),
  list:z.strictObject({status:z.enum(['submitted','withdrawn','accepted','declined','all']).default('submitted'),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)}),
  withdraw:z.strictObject({version,reason:subjectReason}),
  decide:z.strictObject({version,decision:z.enum(['accepted','declined']),import_id:uuid.nullable().default(null),reason:subjectReason}),
};
// A teacher prepares and submits; only a manager turns a list into learner records, through the reviewed import.
export const submissionOperations=([
  {id:'rosterSubmissionCheck',method:'post',path:'/api/v1/roster-submissions/check',summary:'Check a class list\'s format for a section you advise, without reading the registry or saving anything',body:submissionSchemas.check},
  {id:'rosterSubmissionCreate',method:'post',path:'/api/v1/roster-submissions',summary:'Submit a checked class list for your section, for a manager to import',body:submissionSchemas.create},
  {id:'rosterSubmissionList',method:'get',path:'/api/v1/roster-submissions',summary:'List class lists: every one for managers, your own for a teacher; the lists themselves are not included',query:submissionSchemas.list},
  {id:'rosterSubmissionGet',method:'get',path:'/api/v1/roster-submissions/:id',summary:'Read one class list, including the list itself'},
  {id:'rosterSubmissionWithdraw',method:'post',path:'/api/v1/roster-submissions/:id/withdrawal',summary:'Withdraw a class list you submitted while it is still waiting',body:submissionSchemas.withdraw},
  {id:'rosterSubmissionDecide',method:'post',path:'/api/v1/roster-submissions/:id/decision',summary:'Accept a waiting class list with the import you committed for it, or decline it with a reason',body:submissionSchemas.decide,manager:true},
] as const).map(op=>({...op,module:'roster-submissions' as const}));
export type SubmissionOperationId=typeof submissionOperations[number]['id'];
export const submissionRecord=z.object({id:uuid,section_id:uuid,academic_year_id:uuid,enrolled_on:date,entry_kind:z.enum(['regular','transfer_in']),row_count:z.number().int(),
  status:z.enum(['submitted','withdrawn','accepted','declined']),submitted_by:uuid,decided_by:uuid.nullable(),import_id:uuid.nullable(),version:z.number().int(),created_at:time,updated_at:time,
  grade_level:z.number().int(),section_name:z.string(),submitted_by_name:z.string().nullable()});
const profile=z.object({lrn:z.string().nullable(),first_name:z.string(),middle_name:z.string().nullable(),last_name:z.string(),name_extension:z.string().nullable(),birth_date:date,sex:z.enum(['male','female'])});
export const submissionResponses:Record<string,z.ZodType>={
  rosterSubmissionCheck:z.object({row_count:z.number().int(),rows:z.array(profile.nullable()),issues:z.array(issueSchema)}),
  rosterSubmissionCreate:submissionRecord,rosterSubmissionWithdraw:submissionRecord,rosterSubmissionDecide:submissionRecord,
  rosterSubmissionList:z.object({items:z.array(submissionRecord),pagination:z.object({limit:z.number().int(),offset:z.number().int(),has_more:z.boolean()})}),
  rosterSubmissionGet:submissionRecord.extend({csv:z.string()}),
};
