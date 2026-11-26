/**
 * Every field a user writes into a stored document has an upper bound.
 *
 * The store keeps the whole dataset in memory, so an unbounded string is a
 * per-request memory grant: `foodId` had no maximum and one POST /meal-logs
 * could store ~1 MB (30 items under the 1 MB body cap). These pin a ceiling
 * on each field that was open, well above anything a real client sends.
 */
import { describe, expect, it } from 'vitest';
import {
  ALLERGENS,
  completeWorkoutSchema,
  createMealLogSchema,
  loginSchema,
  passwordSchema,
  profileSchema,
  swapExerciseSchema,
} from '@aquazerofit/shared';

const long = (n: number) => 'a'.repeat(n);
const item = (foodId: string) => ({ foodId, name: 'Oats', grams: 50, kcal: 190, proteinG: 7, carbsG: 32, fatG: 3 });
const profile = {
  weightKg: 70,
  heightCm: 175,
  age: 30,
  goal: 'maintain',
  activityLevel: 'moderate',
  exerciseExperience: 'beginner',
};
const workout = (exerciseId: string, count = 1) => ({
  exercises: Array.from({ length: count }, () => ({ exerciseId, setsCompleted: 3 })),
  durationMinutes: 30,
  localDate: '2026-11-12',
});

describe('stored-field bounds', () => {
  it('accepts a real food id and refuses a megabyte one', () => {
    expect(createMealLogSchema.safeParse({ mealType: 'lunch', localDate: '2026-11-12', items: [item('off-5000112548167')] }).success).toBe(true);
    expect(createMealLogSchema.safeParse({ mealType: 'lunch', localDate: '2026-11-12', items: [item(long(1_000_000))] }).success).toBe(false);
  });

  it('bounds exercise ids and the number of exercises in a session', () => {
    expect(completeWorkoutSchema.safeParse(workout('ex-worlds-greatest-stretch', 12)).success).toBe(true);
    expect(completeWorkoutSchema.safeParse(workout(long(10_000))).success).toBe(false);
    expect(completeWorkoutSchema.safeParse(workout('ex-squat', 5_000)).success).toBe(false);
    expect(swapExerciseSchema.safeParse({ exerciseId: long(10_000) }).success).toBe(false);
  });

  it('refuses a profile list longer than its set of choices', () => {
    expect(profileSchema.safeParse({ ...profile, allergies: [...ALLERGENS] }).success).toBe(true);
    const flood = Array.from({ length: 10_000 }, () => ALLERGENS[0]);
    expect(profileSchema.safeParse({ ...profile, allergies: flood }).success).toBe(false);
  });

  it('bounds passwords', () => {
    expect(passwordSchema.safeParse(`Aa1${long(120)}`).success).toBe(true);
    expect(passwordSchema.safeParse(`Aa1${long(100_000)}`).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: long(100_000) }).success).toBe(false);
  });
});
