/**
 * Defensive API envelope unwrap helpers.
 * Named envelopes ({ profile }, { items }, …) are the contract; callers also
 * tolerate bare arrays/objects so older caches and alternate shapes stay safe.
 */
import { ApiError } from './api';

/** Treat 404 as "absent" rather than an error (profile / plan / session). */
export async function orNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Single resources come back in a named envelope ({ profile }, { targets },
 * { consents }, …). Accept both wrapped and bare shapes so hooks stay stable
 * if the envelope ever changes.
 */
export function unwrap<T>(data: unknown, key: string): T | null {
  if (!data || typeof data !== 'object') return (data as T) ?? null;
  const record = data as Record<string, unknown>;
  if (key in record) return (record[key] as T) ?? null;
  return data as T;
}

/** Accept bare arrays and common list envelopes ({ items }, { logs }, …). */
export function asList<T>(data: unknown, keys: readonly string[] = ['items', 'logs']): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}
