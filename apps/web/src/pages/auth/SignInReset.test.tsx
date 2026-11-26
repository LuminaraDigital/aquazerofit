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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    body: { code: string; message: string; details?: unknown };
    constructor(status = 500, body = { code: 'UNKNOWN', message: '' }) {
      super(body.message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
    get code() {
      return this.body.code;
    }
  }
  return {
    tokenStore: { isAuthenticated: false },
    isTMA: vi.fn(() => false),
    firebaseEnabled: false,
    login: vi.fn(),
    MockApiError,
  };
});

vi.mock('../../lib/api', () => ({
  tokenStore: mocks.tokenStore,
  api: vi.fn(),
  ApiError: mocks.MockApiError,
}));
vi.mock('../../lib/telegram', () => ({
  isTMA: mocks.isTMA,
  getTelegramInitData: vi.fn(() => undefined),
  haptic: vi.fn(),
}));
vi.mock('../../lib/queries', () => ({
  useAuthActions: () => ({
    login: mocks.login,
    register: vi.fn(),
    telegramLogin: vi.fn(),
    requestPasswordReset: vi.fn(),
    firebaseEnabled: mocks.firebaseEnabled,
    mapFirebaseError: () => 'Something went wrong. Please try again.',
  }),
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

afterEach(() => {
  cleanup();
  mocks.firebaseEnabled = false;
  mocks.login.mockReset();
  window.history.replaceState({}, '', '/');
});

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

  it('strips ?reset= from the browser address bar after capturing the token', () => {
    window.history.replaceState({}, '', '/sign-in?from=mail&reset=secret-reset-tok');
    renderAt('/sign-in?from=mail&reset=secret-reset-tok');

    expect(screen.getByDisplayValue('secret-reset-tok')).toBeDefined();
    expect(window.location.search).toBe('?from=mail');
  });

  it('surfaces backend ApiError copy even when Firebase auth is enabled', async () => {
    mocks.firebaseEnabled = true;
    mocks.login.mockRejectedValueOnce(
      new mocks.MockApiError(403, {
        code: 'AUTH_EMAIL_UNVERIFIED',
        message: 'Verify your email address before signing in.',
      }),
    );

    renderAt('/sign-in');

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'ValidPass1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(screen.getByText('Verify your email address before signing in.')).toBeTruthy(),
    );
  });
});
