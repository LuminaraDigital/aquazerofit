// @vitest-environment jsdom
/**
 * The email row sits in a narrow Mini App column. A full-width action button
 * in that flex row used to claim the whole card and paint SET UP on top of
 * the wrapped "sign-in" label.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PublicUser } from '@aquazerofit/shared';

vi.mock('../../lib/telegram', () => ({
  haptic: vi.fn(),
  isTMA: () => false,
  getTelegramInitData: () => null,
}));
vi.mock('../../lib/queries', () => ({
  useSetCredentials: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLinkTelegram: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AccountAccessSection } from './AccountAccessSection';

const telegramUser: PublicUser = {
  id: 'u1',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'user',
  tier: 'free',
  emailVerified: false,
  hasProfile: true,
  telegramLinked: true,
  hasPassword: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
});

describe('Account access email row', () => {
  it('keeps Set up as an inline pill so it cannot cover the label', () => {
    render(<AccountAccessSection user={telegramUser} />);

    const label = screen.getByText('Email sign-in');
    expect(label.className.split(/\s+/)).toContain('truncate');

    const button = screen.getByRole('button', { name: 'Set up' });
    const classes = button.className.split(/\s+/);
    expect(classes).toContain('w-auto');
    expect(classes).not.toContain('w-full');
  });
});
