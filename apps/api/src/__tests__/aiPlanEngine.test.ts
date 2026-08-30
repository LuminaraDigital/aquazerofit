/**
 * planEngine contract + validator tests (wger integration Phase 3).
 * The deterministic validation gate is the safety net for every AI plan
 * draft: any violation must produce null so callers fall back to the
 * deterministic engine (AQF-10 principle 5, AQF-11 §2).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Exercise, WellnessProfile } from '@aquazerofit/shared';
import {
  extractJsonTolerant,
  suggestExerciseSwap,
  tryGenerateAiPlan,
  validatePlanDraft,
  type AiPlanRequest,
} from '../modules/ai/planEngine';

const PROFILE: WellnessProfile = {
  userId: 'u-test',
  weightKg: 70,
  heightCm: 175,
  age: 28,
  sex: 'unspecified',
  goal: 'maintain',
  activityLevel: 'moderate',
  exerciseExperience: 'beginner',
  dietaryPreferences: [],
  allergies: [],
  equipment: ['none'],
  unitPreference: 'metric',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function exercise(partial: Partial<Exercise> & { id: string }): Exercise {
  return {
    type: 'exercise',
    name: partial.id,
    description: 'test exercise',
    category: 'strength',
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    equipment: ['none'],
    difficulty: 'beginner',
    media: [],
    licence: 'CC-BY-SA 4.0',
    licenceAuthor: 'wger community contributors',
    sourceId: `wger:${partial.id}`,
    ...partial,
  };
}

const POOL: Exercise[] = [
  exercise({ id: 'ex_pushup', primaryMuscles: ['chest'] }),
  exercise({ id: 'ex_squat', primaryMuscles: ['quadriceps'] }),
  exercise({ id: 'ex_plank', category: 'core', primaryMuscles: ['core'] }),
  exercise({ id: 'ex_jack', category: 'cardio', primaryMuscles: ['quadriceps'] }),
];

function validDraft(): Record<string, unknown> {
  return {
    name: '3-Day Test Plan',
    days: [
      {
        order: 1,
        focus: 'Full Body',
        isRest: false,
        slots: [
          { order: 1, entries: [{ id: 'se-1-1', exerciseId: 'ex_pushup', sets: 3, reps: 10, restSeconds: 60 }] },
          { order: 2, entries: [{ id: 'se-1-2', exerciseId: 'ex_squat', sets: 3, reps: 10, restSeconds: 60 }] },
        ],
      },
      {
        order: 2,
        focus: 'Core',
        isRest: false,
        slots: [{ order: 1, entries: [{ id: 'se-2-1', exerciseId: 'ex_plank', sets: 3, reps: 12, restSeconds: 45 }] }],
      },
      {
        order: 3,
        focus: 'Cardio',
        isRest: false,
        slots: [{ order: 1, entries: [{ id: 'se-3-1', exerciseId: 'ex_jack', sets: 3, reps: 30, restSeconds: 45 }] }],
      },
      /*
       * Orders 4–7 are rest. A draft is a whole calendar week with
       * `daysPerWeek` training days inside it — not a list of sessions. This
       * fixture had only the three training days, which is what the validator
       * used to demand and what `plans/service.aiDraftIsValid` has always
       * refused, so the two gates disagreed and the lane could never land a
       * plan. Padding the week here is the test-side half of that fix.
       */
      { order: 4, focus: 'Rest', isRest: true, slots: [] },
      { order: 5, focus: 'Rest', isRest: true, slots: [] },
      { order: 6, focus: 'Rest', isRest: true, slots: [] },
      { order: 7, focus: 'Rest', isRest: true, slots: [] },
    ],
    progressionRules: [
      { slotEntryId: 'se-1-1', kind: 'reps', iteration: 2, value: 12, op: 'replace', requires: ['reps'] },
    ],
    rationale: 'Conservative bodyweight week with recovery between sessions.',
  };
}

const REQ: AiPlanRequest = { profile: PROFILE, pool: POOL, daysPerWeek: 3 };

const savedEnv: [string, string | undefined][] = [];
beforeAll(() => {
  for (const key of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY', 'OLLAMA_API_KEY', 'OLLAMA_BASE_URL', 'NVIDIA_BASE_URL']) {
    savedEnv.push([key, process.env[key]]);
    delete process.env[key];
  }
});
afterAll(() => {
  for (const [key, value] of savedEnv) {
    if (value !== undefined) process.env[key] = value;
  }
});

