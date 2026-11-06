// @vitest-environment jsdom
/**
 * REGRESSION GUARD: consent is opt-in.
 *
 * The first-setup form used to arrive with AI personalisation, anonymised
 * analytics and reminders already ticked. A pre-ticked box is not consent
 * (GDPR Art. 4(11) and 7, Planet49), it contradicts the API's own defaults
 * (DEFAULT_CONSENTS in modules/me/service.ts, all off), and it made the
 * landing page's "Personalisation is opt-in" untrue for anyone who clicked
 * straight through. Only a box the person ticks may turn a purpose on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(() => Promise.resolve()),
  updateConsents: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/telegram', () => ({ haptic: vi.fn(), isTMA: () => false }));
vi.mock('../../lib/useTelegramChrome', () => ({
  useTelegramMainAction: () => false,
  useTelegramUnsavedEdits: () => undefined,
}));
vi.mock('../../lib/useDraftPersistence', () => ({ useDraftPersistence: () => ({ clear: vi.fn() }) }));
vi.mock('../../lib/retention', () => ({
  trackOnboardingCompleted: vi.fn(),
  trackOnboardingSkipped: vi.fn(),
}));
vi.mock('../../lib/queries', () => ({
  useTargets: () => ({ data: null, isLoading: true }),
  useUpdateProfile: () => ({ mutateAsync: mocks.updateProfile, isPending: false }),
  useUpdateConsents: () => ({ mutateAsync: mocks.updateConsents, isPending: false }),
}));
vi.mock('../../components/layout/RequireAuth', () => ({
  useProfileGate: () => ({ profile: null, refetchProfile: vi.fn() }),
}));
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import Setup from './Setup';

function renderSetup() {
  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <Setup />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Setup consents', () => {
  it('starts every consent unticked, the optional ones included', () => {
    renderSetup();

    for (const name of [
      /Wellness data processing/,
      /AI personalisation/,
      /Anonymised analytics/,
      /Reminders/,
    ]) {
      expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(false);
    }
  });

  it('records only the purpose the person ticked', async () => {
    renderSetup();

    fireEvent.change(screen.getByPlaceholderText('e.g. 28'), { target: { value: '34' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 175'), { target: { value: '168' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 75'), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('radio', { name: /Lose weight/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^Moderate$/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Wellness data processing/ }));
    fireEvent.click(screen.getByRole('button', { name: /Show my targets/i }));

    await waitFor(() => expect(mocks.updateConsents).toHaveBeenCalledTimes(1));
    expect(mocks.updateConsents).toHaveBeenCalledWith({
      wellnessDataProcessing: true,
      aiPersonalisation: false,
      anonymisedAnalytics: false,
      reminders: false,
    });
  });
});
