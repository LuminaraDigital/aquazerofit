/**
 * Who a request is counted against.
 *
 * The limiter runs before requireAuth, and it used to read the user id out of
 * the bearer token with jwt.decode, which checks nothing. That gave anyone
 * without an account two levers: a token naming someone else's user id spent
 * that user's budget, and a token naming a fresh random id each time made a
 * new bucket each time, which the single in-memory process kept for ten
 * minutes. These pin the opposite: only a token this server signed names a
 * user, and the bucket map cannot grow without bound.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../platform/config';
import { MAX_BUCKETS, rateLimiter, rateLimiterBucketCount, resetRateLimiter } from '../platform/rateLimiter';

const DEFAULT_LIMIT = 300;
const PATH = '/api/v1/plans/current';
const savedForce = process.env.AZF_RATE_LIMIT_FORCE;

beforeEach(() => {
  process.env.AZF_RATE_LIMIT_FORCE = '1';
  resetRateLimiter();
});

afterAll(() => {
  if (savedForce === undefined) delete process.env.AZF_RATE_LIMIT_FORCE;
  else process.env.AZF_RATE_LIMIT_FORCE = savedForce;
  resetRateLimiter();
});

function signed(sub: string): string {
  return jwt.sign({ sub }, config.jwtAccessSecret, { algorithm: 'HS256', expiresIn: 900 });
}

/** Same shape as a real token, signed with a key this server does not hold. */
function forged(sub: string): string {
  return jwt.sign({ sub }, 'not-the-server-secret', { algorithm: 'HS256', expiresIn: 900 });
}

function call(ip: string, token?: string): boolean {
  const req = {
    method: 'GET',
    path: PATH,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ip,
    socket: { remoteAddress: ip },
  } as unknown as Request;
  const res = {
    setHeader: () => undefined,
    status() {
      return this;
    },
    json: () => undefined,
  } as unknown as Response;
  let passed = false;
  const next: NextFunction = () => {
    passed = true;
  };
  rateLimiter(req, res, next);
  return passed;
}

describe('rate limiter subject', () => {
  it("does not let a forged token spend a real user's budget", () => {
    for (let i = 0; i < DEFAULT_LIMIT + 10; i += 1) call('10.0.0.1', forged('usr-victim'));
    expect(call('10.0.0.2', signed('usr-victim'))).toBe(true);
  });

  it('keeps no bucket per forged subject', () => {
    for (let i = 0; i < 2_000; i += 1) call('10.0.0.3', forged(`usr-${i}-${Math.random()}`));
    expect(rateLimiterBucketCount()).toBe(1);
  });

  it('still counts a signed user across addresses', () => {
    const token = signed('usr-roamer');
    let allowed = 0;
    for (let i = 0; i < DEFAULT_LIMIT; i += 1) {
      if (call(`10.0.1.${i % 2}`, token)) allowed += 1;
    }
    expect(allowed).toBe(DEFAULT_LIMIT);
    expect(call('10.0.1.9', token)).toBe(false);
  });

  it("does not charge a refused request to the user's own bucket", () => {
    for (let i = 0; i < DEFAULT_LIMIT; i += 1) call('10.0.2.1');
    const token = signed('usr-shared-wifi');
    for (let i = 0; i < 50; i += 1) expect(call('10.0.2.1', token)).toBe(false);
    let allowed = 0;
    for (let i = 0; i < DEFAULT_LIMIT; i += 1) {
      if (call('10.0.2.2', token)) allowed += 1;
    }
    expect(allowed).toBe(DEFAULT_LIMIT);
  });

  it('never holds more than MAX_BUCKETS buckets', () => {
    for (let i = 0; i < MAX_BUCKETS + 500; i += 1) {
      call(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`);
    }
    expect(rateLimiterBucketCount()).toBeLessThanOrEqual(MAX_BUCKETS);
  });
});
