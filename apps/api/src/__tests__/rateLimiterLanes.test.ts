/**
 * Which lane each path lands in.
 *
 * This exists because the strict lane shipped as "/chat and the photo route"
 * - a list of the two model-calling surfaces that existed when it was written
 * - and then `POST /plans/generate` and `POST /workouts/:id/swap-exercise`
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
import { config } from '../platform/config';
import {
  AI_STRICT_PER_MINUTE,
  COACH_CHAT_PER_MINUTE,
  MEAL_PHOTO_PER_MINUTE,
  rateLimiter,
  resetRateLimiter,
} from '../platform/rateLimiter';

const STRICT_LIMIT = AI_STRICT_PER_MINUTE;
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

/** Minimal req/res pair. The limiter keys on the socket when no Worker secret is present. */
function callOnce(path: string, ip: string, method = 'POST'): { passed: boolean; status?: number } {
  const req = { method, path, headers: {}, ip, socket: { remoteAddress: ip } } as unknown as Request;
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
  const AI_ROUTES: ReadonlyArray<[label: string, path: string, limit: number]> = [
    ['chat turn', '/api/v1/chat/sessions/s_1/messages', COACH_CHAT_PER_MINUTE],
    ['typed meal draft', '/api/v1/chat/meal-drafts', COACH_CHAT_PER_MINUTE],
    // Express routes ignore case and a trailing slash, so the lanes must too.
    ['chat turn with a trailing slash', '/api/v1/chat/sessions/s_1/messages/', COACH_CHAT_PER_MINUTE],
    ['meal photo with a trailing slash', '/api/v1/meal-photos/', MEAL_PHOTO_PER_MINUTE],
    ['meal photo in another case', '/api/v1/Meal-Photos', MEAL_PHOTO_PER_MINUTE],
    ['meal recommendation in another case', '/api/v1/Recommendations/meals', STRICT_LIMIT],
    ['meal photo', '/api/v1/meal-photos', MEAL_PHOTO_PER_MINUTE],
    ['meal recommendation', '/api/v1/recommendations/meals', STRICT_LIMIT],
    ['weekly insight', '/api/v1/progress/insight', STRICT_LIMIT],
    ['plan generation', '/api/v1/plans/generate', STRICT_LIMIT],
    ['exercise swap', '/api/v1/workouts/w_1/swap-exercise', STRICT_LIMIT],
  ];

  it.each(AI_ROUTES)('puts %s on a model lane', (_label, path, limit) => {
    expect(callsUntilBlocked(path, `1.2.3.${path.length}`, limit + 5)).toBe(limit + 1);
  });

  it('keeps a photograph burst under the general model lane', () => {
    expect(MEAL_PHOTO_PER_MINUTE).toBeLessThan(AI_STRICT_PER_MINUTE);
    expect(COACH_CHAT_PER_MINUTE).toBeLessThan(AI_STRICT_PER_MINUTE);
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

  /*
   * Opening the coach screen reads the session list, the history and the
   * meal drafts. Those reads shared the 10/min chat lane with the model
   * call, so opening the screen and sending two or three messages inside a
   * minute answered 429 and the Mini App showed "Could not open the coach".
   * Only the two chat routes that call a model belong on that lane.
   */
  const CHAT_NON_MODEL: ReadonlyArray<[label: string, method: string, path: string]> = [
    ['listing chat sessions', 'GET', '/api/v1/chat/sessions'],
    ['starting a chat session', 'POST', '/api/v1/chat/sessions'],
    ['reading a chat history', 'GET', '/api/v1/chat/sessions/s_1/messages'],
    ['listing meal drafts', 'GET', '/api/v1/chat/meal-drafts'],
    ['confirming a meal draft', 'POST', '/api/v1/chat/meal-drafts/d_1/confirm'],
    ['reporting a message', 'POST', '/api/v1/chat/messages/m_1/report'],
    // Web and Android poll the job once a second while the model runs.
    ['polling a meal-photo job', 'GET', '/api/v1/meal-photos/j_1'],
    ['loading a meal photo', 'GET', '/api/v1/meal-photos/j_1/image'],
    ['confirming a meal photo', 'POST', '/api/v1/meal-photos/j_1/confirm'],
  ];

  it.each(CHAT_NON_MODEL)('leaves %s off the model lanes', (_label, method, path) => {
    for (let i = 0; i < STRICT_LIMIT * 2; i += 1) {
      expect(callOnce(path, `6.6.6.${path.length}`, method).passed).toBe(true);
    }
  });

  it('does not let screen reads spend the chat turns', () => {
    const ip = '7.7.7.7';
    for (let i = 0; i < COACH_CHAT_PER_MINUTE * 2; i += 1) {
      expect(callOnce('/api/v1/chat/sessions', ip, 'GET').passed).toBe(true);
    }
    expect(callsUntilBlocked('/api/v1/chat/sessions/s_1/messages', ip, COACH_CHAT_PER_MINUTE + 5)).toBe(
      COACH_CHAT_PER_MINUTE + 1,
    );
  });

  it('does not let a photo job poll spend the photo uploads', () => {
    const ip = '8.8.4.4';
    expect(callOnce('/api/v1/meal-photos', ip).passed).toBe(true);
    for (let i = 0; i < 30; i += 1) {
      expect(callOnce('/api/v1/meal-photos/j_1', ip, 'GET').passed).toBe(true);
    }
    expect(callsUntilBlocked('/api/v1/meal-photos', ip, MEAL_PHOTO_PER_MINUTE + 5)).toBe(MEAL_PHOTO_PER_MINUTE);
  });

  it('still lets the default lane refuse eventually', () => {
    expect(callsUntilBlocked('/api/v1/plans/current', '5.5.5.5', DEFAULT_LIMIT + 5)).toBe(
      DEFAULT_LIMIT + 1,
    );
  });

  /*
   * The auth lane is keyed per IP only, since the requests it sees are
   * unauthenticated by nature. Included so a future edit to the lane-selection
   * order cannot quietly demote credential guessing to the default lane.
   * The number itself comes from config.
   */
  it('keeps credential guessing on the per-IP auth lane', () => {
    const limit = config.authRateLimitPerMinute;
    expect(callsUntilBlocked('/api/v1/auth/login', '4.4.4.4', limit + 5)).toBe(limit + 1);
  });
});
