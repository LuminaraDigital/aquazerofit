// @vitest-environment jsdom
/**
 * The desktop pin sits outside the centred max-w-md column and under that
 * column's stacking context. It used to share the column's right edge at
 * z-50, which covered Generate my plan, the coach send button, and modals.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', () => ({
  api: vi.fn(() => new Promise(() => {})),
}));

import { CoachPip } from './CoachPip';

function renderPin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CoachPip />
    </QueryClientProvider>,
  );
}

describe('CoachPip pin control', () => {
  afterEach(() => {
    cleanup();
    delete window.documentPictureInPicture;
  });

  it('stays hidden when the browser has no picture-in-picture window', () => {
    renderPin();
    expect(screen.queryByRole('button', { name: /pin coach/i })).toBeNull();
  });

  it('sits in the desktop margin, under the app column stacking context', () => {
    window.documentPictureInPicture = {
      requestWindow: vi.fn(),
      window: null,
    };

    renderPin();
    const pin = screen.getByRole('button', { name: /pin coach/i });
    const classes = pin.className;

    // lg: the control is display:none below the desktop breakpoint.
    expect(classes).toContain('hidden');
    expect(classes).toContain('lg:flex');

    // Right edge of a centred max-w-md (28rem) column, plus a 1rem gap.
    // 14rem is half of 28rem. This is outside the column, so it cannot cover
    // the send button or Generate my plan, which live inside it.
    expect(classes).toContain('left-[calc(50%+14rem+1rem)]');
    expect(classes).not.toMatch(/right-\[/);

    // .azf-content is z-index 10. A pin at z-50 paints over every modal
    // trapped in that context. z-[1] stays underneath them.
    expect(classes).toContain('z-[1]');
    expect(classes).not.toMatch(/\bz-\d/);
    expect(classes).not.toContain('z-50');
  });
});
