// @vitest-environment jsdom
/**
 * WebGL stays on outside Telegram. Inside Telegram it yields to a static
 * wash on Android, low-end devices, reduced motion, and light themes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AppBackground } from './AppBackground';

function installTelegram(partial: { platform?: string; colorScheme?: 'light' | 'dark'; initData?: string }) {
  (window as unknown as { Telegram?: unknown }).Telegram = {
    WebApp: {
      initData: partial.initData ?? 'query_id=stub&hash=stub',
      platform: partial.platform ?? 'ios',
      colorScheme: partial.colorScheme ?? 'dark',
      isVersionAtLeast: () => true,
      onEvent: vi.fn(),
      offEvent: vi.fn(),
    },
  };
}

beforeEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce') ? false : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppBackground WebGL gate', () => {
  it('still starts WebGL outside Telegram on a low-end device', () => {
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<AppBackground />);
    expect(getContext).toHaveBeenCalledWith('webgl');
    expect(document.querySelector('.azf-bg-static')).toBeNull();
  });

  it('uses the static background inside Telegram on Android', () => {
    installTelegram({ platform: 'android' });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    render(<AppBackground />);
    expect(getContext).not.toHaveBeenCalled();
    expect(document.querySelector('.azf-bg-static')).toBeTruthy();
  });

  it('uses the static background for a light Telegram theme', () => {
    installTelegram({ platform: 'ios', colorScheme: 'light' });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    render(<AppBackground />);
    expect(getContext).not.toHaveBeenCalled();
    expect(document.querySelector('.azf-bg-static')).toBeTruthy();
  });

  it('uses the static background when deviceMemory is 4 or less inside Telegram', () => {
    installTelegram({ platform: 'ios', colorScheme: 'dark' });
    Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    render(<AppBackground />);
    expect(getContext).not.toHaveBeenCalled();
    expect(document.querySelector('.azf-bg-static')).toBeTruthy();
  });
});
