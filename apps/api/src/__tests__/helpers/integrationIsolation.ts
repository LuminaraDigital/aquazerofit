/**
 * Hermetic integration-test setup shared by HTTP suites that pin AZF_DATA_DIR.
 *
 * Vitest collects every test file in a worker before any of them execute, and
 * each file sets process.env.AZF_DATA_DIR at module load. The last file loaded
 * wins for the whole worker unless a suite re-binds before its hooks run.
 * bindIsolatedDataDir() resets the store singleton and points it at this
 * file's temp directory again.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getStore, resetStoreSingletonForTests } from '../../platform/store';

export const PROVIDER_ENV_KEYS = [
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'NVIDIA_API_KEY',
  'OLLAMA_API_KEY',
] as const;

export function createIsolatedDataDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Pin AZF_DATA_DIR and ensure getStore() is bound to that directory. */
export function bindIsolatedDataDir(dataDir: string): void {
  process.env.AZF_DATA_DIR = dataDir;
  getStore();
}

/** Re-pin AZF_DATA_DIR before each test; rebinds from disk if another suite stole the singleton. */
export function pinIsolatedDataDir(dataDir: string): void {
  process.env.AZF_DATA_DIR = dataDir;
  getStore();
}

export function saveProviderEnv(): Map<string, string | undefined> {
  const saved = new Map<string, string | undefined>();
  for (const key of PROVIDER_ENV_KEYS) {
    saved.set(key, process.env[key]);
  }
  return saved;
}

export function clearProviderEnv(): void {
  for (const key of PROVIDER_ENV_KEYS) {
    delete process.env[key];
  }
}

export function restoreProviderEnv(saved: Map<string, string | undefined>): void {
  for (const key of PROVIDER_ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export async function teardownIsolatedDataDir(
  dataDir: string,
  savedAzfDataDir: string | undefined,
  savedProviderEnv?: Map<string, string | undefined>,
): Promise<void> {
  await getStore().flush();
  resetStoreSingletonForTests();
  if (savedAzfDataDir === undefined) delete process.env.AZF_DATA_DIR;
  else process.env.AZF_DATA_DIR = savedAzfDataDir;
  if (savedProviderEnv) restoreProviderEnv(savedProviderEnv);
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
}
