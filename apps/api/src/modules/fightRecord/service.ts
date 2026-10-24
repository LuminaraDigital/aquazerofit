/**
 * Fight Record service: seasons, Consistency Belts and their celebration
 * (AZF-W3-05 §3, §4).
 *
 * Belts are derived the way XP is: a pure fold over activity the store already
 * holds (`activeDatesOf`, the one definition of an active day), through the
 * shared calendar and ladder in `@aquazerofit/shared/fightRecord`. What is
 * stored is only what has to survive a change to that activity:
 *
 *  - **Awards are immutable events.** The first read that finds a rung reached
 *    writes it, with an id derived from (user, season, tier), so a retry or a
 *    second tab writes the same document rather than a second one. Deleting a
 *    log later can lower the derived count; it cannot take the belt back.
 *    Earned once, kept: the same rule the achievement high-water mark follows
 *    in progress/service.
 *  - **Awards are retroactive.** Every season with activity is evaluated, so a
 *    season someone trained through without opening Fight Record is still on
 *    their record the next time they do.
 *
 * Writing on a read is the posture huddle progress already takes
 * (challenges/service). It is safe here because the store is single-instance
 * and synchronous, so the existence check and the write cannot interleave, and
 * because a read writes at most five documents per user per season.
 */
import { createHash } from 'node:crypto';
import {
  BELT_LADDER,
  activeDaysBySeason,
  daysLeftIn,
  seasonByNumber,
  seasonFor,
  tierRank,
  type BeltAwardView,
  type BeltTier,
  type EmojiStatusSetting,
  type FightRecordStatus,
  type Season,
  type User,
} from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { AppError } from '../../platform/errors';
import { getStore, indexKey, LOGS_BY_USER_TYPE } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { activeDatesOf, loadActivity } from '../progress/service';
import { auditDataAccess, getProfile, type ProfileDoc } from '../me/service';
import { getFightRecordState, saveFightRecordState } from './state';
import {
  EMOJI_STATUS_CONSENT_VERSION,
  clearEmojiStatus,
  emojiStatusAvailable,
  isAccessRevoked,
  sendEmojiStatus,
  syncEmojiStatus,
} from './emojiStatus';

/** An awarded belt. Immutable once written; erased only with the account. */
export interface BeltAward {
  id: string;
  type: 'beltAward';
  userId: string;
  seasonId: string;
  seasonNumber: number;
  tier: BeltTier;
  /** The rung's threshold, not the user's total: the award states the bar met. */
  activeDays: number;
  awardedAt: string;
}

export const beltAwardId = (userId: string, seasonNumber: number, tier: BeltTier): string =>
  `belt-${userId}-s${seasonNumber}-${tier}`;

/**
 * The id a client sees and acknowledges with. The stored id embeds the user id
 * (that is what makes the write idempotent per user); this one does not, so no
 * response carries an identifier, and an id copied from someone else's screen
 * resolves against the caller's own awards and nobody else's.
 */
export const beltViewId = (seasonNumber: number, tier: BeltTier): string =>
  `s${seasonNumber}-${tier}`;

// ----- rollout and gating -----

/**
 * Stable 0-99 bucket for the percentage rollout. Salted with the feature name
 * so a future rollout keyed the same way does not select the same people.
 */
export function rolloutBucket(userId: string): number {
  const digest = createHash('sha256').update(`fight-record:${userId}`).digest('hex');
  return parseInt(digest.slice(0, 8), 16) % 100;
}

export function fightRecordEnabledFor(userId: string): boolean {
  return config.fightRecordEnabled && rolloutBucket(userId) < config.fightRecordRolloutPercent;
}

/**
 * The single age predicate for every public Fight Record surface. Age is the
 * self-declared profile field (16 to 100). No profile means not known to be an
 * adult, so the answer fails closed.
 */
export function isAdult(profile: Pick<ProfileDoc, 'age'> | undefined): boolean {
  return typeof profile?.age === 'number' && profile.age >= 18;
}

// ----- awards -----

function awardsOf(userId: string): BeltAward[] {
  return getStore().whereIndexed<BeltAward>(
    'logs',
    LOGS_BY_USER_TYPE,
    indexKey(userId, 'beltAward'),
    (d) => d.type === 'beltAward' && d.userId === userId,
  );
}

