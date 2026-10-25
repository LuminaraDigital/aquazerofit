/**
 * S1 foundations over HTTP (AZF-P1 §4.1, §5.1, §8.4): the composed gate, the
 * sub-flag readers, and that engage data rides the existing export and
 * erasure paths, appearing in an export only when there is something in it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

let h: FightCampHarness;
let mia: Person;

const { fcEnabled } = await import('../modules/fightCamp/flags');
const { FC_FEATURE_ENV, fightCampConfig } = await import('../platform/fightCampConfig');
const { engageRepo } = await import('../modules/fightCamp/repo');

beforeAll(async () => {
  h = await fightCampHarness('fc-foundations');
  mia = await h.register('Mia');
});

afterEach(() => {
  h.disableAll();
  delete process.env.FC_EARLY_CHEERS_PERCENT;
  delete process.env.GIFT_PREMIUM_7D_STARS;
  delete process.env.ENGAGE_HMAC_SECRET;
});

afterAll(async () => {
  await h.cleanup();
});

describe('fcEnabled', () => {
  it('needs the master switch, the sub-flag and the rollout bucket together', () => {
    expect(fcEnabled('squads', mia.userId)).toBe(false);
    process.env.FC_SQUADS_ENABLED = 'true';
    expect(fcEnabled('squads', mia.userId)).toBe(false);
    process.env.FIGHT_RECORD_ENABLED = 'true';
    expect(fcEnabled('squads', mia.userId)).toBe(true);
    expect(fcEnabled('cheers', mia.userId)).toBe(false);
    process.env.FIGHT_RECORD_ROLLOUT_PERCENT = '0';
    expect(fcEnabled('squads', mia.userId)).toBe(false);
  });

  it('treats anything but true or 1 as off', () => {
    process.env.FIGHT_RECORD_ENABLED = 'true';
    for (const value of ['yes', 'on', 'TRUE ', '2', '']) {
      process.env.FC_GRACE_ENABLED = value;
      expect(fcEnabled('grace', mia.userId), value).toBe(value.trim().toLowerCase() === 'true');
    }
  });
});

describe('fightCampConfig', () => {
  it('reads the early-cheers share as 0 to 100, defaulting to nobody', () => {
    expect(fightCampConfig.earlyCheersPercent).toBe(0);
    process.env.FC_EARLY_CHEERS_PERCENT = '40';
    expect(fightCampConfig.earlyCheersPercent).toBe(40);
    process.env.FC_EARLY_CHEERS_PERCENT = '250';
    expect(fightCampConfig.earlyCheersPercent).toBe(100);
    process.env.FC_EARLY_CHEERS_PERCENT = '12.5';
    expect(fightCampConfig.earlyCheersPercent).toBe(0);
  });

  it('has no default gift price and refuses anything but a positive integer', () => {
    expect(fightCampConfig.giftPremium7dStars).toBeNull();
    for (const bad of ['0', '-5', '3.5', '50 stars', '']) {
      process.env.GIFT_PREMIUM_7D_STARS = bad;
      expect(fightCampConfig.giftPremium7dStars, bad).toBeNull();
    }
    process.env.GIFT_PREMIUM_7D_STARS = '150';
    expect(fightCampConfig.giftPremium7dStars).toBe(150);
  });

  it('ignores an HMAC secret too short to protect a group id', () => {
    process.env.ENGAGE_HMAC_SECRET = 'short';
    expect(fightCampConfig.engageHmacSecret).toBe('');
    process.env.ENGAGE_HMAC_SECRET = 'x'.repeat(32);
    expect(fightCampConfig.engageHmacSecret).toHaveLength(32);
  });
});

describe('export and erasure', () => {
  it('leaves the export unchanged for an account with no Fight Camp data', async () => {
    const res = await request(h.app).get(`${h.base}/me/export`).set(mia.auth());
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('engage');
  });

  it('exports engage rows, whatever the flags say, and erases them with the account', async () => {
    const rizal = await h.register('Rizal');
    await engageRepo().enrol({
      userId: rizal.userId,
      seasonNumber: 1,
      source: 'dashboard',
      enrolledAt: new Date().toISOString(),
    });
    await engageRepo().claimNudge(rizal.userId, '2026-10-25', 'cheer', new Date().toISOString());

    const exported = await request(h.app).get(`${h.base}/me/export`).set(rizal.auth());
    expect(exported.status).toBe(200);
    expect(exported.body.engage.enrolments).toEqual([
      expect.objectContaining({ userId: rizal.userId, seasonNumber: 1 }),
    ]);
    expect(exported.body.engage.nudges).toHaveLength(1);

    // Two-step deletion: flag, then purge.
    expect((await request(h.app).delete(`${h.base}/me`).set(rizal.auth())).status).toBeLessThan(300);
    expect((await request(h.app).delete(`${h.base}/me`).set(rizal.auth())).status).toBeLessThan(300);
    const after = await engageRepo().exportUser(rizal.userId);
    expect(after.enrolments).toEqual([]);
    expect(after.nudges).toEqual([]);
  });
});

describe('the deletion sweep', () => {
  // logEvent is silent under test, so this pins the behaviour that matters:
  // the sweep survives the failure and the account is still there to retry.
  it('survives a failed Fight Camp erasure and leaves the account whole for the next sweep', async () => {
    const { setEngageRepoForTests } = await import('../modules/fightCamp/repo');
    const { MemoryEngageRepo } = await import('../modules/fightCamp/repo/memory');
    const { sweepExpiredDeletions } = await import('../modules/me/service');
    const { getStore } = await import('../platform/store');
    const jay = await h.register('Jay');
    const user = getStore().byId<{ id: string; deletionRequestedAt?: string }>('users', jay.userId)!;
    getStore().upsert('users', { ...user, deletionRequestedAt: '2000-01-01T00:00:00.000Z' });

    const failing = new MemoryEngageRepo();
    failing.eraseUser = async () => {
      throw new Error('connection terminated');
    };
    setEngageRepoForTests(failing);
    try {
      expect(await sweepExpiredDeletions()).toBe(0);
    } finally {
      setEngageRepoForTests(new MemoryEngageRepo());
    }
    expect(getStore().byId('users', jay.userId)).toBeDefined();
    expect(getStore().byId('profiles', `profile-${jay.userId}`)).toBeDefined();
  });
});

describe('environment documentation', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const names = [
    'FIGHT_RECORD_ENABLED',
    'FIGHT_RECORD_ROLLOUT_PERCENT',
    ...Object.values(FC_FEATURE_ENV),
    'FC_EARLY_CHEERS_PERCENT',
    'GIFT_PREMIUM_7D_STARS',
    'ENGAGE_HMAC_SECRET',
    'TELEGRAM_BOT_USERNAME',
    'TELEGRAM_MINI_APP_SHORT_NAME',
  ];

  it.each(['.env.example', '.env.staging.example', '.env.production.example'])(
    'lists every Fight Camp switch, commented out, in %s',
    (file) => {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      for (const name of names) {
        // Commented out: an example file must never switch a dark feature on.
        expect(text, `${file}: ${name}`).toMatch(new RegExp(`^# ${name}=`, 'm'));
        expect(text, `${file}: ${name}`).not.toMatch(new RegExp(`^${name}=`, 'm'));
      }
    },
  );
});
