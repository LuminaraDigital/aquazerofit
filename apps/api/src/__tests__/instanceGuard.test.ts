/**
 * Single-instance boot guard (platform/config.assertSingleInstance).
 *
 * pgStore.ts has always documented that this store is not multi-instance safe:
 * every instance hydrates its own copy, never re-reads, and the last flush
 * silently overwrites the other's version of a document. Nothing stopped an
 * operator enabling autoscale anyway, and the failure is invisible — no error,
 * no failed probe, just missing entries in someone's food diary.
 *
 * assertSingleInstance() turns that from a comment into a refusal. These tests
 * pin the three properties that matter: it fires when more than one instance
 * is declared, it does NOT fire for the default or for a plain `1`, and it
 * refuses a value it cannot read rather than assuming the safe case.
 *
 * config.* are getters, so each access re-reads process.env. The guard
 * short-circuits under test, so every case that must throw clears the test
 * markers for the duration and restores them afterwards.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { INSTANCE_COUNT_ENV, assertSingleInstance, config } from '../platform/config';

const KEYS = [INSTANCE_COUNT_ENV, 'NODE_ENV', 'VITEST'] as const;
const ORIGINAL = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])) as Record<
  string,
  string | undefined
>;

afterEach(() => {
  for (const k of KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

/** Run `fn` with the test markers cleared, so the guard actually evaluates. */
function asServingProcess<T>(fn: () => T): T {
  process.env.NODE_ENV = 'development';
  delete process.env.VITEST;
  try {
    return fn();
  } finally {
    for (const k of KEYS) {
      if (ORIGINAL[k] === undefined) delete process.env[k];
      else process.env[k] = ORIGINAL[k];
    }
  }
}

describe('config.instanceCount', () => {
  it('defaults to 1 when the variable is unset, empty or whitespace', () => {
    delete process.env[INSTANCE_COUNT_ENV];
    expect(config.instanceCount).toBe(1);
    process.env[INSTANCE_COUNT_ENV] = '';
    expect(config.instanceCount).toBe(1);
    process.env[INSTANCE_COUNT_ENV] = '   ';
    expect(config.instanceCount).toBe(1);
  });

  it('reads a positive integer, tolerating surrounding whitespace', () => {
    process.env[INSTANCE_COUNT_ENV] = ' 4 ';
    expect(config.instanceCount).toBe(4);
  });

  it('is NaN for anything that is not a positive integer', () => {
    for (const raw of ['0', '-1', '2.5', 'auto', 'two', 'true']) {
      process.env[INSTANCE_COUNT_ENV] = raw;
      expect(config.instanceCount).toBeNaN();
    }
  });
});

describe('assertSingleInstance', () => {
  it('permits the default (unset) — normal local dev must never see this', () => {
    asServingProcess(() => {
      delete process.env[INSTANCE_COUNT_ENV];
      expect(() => assertSingleInstance()).not.toThrow();
    });
  });

  it('permits an explicit 1 (docker-compose.yml sets exactly this)', () => {
    asServingProcess(() => {
      process.env[INSTANCE_COUNT_ENV] = '1';
      expect(() => assertSingleInstance()).not.toThrow();
    });
  });

  it('refuses to boot when more than one instance is declared', () => {
    asServingProcess(() => {
      process.env[INSTANCE_COUNT_ENV] = '2';
      expect(() => assertSingleInstance()).toThrow(/Refusing to start/);
    });
  });

  it('names the variable, the data-loss risk and the async getStore() unlock', () => {
    // The message is the whole product here: an operator reading a crash log
    // must learn why one instance is a hard requirement and what would lift
    // it, not merely that a variable was rejected.
    const message = asServingProcess(() => {
      process.env[INSTANCE_COUNT_ENV] = '3';
      try {
        assertSingleInstance();
        return '';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });
    expect(message).toContain(INSTANCE_COUNT_ENV);
    expect(message).toContain('in-memory');
    expect(message).toContain('overwrites');
    expect(message).toContain('getStore()');
    expect(message).toMatch(/autoscale/i);
  });

  it('refuses a value it cannot read rather than assuming 1', () => {
    for (const raw of ['0', 'auto', '2.5', '-1']) {
      const thrown = asServingProcess(() => {
        process.env[INSTANCE_COUNT_ENV] = raw;
        try {
          assertSingleInstance();
          return '';
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      });
      expect(thrown).toContain('not a positive integer');
      expect(thrown).toContain(JSON.stringify(raw));
    }
  });

  it('is inert under test, so the suite is never taken down by it', () => {
    // VITEST is still set here (asServingProcess is not used), which is what
    // config.isTest reads.
    process.env[INSTANCE_COUNT_ENV] = '99';
    expect(config.isTest).toBe(true);
    expect(() => assertSingleInstance()).not.toThrow();
  });
});
