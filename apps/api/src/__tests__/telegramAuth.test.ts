/**
 * TelegramAuthValidator — the three mandatory vectors from AQF-09 §2.1:
 * a known-good payload, a payload with one tampered field, and a payload
 * with a stale timestamp. All signed with the dev bot token.
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '../platform/errors';
import { signTelegramInitData, validateTelegramInitData } from '../modules/auth/telegram';

const BOT_TOKEN = 'dev-bot-token';

function makeInitData(overrides: Partial<Record<string, string>> = {}): string {
  const authDate = String(Math.floor(Date.now() / 1000));
  return signTelegramInitData(
    {
      auth_date: authDate,
      query_id: 'AAF9tE1UAAAAAH20TVS7',
      user: JSON.stringify({ id: 987654321, first_name: 'Alex', username: 'alexwaters' }),
      ...overrides,
    },
    BOT_TOKEN,
  );
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

describe('validateTelegramInitData', () => {
  it('accepts a known-good payload signed with the dev bot token', () => {
    const initData = makeInitData();
    const user = validateTelegramInitData(initData, BOT_TOKEN);
    expect(user.id).toBe(987654321);
    expect(user.username).toBe('alexwaters');
    expect(user.first_name).toBe('Alex');
  });

  it('rejects a payload with one tampered field (AUTH_TG_INVALID)', () => {
    const initData = makeInitData();
    // Tamper with the user identity after signing.
    const tampered = initData.replace('987654321', '111111111');
    expect(tampered).not.toBe(initData);
    expect(codeOf(() => validateTelegramInitData(tampered, BOT_TOKEN))).toBe('AUTH_TG_INVALID');
  });

  it('rejects a stale timestamp (AUTH_TG_STALE)', () => {
    const staleDate = String(Math.floor(Date.now() / 1000) - 601);
    const initData = makeInitData({ auth_date: staleDate });
    // Signature itself is valid; only freshness fails.
    expect(codeOf(() => validateTelegramInitData(initData, BOT_TOKEN))).toBe('AUTH_TG_STALE');
  });

  it('rejects a payload signed with a different bot token', () => {
    const initData = makeInitData();
    expect(codeOf(() => validateTelegramInitData(initData, 'other-token'))).toBe('AUTH_TG_INVALID');
  });

  it('rejects a payload with no hash at all', () => {
    expect(codeOf(() => validateTelegramInitData('auth_date=123&user=%7B%7D', BOT_TOKEN))).toBe(
      'AUTH_TG_INVALID',
    );
  });
});
