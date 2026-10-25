/**
 * S8 Share Kit links and attribution over HTTP (AZF-P1 US-F1, US-F3, §5.3).
 *
 * The clock is pinned (Date only) because attribution is only for accounts
 * under a day old.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');
const { getStore } = await import('../platform/store');
const { engageRepo } = await import('../modules/fightCamp/repo');
const { config } = await import('../platform/config');

let h: FightCampHarness;
const DAY = addDays(SEASON_ONE_STARTS_ON, 9);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${DAY}T09:00:00.000Z`));
  h = await fightCampHarness('fc-share');
});

afterEach(() => h.disableAll());

afterAll(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

const link = (who: Person, kind: string) => request(h.app).post(`${h.base}/share/links`).set(who.auth()).send({ kind });
const claim = (who: Person, code: string, surface = 'web') =>
  request(h.app).post(`${h.base}/share/attributions`).set(who.auth()).send({ code, surface });
const land = (code: string, query = '') => request(h.app).get(`${h.base}/share/r/${code}${query}`).redirects(0);

function backdate(person: Person, hours: number): void {
  const user = getStore().byId<{ id: string; createdAt: string }>('users', person.userId)!;
  getStore().upsert('users', { ...user, createdAt: new Date(Date.now() - hours * 3_600_000).toISOString() });
}

describe('with the Share Kit off', () => {
  it('answers 404 for links, and sends a public visitor home without a ref', async () => {
    const mia = await h.register('Mia');
    expect((await link(mia, 'belt')).status).toBe(404);
    const res = await land('AbCdEfGh');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${config.appPublicUrl}/`);
  });
});

describe('share links (US-F3 AC1)', () => {
  it('reuses one 8-character link per kind and season', async () => {
    h.enable('shareKit');
    const mia = await h.register('Mia');
    const first = await link(mia, 'belt');
    expect(first.status).toBe(200);
    const { code, url, tgStartParam } = first.body.shareLink;
    expect(code).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(url).toBe(`${config.appPublicUrl}/r/${code}`);
    expect(tgStartParam).toBe(`sh_${code}`);
    expect((await link(mia, 'belt')).body.shareLink.code).toBe(code);
    expect((await link(mia, 'week')).body.shareLink.code).not.toBe(code);
    expect((await link(mia, 'trophy')).status).toBe(400);
    expect(JSON.stringify(first.body)).not.toContain(mia.userId);
  });

  it('keeps share surfaces away from minors', async () => {
    h.enable('shareKit');
    const teen = await h.register('Teen', { age: 16 });
    expect((await link(teen, 'belt')).status).toBe(403);
  });
});

describe('landing', () => {
  it('redirects to the landing page with the ref, and only that', async () => {
    h.enable('shareKit');
    const mia = await h.register('Mia');
    const { code } = (await link(mia, 'season')).body.shareLink;
    const res = await land(code);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${config.appPublicUrl}/?ref=sh_${code}`);
    expect((await land('Zz000000')).headers.location).toBe(`${config.appPublicUrl}/`);
    expect((await land('not a code')).headers.location).toBe(`${config.appPublicUrl}/`);
    // The Mini App reports its own launch without being redirected anywhere.
    expect((await land(code, '?surface=tma')).status).toBe(204);
  });
});

describe('attribution (US-F3 AC2, AC3)', () => {
  it('credits a new account to the link it came through, once, first touch wins', async () => {
    h.enable('shareKit');
    const inviter = await h.register('Inviter');
    const { code } = (await link(inviter, 'belt')).body.shareLink;
    const other = await h.register('Other');
    const { code: otherCode } = (await link(other, 'belt')).body.shareLink;

    const invitee = await h.register('Invitee');
    expect((await claim(invitee, code)).status).toBe(204);
    expect((await claim(invitee, otherCode, 'tma')).status).toBe(204);
    expect((await engageRepo().exportUser(invitee.userId)).attribution).toEqual(
      expect.objectContaining({ shareCode: code, surface: 'web' }),
    );
    const summary = await request(h.app).get(`${h.base}/share/summary`).set(inviter.auth());
    expect(summary.body).toEqual({ summary: { joined: 1, inYourSquad: [] } });
  });

  it('ignores an account older than a day, a person’s own link and an unknown code, silently', async () => {
    h.enable('shareKit');
    const inviter = await h.register('Inviter');
    const { code } = (await link(inviter, 'belt')).body.shareLink;
    const old = await h.register('Old');
    backdate(old, 30);
    expect((await claim(old, code)).status).toBe(204);
    expect((await claim(inviter, code)).status).toBe(204);
    const fresh = await h.register('Fresh');
    expect((await claim(fresh, 'Zz000000')).status).toBe(204);
    for (const who of [old, inviter, fresh]) {
      expect((await engageRepo().exportUser(who.userId)).attribution).toBeNull();
    }
    expect((await claim(fresh, 'short')).status).toBe(400);
  });

  it('names invitees only once they are in your squad', async () => {
    h.enable('shareKit', 'squads');
    const inviter = await h.register('Inviter');
    const { code } = (await link(inviter, 'squad_invite')).body.shareLink;
    const made = await request(h.app).post(`${h.base}/squads`).set(inviter.auth()).send({ name: 'Corner Crew', consent: true });
    const a = await h.register('Ana');
    const b = await h.register('Bo');
    await claim(a, code);
    await claim(b, code);
    vi.setSystemTime(Date.now() + 1000);
    await request(h.app).post(`${h.base}/squads/join`).set(a.auth()).send({ code: made.body.squad.inviteCode, consent: true });
    const summary = await request(h.app).get(`${h.base}/share/summary`).set(inviter.auth());
    expect(summary.body).toEqual({ summary: { joined: 2, inYourSquad: ['Ana'] } });
  });

  it('keeps the summary to adults, and never credits a known minor', async () => {
    h.enable('shareKit');
    const inviter = await h.register('Inviter');
    const { code } = (await link(inviter, 'belt')).body.shareLink;
    const teen = await h.register('Teen', { age: 16 });
    const unknown = await h.register('Newish', { age: null });
    await claim(teen, code);
    await claim(unknown, code);
    expect((await engageRepo().exportUser(teen.userId)).attribution).toBeNull();
    // An age not given yet still counts: onboarding asks for it after sign-up.
    expect((await engageRepo().exportUser(unknown.userId)).attribution).toEqual(expect.objectContaining({ shareCode: code }));
    h.setAge(inviter.userId, 17);
    expect((await request(h.app).get(`${h.base}/share/summary`).set(inviter.auth())).status).toBe(403);
  });

  it('credits a new account that joins through a squad invite link to that squad', async () => {
    h.enable('shareKit', 'squads');
    const owner = await h.register('Owner');
    const made = await request(h.app).post(`${h.base}/squads`).set(owner.auth()).send({ name: 'Corner Crew', consent: true });
    const joiner = await h.register('Joiner');
    vi.setSystemTime(Date.now() + 1000);
    await request(h.app)
      .post(`${h.base}/squads/join?via=link&surface=tma`)
      .set(joiner.auth())
      .send({ code: made.body.squad.inviteCode, consent: true });
    expect((await engageRepo().exportUser(joiner.userId)).attribution).toEqual(
      expect.objectContaining({ shareCode: null, squadId: made.body.squad.id, surface: 'tma' }),
    );
  });

  it('never fails a join that worked because its attribution could not be written', async () => {
    h.enable('shareKit', 'squads');
    const owner = await h.register('Owner');
    const made = await request(h.app).post(`${h.base}/squads`).set(owner.auth()).send({ name: 'Corner Crew', consent: true });
    const joiner = await h.register('Joiner');
    vi.setSystemTime(Date.now() + 1000);
    const spy = vi.spyOn(engageRepo(), 'attribute').mockRejectedValueOnce(new Error('database away'));
    try {
      const res = await request(h.app)
        .post(`${h.base}/squads/join?via=link`)
        .set(joiner.auth())
        .send({ code: made.body.squad.inviteCode, consent: true });
      expect(res.status).toBe(200);
      expect(res.body.squad.id).toBe(made.body.squad.id);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('story captions and art (US-F2)', () => {
  it('never runs past 200 characters and always keeps the link whole', async () => {
    const { STORY_CAPTION_MAX_CHARS, storyCaption } = await import('@aquazerofit/shared');
    const linkText = 't.me/AquaZeroFitBot/app?startapp=sh_AbCdEfGh';
    for (const length of [0, 10, 150, 154, 155, 156, 400]) {
      const caption = storyCaption('x'.repeat(length), linkText);
      expect(caption.length).toBeLessThanOrEqual(STORY_CAPTION_MAX_CHARS);
      expect(caption.endsWith(linkText)).toBe(true);
    }
    // Telegram counts UTF-16 units: an emoji is two, and is never cut in half.
    for (const text of ['🔥'.repeat(120), `${'x'.repeat(151)}🔥🔥`, '🔥'.repeat(76)]) {
      const caption = storyCaption(text, linkText);
      expect(caption.length).toBeLessThanOrEqual(STORY_CAPTION_MAX_CHARS);
      expect(caption.endsWith(linkText)).toBe(true);
      expect(caption).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(storyCaption('Blue Belt, Season 1 on AquaZeroFit.', linkText)).toBe(
      `Blue Belt, Season 1 on AquaZeroFit. ${linkText}`,
    );
    expect(storyCaption('y'.repeat(300), linkText)).toMatch(/…\s/);
  });

  it('names static art by kind, belt and season accent, with no belt on week and invite cards', async () => {
    const { storyArtPath } = await import('@aquazerofit/shared');
    expect(storyArtPath('belt', 'blue', 'red')).toBe('/share/story/belt-blue-red.png');
    expect(storyArtPath('season', null, 'gold')).toBe('/share/story/season-none-gold.png');
    expect(storyArtPath('belt', null, 'gold')).toBe('/share/story/season-none-gold.png');
    expect(storyArtPath('week', 'black', 'teal')).toBe('/share/story/week-none-teal.png');
    expect(storyArtPath('squad_invite', 'white', 'blue')).toBe('/share/story/squad_invite-none-blue.png');
  });
});
