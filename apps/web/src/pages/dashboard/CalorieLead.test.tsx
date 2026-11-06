// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { DailyNutrition } from '@aquazerofit/shared';
import { CalorieLead } from './CalorieLead';

afterEach(cleanup);

const daily = {
  kcalTarget: 2580,
  kcalConsumed: 198,
  kcalBurned: 0,
  kcalRemaining: 2382,
  proteinG: { consumed: 37, target: 128 },
  carbsG: { consumed: 0, target: 388 },
  fatG: { consumed: 4, target: 57 },
} as DailyNutrition;

describe('CalorieLead', () => {
  it('today: scoreboard figure, kcal left label and macro rows', () => {
    render(<CalorieLead daily={daily} variant="today" />);
    expect(screen.getByText('2,382').className).toContain('scoreboard');
    expect(screen.getByText('kcal left').className).toContain('stat-label');
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['Protein37/128g', 'Carbs0/388g', 'Fat4/57g']);
    expect(screen.getByText('198 eaten of 2,580 goal')).toBeTruthy();
  });

  it('day: remaining label, figure with kcal unit, eaten line, macros', () => {
    render(<CalorieLead daily={daily} variant="day" />);
    expect(screen.getByText('Remaining').className).toContain('stat-label');
    expect(screen.getByText('kcal')).toBeTruthy();
    expect(within(screen.getAllByRole('listitem')[0]).getByText('37/128g')).toBeTruthy();
  });

  it('keeps the screen-reader sentence and shows burned only when non-zero', () => {
    const { rerender } = render(<CalorieLead daily={daily} variant="day" />);
    expect(
      screen.getByText('Goal 2,580 minus food 198 plus exercise 0 equals 2,382 remaining'),
    ).toBeTruthy();
    expect(screen.queryByText(/burned/)).toBeNull();
    rerender(<CalorieLead daily={{ ...daily, kcalBurned: 120, kcalRemaining: 2502 }} variant="day" />);
    expect(screen.getByText('198 eaten of 2,580 goal · 120 burned')).toBeTruthy();
  });
});
