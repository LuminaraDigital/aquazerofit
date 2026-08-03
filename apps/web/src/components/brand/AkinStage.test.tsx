// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AkinStage } from './AkinStage';

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AkinStage', () => {
  it('cycles poses when a pose control is clicked', () => {
    render(<AkinStage autoPlay={false} />);

    expect(
      screen.getByRole('button', { name: /akin, ready/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^guard$/i }));

    expect(
      screen.getByRole('button', { name: /akin, guard/i }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /^guard$/i }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('advances pose on main stage click', () => {
    render(<AkinStage autoPlay={false} showControls={false} />);

    const stage = screen.getByRole('button', { name: /akin, ready/i });
    fireEvent.click(stage);

    expect(
      screen.getByRole('button', { name: /akin, guard/i }),
    ).toBeTruthy();
  });
});
