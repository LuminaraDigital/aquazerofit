/**
 * Telegram plumbing for the belt as the user's emoji status (AZF-W3-05 §3.4).
 *
 * The Mini App asks Telegram for permission (`requestEmojiStatusAccess`, Bot
 * API 8.0); from then on the bot can set the status with `setUserEmojiStatus`.
 * Two choices shape what lives here:
 *
 *  - **Every status expires at season end.** Telegram clears it by itself, so
 *    a user who lapses is not left advertising last season's belt, no job has
 *    to remember to take it down, and the next season starts clean on the
 *    profile as well as in the app.
 *  - **Nothing here can throw into a request.** Every call returns a result
 *    (see callBot), so the read path can fire updates without waiting on, or
 *    failing because of, Telegram.
 *
 * The preference itself, its audit trail and the keep-in-step logic live in
 * service.ts. This file holds only what account erasure (me/service) also
 * needs, so that erasure can clear a status without importing the service,
 * which itself depends on me/service.
 */
import type { BeltTier, Season, User } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { addDays } from '../../platform/dates';
import { botConfigured, setUserEmojiStatus, type BotResult } from '../payments/telegramBot';
import { getFightRecordState } from './state';

/** Recorded with every grant. Bump it whenever the consent copy changes. */
export const EMOJI_STATUS_CONSENT_VERSION = 'fight-record-emoji-status-1';

/**
 * The Telegram user a status would be set for, or null when it cannot be:
 * not an adult, no linked Telegram account, or a deployment whose bot or belt
 * emoji set is not configured. The status is visible to everyone the user
 * chats with, so it is a public surface and never offered to a minor.
 */
export function emojiStatusTarget(user: User | undefined, adult: boolean): number | null {
  if (!adult || typeof user?.tgId !== 'number') return null;
  if (!botConfigured() || config.telegramBeltEmojiIds === null) return null;
  return user.tgId;
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

/** Send `tier` as the status for `season`. */
export function sendEmojiStatus(
  tgId: number,
  season: Season,
  tier: BeltTier,
): Promise<BotResult<boolean>> {
  const ids = config.telegramBeltEmojiIds;
  if (!ids) return Promise.resolve({ ok: false, error: 'Belt emoji set is not configured.' });
  return setUserEmojiStatus(tgId, ids[tier], statusExpiryFor(season));
}

/** Remove the status. Best-effort: the user can always clear it in Telegram. */
export async function clearEmojiStatus(tgId: number): Promise<void> {
  await setUserEmojiStatus(tgId, '');
}

/**
 * Account erasure: take the belt off the user's Telegram profile before their
 * data goes, so a deleted account is not still advertising itself for the
 * rest of the season. Called by me/service purgeUser.
 */
export async function clearEmojiStatusOnErasure(
  userId: string,
  tgId: number | undefined,
): Promise<void> {
  if (typeof tgId !== 'number') return;
  if (!getFightRecordState(userId).emojiStatus.enabled) return;
  await clearEmojiStatus(tgId);
}
