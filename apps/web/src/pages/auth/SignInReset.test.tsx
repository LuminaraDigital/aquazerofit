// @vitest-environment jsdom
/**
 * REGRESSION GUARD — the reset link in the password-reset email has to land
 * somewhere useful.
 *
 * The API mails a link to /sign-in?reset=<token>. If the page ignored that
 * parameter the recipient would arrive at a plain sign-in form and have to
 * find the reset panel and paste a UUID out of their mail by hand, which is
 * the failure mode that makes people give up on account recovery.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  tokenStore: { isAuthenticated: false },
  isTMA: vi.fn(() => false),
}));

vi.mock('../../lib/api', () => ({
  tokenStore: mocks.tokenStore,
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    code = 'UNKNOWN';
    status = 500;
  },
}));
vi.mock('../../lib/telegram', () => ({
  isTMA: mocks.isTMA,
  getTelegramInitData: vi.fn(() => undefined),
  haptic: vi.fn(),
}));
vi.mock('../../lib/queries', () => ({
  useAuthActions: () => ({ login: vi.fn(), register: vi.fn(), telegramLogin: vi.fn() }),
}));
vi.mock('../../lib/useTelegramAutoLogin', () => ({ useTelegramAutoLogin: () => false }));

import SignIn from './SignIn';

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('arriving from a password reset email', () => {
  it('opens the reset panel with the token from the link already filled in', () => {
    renderAt('/sign-in?reset=abc-123-token');

    const token = screen.getByDisplayValue('abc-123-token');
    expect(token).toBeDefined();
    // Straight to the confirm step: a new-password field is on screen.
    expect(screen.getByLabelText(/new password/i)).toBeDefined();
  });

  it('decodes a token that needed escaping in the URL', () => {
    renderAt(`/sign-in?reset=${encodeURIComponent('tok+en/with spaces')}`);

    expect(screen.getByDisplayValue('tok+en/with spaces')).toBeDefined();
  });

  it('leaves the ordinary sign-in form alone when there is no reset parameter', () => {
    renderAt('/sign-in');

    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });
});
