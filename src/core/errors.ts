export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const code = (error as { code?: string } | null)?.code;
  if (code === 'P0002') return new AppError(404, 'NOT_FOUND', 'The record was not found.');
  if (code === 'P0003') return new AppError(409, 'VERSION_CONFLICT', 'The record changed. Refresh before saving.');
  if (code === 'P0004') return new AppError(409, 'PREVIEW_EXPIRED', 'The import preview expired. Create and review a new preview.');
  if (code === 'P0005') return new AppError(409, 'PREVIEW_CHANGED', 'The import differs from the reviewed preview. Create and review a new preview.');
  if (code === 'P0006') return new AppError(409, 'PREVIEW_LIMIT', 'You have ten pending previews. Complete one or wait for a preview to expire.');
  if (code === 'P0100') return new AppError(409, 'TIMELINE_DATES', 'Use increasing dates within the school year and after birth. Movements cannot be future-dated.');
  if (code === 'P0101') return new AppError(409, 'TIMELINE_TRANSITION', 'Start with enrollment, then use valid reassignment, withdrawal, and reentry transitions and reasons.');
  if (code === 'P0102') return new AppError(409, 'TIMELINE_SECTION', 'Every section must match the enrollment school year and grade.');
  if (code === 'P0103') return new AppError(409, 'TIMELINE_UNCHANGED', 'The proposed timeline has no changes.');
  if (code === 'P0104') return new AppError(409, 'TIMELINE_REVIEW_CHANGED', 'The proposal or related records changed. Preview and review the correction again.');
  if (code === 'P0105') return new AppError(409, 'YEAR_CLOSED', 'A closed school year cannot be corrected through this workflow.');
  if (code === 'P0200') return new AppError(409, 'IDENTITY_CONFLICT', 'Resolve the conflicts shown in the identity preview before confirming.');
  if (code === 'P0201') return new AppError(409, 'LINKED_LEARNER_READ_ONLY', 'This profile is linked. Use the retained learner or review reversal of the identity link.');
  if (code === 'P0202') return new AppError(409, 'IDENTITY_REVIEW_CHANGED', 'The profiles, memberships, or enrollment history changed. Preview and review again.');
  if (code === 'P0300') return new AppError(409, 'ENROLLMENT_RECORD_CONFLICT', 'Resolve the conflicts shown in the enrollment record preview before confirming.');
  if (code === 'P0301') return new AppError(409, 'VOIDED_ENROLLMENT_READ_ONLY', 'This enrollment was voided. Review restoration before editing its timeline or recording movements.');
  if (code === 'P0302') return new AppError(409, 'ENROLLMENT_RECORD_REVIEW_CHANGED', 'The enrollment, related records, or review changed. Preview and review again.');
  if (code === 'P0400') return new AppError(409, 'PLACEMENT_UNCHANGED', 'The grade is unchanged. Use timeline review for a correction within the same grade.');
  if (code === 'P0401') return new AppError(409, 'PLACEMENT_HISTORY_CHANGED', 'Grade-placement corrections preserve every date, movement type, and reason. Review only the grade and replacement sections.');
  if (code === 'P0500') return new AppError(409, 'CALENDAR_DATES', 'Use distinct dates inside the school year and read at most 62 dates at a time.');
  if (code === 'P0501') return new AppError(409, 'CALENDAR_UNCHANGED', 'The calendar proposal has no changes.');
  if (code === 'P0502') return new AppError(409, 'CALENDAR_CONFLICT', 'Resolve the base-day or section-override conflicts shown in the calendar preview.');
  if (code === 'P0503') return new AppError(409, 'CALENDAR_REVIEW_CHANGED', 'The calendar proposal or related school records changed. Preview and review again.');
  if (code === 'P0600') return new AppError(409, 'ATTENDANCE_DATE', 'Select a date inside the section school year.');
  if (code === 'P0601') return new AppError(409, 'ATTENDANCE_YEAR', 'Record attendance only in an active year and on or before today.');
  if (code === 'P0602') return new AppError(409, 'ATTENDANCE_ENROLLMENT', 'The learner was not enrolled in this section on that date. Refresh the dated roster.');
  if (code === 'P0603') return new AppError(409, 'ATTENDANCE_SESSION', 'These marks require a configured classroom session. Alternative-delivery recording is not available yet.');
  if (code === 'P0604') return new AppError(409, 'ATTENDANCE_UNCHANGED', 'The attendance proposal has no changes.');
  if (code === 'P0605') return new AppError(409, 'ATTENDANCE_REVIEW_CHANGED', 'The attendance proposal or related records changed. Preview and review again.');
  if (code === 'P0606') return new AppError(409, 'ATTENDANCE_DEPENDENCY', 'Existing attendance conflicts with this correction. Review and clear affected marks before changing the enrollment or schedule.');
  if (code === 'P1100') return new AppError(409, 'OFFERING_YEAR_CLOSED', 'Closed-year subject offerings are read only.');
  if (code === 'P1101') return new AppError(409, 'OFFERING_SUBJECT', 'Use an active subject applicable to the section grade.');
  if (code === 'P1102') return new AppError(409, 'OFFERING_REFRESH_LOCKED', 'Subject details can only be refreshed while the school year is draft.');
  if (code === 'P1103') return new AppError(409, 'OFFERING_UNCHANGED', 'The subject offering proposal has no changes.');
  if (code === 'P1000') return new AppError(409, 'SUBJECT_UNCHANGED', 'The subject proposal has no changes.');
  if (code === 'P0900') return new AppError(409, 'FOLLOWUP_ASSIGNEE', 'Assign an active principal or administrative officer.');
  if (code === 'P0901') return new AppError(409, 'FOLLOWUP_DUE_DATE', 'Use a current or future new due date, and clear it when closing the case.');
  if (code === 'P0902') return new AppError(409, 'FOLLOWUP_BLOCKED', 'Resolve the issues shown in the follow-up review.');
  if (code === 'P0903') return new AppError(409, 'FOLLOWUP_REVIEW_CHANGED', 'The follow-up, evidence or proposal changed. Refresh and review again.');
  if (code === 'P0904') return new AppError(409, 'FOLLOWUP_TRANSITION', 'This action is not available in the current follow-up state.');
  if (code === 'P0800') return new AppError(409, 'MONITOR_RANGE', 'Choose 1 to 31 nonfuture dates within the section school year.');
  if (code === 'P0700') return new AppError(409, 'MONTH_RANGE', 'Use the first day of a month that overlaps the school year.');
  if (code === 'P0701') return new AppError(409, 'MONTH_YEAR', 'Monthly transitions require an active school year.');
  if (code === 'P0702') return new AppError(409, 'MONTH_TRANSITION', 'This action is not available in the current month status.');
  if (code === 'P0703') return new AppError(409, 'MONTH_INCOMPLETE', 'Resolve the monthly calendar, attendance or date issues before submitting.');
  if (code === 'P0704') return new AppError(409, 'MONTH_REVIEW_CHANGED', 'The monthly data or review changed. Refresh and review again.');
  if (code === 'P0707') return new AppError(409, 'MONTH_FROZEN', 'A manager must return or reopen the affected attendance month before editing.');
  if (code === 'P0708') return new AppError(409, 'MONTH_DEPENDENCY', 'This change affects a submitted or locked month. Return or reopen the affected months first.');
  if (code === 'P0709') return new AppError(409, 'MONTH_SIZE', 'Monthly review currently supports at most 1000 distinct enrollments per section.');
  if (code === '23505') return new AppError(409, 'ALREADY_EXISTS', 'A conflicting record already exists.');
  if (code === '23503' || code === '23001') return new AppError(409, 'INVALID_REFERENCE', 'The referenced record does not exist or is still in use.');
  if (code === '23514') return new AppError(409, 'RULE_VIOLATION', 'This change violates a school record rule. Check dates, status, and assignments.');
  if (code === '42501') return new AppError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
  if (code === '40001' || code === '40P01' || code === '55P03') return new AppError(409, 'RETRY_REQUIRED', 'Another change is in progress. Refresh the record and try again.');
  if (code === '57014' || code?.startsWith('08') || code === 'CONNECTION_CLOSED' || code === 'CONNECT_TIMEOUT') {
    return new AppError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
}
