/**
 * The belt as the user's Telegram emoji status (AZF-W3-05 §3.4, US-07).
 *
 * The Mini App asks Telegram for permission (`requestEmojiStatusAccess`, Bot
 * API 8.0); from then on the bot can set the status with `setUserEmojiStatus`
 * and this file keeps it in step with the user's belt. Three choices shape it:
 *
 *  - **Every status expires at season end.** Telegram clears it by itself, so
 *    a user who lapses is not left advertising last season's belt, no job has
 *    to remember to take it down, and the next season starts clean on the
 *    profile as well as in the app.
 *  - **A revoked grant is discovered, not polled.** A user can withdraw access
 *    inside Telegram without telling us. The next update fails, and a failure
 *    that reads as a permission refusal turns the preference off so the same
 *    refusal is not retried on every dashboard load. A transport failure leaves
 *    it on, to be retried by the next read.
 *  - **Nothing here can throw into a request.** Updates on the read path are
 *    fire-and-forget; the dashboard must never wait on, or fail because of,
 *    Telegram.
 *
 * Kept apart from service.ts so that account erasure (me/service) can clear a
 * status without importing the service, which itself depends on me/service.
 */
import type { BeltTier, Season, User } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { addDays } from '../../platform/dates';
import { logEvent } from '../../platform/telemetry';
import { botConfigured, setUserEmojiStatus, type BotResult } from '../payments/telegramBot';
import { getFightRecordState, saveFightRecordState } from './state';

/** Recorded with every grant. Bump it whenever the consent copy changes. */
export const EMOJI_STATUS_CONSENT_VERSION = 'fight-record-emoji-status-1';

/**
 * Adult, linked to Telegram, on a deployment whose bot and belt emoji set are
 * both configured. The status is visible to everyone the user chats with, so
 * it is a public surface and never offered to a minor.
 */
export function emojiStatusAvailable(user: User | undefined, adult: boolean): boolean {
  return (
    adult && typeof user?.tgId === 'number' && botConfigured() && config.telegramBeltEmojiIds !== null
  );
}

/**
 * Unix seconds at which a status for `season` clears: noon UTC the day after
 * the season's last date. That instant is after the season has ended in every
 * timezone the product serves, so a belt is never taken down early; at worst
 * it lingers for part of the new season's first day.
 */
export function statusExpiryFor(season: Season): number {
  return Math.floor(Date.parse(`${addDays(season.endsOn, 1)}T12:00:00Z`) / 1000);
}

/**
 * Whether a Bot API refusal means the user withdrew access, as opposed to a
 * transport problem or a Telegram outage. Telegram does not document the exact
 * wording, so this matches the vocabulary of a permission refusal rather than
 * one string; the release checklist verifies it against a real revoked grant.
 */
export function isAccessRevoked(error: string): boolean {
  return /forbidden|allow|access|permission|privacy/i.test(error);
}

/** Send `tier` as the status for `season`. Never throws (see callBot). */
export function sendEmojiStatus(
  tgId: number,
  season: Season,
  tier: BeltTier,
): Promise<BotResult<boolean>> {
  const ids = config.telegramBeltEmojiIds;
  if (!ids) return Promise.resolve({ ok: false, error: 'Belt emoji set is not configured.' });
  return setUserEmojiStatus(tgId, ids[tier], statusExpiryFor(season));
}

/**
 * Bring the status up to date after a read found a new belt, and record the
 * outcome. Called without awaiting. State is re-read after the network call
 * because the user may have changed the setting while it was in flight.
 */
export async function syncEmojiStatus(
  userId: string,
  tgId: number,
  season: Season,
  tier: BeltTier,
): Promise<void> {
  const result = await sendEmojiStatus(tgId, season, tier);
  const state = getFightRecordState(userId);
  const now = new Date().toISOString();
  if (result.ok) {
    saveFightRecordState({
      ...state,
      emojiStatus: { ...state.emojiStatus, lastSet: { seasonId: season.id, tier }, updatedAt: now },
    });
    logEvent('fight_record_emoji_status_set', { tier });
    return;
  }
  const revoked = isAccessRevoked(result.error);
  if (revoked && state.emojiStatus.enabled) {
    saveFightRecordState({
      ...state,
      emojiStatus: { ...state.emojiStatus, enabled: false, lastSet: null, updatedAt: now },
    });
  }
  logEvent('fight_record_emoji_status_failed', { tier, revoked });
}

/** Remove the status. Best-effort: the user can always clear it in Telegram. */
export async function clearEmojiStatus(tgId: number): Promise<void> {
  await setUserEmojiStatus(tgId, '');
}

/**
 * Account erasure: take the belt off the user's Telegram profile before their
 * data goes, so a deleted account is not still advertising itself for the
 * rest of the season. Called by me/service purgeUser; never throws.
 */
export async function clearEmojiStatusOnErasure(
  userId: string,
  tgId: number | undefined,
): Promise<void> {
  if (typeof tgId !== 'number') return;
  if (!getFightRecordState(userId).emojiStatus.enabled) return;
  await clearEmojiStatus(tgId);
}
