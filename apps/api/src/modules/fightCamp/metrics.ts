/**
 * Fight Camp metrics and kill criteria (AZF-P1 §7.2, §7.3), for admins.
 *
 * Aggregate counts only: nothing here returns an id, a name or anyone's
 * activity. Each figure is defined once, below, the way §7.2 states it, and
 * `tools/engage/kill-report.mjs` turns this response into the §7.3 decision
 * table. A figure that cannot be measured yet (a cohort still inside its
 * 30 days, an arm with nobody in it) is null, never a zero that would read
 * as a result.
 *
 * O(users x their logs), like the retention report: fine for an admin read
 * on this deployment, and the point to revisit at much larger scale.
 */
import {
  GROWTH_EVENT_NAMES,
  seasonByNumber,
  seasonFor,
  weekStartOf,
  type GrowthEvent,
  type User,
} from '@aquazerofit/shared';
import { addDays, daysBetween, localDateFor } from '../../platform/dates';
import { getStore } from '../../platform/store';
import { D30_OFFSETS, isMemberAccount, retained, type RetentionSubject } from '../admin/retention';
import { activeDatesOf, loadActivity } from '../progress/service';
import { engageRepo } from './repo';

/** Client events that count as having shared (§7.2 "share rate"). */
const SHARE_EVENTS = new Set<(typeof GROWTH_EVENT_NAMES)[number]>([
  'share_native',
  'share_telegram',
  'share_copied',
  'share_story',
]);

export interface EngageMetrics {
  today: string;
  season: { number: number; name: string; startsOn: string; endsOn: string };
  share: {
    weeklyActive: number;
    sharers: number;
    /** Sharers in the last 7 days over weekly actives. */
    shareRate: number | null;
    landed28d: number;
    attributed28d: number;
    /** Attributions over landings, rolling 28 days. */
    shareToInstall: number | null;
  };
  squads: {
    squadUsers: number;
    squadD30: number | null;
    soloUsers: number;
    soloD30: number | null;
    /** Percentage points, squad minus solo. */
    liftPts: number | null;
  };
  reenrolment: { fromSeason: number; enrolled: number; reenrolled: number | null; rate: number | null };
  earlyCheers: {
    treatment: { users: number; completed: number };
    holdout: { users: number; completed: number };
    liftPts: number | null;
    z: number | null;
    pValue: number | null;
  };
  grace: { activeUsers: number; applied: number; appliedPerActiveUser: number | null };
  guardrails: { cheersSent: number; senders: number; maxPerSender: number; p95PerSender: number };
}

interface Subject extends RetentionSubject {
  id: string;
}

const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);
const pts = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : Math.round((a - b) * 1000) / 10;

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf), for a two-sided p. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
    Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Two-proportion z-test. Null when either arm is empty or the pooled rate is 0 or 1. */
