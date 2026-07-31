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
