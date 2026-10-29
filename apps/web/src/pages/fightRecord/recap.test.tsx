// @vitest-environment jsdom
/**
 * The season recap page (AZF-P1 US-A3).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { BANNED_COPY, type SeasonRecap } from '@aquazerofit/shared';
import { campWith, recordWith, renderWithClient } from '@/components/fightCamp/testUtils';

const mocks = vi.hoisted(() => ({ api: vi.fn(), track: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));
vi.mock('@/lib/growth', () => ({ trackGrowth: mocks.track }));

import RecapPage from './Recap';
import { SeasonCard } from '@/components/fightRecord/SeasonCard';
import { ApiError } from '@/lib/api';

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  mocks.track.mockClear();
});

const RECAP: SeasonRecap = {
  seasonNumber: 2,
  seasonName: 'Ground Game',
  startsOn: '2026-12-14',
  endsOn: '2027-02-07',
  belt: 'purple',
  activeDays: 24,
  longestRun: 14,
  cheersGiven: 3,
  cheersReceived: 5,
  squadName: 'Corner Crew',
};

function serve(recap: SeasonRecap | 'missing', camp = campWith({ shareKit: { firstName: null } })) {
  mocks.api.mockImplementation(async (path: string) => {
    if (path.startsWith('/fight-camp/recap/')) {
      if (recap === 'missing') throw new ApiError(404, { code: 'NOT_FOUND', message: 'There is no recap for that season.' });
      return { recap };
    }
    if (path === '/fight-record') return { fightRecord: recordWith(), fightCamp: camp };
    return null;
  });
}

function renderAt(path: string) {
  return renderWithClient(
    <Routes>
      <Route path="/fight-record/recap/:seasonNumber" element={<RecapPage />} />
      <Route path="/fight-record" element={<p>Fight Record page</p>} />
    </Routes>,
    path,
  );
}

describe('RecapPage', () => {
  it('looks back in days and cheers, with nothing about bodies or food', async () => {
    serve(RECAP);
    const { container } = renderAt('/fight-record/recap/2');
    expect(await screen.findByRole('heading', { name: 'Your Season 2' })).toBeTruthy();
    expect(screen.getByText('Purple Belt')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('14 days')).toBeTruthy();
    expect(screen.getByText('Corner Crew')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(BANNED_COPY);
    expect(text).not.toMatch(/kg|kcal|calor|weight|macro|meal/i);
    await waitFor(() => expect(mocks.track).toHaveBeenCalledWith('fc_recap_viewed', { season: 2, belt: 'purple' }));
  });

  it('opens the Share Kit’s recap card', async () => {
    serve(RECAP);
    renderAt('/fight-record/recap/2');
    fireEvent.click(await screen.findByRole('button', { name: 'Share your season' }));
    expect(await screen.findByRole('dialog', { name: 'Share' })).toBeTruthy();
  });

  it('offers the new season to someone who has not joined it', async () => {
    serve(RECAP, campWith({ enrolment: { enrolled: false, prompt: 'primary' } }));
    renderAt('/fight-record/recap/2');
    expect(await screen.findByRole('button', { name: 'Join Fight Camp: Season 3' })).toBeTruthy();
  });

  it('goes back to Fight Record when there is no recap', async () => {
    serve('missing');
    renderAt('/fight-record/recap/9');
    expect(await screen.findByText('Fight Record page')).toBeTruthy();
  });

  it('goes back to Fight Record for a season number that is not one', async () => {
    serve(RECAP);
    renderAt('/fight-record/recap/abc');
    expect(await screen.findByText('Fight Record page')).toBeTruthy();
  });
});

describe('the season card', () => {
  it('points to a ready recap', async () => {
    serve(RECAP, campWith({ recap: { seasonNumber: 2, seasonName: 'Ground Game' } }));
    renderWithClient(<SeasonCard />);
    expect(await screen.findByRole('button', { name: 'Your Season 2 recap is ready' })).toBeTruthy();
  });
});
