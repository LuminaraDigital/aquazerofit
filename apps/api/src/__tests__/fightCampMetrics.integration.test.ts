/**
 * S10 metrics and the kill report (AZF-P1 §7.2, §7.3): the numbers must
 * reconcile with a seeded, hand-counted fixture.
 *
 * Everyone registers on day 30 of season 1; "today" is day 66 (season 2,
 * day 10), so the day-30 cohort's D30 window (days 58 to 61) has passed.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');
const { getStore, newId } = await import('../platform/store');
const { engageRepo } = await import('../modules/fightCamp/repo');
const { twoProportionZ } = await import('../modules/fightCamp/metrics');
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: a plain .mjs tool outside the workspaces, imported for its pure builder.
const { killReport, killRows } = (await import('../../../../tools/engage/kill-report.mjs')) as {
  killReport: (m: unknown) => string;
  killRows: (m: unknown) => string[][];
};

let h: FightCampHarness;
const day = (n: number) => addDays(SEASON_ONE_STARTS_ON, n);
const pin = (n: number) => vi.setSystemTime(new Date(`${day(n)}T09:00:00.000Z`));
const SIGNUP = 30;
const TODAY = 66;

let admin: Person;
let member: Person;
const people: Record<string, Person> = {};

function shareEvent(userId: string, at: string): void {
  getStore().upsert('audit', {
    type: 'growthEvent',
    id: newId('gev'),
    userId,
    name: 'share_copied',
    props: { kind: 'season' },
    attribution: { ref: null, utmSource: null, utmMedium: null, utmCampaign: null, challengeCode: null },
    createdAt: at,
  });
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  pin(SIGNUP);
  h = await fightCampHarness('fc-metrics');
  for (const name of ['squadKept', 'soloKept', 'soloGone', 'treatDone', 'holdNot', 'sharer']) {
    people[name] = await h.register(name);
  }
  admin = await h.register('Admin');
  const stored = getStore().byId<{ id: string; role: string }>('users', admin.userId)!;
  getStore().upsert('users', { ...stored, role: 'admin' });

  // Squad within a week of signup for one person.
  await engageRepo().createSquad(
    {
      id: 'sqd-metrics', seasonNumber: 1, name: 'Metric Crew', inviteCode: 'SQD-METRICS222',
      cornerHash: null, maxMembers: 5, createdBy: people.squadKept!.userId,
      createdAt: `${day(SIGNUP + 2)}T09:00:00.000Z`, archivedAt: null,
    },
    {
      squadId: 'sqd-metrics', userId: people.squadKept!.userId, memberRef: 'm_metricsxxxx1', seasonNumber: 1,
      role: 'owner', showStats: false, joinedAt: `${day(SIGNUP + 2)}T09:00:00.000Z`, leftAt: null,
    },
  );
  // D30: the squad person and one solo person active on day 59; one solo not.
  h.seedActive(people.squadKept!.userId, [day(SIGNUP), day(59)]);
  h.seedActive(people.soloKept!.userId, [day(SIGNUP), day(60)]);
  h.seedActive(people.soloGone!.userId, [day(SIGNUP)]);
  // Early cheers arms: treatment completed week one (3 of first 7 days), holdout did not.
  await engageRepo().assignArm(people.treatDone!.userId, 'early_cheers', 'treatment', `${day(SIGNUP)}T09:00:00.000Z`);
  await engageRepo().assignArm(people.holdNot!.userId, 'early_cheers', 'holdout', `${day(SIGNUP)}T09:00:00.000Z`);
  h.seedActive(people.treatDone!.userId, [day(SIGNUP), day(SIGNUP + 1), day(SIGNUP + 2), day(TODAY - 1)]);
  h.seedActive(people.holdNot!.userId, [day(SIGNUP), day(TODAY - 2)]);
  // Weekly actives (days 60 to 66): sharer, treatDone, holdNot, soloKept. One of them shared.
  h.seedActive(people.sharer!.userId, [day(TODAY)]);
  shareEvent(people.sharer!.userId, `${day(TODAY - 1)}T10:00:00.000Z`);
  shareEvent(people.sharer!.userId, `${day(TODAY - 20)}T10:00:00.000Z`);
  // Landings and one share attribution in the last 28 days.
  for (let i = 0; i < 4; i += 1) await engageRepo().recordLanding(day(TODAY - 3), 'season', 'web');
  await engageRepo().insertShareLink({ code: 'MetricA1', userId: people.sharer!.userId, kind: 'season', seasonNumber: 2, createdAt: `${day(TODAY - 5)}T00:00:00.000Z` });
  await engageRepo().attribute({ inviteeUserId: 'someone-new', shareCode: 'MetricA1', squadId: null, surface: 'web', createdAt: `${day(TODAY - 3)}T00:00:00.000Z` });
  // Re-enrolment: two in season 1, one of them again in season 2.
  for (const who of ['squadKept', 'soloKept'] as const) {
    await engageRepo().enrol({ userId: people[who]!.userId, seasonNumber: 1, source: 'dashboard', enrolledAt: `${day(SIGNUP)}T09:00:00.000Z` });
  }
  await engageRepo().enrol({ userId: people.squadKept!.userId, seasonNumber: 2, source: 'recap', enrolledAt: `${day(57)}T09:00:00.000Z` });
  // Cheers in season 1: one sender with three, one with one.
  for (const [i, d] of [40, 41, 42].entries()) {
    await engageRepo().insertCheer({ id: `m-c${i}`, fromKind: 'member', fromUserId: 'loud', coachId: null, toUserId: `t${i}`, squadId: null, cheer: 'fire', localDate: day(d), createdAt: `${day(d)}T09:00:00.000Z`, seenAt: null });
  }
  await engageRepo().insertCheer({ id: 'm-c9', fromKind: 'member', fromUserId: 'quiet', coachId: null, toUserId: 't9', squadId: null, cheer: 'clap', localDate: day(41), createdAt: `${day(41)}T09:00:00.000Z`, seenAt: null });

  pin(TODAY);
  admin = await h.refresh(admin);
  member = await h.refresh(people.sharer!);
});

afterAll(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

const metrics = (who: Person, query = '') => request(h.app).get(`${h.base}/admin/engage/metrics${query}`).set(who.auth());

describe('GET /admin/engage/metrics', () => {
  it('is for admins only', async () => {
    expect((await metrics(member)).status).toBe(403);
  });

  it('reconciles with the seeded fixture, and carries no ids', async () => {
    const res = await metrics(admin);
    expect(res.status).toBe(200);
    const m = res.body.metrics;
    expect(m.season).toMatchObject({ number: 2 });
    expect(m.share).toEqual({
      weeklyActive: 4,
      sharers: 1,
      shareRate: 0.25,
      landed28d: 4,
      attributed28d: 1,
      shareToInstall: 0.25,
    });
    // Solo: the five other members from the same signup week (the admin is
    // staff and excluded, as in the retention report); one active on day 60.
    expect(m.squads).toEqual({ squadUsers: 1, squadD30: 1, soloUsers: 5, soloD30: 0.2, liftPts: 80 });
    expect(m.earlyCheers).toMatchObject({
      treatment: { users: 1, completed: 1 },
      holdout: { users: 1, completed: 0 },
      liftPts: 100,
    });
    const raw = JSON.stringify(res.body);
    for (const person of Object.values(people)) expect(raw).not.toContain(person.userId);
  });

  it('reads a past season for re-enrolment, grace and the cheer guardrail', async () => {
    const m = (await metrics(admin, '?season=1')).body.metrics;
    expect(m.reenrolment).toEqual({ fromSeason: 1, enrolled: 2, reenrolled: 1, rate: 0.5 });
    expect(m.guardrails).toEqual({ cheersSent: 4, senders: 2, maxPerSender: 3, p95PerSender: 3 });
    expect(m.grace).toMatchObject({ applied: 0 });
  });
});

describe('the statistics', () => {
  it('runs a two-proportion z-test, and refuses an empty arm', () => {
    // 60/100 vs 45/100: z about 2.12, p about 0.034.
    const result = twoProportionZ(60, 100, 45, 100)!;
    expect(result.z).toBeCloseTo(2.12, 1);
    expect(result.pValue).toBeCloseTo(0.034, 2);
    expect(twoProportionZ(1, 0, 1, 10)).toBeNull();
    expect(twoProportionZ(0, 10, 0, 10)).toBeNull();
  });
});

describe('tools/engage/kill-report.mjs', () => {
  it('applies the PRD rules and says NOT YET where the data cannot decide', async () => {
    const m = (await metrics(admin)).body.metrics;
    const rows = killRows(m);
    expect(rows.map((r) => [r[0], r[3]])).toEqual([
      ['Share Kit', 'KEEP'],
      ['Squads', 'KEEP'],
      ['Seasons (enrolment, recap)', 'NOT YET'],
      ['Early cheers', 'NOT YET'],
      ['Any Phase 1 feature', 'CHECK BY HAND'],
    ]);
    const below = killRows({ ...m, share: { ...m.share, shareRate: 0.01 } });
    expect(below[0]![3]).toBe('REDESIGN');
    expect(killReport(m)).toMatch(/^# Fight Camp kill-criteria report/);
  });
});
