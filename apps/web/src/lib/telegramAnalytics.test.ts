import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initTelegramAnalytics,
  readTelegramAnalyticsConfig,
  resetTelegramAnalyticsForTests,
} from './telegramAnalytics';

const ENV = {
  VITE_TG_ANALYTICS_TOKEN: 'catalog-token',
  VITE_TG_ANALYTICS_APP_NAME: 'aquazerofit',
};

afterEach(() => {
  resetTelegramAnalyticsForTests();
});

describe('readTelegramAnalyticsConfig', () => {
  it('requires both values', () => {
    expect(readTelegramAnalyticsConfig({})).toBeNull();
    expect(readTelegramAnalyticsConfig({ VITE_TG_ANALYTICS_TOKEN: 't' })).toBeNull();
    expect(readTelegramAnalyticsConfig({ VITE_TG_ANALYTICS_APP_NAME: 'a' })).toBeNull();
    expect(
      readTelegramAnalyticsConfig({
        VITE_TG_ANALYTICS_TOKEN: '  ',
        VITE_TG_ANALYTICS_APP_NAME: 'app',
      }),
    ).toBeNull();
    expect(
      readTelegramAnalyticsConfig({
        VITE_TG_ANALYTICS_TOKEN: 'tok',
        VITE_TG_ANALYTICS_APP_NAME: '   ',
      }),
    ).toBeNull();
  });

  it('trims a complete pair', () => {
    expect(
      readTelegramAnalyticsConfig({
        VITE_TG_ANALYTICS_TOKEN: ' tok ',
        VITE_TG_ANALYTICS_APP_NAME: ' app ',
      }),
    ).toEqual({ token: 'tok', appName: 'app' });
  });
});

describe('initTelegramAnalytics', () => {
  it('does not call init outside a Mini App', async () => {
    const init = vi.fn();
    await expect(initTelegramAnalytics({ inTelegram: false, env: ENV, init })).resolves.toBe(
      false,
    );
    expect(init).not.toHaveBeenCalled();
  });

  it('does not call init when either env value is missing', async () => {
    const init = vi.fn();
    await expect(initTelegramAnalytics({ inTelegram: true, env: {}, init })).resolves.toBe(false);
    await expect(
      initTelegramAnalytics({
        inTelegram: true,
        env: { VITE_TG_ANALYTICS_TOKEN: 'catalog-token' },
        init,
      }),
    ).resolves.toBe(false);
    await expect(
      initTelegramAnalytics({
        inTelegram: true,
        env: { VITE_TG_ANALYTICS_APP_NAME: 'aquazerofit' },
        init,
      }),
    ).resolves.toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('calls init with the env pair inside a Mini App', async () => {
    const init = vi.fn(async () => undefined);
    await expect(initTelegramAnalytics({ inTelegram: true, env: ENV, init })).resolves.toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({ token: 'catalog-token', appName: 'aquazerofit' });
  });

  it('calls init only once', async () => {
    const init = vi.fn(async () => undefined);
    await initTelegramAnalytics({ inTelegram: true, env: ENV, init });
    await initTelegramAnalytics({ inTelegram: true, env: ENV, init });
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('swallows an SDK failure and stays quiet', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const init = vi.fn(async () => {
      throw new Error('Telegram User data is not provided.');
    });
    try {
      await expect(initTelegramAnalytics({ inTelegram: false, env: ENV, init })).resolves.toBe(
        false,
      );
      await expect(initTelegramAnalytics({ inTelegram: true, env: {}, init })).resolves.toBe(
        false,
      );
      await expect(initTelegramAnalytics({ inTelegram: true, env: ENV, init })).resolves.toBe(
        false,
      );
      expect(init).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
      log.mockRestore();
    }
  });
});
