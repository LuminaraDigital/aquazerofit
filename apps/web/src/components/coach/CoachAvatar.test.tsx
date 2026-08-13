// @vitest-environment jsdom
/**
 * The art fallback chain.
 *
 * This exists because the single-step version shipped broken and the breakage
 * was invisible in code review: expression variants do not exist yet, so every
 * celebration rendered a monogram instead of the coach. The chain has to be
 * expression → avatar → monogram, and each step needs its own assertion or the
 * middle one is exactly what a future simplification removes.
 *
 * Note what triggers a step: `onError`, not a 404. The SPA host answers unknown
 * paths with index.html, so a missing image arrives as 200 text/html and fails
 * to decode. jsdom never loads images at all, so the tests fire `error`
 * directly — which is the same event the browser dispatches for a failed
 * decode, and was verified against the running app.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CoachArt } from '@aquazerofit/shared';
import { CoachAvatar } from './CoachAvatar';

afterEach(cleanup);

const art: CoachArt = {
  portrait: '/coaches/akin/portrait.webp',
  avatar: '/coaches/akin/avatar.webp',
  celebrate: '/coaches/akin/celebrate.webp',
  encourage: '/coaches/akin/encourage.webp',
};

const renderAvatar = (expression: 'neutral' | 'celebrate' | 'encourage') =>
  render(
    <CoachAvatar art={art} name="Akin Celsus" colour="#22d3ee" expression={expression} />,
  );

/** The <img> is aria-hidden by design, so query the DOM rather than the a11y tree. */
const img = (container: HTMLElement) => container.querySelector('img');

describe('CoachAvatar fallback chain', () => {
  it('asks for the expression variant first', () => {
    const { container } = renderAvatar('celebrate');
    expect(img(container)?.getAttribute('src')).toBe(art.celebrate);
  });

  it('falls back to the neutral avatar when the expression is missing', () => {
    const { container } = renderAvatar('celebrate');
    fireEvent.error(img(container)!);
    expect(img(container)?.getAttribute('src')).toBe(art.avatar);
  });

  it('falls back to a monogram only after the neutral avatar also fails', () => {
    const { container } = renderAvatar('encourage');

    fireEvent.error(img(container)!); // encourage → avatar
    expect(img(container)?.getAttribute('src')).toBe(art.avatar);

    fireEvent.error(img(container)!); // avatar → monogram
    expect(img(container)).toBeNull();
    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('goes straight to the monogram when the neutral avatar is what failed', () => {
    // No second attempt at the same file — retrying it would loop forever.
    const { container } = renderAvatar('neutral');
    expect(img(container)?.getAttribute('src')).toBe(art.avatar);
    fireEvent.error(img(container)!);
    expect(img(container)).toBeNull();
    expect(screen.getByText('AC')).toBeTruthy();
  });

  it('retries from the top when the coach changes', () => {
    const { container, rerender } = renderAvatar('celebrate');
    fireEvent.error(img(container)!);
    expect(img(container)?.getAttribute('src')).toBe(art.avatar);

    // A different coach must not inherit the previous one's failures.
    const other: CoachArt = {
      portrait: '/coaches/ogun/portrait.webp',
      avatar: '/coaches/ogun/avatar.webp',
      celebrate: '/coaches/ogun/celebrate.webp',
    };
    rerender(
      <CoachAvatar art={other} name="Ogun Celsus" colour="#dc2626" expression="celebrate" />,
    );
    expect(img(container)?.getAttribute('src')).toBe(other.celebrate);
  });

  it('uses the neutral avatar for an expression the coach has no variant for', () => {
    const sparse: CoachArt = { portrait: '/p.webp', avatar: '/a.webp' };
    const { container } = render(
      <CoachAvatar art={sparse} name="King Yamsiri" colour="#3b82f6" expression="celebrate" />,
    );
    expect(img(container)?.getAttribute('src')).toBe('/a.webp');
  });
});