/** Highest award per season, newest season first: the shelf. */
function bestPerSeason(awards: readonly BeltAward[]): BeltAward[] {
  const best = new Map<number, BeltAward>();
  for (const award of awards) {
    const held = best.get(award.seasonNumber);
    if (!held || tierRank(award.tier) > tierRank(held.tier)) best.set(award.seasonNumber, award);
  }
  return [...best.values()].sort((a, b) => b.seasonNumber - a.seasonNumber);
}

/**
 * Write every rung reached, in every season with activity, that is not already
 * held. Returns all of the user's awards afterwards.
 */
function syncAwards(
  userId: string,
  daysBySeason: ReadonlyMap<number, number>,
  currentSeason: number,
  now: Date,
): BeltAward[] {
  const held = awardsOf(userId);
  const heldIds = new Set(held.map((award) => award.id));
  const fresh: BeltAward[] = [];

  for (const [seasonNumber, days] of daysBySeason) {
    const season = seasonByNumber(seasonNumber);
    for (const rung of BELT_LADDER) {
      if (days < rung.activeDays) break;
      const id = beltAwardId(userId, seasonNumber, rung.tier);
      if (heldIds.has(id)) continue;
      fresh.push({
        id,
        type: 'beltAward',
        userId,
        seasonId: season.id,
        seasonNumber,
        tier: rung.tier,
        activeDays: rung.activeDays,
        awardedAt: now.toISOString(),
      });
    }
  }

  for (const award of fresh) {
    getStore().upsert('logs', award);
    logEvent('fight_record_belt_awarded', {
      tier: award.tier,
      seasonNumber: award.seasonNumber,
      retroactive: award.seasonNumber < currentSeason,
    });
  }
  return [...held, ...fresh];
}

interface Standing {
  season: Season;
  activeDays: number;
  awards: BeltAward[];
  /**
   * Highest belt held this season. Always at least the derived tier, because
   * syncAwards has just written every rung the count reaches; it is higher
   * only when deleted logs have since lowered the count.
   */
  tier: BeltTier | null;
}

function standingOf(userId: string, today: string, now: Date): Standing {
  const season = seasonFor(today);
  const daysBySeason = activeDaysBySeason(activeDatesOf(loadActivity(userId)), today);
  const awards = syncAwards(userId, daysBySeason, season.number, now);
  const current = bestPerSeason(awards.filter((award) => award.seasonNumber === season.number));
  return {
    season,
    activeDays: daysBySeason.get(season.number) ?? 0,
    awards,
    tier: current[0]?.tier ?? null,
  };
}

function viewOf(award: BeltAward): BeltAwardView {
  return {
    id: beltViewId(award.seasonNumber, award.tier),
    seasonNumber: award.seasonNumber,
    seasonName: seasonByNumber(award.seasonNumber).name,
    tier: award.tier,
    awardedAt: award.awardedAt,
  };
}

// ----- read model -----

export function readFightRecord(
  userId: string,
  today: string,
  now: Date = new Date(),
): FightRecordStatus {
  const { season, activeDays, awards, tier } = standingOf(userId, today, now);
  const state = getFightRecordState(userId);
  const celebrated = new Set(state.celebratedAwardIds);
  const celebrate = bestPerSeason(awards.filter((award) => !celebrated.has(award.id)))[0];

  const user = getStore().byId<User>('users', userId);
  const adult = isAdult(getProfile(userId));
  const emojiStatus: EmojiStatusSetting = {
    available: emojiStatusAvailable(user, adult),
    enabled: false,
  };
  emojiStatus.enabled = emojiStatus.available && state.emojiStatus.enabled;

  const lastSet = state.emojiStatus.lastSet;
  if (
    emojiStatus.enabled &&
    tier !== null &&
    (lastSet?.seasonId !== season.id || lastSet.tier !== tier)
  ) {
    void syncEmojiStatus(userId, user!.tgId!, season, tier);
  }

  return {
    current: {
      season,
      activeDays,
      daysLeft: daysLeftIn(season, today),
      tier,
      // The rung above the belt actually held, not above the raw count: after
      // a deleted log the count can sit below a belt already earned, and
      // "4 days to purple" on a purple belt would be a lie.
      next: BELT_LADDER[tierRank(tier) + 1] ?? null,
    },
    ladder: BELT_LADDER,
    belts: bestPerSeason(awards).map(viewOf),
    celebrate: celebrate ? viewOf(celebrate) : null,
    adult,
    emojiStatus,
  };
}

