/**
 * Telegram reminder delivery: the meal, water, workout and weigh-in reminders
 * a person set in Settings, sent by the bot in their own timezone. A
 * one-minute tick decides what is due.
 *
 * Each kind goes out at most once a local day, water twice at fixed times, so
 * the most anyone hears is five, on their weigh-in day. That is separate from
 * Fight Camp's one nudge a day, which governs messages nobody asked for.
 *
 * Every condition fails toward silence, as Fight Camp's nudges do:
 *  - no saved preferences (the first visit to Settings saves them, with the
 *    device's timezone, so the times mean what the screen showed);
 *  - no bot, no linked Telegram account, the `reminders` consent off, or an
 *    account flagged for deletion;
 *  - quiet hours, the same 21:00 to 08:00 as nudges;
 *  - more than SEND_WINDOW_MIN past the slot, so a server that was down over
 *    a slot never sends it late.
 *
 * Each send is claimed in engage.reminder_log before the bot call. The row's
 * primary key is the claim, so neither a restart nor two revisions
 * overlapping during a rollout can send a reminder twice; the document store
 * cannot promise that, since every instance holds its own copy. A failed send
 * is not retried: a timeout may already have delivered it and a blocked bot
 * fails every time, so one missed reminder is the cheaper mistake.
 */
import {
  WATER_REMINDER_TIMES,
  WEIGH_IN_REMINDER_TIME,
  type ReminderPrefs,
  type User,
} from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { addDays } from '../../platform/dates';
import { getStore } from '../../platform/store';
import { logEvent } from '../../platform/telemetry';
import { inQuietHours } from '../fightCamp/nudges';
import { engageRepo } from '../fightCamp/repo';
import { consentId } from '../me/service';
import { botConfigured, sendBotMessage } from '../payments/telegramBot';
import { savedReminderPrefs } from './prefs';

export const SEND_WINDOW_MIN = 45;

export type ReminderKind = 'meals' | 'water' | 'workout' | 'weighIn';

export interface DueReminder {
  kind: ReminderKind;
  /** The claim key: the kind, or `water@HH:MM` for water's two daily slots. */
  key: string;
}

const TEXT: Record<ReminderKind, string> = {
  meals: '🍽 Time to log your meal while it is fresh in your mind.',
  water: '💧 Hydration check: a glass of water keeps your energy steady.',
  workout: '🏋️ Your workout is ready. Even 15 minutes counts today.',
  weighIn: '⚖️ Weekly weigh-in day. The trend matters more than today’s number.',
};

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The reminders whose send window is open at this local time. The claim decides what actually sends. */
export function dueReminders(prefs: ReminderPrefs, minutes: number, weekday: string): DueReminder[] {
  const slots: Array<DueReminder & { time: string }> = [];
  if (prefs.meals.enabled) slots.push({ kind: 'meals', key: 'meals', time: prefs.meals.time });
  if (prefs.workout.enabled) slots.push({ kind: 'workout', key: 'workout', time: prefs.workout.time });
  if (prefs.weighIn.enabled && weekday === prefs.weighIn.day) {
    slots.push({ kind: 'weighIn', key: 'weighIn', time: WEIGH_IN_REMINDER_TIME });
  }
  if (prefs.water.enabled) {
    for (const time of WATER_REMINDER_TIMES) slots.push({ kind: 'water', key: `water@${time}`, time });
  }
  return slots
    .filter(({ time }) => minutes >= minutesOf(time) && minutes < minutesOf(time) + SEND_WINDOW_MIN)
    .map(({ kind, key }) => ({ kind, key }));
}

// One formatter per zone: building one per person per minute costs seconds
// of blocked event loop at tens of thousands of accounts. Zones are validated
// IANA names, so the map stays as small as the zone database.
const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(timeZone)) {
    let formatter: Intl.DateTimeFormat | null = null;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        weekday: 'long',
      });
    } catch {
      // A zone this runtime does not know: stay silent for it.
    }
    formatters.set(timeZone, formatter);
  }
  return formatters.get(timeZone) ?? null;
}

/** Local date, minutes past midnight and English weekday in `timeZone`, or null for an unknown zone. */
export function localClock(
  timeZone: string,
  at: Date,
): { localDate: string; minutes: number; weekday: string } | null {
  const parts = formatterFor(timeZone)?.formatToParts(at);
  if (!parts) return null;
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    localDate: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
    weekday: part('weekday'),
  };
}

const isAccount = (d: object): boolean => {
  const type = (d as { type?: string }).type;
  return type === undefined || type === 'user';
};

/** Read the consent without creating it: hasConsent() writes a default document for anyone without one. */
const remindersConsented = (userId: string): boolean =>
  getStore().byId<{ id: string; reminders?: boolean }>('users', consentId(userId))?.reminders === true;

/** Still an account that wants reminders. Re-checked after every await, so erasure mid-tick wins. */
function stillWanted(userId: string): boolean {
  const user = getStore().byId<User>('users', userId);
  return Boolean(user && !user.deletionRequestedAt && remindersConsented(userId));
}

/** Send every reminder that is due now. Resolves the number sent; one person's failure never stops the rest. */
export async function runReminderTick(now: Date = new Date()): Promise<number> {
  if (!botConfigured()) return 0;
  const repo = engageRepo();
  const people = getStore().where<User>(
    'users',
    (d) => isAccount(d) && typeof d.tgId === 'number' && !d.deletionRequestedAt,
  );
  let sent = 0;
  // shortcut: sends go one at a time, roughly ten a second. Fine until a
  // single slot has thousands of people in it; past that, late sends fall
  // out of the window and a small concurrency pool is the next step.
  for (const person of people) {
    const prefs = savedReminderPrefs(person.id);
    if (!prefs) continue;
    const timeZone = prefs.timezone ?? person.timezone;
    const clock = timeZone ? localClock(timeZone, now) : null;
    if (!clock || inQuietHours(Math.floor(clock.minutes / 60))) continue;
    for (const due of dueReminders(prefs, clock.minutes, clock.weekday)) {
      if (!stillWanted(person.id)) break;
      if (!(await repo.claimReminder(person.id, clock.localDate, due.key, now.toISOString()))) continue;
      const result = await sendBotMessage(person.tgId!, TEXT[due.kind], {
        parseMode: 'plain',
        buttons: [{ text: 'Open AquaZeroFit', webAppUrl: config.telegramMiniAppUrl }],
      });
      logEvent(result.ok ? 'reminder_sent' : 'reminder_failed', { kind: due.kind });
      if (result.ok) sent += 1;
    }
  }
  // Claims only guard their own day; two days' slack covers zones ahead of UTC.
  if (now.getUTCMinutes() === 0) await repo.pruneReminders(addDays(now.toISOString().slice(0, 10), -2));
  return sent;
}

/** Tick once a minute. A tick still sending when the next is due is left to finish rather than overlapped. */
export function startReminderScheduler(): void {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    runReminderTick()
      .catch((err) => console.error('[reminders] tick failed', err))
      .finally(() => {
        running = false;
      });
  }, 60_000).unref();
}
