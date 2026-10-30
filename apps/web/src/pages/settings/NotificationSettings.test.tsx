// @vitest-environment jsdom
/**
 * Reminder choices live on the server, because the bot is what reads them.
 * Pinned here: nothing is editable (or saved) before the server's copy is in;
 * a device's old localStorage choices carry over once and are forgotten only
 * after that save succeeds; edits save in order with the device timezone, and
 * a slow reply never undoes a newer edit; a new timezone is saved on arrival.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_REMINDER_PREFS, type ReminderPrefs } from '@aquazerofit/shared';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));

import { ApiError, tokenStore } from '@/lib/api';
import NotificationSettings from './NotificationSettings';

const LEGACY_KEY = 'azf.notificationPrefs';
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const consents = {
  wellnessDataProcessing: true,
  aiPersonalisation: false,
  anonymisedAnalytics: false,
  reminders: true,
  updatedAt: '2026-11-02T00:00:00.000Z',
};

interface Serve {
  /** What GET answers, or a promise to hold it back, or an error. */
  saved: ReminderPrefs | null | Promise<ReminderPrefs | null> | Error;
  /** How each PUT answers: resolve (default), or reject. */
  put?: (body: ReminderPrefs) => Promise<unknown>;
  telegramLinked?: boolean;
}

function serve({ saved, put, telegramLinked = true }: Serve) {
  mocks.api.mockImplementation(async (route: string, init?: { method?: string; body?: ReminderPrefs }) => {
    if (route === '/me/consents') return { consents };
    if (route === '/me') return { user: { id: 'u1', displayName: 'Rem', telegramLinked } };
    if (route === '/me/reminder-prefs') {
      if (init?.method === 'PUT') return { reminderPrefs: await (put ?? (async (b) => b))(init.body!) };
      if (saved instanceof Error) throw saved;
      return { reminderPrefs: await saved };
    }
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

const savedHere = (patch: Partial<ReminderPrefs> = {}): ReminderPrefs => ({
  ...DEFAULT_REMINDER_PREFS,
  timezone: deviceZone,
  ...patch,
});

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
  it('carries this device’s old choices to the account, then forgets them', async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ meals: { enabled: true, time: '07:15' }, water: { enabled: false, frequency: '1h' } }),
    );
    serve({ saved: null });
    renderPage();
    await waitFor(() => expect(localStorage.getItem(LEGACY_KEY)).toBeNull());
    expect(puts()).toEqual([
      {
        ...DEFAULT_REMINDER_PREFS,
        meals: { enabled: true, time: '07:15' },
        water: { enabled: false },
        timezone: deviceZone,
      },
    ]);
  });

  it('keeps the old choices on this device when that save fails', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ meals: { enabled: true, time: '07:15' } }));
    let fail!: () => void;
    const failed = new Promise<never>((_, reject) => (fail = () => reject(new ApiError(500, { code: 'INTERNAL', message: 'down' }))));
    serve({ saved: null, put: () => failed });
    renderPage();
    await waitFor(() => expect(puts()).toHaveLength(1));
    // Still held while the save is in flight, and still held once it has failed.
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    await act(async () => {
      fail();
      await failed.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('saves nothing and offers no controls until the server answers, and offers a retry if it cannot', async () => {
    let answer!: (value: ReminderPrefs | null) => void;
    serve({ saved: new Promise((resolve) => (answer = resolve)) });
    renderPage();
    await screen.findByText('All reminders');
    expect(screen.queryByLabelText('Meal reminders')).toBeNull();
    await act(async () => answer(savedHere()));
    await screen.findByLabelText('Meal reminders');
    expect(puts()).toEqual([]);

    cleanup();
    serve({ saved: new ApiError(500, { code: 'INTERNAL', message: 'down' }) });
    renderPage();
    await screen.findByRole('button', { name: /try again/i });
    expect(screen.queryByLabelText('Meal reminders')).toBeNull();
    expect(puts()).toEqual([]);
  });

  it('saves edits in order, and a slow reply does not undo a newer edit', async () => {
    const replies: Array<() => void> = [];
    serve({
      saved: savedHere({ workout: { enabled: true, time: '06:45' } }),
      put: (body) => new Promise((resolve) => replies.push(() => resolve(body))),
    });
    renderPage();
    fireEvent.click(await screen.findByLabelText('Meal reminders'));
    fireEvent.change(screen.getByLabelText('Workout reminder time'), { target: { value: '07:00' } });
    // The second save waits for the first.
    await waitFor(() => expect(puts()).toHaveLength(1));
    await act(async () => replies[0]!());
    await waitFor(() => expect(puts()).toHaveLength(2));
    await act(async () => replies[1]!());
    expect(puts()[1]).toMatchObject({
      meals: { enabled: false },
      workout: { enabled: true, time: '07:00' },
      timezone: deviceZone,
    });
    expect(screen.getByLabelText('Workout reminder time')).toHaveProperty('value', '07:00');
    expect(screen.getByLabelText('Meal reminders').getAttribute('aria-checked')).toBe('false');
  });

  it('saves the timezone when the person opens the screen somewhere new', async () => {
    serve({ saved: savedHere({ timezone: deviceZone === 'Pacific/Fiji' ? 'Europe/Oslo' : 'Pacific/Fiji' }) });
    renderPage();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]!.timezone).toBe(deviceZone);
  });

  it('tells an account without Telegram that reminders have nowhere to go', async () => {
    serve({ saved: savedHere(), telegramLinked: false });
    renderPage();
    expect(await screen.findByText(/isn’t linked to Telegram yet/)).toBeTruthy();
  });
});
