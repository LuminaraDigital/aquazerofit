// @vitest-environment jsdom
/**
 * Reminder choices live on the server now, because the bot is what reads
 * them. Pinned here: a device's old localStorage choices are carried over
 * once, saved choices win over the defaults, and every save carries the
 * device's timezone (without one the server stays silent).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_REMINDER_PREFS, type ReminderPrefs } from '@aquazerofit/shared';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));

import { tokenStore } from '@/lib/api';
import NotificationSettings from './NotificationSettings';

const LEGACY_KEY = 'azf.notificationPrefs';
const consents = {
  wellnessDataProcessing: true,
  aiPersonalisation: false,
  anonymisedAnalytics: false,
  reminders: true,
  updatedAt: '2026-11-02T00:00:00.000Z',
};

function serve(saved: ReminderPrefs | null) {
  mocks.api.mockImplementation(async (route: string, init?: { method?: string; body?: unknown }) => {
    if (route === '/me/consents') return { consents };
    if (route === '/me/reminder-prefs') return { reminderPrefs: init?.method === 'PUT' ? init.body : saved };
    return null;
  });
}

const puts = () =>
  mocks.api.mock.calls
    .filter(([route, init]) => route === '/me/reminder-prefs' && init?.method === 'PUT')
    .map(([, init]) => (init as { body: ReminderPrefs }).body);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings/notifications']}>
        <NotificationSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

beforeEach(() => {
  tokenStore.set({ accessToken: 'test-token' });
  localStorage.clear();
  mocks.api.mockReset();
});

afterEach(() => {
  cleanup();
  tokenStore.clear();
});

describe('NotificationSettings reminder preferences', () => {
  it('carries choices kept on this device over to the account once, then forgets them', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ meals: { enabled: true, time: '07:15' } }));
    serve(null);
    renderPage();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]).toEqual({
      ...DEFAULT_REMINDER_PREFS,
      meals: { enabled: true, time: '07:15' },
      timezone: deviceZone,
    });
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('shows saved choices and saves a change with the device timezone', async () => {
    serve({ ...DEFAULT_REMINDER_PREFS, workout: { enabled: true, time: '06:45' } });
    renderPage();
    const workout = await screen.findByDisplayValue('06:45');
    expect(puts()).toEqual([]);
    fireEvent.change(workout, { target: { value: '07:00' } });
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]).toMatchObject({ workout: { enabled: true, time: '07:00' }, timezone: deviceZone });
  });
});
