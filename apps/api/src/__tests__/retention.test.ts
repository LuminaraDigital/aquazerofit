/**
 * Retention baseline (AZF-W3-05 §1, §6.2). The definitions are pinned here
 * because the Phase 1 hypotheses are written as relative changes against this
 * exact arithmetic: moving a window by a day would quietly move every target.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-retention-'));
process.env.AZF_DATA_DIR = dataDir;

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const { addDays } = await import('../platform/dates');
const { cohortRetention, weeklyActiveLoggers } = await import('../modules/admin/retention');
type Subject = import('../modules/admin/retention').RetentionSubject;

afterAll(async () => {
  vi.useRealTimers();
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

/** 2026-10-05 is a Monday. */
const MON = '2026-10-05';
const subject = (signupDate: string, offsets: number[], surface: Subject['surface'] = 'other'): Subject => ({
  signupDate,
  activeDates: new Set(offsets.map((n) => addDays(signupDate, n))),
  surface,
});

describe('cohort retention', () => {
  it('counts D1, D7 and the day 28-31 window exactly, grouped by signup Monday', () => {
    const today = addDays(MON, 60);
    const cohorts = cohortRetention(
      [
        subject(MON, [0, 1, 7, 30]), // retained on all three
        subject(addDays(MON, 6), [2, 6, 8, 27, 32]), // misses every exact day
        subject(addDays(MON, 3), [1, 28]),
      ],
      today,
      12,
    );
    expect(cohorts).toEqual([{ weekOf: MON, users: 3, d1: 2, d7: 1, d30: 2 }]);
  });

  it('reports null, never zero, until every member has reached the day', () => {
    const today = addDays(MON, 9);
    const [cohort] = cohortRetention([subject(MON, [1]), subject(addDays(MON, 4), [1])], today, 4);
    // Day 7 for the Friday signup is MON+11, still in the future.
    expect(cohort).toEqual({ weekOf: MON, users: 2, d1: 2, d7: null, d30: null });
  });

  it('drops cohorts older than the window and orders newest first', () => {
    const today = addDays(MON, 21);
    const weeks = cohortRetention(
      [subject(addDays(MON, -7), []), subject(MON, []), subject(addDays(MON, 14), [])],
      today,
      4, // this week (MON+21) and the three before it: MON+14, MON+7, MON
    ).map((c) => c.weekOf);
    expect(weeks).toEqual([addDays(MON, 14), MON]);
  });
});

describe('weekly active loggers', () => {
  it('counts 3+ of the last 7 days among the last 28 days, per account surface', () => {
    const today = addDays(MON, 40);
    const recent = (days: number[]): Set<string> => new Set(days.map((n) => addDays(today, -n)));
    const rows = weeklyActiveLoggers(
      [
        { signupDate: MON, activeDates: recent([0, 2, 5]), surface: 'telegram' },
        { signupDate: MON, activeDates: recent([0, 1]), surface: 'telegram' },
        { signupDate: MON, activeDates: recent([20]), surface: 'other' },
        { signupDate: MON, activeDates: recent([29]), surface: 'other' },
      ],
      today,
    );
    expect(rows).toEqual([
      { surface: 'telegram', monthlyActive: 2, weeklyActiveLoggers: 1 },
      { surface: 'other', monthlyActive: 1, weeklyActiveLoggers: 0 },
    ]);
  });
});

describe('GET /admin/retention', () => {
  const app = createApp();
  const base = '/api/v1';

  async function register(email: string): Promise<{ token: string; id: string }> {
    const res = await request(app)
      .post(`${base}/auth/register`)
      .send({ email, password: 'CorrectHorse9Battery', displayName: 'Member' });
    expect(res.status).toBe(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  it('refuses members and serves admins aggregate counts only', async () => {
    // Register at "now" so the access tokens are live, then backdate the
    // member's signup two days so their D1 has already happened.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${addDays(MON, 12)}T03:00:00.000Z`));
    const member = await register('retention-member@example.com');
    const admin = await register('retention-admin@example.com');
    const stored = getStore().byId<{ id: string; role: string }>('users', admin.id)!;
    getStore().upsert('users', { ...stored, role: 'admin' });
    const memberDoc = getStore().byId<{ id: string; createdAt: string }>('users', member.id)!;
    getStore().upsert('users', { ...memberDoc, createdAt: `${addDays(MON, 10)}T03:00:00.000Z` });
    getStore().upsert('logs', {
      id: 'wl-retention-1',
      userId: member.id,
      type: 'waterLog',
      amountMl: 250,
      localDate: addDays(MON, 11),
      loggedAt: `${addDays(MON, 11)}T03:00:00.000Z`,
    });

    const refused = await request(app)
      .get(`${base}/admin/retention`)
      .set({ Authorization: `Bearer ${member.token}` });
    expect(refused.status).toBe(403);

    const res = await request(app)
      .get(`${base}/admin/retention?weeks=4`)
      .set({ Authorization: `Bearer ${admin.token}`, 'X-Timezone': 'UTC' });
    expect(res.status).toBe(200);
    // The seeded demo account sits in an older cohort; this one is the member's.
    expect(res.body.report.cohorts).toContainEqual({
      weekOf: addDays(MON, 7),
      users: 1,
      d1: 1,
      d7: null,
      d30: null,
    });
    expect(JSON.stringify(res.body)).not.toContain(member.id);

    const bad = await request(app)
      .get(`${base}/admin/retention?weeks=0`)
      .set({ Authorization: `Bearer ${admin.token}` });
    expect(bad.status).toBe(400);
  });
});
