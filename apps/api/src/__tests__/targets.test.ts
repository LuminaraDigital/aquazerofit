/**
 * TargetCalculator — 100% branch coverage (AQF-09 §6 coverage standard).
 * Covers: all three sex offsets, all five activity factors, all three goals,
 * the kcal floor clamp (on and off), the carbs>=0 guard, and both water clamps.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_FACTORS,
  FORMULA_VERSION,
  KCAL_FLOOR,
  WATER_ML_MAX,
  WATER_ML_MIN,
  type ActivityLevel,
  type WellnessProfile,
} from '@aquazerofit/shared';
import { computeBmr, computeTargets } from '../modules/me/targets';

function profile(overrides: Partial<WellnessProfile> = {}): WellnessProfile {
  return {
    userId: 'u1',
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'male',
    goal: 'lose',
    activityLevel: 'moderate',
    exerciseExperience: 'beginner',
    dietaryPreferences: [],
    allergies: [],
    equipment: ['none'],
    unitPreference: 'metric',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeBmr (Mifflin-St Jeor sex branches)', () => {
  it('male: 10w + 6.25h - 5a + 5', () => {
    expect(computeBmr(profile({ sex: 'male' }))).toBe(1780);
  });
  it('female: 10w + 6.25h - 5a - 161', () => {
    expect(computeBmr(profile({ sex: 'female' }))).toBe(1614);
  });
  it('unspecified: midpoint offset (-78)', () => {
    expect(computeBmr(profile({ sex: 'unspecified' }))).toBe(1697);
  });
});

describe('activity factors', () => {
  const levels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'veryActive'];
  for (const level of levels) {
    it(`tdee uses factor for ${level}`, () => {
      const t = computeTargets(profile({ activityLevel: level, goal: 'maintain' }));
      expect(t.tdee).toBe(Math.round(1780 * ACTIVITY_FACTORS[level]));
      // maintain: target equals tdee (no adjustment, no clamp for this profile)
      expect(t.kcalTarget).toBe(t.tdee);
      expect(t.clamped).toBe(false);
      expect(t.clampReason).toBeNull();
    });
  }
});

describe('goal adjustment branches', () => {
  it('lose: deficit at the midpoint of the 0.5–1%/wk band', () => {
    const t = computeTargets(profile({ goal: 'lose' }));
    // TDEE 2759 - (80 * 0.0075 * 7700 / 7 = 660) = 2099
    expect(t.tdee).toBe(2759);
    expect(t.kcalTarget).toBe(2099);
  });
  it('gain: conservative surplus at the minimum of the band', () => {
    const t = computeTargets(profile({ goal: 'gain' }));
    // 2759 + (80 * 0.005 * 7700 / 7 = 440) = 3199
    expect(t.kcalTarget).toBe(3199);
  });
  it('maintain: target equals tdee', () => {
    const t = computeTargets(profile({ goal: 'maintain' }));
    expect(t.kcalTarget).toBe(t.tdee);
  });
});

describe('kcal floor clamp (FR-031)', () => {
  it('clamps a small sedentary female losing weight to the 1200 floor', () => {
    const t = computeTargets(
      profile({ sex: 'female', weightKg: 50, heightCm: 155, age: 60, activityLevel: 'sedentary', goal: 'lose' }),
    );
    expect(t.kcalTarget).toBe(KCAL_FLOOR.female);
    expect(t.clamped).toBe(true);
    expect(t.clampReason).toMatch(/safe minimum/);
  });
  it('uses the male floor for male profiles', () => {
    const t = computeTargets(
      profile({ sex: 'male', weightKg: 45, heightCm: 150, age: 80, activityLevel: 'sedentary', goal: 'lose' }),
    );
    expect(t.kcalTarget).toBe(KCAL_FLOOR.male);
    expect(t.clamped).toBe(true);
  });
  it('does not clamp when the target is above the floor', () => {
    const t = computeTargets(profile());
    expect(t.clamped).toBe(false);
    expect(t.clampReason).toBeNull();
  });
});

describe('macro split', () => {
  it('protein by goal, fat >= 20% kcal, carbs as remainder', () => {
    const t = computeTargets(profile({ goal: 'lose' }));
    expect(t.proteinG).toBe(160); // 2.0 g/kg * 80
    expect(t.fatG).toBe(47); // 0.2 * 2099 / 9 rounded
    expect(t.carbsG).toBe(260); // (2099 - 640 - 419.8) / 4 rounded
  });
  it('carbs never go negative when protein + fat exceed the clamped target', () => {
    const t = computeTargets(
      profile({ sex: 'female', weightKg: 120, heightCm: 150, age: 80, activityLevel: 'sedentary', goal: 'lose' }),
    );
    expect(t.clamped).toBe(true);
    expect(t.proteinG).toBe(240); // 2.0 * 120 -> 960 kcal + 240 fat kcal = full budget
    expect(t.carbsG).toBe(0);
  });
});

describe('water target clamps', () => {
  it('clamps up to the minimum for light bodyweights', () => {
    const t = computeTargets(
      profile({ sex: 'female', weightKg: 40, heightCm: 150, age: 16, activityLevel: 'light', goal: 'maintain' }),
    );
    expect(t.waterMl).toBe(WATER_ML_MIN); // 40 * 33 = 1320 -> 1500
  });
  it('clamps down to the maximum for heavy bodyweights', () => {
    const t = computeTargets(
      profile({ weightKg: 130, heightCm: 180, age: 40, activityLevel: 'active', goal: 'maintain' }),
    );
    expect(t.waterMl).toBe(WATER_ML_MAX); // 130 * 33 = 4290 -> 4000
  });
  it('uses 33 ml/kg inside the band', () => {
    const t = computeTargets(profile({ weightKg: 80 }));
    expect(t.waterMl).toBe(2640);
  });
});

describe('metadata', () => {
  it('stamps the formula version and computation time', () => {
    const now = new Date('2026-07-29T10:00:00.000Z');
    const t = computeTargets(profile(), now);
    expect(t.formulaVersion).toBe(FORMULA_VERSION);
    expect(t.computedAt).toBe(now.toISOString());
    expect(t.userId).toBe('u1');
  });
});
