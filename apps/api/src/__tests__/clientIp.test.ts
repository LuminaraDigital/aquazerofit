/**
 * CF-Connecting-IP is the client only when the Worker shared secret matches.
 * A direct caller of Cloud Run can set that header, so a mismatch or a
 * missing secret must keep the socket address.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  CF_CONNECTING_IP_HEADER,
  ORIGIN_SHARED_SECRET_HEADER,
  clientIpForRateLimit,
  originSecretMatches,
  resetOriginSecretWarning,
} from '../platform/clientIp';
import { rateLimiter, resetRateLimiter } from '../platform/rateLimiter';
import { config } from '../platform/config';

const ORIGINAL_SECRET = process.env.ORIGIN_SHARED_SECRET;
const ORIGINAL_PREVIOUS = process.env.ORIGIN_SHARED_SECRET_PREVIOUS;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VITEST = process.env.VITEST;
const ORIGINAL_FORCE = process.env.AZF_RATE_LIMIT_FORCE;

function fakeReq(input: {
  socket?: string;
  cf?: string;
  secret?: string;
  path?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (input.cf !== undefined) headers[CF_CONNECTING_IP_HEADER] = input.cf;
  if (input.secret !== undefined) headers[ORIGIN_SHARED_SECRET_HEADER] = input.secret;
  return {
    path: input.path ?? '/api/v1/auth/login',
    headers,
    ip: '203.0.113.99',
    socket: { remoteAddress: input.socket ?? '10.0.0.8' },
  } as unknown as Request;
}

function callLimiter(req: Request): boolean {
  let passed = false;
  const res = {
    setHeader: () => undefined,
    status() {
      return this;
    },
    json: () => undefined,
  } as unknown as Response;
  const next: NextFunction = () => {
    passed = true;
  };
  rateLimiter(req, res, next);
  return passed;
}

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.ORIGIN_SHARED_SECRET;
  else process.env.ORIGIN_SHARED_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_PREVIOUS === undefined) delete process.env.ORIGIN_SHARED_SECRET_PREVIOUS;
  else process.env.ORIGIN_SHARED_SECRET_PREVIOUS = ORIGINAL_PREVIOUS;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_VITEST === undefined) delete process.env.VITEST;
  else process.env.VITEST = ORIGINAL_VITEST;
  if (ORIGINAL_FORCE === undefined) delete process.env.AZF_RATE_LIMIT_FORCE;
  else process.env.AZF_RATE_LIMIT_FORCE = ORIGINAL_FORCE;
  resetOriginSecretWarning();
  resetRateLimiter();
});

describe('originSecretMatches', () => {
  it('matches equal secrets and rejects a different length without throwing', () => {
    expect(originSecretMatches('same-secret', 'same-secret')).toBe(true);
    expect(originSecretMatches('short', 'same-secret')).toBe(false);
    expect(originSecretMatches(undefined, 'same-secret')).toBe(false);
    expect(originSecretMatches('same-secret', '')).toBe(false);
  });
});

describe('clientIpForRateLimit', () => {
  it('uses CF-Connecting-IP only when the shared secret matches', () => {
    process.env.ORIGIN_SHARED_SECRET = 'worker-secret';
    expect(
      clientIpForRateLimit(
        fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20', secret: 'worker-secret' }),
      ),
    ).toBe('198.51.100.20');
  });

  it('falls back to the socket when the secret is wrong, missing, or unset', () => {
    process.env.ORIGIN_SHARED_SECRET = 'worker-secret';
    expect(
      clientIpForRateLimit(fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20', secret: 'nope' })),
    ).toBe('10.0.0.8');
    expect(clientIpForRateLimit(fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20' }))).toBe(
      '10.0.0.8',
    );
    delete process.env.ORIGIN_SHARED_SECRET;
    expect(
      clientIpForRateLimit(
        fakeReq({ socket: '10.0.0.9', cf: '198.51.100.20', secret: 'worker-secret' }),
      ),
    ).toBe('10.0.0.9');
  });

  it('trusts CF-Connecting-IP behind the previous secret during a rotation', () => {
    // Otherwise every visitor collapses into one bucket for as long as the
    // Worker still sends the old value.
    process.env.ORIGIN_SHARED_SECRET = 'new-secret';
    process.env.ORIGIN_SHARED_SECRET_PREVIOUS = 'old-secret';
    expect(
      clientIpForRateLimit(fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20', secret: 'old-secret' })),
    ).toBe('198.51.100.20');
    expect(
      clientIpForRateLimit(fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20', secret: 'other' })),
    ).toBe('10.0.0.8');
  });

  it('ignores a CF-Connecting-IP that is not a single address', () => {
    process.env.ORIGIN_SHARED_SECRET = 'worker-secret';
    expect(
      clientIpForRateLimit(
        fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20, 10.1.1.1', secret: 'worker-secret' }),
      ),
    ).toBe('10.0.0.8');
    expect(
      clientIpForRateLimit(fakeReq({ socket: '10.0.0.8', cf: 'not-an-ip', secret: 'worker-secret' })),
    ).toBe('10.0.0.8');
  });

  it('warns once in production when a CF ip arrives and the secret is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VITEST;
    delete process.env.ORIGIN_SHARED_SECRET;
    resetOriginSecretWarning();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(clientIpForRateLimit(fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20' }))).toBe(
        '10.0.0.8',
      );
      clientIpForRateLimit(fakeReq({ socket: '10.0.0.8', cf: '198.51.100.21' }));
      const events = warn.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.includes('origin_secret_unset'));
      expect(events).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('rate limiter client address', () => {
  it('gives each trusted CF-Connecting-IP its own auth bucket on one socket', () => {
    process.env.ORIGIN_SHARED_SECRET = 'worker-secret';
    process.env.AZF_RATE_LIMIT_FORCE = '1';
    resetRateLimiter();
    const limit = config.authRateLimitPerMinute;
    for (let i = 0; i < limit; i += 1) {
      expect(
        callLimiter(
          fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20', secret: 'worker-secret' }),
        ),
      ).toBe(true);
    }
    expect(
      callLimiter(fakeReq({ socket: '10.0.0.8', cf: '198.51.100.20', secret: 'worker-secret' })),
    ).toBe(false);
    expect(
      callLimiter(fakeReq({ socket: '10.0.0.8', cf: '198.51.100.21', secret: 'worker-secret' })),
    ).toBe(true);
  });

  it('shares one socket bucket when CF-Connecting-IP is not authenticated', () => {
    process.env.ORIGIN_SHARED_SECRET = 'worker-secret';
    process.env.AZF_RATE_LIMIT_FORCE = '1';
    resetRateLimiter();
    const limit = config.authRateLimitPerMinute;
    for (let i = 0; i < limit; i += 1) {
      expect(callLimiter(fakeReq({ socket: '10.0.0.8', cf: `198.51.100.${i}` }))).toBe(true);
    }
    expect(callLimiter(fakeReq({ socket: '10.0.0.8', cf: '203.0.113.5', secret: 'spoofed' }))).toBe(
      false,
    );
  });
});
