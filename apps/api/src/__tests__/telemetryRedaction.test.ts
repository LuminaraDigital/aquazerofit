/**
 * TELEMETRY PAYLOAD REDACTION SUITE.
 *
 * The request logger already logs no bodies and no headers, and redactUrl
 * already scrubs query values. logEvent was the hole: it takes a freeform
 * `Record<string, unknown>` from the caller and serialised it verbatim, so
 * whether a secret reached stdout depended on every future call site
 * remembering a rule. Redaction now lives inside logEvent, where it cannot be
 * forgotten.
 *
 * Two properties are asserted here and they pull in opposite directions:
 * secrets must be caught even when they are nested, renamed or wrapped in an
 * array; and ordinary operational fields must survive, because a log line
 * scrubbed into uselessness is a log line nobody reads.
 *
 * The defensive behaviour is tested as hard as the redaction itself. This code
 * runs inside a logger — a scrubber that throws or spins on a cyclic payload
 * takes down the request it was only supposed to observe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDACTED, logEvent, redactUrl, scrubLogFields } from '../platform/telemetry';

/** Convenience: scrub an object and read it back as a plain record. */
function scrub(value: unknown): Record<string, unknown> {
  return scrubLogFields(value) as Record<string, unknown>;
}

describe('scrubLogFields — what must never survive', () => {
  it('redacts the denylisted keys at the top level', () => {
    const out = scrub({
      password: 'hunter2',
      token: 'eyJhbGciOi',
      access_token: 'at-1',
      refresh_token: 'rt-1',
      secret: 's',
      authorization: 'Bearer abc',
      apikey: 'k',
      initdata: 'query_id=...&hash=...',
    });
    for (const value of Object.values(out)) expect(value).toBe(REDACTED);
  });

  it('redacts the four keys added for this change', () => {
    const out = scrub({
      creditCard: '4111111111111111',
      cookie: 'sid=abc; Path=/',
      apiKey: 'sk-live-1',
      sessionId: 'sess-9',
    });
    expect(Object.values(out)).toEqual([REDACTED, REDACTED, REDACTED, REDACTED]);
  });

  it('matches case-insensitively and on substrings, across naming conventions', () => {
    const out = scrub({
      userPassword: 'hunter2',
      'X-Api-Key': 'sk-1',
      ACCESS_TOKEN: 'at',
      tgInitData: 'hash=...',
      stripeCreditCardLast4: '4242',
      chatSessionId: 'cs-1',
      requestCookieHeader: 'sid=1',
      refreshTokenFamily: 'fam-1',
    });
    for (const [key, value] of Object.entries(out)) {
      expect(value, `expected ${key} to be redacted`).toBe(REDACTED);
    }
  });

  it('redacts nested objects however deep the secret is buried', () => {
    const out = scrub({
      user: { id: 'u-1', auth: { refreshToken: 'rt-1', issuedAt: '2026-01-01' } },
    });
    expect(out).toEqual({
      user: { id: 'u-1', auth: { refreshToken: REDACTED, issuedAt: '2026-01-01' } },
    });
  });

  it('walks into arrays, including arrays of arrays', () => {
    const out = scrub({
      sessions: [
        { id: 's-1', token: 'a' },
        { id: 's-2', token: 'b' },
      ],
      nested: [[{ password: 'p' }]],
    });
    expect(out.sessions).toEqual([
      { id: 's-1', token: REDACTED },
      { id: 's-2', token: REDACTED },
    ]);
    expect(out.nested).toEqual([[{ password: REDACTED }]]);
  });
});

describe('scrubLogFields — false positives, which are the real design question', () => {
  it('leaves ordinary operational fields alone', () => {
    // Every key here is one an existing logEvent call site passes today.
    const fields = {
      reason: 'secret_mismatch',
      action: 'register',
      coachId: 'coach-nia',
      stars: 250,
      expected: 250,
      received: 100,
      packageName: 'fit.aquazero.app',
      payload: 'coach:nia:u-1',
    };
    expect(scrub(fields)).toEqual(fields);
  });

  it('does NOT redact keys that merely contain the short denylist words', () => {
    // `code` is the dangerous one to match loosely: this product scans barcodes
    // and returns a code-based error taxonomy.
    const fields = {
      barcode: '5000159407236',
      statusCode: 503,
      errorCode: 'NOT_READY',
      countryCode: 'GB',
      resetCount: 3,
      signatureVersion: 'v2',
    };
    expect(scrub(fields)).toEqual(fields);
  });

  it('still redacts those words on an exact match, as the query denylist does', () => {
    expect(scrub({ code: 'oauth-grant', reset: 'tok', signature: 'sig' })).toEqual({
      code: REDACTED,
      reset: REDACTED,
      signature: REDACTED,
    });
  });

  it('matches KEYS only — a food called "cookie" is a value and passes through', () => {
    // The whole reason `cookie` is safe to substring-match in a nutrition app.
    const fields = { foodName: 'cookie', items: ['cookie', 'password'], note: 'my api key is 5' };
    expect(scrub(fields)).toEqual(fields);
  });
});

