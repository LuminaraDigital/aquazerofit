// @vitest-environment jsdom
/**
 * REGRESSION GUARD — index.html loads telegram-web-app.js unconditionally, so
 * `window.Telegram.WebApp` exists in an ordinary browser tab, theme params and
 * all. The binding therefore cannot key off "is the SDK here"; it keys off
 * `isTMA()` (signed launch data present). If that ever slips, every browser
 * visitor silently gets repainted in a Telegram palette, which is the exact
 * failure this file exists to catch.
 *
 * The rest of the file pins the contrast rules: a host background is only
 * adopted while it keeps the fixed AquaZero brand foregrounds at WCAG AA, so a
 * light Telegram theme falls back to the shipped palette rather than leaving
 * #8aebff headings at 1.3:1 on white.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTelegramTheme,
  contrastRatio,
  initTelegram,
  keepsBrandLegible,
  parseHexColor,
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
  onEvent?: (event: 'themeChanged', handler: () => void) => void;
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
    // #708499 on #17212b is 4.2:1 — Telegram's own default fails AA.
    expect(contrastRatio([112, 132, 153], [23, 33, 43])).toBeLessThan(4.5);

    const bound = resolveTelegramNeutrals(DARK_TELEGRAM);
    const hint = toRgb(bound['--azf-on-surface-variant'] ?? '');
    expect(contrastRatio(hint, [23, 33, 43])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('inside Telegram, light host', () => {
  it('keeps the shipped palette because the brand ramp could not survive it', () => {
    expect(keepsBrandLegible([255, 255, 255])).toBe(false);
    expect(resolveTelegramNeutrals(LIGHT_TELEGRAM)).toEqual({});
  });

  it('renders readable: every fixed brand foreground stays AA on the fallback surface', () => {
    installTelegram({ colorScheme: 'light', themeParams: LIGHT_TELEGRAM });

    expect(applyTelegramTheme()).toBe(false);
    expect(styleOf('--azf-surface')).toBe('');
    expect(document.documentElement.dataset['tgTheme']).toBeUndefined();
    // #0e1416 is what the stylesheet then supplies.
    for (const fg of [
      [138, 235, 255],
      [69, 223, 164],
      [255, 178, 185],
      [187, 201, 205],
    ] as Rgb[]) {
      expect(contrastRatio(fg, [14, 20, 22])).toBeGreaterThanOrEqual(4.5);
    }
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
  it('subscribes and re-binds live, clearing the binding if the new theme fails the gate', () => {
    let handler: (() => void) | undefined;
    const app = installTelegram({
      colorScheme: 'dark',
      themeParams: { ...DARK_TELEGRAM },
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

    expect(styleOf('--azf-surface')).toBe('');
    expect(styleOf('--azf-surface-container-low')).toBe('');
    expect(document.documentElement.dataset['tgTheme']).toBeUndefined();
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
