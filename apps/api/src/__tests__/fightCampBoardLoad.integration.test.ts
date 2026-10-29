/**
 * The squad board under load (AZF-P1 S11): forty full squads, every member
 * with four months of history, all reading GET /squads/current at once.
 *
 * Each board read loads every member's activity and belt, so its cost grows
 * with squad size times history. Six hundred more people with history of
 * their own share the store, so a read that scanned everyone instead of the
 * squad would show here. Run on the in-memory engage adapter: the Postgres
 * reads are indexed lookups of at most five rows (contract suite), and the
 * activity loads measured here are the same on both.
 *
 * Measured on a Windows dev machine: p95 about 60 to 75 ms at 20 requests in
 * flight, most of it queueing on the one event loop. The gate is the best of
 * three rounds, so one scheduling stall on a shared CI runner cannot fail it
 * while a slower read, which slows every round, still does.
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
const BYSTANDERS = 600;
const ROUNDS = 3;
/**
 * CI runs this suite under coverage instrumentation, which makes every read
 * several times slower (a p95 near 300 ms on a shared runner). The budget is
 * for a read doing an order of magnitude more work, such as scanning
 * everyone in the store, not for the last few milliseconds.
 */
const P95_BUDGET_MS = 1000;

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
  for (let b = 0; b < BYSTANDERS; b += 1) {
    const userId = `usr-bystander-${b}`;
    getStore().upsert('users', {
      id: userId, type: 'user', email: `${userId}@example.com`, emailVerified: true,
      role: 'user', tier: 'free', displayName: `Bystander${b}`, createdAt,
    });
    h.seedActive(userId, Array.from({ length: 60 }, (_, d) => addDays(TODAY, -2 * d)));
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

    const round = async (): Promise<number> => {
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
      return timings[Math.ceil(timings.length * 0.95) - 1]!;
    };
    const p95s: number[] = [];
    for (let r = 0; r < ROUNDS; r += 1) p95s.push(await round());
    expect(Math.min(...p95s), `p95 by round: ${p95s.map((p) => p.toFixed(1)).join(', ')} ms`).toBeLessThan(P95_BUDGET_MS);
  }, 120_000);
});
