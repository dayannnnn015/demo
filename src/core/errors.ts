export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') return new AppError(409, 'ALREADY_EXISTS', 'A conflicting record already exists.');
  if (code === '23503') return new AppError(409, 'INVALID_REFERENCE', 'The referenced record does not exist or is still in use.');
  if (code === '23514') return new AppError(409, 'RULE_VIOLATION', 'This change violates a school record rule. Check dates, status, and assignments.');
  if (code === '42501') return new AppError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
  if (code === '40001' || code === '40P01' || code === '55P03') return new AppError(409, 'RETRY_REQUIRED', 'Another change is in progress. Refresh the record and try again.');
  if (code === '57014' || code?.startsWith('08') || code === 'CONNECTION_CLOSED' || code === 'CONNECT_TIMEOUT') {
    return new AppError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
}
