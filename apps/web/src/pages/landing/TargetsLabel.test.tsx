// @vitest-environment jsdom
/**
 * The landing page's calculator claims to be the formula the app runs, so it
 * is pinned to hand-computed figures, not to whatever computeTargets returns.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TargetsLabel } from './TargetsLabel';

afterEach(cleanup);

function kcal(): string {
  return screen.getByText('Calories').nextElementSibling?.textContent ?? '';
}

describe('TargetsLabel', () => {
  it('shows the Mifflin–St Jeor result and its working for the default profile', () => {
    render(<TargetsLabel />);

    // Female, 34 y, 168 cm, 72 kg: BMR = 720 + 1050 − 170 − 161 = 1,439.
    // × 1.55 moderate = 2,230. Lose: 72 kg × 0.75 %/wk × 7,700 / 7 = 594.
    expect(kcal()).toContain('1,636');
    expect(screen.getByText(/BMR = 10 × 72 \+ 6\.25 × 168 − 5 × 34 − 161 =/)).toBeTruthy();
    expect(screen.getByText('1,439')).toBeTruthy();
  });

  it('recomputes when an input changes', () => {
    render(<TargetsLabel />);

    fireEvent.click(screen.getByLabelText('Maintain'));
    expect(kcal()).toContain('2,230');
  });

  it('discloses the calorie floor instead of hiding it', () => {
    render(<TargetsLabel />);

    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '140' } });
    fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'sedentary' } });

    expect(kcal()).toContain('1,200');
    expect(screen.getByRole('status').textContent).toMatch(/safe minimum of 1200 kcal/);
  });
});
