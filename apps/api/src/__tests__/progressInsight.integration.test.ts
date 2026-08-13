/**
 * GET /progress/insight — the P-08 progress-intelligence lane.
 *
 * The properties under test are the ones that decide whether this feature helps
 * or hurts: a brand-new user must get an encouraging 200 rather than an error
 * on their dashboard, the statistics must be the store's own numbers, a second
 * dashboard load in the same week must not bill again, and a free-tier user
 * must get the insight rather than a 403.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CREDIT_COSTS } from '@aquazerofit/shared';
import type { ProgressInsight, ProgressInsightChange, User } from '@aquazerofit/shared';
import { creditLedger } from '../modules/ai/creditLedger';
import { addDays } from '../platform/dates';
import {
  bindIsolatedDataDir,
  clearProviderEnv,
  createIsolatedDataDir,
  pinIsolatedDataDir,
  saveProviderEnv,
  teardownIsolatedDataDir,
} from './helpers/integrationIsolation';

const savedAzfDataDir = process.env.AZF_DATA_DIR;
const savedProviderEnv = saveProviderEnv();
const dataDir = createIsolatedDataDir('azf-insight-');
bindIsolatedDataDir(dataDir);
// No provider keys: the gateway lands on the offline engine by design, which
// keeps meta.degraded false and therefore bills normally (the keyless mock IS
// the product). That is the path this suite asserts billing against.
clearProviderEnv();

const { createApp } = await import('../app');
const { getStore } = await import('../platform/store');
const app = createApp();
const base = '/api/v1';

/** Today in UTC — no X-Timezone header is sent, so todayFor() resolves to UTC. */
const today = new Date().toISOString().slice(0, 10);
const day = (offset: number): string => addDays(today, offset);

interface Seeded {
  token: string;
  userId: string;
}

let premium: Seeded;
let free: Seeded;
let fresh: Seeded;

