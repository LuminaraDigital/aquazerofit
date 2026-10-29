/**
 * Reminder preferences: which Telegram reminders a person wants and at what
 * local times. Until this module they lived only in the Mini App's
 * localStorage, where no server could act on them.
 *
 * The master `reminders` consent stays the authority on whether anything is
 * sent; these describe what and when. Stored in `users` under the person's id,
 * so account deletion removes them with the rest of the account.
 */
import type { ReminderPrefs } from '@aquazerofit/shared';
import { getStore } from '../../platform/store';
import { auditDataAccess } from '../me/service';

export type ReminderPrefsDoc = ReminderPrefs & {
  id: string;
  type: 'reminderPrefs';
  userId: string;
  updatedAt: string;
};

export const reminderPrefsId = (userId: string): string => `remprefs-${userId}`;

/** The saved preferences, or null for someone who never saved any. */
export function savedReminderPrefs(userId: string): ReminderPrefsDoc | null {
  return getStore().byId<ReminderPrefsDoc>('users', reminderPrefsId(userId)) ?? null;
}

export function saveReminderPrefs(userId: string, input: ReminderPrefs): ReminderPrefsDoc {
  const doc: ReminderPrefsDoc = {
    ...input,
    id: reminderPrefsId(userId),
    type: 'reminderPrefs',
    userId,
    updatedAt: new Date().toISOString(),
  };
  getStore().upsert('users', doc);
  // Which kinds are on, never the times or the zone.
  auditDataAccess(userId, 'reminderPrefs.update', {
    meals: input.meals.enabled,
    water: input.water.enabled,
    workout: input.workout.enabled,
    weighIn: input.weighIn.enabled,
  });
  return doc;
}
