// @vitest-environment jsdom
/**
 * REGRESSION GUARD: index.html loads telegram-web-app.js unconditionally, so
 * `window.Telegram.WebApp` exists in an ordinary browser tab, theme params and
 * all. The binding therefore cannot key off "is the SDK here"; it keys off
 * `isTMA()` (signed launch data present). If that ever slips, every browser
 * visitor silently gets repainted in a Telegram palette, which is the exact
 * failure this file exists to catch.
 *
 * The rest of the file pins the contrast rules: a host background is only
 * adopted while it keeps the fixed AquaZero brand foregrounds at WCAG AA, so a
 * light Telegram theme darkens the brand foregrounds until they clear WCAG AA
 * on the host background, rather than leaving #8aebff headings at 1.3:1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTelegramTheme,
  contrastRatio,
  initTelegram,
  keepsBrandLegible,
  parseHexColor,
  resolveTelegramAppearance,
  resolveTelegramNeutrals,
  type Rgb,
} from './telegram';

const DARK_TELEGRAM: Record<string, string> = {
  bg_color: '#17212b',
  text_color: '#ffffff',
  hint_color: '#708499',
  link_color: '#6ab7ff',
  button_color: '#5288c1',
  button_text_color: '#ffffff',
  secondary_bg_color: '#232e3c',
};

const LIGHT_TELEGRAM: Record<string, string> = {
  bg_color: '#ffffff',
  text_color: '#000000',
  hint_color: '#999999',
  link_color: '#2481cc',
  button_color: '#2481cc',
  button_text_color: '#ffffff',
  secondary_bg_color: '#f0f0f0',
};

interface FakeWebApp {
  initData: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  ready: () => void;
  expand: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  isVersionAtLeast?: (version: string) => boolean;
}

function installTelegram(app: Partial<FakeWebApp>): FakeWebApp {
  const webApp: FakeWebApp = {
    initData: 'query_id=stub&hash=stub',
    ready: vi.fn(),
    expand: vi.fn(),
    ...app,
  };
  (window as unknown as { Telegram?: { WebApp?: FakeWebApp } }).Telegram = { WebApp: webApp };
  return webApp;
}

function styleOf(property: string): string {
  return document.documentElement.style.getPropertyValue(property);
}

function toRgb(channels: string): Rgb {
  const [r, g, b] = channels.split(' ').map(Number);
  return [r ?? 0, g ?? 0, b ?? 0];
}

beforeEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-tg-theme');
  document.documentElement.classList.remove('tg-active');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('outside Telegram', () => {
  it('does nothing at all when the SDK is absent', () => {
    expect(applyTelegramTheme()).toBe(false);
    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(document.documentElement.dataset['tgTheme']).toBeUndefined();
  });

  it('does nothing when the SDK is loaded but there is no signed launch data', () => {
    // A plain browser tab: index.html always loads the Telegram script, and
    // desktop clients populate themeParams even for a non-Mini-App page.
    installTelegram({ initData: '', colorScheme: 'light', themeParams: LIGHT_TELEGRAM });

    expect(applyTelegramTheme()).toBe(false);
    initTelegram();

    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(styleOf('--azf-surface')).toBe('');
    expect(styleOf('--tg-theme-bg-color')).toBe('');
    expect(document.documentElement.dataset['tgTheme']).toBeUndefined();
  });
});

describe('inside Telegram, dark host', () => {
  it('binds the neutrals to the host and flags the document', () => {
    installTelegram({ colorScheme: 'dark', themeParams: DARK_TELEGRAM });

    expect(applyTelegramTheme()).toBe(true);
    expect(styleOf('--azf-surface')).toBe('23 33 43'); // #17212b
    expect(styleOf('--azf-surface-dim')).toBe('23 33 43');
    expect(styleOf('--azf-on-surface')).toBe('255 255 255');
    expect(styleOf('--azf-surface-container-high')).not.toBe('');
    expect(document.documentElement.dataset['tgTheme']).toBe('dark');
    // The raw params stay published alongside the binding.
    expect(styleOf('--tg-theme-bg-color')).toBe('#17212b');
  });

  it('leaves every brand token alone', () => {
    installTelegram({ colorScheme: 'dark', themeParams: DARK_TELEGRAM });
    applyTelegramTheme();

    for (const brand of [
      '--azf-primary',
      '--azf-secondary',
      '--azf-coral',
      '--azf-error',
      '--azf-on-primary',
      '--azf-primary-container',
      '--azf-surface-tint',
    ]) {
      expect(styleOf(brand), `${brand} must stay branded`).toBe('');
    }
  });

  it('lifts the host hint colour to AA instead of accepting or dropping it', () => {
    // #708499 on #17212b is 4.2:1. Telegram's own default fails AA.
    expect(contrastRatio([112, 132, 153], [23, 33, 43])).toBeLessThan(4.5);

    const bound = resolveTelegramNeutrals(DARK_TELEGRAM);
    const hint = toRgb(bound['--azf-on-surface-variant'] ?? '');
    expect(contrastRatio(hint, [23, 33, 43])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('inside Telegram, light host', () => {
  it('does not keep the shipped light brand ramp on white', () => {
    expect(keepsBrandLegible([255, 255, 255])).toBe(false);
  });

  it('binds a light surface and darkens brand foregrounds to AA', () => {
    installTelegram({ colorScheme: 'light', themeParams: LIGHT_TELEGRAM });

    expect(applyTelegramTheme()).toBe(true);
    expect(styleOf('--azf-surface')).toBe('255 255 255');
    expect(styleOf('--azf-on-surface')).toBe('0 0 0');
    expect(document.documentElement.dataset['tgTheme']).toBe('light');
    expect(document.documentElement.classList.contains('tg-active')).toBe(true);

    const surface: Rgb = [255, 255, 255];
    for (const token of [
      '--azf-primary',
      '--azf-secondary',
      '--azf-coral',
      '--azf-error',
      '--azf-tertiary-container',
    ]) {
      const fg = toRgb(styleOf(token));
      expect(contrastRatio(fg, surface), token).toBeGreaterThanOrEqual(4.5);
    }
    const primary = toRgb(styleOf('--azf-primary'));
    const onPrimary = toRgb(styleOf('--azf-on-primary'));
    expect(contrastRatio(onPrimary, primary)).toBeGreaterThanOrEqual(4.5);
    expect(styleOf('--azf-cta-text')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps brand ink at AA on a 25% chip wash', () => {
    const { vars } = resolveTelegramAppearance(LIGHT_TELEGRAM, 'light');
    const page: Rgb = [255, 255, 255];
    const over = (fg: Rgb, alpha: number): Rgb => {
      const mixed = fg.map((channel, index) =>
        Math.round(page[index] + (channel - page[index]) * alpha),
      );
      return [mixed[0] ?? 0, mixed[1] ?? 0, mixed[2] ?? 0];
    };
    for (const token of [
      '--azf-primary',
      '--azf-primary-fixed-dim',
      '--azf-secondary',
      '--azf-coral',
      '--azf-tertiary-container',
    ]) {
      const fg = toRgb(vars[token] ?? '');
      expect(contrastRatio(fg, over(fg, 0.25)), token).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the shipped dark palette when colorScheme is dark but the background is white', () => {
    expect(resolveTelegramAppearance(LIGHT_TELEGRAM, 'dark')).toEqual({ vars: {}, scheme: null });
    expect(resolveTelegramNeutrals(LIGHT_TELEGRAM, 'dark')).toEqual({});
  });
});

describe('degraded theme data', () => {
  it.each([
    ['no theme params', undefined],
    ['empty params', {}],
    ['unparseable background', { bg_color: 'rgb(1,2,3)' }],
    ['short hex', { bg_color: '#000' }],
  ])('falls back to the shipped palette: %s', (_label, theme) => {
    expect(resolveTelegramNeutrals(theme)).toEqual({});
  });

  it('still binds the surface when only the background is usable', () => {
    const bound = resolveTelegramNeutrals({ bg_color: '#17212b' });
    expect(bound['--azf-surface']).toBe('23 33 43');
    expect(bound['--azf-on-surface']).toBeUndefined(); // no readable text colour supplied
    expect(bound['--azf-surface-container-low']).toBeTruthy();
  });

  it('ignores a host text colour that is unreadable on its own background', () => {
    const bound = resolveTelegramNeutrals({ bg_color: '#17212b', text_color: '#1a2430' });
    expect(bound['--azf-surface']).toBe('23 33 43');
    expect(bound['--azf-on-surface']).toBeUndefined();
  });
});

describe('themeChanged', () => {
  it('subscribes and re-binds live when the host switches to a light theme', () => {
    let handler: (() => void) | undefined;
    const app = installTelegram({
      colorScheme: 'dark',
      themeParams: { ...DARK_TELEGRAM },
      isVersionAtLeast: () => true,
      onEvent: vi.fn((event, fn: () => void) => {
        if (event === 'themeChanged') handler = fn;
      }),
    });

    initTelegram();
    expect(app.onEvent).toHaveBeenCalledWith('themeChanged', expect.any(Function));
    expect(styleOf('--azf-surface')).toBe('23 33 43');

    app.themeParams = { ...LIGHT_TELEGRAM };
    app.colorScheme = 'light';
    handler?.();

    expect(styleOf('--azf-surface')).toBe('255 255 255');
    expect(document.documentElement.dataset['tgTheme']).toBe('light');
    const primary = toRgb(styleOf('--azf-primary'));
    expect(contrastRatio(primary, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('colour helpers', () => {
  it('parses 6 and 8 digit hex and rejects anything else', () => {
    expect(parseHexColor('#17212b')).toEqual([23, 33, 43]);
    expect(parseHexColor('#17212bff')).toEqual([23, 33, 43]);
    expect(parseHexColor('#fff')).toBeNull();
    expect(parseHexColor(undefined)).toBeNull();
  });

  it('computes WCAG contrast symmetrically', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});
