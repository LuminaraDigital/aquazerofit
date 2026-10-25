// @vitest-environment jsdom
/**
 * Fight Camp enrolment on the SeasonCard (AZF-P1 US-A1, US-A2).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { BANNED_COPY } from '@aquazerofit/shared';
import { campWith, recordWith, renderWithClient, serve } from './testUtils';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));

import { SeasonCard } from '@/components/fightRecord/SeasonCard';

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
});

describe('SeasonCard with Fight Camp', () => {
  it('renders exactly the R1a card when the fightCamp block is absent', async () => {
    serve(mocks.api, { fightRecord: recordWith() });
    const { container } = renderWithClient(<SeasonCard />);
    expect(await screen.findByText('Season 3')).toBeTruthy();
    expect(screen.queryByText(/Fight Camp/)).toBeNull();
    expect(container.textContent).not.toContain(campWith().theme.coachLine);
  });

  it('offers one primary "Join Fight Camp" action in the fresh-start window and enrols on tap', async () => {
    let enrolled = false;
    mocks.api.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/fight-record') {
        return {
          fightRecord: recordWith(),
          fightCamp: campWith({ enrolment: { enrolled, prompt: 'primary' } }),
        };
      }
      if (path === '/fight-camp/enrolments') {
        expect(options).toMatchObject({ method: 'POST', body: { source: 'dashboard' } });
        enrolled = true;
        return { enrolment: { seasonNumber: 3, seasonName: 'Second Wind', source: 'dashboard', enrolledAt: '' } };
      }
      return null;
    });
    const { container } = renderWithClient(<SeasonCard />);
    const join = await screen.findByRole('button', { name: 'Join Fight Camp: Season 3' });
    expect(screen.getByText(campWith().theme.coachLine)).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(BANNED_COPY);

    fireEvent.click(join);
    const confirmed = await screen.findByText('In Fight Camp for Season 3');
    expect(screen.queryByRole('button', { name: /Join Fight Camp/ })).toBeNull();
    // Focus follows the action that replaced the button, and one tap posted once.
    await waitFor(() => expect(document.activeElement).toBe(confirmed));
    expect(mocks.api.mock.calls.filter(([path]) => path === '/fight-camp/enrolments')).toHaveLength(1);
  });

  it('steps back to a quiet text action after the fresh-start window', async () => {
    serve(mocks.api, {
      fightRecord: recordWith(),
      fightCamp: campWith({ enrolment: { enrolled: false, prompt: 'secondary' } }),
    });
    renderWithClient(<SeasonCard />);
    const join = await screen.findByRole('button', { name: 'Join Fight Camp for Season 3' });
    expect(join.className).not.toContain('cta-gradient');
  });

  it('paints the progress meter in the season accent', async () => {
    serve(mocks.api, { fightRecord: recordWith(), fightCamp: campWith() });
    const { container } = renderWithClient(<SeasonCard />);
    await screen.findByText(campWith().theme.coachLine);
    const fill = container.querySelector('[aria-hidden="true"] > div') as HTMLElement;
    await waitFor(() => expect(fill.style.backgroundColor).not.toBe(''));
  });
});