/**
 * Mark a displayed celebration seen. Also marks every lower belt from the same
 * season and everything from earlier seasons: a returning user who has just
 * been shown their newest belt must not then be walked through a queue of
 * stale ones. `viewId` is the client-facing id (beltViewId); one that matches
 * none of the caller's awards was never displayed to them, so it is ignored
 * rather than reported.
 */
export function acknowledgeBelt(userId: string, viewId: string): void {
  const awards = awardsOf(userId);
  const shown = awards.find((award) => beltViewId(award.seasonNumber, award.tier) === viewId);
  if (!shown) return;

  const state = getFightRecordState(userId);
  const celebrated = new Set(state.celebratedAwardIds);
  const before = celebrated.size;
  for (const award of awards) {
    const subsumed =
      award.seasonNumber < shown.seasonNumber ||
      (award.seasonNumber === shown.seasonNumber && tierRank(award.tier) <= tierRank(shown.tier));
    if (subsumed) celebrated.add(award.id);
  }
  if (celebrated.size === before) return;
  saveFightRecordState({ ...state, celebratedAwardIds: [...celebrated] });
}

// ----- emoji status preference -----

/**
 * Opt in or out of the belt as Telegram emoji status.
 *
 * Opting in happens after Telegram's own permission prompt in the Mini App.
 * When a belt is already held it is sent straight away, and the preference is
 * stored only if Telegram accepts: a refusal stores nothing and answers
 * CONFLICT, so the toggle never shows "on" for a status nobody can see.
 * Grants and withdrawals are written to the append-only audit trail with the
 * consent copy version.
 */
export async function setEmojiStatusPreference(
  userId: string,
  enabled: boolean,
  today: string,
  now: Date = new Date(),
): Promise<EmojiStatusSetting> {
  const user = getStore().byId<User>('users', userId);
  const available = emojiStatusAvailable(user, isAdult(getProfile(userId)));
  const state = getFightRecordState(userId);

  if (!enabled) {
    if (state.emojiStatus.enabled) {
      saveFightRecordState({
        ...state,
        emojiStatus: { ...state.emojiStatus, enabled: false, lastSet: null, updatedAt: now.toISOString() },
      });
      auditDataAccess(userId, 'fightRecord.emojiStatus.withdrawn', {
        consentTextVersion: state.emojiStatus.consentTextVersion,
      });
      if (typeof user?.tgId === 'number') void clearEmojiStatus(user.tgId);
    }
    return { available, enabled: false };
  }

  if (!available || typeof user?.tgId !== 'number') {
    throw new AppError('FORBIDDEN', 'The belt emoji status is not available for this account.');
  }

  const { season, tier } = standingOf(userId, today, now);
  if (tier !== null) {
    const result = await sendEmojiStatus(user.tgId, season, tier);
    if (!result.ok) {
      logEvent('fight_record_emoji_status_failed', { tier, revoked: isAccessRevoked(result.error) });
      throw new AppError(
        'CONFLICT',
        'Telegram did not accept the status. Allow AquaZeroFit to manage your emoji status, then try again.',
      );
    }
    logEvent('fight_record_emoji_status_set', { tier });
  }

  // Re-read: the Telegram call above may have spanned another write.
  const latest = getFightRecordState(userId);
  saveFightRecordState({
    ...latest,
    emojiStatus: {
      enabled: true,
      consentTextVersion: EMOJI_STATUS_CONSENT_VERSION,
      lastSet: tier === null ? null : { seasonId: season.id, tier },
      updatedAt: now.toISOString(),
    },
  });
  auditDataAccess(userId, 'fightRecord.emojiStatus.granted', {
    consentTextVersion: EMOJI_STATUS_CONSENT_VERSION,
  });
  return { available: true, enabled: true };
}
