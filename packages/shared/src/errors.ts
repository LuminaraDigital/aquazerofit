/**
 * Error taxonomy per AQF-07 API Contract §5.
 * Every non-success response uses one envelope: { code, message, details? }.
 */

export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  AUTH_TG_INVALID: 401,
  AUTH_TG_STALE: 401,
  FORBIDDEN: 403,
  // Distinct from FORBIDDEN so clients can deep-link to the consent screen:
  // the resource exists but access requires an explicit opt-in (AQF-07 §3.4).
  CONSENT_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CREDITS_INSUFFICIENT: 402,
  SAFETY_INPUT: 422,
  SAFETY_OUTPUT: 422,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  // Distinct from AI_UNAVAILABLE so a client can tell "the coach can't answer
  // right now" from "this deployment cannot take payments at all" — the first
  // is worth retrying, the second is worth hiding the buy button for.
  PAYMENT_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string' &&
    (value as { code: string }).code in ERROR_CODES
  );
}
