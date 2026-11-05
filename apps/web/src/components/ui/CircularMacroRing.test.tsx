// @vitest-environment jsdom
/**
 * The ring's hint said "Hover ring for details". The web app is mostly used
 * inside the Telegram Mini App on a phone, where there is no hover; the rings
 * already open on a tap, so the hint has to say so.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CircularMacroRing } from './CircularMacroRing';

afterEach(cleanup);

const zero = { consumed: 0, target: 100 };

describe('CircularMacroRing hint', () => {
  it('tells a phone user to tap, not hover', () => {
    render(
      <CircularMacroRing
        calories={{ consumed: 0, target: 2000 }}
        protein={zero}
        carbs={zero}
        fat={zero}
        water={{ consumed: 0, target: 2500 }}
      />,
    );
    expect(screen.queryByText(/hover/i)).toBeNull();
    expect(screen.getByText(/tap a ring for details/i)).toBeTruthy();
  });
});
