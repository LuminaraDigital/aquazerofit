// @vitest-environment jsdom
/**
 * Cut Man on the consistency and season cards (AZF-P1 US-E1 to US-E3).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { BANNED_COPY, type ConsistencyStatus } from '@aquazerofit/shared';
import { todayLocalDate, toLocalDate, parseLocalDate } from '@/lib/format';
import { campWith, recordWith, renderWithClient, serve } from './testUtils';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));

import { ConsistencyCard } from '@/components/progress/ConsistencyCard';
import { SeasonCard } from '@/components/fightRecord/SeasonCard';
import { cutManChipLabel } from './CutMan';

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
});

function daysAgo(n: number): string {
  const d = parseLocalDate(todayLocalDate());
  d.setDate(d.getDate() - n);
  return toLocalDate(d);
}

function consistency(overrides: Partial<ConsistencyStatus> = {}): ConsistencyStatus {
  return {
    currentDays: 9,
    bestDays: 12,
    activeDays: 15,
    windowDays: 28,
    graceRemaining: 0,
    state: 'steady',
    lastActiveDate: todayLocalDate(),
    ...overrides,
  };
}

describe('CutManNote', () => {
  it('is absent while Cut Man is off for the account', () => {
    renderWithClient(<ConsistencyCard consistency={consistency({ lastActiveDate: daysAgo(1) })} />);
    expect(screen.queryByText(/Cut Man/)).toBeNull();
    expect(screen.queryByText(/glass of water/)).toBeNull();
  });

  it('says when Cut Man stepped in, calmly, inside the last week', () => {
    const { container } = renderWithClient(
      <ConsistencyCard
        consistency={consistency()}
        grace={{ banked: 1, nextEarnInActiveDays: 3, lastApplied: daysAgo(2), standingBy: false }}
      />,
    );
    const weekday = parseLocalDate(daysAgo(2)).toLocaleDateString('en-US', { weekday: 'short' });
    expect(screen.getByText(`Cut Man stepped in on ${weekday}. Your run carried on.`)).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(BANNED_COPY);
    expect(container.innerHTML).not.toMatch(/error|warning|text-red|bg-red/);
  });

  it('stays quiet about an old bridge', () => {
    renderWithClient(
      <ConsistencyCard
        consistency={consistency()}
        grace={{ banked: 2, nextEarnInActiveDays: 7, lastApplied: daysAgo(9), standingBy: false }}
      />,
    );
    expect(screen.queryByText(/stepped in/)).toBeNull();
  });

  it('logs one glass of water in one tap when today has nothing logged yet', async () => {
    mocks.api.mockResolvedValue({ log: {} });
    renderWithClient(
      <ConsistencyCard
        consistency={consistency({ lastActiveDate: daysAgo(1) })}
        grace={{ banked: 0, nextEarnInActiveDays: 2, lastApplied: null, standingBy: false }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Keep it simple today: log one glass of water' });
    fireEvent.click(button);
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        '/water-logs',
        expect.objectContaining({
          method: 'POST',
          body: { amountMl: 250, localDate: todayLocalDate() },
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  });

  it('says Cut Man is standing by while a gap waits for a return', () => {
    const { container } = renderWithClient(
      <ConsistencyCard
        consistency={consistency({ lastActiveDate: daysAgo(3) })}
        grace={{ banked: 2, nextEarnInActiveDays: 7, lastApplied: null, standingBy: true }}
      />,
    );
    expect(screen.getByText('Cut Man is standing by. Log anything today and your run carries on.')).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(BANNED_COPY);
  });
});

describe('CutManChip', () => {
  it('labels the bank, or how far the first day is', () => {
    expect(cutManChipLabel({ banked: 2, nextEarnInActiveDays: 7, lastApplied: null, standingBy: false })).toBe(
      'Cut Man: 2 in your corner',
    );
    expect(cutManChipLabel({ banked: 0, nextEarnInActiveDays: 1, lastApplied: null, standingBy: false })).toBe(
      'Cut Man: first one in 1 active day',
    );
  });

  it('appears on the season card only with the grace block', async () => {
    serve(mocks.api, {
      fightRecord: recordWith(),
      fightCamp: campWith({ grace: { banked: 1, nextEarnInActiveDays: 4, lastApplied: null, standingBy: false } }),
    });
    renderWithClient(<SeasonCard />);
    expect(await screen.findByText('Cut Man: 1 in your corner')).toBeTruthy();
  });
});
