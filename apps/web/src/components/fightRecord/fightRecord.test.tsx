// @vitest-environment jsdom
/**
 * Fight Record surfaces (AZF-W3-05 US-01, US-05, US-06, US-07, US-09, §2.7).
 *
 * What these defend, in the order a regression would hurt:
 *
 *  - Off means off: with the feature dark the dashboard is exactly as it was.
 *  - No surface can say a belt was lost, broken or reset, or count down at
 *    anyone. The copy scan runs over every rendered Fight Record string.
 *  - A celebration is acknowledged whichever way it is closed.
 *  - The public surfaces (story, Telegram status) are offered only to adults
 *    on a client that can do them; the share card carries no count of days.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BELT_LADDER, type BeltAwardView, type FightRecordStatus } from '@aquazerofit/shared';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  canManageEmojiStatus: vi.fn(() => false),
  requestEmojiStatusAccess: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));
vi.mock('@/lib/telegram', async (original) => ({
  ...(await original<typeof import('@/lib/telegram')>()),
  canManageEmojiStatus: mocks.canManageEmojiStatus,
  requestEmojiStatusAccess: mocks.requestEmojiStatusAccess,
}));

import { SeasonCard } from './SeasonCard';
import FightRecordPage from '@/pages/fightRecord/FightRecord';
import { beltSharePayload, nextBeltCopy } from '@/lib/fightRecord';

const SEASON = {
  id: 'season-3',
  number: 3,
  name: 'Second Wind',
  startsOn: '2027-03-01',
  endsOn: '2027-04-25',
};
const BLUE: BeltAwardView = {
  id: 's3-blue',
  seasonNumber: 3,
  seasonName: 'Second Wind',
  tier: 'blue',
  awardedAt: '2027-03-19T02:10:00.000Z',
};

function recordWith(overrides: Partial<FightRecordStatus> = {}): FightRecordStatus {
  return {
    current: { season: SEASON, activeDays: 14, daysLeft: 23, tier: 'blue', next: BELT_LADDER[2]! },
    ladder: BELT_LADDER,
    belts: [BLUE],
    celebrate: null,
    adult: true,
    emojiStatus: { available: true, enabled: false },
    ...overrides,
  };
}

/** Route the mocked api by path; every write answers like the server does. */
function serve(record: FightRecordStatus | null): void {
  mocks.api.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
    if (path === '/fight-record') return { fightRecord: record };
    if (path === '/fight-record/ack') return undefined;
    if (path === '/fight-record/emoji-status') {
      const enabled = (options?.body as { enabled: boolean }).enabled;
      return { emojiStatus: { available: true, enabled } };
    }
    if (path === '/coaches/progression') return { activeCoachId: 'unknown-coach' };
    return null;
  });
}

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const BANNED = /\b(lost|lose|losing|broken|break|reset|streak|hurry|only|last chance|expires?)\b/i;

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  mocks.requestEmojiStatusAccess.mockClear();
  mocks.canManageEmojiStatus.mockReturnValue(false);
});

describe('SeasonCard', () => {
  it('renders nothing while the feature is off', async () => {
    serve(null);
    const { container } = renderWithClient(<SeasonCard />);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/fight-record'));
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('shows the season, the belt and the next rung, with no banned copy', async () => {
    serve(recordWith());
    const { container } = renderWithClient(<SeasonCard />);
    expect(await screen.findByText('Season 3')).toBeTruthy();
    expect(screen.getByText('Blue Belt')).toBeTruthy();
    expect(screen.getByText('10 active days to your Purple Belt.')).toBeTruthy();
    expect(screen.getByText('23 days left in the season')).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(BANNED);
    expect(container.textContent ?? '').not.toMatch(/kcal|kg\b|calorie/i);
  });

  it('shows a skeleton while loading and a retry on error', async () => {
    mocks.api.mockImplementation(() => new Promise(() => {}));
    renderWithClient(<SeasonCard />);
    expect(screen.getByLabelText('Season loading')).toBeTruthy();
    cleanup();

    mocks.api.mockRejectedValue(new Error('down'));
    renderWithClient(<SeasonCard />);
    expect(await screen.findByText("We couldn't load your season.")).toBeTruthy();
  });
});

describe('BeltCelebration', () => {
  it('acknowledges the belt when dismissed with Not now', async () => {
    serve(recordWith({ celebrate: BLUE }));
    renderWithClient(<SeasonCard />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Season 3 · Second Wind')).toBeTruthy();
    fireEvent.click(screen.getByText('Not now'));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/fight-record/ack', {
        method: 'POST',
        body: { awardId: 's3-blue' },
      }),
    );
    await waitFor(() => expect(screen.queryByText('Not now')).toBeNull());
  });

  it('offers the Telegram status only to an adult on a client that supports it', async () => {
    serve(recordWith({ celebrate: BLUE }));
    renderWithClient(<SeasonCard />);
    await screen.findByRole('dialog');
    expect(screen.queryByText('Show on my Telegram profile')).toBeNull();
    cleanup();

    mocks.canManageEmojiStatus.mockReturnValue(true);
    serve(recordWith({ celebrate: BLUE, adult: false }));
    renderWithClient(<SeasonCard />);
    await screen.findByRole('dialog');
    expect(screen.queryByText('Show on my Telegram profile')).toBeNull();
    cleanup();

    serve(recordWith({ celebrate: BLUE }));
    renderWithClient(<SeasonCard />);
    fireEvent.click(await screen.findByText('Show on my Telegram profile'));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/fight-record/emoji-status', {
        method: 'PUT',
        body: { enabled: true },
      }),
    );
  });
});

describe('Fight Record page', () => {
  it('lays out the ladder with thresholds and the belt shelf', async () => {
    serve(recordWith());
    const { container } = renderWithClient(<FightRecordPage />);
    expect(await screen.findByText('The ladder')).toBeTruthy();
    for (const rung of BELT_LADDER) {
      expect(screen.getAllByText(`${rung.activeDays} active days`).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Held')).toHaveLength(2); // white and blue
    expect(screen.getByRole('button', { name: 'Share Blue Belt, season 3' })).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(BANNED);
  });

  it('explains an unopened feature rather than erroring', async () => {
    serve(null);
    renderWithClient(<FightRecordPage />);
    expect(await screen.findByText('Fight Record is on its way')).toBeTruthy();
  });

  it('keeps an enabled Telegram status switchable off outside the Mini App', async () => {
    serve(recordWith({ emojiStatus: { available: true, enabled: true } }));
    renderWithClient(<FightRecordPage />);
    const toggle = await screen.findByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/fight-record/emoji-status', {
        method: 'PUT',
        body: { enabled: false },
      }),
    );
    expect(mocks.requestEmojiStatusAccess).not.toHaveBeenCalled();
  });
});

describe('belt vocabulary', () => {
  it('builds a share card with tier and season only', () => {
    const payload = beltSharePayload(BLUE);
    const text = JSON.stringify(payload);
    expect(payload.kind).toBe('belt');
    expect(text).not.toMatch(/active days|\b14\b|kcal|kg/);
  });

  it('names the top of the ladder instead of a next rung', () => {
    const black = recordWith({
      current: { season: SEASON, activeDays: 50, daysLeft: 3, tier: 'black', next: null },
    });
    expect(nextBeltCopy(black)).toBe('Black Belt: the top of the ladder this season.');
    expect(nextBeltCopy(recordWith({ current: { ...black.current, tier: 'brown', activeDays: 47, next: BELT_LADDER[4]! } }))).toBe(
      '1 active day to your Black Belt.',
    );
  });
});