describe('extractJsonTolerant', () => {
  it('parses plain JSON', () => {
    expect(extractJsonTolerant('{"a":1}')).toEqual({ a: 1 });
  });
  it('parses fenced JSON', () => {
    expect(extractJsonTolerant('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('tolerates prose wrapping', () => {
    expect(extractJsonTolerant('Here you go!\n{"a":1}\nHope it helps.')).toEqual({ a: 1 });
  });
  it('returns undefined for garbage', () => {
    expect(extractJsonTolerant('no json here')).toBeUndefined();
  });
});

describe('validatePlanDraft', () => {
  it('accepts a valid draft', () => {
    const result = validatePlanDraft(validDraft(), REQ);
    expect('draft' in result).toBe(true);
    const { draft } = result as { draft: { days: { isRest: boolean }[] } };
    expect(draft.days).toHaveLength(7);
    expect(draft.days.filter((d) => !d.isRest)).toHaveLength(REQ.daysPerWeek);
  });

  it('rejects an unknown exercise id', () => {
    const draft = validDraft();
    (draft.days as any)[0].slots[0].entries[0].exerciseId = 'ex_ghost';
    expect('error' in validatePlanDraft(draft, REQ)).toBe(true);
  });

  it('rejects a training-day count that does not match daysPerWeek', () => {
    // The fixture is a seven-day week with three training days.
    expect('error' in validatePlanDraft(validDraft(), { ...REQ, daysPerWeek: 4 })).toBe(true);
  });

  it('rejects a draft that is a list of sessions rather than a full week', () => {
    const draft = validDraft();
    // Drop the rest days: three days, three of them training. This is exactly
    // the shape P-05 1.1.0 asked for and the shape the downstream gate has
    // always rejected — it must now fail here, at the gate that can say why.
    draft.days = (draft.days as { isRest: boolean }[]).filter((d) => !d.isRest);
    const result = validatePlanDraft(draft, REQ);
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/calendar week/);
  });

  it('rejects seven unique day orders that are not 1–7', () => {
    const draft = validDraft();
    // Seven distinct orders, one out of range. A bare uniqueness check passes
    // this and the downstream gate then rejects it — the same wasted-tokens
    // shape as the day-count split.
    (draft.days as { order: number }[])[6]!.order = 99;
    expect('error' in validatePlanDraft(draft, REQ)).toBe(true);
  });

  it('rejects an absurd load for a beginner (cap = 2x bodyweight = 140 kg)', () => {
    const draft = validDraft();
    (draft.days as any)[0].slots[1].entries[0].weightKg = 1000;
    const result = validatePlanDraft(draft, REQ);
    expect('error' in result && result.error).toContain('exceeds the conservative cap');
  });

  it('rejects rir above the shared cap (9.5)', () => {
    const draft = validDraft();
    (draft.days as any)[0].slots[0].entries[0].rir = 10;
    expect('error' in validatePlanDraft(draft, REQ)).toBe(true);
  });

  it('rejects a progression rule referencing an invalid slotEntryId', () => {
    const draft = validDraft();
    (draft.progressionRules as any)[0].slotEntryId = 'se-9-9';
    expect('error' in validatePlanDraft(draft, REQ)).toBe(true);
  });

  it('rejects a missing rationale', () => {
    const draft = validDraft();
    draft.rationale = '';
    expect('error' in validatePlanDraft(draft, REQ)).toBe(true);
  });

  it('rejects exercises above the user experience (defense-in-depth)', () => {
    const advancedPool = [exercise({ id: 'ex_muscleup', difficulty: 'advanced' })];
    const draft = validDraft();
    (draft.days as any)[0].slots[0].entries[0].exerciseId = 'ex_muscleup';
    expect('error' in validatePlanDraft(draft, { ...REQ, pool: [...POOL, ...advancedPool] })).toBe(true);
  });

  it('rejects equipment the user does not own (defense-in-depth)', () => {
    const barbellPool = [exercise({ id: 'ex_bench', equipment: ['barbell', 'bench'] })];
    const draft = validDraft();
    (draft.days as any)[0].slots[0].entries[0].exerciseId = 'ex_bench';
    expect('error' in validatePlanDraft(draft, { ...REQ, pool: [...POOL, ...barbellPool] })).toBe(true);
  });

  it('rejects an empty pool', () => {
    expect('error' in validatePlanDraft(validDraft(), { ...REQ, pool: [] })).toBe(true);
  });

  it('rejects out-of-range daysPerWeek', () => {
    expect('error' in validatePlanDraft(validDraft(), { ...REQ, daysPerWeek: 0 })).toBe(true);
    expect('error' in validatePlanDraft(validDraft(), { ...REQ, daysPerWeek: 8 })).toBe(true);
  });
});

describe('tryGenerateAiPlan (mock provider, zero keys)', () => {
  it('produces a deterministic valid draft', async () => {
    const first = await tryGenerateAiPlan(REQ);
    expect(first).not.toBeNull();
    // Seven calendar days, three of them training — REQ.daysPerWeek is 3.
    expect(first!.draft.days).toHaveLength(7);
    expect(first!.draft.days.filter((d) => !d.isRest)).toHaveLength(3);
    expect(first!.ai.provider).toBe('mock');
    expect(first!.ai.promptVersion).toMatch(/^P-05@/);

    const poolIds = new Set(POOL.map((e) => e.id));
    const entryIds = new Set(
      first!.draft.days.flatMap((d) => d.slots.flatMap((s) => s.entries.map((e) => e.id))),
    );
    for (const day of first!.draft.days) {
      for (const slot of day.slots) {
        for (const entry of slot.entries) expect(poolIds.has(entry.exerciseId)).toBe(true);
      }
    }
    for (const rule of first!.draft.progressionRules) {
      expect(entryIds.has(rule.slotEntryId)).toBe(true);
    }
    expect(first!.draft.rationale.length).toBeGreaterThan(0);

    const second = await tryGenerateAiPlan(REQ);
    expect(second!.draft).toEqual(first!.draft); // deterministic offline path
  });

  it('returns null for an empty pool', async () => {
    expect(await tryGenerateAiPlan({ ...REQ, pool: [] })).toBeNull();
  });

  it('returns null when the pool cannot serve the user experience', async () => {
    const advancedOnly = [exercise({ id: 'ex_muscleup', difficulty: 'advanced' })];
    expect(await tryGenerateAiPlan({ ...REQ, pool: advancedOnly })).toBeNull();
  });

  /*
   * The week is always seven days long; daysPerWeek only moves how many of
   * them carry work. Asserting the training-day count at both extremes is what
   * pins the contract — a draft whose length tracked daysPerWeek would satisfy
   * a length-only assertion and still be rejected downstream.
   */
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'emits a seven-day week with exactly %i training days',
    async (daysPerWeek) => {
      const result = await tryGenerateAiPlan({ ...REQ, daysPerWeek });
      expect(result).not.toBeNull();
      expect(result!.draft.days).toHaveLength(7);
      expect(result!.draft.days.filter((d) => !d.isRest)).toHaveLength(daysPerWeek);
      // Rest days carry no work, and orders cover the week exactly once each.
      for (const day of result!.draft.days.filter((d) => d.isRest)) {
        expect(day.slots).toHaveLength(0);
      }
      expect([...result!.draft.days].map((d) => d.order).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);
    },
  );
});

