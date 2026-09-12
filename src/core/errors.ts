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
