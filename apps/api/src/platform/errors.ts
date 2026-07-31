/**
 * Error taxonomy plumbing (AQF-07 §5): every non-success response uses the
 * single envelope { code, message, details? } with codes from the shared taxonomy.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@aquazerofit/shared';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_CODES[this.code];
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message };
    if (this.details !== undefined) body.details = this.details;
    return body;
  }
}

/** Wraps async route handlers so rejections reach the error handler (Express 4). */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found' } satisfies ApiErrorBody);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // Rate-limit errors carry a machine-readable backoff hint.
    if (err.code === 'RATE_LIMITED') {
      const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      if (typeof retry === 'number' && retry > 0) res.setHeader('Retry-After', String(retry));
    }
    res.status(err.status).json(err.toBody());
    return;
  }
  if (err instanceof ZodError) {
    res.status(ERROR_CODES.VALIDATION_FAILED).json({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    } satisfies ApiErrorBody);
    return;
  }
  // Unknown failure: never leak internals to the client.
  // eslint-disable-next-line no-console
  console.error('[internal-error]', err);
  res
    .status(ERROR_CODES.INTERNAL)
    .json({ code: 'INTERNAL', message: 'Internal server error' } satisfies ApiErrorBody);
}
