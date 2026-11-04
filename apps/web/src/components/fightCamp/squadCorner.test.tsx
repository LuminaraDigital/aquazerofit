// @vitest-environment jsdom
/**
 * Squad Corner, Telegram invites and `startapp=sq_` routing (AZF-P1 US-C2 to C4).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { SQUAD_CONSENT_TEXT } from '@aquazerofit/shared';
import { campWith, recordWith, renderWithClient } from './testUtils';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  isTMA: vi.fn(() => true),
  launchedFromGroup: vi.fn(() => true),
  getTelegramInitData: vi.fn(() => 'signed-init-data'),
  shareMessage: vi.fn(async () => true),
  openTelegramLink: vi.fn(),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));
vi.mock('@/lib/telegram', async (original) => ({
  ...(await original<typeof import('@/lib/telegram')>()),
  isTMA: mocks.isTMA,
  launchedFromGroup: mocks.launchedFromGroup,
  getTelegramInitData: mocks.getTelegramInitData,
  shareMessage: mocks.shareMessage,
  openTelegramLink: mocks.openTelegramLink,
}));

import { SquadCornerSheet } from './SquadCornerSheet';
import SquadPage from '@/pages/squad/Squad';
import { fightCampStartPath } from '@/lib/startApp';

type Call = { path: string; body?: unknown };

function serve(corner: object, squad: object | null = null): Call[] {
  const calls: Call[] = [];
  mocks.api.mockImplementation(async (path: string, options: { body?: unknown } = {}) => {
    calls.push({ path, body: options.body });
    if (path === '/fight-record') {
      return { fightRecord: recordWith(), fightCamp: campWith({ squads: { current: null } }) };
    }
    if (path === '/squads/corner') {
      const action = (options.body as { action: string }).action;
      return { corner: action === 'peek' ? corner : { state: 'member', squad: null } };
    }
    if (path === '/squads/current') return { squad };
    if (path.endsWith('/invite-message')) return { preparedMessageId: 'prep-1' };
    return null;
  });
  return calls;
}

function renderSheet() {
  return renderWithClient(
    <Routes>
      <Route path="/" element={<SquadCornerSheet />} />
      <Route path="/squad" element={<p>Squad page</p>} />
    </Routes>,
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  mocks.isTMA.mockReturnValue(true);
  mocks.launchedFromGroup.mockReturnValue(true);
  mocks.shareMessage.mockClear();
  mocks.openTelegramLink.mockClear();
});

describe('fightCampStartPath', () => {
  it('opens a squad invite and leaves every other payload alone', () => {
    expect(fightCampStartPath('sq_SQD-ABC2345678')).toBe('/s/SQD-ABC2345678');
    expect(fightCampStartPath('sq_sqd-abc2345678')).toBe('/s/SQD-ABC2345678');
    expect(fightCampStartPath('sq_SQD-ABC234')).toBeNull();
    expect(fightCampStartPath('r-abc__c-AQUA-ABCDEF')).toBeNull();
    expect(fightCampStartPath(null)).toBeNull();
  });
});

describe('SquadCornerSheet', () => {
  it('offers to start the group’s corner and creates it with consent', async () => {
    const calls = serve({ state: 'none', squad: null });
    renderSheet();
    expect(await screen.findByRole('dialog', { name: "Start this group's Squad Corner" })).toBeTruthy();
    expect(screen.getByText(SQUAD_CONSENT_TEXT)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Squad name'), { target: { value: 'Gym Crew' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agree and start' }));
    expect(await screen.findByText('Squad page')).toBeTruthy();
    expect(calls.find((c) => (c.body as { action?: string })?.action === 'create')?.body).toEqual({
      action: 'create',
      tgInitData: 'signed-init-data',
      name: 'Gym Crew',
      consent: true,
    });
  });

  it('offers to join a corner with room', async () => {
    serve({ state: 'joinable', squad: { name: 'Gym Crew', memberCount: 2, seasonName: 'Second Wind', full: false } });
    renderSheet();
    expect(await screen.findByRole('dialog', { name: 'Join Gym Crew' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agree and join' })).toBeTruthy();
  });

  it('asks once a session, and never outside a group launch', async () => {
    let calls = serve({ state: 'member', squad: null });
    renderSheet();
    await waitFor(() => expect(calls.some((c) => c.path === '/squads/corner')).toBe(true));
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();

    calls = serve({ state: 'none', squad: null });
    renderSheet();
    await waitFor(() => expect(calls.some((c) => c.path === '/fight-record')).toBe(true));
    expect(calls.some((c) => c.path === '/squads/corner')).toBe(false);
    cleanup();

    sessionStorage.clear();
    mocks.launchedFromGroup.mockReturnValue(false);
    calls = serve({ state: 'none', squad: null });
    renderSheet();
    await waitFor(() => expect(calls.some((c) => c.path === '/fight-record')).toBe(true));
    expect(calls.some((c) => c.path === '/squads/corner')).toBe(false);
  });
});

describe('Invite to squad in the Mini App', () => {
  const squad = {
    id: 'sqd-1',
    name: 'Gym Crew',
    seasonNumber: 3,
    inviteCode: 'SQD-ABC2345678',
    inviteUrl: 'https://aquazerofit.com/s/SQD-ABC2345678',
    tgStartParam: 'sq_SQD-ABC2345678',
    isCorner: true,
    weekStart: '2027-03-15',
    members: [{ ref: 'm_aaaaaaaaaaaa', displayName: 'Rizal', isMe: true, role: 'owner', beltTier: null, weekActiveDays: 1 }],
    me: { ref: 'm_aaaaaaaaaaaa', showStats: false, role: 'owner' as const },
  };

  it('sends a prepared message through Telegram’s chooser', async () => {
    serve({ state: 'member', squad: null }, squad);
    renderWithClient(<SquadPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite to squad' }));
    await waitFor(() => expect(mocks.shareMessage).toHaveBeenCalledWith('prep-1'));
    expect(mocks.openTelegramLink).not.toHaveBeenCalled();
  });

  it('falls back to a share link when the client cannot send one', async () => {
    mocks.shareMessage.mockResolvedValueOnce(false);
    serve({ state: 'member', squad: null }, squad);
    renderWithClient(<SquadPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite to squad' }));
    await waitFor(() => expect(mocks.openTelegramLink).toHaveBeenCalled());
    const url = mocks.openTelegramLink.mock.calls[0]![0] as string;
    expect(url).toMatch(/^https:\/\/t\.me\/share\/url\?url=/);
    expect(decodeURIComponent(url)).toContain('startapp=sq_SQD-ABC2345678');
  });
});
