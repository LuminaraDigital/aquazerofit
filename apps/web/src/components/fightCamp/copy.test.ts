/**
 * Banned-copy scan over the web strings of every Phase 1 surface (AZF-P1
 * §6.1: "A test scans apps/web/src strings for Phase 1 components"). Reads
 * string literals and JSX text after stripping comments, which explain what
 * the copy avoids and may name it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BANNED_COPY } from '@aquazerofit/shared';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The Phase 1 surfaces: whole files that are Fight Camp, and the R1a files it extends. */
const PHASE_ONE = [
  ...fs
    .readdirSync(path.join(src, 'components', 'fightCamp'))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== 'testUtils.tsx')
    .map((f) => `components/fightCamp/${f}`),
  'pages/squad/Squad.tsx',
  'pages/squad/SquadJoin.tsx',
  'pages/share/ShareLanding.tsx',
  'pages/fightRecord/Recap.tsx',
  'pages/fightRecord/FightRecord.tsx',
  'components/fightRecord/SeasonCard.tsx',
  'components/progress/ConsistencyCard.tsx',
  'pages/settings/NotificationSettings.tsx',
  'lib/fightCamp.ts',
  'lib/effortCard.ts',
  'lib/startApp.ts',
];

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const JSX_COMMENT = /\{\s*\/\*[\s\S]*?\*\/\s*\}/g;
const LINE_COMMENT = /(^|[^:'"`\\])\/\/.*$/gm;
const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
const JSX_TEXT = />([^<>{}]*[A-Za-z][^<>{}]*)</g;
/** Enum values, codes and event names ('failed', 'gift_paid'): protocol, not copy. */
const MACHINE_TOKEN = /^[a-z][a-z0-9_]*$/;

function copyStrings(source: string): string[] {
  const code = source.replace(JSX_COMMENT, '').replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '$1');
  return [
    ...[...code.matchAll(LITERAL)].map((m) => m[1] ?? m[2] ?? m[3] ?? ''),
    ...[...code.matchAll(JSX_TEXT)].map((m) => m[1]!.trim()),
  ].filter((s) => s && !MACHINE_TOKEN.test(s));
}

describe('Fight Camp web copy', () => {
  it('reads literals and JSX text, not comments', () => {
    expect(copyStrings(`const a = 'X'; // 'streak'\n<p>Showed up</p>{/* lost */}`)).toEqual(['X', 'Showed up']);
    expect(copyStrings(`if (status === 'failed') say('You failed.')`)).toEqual(['You failed.']);
  });

  it.each(PHASE_ONE)('%s uses no banned words', (file) => {
    const full = path.join(src, file);
    expect(fs.existsSync(full)).toBe(true);
    const hits = copyStrings(fs.readFileSync(full, 'utf8')).filter((s) => BANNED_COPY.test(s));
    expect(hits).toEqual([]);
  });
});
