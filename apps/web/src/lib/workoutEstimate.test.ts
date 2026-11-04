import { describe, expect, it } from 'vitest';
import { estimateSessionMinutes } from './workoutEstimate';

describe('session length', () => {
  it('uses the same timing formula on every surface', () => {
    const session = {
      durationMinutes: null,
      exercises: [{ setsPlanned: 12, reps: 10, restSeconds: 95 }],
    };
    // 12 × (10×4 + 95) = 1620s = 27 min. The old Home formula (sets × 2.5) said 30.
    expect(estimateSessionMinutes(session)).toBe(27);
  });

  it('keeps a positive stored duration and floors a short session at 10 minutes', () => {
    expect(
      estimateSessionMinutes({
        durationMinutes: 42,
        exercises: [{ setsPlanned: 1, reps: 5, restSeconds: 30 }],
      }),
    ).toBe(42);
    expect(
      estimateSessionMinutes({
        durationMinutes: null,
        exercises: [{ setsPlanned: 1, reps: 8, restSeconds: 30 }],
      }),
    ).toBe(10);
  });
});
