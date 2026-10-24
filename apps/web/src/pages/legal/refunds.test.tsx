// @vitest-environment jsdom
/**
 * /support#refunds is the page the bot's /terms and /paysupport commands link
 * to. The heading and the two rails (Stars, Play or card) have to be there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/telegram', () => ({ isTMA: () => false }));

import SupportPage from './Support';

afterEach(() => {
  cleanup();
});

describe('support refunds', () => {
  it('explains Stars refunds and how to cancel a subscription', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const { container } = render(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );

    expect(container.querySelector('#refunds')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Refunds' })).toBeTruthy();
    expect(screen.getByText(/Telegram Stars are one-time/i)).toBeTruthy();
    expect(screen.getByText(/cancelled in the Play Store/i)).toBeTruthy();
  });
});
