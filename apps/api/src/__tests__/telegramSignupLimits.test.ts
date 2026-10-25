/**
 * Telegram new-account caps are config, not literals.
 * The global daily ceiling defaults to off so a launch is not stopped at 100.
 * Per-IP and per-subnet limits stay on.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../platform/errors';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-tg-caps-'));
process.env.AZF_DATA_DIR = dataDir;

const { telegramAuth, resetTelegramNewAccountLimits } = await import('../modules/auth/service');
const { signTelegramInitData } = await import('../modules/auth/telegram');
const { config } = await import('../platform/config');
const { getStore } = await import('../platform/store');

const LIMIT_KEYS = [
  'TELEGRAM_SIGNUP_PER_IP_PER_MINUTE',
  'TELEGRAM_SIGNUP_SUBNET_DAILY',
  'TELEGRAM_SIGNUP_GLOBAL_DAILY',
  'AUTH_RATE_LIMIT_PER_MINUTE',
] as const;

const ORIGINAL = Object.fromEntries(LIMIT_KEYS.map((key) => [key, process.env[key]])) as Record<
  (typeof LIMIT_KEYS)[number],
  string | undefined
>;

function initDataFor(tgId: number): string {
  return signTelegramInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `AA-${tgId}`,
    user: JSON.stringify({ id: tgId, first_name: 'Cap' }),
  });
}

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

beforeEach(() => {
  resetTelegramNewAccountLimits();
  for (const key of LIMIT_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of LIMIT_KEYS) {
    if (ORIGINAL[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL[key];
  }
  resetTelegramNewAccountLimits();
});

afterAll(async () => {
  await getStore().close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('telegram signup cap config', () => {
  it('defaults the global ceiling to off and keeps the per-IP and subnet brakes', () => {
    expect(config.telegramSignupGlobalDaily).toBe(0);
    expect(config.telegramSignupPerIpPerMinute).toBe(5);
    expect(config.telegramSignupSubnetDaily).toBe(2000);
    expect(config.authRateLimitPerMinute).toBe(60);
  });

  it('rejects a non-positive abuse limit and honours a configured global ceiling', () => {
    process.env.TELEGRAM_SIGNUP_PER_IP_PER_MINUTE = '0';
    process.env.TELEGRAM_SIGNUP_SUBNET_DAILY = 'nope';
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '-4';
    expect(config.telegramSignupPerIpPerMinute).toBe(5);
    expect(config.telegramSignupSubnetDaily).toBe(2000);
    expect(config.authRateLimitPerMinute).toBe(60);

    process.env.TELEGRAM_SIGNUP_GLOBAL_DAILY = '50000';
    expect(config.telegramSignupGlobalDaily).toBe(50000);
    process.env.TELEGRAM_SIGNUP_GLOBAL_DAILY = '0';
    expect(config.telegramSignupGlobalDaily).toBe(0);
    process.env.TELEGRAM_SIGNUP_GLOBAL_DAILY = '-1';
    expect(config.telegramSignupGlobalDaily).toBe(0);
  });
});

describe('telegram new-account enforcement', () => {
  it('caps new accounts per IP and does not count a returning sign-in', () => {
    process.env.TELEGRAM_SIGNUP_PER_IP_PER_MINUTE = '1';
    const ip = '198.51.100.40';
    expect(codeOf(() => telegramAuth(initDataFor(710001), ip))).toBeNull();
    expect(codeOf(() => telegramAuth(initDataFor(710001), ip))).toBeNull();
    expect(codeOf(() => telegramAuth(initDataFor(710002), ip))).toBe('RATE_LIMITED');
  });

  it('caps a /24 across distinct addresses', () => {
    process.env.TELEGRAM_SIGNUP_SUBNET_DAILY = '2';
    expect(codeOf(() => telegramAuth(initDataFor(720001), '203.0.113.10'))).toBeNull();
    expect(codeOf(() => telegramAuth(initDataFor(720002), '203.0.113.11'))).toBeNull();
    expect(codeOf(() => telegramAuth(initDataFor(720003), '203.0.113.12'))).toBe('RATE_LIMITED');
    expect(codeOf(() => telegramAuth(initDataFor(720004), '203.0.114.12'))).toBeNull();
  });

  it('does not apply a global daily ceiling unless one is configured', () => {
    for (let i = 0; i < 6; i += 1) {
      expect(codeOf(() => telegramAuth(initDataFor(730000 + i), `198.51.${i}.10`))).toBeNull();
    }
    resetTelegramNewAccountLimits();
    process.env.TELEGRAM_SIGNUP_GLOBAL_DAILY = '2';
    expect(codeOf(() => telegramAuth(initDataFor(740001), '198.51.10.10'))).toBeNull();
    expect(codeOf(() => telegramAuth(initDataFor(740002), '198.51.11.10'))).toBeNull();
    expect(codeOf(() => telegramAuth(initDataFor(740003), '198.51.12.10'))).toBe('RATE_LIMITED');
  });
});
