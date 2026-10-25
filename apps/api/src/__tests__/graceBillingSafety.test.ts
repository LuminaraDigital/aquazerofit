/**
 * Grace is earned, never bought (AZF-P1 US-E1 AC2, §8.2).
 *
 * Static proof, not a behavioural one: follow every relative import from
 * every module under billing/ and payments/ and show that none of them can
 * reach the only file that writes the grace ledger. A future change that
 * wired a purchase to grace would have to break this test first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GRACE_BANK_MAX, graceBank, graceEarned, nextGraceInActiveDays } from '@aquazerofit/shared';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRACE_WRITER = path.join(srcDir, 'modules', 'fightCamp', 'grace.ts');

function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts'), base]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  return specifiers.map((s) => resolveImport(file, s)).filter((f): f is string => f !== null);
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...importsOf(file));
  }
  return seen;
}

function moneyModules(): string[] {
  return ['billing', 'payments'].flatMap((dir) => {
    const full = path.join(srcDir, 'modules', dir);
    return fs
      .readdirSync(full)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => path.join(full, f));
  });
}

describe('no billing path writes grace', () => {
  it('finds the money modules and the grace writer', () => {
    expect(moneyModules().length).toBeGreaterThan(5);
    expect(fs.existsSync(GRACE_WRITER)).toBe(true);
    // The walker itself works: the progress router does reach the writer.
    expect(reachable(path.join(srcDir, 'modules', 'progress', 'router.ts')).has(GRACE_WRITER)).toBe(true);
  });

  it.each(moneyModules().map((f) => [path.relative(srcDir, f), f]))(
    '%s cannot reach the grace ledger writer',
    (_name, file) => {
      expect(reachable(file).has(GRACE_WRITER)).toBe(false);
    },
  );

  it('keeps the ledger writer the only file that opens the grace ledger', () => {
    const callers = [...reachable(path.join(srcDir, 'app.ts'))].filter(
      (f) => !f.includes(`${path.sep}repo${path.sep}`) && /\.withGraceLedger\(/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(callers).toEqual([GRACE_WRITER]);
  });
});

describe('the grace arithmetic', () => {
  it('earns one day per seven active days', () => {
    expect([0, 6, 7, 13, 14, 48].map(graceEarned)).toEqual([0, 0, 1, 1, 2, 6]);
    expect([0, 1, 6, 7, 13].map(nextGraceInActiveDays)).toEqual([7, 6, 1, 7, 1]);
  });

  it('caps the bank at each earn, so surplus is never stored', () => {
    const earn = { entry: 'earned' as const };
    const spend = { entry: 'applied' as const };
    expect(graceBank([earn, earn, earn])).toBe(GRACE_BANK_MAX);
    // Under min(2, earned - applied) this would read 2 again.
    expect(graceBank([earn, earn, earn, earn, spend, spend])).toBe(0);
    expect(graceBank([earn, spend, earn])).toBe(1);
    expect(graceBank([spend])).toBe(0);
  });
});
