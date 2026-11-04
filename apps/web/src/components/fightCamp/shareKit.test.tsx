// @vitest-environment jsdom
/**
 * Share Kit on the web (AZF-P1 US-F1 to US-F3, §6.2).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  BELT_TIERS,
  SEASON_ACCENTS,
  SHARE_KINDS_P1,
  STORY_CAPTION_MAX_CHARS,
  seasonTheme,
  storyArtPath,
} from '@aquazerofit/shared';
import { SEASON, renderWithClient } from './testUtils';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  canShareToStory: vi.fn(() => true),
  shareToStory: vi.fn(() => true),
  track: vi.fn(),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));
vi.mock('@/lib/telegram', async (original) => ({
  ...(await original<typeof import('@/lib/telegram')>()),
  canShareToStory: mocks.canShareToStory,
  shareToStory: mocks.shareToStory,
}));
vi.mock('@/lib/growth', () => ({ trackGrowth: mocks.track }));
vi.mock('@/lib/effortCard', async (original) => ({
  ...(await original<typeof import('@/lib/effortCard')>()),
  // jsdom has no canvas; the drawing is not what these cases are about.
  renderEffortCard: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

import { ANONYMOUS_NAME, effortCard, type EffortCardInput } from '@/lib/effortCard';
import { ShareKitSheet } from './ShareKitSheet';
import { shareCodeIn, useClaimShareAttribution } from '@/lib/startApp';
import { adoptAttribution } from '@/lib/attribution';
import { renderHook } from '@testing-library/react';

const clipboard = { writeText: vi.fn(async () => undefined) };

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  URL.createObjectURL = vi.fn(() => 'blob:card');
  URL.revokeObjectURL = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  mocks.shareToStory.mockClear();
  mocks.track.mockClear();
  clipboard.writeText.mockClear();
});

const base: EffortCardInput = {
  kind: 'season',
  season: SEASON,
  accent: seasonTheme(SEASON.number).accent,
  belt: 'blue',
  activeDays: 14,
  weekActiveDays: 4,
  squadName: 'Corner Crew',
  firstName: null,
  link: 'aquazerofit.com/r/AbCdEfGh',
};

describe('effortCard content', () => {
  it('puts one effort figure on each kind', () => {
    expect(effortCard({ ...base, kind: 'belt' })).toMatchObject({ hero: 'Blue Belt', heroLabel: 'Earned by showing up' });
    expect(effortCard(base)).toMatchObject({ hero: '14', heroLabel: 'active days this season' });
    expect(effortCard({ ...base, kind: 'recap' })).toMatchObject({ hero: '14', heroLabel: 'active days · Blue Belt' });
    expect(effortCard({ ...base, kind: 'week' })).toMatchObject({ hero: '4 of 7', belt: null });
    expect(effortCard({ ...base, kind: 'squad_invite' })).toMatchObject({ hero: 'Corner Crew', heroLabel: 'Join my squad', belt: null });
  });

  it('is anonymous unless the person chooses their first name', () => {
    expect(effortCard(base).name).toBe(ANONYMOUS_NAME);
    expect(effortCard({ ...base, firstName: 'Mia' }).name).toBe('Mia');
  });

  it('never carries health, food, photo or crypto words, on any kind', () => {
    const forbidden = /\b(kg|lbs?|kcal|calor\w*|weight|bmi|macro\w*|meal|food|photo|body|token|wallet|nft|crypto|mint)\b/i;
    for (const kind of SHARE_KINDS_P1) {
      for (const belt of [null, ...BELT_TIERS]) {
        const card = effortCard({ ...base, kind, belt, firstName: 'Mia' });
        expect(JSON.stringify(card), `${kind}/${belt}`).not.toMatch(forbidden);
        expect(card.alt.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('static story art', () => {
  it('exists, under 400 KB, for every kind, belt and accent the app can ask for', () => {
    const publicDir = path.resolve(__dirname, '..', '..', '..', 'public');
    for (const kind of SHARE_KINDS_P1) {
      for (const belt of [null, ...BELT_TIERS]) {
        for (const accent of SEASON_ACCENTS) {
          const file = path.join(publicDir, storyArtPath(kind, belt, accent.id));
          expect(fs.existsSync(file), file).toBe(true);
          expect(fs.statSync(file).size).toBeLessThan(400 * 1024);
        }
      }
    }
  });
});

describe('ShareKitSheet', () => {
  function open(props: Partial<Parameters<typeof ShareKitSheet>[0]> = {}) {
    mocks.api.mockImplementation(async (p: string) =>
      p === '/share/links'
        ? { shareLink: { code: 'AbCdEfGh', url: 'https://aquazerofit.com/r/AbCdEfGh', tgStartParam: 'sh_AbCdEfGh' } }
        : null,
    );
    const { kind: _k, ...card } = base;
    return renderWithClient(
      <ShareKitSheet
        open
        onClose={() => undefined}
        accentId={seasonTheme(SEASON.number).accentId}
        firstName="Mia"
        card={{ ...card, kind: 'season' }}
        {...props}
      />,
    );
  }

  it('previews before anything is shared, with the privacy promises locked on', async () => {
    open();
    expect(mocks.track).toHaveBeenCalledWith('share_kit_opened', { kind: 'season' });
    expect(await screen.findByRole('img')).toBeTruthy();
    for (const label of ['No weight', 'No photos', 'No food']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show my first name on the card' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Story', 'Feed', 'X']);
    expect(mocks.shareToStory).not.toHaveBeenCalled();
  });

  it('copies the share link', async () => {
    open();
    const copy = await screen.findByRole('button', { name: 'Copy link' });
    await waitFor(() => expect((copy as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(copy);
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('https://aquazerofit.com/r/AbCdEfGh'));
  });

  it('shares a story with the static art and a caption Telegram will accept', async () => {
    open();
    const story = await screen.findByRole('button', { name: 'Share to Telegram story' });
    await waitFor(() => expect((story as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(story);
    const [mediaUrl, caption] = mocks.shareToStory.mock.calls[0] as unknown as [string, string];
    expect(mediaUrl).toMatch(/\/share\/story\/season-blue-blue\.png$/);
    expect([...caption].length).toBeLessThanOrEqual(STORY_CAPTION_MAX_CHARS);
    expect(caption).toContain('startapp=sh_AbCdEfGh');
    expect(mocks.track).toHaveBeenCalledWith('share_story', { kind: 'season' });
  });

  it('prints a squad invite’s own link instead of a share link', async () => {
    open({ link: { url: 'https://aquazerofit.com/s/SQD-ABC2345678', tgStartParam: 'sq_SQD-ABC2345678' } });
    const copy = await screen.findByRole('button', { name: 'Copy link' });
    fireEvent.click(copy);
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('https://aquazerofit.com/s/SQD-ABC2345678'));
    expect(mocks.api).not.toHaveBeenCalledWith('/share/links', expect.anything());
  });
});

describe('arriving through a share link', () => {
  it('reads only well-formed share codes from a start payload', () => {
    expect(shareCodeIn('sh_AbCdEfGh')).toBe('AbCdEfGh');
    expect(shareCodeIn('sh_short')).toBeNull();
    expect(shareCodeIn('sq_SQD-ABC2345678')).toBeNull();
    expect(shareCodeIn(null)).toBeNull();
  });

  it('claims the attribution once per code after sign-in', async () => {
    adoptAttribution({ ref: 'sh_AbCdEfGh' });
    mocks.api.mockResolvedValue(undefined);
    const { rerender } = renderHook(({ on }) => useClaimShareAttribution(on), { initialProps: { on: false } });
    expect(mocks.api).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/share/attributions', {
        method: 'POST',
        body: { code: 'AbCdEfGh', surface: 'web' },
      }),
    );
    await waitFor(() => expect(localStorage.getItem('azf_share_claim_v1')).toBe('AbCdEfGh'));
    renderHook(() => useClaimShareAttribution(true));
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
});
