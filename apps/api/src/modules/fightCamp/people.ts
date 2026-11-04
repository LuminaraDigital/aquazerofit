/**
 * How Fight Camp shows one person to another: the name others see, and
 * whether an account is new. One home, so every surface masks a name the
 * same way and "new" is measured one way.
 */
import { containsProfanity, type User } from '@aquazerofit/shared';
import { getStore } from '../../platform/store';

const FALLBACK_NAME = 'Fight Camp member';
/** A sender or gifter who has left the squad, or whose account is gone. */
export const FORMER_MATE = 'A former squad mate';

/**
 * Text that goes into a Telegram message the bot sends. Plain-text mode
 * stops markup, but Telegram still turns URLs and @mentions into links, so a
 * name like "evil.example/login" would arrive as a link from our bot. Only
 * letters, numbers, spaces, apostrophes and hyphens get through; anything
 * else becomes the fallback.
 */
export function telegramSafe(text: string, fallback: string): string {
  return /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '’-]*$/u.test(text) ? text : fallback;
}

/**
 * The person's first name, or null when it is not one to show. Names the
 * account never chose (the email local part registration fills in,
 * Telegram's numbered fallback) are not shown: they can identify someone
 * who never typed them.
 */
export function firstNameOf(userId: string): string | null {
  const user = getStore().byId<User>('users', userId);
  const name = user?.displayName?.trim() ?? '';
  const autoFilled = name === user?.email.split('@')[0] || /^Telegram user \d+$/.test(name);
  const first = name.split(/\s+/)[0] ?? '';
  return first && !autoFilled && !containsProfanity(first) ? first : null;
}

/** A member's first name, masked like huddle names. */
export function displayNameOf(userId: string): string {
  return firstNameOf(userId) ?? FALLBACK_NAME;
}

/** Whether the account was created less than `ms` before `now`. */
export function accountYoungerThan(userId: string, ms: number, now: Date = new Date()): boolean {
  const createdAt = getStore().byId<User>('users', userId)?.createdAt;
  return createdAt !== undefined && now.getTime() - Date.parse(createdAt) < ms;
}
