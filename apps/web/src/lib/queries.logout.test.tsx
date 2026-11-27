// @vitest-environment jsdom
/**
 * Shared-browser hygiene (M-14): signing out must clear cached user identity
 * and unsubmitted health/onboarding/coach drafts from localStorage so the next
 * account on the same device never inherits them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  api: vi.fn(async () => undefined),
  tokenStore: {
    access: 'tok',
    isAuthenticated: true,
    set: vi.fn(),
    clear: vi.fn(),
  },
  signOutFirebase: vi.fn(async () => undefined),
}));

vi.mock('./api', () => ({
  api: mocks.api,
  ApiError: class ApiError extends Error {},
  tokenStore: mocks.tokenStore,
}));

vi.mock('./AuthProvider', () => ({
  useFirebaseAuth: () => ({
    firebaseEnabled: false,
    signInEmail: vi.fn(),
    registerEmail: vi.fn(),
    resetPassword: vi.fn(),
    signOutFirebase: mocks.signOutFirebase,
    mapError: (e: unknown) => String(e),
  }),
  toAuthResponseStub: vi.fn(),
}));

import { useAuthActions } from './queries';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('useAuthActions.logout', () => {
  it('clears user snapshot and user-specific drafts from localStorage on sign-out', async () => {
    localStorage.setItem('azf.user', JSON.stringify({ id: 'u1', email: 'a@b.com' }));
    localStorage.setItem('azf_setup_draft_v1', JSON.stringify({ weightKg: '82' }));
    localStorage.setItem('azf_coach_composer_v1', JSON.stringify('draft message'));
    localStorage.setItem('azf.notificationPrefs', JSON.stringify({ reminders: true }));
    localStorage.setItem('azf_intro_seen_v1', '1');

    let actions!: ReturnType<typeof useAuthActions>;
    function Probe() {
      actions = useAuthActions();
      return null;
    }

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );

    await act(async () => {
      await actions.logout();
    });

    expect(mocks.tokenStore.clear).toHaveBeenCalled();
    expect(localStorage.getItem('azf.user')).toBeNull();
    expect(localStorage.getItem('azf_setup_draft_v1')).toBeNull();
    expect(localStorage.getItem('azf_coach_composer_v1')).toBeNull();
    expect(localStorage.getItem('azf.notificationPrefs')).toBeNull();
    // Non-PII device flag stays untouched
    expect(localStorage.getItem('azf_intro_seen_v1')).toBe('1');
  });
});
