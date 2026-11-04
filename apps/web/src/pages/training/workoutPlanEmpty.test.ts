import { describe, expect, it } from 'vitest';
import { CREDIT_COSTS } from '@aquazerofit/shared';
import { workoutPlanEmptyCopy } from './WorkoutLibrary';

describe('workout plan empty state', () => {
  it('names the generate action and the credit cost from the plan page', () => {
    const copy = workoutPlanEmptyCopy();
    expect(copy.title).toBe('No training plan yet');
    expect(copy.action).toMatch(/generate my plan/i);
    expect(copy.body).toContain(String(CREDIT_COSTS.planGeneration));
    expect(CREDIT_COSTS.planGeneration).toBe(5);
  });
});
