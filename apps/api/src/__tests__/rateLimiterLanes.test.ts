/**
 * Which lane each path lands in.
 *
 * This exists because the strict lane shipped as "/chat and the photo route"
 * — a list of the two model-calling surfaces that existed when it was written
 * — and then `POST /plans/generate` and `POST /workouts/:id/swap-exercise`
 * were added, both of which call the AI gateway, and neither of which was
 * added here. They sat on the 300/min default lane, so a caller could drive
 * fifteen times more model calls per minute through them than through /chat.
 *
 * The limiter had no tests at all, which is why nothing noticed. These pin the
 * membership of the lane rather than the numbers, so adding a gateway caller
 * without putting it on the strict lane fails here instead of in the bill.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { rateLimiter, resetRateLimiter } from '../platform/rateLimiter';

const STRICT_LIMIT = 20;
const DEFAULT_LIMIT = 300;

const savedForce = process.env.AZF_RATE_LIMIT_FORCE;

/**
 * The limiter no-ops under NODE_ENV=test unless this is set, so that the
 * hundreds of integration tests in this suite are not throttled by it. Forcing
 * it on is the only way to observe the behaviour the production deployment
 * actually gets.
 */
beforeEach(() => {
  process.env.AZF_RATE_LIMIT_FORCE = '1';
  resetRateLimiter();
});

afterAll(() => {
  if (savedForce === undefined) delete process.env.AZF_RATE_LIMIT_FORCE;
  else process.env.AZF_RATE_LIMIT_FORCE = savedForce;
  resetRateLimiter();
});

/** Minimal req/res pair — the limiter reads only path, headers and ip. */
function callOnce(path: string, ip: string): { passed: boolean; status?: number } {
  const req = { path, headers: {}, ip } as unknown as Request;
  let status: number | undefined;
  const res = {
    setHeader: () => undefined,
    status(code: number) {
      status = code;
      return this;
    },
    json: () => undefined,
  } as unknown as Response;

  let passed = false;
  const next: NextFunction = () => {
    passed = true;
  };
  rateLimiter(req, res, next);
  return { passed, status };
}

/** Requests from one IP until the limiter refuses, capped so a bug cannot hang. */
function callsUntilBlocked(path: string, ip: string, cap: number): number {
  for (let i = 1; i <= cap; i += 1) {
    const { passed, status } = callOnce(path, ip);
    if (!passed) {
      expect(status).toBe(429);
      return i;
    }
  }
  return cap + 1;
}

describe('rate limiter lanes', () => {
  /*
   * One case per surface that can reach the AI gateway. Each is listed with
   * the credit task it spends, because that is the property that puts it here:
   * if a route reserves credits it calls a model, and if it calls a model it
   * belongs on the strict lane.
   */
  const AI_ROUTES: ReadonlyArray<[label: string, path: string]> = [
    ['chat turn', '/api/v1/chat/sessions/s_1/messages'],
    ['meal photo', '/api/v1/meal-photos'],
    ['meal recommendation', '/api/v1/recommendations/meals'],
    ['weekly insight', '/api/v1/progress/insight'],
    ['plan generation', '/api/v1/plans/generate'],
    ['exercise swap', '/api/v1/workouts/w_1/swap-exercise'],
  ];

  it.each(AI_ROUTES)('puts %s on the strict lane', (_label, path) => {
    expect(callsUntilBlocked(path, `1.2.3.${path.length}`, STRICT_LIMIT + 5)).toBe(STRICT_LIMIT + 1);
  });

  /*
   * The counterweight. Matching '/plans' or '/workouts' wholesale would have
   * been the easy way to cover the two new AI routes, and it would have
   * throttled ordinary logging to protect a model call it never makes:
   * /workouts/:id/complete fires per set during a live session and
   * /progress/summary backs the dashboard. Both must stay generous.
   */
  const NON_AI_ROUTES: ReadonlyArray<[label: string, path: string]> = [
    ['completing a workout set', '/api/v1/workouts/w_1/complete'],
    ['reading the current plan', '/api/v1/plans/current'],
    ['the dashboard summary', '/api/v1/progress/summary'],
    ['plan readiness', '/api/v1/plans/readiness'],
  ];

  it.each(NON_AI_ROUTES)('leaves %s on the default lane', (_label, path) => {
    // Well past the strict limit and still passing is the assertion; walking
    // all the way to 300 would only re-test the default lane's own number.
    for (let i = 0; i < STRICT_LIMIT * 2; i += 1) {
      expect(callOnce(path, `9.8.7.${path.length}`).passed).toBe(true);
    }
  });

  it('still lets the default lane refuse eventually', () => {
    expect(callsUntilBlocked('/api/v1/plans/current', '5.5.5.5', DEFAULT_LIMIT + 5)).toBe(
      DEFAULT_LIMIT + 1,
    );
  });

  /*
   * The auth lane is the tightest of all and is keyed per IP only, since the
   * requests it sees are unauthenticated by nature. Included so a future edit
   * to the lane-selection order cannot quietly demote credential guessing to
   * a looser lane.
   */
  it('keeps the auth lane strictest', () => {
    expect(callsUntilBlocked('/api/v1/auth/login', '4.4.4.4', 30)).toBe(11);
  });
});