describe('scrubLogFields — it must not throw or hang inside a logger', () => {
  it('replaces a direct cycle rather than recursing forever', () => {
    const node: Record<string, unknown> = { id: 'n-1' };
    node.self = node;
    expect(scrub({ node })).toEqual({ node: { id: 'n-1', self: '[circular]' } });
  });

  it('handles a cycle through an array', () => {
    const list: unknown[] = [{ id: 1 }];
    list.push(list);
    const out = scrub({ list }) as { list: unknown[] };
    expect(out.list[0]).toEqual({ id: 1 });
    expect(out.list[1]).toBe('[circular]');
  });

  it('does not mistake a repeated sibling for a cycle', () => {
    const shared = { id: 'shared' };
    expect(scrub({ a: shared, b: shared })).toEqual({ a: { id: 'shared' }, b: { id: 'shared' } });
  });

  it('caps recursion depth', () => {
    // 12 levels deep, well past the cap.
    let deep: Record<string, unknown> = { bottom: true };
    for (let i = 0; i < 12; i += 1) deep = { next: deep };
    expect(JSON.stringify(scrub(deep))).toContain('[depth-limited]');
  });

  it('truncates very long arrays instead of expanding them into the log', () => {
    const out = scrub({ items: Array.from({ length: 500 }, (_, i) => i) });
    const items = out.items as unknown[];
    expect(items).toHaveLength(201);
    expect(items[200]).toBe('[+300 more]');
  });

  it('survives non-object payloads', () => {
    expect(scrubLogFields(null)).toBeNull();
    expect(scrubLogFields(undefined)).toBeUndefined();
    expect(scrubLogFields('a string')).toBe('a string');
    expect(scrubLogFields(42)).toBe(42);
    expect(scrubLogFields(true)).toBe(true);
    expect(scrubLogFields([1, 'two'])).toEqual([1, 'two']);
  });

  it('stringifies BigInt, which JSON.stringify refuses outright', () => {
    expect(() => JSON.stringify({ n: 1n })).toThrow();
    expect(() => JSON.stringify(scrub({ n: 1n }))).not.toThrow();
    expect(scrub({ n: 1n })).toEqual({ n: '1n' });
  });

  it('keeps Dates serialisable rather than flattening them to {}', () => {
    const at = new Date('2026-08-28T00:00:00.000Z');
    expect(scrub({ at }).at).toBe(at);
    expect(JSON.parse(JSON.stringify(scrub({ at }))).at).toBe('2026-08-28T00:00:00.000Z');
  });

  it('summarises binary blobs instead of expanding them', () => {
    expect(scrub({ photo: Buffer.from('a meal photo would be megabytes') })).toEqual({
      photo: '[binary]',
    });
  });

  it('names functions and symbols, which JSON.stringify would silently drop', () => {
    const out = scrub({ cb: () => undefined, sym: Symbol('s') });
    expect(out.cb).toBe('[function]');
    expect(out.sym).toBe('[symbol]');
  });
});

describe('logEvent applies the scrubber', () => {
  const saved = { nodeEnv: process.env.NODE_ENV, vitest: process.env.VITEST };

  afterEach(() => {
    process.env.NODE_ENV = saved.nodeEnv;
    process.env.VITEST = saved.vitest;
    vi.restoreAllMocks();
  });

  /**
   * logEvent no-ops under config.isTest, which is exactly the condition a test
   * runs in. Lift it for the duration of the call so the real emitted line can
   * be read, rather than mocking the module and testing the mock.
   */
  function emit(name: string, fields: Record<string, unknown>): Record<string, unknown> {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
    try {
      logEvent(name, fields);
      expect(log).toHaveBeenCalledTimes(1);
      return JSON.parse(log.mock.calls[0]![0] as string) as Record<string, unknown>;
    } finally {
      process.env.NODE_ENV = saved.nodeEnv;
      process.env.VITEST = saved.vitest;
    }
  }

  it('redacts a nested secret in the line it actually writes', () => {
    const line = emit('stars_payment_completed', {
      coachId: 'coach-nia',
      provider: { name: 'telegram', apiKey: 'sk-live-do-not-log' },
    });
    expect(line.kind).toBe('event');
    expect(line.name).toBe('stars_payment_completed');
    expect(line.coachId).toBe('coach-nia');
    expect(line.provider).toEqual({ name: 'telegram', apiKey: REDACTED });
    expect(JSON.stringify(line)).not.toContain('sk-live-do-not-log');
  });

  it('emits a line rather than throwing when the payload is cyclic', () => {
    const cyclic: Record<string, unknown> = { reason: 'boom' };
    cyclic.self = cyclic;
    const line = emit('captcha_rejected', cyclic);
    expect(line.reason).toBe('boom');
    expect(line.self).toBe('[circular]');
  });

  it('emits a line rather than throwing on a BigInt payload', () => {
    const line = emit('stars_payment_underpaid', { received: 10n });
    expect(line.received).toBe('10n');
  });
});

describe('redactUrl still covers the query string', () => {
  it('redacts values, keeps keys, and leaves clean URLs untouched', () => {
    expect(redactUrl('/sign-in?reset=live-token')).toBe('/sign-in?reset=%5Bredacted%5D');
    expect(redactUrl('/api/v1/foods?search=oats')).toBe('/api/v1/foods?search=oats');
    expect(redactUrl('/api/v1/me')).toBe('/api/v1/me');
  });

  it('covers the keys added for the payload scrubber', () => {
    expect(redactUrl('/x?sessionid=s-1')).toContain('%5Bredacted%5D');
    expect(redactUrl('/x?cookie=sid')).toContain('%5Bredacted%5D');
  });
});
