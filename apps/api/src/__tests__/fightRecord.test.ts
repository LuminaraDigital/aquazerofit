/**
 * Fight Record domain and service (AZF-W3-05 §3, §7).
 *
 * Three things are pinned here because each one is a promise made to users in
 * copy, and a regression in any of them turns a reward into a punishment:
 *
 *  - a belt depends on which days someone showed up and on nothing else —
 *    not on a weight, a calorie or a macro (GR-01);
 *  - a belt cannot be lost, by a missed day or by a deleted log;
 *  - a celebration is shown once, and a returning user is not walked through
 *    a queue of stale ones.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BELT_LADDER,
  SEASON_LENGTH_DAYS,
  SEASON_NAMES,
  SEASON_ONE_STARTS_ON,
  activeDaysBySeason,
  daysLeftIn,
  seasonByNumber,
  seasonFor,
  type MealLog,
  type WeightLog,
} from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-fight-record-'));
process.env.AZF_DATA_DIR = dataDir;

const { getStore } = await import('../platform/store');
const { addDays } = await import('../platform/dates');
const { activeDatesOf } = await import('../modules/progress/service');
const service = await import('../modules/fightRecord/service');
const { AppError } = await import('../platform/errors');

afterAll(async () => {
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

/** Season 1 runs SEASON_ONE_STARTS_ON .. +55. */
const S1 = SEASON_ONE_STARTS_ON;
const day = (n: number): string => addDays(S1, n);

