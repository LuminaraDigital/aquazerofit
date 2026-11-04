/**
 * Outbound Telegram nudges (AZF-P1 US-D3): at most one bot message per
 * person per local day across every Fight Camp feature, never at night,
 * never to someone who has not opted in.
 *
 * Every condition fails toward silence:
 *  - no bot, no linked Telegram account, or the `reminders` consent off;
 *  - this kind switched off in Settings;
 *  - no known timezone (we will not guess whether it is 3 am for them);
 *  - quiet hours, 21:00 to 08:00 in their own time;
 *  - the day's one nudge already claimed. The claim is a unique row
 *    (engage.nudge_log), taken before sending, so two cheers arriving at
 *    once cannot both message the same person.
 *
 * The message goes to the person themself, about their own account. Nothing
 * here can address a group or anyone who is not a user.
 */
import type { NudgeKind, User } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { localDateFor } from '../../platform/dates';
import { getStore } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { hasConsent } from '../me/service';
import { botConfigured, sendBotMessage } from '../payments/telegramBot';
import { fcEnabled } from './flags';
import { engageRepo } from './repo';

export const QUIET_HOURS = { from: 21, until: 8 } as const;

/** The hour (0 to 23) in `timeZone`, or null for a zone the runtime does not know. */
export function localHour(timeZone: string, at: Date): number | null {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(at);
    const n = Number(hour);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export function inQuietHours(hour: number): boolean {
  return hour >= QUIET_HOURS.from || hour < QUIET_HOURS.until;
}

/**
 * Send `text` as this person's one nudge for their day, if every rule above
 * allows it. Resolves whether a message was sent; never throws.
 */
export async function sendNudge(userId: string, kind: NudgeKind, text: string, now: Date = new Date()): Promise<boolean> {
  try {
    const user = getStore().byId<User>('users', userId);
    if (!botConfigured() || typeof user?.tgId !== 'number' || !hasConsent(userId, 'reminders')) return false;
    // The recipient's own gate: nobody outside the rollout hears from Fight
    // Camp. Every nudge kind today belongs to cheers.
    if (!fcEnabled('cheers', userId)) return false;
    if ((await engageRepo().nudgeSettings(userId))[kind] === false) return false;
    const timeZone = user.timezone;
    const hour = timeZone ? localHour(timeZone, now) : null;
    if (!timeZone || hour === null) return false;
    if (inQuietHours(hour)) {
      logEvent('nudge_suppressed_quiet', { kind });
      return false;
    }
    if (!(await engageRepo().claimNudge(userId, localDateFor(timeZone, now), kind, now.toISOString()))) {
      logEvent('nudge_suppressed_cap', { kind });
      return false;
    }
    const sent = await sendBotMessage(user.tgId, text, {
      parseMode: 'plain',
      buttons: [{ text: 'Open Fight Camp', webAppUrl: config.telegramMiniAppUrl }],
    });
    logEvent(sent.ok ? 'nudge_sent' : 'nudge_failed', { kind });
    return sent.ok;
  } catch {
    logEvent('nudge_failed', { kind });
    return false;
  }
}
