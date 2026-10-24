import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('zod jitless', () => {
  it('disables Zod JIT in the browser before any schema is built', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../../packages/shared/src/schemas.ts', import.meta.url)),
      'utf8',
    );
    const jitless = src.indexOf('jitless: true');
    const firstSchema = src.indexOf('export const localDateSchema');
    expect(jitless).toBeGreaterThan(0);
    expect(firstSchema).toBeGreaterThan(jitless);
    expect(src).toContain("typeof window !== 'undefined'");
  });
});