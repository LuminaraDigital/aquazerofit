/**
 * REGRESSION GUARD — the "split store" dataDir bug.
 *
 * Original bug: config.dataDir used `process.env.AZF_DATA_DIR ?? default`,
 * so an AZF_DATA_DIR set to '' (or whitespace) survived the `??` and
 * path.resolve('') resolved to process.cwd() — silently splitting the JSON
 * store across two directories depending on where the process was launched.
 * Empty and whitespace-only values must fall through to apps/api/.data.
 *
 * NOTE: this file must NOT set a module-load AZF_DATA_DIR like the
 * integration suites do — it manipulates the variable per test and restores
 * the original value afterwards. config.dataDir is a getter, so each access
 * re-reads the environment (no stale module snapshot to worry about).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../platform/config';

// apps/api/.data, derived from this test file's location (src/__tests__ -> apps/api).
const here = path.dirname(fileURLToPath(import.meta.url));
const expectedDefault = path.resolve(here, '..', '..', '.data');

const ORIGINAL = process.env.AZF_DATA_DIR;

beforeEach(() => {
  delete process.env.AZF_DATA_DIR;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AZF_DATA_DIR;
  else process.env.AZF_DATA_DIR = ORIGINAL;
});

describe('config.dataDir (split-store regression guard)', () => {
  it('resolves to apps/api/.data when AZF_DATA_DIR is unset', () => {
    expect(config.dataDir).toBe(expectedDefault);
  });

  it("resolves to apps/api/.data when AZF_DATA_DIR is '' (the original bug: '' ?? default kept '')", () => {
    process.env.AZF_DATA_DIR = '';
    expect(config.dataDir).toBe(expectedDefault);
  });

  it("resolves to apps/api/.data when AZF_DATA_DIR is whitespace-only ('   ')", () => {
    process.env.AZF_DATA_DIR = '   ';
    expect(config.dataDir).toBe(expectedDefault);
  });

  it('still honours a real override (and trims surrounding whitespace)', () => {
    process.env.AZF_DATA_DIR = '  /tmp/azf-custom-data  ';
    expect(config.dataDir).toBe(path.resolve('/tmp/azf-custom-data'));
  });
});
