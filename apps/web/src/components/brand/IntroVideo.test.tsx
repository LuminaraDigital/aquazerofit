// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { INTRO_SEEN_KEY, IntroVideo, shouldPlayIntro } from './IntroVideo';

const base = { pathname: '/', seen: false, automated: false, reducedMotion: false };

describe('shouldPlayIntro', () => {
  it('plays once on the front door for a real visitor', () => {
    expect(shouldPlayIntro(base)).toBe(true);
  });

  it.each([
    ['a returning visitor', { seen: true }],
    ['a deep link or the captcha WebView', { pathname: '/mobile/captcha' }],
    ['an automated browser', { automated: true }],
    ['reduced motion', { reducedMotion: true }],
  ])('stays out of the way for %s', (_label, override) => {
    expect(shouldPlayIntro({ ...base, ...override })).toBe(false);
  });
});

describe('IntroVideo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const mount = (path = '/') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <IntroVideo />
      </MemoryRouter>,
    );

  it('skips, remembers it was seen, and does not come back', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    act(() => vi.advanceTimersByTime(300));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('1');

    cleanup();
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives up instead of blocking the app when the video never starts', () => {
    mount();
    act(() => vi.advanceTimersByTime(4300));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
