/**
 * TelegramAuthValidator — normative algorithm AQF-09 §2.1.
 *
 *   params        = parse launch data as URL query pairs; extract and remove 'hash'
 *   dataCheckStr  = join sorted 'key=value' pairs with newline
 *   secretKey     = HMAC_SHA256(key = 'WebAppData', message = BOT_TOKEN)
 *   calculated    = hex(HMAC_SHA256(key = secretKey, message = dataCheckStr))
 *   require timingSafeEqual(calculated, hash)      else AUTH_TG_INVALID
 *   require now - auth_date <= 600 seconds         else AUTH_TG_STALE
 *
 * The raw launch data string is accepted only by the auth endpoints, only in
 * transit, and is never persisted (AQF-07 §2.2).
 */
import crypto from 'node:crypto';
import { TG_AUTH_MAX_AGE_SECONDS } from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { AppError } from '../../platform/errors';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string = config.telegramBotToken,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new AppError('AUTH_TG_INVALID', 'Launch data is missing its signature');
  params.delete('hash');

  const dataCheckStr = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckStr).digest('hex');

  const calculatedBuf = Buffer.from(calculated, 'utf8');
  const providedBuf = Buffer.from(hash, 'utf8');
  const valid =
    calculatedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(calculatedBuf, providedBuf);
  if (!valid) {
    throw new AppError('AUTH_TG_INVALID', 'Launch data signature failed validation');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSeconds - authDate > TG_AUTH_MAX_AGE_SECONDS) {
    throw new AppError('AUTH_TG_STALE', 'Launch data is older than the freshness window');
  }

  const rawUser = params.get('user');
  if (!rawUser) throw new AppError('AUTH_TG_INVALID', 'Launch data carries no user identity');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUser);
  } catch {
    throw new AppError('AUTH_TG_INVALID', 'Launch data user payload is malformed');
  }
  const user = parsed as TelegramUser;
  if (typeof user.id !== 'number') {
    throw new AppError('AUTH_TG_INVALID', 'Launch data user payload is malformed');
  }
  return user;
}

/**
 * Test/dev helper: produce a correctly signed initData string. Used by the
 * mandatory test vectors (known-good, tampered, stale) — AQF-09 §2.1.
 */
export function signTelegramInitData(
  fields: Record<string, string>,
  botToken: string = config.telegramBotToken,
): string {
  const params = new URLSearchParams(fields);
  const dataCheckStr = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckStr).digest('hex');
  params.set('hash', hash);
  return params.toString();
}