export function twoProportionZ(c1: number, n1: number, c2: number, n2: number): { z: number; pValue: number } | null {
  if (n1 === 0 || n2 === 0) return null;
  const pooled = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return null;
  const z = (c1 / n1 - c2 / n2) / se;
  return { z: Math.round(z * 1000) / 1000, pValue: Math.round(2 * (1 - normalCdf(Math.abs(z))) * 10000) / 10000 };
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

function subjects(): Subject[] {
  return getStore()
    .where<User>('users', isMemberAccount)
    .map((user) => ({
      id: user.id,
      signupDate: localDateFor(user.timezone, new Date(user.createdAt)),
      activeDates: activeDatesOf(loadActivity(user.id)),
      surface: typeof user.tgId === 'number' ? 'telegram' : 'other',
    }));
}

/**
 * At least three active days in the seven from `dayZero`, or null while week
 * one is not over. `dayZero` is the one stored with the arm, so the analysis
 * counts the same week the treatment ran in.
 */
function completedWeekOne(s: Subject, dayZero: string, today: string): boolean | null {
  if (daysBetween(dayZero, today) < 7) return null;
  let days = 0;
  for (let i = 0; i < 7; i += 1) if (s.activeDates.has(addDays(dayZero, i))) days += 1;
  return days >= 3;
}

export async function engageMetrics(today: string, seasonNumber: number = seasonFor(today).number): Promise<EngageMetrics> {
  const repo = engageRepo();
  const season = seasonByNumber(seasonNumber);
  const people = subjects();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const since28 = addDays(today, -27);

  // Share rate and share-to-install, both over member accounts only.
  const members = new Set(people.map((s) => s.id));
  const weeklyActive = people.filter((s) => last7.some((d) => s.activeDates.has(d))).length;
  const weekStartIso = `${addDays(today, -6)}T00:00:00.000Z`;
  const sharers = new Set(
    getStore()
      .where<GrowthEvent>('audit', (d) => (d as GrowthEvent).type === 'growthEvent')
      .filter((e) => e.userId && members.has(e.userId) && SHARE_EVENTS.has(e.name) && e.createdAt >= weekStartIso)
      .map((e) => e.userId!),
  ).size;
  const [landed28d, attributed28d] = await Promise.all([
    repo.landingsSince(since28),
    repo.shareAttributionsSince(`${since28}T00:00:00.000Z`),
  ]);

  // Squad D30 lift: people who joined a squad in their first seven days,
  // against people from the same signup weeks who never joined one. Only
  // people whose day 30 has passed are counted, so this week's signups do not
  // hold the whole figure back.
  const firstJoins = new Map((await repo.squadFirstJoins()).map((j) => [j.userId, j.joinedAt.slice(0, 10)]));
  const measurable = people.filter((s) => addDays(s.signupDate, Math.max(...D30_OFFSETS)) <= today);
  const squadCohort = measurable.filter((s) => {
    const joined = firstJoins.get(s.id);
    return joined !== undefined && daysBetween(s.signupDate, joined) < 7;
  });
  const squadWeeks = new Set(squadCohort.map((s) => weekStartOf(s.signupDate)));
  const soloCohort = measurable.filter((s) => !firstJoins.has(s.id) && squadWeeks.has(weekStartOf(s.signupDate)));
  const d30 = (cohort: Subject[]) => {
    const kept = cohort.length > 0 ? retained(cohort, D30_OFFSETS, today) : null;
    return kept === null ? null : kept / cohort.length;
  };
  const squadD30 = d30(squadCohort);
  const soloD30 = d30(soloCohort);

  // Season re-enrolment: season N enrollees who enrolled again in N+1.
  const enrolledThen = await repo.enrolledUsers(seasonNumber);
  const nextOpen = seasonFor(today).number > seasonNumber;
  const enrolledNext = nextOpen ? new Set(await repo.enrolledUsers(seasonNumber + 1)) : null;
  const reenrolled = enrolledNext ? enrolledThen.filter((id) => enrolledNext.has(id)).length : null;

  // Early cheers: week-one completion by arm.
  const arms = new Map((await repo.armsOf('early_cheers')).map((a) => [a.userId, a]));
  const tally = { treatment: { users: 0, completed: 0 }, holdout: { users: 0, completed: 0 } };
  for (const s of people) {
    const placed = arms.get(s.id);
    const completed = placed ? completedWeekOne(s, placed.dayZero, today) : null;
    if (!placed || completed === null) continue;
    tally[placed.arm].users += 1;
    if (completed) tally[placed.arm].completed += 1;
  }
  const test = twoProportionZ(tally.treatment.completed, tally.treatment.users, tally.holdout.completed, tally.holdout.users);

  // Grace and the cheer-volume guardrail, for the season.
  const seasonActive = people.filter((s) => [...s.activeDates].some((d) => d >= season.startsOn && d <= season.endsOn)).length;
  const [applied, perSender] = await Promise.all([
    repo.graceAppliedIn(seasonNumber),
    repo.cheersPerSender(season.startsOn, season.endsOn),
  ]);

  return {
    today,
    season: { number: season.number, name: season.name, startsOn: season.startsOn, endsOn: season.endsOn },
    share: {
      weeklyActive,
      sharers,
      shareRate: ratio(sharers, weeklyActive),
      landed28d,
      attributed28d,
      shareToInstall: ratio(attributed28d, landed28d),
    },
    squads: {
      squadUsers: squadCohort.length,
      squadD30,
      soloUsers: soloCohort.length,
      soloD30,
      liftPts: pts(squadD30, soloD30),
    },
    reenrolment: {
      fromSeason: seasonNumber,
      enrolled: enrolledThen.length,
      reenrolled,
      rate: reenrolled === null ? null : ratio(reenrolled, enrolledThen.length),
    },
    earlyCheers: {
      ...tally,
      liftPts: pts(ratio(tally.treatment.completed, tally.treatment.users), ratio(tally.holdout.completed, tally.holdout.users)),
      z: test?.z ?? null,
      pValue: test?.pValue ?? null,
    },
    grace: { activeUsers: seasonActive, applied, appliedPerActiveUser: ratio(applied, seasonActive) },
    guardrails: {
      cheersSent: perSender.reduce((a, b) => a + b, 0),
      senders: perSender.length,
      maxPerSender: perSender.length > 0 ? Math.max(...perSender) : 0,
      p95PerSender: percentile(perSender, 95),
    },
  };
}
