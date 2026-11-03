/**
 * TelegramAuthValidator. Normative algorithm AQF-09 §2.1, plus three bounds
 * on the payload itself:
 *
 *   params        = parse launch data as URL query pairs; extract and remove 'hash'
 *   dataCheckStr  = join sorted 'key=value' pairs with newline
 *   secretKey     = HMAC_SHA256(key = 'WebAppData', message = BOT_TOKEN)
 *   calculated    = hex(HMAC_SHA256(key = secretKey, message = dataCheckStr))
 *   require byte length <= 4096                        else AUTH_TG_INVALID
 *   require timingSafeEqual(calculated, hash)          else AUTH_TG_INVALID
 *   require auth_date <= now + 30 seconds              else AUTH_TG_STALE
 *   require now - auth_date <= 600 seconds             else AUTH_TG_STALE
 *   require the user object matches telegramUserSchema else AUTH_TG_INVALID
 *
 * The raw launch data string is accepted only by the auth endpoints, only in
 * transit, and is never persisted (AQF-07 §2.2).
 */
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  TG_AUTH_FUTURE_SKEW_SECONDS,
  TG_AUTH_MAX_AGE_SECONDS,
  TG_INIT_DATA_MAX_BYTES,
} from '@aquazerofit/shared';
import { config } from '../../platform/config';
import { AppError } from '../../platform/errors';

/**
 * The user object Telegram puts in launch data. Unknown keys are stripped.
 * `id` has to be a safe integer: a string id, a float, or a nested object
 * is a malformed payload, not an identity.
 */
const telegramUserSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  is_bot: z.boolean().optional(),
  first_name: z.string().max(128).optional(),
  last_name: z.string().max(128).optional(),
  username: z.string().max(32).optional(),
  language_code: z.string().max(35).optional(),
  is_premium: z.boolean().optional(),
  added_to_attachment_menu: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
  photo_url: z.string().max(2048).optional(),
});

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
  if (Buffer.byteLength(initData, 'utf8') > TG_INIT_DATA_MAX_BYTES) {
    throw new AppError('AUTH_TG_INVALID', 'Launch data is too large');
  }

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
  if (authDate > nowSeconds + TG_AUTH_FUTURE_SKEW_SECONDS) {
    throw new AppError('AUTH_TG_STALE', 'Launch data timestamp is in the future');
  }

  const rawUser = params.get('user');
  if (!rawUser) throw new AppError('AUTH_TG_INVALID', 'Launch data carries no user identity');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUser);
  } catch {
    throw new AppError('AUTH_TG_INVALID', 'Launch data user payload is malformed');
  }
  const user = telegramUserSchema.safeParse(parsed);
  if (!user.success) {
    throw new AppError('AUTH_TG_INVALID', 'Launch data user payload is malformed');
  }
  return {
    id: user.data.id,
    first_name: user.data.first_name,
    last_name: user.data.last_name,
    username: user.data.username,
    language_code: user.data.language_code,
  };
}

/**
 * Test/dev helper: produce a correctly signed initData string. Used by the
 * mandatory test vectors (known-good, tampered, stale). AQF-09 §2.1.
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