/** Mulberry32: a seeded PRNG, so the property checks are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function meal(userId: string, localDate: string, kcal: number, i: number): MealLog {
  return {
    id: `ml-${userId}-${localDate}-${i}`,
    userId,
    type: 'mealLog',
    mealType: 'lunch',
    items: [],
    totalKcal: kcal,
    totalProteinG: kcal / 20,
    totalCarbsG: kcal / 10,
    totalFatG: kcal / 30,
    source: 'manual',
    localDate,
    loggedAt: `${localDate}T12:00:00.000Z`,
  };
}

function weight(userId: string, localDate: string, kg: number): WeightLog {
  return {
    id: `wl-${userId}-${localDate}`,
    userId,
    type: 'weightLog',
    weightKg: kg,
    localDate,
    loggedAt: `${localDate}T07:00:00.000Z`,
  } as WeightLog;
}

function seedMeals(userId: string, dates: string[]): void {
  dates.forEach((d, i) => getStore().upsert('logs', meal(userId, d, 500, i)));
}

function beltDocs(userId: string): { id: string; awardedAt: string }[] {
  return getStore().where<{ id: string; type?: string; userId?: string; awardedAt: string }>(
    'logs',
    (d) => d.type === 'beltAward' && d.userId === userId,
  );
}

// ---------------------------------------------------------------------------

describe('season calendar', () => {
  it('starts season 1 on the anchor and gives it exactly SEASON_LENGTH_DAYS dates', () => {
    const s1 = seasonFor(S1);
    expect(s1).toMatchObject({ id: 'season-1', number: 1, name: SEASON_NAMES[0], startsOn: S1 });
    expect(s1.endsOn).toBe(day(SEASON_LENGTH_DAYS - 1));
    expect(seasonFor(day(SEASON_LENGTH_DAYS - 1)).number).toBe(1);
    expect(seasonFor(day(SEASON_LENGTH_DAYS)).number).toBe(2);
    expect(seasonFor(day(SEASON_LENGTH_DAYS)).startsOn).toBe(day(SEASON_LENGTH_DAYS));
  });

  it('rotates names and never answers "no season" before the anchor', () => {
    expect(seasonByNumber(SEASON_NAMES.length + 1).name).toBe(SEASON_NAMES[0]);
    expect(seasonFor(addDays(S1, -400)).number).toBe(1);
    expect(seasonByNumber(0).number).toBe(1);
  });

  it('keeps every season 56 days long across a leap day', () => {
    const containing = seasonFor('2028-02-29');
    const span =
      (Date.parse(`${containing.endsOn}T00:00:00Z`) - Date.parse(`${containing.startsOn}T00:00:00Z`)) /
      86_400_000;
    expect(span).toBe(SEASON_LENGTH_DAYS - 1);
    expect(containing.startsOn <= '2028-02-29' && '2028-02-29' <= containing.endsOn).toBe(true);
  });

  it('counts days left including today, and never more than a season holds', () => {
    const s1 = seasonByNumber(1);
    expect(daysLeftIn(s1, S1)).toBe(SEASON_LENGTH_DAYS);
    expect(daysLeftIn(s1, s1.endsOn)).toBe(1);
    expect(daysLeftIn(s1, addDays(S1, -10))).toBe(SEASON_LENGTH_DAYS);
  });
});

describe('belt ladder', () => {
  it('awards each tier exactly at its threshold and not one day before', () => {
    for (const rung of BELT_LADDER) {
      const below = `fr-rung-${rung.tier}-below`;
      const at = `fr-rung-${rung.tier}-at`;
      seedMeals(below, Array.from({ length: rung.activeDays - 1 }, (_, i) => day(i)));
      seedMeals(at, Array.from({ length: rung.activeDays }, (_, i) => day(i)));
      expect(service.readFightRecord(below, day(55)).current.tier).not.toBe(rung.tier);
      expect(service.readFightRecord(at, day(55)).current.tier).toBe(rung.tier);
    }
  });
});

describe('active days by season', () => {
  it('ignores dates before the anchor, after today, and anything that is not a date', () => {
    const counts = activeDaysBySeason(
      [addDays(S1, -1), S1, S1, day(1), day(5), 'not-a-date', day(SEASON_LENGTH_DAYS)],
      day(SEASON_LENGTH_DAYS - 1),
    );
    expect(counts.get(1)).toBe(3);
    expect(counts.has(2)).toBe(false); // the season-2 date is in the future
  });

  it('GR-01: depends only on dates — weights, calories and macros change nothing', () => {
    const random = rng(20261025);
    for (let trial = 0; trial < 200; trial += 1) {
      const dates = Array.from({ length: Math.floor(random() * 60) }, () =>
        day(Math.floor(random() * 120)),
      );
      const build = (scale: number) => ({
        meals: dates.map((d, i) => meal('u', d, Math.round(random() * 4000 * scale), i)),
        waters: [],
        weights: dates.map((d) => weight('u', d, 40 + random() * 160 * scale)),
        completedSessions: [],
      });
      const today = day(119);
      expect(activeDaysBySeason(activeDatesOf(build(0.1)), today)).toEqual(
        activeDaysBySeason(activeDatesOf(build(9)), today),
      );
    }
  });

  it('is monotone: adding a day never lowers any season or belt', () => {
    const random = rng(7);
    for (let trial = 0; trial < 200; trial += 1) {
      const dates = Array.from({ length: Math.floor(random() * 80) }, () =>
        day(Math.floor(random() * 112)),
      );
      const today = day(111);
      const before = activeDaysBySeason(dates, today);
      const after = activeDaysBySeason([...dates, day(Math.floor(random() * 112))], today);
      for (const [season, count] of before) {
        expect(after.get(season)!).toBeGreaterThanOrEqual(count);
        const rank = (n: number) => BELT_LADDER.filter((r) => n >= r.activeDays).length;
        expect(rank(after.get(season)!)).toBeGreaterThanOrEqual(rank(count));
      }
    }
  });
});

// ---------------------------------------------------------------------------

describe('rollout and gating', () => {
  afterEach(() => {
    delete process.env.FIGHT_RECORD_ENABLED;
    delete process.env.FIGHT_RECORD_ROLLOUT_PERCENT;
  });

  it('is off unless enabled, and the bucket is stable and in range', () => {
    expect(service.fightRecordEnabledFor('anyone')).toBe(false);
    process.env.FIGHT_RECORD_ENABLED = 'true';
    expect(service.fightRecordEnabledFor('anyone')).toBe(true);
    process.env.FIGHT_RECORD_ROLLOUT_PERCENT = '0';
    expect(service.fightRecordEnabledFor('anyone')).toBe(false);
    // A typo in a rollout control fails toward nobody, not everybody.
    for (const typo of ['10%', '12.5', 'all']) {
      process.env.FIGHT_RECORD_ROLLOUT_PERCENT = typo;
      expect(service.fightRecordEnabledFor('anyone')).toBe(false);
    }

    const bucket = service.rolloutBucket('usr-123');
    expect(bucket).toBe(service.rolloutBucket('usr-123'));
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
    process.env.FIGHT_RECORD_ROLLOUT_PERCENT = String(bucket + 1);
    expect(service.fightRecordEnabledFor('usr-123')).toBe(true);
    process.env.FIGHT_RECORD_ROLLOUT_PERCENT = String(bucket);
    expect(service.fightRecordEnabledFor('usr-123')).toBe(false);
  });

  it('treats a missing profile as not an adult', () => {
    expect(service.isAdult(undefined)).toBe(false);
    expect(service.isAdult({ age: 17 })).toBe(false);
    expect(service.isAdult({ age: 18 })).toBe(true);
  });
});

describe('awards', () => {
  it('awards every rung reached, once, with stable ids', () => {
    seedMeals('fr-a', Array.from({ length: 13 }, (_, i) => day(i)));
    const first = service.readFightRecord('fr-a', day(20), new Date('2026-12-01T00:00:00Z'));
    expect(first.current).toMatchObject({ activeDays: 13, tier: 'blue', next: BELT_LADDER[2] });
    expect(beltDocs('fr-a').map((d) => d.id).sort()).toEqual([
      service.beltAwardId('fr-a', 1, 'blue'),
      service.beltAwardId('fr-a', 1, 'white'),
    ]);
    expect(first.celebrate?.tier).toBe('blue');

    const again = service.readFightRecord('fr-a', day(21), new Date('2026-12-09T00:00:00Z'));
    expect(beltDocs('fr-a')).toHaveLength(2);
    expect(beltDocs('fr-a').every((d) => d.awardedAt === '2026-12-01T00:00:00.000Z')).toBe(true);
    expect(again.belts).toHaveLength(1);
    expect(again.belts[0]).not.toHaveProperty('userId');
    expect(again.belts[0]!.id).toBe(service.beltViewId(1, 'blue'));
  });

  it('keeps a belt after the logs behind it are deleted', () => {
    const dates = Array.from({ length: 24 }, (_, i) => day(i));
    seedMeals('fr-b', dates);
    expect(service.readFightRecord('fr-b', day(30)).current.tier).toBe('purple');

    getStore().deleteWhere<{ id: string; userId?: string; type?: string }>(
      'logs',
      (d) => d.userId === 'fr-b' && d.type === 'mealLog',
    );
    const after = service.readFightRecord('fr-b', day(31));
    expect(after.current.activeDays).toBe(0);
    expect(after.current.tier).toBe('purple');
    // The next rung is above the belt held, not above the (now zero) count.
    expect(after.current.next?.tier).toBe('brown');
  });

  it('awards past seasons retroactively and starts the new season at zero', () => {
    seedMeals('fr-c', Array.from({ length: 5 }, (_, i) => day(i)));
    const later = service.readFightRecord('fr-c', day(SEASON_LENGTH_DAYS * 2 + 3));
    expect(later.current.season.number).toBe(3);
    expect(later.current).toMatchObject({ activeDays: 0, tier: null, next: BELT_LADDER[0] });
    expect(later.belts.map((b) => [b.seasonNumber, b.tier])).toEqual([[1, 'white']]);
    expect(later.celebrate).toMatchObject({ seasonNumber: 1, tier: 'white' });
  });
});

describe('celebration', () => {
  it('acknowledging a belt also retires lower and earlier ones, and ignores foreign ids', () => {
    // Season 1: blue. Season 2: white.
    seedMeals('fr-d', [
      ...Array.from({ length: 12 }, (_, i) => day(i)),
      ...Array.from({ length: 3 }, (_, i) => day(SEASON_LENGTH_DAYS + i)),
    ]);
    const today = day(SEASON_LENGTH_DAYS + 10);
    const status = service.readFightRecord('fr-d', today);
    expect(status.celebrate).toMatchObject({ seasonNumber: 2, tier: 'white' });

    service.acknowledgeBelt('fr-d', service.beltAwardId('fr-d', 2, 'white')); // a stored id, not a view id
    service.acknowledgeBelt('fr-d', 's9-black'); // well-formed but not held
    expect(service.readFightRecord('fr-d', today).celebrate?.seasonNumber).toBe(2);

    service.acknowledgeBelt('fr-d', status.celebrate!.id);
    expect(service.readFightRecord('fr-d', today).celebrate).toBeNull();
  });

  it('a log backfilled into a finished season does not bring its celebration back', () => {
    seedMeals('fr-f', [
      ...Array.from({ length: 3 }, (_, i) => day(i)),
      ...Array.from({ length: 3 }, (_, i) => day(SEASON_LENGTH_DAYS + i)),
    ]);
    const today = day(SEASON_LENGTH_DAYS + 10);
    service.acknowledgeBelt('fr-f', service.readFightRecord('fr-f', today).celebrate!.id);

    // Twelve season-1 days logged after the fact: a season-1 blue is now earned.
    seedMeals('fr-f', Array.from({ length: 12 }, (_, i) => day(i)));
    const after = service.readFightRecord('fr-f', today);
    expect(after.belts.find((b) => b.seasonNumber === 1)?.tier).toBe('blue');
    expect(after.celebrate).toBeNull();
  });

  it('acknowledging a lower belt leaves a higher one to celebrate', () => {
    seedMeals('fr-e', Array.from({ length: 12 }, (_, i) => day(i)));
    service.readFightRecord('fr-e', day(15));
    service.acknowledgeBelt('fr-e', service.beltViewId(1, 'white'));
    expect(service.readFightRecord('fr-e', day(15)).celebrate?.tier).toBe('blue');
  });
});

// ---------------------------------------------------------------------------

describe('emoji status', () => {
  const ENV = {
    TELEGRAM_BOT_TOKEN: '123456:test-token-for-fight-record',
    TELEGRAM_BELT_EMOJI_IDS: JSON.stringify({
      white: 'e-white',
      blue: 'e-blue',
      purple: 'e-purple',
      brown: 'e-brown',
      black: 'e-black',
    }),
  };
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  let reply: { ok: boolean; description?: string } = { ok: true };

  beforeEach(() => {
    Object.assign(process.env, ENV);
    calls.length = 0;
    reply = { ok: true };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ method: url.split('/').pop()!, body: JSON.parse(init.body) });
        return { json: async () => ({ ...reply, result: reply.ok ? true : undefined }) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BELT_EMOJI_IDS;
  });

  function adultTelegramUser(userId: string, tgId: number, age = 30): void {
    getStore().upsert('users', {
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      tier: 'free',
      role: 'user',
      displayName: 'Fighter',
      tgId,
      createdAt: new Date().toISOString(),
    });
    getStore().upsert('profiles', { id: `profile-${userId}`, type: 'wellnessProfile', userId, age });
  }

  const audits = (userId: string) =>
    getStore()
      .where<{ id: string; userId?: string; action?: string }>('audit', (d) => d.userId === userId)
      .map((d) => d.action);

  it('is unavailable to minors and to accounts without Telegram', async () => {
    adultTelegramUser('fr-minor', 501, 16);
    await expect(service.setEmojiStatusPreference('fr-minor', true, day(3))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(service.readFightRecord('fr-minor', day(3)).emojiStatus).toEqual({
      available: false,
      enabled: false,
    });
    await expect(service.setEmojiStatusPreference('fr-nobody', true, day(3))).rejects.toBeInstanceOf(
      AppError,
    );
    expect(calls).toHaveLength(0);
  });

  it('sets the current belt with a season-end expiry, records consent, and clears on withdrawal', async () => {
    adultTelegramUser('fr-tg', 777);
    seedMeals('fr-tg', Array.from({ length: 3 }, (_, i) => day(i)));

    const on = await service.setEmojiStatusPreference('fr-tg', true, day(4));
    expect(on).toEqual({ available: true, enabled: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'setUserEmojiStatus',
      body: { user_id: 777, emoji_status_custom_emoji_id: 'e-white' },
    });
    const expiry = calls[0]!.body.emoji_status_expiration_date as number;
    expect(expiry * 1000).toBeGreaterThan(Date.parse(`${seasonByNumber(1).endsOn}T23:59:59Z`));
    expect(audits('fr-tg')).toContain('fightRecord.emojiStatus.granted');

    // A read with nothing new does not call Telegram again.
    service.readFightRecord('fr-tg', day(4));
    expect(calls).toHaveLength(1);

    const off = await service.setEmojiStatusPreference('fr-tg', false, day(4));
    expect(off.enabled).toBe(false);
    expect(calls.at(-1)?.body.emoji_status_custom_emoji_id).toBe('');
    expect(audits('fr-tg')).toContain('fightRecord.emojiStatus.withdrawn');
  });

  it('stores nothing when Telegram refuses the first status', async () => {
    adultTelegramUser('fr-refused', 778);
    seedMeals('fr-refused', Array.from({ length: 3 }, (_, i) => day(i)));
    reply = { ok: false, description: 'Bad Request: emoji status access not granted' };
    await expect(service.setEmojiStatusPreference('fr-refused', true, day(4))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(service.readFightRecord('fr-refused', day(4)).emojiStatus.enabled).toBe(false);
    expect(audits('fr-refused')).not.toContain('fightRecord.emojiStatus.granted');
  });

  it('follows a new belt on read, and turns itself off when access was revoked', async () => {
    adultTelegramUser('fr-follow', 779);
    seedMeals('fr-follow', Array.from({ length: 3 }, (_, i) => day(i)));
    await service.setEmojiStatusPreference('fr-follow', true, day(4));
    expect(calls).toHaveLength(1);

    seedMeals('fr-follow', Array.from({ length: 12 }, (_, i) => day(i)));
    reply = { ok: false, description: 'Forbidden: user revoked emoji status access' };
    service.readFightRecord('fr-follow', day(13));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.body.emoji_status_custom_emoji_id).toBe('e-blue');
    await vi.waitFor(() =>
      expect(service.readFightRecord('fr-follow', day(13)).emojiStatus.enabled).toBe(false),
    );
    // A grant that ends inside Telegram still ends in the audit trail.
    expect(audits('fr-follow')).toContain('fightRecord.emojiStatus.withdrawn');
  });

  it('a withdrawal made while a sync is in flight wins: the status comes back down', async () => {
    adultTelegramUser('fr-race', 780);
    seedMeals('fr-race', Array.from({ length: 3 }, (_, i) => day(i)));
    await service.setEmojiStatusPreference('fr-race', true, day(4));
    seedMeals('fr-race', Array.from({ length: 12 }, (_, i) => day(i)));

    // Hold the read's Telegram call open until the withdrawal has been stored.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ method: url.split('/').pop()!, body: JSON.parse(init.body) });
        if (calls.length === 2) await held;
        return { json: async () => ({ ok: true, result: true }) };
      }),
    );
    service.readFightRecord('fr-race', day(13));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    await service.setEmojiStatusPreference('fr-race', false, day(13));
    release();

    // The sync lands after the withdrawal, so it takes its own status down.
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    expect(calls[1]!.body.emoji_status_custom_emoji_id).toBe('e-blue');
    expect(calls[3]!.body.emoji_status_custom_emoji_id).toBe('');
    const state = getStore().byId<{ id: string; emojiStatus: unknown }>('logs', 'fight-record-fr-race');
    expect(state?.emojiStatus).toEqual({ enabled: false });
  });
});
