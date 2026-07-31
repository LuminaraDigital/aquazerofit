/**
 * AI gateway resilience: error classification, retry/backoff, the shared
 * deadline, the per-provider circuit breaker, the max_tokens ceiling, and the
 * `degraded` flag that tells a caller whether it is holding a genuine model
 * answer or offline template text.
 *
 * Providers are stubbed at the fetch seam so the chain's decisions are visible
 * as concrete request counts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { complete, resetProviderCircuits, type GatewayMessage } from '../modules/ai/gateway';

const PROVIDER_ENV = [
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'NVIDIA_API_KEY',
  'NVIDIA_BASE_URL',
  'OLLAMA_API_KEY',
  'OLLAMA_BASE_URL',
];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of PROVIDER_ENV) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  resetProviderCircuits();
});

afterEach(() => {
  for (const key of PROVIDER_ENV) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

const MESSAGES: GatewayMessage[] = [
  { role: 'system', content: 'You are Aqua Coach.' },
  { role: 'user', content: 'How am I doing today?' },
];

interface StubCall {
  url: string;
  body: Record<string, unknown>;
}

/** Minimal Response-alike; only the fields the gateway reads. */
function response(status: number, payload: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => payload,
  };
}

function okBody(text = 'Real model answer.') {
  return { choices: [{ message: { content: text } }], usage: { total_tokens: 42 } };
}

/**
 * Stub fetch with a per-call scripted outcome. `handler` receives the 1-based
 * attempt index for the provider host being addressed.
 */
function stubFetch(handler: (call: StubCall, index: number) => unknown): { calls: StubCall[] } {
  const calls: StubCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string; signal?: AbortSignal }) => {
      const call = { url: String(url), body: JSON.parse(init.body) as Record<string, unknown> };
      calls.push(call);
      return handler(call, calls.length);
    }),
  );
  return { calls };
}

const groqCalls = (calls: StubCall[]): StubCall[] => calls.filter((c) => c.url.includes('groq.com'));

describe('error classification (retryable vs terminal)', () => {
  it('retries a 500 up to the retry ceiling (3 attempts total)', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com') ? response(500, {}) : Promise.reject(new Error('offline')),
    );

    const result = await complete('chatFast', MESSAGES, {});

    expect(groqCalls(calls)).toHaveLength(3);
    expect(result.meta.provider).toBe('mock');
  });

  it('retries a 429 rate limit', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com')
        ? response(429, {}, { 'retry-after': '0' })
        : Promise.reject(new Error('offline')),
    );

    await complete('chatFast', MESSAGES, {});

    expect(groqCalls(calls)).toHaveLength(3);
  });

  it('does NOT retry a 400 — the same bad request fails identically every time', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com') ? response(400, {}) : Promise.reject(new Error('offline')),
    );

    await complete('chatFast', MESSAGES, {});

    expect(groqCalls(calls)).toHaveLength(1);
  });

  it('does NOT retry a 401 bad key', async () => {
    process.env.GROQ_API_KEY = 'bad-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com') ? response(401, {}) : Promise.reject(new Error('offline')),
    );

    await complete('chatFast', MESSAGES, {});

    expect(groqCalls(calls)).toHaveLength(1);
  });

  it('skips the retry when Retry-After is longer than the remaining deadline', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com')
        ? response(429, {}, { 'retry-after': '300' })
        : Promise.reject(new Error('offline')),
    );

    await complete('chatFast', MESSAGES, {});

    expect(groqCalls(calls)).toHaveLength(1);
  });
});

describe('backoff retry', () => {
  it('succeeds on the second attempt and reports a real, non-degraded answer', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    let groqAttempts = 0;
    const { calls } = stubFetch((call) => {
      if (!call.url.includes('groq.com')) return Promise.reject(new Error('offline'));
      groqAttempts += 1;
      return groqAttempts === 1 ? response(503, {}) : response(200, okBody('Recovered answer.'));
    });

    const startedAt = Date.now();
    const result = await complete('chatFast', MESSAGES, {});
    const elapsed = Date.now() - startedAt;

    expect(groqCalls(calls)).toHaveLength(2);
    expect(result.meta.provider).toBe('groq');
    expect(result.text).toBe('Recovered answer.');
    expect(result.meta.degraded).toBe(false);
    expect(result.meta.degradedReason).toBeUndefined();
    // Jittered backoff floor is half the 200ms window — proves we waited.
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it('retries an unparseable JSON completion rather than abandoning the provider', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    let groqAttempts = 0;
    const { calls } = stubFetch((call) => {
      if (!call.url.includes('groq.com')) return Promise.reject(new Error('offline'));
      groqAttempts += 1;
      return response(200, okBody(groqAttempts === 1 ? 'not json at all' : '{"ok":true}'));
    });

    const result = await complete('planStructured', MESSAGES, { json: true });

    expect(groqCalls(calls)).toHaveLength(2);
    expect(result.json).toEqual({ ok: true });
    expect(result.meta.provider).toBe('groq');
  });
});

