// @vitest-environment jsdom
/**
 * Cheers on the web (AZF-P1 US-D1, US-D2 AC2, US-D3 AC2).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { BANNED_COPY, type SquadMemberView } from '@aquazerofit/shared';
import { campWith, recordWith, renderWithClient, serve } from './testUtils';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));

import { CheerButton, CheersInbox } from './Cheers';
import { SeasonCard } from '@/components/fightRecord/SeasonCard';
import NotificationSettings from '@/pages/settings/NotificationSettings';
import SquadPage from '@/pages/squad/Squad';
import { tokenStore } from '@/lib/api';

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  tokenStore.clear();
});

const RIZAL: SquadMemberView = {
  ref: 'm_bbbbbbbbbbbb',
  displayName: 'Rizal',
  isMe: false,
  role: 'member',
  beltTier: 'white',
  weekActiveDays: null,
  cheeredToday: false,
  welcome: false,
};

describe('CheerButton', () => {
  it('offers five fixed cheers, each named for who it goes to', async () => {
    mocks.api.mockResolvedValue({ cheer: { id: 'c1', cheer: 'fire', createdAt: '' } });
    renderWithClient(<CheerButton member={RIZAL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cheer Rizal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cheer Rizal' });
    const options = ['glove', 'fire', 'muscle', 'clap', 'water'].map((kind) =>
      screen.getByRole('button', { name: `Send ${kind} cheer to Rizal` }),
    );
    expect(options).toHaveLength(5);
    expect(dialog.querySelector('input, textarea')).toBeNull();
    fireEvent.click(options[1]!);
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/cheers', { method: 'POST', body: { to: 'm_bbbbbbbbbbbb', cheer: 'fire' } }),
    );
  });

  it('says "Sent today" once a cheer is out', () => {
    renderWithClient(<CheerButton member={{ ...RIZAL, cheeredToday: true }} />);
    expect(screen.getByText('Sent today')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cheer Rizal' })).toBeNull();
  });
});

describe('the just-joined prompt', () => {
  it('offers one cheer for a new squad mate, and is gone once sent', async () => {
    const squad = {
      id: 'sqd-1',
      name: 'Corner Crew',
      seasonNumber: 3,
      inviteCode: 'SQD-ABC2345678',
      inviteUrl: 'https://aquazerofit.com/s/SQD-ABC2345678',
      tgStartParam: 'sq_SQD-ABC2345678',
      isCorner: false,
      weekStart: '2027-03-15',
      members: [
        { ...RIZAL, ref: 'm_aaaaaaaaaaaa', displayName: 'Mia', isMe: true, role: 'owner' as const },
        { ...RIZAL, welcome: true },
      ],
      me: { ref: 'm_aaaaaaaaaaaa', showStats: false, role: 'owner' as const },
    };
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/fight-record') {
        return { fightRecord: recordWith(), fightCamp: campWith({ squads: { current: { id: 'sqd-1', name: 'Corner Crew' } }, cheers: { unseen: 0 } }) };
      }
      if (path === '/squads/current') return { squad };
      if (path === '/cheers') return { cheer: { id: 'c1', cheer: 'clap', createdAt: '' } };
      return null;
    });
    renderWithClient(<SquadPage />);
    expect(await screen.findByText('just joined. Send a cheer?', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cheer Rizal' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Send clap cheer to Rizal' }));
    await waitFor(() => expect(screen.queryByText('just joined. Send a cheer?', { exact: false })).toBeNull());
  });
});

describe('CheersInbox', () => {
  it('says where cheers will appear before there are any', async () => {
    mocks.api.mockResolvedValue({ cheers: [], nextCursor: null });
    renderWithClient(<CheersInbox />);
    expect(await screen.findByText('Cheers from your squad show up here.')).toBeTruthy();
  });

  it('labels a coach cheer automated, every time, and marks what it showed as seen', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/cheers') {
        return {
          cheers: [
            { id: 'c-coach', from: { kind: 'coach', coachName: 'Akin Celsus', automated: true }, cheer: 'glove', createdAt: '2027-03-17T09:00:00.000Z', seen: false },
            { id: 'c-mate', from: { kind: 'member', displayName: 'Rizal' }, cheer: 'fire', createdAt: '2027-03-17T08:00:00.000Z', seen: true },
          ],
          nextCursor: null,
        };
      }
      return undefined;
    });
    const { container } = renderWithClient(<CheersInbox />);
    expect(await screen.findByText('Coach Akin Celsus')).toBeTruthy();
    expect(screen.getAllByText('Automated')).toHaveLength(1);
    expect(screen.getByText('Rizal')).toBeTruthy();
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/cheers/seen', { method: 'POST', body: { ids: ['c-coach'] } }),
    );
    expect(container.textContent ?? '').not.toMatch(BANNED_COPY);
  });
});

describe('the season card', () => {
  it('points to new cheers, and says nothing when there are none', async () => {
    serve(mocks.api, { fightRecord: recordWith(), fightCamp: campWith({ cheers: { unseen: 2 } }) });
    renderWithClient(<SeasonCard />);
    expect(await screen.findByRole('button', { name: /2 new cheers from your squad/ })).toBeTruthy();
    cleanup();
    serve(mocks.api, { fightRecord: recordWith(), fightCamp: campWith({ cheers: { unseen: 0 } }) });
    renderWithClient(<SeasonCard />);
    await screen.findByText('Season 3');
    expect(screen.queryByText(/new cheer/)).toBeNull();
  });
});

describe('the cheer message setting', () => {
  it('shows only with cheers on, and saves to the server', async () => {
    tokenStore.set({ accessToken: 'header.payload.signature' });
    mocks.api.mockImplementation(async (path: string, options: { method?: string; body?: unknown } = {}) => {
      if (path === '/fight-record') return { fightRecord: recordWith(), fightCamp: campWith({ cheers: { unseen: 0 } }) };
      if (path === '/me/consents') {
        return { consents: { wellnessDataProcessing: true, aiPersonalisation: false, anonymisedAnalytics: false, reminders: true, updatedAt: '' } };
      }
      if (path === '/cheers/nudges') return { nudges: options.method === 'PUT' ? options.body : { cheer: true } };
      return null;
    });
    renderWithClient(<NotificationSettings />);
    const toggle = await screen.findByRole('switch', { name: 'Cheers from your squad' });
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/cheers/nudges', { method: 'PUT', body: { cheer: false } }),
    );
  });
});
