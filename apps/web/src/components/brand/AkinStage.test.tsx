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

  /**
   * `fetchpriority` has to be asserted on the DOM node, not on the JSX.
   *
   * react-dom 18 silently drops a camelCase `fetchPriority` prop — @types/react
   * declares it, so the obvious spelling type-checks, renders nothing, and logs
   * a warning nobody reads. The hint is then missing from precisely the one
   * image it was added for (the landing hero, this app's LCP element). Only
   * reading the attribute back catches that.
   */
  it('emits a real fetchpriority attribute on the priority stage, and none otherwise', () => {
    const { container: hero } = render(<AkinStage autoPlay={false} priority />);
    expect(hero.querySelector('img.akin-pose-in')?.getAttribute('fetchpriority')).toBe('high');

    cleanup();

    const { container: ordinary } = render(<AkinStage autoPlay={false} />);
    expect(
      ordinary.querySelector('img.akin-pose-in')?.hasAttribute('fetchpriority'),
    ).toBe(false);
  });

  it('reserves the pose box with intrinsic dimensions', () => {
    const { container } = render(<AkinStage autoPlay={false} />);
    const img = container.querySelector('img.akin-pose-in');
    expect(img?.getAttribute('width')).toBe('682');
    expect(img?.getAttribute('height')).toBe('1024');
    expect(img?.getAttribute('decoding')).toBe('async');
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
