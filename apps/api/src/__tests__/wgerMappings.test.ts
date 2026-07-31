/**
 * wger mapping-table contract tests (wger-integration-plan.md Phase 1.3).
 * Every wger reference id must map to a valid AQF value — no undefined may
 * ever reach the exercise pool (risk #1: lossy taxonomy mapping).
 */
import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from '@aquazerofit/shared';
import {
  AQF_EQUIPMENT_VALUES,
  deriveDifficulty,
  sanitizeWgerDescription,
  WGER_CATEGORY_MAP,
  WGER_EQUIPMENT_MAP,
  WGER_MUSCLE_MAP,
} from '../data/wger/mappings';

const WGER_MUSCLE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const WGER_CATEGORY_IDS = [8, 9, 10, 11, 12, 13, 14, 15];
const WGER_EQUIPMENT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const VALID_CATEGORIES = ['strength', 'cardio', 'mobility', 'core'];
const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

describe('WGER_MUSCLE_MAP', () => {
  it.each(WGER_MUSCLE_IDS)('maps wger muscle id %i to a non-empty AQF string', (id) => {
    const mapped = WGER_MUSCLE_MAP[id];
    expect(mapped).toBeDefined();
    expect(typeof mapped).toBe('string');
    expect(mapped!.length).toBeGreaterThan(0);
  });

  it('covers all 15 wger muscles exactly', () => {
    expect(Object.keys(WGER_MUSCLE_MAP).map(Number).sort((a, b) => a - b)).toEqual(WGER_MUSCLE_IDS);
  });
});

describe('WGER_CATEGORY_MAP', () => {
  it.each(WGER_CATEGORY_IDS)('maps wger category id %i to a valid AQF category', (id) => {
    const mapped = WGER_CATEGORY_MAP[id];
    expect(mapped).toBeDefined();
    expect(VALID_CATEGORIES).toContain(mapped);
  });

  it('covers all 8 wger categories exactly', () => {
    expect(Object.keys(WGER_CATEGORY_MAP)).toHaveLength(8);
  });
});

describe('WGER_EQUIPMENT_MAP', () => {
  it.each(WGER_EQUIPMENT_IDS)('maps wger equipment id %i to a valid AQF EQUIPMENT value', (id) => {
    const mapped = WGER_EQUIPMENT_MAP[id];
    expect(mapped).toBeDefined();
    expect(EQUIPMENT).toContain(mapped);
  });

  it('covers all 12 wger equipment records exactly', () => {
    expect(Object.keys(WGER_EQUIPMENT_MAP)).toHaveLength(12);
  });

  it('AQF equipment enum exposes the extended values the maps rely on', () => {
    for (const value of ['barbell', 'ezBar', 'cableMachine', 'smithMachine', 'swissBall', 'inclineBench']) {
      expect(AQF_EQUIPMENT_VALUES).toContain(value);
    }
  });
});

describe('deriveDifficulty', () => {
  const base = { category: 'strength' as const, equipment: [], primaryMuscles: [], secondaryMuscles: [] };

  it('never returns undefined across an input matrix', () => {
    const categories = ['strength', 'cardio', 'mobility', 'core'] as const;
    const equipmentSets = [
      [],
      ['none'],
      ['yogaMat'],
      ['barbell'],
      ['smithMachine'],
      ['dumbbells'],
      ['barbell', 'bench'],
      ['cableMachine'],
    ] as const;
    const muscleSets: [string[], string[]][] = [
      [[], []],
      [['chest'], []],
      [['chest'], ['triceps']],
      [['quadriceps'], ['glutes', 'hamstrings']],
      [['back'], ['biceps', 'core', 'shoulders']],
    ];
    for (const category of categories) {
      for (const equipment of equipmentSets) {
        for (const [primaryMuscles, secondaryMuscles] of muscleSets) {
          const result = deriveDifficulty({
            category,
            equipment: [...equipment] as never,
            primaryMuscles,
            secondaryMuscles,
          });
          expect(VALID_DIFFICULTIES).toContain(result);
        }
      }
    }
  });

  it('rates barbell compounds as advanced (never leaks to beginners)', () => {
    expect(
      deriveDifficulty({
        ...base,
        equipment: ['barbell'],
        primaryMuscles: ['quadriceps'],
        secondaryMuscles: ['glutes', 'hamstrings'],
      }),
    ).toBe('advanced');
  });

  it('rates smith-machine work as at least intermediate', () => {
    expect(
      deriveDifficulty({ ...base, equipment: ['smithMachine'], primaryMuscles: ['chest'], secondaryMuscles: [] }),
    ).toBe('intermediate');
  });

  it('is beginner-biased for bodyweight and mat work', () => {
    expect(
      deriveDifficulty({ ...base, equipment: ['none'], primaryMuscles: ['chest'], secondaryMuscles: [] }),
    ).toBe('beginner');
    expect(
      deriveDifficulty({ ...base, equipment: ['yogaMat'], primaryMuscles: ['core'], secondaryMuscles: [] }),
    ).toBe('beginner');
  });

  it('defaults cardio and mobility to beginner', () => {
    expect(deriveDifficulty({ ...base, category: 'cardio', equipment: ['none'] })).toBe('beginner');
    expect(deriveDifficulty({ ...base, category: 'mobility', equipment: [] })).toBe('beginner');
  });
});

describe('sanitizeWgerDescription', () => {
  it('strips script blocks entirely, including their contents', () => {
    const out = sanitizeWgerDescription('<p>Hello</p><script>alert("xss")</script><b>world</b>');
    expect(out).toBe('Hello world');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
  });

  it('strips all HTML tags but keeps text content', () => {
    expect(sanitizeWgerDescription('<div class="x"><em>Keep</em> this <a href="http://evil">text</a></div>')).toBe(
      'Keep this text',
    );
  });

  it('decodes named and numeric entities', () => {
    expect(sanitizeWgerDescription('Tom &amp; Jerry &lt;3 &#65;&#x42; &quot;q&quot; &nbsp;end')).toBe(
      'Tom & Jerry <3 AB "q" end',
    );
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizeWgerDescription('<p>  lots\n   of</p>\n<p>space </p>')).toBe('lots of space');
  });

  it('handles empty and tag-free input', () => {
    expect(sanitizeWgerDescription('')).toBe('');
    expect(sanitizeWgerDescription('plain text')).toBe('plain text');
  });

  it('neutralizes uppercase SCRIPT and style blocks', () => {
    const out = sanitizeWgerDescription('<SCRIPT>evil()</SCRIPT><style>body{display:none}</style>ok');
    expect(out).toBe('ok');
  });
});
