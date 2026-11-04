// @vitest-environment jsdom
/**
 * axe over the Phase 1 screens (AZF-P1 §6.1, §10.1 "a11y"): /squad, the
 * invite landing, /fight-record with Fight Camp on, the Share Kit and the
 * season recap, each in the state that puts the most on screen.
 *
 * WCAG 2.0 to 2.2 A and AA rules. Colour contrast is off here only because
 * jsdom has no layout or paint to measure; the tokens it would check are
 * the design system's, audited there.
 */
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { seasonTheme, type SeasonRecap, type SquadView } from '@aquazerofit/shared';
import { SEASON, campWith, recordWith, renderWithClient } from './testUtils';

const mocks = vi.hoisted(() => ({ api: vi.fn(), restoreSession: vi.fn(async () => false) }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
  restoreSession: mocks.restoreSession,
}));
vi.mock('@/lib/growth', () => ({ trackGrowth: vi.fn() }));
vi.mock('@/lib/effortCard', async (original) => ({
  ...(await original<typeof import('@/lib/effortCard')>()),
  renderEffortCard: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

import SquadPage from '@/pages/squad/Squad';
import SquadJoinPage from '@/pages/squad/SquadJoin';
import FightRecordPage from '@/pages/fightRecord/FightRecord';
import RecapPage from '@/pages/fightRecord/Recap';
import { ShareKitSheet } from './ShareKitSheet';
import { tokenStore } from '@/lib/api';

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  tokenStore.clear();
});

async function expectAccessible(root: Element = document.body): Promise<void> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

const SQUAD: SquadView = {
  id: 'sqd-1',
  name: 'Corner Crew',
  seasonNumber: SEASON.number,
  inviteCode: 'SQD-ABC2345678',
  inviteUrl: 'https://aquazerofit.com/s/SQD-ABC2345678',
  tgStartParam: 'sq_SQD-ABC2345678',
  isCorner: false,
  weekStart: '2027-03-15',
  members: [
    { ref: 'm_aaaaaaaaaaaa', displayName: 'Mia', isMe: true, role: 'owner', beltTier: 'blue', weekActiveDays: 4, cheeredToday: false, welcome: false },
    { ref: 'm_bbbbbbbbbbbb', displayName: 'Rizal', isMe: false, role: 'member', beltTier: 'white', weekActiveDays: 4, cheeredToday: false, welcome: true },
    { ref: 'm_cccccccccccc', displayName: 'Jay', isMe: false, role: 'member', beltTier: null, weekActiveDays: 0, cheeredToday: true, welcome: false },
    { ref: 'm_dddddddddddd', displayName: 'Grace', isMe: false, role: 'member', beltTier: 'purple', weekActiveDays: null, cheeredToday: false, welcome: false },
  ],
  me: { ref: 'm_aaaaaaaaaaaa', showStats: false, role: 'owner' },
};

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

/** Every Fight Camp part on, for an adult in a squad with cheers waiting. */
const CAMP = campWith({
  enrolment: { enrolled: false, prompt: 'primary' },
  grace: { banked: 1, nextEarnInActiveDays: 4, lastApplied: null, standingBy: false },
  squads: { current: { id: SQUAD.id, name: SQUAD.name } },
  cheers: { unseen: 2 },
  shareKit: { firstName: 'Mia' },
  recap: { seasonNumber: 2, seasonName: 'Ground Game' },
});

function serveAll(squad: SquadView | null): void {
  mocks.api.mockImplementation(async (path: string) => {
    if (path === '/fight-record') return { fightRecord: recordWith(), fightCamp: CAMP };
    if (path === '/squads/current') return { squad };
    if (path.startsWith('/squads/peek/')) return { squad: { name: 'Corner Crew', memberCount: 4, seasonName: SEASON.name, full: false } };
    if (path === '/cheers') {
      return {
        cheers: [
          { id: 'c-coach', from: { kind: 'coach', coachName: 'Akin Celsus', automated: true }, cheer: 'glove', createdAt: '2027-03-17T09:00:00.000Z', seen: false },
          { id: 'c-mate', from: { kind: 'member', displayName: 'Rizal' }, cheer: 'fire', createdAt: '2027-03-17T08:00:00.000Z', seen: true },
        ],
        nextCursor: null,
      };
    }
    if (path === '/share/links') {
      return { shareLink: { code: 'AbCdEfGh', url: 'https://aquazerofit.com/r/AbCdEfGh', tgStartParam: 'sh_AbCdEfGh' } };
    }
    if (path === '/share/summary') return { summary: { joined: 2, inYourSquad: ['Rizal'] } };
    if (path.startsWith('/fight-camp/recap/')) return { recap: RECAP };
    return undefined;
  });
}

function renderAt(path: string) {
  return renderWithClient(
    <Routes>
      <Route path="/squad" element={<SquadPage />} />
      <Route path="/s/:code" element={<SquadJoinPage />} />
      <Route path="/fight-record" element={<FightRecordPage />} />
      <Route path="/fight-record/recap/:seasonNumber" element={<RecapPage />} />
    </Routes>,
    path,
  );
}

describe('Phase 1 screens pass axe (WCAG 2.2 A and AA)', () => {
  it('/squad with no squad yet', async () => {
    serveAll(null);
    renderAt('/squad');
    await screen.findByRole('heading', { name: 'Start a squad' });
    await expectAccessible();
  });

  it('/squad as the owner, with a welcome prompt and cheers', async () => {
    serveAll(SQUAD);
    renderAt('/squad');
    await screen.findByRole('heading', { name: 'Corner Crew' });
    await screen.findByText(/just joined/);
    await expectAccessible();
  });

  it('the invite landing', async () => {
    serveAll(SQUAD);
    renderAt('/s/SQD-ABC2345678');
    await screen.findByRole('heading', { name: 'Corner Crew' });
    await expectAccessible();
  });

  it('/fight-record with every Fight Camp part on', async () => {
    serveAll(SQUAD);
    renderAt('/fight-record');
    await screen.findByText('Coach Akin Celsus');
    await expectAccessible();
  });

  it('the Share Kit sheet', async () => {
    serveAll(SQUAD);
    renderWithClient(
      <ShareKitSheet
        open
        onClose={() => undefined}
        accentId={seasonTheme(SEASON.number).accentId}
        card={{ kind: 'season', season: SEASON, accent: seasonTheme(SEASON.number).accent, belt: 'blue', activeDays: 14 }}
      />,
    );
    await screen.findByRole('img');
    await screen.findByText(/2 people joined from your cards/);
    await expectAccessible();
  });

  it('the season recap', async () => {
    serveAll(SQUAD);
    renderAt('/fight-record/recap/2');
    await screen.findByText('Days you showed up');
    await expectAccessible();
  });
});
