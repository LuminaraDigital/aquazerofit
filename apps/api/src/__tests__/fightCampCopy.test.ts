/**
 * Banned-copy scan over every user-facing string the Fight Camp API can send
 * (AZF-P1 §6.1, US-A1 AC5). Comments are stripped first: they explain what
 * the copy avoids, and may name it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BANNED_COPY } from '@aquazerofit/shared';

const moduleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'modules', 'fightCamp');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(^|[^:'"`\\])\/\/.*$/gm;
const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/** String and template literals, after removing comments. */
function stringLiterals(source: string): string[] {
  const code = source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '$1');
  return [...code.matchAll(LITERAL)].map((m) => m[1] ?? m[2] ?? m[3] ?? '').filter((s) => !MACHINE_TOKEN.test(s));
}

/** Enum values, codes and event names ('failed', 'gift_paid'): protocol, not copy. */
const MACHINE_TOKEN = /^[a-z][a-z0-9_]*$/;

describe('Fight Camp API copy', () => {
  const files = sourceFiles(moduleDir);

  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(3);
    expect(stringLiterals(`const a = 'X'; // 'streak'\nconst b = "Y";`)).toEqual(['X', 'Y']);
    expect(stringLiterals(`status === 'failed' ? 'It failed.' : 'Fine'`)).toEqual(['It failed.', 'Fine']);
  });

  it.each(files.map((f) => [path.relative(moduleDir, f), f]))('%s uses no banned words', (_name, file) => {
    const hits = stringLiterals(fs.readFileSync(file, 'utf8')).filter((s) => BANNED_COPY.test(s));
    expect(hits).toEqual([]);
  });
});
