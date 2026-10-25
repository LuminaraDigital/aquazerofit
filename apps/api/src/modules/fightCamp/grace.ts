/**
 * Cut Man grace days (AZF-P1 Epic E): a forgiving rhythm that is earned and
 * never bought.
 *
 *  - Earned: one Cut Man day for every seven active days inside a season,
 *    banked up to two, carried across seasons (US-E1).
 *  - Applied: when a missed day in the last seven would end the consistency
 *    run and the built-in grace day is already used, a banked day bridges it
 *    (US-E2). A bridged day is a separate set the consistency run reads; it
 *    is never an active day, so belts, squad points and recap totals cannot
 *    see it.
 *
 * The ledger is append-only and written only from here. No route, product,
 * invoice or admin tool can add to it, and a static test walks the import
 * graph from every billing and payments module to prove none can reach this
 * file (US-E1 AC2).
 *
 * Like belts, grace is synchronised on read. Every write is idempotent on a
 * unique rule (one earn per season milestone, one bridge per date), so two
 * tabs reading at once write the same rows, not twice as many.
 */
import {
  GRACE_EARN_EVERY_ACTIVE_DAYS,
  SEASON_ONE_STARTS_ON,
  activeDaysBySeason,
  graceBank,
  nextGraceInActiveDays,
  seasonFor,
  seasonNumberFor,
  type GraceView,
} from '@aquazerofit/shared';
import { newId } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { activeDatesOf, loadActivity, planCutManBridges } from '../progress/service';
import { engageRepo, type GraceRow } from './repo';

/** Each season's earn milestones (7, 14, 21 ...) with the date that reached them. */
function earnedRows(userId: string, activeDates: ReadonlySet<string>, today: string, at: string): GraceRow[] {
  // The same dates a belt counts: inside a season (not before the anchor)
  // and not in the future.
  const bySeason = new Map<number, string[]>();
  for (const date of [...activeDates].sort()) {
    if (date < SEASON_ONE_STARTS_ON || date > today) continue;
    const season = seasonNumberFor(date);
    bySeason.set(season, [...(bySeason.get(season) ?? []), date]);
  }
  const rows: GraceRow[] = [];
  for (const [seasonNumber, dates] of bySeason) {
    for (let milestone = GRACE_EARN_EVERY_ACTIVE_DAYS; milestone <= dates.length; milestone += GRACE_EARN_EVERY_ACTIVE_DAYS) {
      rows.push({
        id: newId('grace'),
        userId,
        entry: 'earned',
        seasonNumber,
        localDate: dates[milestone - 1]!,
        milestone,
        createdAt: at,
      });
    }
  }
  return rows;
}

export interface GraceSync {
  view: GraceView;
  /** Every date Cut Man has ever bridged, for computeConsistency. */
  bridged: ReadonlySet<string>;
}

/**
 * Bring the ledger up to date with the user's activity and return the bank
 * and the bridged dates. Writes only what is new.
 */
export async function syncGrace(userId: string, today: string, now: Date = new Date()): Promise<GraceSync> {
  const repo = engageRepo();
  const activeDates = activeDatesOf(loadActivity(userId));
  const at = now.toISOString();

  const known = await repo.graceEntries(userId);
  const heldMilestones = new Set(
    known.filter((g) => g.entry === 'earned').map((g) => `${g.seasonNumber}:${g.milestone}`),
  );
  const fresh = earnedRows(userId, activeDates, today, at).filter(
    (row) => !heldMilestones.has(`${row.seasonNumber}:${row.milestone}`),
  );
  if (fresh.length > 0) await repo.addGrace(fresh);

  let entries = fresh.length > 0 ? await repo.graceEntries(userId) : known;
  const bridged = new Set(entries.filter((g) => g.entry === 'applied').map((g) => g.localDate));
  const plan = planCutManBridges(activeDates, today, bridged, graceBank(entries));
  if (plan.length > 0) {
    // One millisecond after the earns, so the fold sees an earn written in
    // this same read before the bridge it pays for.
    const appliedAt = new Date(now.getTime() + 1).toISOString();
    const added = await repo.addGrace(
      plan.map((localDate) => ({
        id: newId('grace'),
        userId,
        entry: 'applied' as const,
        seasonNumber: seasonNumberFor(localDate),
        localDate,
        milestone: null,
        createdAt: appliedAt,
      })),
    );
    if (added > 0) entries = await repo.graceEntries(userId);
  }

  const banked = graceBank(entries);
  const earnedNow = fresh.length;
  const appliedNow = entries.filter((g) => g.entry === 'applied' && !bridged.has(g.localDate));
  if (earnedNow > 0) logEvent('grace_earned', { season: seasonFor(today).number, count: earnedNow, banked_after: banked });
  for (const row of appliedNow) logEvent('grace_applied', { season: row.seasonNumber, banked_after: banked });

  const applied = entries.filter((g) => g.entry === 'applied').map((g) => g.localDate).sort();
  const activeThisSeason = activeDaysBySeason(activeDates, today).get(seasonFor(today).number) ?? 0;
  return {
    view: {
      banked,
      nextEarnInActiveDays: nextGraceInActiveDays(activeThisSeason),
      lastApplied: applied.at(-1) ?? null,
    },
    bridged: new Set(applied),
  };
}
