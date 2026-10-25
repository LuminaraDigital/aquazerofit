/**
 * The squad board under load (AZF-P1 S11): forty full squads, every member
 * with four months of history, all reading GET /squads/current at once.
 *
 * Each board read loads every member's activity and belt, so its cost grows
 * with squad size times history; this pins that it stays a per-request
 * figure and not something that scales with everyone in the store. Run on
 * the in-memory engage adapter: the Postgres reads are indexed lookups of at
 * most five rows (contract suite), and the activity loads measured here are
 * the same on both. Measured on a Windows dev machine: p50 about 40 ms and
 * p95 about 60 to 75 ms at 20 requests in flight, most of it queueing on the
 * one event loop. The budget leaves room for a shared CI runner.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEASON_ONE_STARTS_ON } from '@aquazerofit/shared';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { addDays } = await import('../platform/dates');
const { getStore } = await import('../platform/store');
const { engageRepo } = await import('../modules/fightCamp/repo');

const SQUADS = 40;
const PER_SQUAD = 5;
const HISTORY_DAYS = 120;
const CONCURRENCY = 20;
const P95_BUDGET_MS = 250;

let h: FightCampHarness;
const people: Person[] = [];
const TODAY = addDays(SEASON_ONE_STARTS_ON, 60);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00.000Z`));
  h = await fightCampHarness('fc-board-load');
  h.enable('squads');
  const createdAt = `${addDays(TODAY, -HISTORY_DAYS)}T09:00:00.000Z`;
  for (let s = 0; s < SQUADS; s += 1) {
    const squadId = `sqd-load-${s}`;
    for (let m = 0; m < PER_SQUAD; m += 1) {
      const userId = `usr-load-${s}-${m}`;
      getStore().upsert('users', {
        id: userId,
        type: 'user',
        email: `${userId}@example.com`,
        emailVerified: true,
        role: 'user',
        tier: 'free',
        displayName: `Member${s}x${m}`,
        createdAt,
      });
      h.setAge(userId, 30);
      // Active about six days in seven, with a different gap for each member.
      h.seedActive(
        userId,
        Array.from({ length: HISTORY_DAYS }, (_, d) => addDays(TODAY, -d)).filter((_, d) => (d + m) % 7 !== 0),
      );
      const member = {
        squadId,
        userId,
        memberRef: `m_load${String(s).padStart(3, '0')}${m}xxxx`.slice(0, 14),
        seasonNumber: 2,
        role: m === 0 ? ('owner' as const) : ('member' as const),
        showStats: m % 2 === 0,
        joinedAt: `${addDays(TODAY, -30)}T09:00:0${m}.000Z`,
        leftAt: null,
      };
      if (m === 0) {
        await engageRepo().createSquad(
          {
            id: squadId,
            seasonNumber: 2,
            name: `Load Crew ${s}`,
            inviteCode: `SQD-LOAD${String(s).padStart(6, '0')}`,
            cornerHash: null,
            maxMembers: PER_SQUAD,
            createdBy: userId,
            createdAt: member.joinedAt,
            archivedAt: null,
          },
          member,
        );
      } else {
        await engageRepo().joinSquad(squadId, member);
      }
      people.push(await h.refresh({ userId, token: '', auth: () => ({}) }));
    }
  }
}, 120_000);

afterAll(async () => {
  vi.useRealTimers();
  await h.cleanup();
});

describe('squad board load', () => {
  it(`serves ${SQUADS * PER_SQUAD} concurrent board reads with p95 under ${P95_BUDGET_MS} ms`, async () => {
    // One warm-up read: module and index setup is not what this measures.
    expect((await request(h.app).get(`${h.base}/squads/current`).set(people[0]!.auth())).status).toBe(200);

    const timings: number[] = [];
    for (let i = 0; i < people.length; i += CONCURRENCY) {
      await Promise.all(
        people.slice(i, i + CONCURRENCY).map(async (person) => {
          const started = performance.now();
          const res = await request(h.app).get(`${h.base}/squads/current`).set(person.auth());
          timings.push(performance.now() - started);
          expect(res.status).toBe(200);
          expect(res.body.squad.members).toHaveLength(PER_SQUAD);
        }),
      );
    }
    timings.sort((a, b) => a - b);
    const p50 = timings[Math.floor(timings.length * 0.5)]!;
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
    expect(p95, `p50 ${p50.toFixed(1)} ms`).toBeLessThan(P95_BUDGET_MS);
  }, 120_000);
});
