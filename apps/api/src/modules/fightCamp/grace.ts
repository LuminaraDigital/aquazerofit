/**
 * Cut Man grace days (AZF-P1 Epic E): a forgiving rhythm that is earned and
 * never bought.
 *
 *  - Earned: one Cut Man day for every seven active days inside a season,
 *    banked up to two, carried across seasons (US-E1).
 *  - Applied: when missed days in the last week would end the consistency
 *    run, banked days bridge them (US-E2), and the built-in grace day covers
 *    the next miss back. A bridged day is a separate set the consistency run
 *    reads; it is never an active day, so belts, squad points and recap
 *    totals cannot see it.
 *  - Spent only on return: a bridge is written once something has been
 *    logged after the gap. Until then it is "standing by": the run shows as
 *    carried and nothing leaves the bank, so a week away costs nothing.
 *
 * The ledger is append-only and written only from here, inside the user's
 * grace lock, in an order chosen so the cap never clips a day that a bridge
 * in the same sync was about to spend. No route, product, invoice or admin
 * tool can add to it: a static test walks the import graph from every
 * billing and payments module to prove none can reach this file (US-E1 AC2).
 */
import {
  GRACE_BANK_MAX,
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
import { logError, logEvent } from '../../platform/telemetry';
import { activeDatesOf, loadActivity, planCutManBridges } from '../progress/service';
import { fcEnabled } from './flags';
import { engageRepo, type GraceRow } from './repo';

export interface GraceSync {
  view: GraceView;
  /** Bridged and standing-by dates, for computeConsistency. */
  bridged: ReadonlySet<string>;
}

/** Each season's earn milestones (7, 14, 21 ...) with the date that reached them. */
function milestones(activeDates: ReadonlySet<string>, today: string): Array<{ seasonNumber: number; milestone: number; localDate: string }> {
  // The same dates a belt counts: inside a season (not before the anchor)
  // and not in the future.
  const bySeason = new Map<number, string[]>();
  for (const date of [...activeDates].sort()) {
    if (date < SEASON_ONE_STARTS_ON || date > today) continue;
    const season = seasonNumberFor(date);
    bySeason.set(season, [...(bySeason.get(season) ?? []), date]);
  }
  const out = [];
  for (const [seasonNumber, dates] of bySeason) {
    for (let milestone = GRACE_EARN_EVERY_ACTIVE_DAYS; milestone <= dates.length; milestone += GRACE_EARN_EVERY_ACTIVE_DAYS) {
      out.push({ seasonNumber, milestone, localDate: dates[milestone - 1]! });
    }
  }
  return out;
}

interface Evaluation {
  /** New rows in the order they must be written. */
  writes: GraceRow[];
  standBy: string[];
  /** Every row as it will stand once `writes` are appended. */
  after: GraceRow[];
}

/**
 * Decide what the ledger should gain, without writing it. Pure over the
 * ledger and the activity it is handed.
 *
 * Write order: a bridge is written while the bank can pay for it, and a new
 * earn only when the bank is empty or every bridge is paid. Earning first
 * could hit the cap of two and drop a day that the bridge was about to free
 * room for.
 */
function evaluate(userId: string, entries: readonly GraceRow[], activeDates: ReadonlySet<string>, today: string, at: string): Evaluation {
  const held = new Set(entries.filter((g) => g.entry === 'earned').map((g) => `${g.seasonNumber}:${g.milestone}`));
  const earns: GraceRow[] = milestones(activeDates, today)
    .filter((m) => !held.has(`${m.seasonNumber}:${m.milestone}`))
    .map((m) => ({ id: newId('grace'), userId, entry: 'earned', ...m, createdAt: at }));
  const bridged = new Set(entries.filter((g) => g.entry === 'applied').map((g) => g.localDate));
  const plan = planCutManBridges(activeDates, today, bridged, graceBank(entries) + earns.length);

  const writes: GraceRow[] = [];
  let bank = graceBank(entries);
  const pendingEarns = [...earns];
  for (const localDate of plan.commit) {
    while (bank === 0 && pendingEarns.length > 0) {
      writes.push(pendingEarns.shift()!);
      bank = Math.min(GRACE_BANK_MAX, bank + 1);
    }
    writes.push({
      id: newId('grace'),
      userId,
      entry: 'applied',
      seasonNumber: seasonNumberFor(localDate),
      localDate,
      milestone: null,
      createdAt: at,
    });
    bank -= 1;
  }
  writes.push(...pendingEarns);
  return { writes, standBy: plan.standBy, after: [...entries, ...writes] };
}

function syncOf(after: readonly GraceRow[], standBy: readonly string[], activeDates: ReadonlySet<string>, today: string): GraceSync {
  const applied = after.filter((g) => g.entry === 'applied').map((g) => g.localDate).sort();
  const activeThisSeason = activeDaysBySeason(activeDates, today).get(seasonFor(today).number) ?? 0;
  return {
    view: {
      banked: graceBank(after),
      nextEarnInActiveDays: nextGraceInActiveDays(activeThisSeason),
      lastApplied: applied.at(-1) ?? null,
      standingBy: standBy.length > 0,
    },
    bridged: new Set([...applied, ...standBy]),
  };
}

/**
 * Bring the ledger up to date with the user's activity and return the bank
 * and the bridged dates. Writes only what is new, under the user's lock, so
 * the dashboard's parallel reads cannot plan against a stale ledger.
 */
export async function syncGrace(
  userId: string,
  today: string,
  now: Date = new Date(),
  activeDates: ReadonlySet<string> = activeDatesOf(loadActivity(userId)),
): Promise<GraceSync> {
  return engageRepo().withGraceLedger(userId, async (ledger) => {
    const entries = await ledger.entries();
    const { writes, standBy } = evaluate(userId, entries, activeDates, today, now.toISOString());
    if (writes.length > 0) await ledger.append(writes);
    // Re-read: a unique rule may have refused a row, and the view must say
    // what the ledger holds, not what this sync hoped to write.
    const after = writes.length > 0 ? await ledger.entries() : entries;
    const fresh = after.slice(entries.length);
    const banked = graceBank(after);
    const earned = fresh.filter((g) => g.entry === 'earned').length;
    if (earned > 0) logEvent('grace_earned', { season: seasonFor(today).number, count: earned, banked_after: banked });
    for (const row of fresh.filter((g) => g.entry === 'applied')) {
      logEvent('grace_applied', { season: row.seasonNumber, banked_after: banked });
    }
    return syncOf(after, standBy, activeDates, today);
  });
}

/**
 * The same answer as syncGrace with nothing written, for surfaces that only
 * describe the run (the coach card). Safe to call on any read path.
 */
export async function readGrace(
  userId: string,
  today: string,
  activeDates: ReadonlySet<string> = activeDatesOf(loadActivity(userId)),
): Promise<GraceSync> {
  const entries = await engageRepo().graceEntries(userId);
  const { after, standBy } = evaluate(userId, entries, activeDates, today, new Date().toISOString());
  return syncOf(after, standBy, activeDates, today);
}

/**
 * Bridged dates for an R1a surface (the progress summary, the coach card),
 * or undefined when Cut Man is off for the user. Never throws: a Fight Camp
 * database fault degrades to the un-bridged run rather than failing a route
 * that worked before Fight Camp existed. `write` syncs the ledger; without
 * it the answer is computed and nothing is stored.
 */
export async function bridgesForDisplay(
  userId: string,
  today: string,
  activeDates: ReadonlySet<string>,
  opts: { write: boolean },
): Promise<ReadonlySet<string> | undefined> {
  if (!fcEnabled('grace', userId)) return undefined;
  try {
    const grace = opts.write
      ? await syncGrace(userId, today, new Date(), activeDates)
      : await readGrace(userId, today, activeDates);
    return grace.bridged;
  } catch (err) {
    logError(err, { route: 'fightCamp.grace' });
    return undefined;
  }
}
