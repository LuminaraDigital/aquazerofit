/**
 * Adaptive expenditure and target integration (Launch Gap Phase 3).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FORMULA_VERSION } from '@aquazerofit/shared';
import {
  ADAPTIVE_FORMULA_VERSION,
  calculateAdaptiveExpenditure,
  smoothWeightSeries,
} from '../modules/me/adaptive';
import { computeTargets } from '../modules/me/targets';

describe('calculateAdaptiveExpenditure', () => {
  it('returns baseline with low confidence when history is insufficient', () => {
    const result = calculateAdaptiveExpenditure([], [], 2200, 'male');
    expect(result.estimatedTdeeKcal).toBe(2200);
    expect(result.confidence).toBe('low');
    expect(result.adaptationKcal).toBe(0);
  });

  it('smoothWeightSeries reduces noise via EWMA', () => {
    const raw = [
      { date: '2026-08-01', value: 80 },
      { date: '2026-08-02', value: 82 },
      { date: '2026-08-03', value: 80 },
    ];
    const smoothed = smoothWeightSeries(raw, 0.2);
    expect(smoothed).toHaveLength(3);
    expect(smoothed[0]!.value).toBe(80);
    expect(smoothed[1]!.value).toBeCloseTo(80.4, 1);
  });

  it('adapts upward when scale weight drops during maintenance intake', () => {
    const weights = Array.from({ length: 15 }, (_, day) => ({
      date: `2026-08-${String(day + 1).padStart(2, '0')}`,
      value: 80 - day * 0.1,
    }));
    const calories = Array.from({ length: 15 }, (_, day) => ({
      date: `2026-08-${String(day + 1).padStart(2, '0')}`,
      value: 2200,
    }));

    const result = calculateAdaptiveExpenditure(weights, calories, 2200, 'male');
    expect(result.estimatedTdeeKcal).toBeGreaterThan(2200);
    expect(result.adaptationKcal).toBeGreaterThan(0);
    expect(result.confidence).toBe('high');
  });

  it('never breaches female or male safety calorie floors', () => {
    const weights = Array.from({ length: 15 }, (_, day) => ({
      date: `2026-08-${String(day + 1).padStart(2, '0')}`,
      value: 60 + day * 0.2,
    }));
    const calories = Array.from({ length: 15 }, (_, day) => ({
      date: `2026-08-${String(day + 1).padStart(2, '0')}`,
      value: 1000,
    }));

    const female = calculateAdaptiveExpenditure(weights, calories, 1300, 'female', -500);
    expect(female.recommendedTargetKcal).toBeGreaterThanOrEqual(1200);

    const male = calculateAdaptiveExpenditure(weights, calories, 1600, 'male', -500);
    expect(male.recommendedTargetKcal).toBeGreaterThanOrEqual(1500);
  });
});

describe('adaptive formula version', () => {
  it('extends the baseline formula version when adaptive is applied', () => {
    expect(ADAPTIVE_FORMULA_VERSION).toBe(`${FORMULA_VERSION}+adaptive-v1`);
    expect(computeTargets({
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
    }).formulaVersion).toBe(FORMULA_VERSION);
  });
});

describe('service integration with ADAPTIVE_TARGETS', () => {
  const prev = process.env.ADAPTIVE_TARGETS;

  beforeEach(() => {
    process.env.ADAPTIVE_TARGETS = 'true';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.ADAPTIVE_TARGETS;
    else process.env.ADAPTIVE_TARGETS = prev;
  });

  it('config.adaptiveTargets reads the env flag', async () => {
    const { config } = await import('../platform/config');
    expect(config.adaptiveTargets).toBe(true);
  });
});
