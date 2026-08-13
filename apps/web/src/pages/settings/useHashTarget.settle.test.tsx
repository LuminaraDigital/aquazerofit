// @vitest-environment jsdom
/**
 * REGRESSION GUARD — scrolling to the hash target exactly once is not enough.
 *
 * The bug this pins was found by driving the real page, not by a test: the
 * MutationObserver fires on the mutation that inserts the section, and at that
 * instant the rest of Settings has not been laid out. The document is barely
 * taller than the viewport, the browser clamps the scroll target to ~0, and
 * `scrollIntoView` silently does nothing. A moment later the page grows past
 * 2000px and the section sits far below the fold with the scroll still at the
 * top — so the deep link from the weekly insight card lands nowhere.
 *
 * jsdom has no layout engine and no-ops `scrollIntoView`, so no amount of
 * ordinary DOM testing reproduces it. What CAN be pinned is the behaviour that
 * fixes it: while the target remains off screen and the page has stopped
 * scrolling, the hook must keep correcting rather than assuming its first
 * attempt worked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useHashTarget } from './useHashTarget';

const TARGET_ID = 'privacy-consents';

/** Frames run on demand so the settle loop is stepped deterministically. */
function installManualRaf() {
  const queue: FrameRequestCallback[] = [];
  const raf = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    });
  const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  return {
    /** Run at most `max` queued frames; stops early once the loop settles. */
    flush(max = 30) {
      for (let i = 0; i < max; i += 1) {
        const next = queue.shift();
        if (!next) break;
        next(performance.now());
      }
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
    },
  };
}

/** Pin the element off screen — the state the real bug leaves it in. */
function placeOffScreen(el: HTMLElement, top = 1037) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom: top + 200,
    left: 0,
    right: 375,
    width: 375,
    height: 200,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

function Harness() {
  useHashTarget(TARGET_ID);
  return (
    <div>
      <div style={{ height: 2000 }} />
      <section id={TARGET_ID} tabIndex={-1}>
        Privacy and consents
      </section>
    </div>
  );
}

function renderAtHash() {
  return render(
    <MemoryRouter initialEntries={[`/settings#${TARGET_ID}`]}>
      <Harness />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useHashTarget — surviving a page that grows under the first scroll', () => {
  it('keeps correcting while the target is off screen and scrolling has stopped', () => {
    const raf = installManualRaf();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    // A page that can still be scrolled, sitting at the top — the exact state
    // after a clamped first attempt.
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2103,
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });

    renderAtHash();
    const section = document.getElementById(TARGET_ID)!;
    placeOffScreen(section);

    expect(scrollIntoView).toHaveBeenCalledTimes(1); // the first, clamped attempt

    raf.flush();

    // The correction is the whole point: one call and a shrug is the bug.
    expect(scrollIntoView.mock.calls.length).toBeGreaterThan(1);
    expect(scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: 'start', behavior: 'instant' }),
    );
    raf.restore();
  });

  it('does not keep scrolling once the target is on screen', () => {
    const raf = installManualRaf();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2103,
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 941 });

    renderAtHash();
    const section = document.getElementById(TARGET_ID)!;
    placeOffScreen(section, 96); // framed by scroll-margin — this is success

    raf.flush();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    raf.restore();
  });

  it('stops correcting when the page cannot scroll any further', () => {
    const raf = installManualRaf();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    // Already at the bottom: the target cannot be brought further up, and
    // retrying forever would burn frames for nothing.
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 188 });

    renderAtHash();
    const section = document.getElementById(TARGET_ID)!;
    placeOffScreen(section, 900);

    raf.flush();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    raf.restore();
  });
});
