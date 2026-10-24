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
import {
  complete,
  offlineVerdict,
  resetProviderCircuits,
  stream,
  warnIfNoAiProviderConfigured,
  type GatewayMessage,
} from '../modules/ai/gateway';
import { config } from '../platform/config';

/** Production as the gateway sees it, without the boot guards NODE_ENV would arm. */
const asProduction = () => vi.spyOn(config, 'isProduction', 'get').mockReturnValue(true);

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
    // chatFast lane now has a per-ModelGroup default of 512 (MODEL_GROUP_MAX_TOKENS.chatFast)
    expect(groqCalls(calls)[1]!.body.max_tokens).toBe(512);
  });
});

describe('degraded flag', () => {
  it('is FALSE on the designed keyless path outside production — the mock IS the product offline', async () => {
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

/*
 * Production with no provider configured at all. The offline engine still
 * answers, because no AI outage may take a core journey down, but the paid
 * lanes bill whatever is not flagged degraded. Before this, a production
 * deployment with no keys sold template text as AI output at full price.
 * Development, the test suite and the eval runner keep the keyless path
 * undegraded: there the offline engine is the intended product.
 */
describe('offlineVerdict', () => {
  const none = { realProviderInPlay: false, budgetStopped: false, deadlineExceeded: false };

  it('is undegraded on the keyless path outside production', () => {
    expect(offlineVerdict({ ...none, isProduction: false })).toEqual({ degraded: false });
  });

  it('is no_provider on the keyless path in production', () => {
    expect(offlineVerdict({ ...none, isProduction: true })).toEqual({ degraded: true, degradedReason: 'no_provider' });
  });

  it('names the real cause whenever a configured provider was in play', () => {
    for (const isProduction of [false, true]) {
      expect(offlineVerdict({ ...none, realProviderInPlay: true, isProduction }).degradedReason).toBe('provider_failure');
      expect(
        offlineVerdict({ ...none, realProviderInPlay: true, deadlineExceeded: true, isProduction }).degradedReason,
      ).toBe('deadline_exceeded');
    }
  });

  it('puts the budget first, because no provider was asked at all', () => {
    expect(
      offlineVerdict({ realProviderInPlay: true, budgetStopped: true, deadlineExceeded: true, isProduction: true }),
    ).toEqual({ degraded: true, degradedReason: 'budget_exhausted' });
  });
});

describe('degraded flag in production with no provider configured', () => {
  beforeEach(() => {
    asProduction();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks the offline answer degraded with reason no_provider', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));

    const result = await complete('chatFast', MESSAGES, {});

    expect(result.meta.provider).toBe('mock');
    expect(result.meta.degraded).toBe(true);
    expect(result.meta.degradedReason).toBe('no_provider');
  });

  it('marks the streaming lane the same way, since chat bills through it', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));

    const iterator = stream('chatFast', MESSAGES, {});
    let step = await iterator.next();
    while (!step.done) step = await iterator.next();

    expect(step.value.meta.provider).toBe('mock');
    expect(step.value.meta.degraded).toBe(true);
    expect(step.value.meta.degradedReason).toBe('no_provider');
  });

  it('serves text byte-identical to the keyless development path', async () => {
    const context = { nutrition: { kcalTarget: 1900, kcalConsumed: 1450, kcalRemaining: 450 } };
    stubFetch(() => Promise.reject(new Error('offline')));

    const production = await complete('chatFast', MESSAGES, { context });
    vi.restoreAllMocks();
    const development = await complete('chatFast', MESSAGES, { context });

    expect(development.meta.degraded).toBe(false);
    expect(development.meta.degradedReason).toBeUndefined();
    expect(production.text).toBe(development.text);
  });

  it('still reports the real cause when a configured provider failed', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    stubFetch(() => response(503, {}));

    const result = await complete('chatFast', MESSAGES, {});

    expect(result.meta.degradedReason).toBe('provider_failure');
  });

  /*
   * A self-hosted Ollama named by OLLAMA_BASE_URL is a configured dependency
   * even with no key: when it fails, the cause is a provider failure, and the
   * retry budget applies to it like any other configured provider.
   */
  it('treats a keyless Ollama with a configured base URL as a real provider', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama.internal:11434/v1';
    const { calls } = stubFetch(() => response(503, {}));

    const result = await complete('chatFast', MESSAGES, {});

    expect(result.meta.degradedReason).toBe('provider_failure');
    expect(calls.filter((c) => c.url.startsWith('http://ollama.internal'))).toHaveLength(3);
  });
});

/*
 * The meal-photo lane holds half its deadline back for the next configured
 * vision provider. A self-hosted Ollama counts as configured there too, or a
 * hung Groq would spend the whole photo budget and Ollama would never be
 * asked.
 */
describe('vision hop reserve', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a hop back for a self-hosted Ollama named by its base URL', async () => {
    vi.useFakeTimers();
    process.env.GROQ_API_KEY = 'groq-key';
    process.env.OLLAMA_BASE_URL = 'http://ollama.internal:11434/v1';
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: { signal: AbortSignal }) =>
        String(url).includes('groq.com')
          ? new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
          : Promise.resolve(response(200, okBody('{"items":[]}'))),
      ),
    );
    const image = `data:image/jpeg;base64,${Buffer.from('fake-jpeg-bytes').toString('base64')}`;

    const pending = complete('visionPrimary', MESSAGES, { json: true, images: [image], timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await pending;

    expect(result.meta.provider).toBe('ollama');
    expect(result.meta.degraded).toBe(false);
  });
});

describe('boot warning for a production deployment with no AI provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits one structured line naming the condition', () => {
    asProduction();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnIfNoAiProviderConfigured();

    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(warn.mock.calls[0]![0])) as Record<string, unknown>;
    expect(line.kind).toBe('event');
    expect(line.name).toBe('ai_provider_unconfigured');
  });

  it('stays silent for a self-hosted Ollama named by its base URL', () => {
    asProduction();
    process.env.OLLAMA_BASE_URL = 'http://ollama.internal:11434/v1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnIfNoAiProviderConfigured();

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent when any provider key is configured', () => {
    asProduction();
    process.env.GEMINI_API_KEY = 'test-key';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnIfNoAiProviderConfigured();

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent outside production, where keyless is the designed setup', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnIfNoAiProviderConfigured();

    expect(warn).not.toHaveBeenCalled();
  });
});
