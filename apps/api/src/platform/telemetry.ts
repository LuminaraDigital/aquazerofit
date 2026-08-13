/**
 * Telemetry (AQF-09 platform module): structured request logging plus the
 * mandatory AI-call record (provider, model, promptVersion, latency, tokens,
 * guardrail outcome) required by the admission sequence step 7 (AQF-07 §4).
 */
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (config.isTest) {
    next();
    return;
  }
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        kind: 'http',
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms,
      }),
    );
  });
  next();
}

export interface AiCallLog {
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  guardrail?: { blocked: boolean; category?: string | null };
  task?: string;
  userId?: string;
}

/** Every model call MUST be recorded through this function (AQF-09 §6 standards). */
export function logAiCall(entry: AiCallLog): void {
  if (config.isTest) return;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ t: new Date().toISOString(), kind: 'ai', ...entry }));
}

/**
 * Structured domain event, for things that are neither an HTTP request nor a
 * model call — money moving, chiefly.
 *
 * Payment outcomes are the one flow in this product with no user-visible audit
 * trail of its own: a user whose Stars left their balance and whose coach did
 * not unlock has nothing to show, so these lines are the only evidence an
 * operator will have. Never pass anything user-identifying beyond an internal
 * id — these land in whatever the host does with stdout.
 */
export function logEvent(name: string, fields: Record<string, unknown> = {}): void {
  if (config.isTest) return;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ t: new Date().toISOString(), kind: 'event', name, ...fields }));
}