describe('suggestExerciseSwap', () => {
  const swapReq = {
    exercise: POOL[0]!,
    pool: POOL,
    profile: PROFILE,
    reason: 'variety',
  };

  it('returns in-pool ids via the mock provider', async () => {
    const result = await suggestExerciseSwap(swapReq);
    expect(result).not.toBeNull();
    const poolIds = new Set(POOL.map((e) => e.id));
    for (const id of result!.exerciseIds) expect(poolIds.has(id)).toBe(true);
    expect(result!.exerciseIds).not.toContain(POOL[0]!.id);
    expect(result!.rationale.length).toBeGreaterThan(0);
  });

  it('refuses out-of-pool ids', async () => {
    const result = await suggestExerciseSwap(swapReq, {
      complete: async () => ({
        text: '{"exerciseIds":["ex_ghost"],"rationale":"try this"}',
        json: { exerciseIds: ['ex_ghost'], rationale: 'try this' },
        meta: { provider: 'eval', model: 'eval', promptVersion: 'P-06@eval', generatedAt: '' },
      }),
    });
    expect(result).toBeNull();
  });

  it('refuses equipment-incompatible suggestions', async () => {
    const barbellPool = [...POOL, exercise({ id: 'ex_bench', equipment: ['barbell', 'bench'], primaryMuscles: ['chest'] })];
    const result = await suggestExerciseSwap({ ...swapReq, pool: barbellPool }, {
      complete: async () => ({
        text: '{"exerciseIds":["ex_bench"],"rationale":"same muscles"}',
        json: { exerciseIds: ['ex_bench'], rationale: 'same muscles' },
        meta: { provider: 'eval', model: 'eval', promptVersion: 'P-06@eval', generatedAt: '' },
      }),
    });
    expect(result).toBeNull();
  });

  it('returns null for an empty pool', async () => {
    expect(await suggestExerciseSwap({ ...swapReq, pool: [] })).toBeNull();
  });
});
