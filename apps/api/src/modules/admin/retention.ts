/**
 * Retention baseline (AZF-W3-05 §1 Phase 0 exit, §6.2).
 *
 * Every Phase 1 hypothesis is stated as a relative change in retention, and
 * until this existed nothing in the product measured retention at all. It is
 * derived on read from activity the store already holds, the same way XP and
 * consistency are: no new tracking, no event to forget to emit, no counter to
 * drift, and the numbers can be recomputed for any past cohort after the fact.
 *
 * Definitions, chosen to be boring and comparable:
 *
 *  - **Active day**: the one definition the rest of the product uses
 *    (`activeDatesOf` in progress/service): a meal, water or weigh-in log, or a
 *    completed workout, on a local date.
 *  - **Signup day**: the user's local calendar date of `createdAt`, in their
 *    stored timezone, so day 1 means the user's tomorrow and not the server's.
 *    requireAuth records that zone from the client's X-Timezone on the first
 *    authenticated request; an account never seen since then reads as UTC.
 *  - **D1 / D7**: active on signup day + 1 / + 7. **D30**: active on any of
 *    days 28 to 31, the AZF-W3-02 definition, kept so the baseline is
 *    comparable with the targets written against it.
 *  - **Not yet measurable is null, never zero.** A cohort that signed up five
 *    days ago has no D7 yet; reporting 0 would draw a cliff that is only the
 *    calendar.
 *  - **Weekly active loggers**: of the users active at least once in the last
 *    28 days, how many were active on 3 or more of the last 7. Split by
 *    account surface: a linked Telegram account counts as `telegram`, any other
 *    as `other`. That is a property of the account, not of each session, and
 *    is labelled as such rather than passed off as per-surface usage.
 *
 * Pure functions over plain inputs, plus one store adapter at the bottom, so
 * the arithmetic is tested without a store and the adapter stays thin.
 */
import type { User } from '@aquazerofit/shared';
import { addDays, localDateFor } from '../../platform/dates';
import { getStore } from '../../platform/store';
import { activeDatesOf, loadActivity } from '../progress/service';

export interface RetentionSubject {
  signupDate: string;
  activeDates: ReadonlySet<string>;
  surface: AccountSurface;
}

export type AccountSurface = 'telegram' | 'other';

export interface RetentionCohort {
  /** Monday of the signup week. */
  weekOf: string;
  users: number;
  /** Retained counts; null until every member's window has passed. */
  d1: number | null;
  d7: number | null;
  d30: number | null;
}

export interface WeeklyActiveLoggers {
  surface: AccountSurface;
  /** Active at least once in the last 28 days. */
  monthlyActive: number;
  /** Of those, active on 3 or more of the last 7 days. */
  weeklyActiveLoggers: number;
}

export interface RetentionReport {
  today: string;
  cohorts: RetentionCohort[];
  weeklyActiveLoggers: WeeklyActiveLoggers[];
}

const D30_FIRST = 28;
const D30_LAST = 31;
const WAL_MIN_DAYS = 3;

function mondayOf(isoDate: string): string {
  const dayOfWeek = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(isoDate, -((dayOfWeek + 6) % 7));
}

function activeOnAny(dates: ReadonlySet<string>, from: string, offsets: readonly number[]): boolean {
  return offsets.some((offset) => dates.has(addDays(from, offset)));
}

/**
 * Count the members retained on `offsets` (days after signup), or null when
 * the last of those days is not over for any member (today included, since a
 * member can still log later today): the cohort is measured whole or not at
 * all, so a partly elapsed day or week cannot read as a drop.
 */
function retained(
  members: readonly RetentionSubject[],
  offsets: readonly number[],
  today: string,
): number | null {
  const last = Math.max(...offsets);
  if (members.some((m) => addDays(m.signupDate, last) >= today)) return null;
  return members.filter((m) => activeOnAny(m.activeDates, m.signupDate, offsets)).length;
}

/** Signup-week cohorts for the last `weeks` weeks (including this one), newest first. */
export function cohortRetention(
  subjects: readonly RetentionSubject[],
  today: string,
  weeks: number,
): RetentionCohort[] {
  const oldest = addDays(mondayOf(today), -7 * (weeks - 1));
  const byWeek = new Map<string, RetentionSubject[]>();
  for (const subject of subjects) {
    const week = mondayOf(subject.signupDate);
    if (week < oldest || subject.signupDate > today) continue;
    byWeek.set(week, [...(byWeek.get(week) ?? []), subject]);
  }
  const d30Offsets = Array.from({ length: D30_LAST - D30_FIRST + 1 }, (_, i) => D30_FIRST + i);
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekOf, members]) => ({
      weekOf,
      users: members.length,
      d1: retained(members, [1], today),
      d7: retained(members, [7], today),
      d30: retained(members, d30Offsets, today),
    }));
}

export function weeklyActiveLoggers(
  subjects: readonly RetentionSubject[],
  today: string,
): WeeklyActiveLoggers[] {
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(today, -i));
  const last7 = last28.slice(0, 7);
  return (['telegram', 'other'] as const).map((surface) => {
    const monthly = subjects.filter(
      (s) => s.surface === surface && last28.some((d) => s.activeDates.has(d)),
    );
    return {
      surface,
      monthlyActive: monthly.length,
      weeklyActiveLoggers: monthly.filter(
        (s) => last7.filter((d) => s.activeDates.has(d)).length >= WAL_MIN_DAYS,
      ).length,
    };
  });
}

function isMemberAccount(doc: { id: string }): doc is User {
  const d = doc as User & { type?: string };
  return (d.type === undefined || d.type === 'user') && typeof d.email === 'string' && d.role !== 'admin';
}

/**
 * The report over every member account. Admin accounts are excluded: they are
 * staff, and the seeded ones would otherwise sit in the first cohort forever.
 * O(users x their logs) through the indexed activity reads, which is fine for
 * an admin-only report on a single-instance store and is the point at which to
 * revisit if the user base grows by orders of magnitude.
 */
export function retentionReport(today: string, weeks: number): RetentionReport {
  const subjects: RetentionSubject[] = getStore()
    .where<User>('users', isMemberAccount)
    .map((user) => ({
      signupDate: localDateFor(user.timezone, new Date(user.createdAt)),
      activeDates: activeDatesOf(loadActivity(user.id)),
      surface: typeof user.tgId === 'number' ? 'telegram' : 'other',
    }));
  return {
    today,
    cohorts: cohortRetention(subjects, today, weeks),
    weeklyActiveLoggers: weeklyActiveLoggers(subjects, today),
  };
}
