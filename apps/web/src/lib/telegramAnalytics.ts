/**
 * Telegram Mini Apps Analytics for Apps Center catalog ranking.
 *
 * https://docs.tganalytics.xyz/sdk/installation-via-npm-package
 *
 * The SDK records app launches and TON Connect events. It has to run before
 * React renders, and only inside a Mini App. The browser site never loads it.
 *
 * The token and app name come from the Vite build (`VITE_TG_ANALYTICS_TOKEN`,
 * `VITE_TG_ANALYTICS_APP_NAME`). Either one missing skips init. A throw from
 * the SDK (no user on the launch payload, a blocked request) is swallowed so
 * the shell still mounts. Nothing is logged: a missing token is the normal
 * local and test configuration.
 */
import { isTMA } from './telegram';

export interface TelegramAnalyticsEnv {
  VITE_TG_ANALYTICS_TOKEN?: string;
  VITE_TG_ANALYTICS_APP_NAME?: string;
}

export interface TelegramAnalyticsConfig {
  token: string;
  appName: string;
}

export type TelegramAnalyticsInit = (options: TelegramAnalyticsConfig) => void | Promise<void>;

function read(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Null when either build-time value is blank. */
export function readTelegramAnalyticsConfig(
  env: TelegramAnalyticsEnv,
): TelegramAnalyticsConfig | null {
  const token = read(env.VITE_TG_ANALYTICS_TOKEN);
  const appName = read(env.VITE_TG_ANALYTICS_APP_NAME);
  if (!token || !appName) return null;
  return { token, appName };
}

let started = false;

/** Lets unit tests re-run the one-shot guard. */
export function resetTelegramAnalyticsForTests(): void {
  started = false;
}

async function defaultInit(options: TelegramAnalyticsConfig): Promise<void> {
  const { default: telegramAnalytics } = await import('@telegram-apps/analytics');
  await telegramAnalytics.init({
    token: options.token,
    appName: options.appName,
  });
}

/**
 * Initialise once. Returns whether init ran.
 * Defaults to the live Mini App check (`isTMA`) and `import.meta.env`.
 */
export async function initTelegramAnalytics(options?: {
  inTelegram?: boolean;
  env?: TelegramAnalyticsEnv;
  init?: TelegramAnalyticsInit;
}): Promise<boolean> {
  if (started) return true;
  const inTelegram = options?.inTelegram ?? isTMA();
  if (!inTelegram) return false;
  const config = readTelegramAnalyticsConfig(options?.env ?? import.meta.env);
  if (!config) return false;
  try {
    await (options?.init ?? defaultInit)(config);
    started = true;
    return true;
  } catch {
    return false;
  }
}
