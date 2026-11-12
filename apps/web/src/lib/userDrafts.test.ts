// @vitest-environment jsdom
/**
 * Per-user drafts must not reach the next account on the same browser.
 * logout() used to remove only the user snapshot, so B signing in after A
 * saw A's unsent coach message and A's half-finished setup answers.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { PublicUser } from '@aquazerofit/shared';
import { USER_DRAFT_KEYS, clearUserDrafts } from './userDrafts';
import { storeUser } from './queries';

const user = (id: string): PublicUser => ({
  id,
  email: `${id}@example.com`,
  displayName: id,
  role: 'user',
  tier: 'free',
  emailVerified: true,
  hasProfile: true,
  telegramLinked: false,
  hasPassword: true,
  createdAt: '2026-01-01T00:00:00.000Z',
});

function writeDrafts(): void {
  for (const key of Object.values(USER_DRAFT_KEYS)) localStorage.setItem(key, '{"x":1}');
}

const draftsLeft = () => Object.values(USER_DRAFT_KEYS).filter((k) => localStorage.getItem(k) !== null);

beforeEach(() => localStorage.clear());

describe('per-user drafts', () => {
  it('are all removed by clearUserDrafts, and nothing else is', () => {
    writeDrafts();
    localStorage.setItem('azf.introSeen', '1');
    clearUserDrafts();
    expect(draftsLeft()).toEqual([]);
    expect(localStorage.getItem('azf.introSeen')).toBe('1');
  });

  it('go when a different account signs in', () => {
    storeUser(user('usr-a'));
    writeDrafts();
    storeUser(user('usr-b'));
    expect(draftsLeft()).toEqual([]);
  });

  it('stay when the same account signs in again', () => {
    storeUser(user('usr-a'));
    writeDrafts();
    storeUser(user('usr-a'));
    expect(draftsLeft()).toHaveLength(Object.keys(USER_DRAFT_KEYS).length);
  });
});
