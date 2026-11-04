// @vitest-environment jsdom
/**
 * Squad page and invite landing (AZF-P1 US-C1, C2, C5, C6, B1, §8.4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { BANNED_COPY, SQUAD_CONSENT_TEXT, type SquadView } from '@aquazerofit/shared';
import { campWith, recordWith, renderWithClient } from '@/components/fightCamp/testUtils';

const mocks = vi.hoisted(() => ({ api: vi.fn(), restoreSession: vi.fn(async () => false) }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
  restoreSession: mocks.restoreSession,
}));

import SquadPage from './Squad';
import SquadJoinPage from './SquadJoin';
import { tokenStore } from '@/lib/api';

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  tokenStore.clear();
});

const SQUAD: SquadView = {
  id: 'sqd-1',
  name: 'Corner Crew',
  seasonNumber: 3,
  inviteCode: 'SQD-ABC234',
  inviteUrl: 'https://aquazerofit.com/s/SQD-ABC234',
  tgStartParam: 'sq_SQD-ABC234',
  isCorner: false,
  weekStart: '2027-03-15',
  members: [
    { ref: 'm_aaaaaaaaaaaa', displayName: 'Mia', isMe: true, role: 'owner', beltTier: 'blue', weekActiveDays: 4 },
    { ref: 'm_bbbbbbbbbbbb', displayName: 'Rizal', isMe: false, role: 'member', beltTier: 'white', weekActiveDays: 4 },
    { ref: 'm_cccccccccccc', displayName: 'Jay', isMe: false, role: 'member', beltTier: null, weekActiveDays: 0 },
    { ref: 'm_dddddddddddd', displayName: 'Grace', isMe: false, role: 'member', beltTier: 'purple', weekActiveDays: null },
  ],
  me: { ref: 'm_aaaaaaaaaaaa', showStats: false },
};

type Calls = Array<{ path: string; method: string; body?: unknown; query?: unknown }>;

function serveSquad(squad: SquadView | null, available = true): Calls {
  const calls: Calls = [];
  let current = squad;
  mocks.api.mockImplementation(async (path: string, options: { method?: string; body?: unknown; query?: unknown } = {}) => {
    calls.push({ path, method: options.method ?? 'GET', body: options.body, query: options.query });
    if (path === '/fight-record') {
      return {
        fightRecord: recordWith(),
        fightCamp: campWith({ squads: available ? { current: current ? { id: current.id, name: current.name } : null } : null }),
      };
    }
    if (path === '/squads/current') return { squad: current };
    if (path === '/squads' && options.method === 'POST') {
      current = { ...SQUAD, name: (options.body as { name: string }).name, members: [SQUAD.members[0]!] };
      return { squad: current };
    }
    if (path === `/squads/${SQUAD.id}/me`) {
      return { member: { ...SQUAD.members[0]!, weekActiveDays: 4 } };
    }
    if (path === `/squads/${SQUAD.id}/leave`) {
      current = null;
      return undefined;
    }
    return null;
  });
  return calls;
}

function renderPage(path = '/squad') {
  return renderWithClient(
    <Routes>
      <Route path="/squad" element={<SquadPage />} />
      <Route path="/s/:code" element={<SquadJoinPage />} />
      <Route path="/sign-in" element={<p>Sign-in screen</p>} />
      <Route path="/" element={<p>Home</p>} />
    </Routes>,
    path,
  );
}

describe('SquadPage', () => {
  it('sends a person home when squads are not available to them', async () => {
    serveSquad(null, false);
    renderPage();
    expect(await screen.findByText('Home')).toBeTruthy();
  });

  it('asks for consent before creating, and sends it', async () => {
    const calls = serveSquad(null);
    renderPage();
    fireEvent.change(await screen.findByLabelText('Squad name'), { target: { value: 'Night Owls' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start a squad' }));
    const sheet = await screen.findByRole('dialog');
    expect(sheet.textContent).toContain(SQUAD_CONSENT_TEXT);
    expect(calls.some((c) => c.path === '/squads')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Agree and start' }));
    expect(await screen.findByRole('heading', { name: 'Night Owls' })).toBeTruthy();
    expect(calls.find((c) => c.path === '/squads')?.body).toEqual({ name: 'Night Owls', consent: true });
  });

  it('shows the week board: ties share a rank, nobody is last, hidden stays hidden', async () => {
    serveSquad(SQUAD);
    const { container } = renderPage();
    const board = await screen.findByRole('list', { name: 'Showed up this week' });
    expect(board.textContent).toContain('Mia');
    expect(board.textContent).toContain('Rizal');
    const ranks = [...board.querySelectorAll('li')].map((li) => li.firstElementChild?.textContent);
    expect(ranks).toEqual(['1', '1']);
    expect(screen.getByText('Warming up')).toBeTruthy();
    expect(screen.getByText('Numbers hidden')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getByText('Purple Belt')).toBeTruthy();
    expect(screen.getByText('No belt yet')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(BANNED_COPY);
    expect(text).not.toMatch(/kcal|calorie|\bkg\b|weight/i);
  });

  it('toggles "Show my numbers" as a switch', async () => {
    const calls = serveSquad(SQUAD);
    renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Show my numbers' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ showStats: true });
  });

  it('confirms before leaving, then shows the create and join forms', async () => {
    const calls = serveSquad(SQUAD);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Leave squad' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog.querySelector('button.cta-gradient')!);
    expect(await screen.findByLabelText('Invite code')).toBeTruthy();
    expect(calls.some((c) => c.path === `/squads/${SQUAD.id}/leave`)).toBe(true);
  });
});

describe('SquadJoinPage', () => {
  function servePeek(squad: object | null) {
    const calls: Calls = [];
    mocks.api.mockImplementation(async (path: string, options: { method?: string; body?: unknown; query?: unknown } = {}) => {
      calls.push({ path, method: options.method ?? 'GET', body: options.body, query: options.query });
      if (path.startsWith('/squads/peek/')) return { squad };
      if (path === '/squads/join') return { squad: SQUAD };
      if (path === '/fight-record') return { fightRecord: null };
      if (path === '/squads/current') return { squad: SQUAD };
      return null;
    });
    return calls;
  }

  it('says plainly when an invite matches no squad', async () => {
    servePeek(null);
    renderPage('/s/SQD-ABC234');
    expect(await screen.findByText('This invite has no squad behind it')).toBeTruthy();
    cleanup();
    renderPage('/s/not-a-code');
    expect(await screen.findByText('This invite has no squad behind it')).toBeTruthy();
  });

  it('previews the squad without names and asks a visitor to sign in first', async () => {
    servePeek({ name: 'Corner Crew', memberCount: 3, seasonName: 'Second Wind', full: false });
    renderPage('/s/SQD-ABC234');
    expect(await screen.findByRole('heading', { name: 'Corner Crew' })).toBeTruthy();
    expect(screen.getByText('3 of 5 members · Second Wind')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to join' }));
    expect(await screen.findByText('Sign-in screen')).toBeTruthy();
  });

  it('shows a full squad as full', async () => {
    servePeek({ name: 'Corner Crew', memberCount: 5, seasonName: 'Second Wind', full: true });
    renderPage('/s/SQD-ABC234');
    expect(await screen.findByText('This squad is full. Squads have room for five.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull();
  });

  it('joins a signed-in visitor by link after showing the consent', async () => {
    tokenStore.set({ accessToken: 'header.payload.signature' });
    const calls = servePeek({ name: 'Corner Crew', memberCount: 2, seasonName: 'Second Wind', full: false });
    renderPage('/s/SQD-ABC234');
    expect(await screen.findByText(SQUAD_CONSENT_TEXT)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Agree and join' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/squads/join')).toBe(true));
    const joined = calls.find((c) => c.path === '/squads/join')!;
    expect(joined.body).toEqual({ code: 'SQD-ABC234', consent: true });
    expect(joined.query).toEqual({ via: 'link' });
  });
});