async function registerUser(email: string): Promise<Seeded> {
  const res = await request(app)
    .post(`${base}/auth/register`)
    .send({ email, password: 'CorrectHorse9Battery' });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

async function grantConsent(user: Seeded): Promise<void> {
  const res = await request(app)
    .put(`${base}/me/consents`)
    .set({ Authorization: `Bearer ${user.token}` })
    .send({
      wellnessDataProcessing: true,
      aiPersonalisation: true,
      anonymisedAnalytics: false,
      reminders: false,
    });
  expect(res.status).toBe(200);
}

/** requireAuth reads tier from the user record, so promotion is a store write. */
function promoteToPremium(userId: string): void {
  const store = getStore();
  const user = store.byId<User>('users', userId);
  expect(user).toBeDefined();
  store.upsert('users', { ...user!, tier: 'premium' });
}

function logWeight(userId: string, localDate: string, weightKg: number): void {
  getStore().upsert('logs', {
    id: `wl-${userId}-${localDate}`,
    userId,
    type: 'weightLog',
    weightKg,
    loggedAt: `${localDate}T07:00:00.000Z`,
    localDate,
  });
}

function logMeal(userId: string, localDate: string, kcal: number): void {
  getStore().upsert('logs', {
    id: `ml-${userId}-${localDate}`,
    userId,
    type: 'mealLog',
    mealType: 'lunch',
    items: [],
    totalKcal: kcal,
    totalProteinG: 0,
    totalCarbsG: 0,
    totalFatG: 0,
    source: 'manual',
    loggedAt: `${localDate}T12:00:00.000Z`,
    localDate,
  });
}

function logWater(userId: string, localDate: string, amountMl: number): void {
  getStore().upsert('logs', {
    id: `wa-${userId}-${localDate}`,
    userId,
    type: 'waterLog',
    amountMl,
    loggedAt: `${localDate}T12:00:00.000Z`,
    localDate,
  });
}

function logWorkout(userId: string, localDate: string): void {
  getStore().upsert('plans', {
    id: `ws-${userId}-${localDate}`,
    userId,
    type: 'workoutSession',
    planId: null,
    planDayOrder: null,
    focus: 'full body',
    exercises: [],
    status: 'completed',
    startedAt: `${localDate}T17:00:00.000Z`,
    completedAt: `${localDate}T18:00:00.000Z`,
    durationMinutes: 45,
    kcalBurned: 300,
    localDate,
  });
}

beforeEach(() => {
  pinIsolatedDataDir(dataDir);
});

beforeAll(async () => {
  bindIsolatedDataDir(dataDir);

  premium = await registerUser('insight-premium@example.com');
  free = await registerUser('insight-free@example.com');
  fresh = await registerUser('insight-fresh@example.com');
  await grantConsent(premium);
  await grantConsent(free);
  promoteToPremium(premium.userId);

  // --- Premium user, current 7-day window (T-6 .. T).
  // No profile is created, so readTargets falls back to the documented
  // defaults: 2000 kcal and 2000 ml. That keeps the expected ratios exact.
  logWeight(premium.userId, day(-3), 80.0);
  logWeight(premium.userId, day(-1), 79.4); // deltaKg = -0.6 over 2 weigh-ins
  logMeal(premium.userId, day(-2), 2000);
  logMeal(premium.userId, day(-1), 2200); // mean 2100 / 2000 = 1.05
  logWater(premium.userId, day(-2), 2500);
  logWater(premium.userId, day(-1), 1500); // mean 2000 / 2000 = 100%
  logWorkout(premium.userId, day(-3));
  logWorkout(premium.userId, day(-1)); // 2 this period
  // --- Previous 7-day window (T-13 .. T-7): one workout, one weigh-in, spread
  // across two distinct days. Both logs sat on day(-8) originally, which left
  // the window with a single active day — below the floor at which a count
  // comparison means anything, so the comparisons under test were correctly
  // suppressed. Two active days is the minimum that earns a comparison; the
  // asserted deltas are unchanged either way.
  logWorkout(premium.userId, day(-8));
  logWeight(premium.userId, day(-9), 80.4);

  // --- Free-tier user: enough data to clear the floor.
  logWeight(free.userId, day(-2), 70.0);
  logWeight(free.userId, day(-1), 69.8);
  logWorkout(free.userId, day(-1));

  await getStore().flush();
});

afterAll(async () => {
  await teardownIsolatedDataDir(dataDir, savedAzfDataDir, savedProviderEnv);
});

const auth = (user: Seeded) => ({ Authorization: `Bearer ${user.token}` });

function ledgerRowsFor(userId: string): unknown[] {
  return getStore().where('ledger', (d) => (d as { userId?: string }).userId === userId);
}

describe('GET /progress/insight', () => {
  it('gives a brand-new user the "keep logging" insight, not an error', async () => {
    const res = await request(app).get(`${base}/progress/insight`).set(auth(fresh));

    expect(res.status).toBe(200);
    const insight = res.body.insight as ProgressInsight;
    expect(insight.narrative).toBe('Keep logging — insights appear once there is enough data.');
    expect(insight.ai.provider).toBe('deterministic');
    expect(insight.ai.model).toBe('insufficient-data');
    expect(insight.stats.weighInsCount).toBe(0);
    expect(insight.stats.workoutsCompleted).toBe(0);
    // Never billed, and never persisted — the moment they log, the insight must
    // be recomputed rather than served from a stale "keep logging" cache.
    expect(ledgerRowsFor(fresh.userId)).toHaveLength(0);
    expect(getStore().where('ai', (d) => (d as { userId?: string }).userId === fresh.userId)).toHaveLength(0);
  });

  it('computes stats and changes from what was actually logged', async () => {
    await creditLedger.grantDailyIfNeeded(premium.userId);

    const res = await request(app).get(`${base}/progress/insight`).set(auth(premium));
    expect(res.status).toBe(200);

    const insight = res.body.insight as ProgressInsight;
    expect(res.body.cached).toBe(false);
    expect(insight.periodDays).toBe(7);

    // Numbers the user reads are the numbers the store holds.
    expect(insight.stats.deltaKg).toBe(-0.6);
    expect(insight.stats.weighInsCount).toBe(2);
    expect(insight.stats.workoutsCompleted).toBe(2);
    expect(insight.stats.avgKcalVsTarget).toBe(1.05);
    expect(insight.stats.waterAdherencePct).toBe(100);
    // Active on T-3, T-2 and T-1; today is not logged yet, so the streak runs
    // back from yesterday.
    expect(insight.stats.streakDays).toBe(3);

    // A model narrated it (the offline engine, keylessly, which is the product).
    expect(insight.ai.provider).not.toBe('deterministic');
    expect(insight.narrative.length).toBeGreaterThan(0);
  });

  it('reports change direction against the immediately preceding period', async () => {
    const res = await request(app).get(`${base}/progress/insight`).set(auth(premium));
    expect(res.status).toBe(200);

    const changes = (res.body.insight as ProgressInsight).changes;
    const byMetric = (metric: ProgressInsightChange['metric']) =>
      changes.find((c) => c.metric === metric);

    const weight = byMetric('weight');
    expect(weight?.direction).toBe('down');
    expect(weight?.delta).toBe(-0.6);
    expect(weight?.label).toBe('Weight is down 0.6 kg over the last 7 days.');

    // 2 workouts this period against 1 in the previous one.
    const workouts = byMetric('workouts');
    expect(workouts?.direction).toBe('up');
    expect(workouts?.delta).toBe(1);
    expect(workouts?.label).toContain('1 more than the previous 7 days');

    // 2 weigh-ins against 1: logging is up by one.
    const logging = byMetric('logging');
    expect(logging?.direction).toBe('up');
    expect(logging?.delta).toBe(1);

    // Labels describe movement without grading it (AQF-11 §6).
    for (const change of changes) {
      expect(change.label).not.toMatch(/great|well done|smashed|slipped|bad|lazy|fail/i);
    }
  });

  it('serves the second identical request from cache without billing again', async () => {
    const balanceBefore = await creditLedger.balance(premium.userId);
    const ledgerBefore = ledgerRowsFor(premium.userId).length;

    const first = await request(app).get(`${base}/progress/insight`).set(auth(premium));
    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(true);

    const second = await request(app).get(`${base}/progress/insight`).set(auth(premium));
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.insight.id).toBe(first.body.insight.id);

    expect(await creditLedger.balance(premium.userId)).toBe(balanceBefore);
    expect(ledgerRowsFor(premium.userId)).toHaveLength(ledgerBefore);
  });

  it('billed the first premium request exactly once', async () => {
    const rows = ledgerRowsFor(premium.userId) as { reason?: string; kind?: string }[];
    const reserves = rows.filter((r) => r.reason === 'reserve:progressInsight');
    expect(reserves).toHaveLength(1);
    expect(rows.filter((r) => r.reason === 'commit:progressInsight')).toHaveLength(1);
    expect(CREDIT_COSTS.progressInsight).toBe(1);
  });

  it('gives a free-tier user a deterministic insight, never a 403', async () => {
    const res = await request(app).get(`${base}/progress/insight`).set(auth(free));

    expect(res.status).toBe(200);
    const insight = res.body.insight as ProgressInsight;
    expect(insight.ai.provider).toBe('deterministic');
    expect(insight.ai.model).toBe('premium-required-fallback');
    expect(insight.stats.deltaKg).toBe(-0.2);
    expect(insight.stats.workoutsCompleted).toBe(1);
    // The deterministic narration is a real narration, not a placeholder.
    expect(insight.narrative).toContain('0.2 kg');
    expect(insight.narrative.split('.').filter((s) => s.trim().length > 0).length).toBeGreaterThan(1);
    // Premium gating never costs a free user a credit.
    expect(ledgerRowsFor(free.userId)).toHaveLength(0);
  });

  it('rejects junk periodDays and clamps out-of-range values', async () => {
    const junk = await request(app)
      .get(`${base}/progress/insight?periodDays=lots`)
      .set(auth(fresh));
    expect(junk.status).toBe(400);
    expect(junk.body.code).toBe('VALIDATION_FAILED');

    const clamped = await request(app)
      .get(`${base}/progress/insight?periodDays=999`)
      .set(auth(fresh));
    expect(clamped.status).toBe(200);
    expect(clamped.body.insight.periodDays).toBe(90);
  });

  it('drops count comparisons when the user was barely present in one window', async () => {
    // A user returning after a break logs one day against last week's several,
    // so every count difference comes out negative and each one is measuring
    // attendance rather than effort. The returning user is the last person who
    // should meet a wall of downward arrows, and the arrows would be wrong.
    const returning = await registerUser('insight-returning@example.com');
    await grantConsent(returning);
    // Busy previous window (T-13 .. T-7), then a break, then a single day back.
    for (const offset of [-12, -11, -10, -9]) {
      logWorkout(returning.userId, day(offset));
      logWeight(returning.userId, day(offset), 80);
    }
    logWeight(returning.userId, day(0), 79.5);
    logMeal(returning.userId, day(0), 1800);
    await getStore().flush();

    const res = await request(app).get(`${base}/progress/insight`).set(auth(returning));
    expect(res.status).toBe(200);
    const changes = (res.body.insight as ProgressInsight).changes;

    for (const metric of ['workouts', 'logging'] as const) {
      const change = changes.find((c) => c.metric === metric);
      expect(change).toBeDefined();
      // The current value is still reported — nothing is hidden.
      expect(change?.delta).toBeNull();
      expect(change?.direction).toBe('steady');
      expect(change?.label).not.toMatch(/fewer|more than the previous/i);
    }

    // And the returning user does not meet a list of nothing but declines.
    expect(changes.every((c) => c.direction === 'down')).toBe(false);
  });

  it('reports a periodStart that actually covers the window the stats describe', async () => {
    // periodStart originally carried the current week's Monday, which is the
    // cache bucket rather than the described window — on a Friday that labels a
    // Saturday-to-Friday window as starting on the Monday, and the size of the
    // error changes with the weekday. The two concepts are now separate, and
    // this pins the user-facing one: the window ends today and is periodDays
    // long, inclusive.
    for (const periodDays of [7, 30]) {
      const res = await request(app)
        .get(`${base}/progress/insight?periodDays=${periodDays}`)
        .set(auth(fresh));
      expect(res.status).toBe(200);
      const insight = res.body.insight as ProgressInsight;
      expect(insight.periodDays).toBe(periodDays);
      expect(insight.periodStart).toBe(addDays(today, -(periodDays - 1)));
    }
  });

  it('leaves GET /progress/summary untouched', async () => {
    const res = await request(app).get(`${base}/progress/summary`).set(auth(premium));
    expect(res.status).toBe(200);
    expect(res.body.workoutsCompleted).toBe(3);
    expect(res.body.streakDays).toBe(3);
  });
});