describe('overall deadline', () => {
  it('stops walking the chain once the shared deadline passes', async () => {
    // Three credentialed providers; each request hangs until aborted. Without a
    // shared deadline this would cost 3 x the per-provider timeout.
    process.env.GROQ_API_KEY = 'k1';
    process.env.OPENAI_API_KEY = 'k2';
    process.env.GEMINI_API_KEY = 'k3';
    const calls: StubCall[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string, init: { body: string; signal: AbortSignal }) =>
          // Never settles on its own — only the gateway's AbortController ends it.
          new Promise((_resolve, reject) => {
            calls.push({ url: String(url), body: JSON.parse(init.body) as Record<string, unknown> });
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );

    const startedAt = Date.now();
    const result = await complete('chatFast', MESSAGES, { deadlineMs: 200, timeoutMs: 20_000 });
    const elapsed = Date.now() - startedAt;

    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(true);
    expect(result.meta.degradedReason).toBe('deadline_exceeded');
    // One hung attempt consumed the whole budget; the rest of the chain was skipped.
    expect(calls).toHaveLength(1);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('caps the per-attempt timeout at the remaining deadline, not opts.timeoutMs', async () => {
    process.env.GROQ_API_KEY = 'k1';
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
      ),
    );

    await complete('chatFast', MESSAGES, { deadlineMs: 150, timeoutMs: 20_000 });

    expect(aborted).toBe(true);
  });
});

describe('circuit breaker', () => {
  it('opens after repeated failures and skips the provider on later calls', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    // 400 is terminal, so each call costs groq exactly one request.
    const { calls } = stubFetch((call) =>
      call.url.includes('groq.com') ? response(400, {}) : Promise.reject(new Error('offline')),
    );

    for (let i = 0; i < 3; i += 1) await complete('chatFast', MESSAGES, {});
    expect(groqCalls(calls)).toHaveLength(3);

    const afterOpen = await complete('chatFast', MESSAGES, {});

    // Breaker is open: groq is not contacted again.
    expect(groqCalls(calls)).toHaveLength(3);
    expect(afterOpen.meta.provider).toBe('mock');
    // A configured provider was bypassed — still a degraded answer, not the
    // designed offline path.
    expect(afterOpen.meta.degraded).toBe(true);
  });

  it('clears the failure count on a success so a blip cannot open the circuit', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    let groqAttempts = 0;
    const { calls } = stubFetch((call) => {
      if (!call.url.includes('groq.com')) return Promise.reject(new Error('offline'));
      groqAttempts += 1;
      // Fail, fail, then healthy forever.
      return groqAttempts <= 2 ? response(400, {}) : response(200, okBody());
    });

    await complete('chatFast', MESSAGES, {});
    await complete('chatFast', MESSAGES, {});
    const recovered = await complete('chatFast', MESSAGES, {});
    const next = await complete('chatFast', MESSAGES, {});

    expect(recovered.meta.provider).toBe('groq');
    expect(next.meta.provider).toBe('groq');
    expect(groqCalls(calls)).toHaveLength(4);
  });
});

describe('max_tokens ceiling', () => {
  it('clamps a caller-supplied maxTokens to the maximum', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch(() => response(200, okBody()));

    await complete('chatFast', MESSAGES, { maxTokens: 999_999 });

    expect(groqCalls(calls)[0]!.body.max_tokens).toBe(4096);
  });

  it('leaves a sane request untouched and defaults when unset', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    const { calls } = stubFetch(() => response(200, okBody()));

    await complete('chatFast', MESSAGES, { maxTokens: 256 });
    await complete('chatFast', MESSAGES, {});

    expect(groqCalls(calls)[0]!.body.max_tokens).toBe(256);
    expect(groqCalls(calls)[1]!.body.max_tokens).toBe(1024);
  });
});

describe('degraded flag', () => {
  it('is FALSE on the designed keyless path — the mock IS the product offline', async () => {
    // No provider keys at all. The key-optional local Ollama probe still runs
    // and fails; that is not a degradation, it is the offline configuration.
    stubFetch(() => Promise.reject(new Error('offline')));

    const result = await complete('chatFast', MESSAGES, {});

    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(false);
    expect(result.meta.degradedReason).toBeUndefined();
  });

  it('is TRUE when a configured provider was tried and every attempt failed', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    stubFetch(() => response(503, {}));

    const result = await complete('chatFast', MESSAGES, {});

    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(true);
    expect(result.meta.degradedReason).toBe('provider_failure');
  });

  it('is FALSE whenever a real provider answered', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    stubFetch(() => response(200, okBody()));

    const result = await complete('chatFast', MESSAGES, {});

    expect(result.meta.provider).toBe('groq');
    expect(result.meta.degraded).toBe(false);
  });

  it('keeps the offline engine deterministic on both degraded and keyless paths', async () => {
    const context = { nutrition: { kcalTarget: 1900, kcalConsumed: 1450, kcalRemaining: 450 } };

    stubFetch(() => Promise.reject(new Error('offline')));
    const keyless = await complete('chatFast', MESSAGES, { context });

    process.env.GROQ_API_KEY = 'test-key';
    const failed = await complete('chatFast', MESSAGES, { context });

    expect(failed.meta.degraded).toBe(true);
    expect(keyless.meta.degraded).toBe(false);
    // Same input, byte-identical mock output regardless of why we landed there.
    expect(failed.text).toBe(keyless.text);
  });
});
