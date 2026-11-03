// @vitest-environment jsdom
/**
 * Telegram chrome is version-gated and inert outside a Mini App.
 * A client that cannot prove its Bot API version, or that is older than the
 * method, must not be called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { contrastRatio, parseHexColor } from './telegram';
import {
  installTelegramChrome,
  mainButtonPalette,
  publishTelegramViewport,
  resetTelegramChromeForTests,
  retainClosingConfirmation,
  shouldUseStaticTelegramBackground,
  supportsTelegramMainButton,
  syncTelegramBackButton,
  syncTelegramChromeColors,
  syncTelegramMainButton,
  syncTelegramVerticalSwipes,
} from './telegramChrome';
import { useTelegramBackButton, useTelegramMainAction, useTelegramUnsavedEdits } from './useTelegramChrome';

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface FakeButton {
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  onClick: ReturnType<typeof vi.fn>;
  offClick: ReturnType<typeof vi.fn>;
  enable?: ReturnType<typeof vi.fn>;
  disable?: ReturnType<typeof vi.fn>;
  setParams?: ReturnType<typeof vi.fn>;
}

interface FakeWebApp {
  initData: string;
  version: string;
  platform?: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  viewportStableHeight?: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor: ReturnType<typeof vi.fn>;
  setBackgroundColor: ReturnType<typeof vi.fn>;
  disableVerticalSwipes: ReturnType<typeof vi.fn>;
  enableVerticalSwipes: ReturnType<typeof vi.fn>;
  enableClosingConfirmation: ReturnType<typeof vi.fn>;
  disableClosingConfirmation: ReturnType<typeof vi.fn>;
  BackButton: FakeButton;
  MainButton: FakeButton;
  onEvent: ReturnType<typeof vi.fn>;
  offEvent: ReturnType<typeof vi.fn>;
  handlers: Record<string, ((...args: unknown[]) => void)[]>;
}

function atLeast(current: string, required: string): boolean {
  const parse = (value: string) => value.split('.').map((part) => Number(part) || 0);
  const left = parse(current);
  const right = parse(required);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta > 0;
  }
  return true;
}

function button(): FakeButton {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    onClick: vi.fn(),
    offClick: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    setParams: vi.fn(),
  };
}

function install(partial: Partial<FakeWebApp> & { version?: string; withVersion?: boolean } = {}): FakeWebApp {
  const version = partial.version ?? '8.0';
  const withVersion = partial.withVersion !== false;
  const handlers: FakeWebApp['handlers'] = {};
  const webApp = {
    initData: 'query_id=stub&hash=stub',
    version,
    platform: 'ios',
    colorScheme: 'dark' as const,
    themeParams: { bg_color: '#17212b', button_color: '#5288c1', button_text_color: '#ffffff' },
    viewportStableHeight: 700,
    safeAreaInset: { top: 47, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 12, bottom: 8, left: 3, right: 4 },
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    disableVerticalSwipes: vi.fn(),
    enableVerticalSwipes: vi.fn(),
    enableClosingConfirmation: vi.fn(),
    disableClosingConfirmation: vi.fn(),
    BackButton: button(),
    MainButton: button(),
    handlers,
    onEvent: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = [...(handlers[event] ?? []), handler];
    }),
    offEvent: vi.fn(),
    ...partial,
    isVersionAtLeast: withVersion ? (required: string) => atLeast(version, required) : undefined,
  } as FakeWebApp;
  (window as unknown as { Telegram?: { WebApp?: FakeWebApp } }).Telegram = { WebApp: webApp };
  return webApp;
}

function cssVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name).trim();
}

beforeEach(() => {
  resetTelegramChromeForTests();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-tg-theme');
  document.documentElement.classList.remove('tg-active');
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
  resetTelegramChromeForTests();
});

describe('outside Telegram', () => {
  it('does not call the host or mark the document', () => {
    installTelegramChrome();
    syncTelegramChromeColors();
    syncTelegramBackButton(true, () => undefined);
    syncTelegramVerticalSwipes(true);
    retainClosingConfirmation();
    expect(document.documentElement.classList.contains('tg-active')).toBe(false);
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });
});

describe('version gates', () => {
  it('calls nothing when isVersionAtLeast is missing', () => {
    const app = install({ withVersion: false, version: '6.0' });
    installTelegramChrome();
    syncTelegramBackButton(true, () => undefined);
    syncTelegramVerticalSwipes(true);
    retainClosingConfirmation()();
    syncTelegramMainButton({ id: 'a', text: 'Log a meal', enabled: true, onClick: () => undefined });
    expect(app.setHeaderColor).not.toHaveBeenCalled();
    expect(app.BackButton.show).not.toHaveBeenCalled();
    expect(app.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(app.enableClosingConfirmation).not.toHaveBeenCalled();
    expect(app.MainButton.show).not.toHaveBeenCalled();
    expect(cssVar('--tg-viewport-stable-height')).toBe('');
    expect(cssVar('--tg-safe-area-inset-top')).toBe('');
  });

  it('paints header and background on 6.1 and skips newer methods', () => {
    const app = install({ version: '6.1' });
    document.documentElement.style.setProperty('--azf-surface', '23 33 43');
    installTelegramChrome();
    syncTelegramBackButton(true, () => undefined);
    syncTelegramVerticalSwipes(true);
    retainClosingConfirmation();
    expect(app.setHeaderColor).toHaveBeenCalledWith('#17212b');
    expect(app.setBackgroundColor).toHaveBeenCalledWith('#17212b');
    expect(app.BackButton.show).toHaveBeenCalled();
    expect(app.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(app.enableClosingConfirmation).not.toHaveBeenCalled();
    expect(cssVar('--tg-viewport-stable-height')).toBe('700px');
    expect(cssVar('--tg-safe-area-inset-top')).toBe('');
  });

  it('uses the bg_color keyword below 6.9 when the painted surface is not the host background', () => {
    const app = install({ version: '6.4', themeParams: { bg_color: '#ffffff' } });
    document.documentElement.style.setProperty('--azf-surface', '14 20 22');
    syncTelegramChromeColors();
    expect(app.setHeaderColor).toHaveBeenCalledWith('bg_color');
    expect(app.setBackgroundColor).toHaveBeenCalledWith('bg_color');
  });

  it('passes an arbitrary hex from 6.9', () => {
    const app = install({ version: '6.9', themeParams: {} });
    syncTelegramChromeColors();
    expect(app.setHeaderColor).toHaveBeenCalledWith('#0e1416');
    expect(app.setBackgroundColor).toHaveBeenCalledWith('#0e1416');
  });

  it('enables closing confirmation only while edits are unsaved, from 6.2', () => {
    const app = install({ version: '6.2' });
    expect(app.enableClosingConfirmation).not.toHaveBeenCalled();
    const releaseA = retainClosingConfirmation();
    const releaseB = retainClosingConfirmation();
    expect(app.enableClosingConfirmation).toHaveBeenCalledTimes(2);
    releaseA();
    expect(app.disableClosingConfirmation).not.toHaveBeenCalled();
    releaseB();
    expect(app.disableClosingConfirmation).toHaveBeenCalledTimes(1);
  });

  it('disables vertical swipes only on scrollable screens, from 7.7', () => {
    const old = install({ version: '7.6' });
    syncTelegramVerticalSwipes(true);
    expect(old.disableVerticalSwipes).not.toHaveBeenCalled();

    resetTelegramChromeForTests();
    const app = install({ version: '7.7' });
    syncTelegramVerticalSwipes(true);
    syncTelegramVerticalSwipes(false);
    expect(app.disableVerticalSwipes).toHaveBeenCalledTimes(1);
    expect(app.enableVerticalSwipes).toHaveBeenCalledTimes(1);
  });

  it('publishes safe-area and content-safe-area insets on 8.0', () => {
    install({ version: '8.0' });
    installTelegramChrome();
    expect(cssVar('--tg-safe-area-inset-top')).toBe('47px');
    expect(cssVar('--tg-safe-area-inset-bottom')).toBe('34px');
    expect(cssVar('--tg-safe-area-inset-left')).toBe('0px');
    expect(cssVar('--tg-safe-area-inset-right')).toBe('0px');
    expect(cssVar('--tg-content-safe-area-inset-top')).toBe('12px');
    expect(cssVar('--tg-content-safe-area-inset-bottom')).toBe('8px');
    expect(cssVar('--tg-content-safe-area-inset-left')).toBe('3px');
    expect(cssVar('--tg-content-safe-area-inset-right')).toBe('4px');
    expect(document.documentElement.classList.contains('tg-active')).toBe(true);
  });

  it('updates viewportStableHeight when the resize settles', () => {
    const app = install({ version: '8.0', viewportStableHeight: 640 });
    installTelegramChrome();
    expect(cssVar('--tg-viewport-stable-height')).toBe('640px');

    app.viewportStableHeight = 500;
    app.handlers['viewportChanged']?.[0]?.({ isStateStable: false });
    expect(cssVar('--tg-viewport-stable-height')).toBe('640px');

    app.viewportStableHeight = 812;
    app.handlers['viewportChanged']?.[0]?.({ isStateStable: true });
    expect(cssVar('--tg-viewport-stable-height')).toBe('812px');

    app.safeAreaInset = { top: 20, bottom: 10, left: 1, right: 2 };
    app.handlers['safeAreaChanged']?.[0]?.();
    expect(cssVar('--tg-safe-area-inset-top')).toBe('20px');
    expect(cssVar('--tg-safe-area-inset-right')).toBe('2px');
  });

  it('ignores a non-positive viewport height', () => {
    install({ version: '8.0', viewportStableHeight: 0 });
    publishTelegramViewport();
    expect(cssVar('--tg-viewport-stable-height')).toBe('');
  });
});

describe('main button', () => {
  it('shows one primary action and hides it when that screen releases it', () => {
    const app = install({ version: '8.0' });
    const onClick = vi.fn();
    syncTelegramMainButton({ id: 'log', text: 'Log a meal', enabled: true, onClick });
    expect(app.MainButton.setParams).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Log a meal', is_visible: true, is_active: true }),
    );
    expect(app.MainButton.show).toHaveBeenCalled();
    const colors = app.MainButton.setParams?.mock.calls[0]?.[0] as { color: string; text_color: string };
    const background = parseHexColor(colors.color);
    const text = parseHexColor(colors.text_color);
    expect(background && text && contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);

    app.MainButton.onClick.mock.calls[0]?.[0]?.();
    expect(onClick).toHaveBeenCalledTimes(1);

    syncTelegramMainButton(null, 'someone-else');
    expect(app.MainButton.hide).not.toHaveBeenCalled();
    syncTelegramMainButton(null, 'log');
    expect(app.MainButton.hide).toHaveBeenCalled();
  });

  it('falls back to a readable pair when the host button colours fail AA', () => {
    expect(
      mainButtonPalette({ button_color: '#ffffff', button_text_color: '#fefefe' }, 'light'),
    ).toEqual({ color: '#0f6f82', textColor: '#ffffff' });
    const dark = mainButtonPalette({ button_color: '#111111', button_text_color: '#151515' }, 'dark');
    expect(contrastRatio(parseHexColor(dark.textColor)!, parseHexColor(dark.color)!)).toBeGreaterThanOrEqual(4.5);
  });

  it('is unavailable below 6.1', () => {
    install({ version: '6.0', withVersion: false });
    expect(supportsTelegramMainButton()).toBe(false);
  });
});

describe('static background gate', () => {
  const inside = { inTelegram: true as const };

  it('stays off outside Telegram even on a low-end device', () => {
    expect(
      shouldUseStaticTelegramBackground({
        inTelegram: false,
        platform: 'android',
        deviceMemory: 2,
        hardwareConcurrency: 2,
        prefersReducedMotion: true,
      }),
    ).toBe(false);
  });

  it.each([
    ['android', { platform: 'android' }],
    ['android_x', { platform: 'android_x' }],
    ['deviceMemory 4', { deviceMemory: 4, platform: 'ios' }],
    ['hardwareConcurrency 4', { hardwareConcurrency: 4, platform: 'ios' }],
    ['reduced motion', { prefersReducedMotion: true, platform: 'ios' }],
    ['light scheme', { colorScheme: 'light' as const, platform: 'ios', deviceMemory: 8, hardwareConcurrency: 8 }],
  ])('uses a static background inside Telegram: %s', (_label, extra) => {
    expect(shouldUseStaticTelegramBackground({ ...inside, ...extra })).toBe(true);
  });

  it('keeps WebGL on a high-end dark iOS client', () => {
    expect(
      shouldUseStaticTelegramBackground({
        ...inside,
        platform: 'ios',
        colorScheme: 'dark',
        deviceMemory: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe(false);
  });
});

describe('router back button', () => {
  it('hides on the root and shows on a nested route', () => {
    const app = install({ version: '8.0' });
    function Page() {
      useTelegramBackButton();
      return <p>nutrition</p>;
    }
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(app.BackButton.hide).toHaveBeenCalled();
    expect(app.BackButton.show).not.toHaveBeenCalled();
    unmount();
  });

  it('navigates back from a non-root route', async () => {
    const app = install({ version: '8.0' });
    function Page() {
      useTelegramBackButton();
      return <p>nutrition</p>;
    }
    render(
      <MemoryRouter initialEntries={['/', '/nutrition']} initialIndex={1}>
        <Routes>
          <Route path="/" element={<p>home</p>} />
          <Route path="/nutrition" element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(app.BackButton.show).toHaveBeenCalled();
    const handler = app.BackButton.onClick.mock.calls.at(-1)?.[0] as () => void;
    handler();
    expect(await screen.findByText('home')).toBeTruthy();
  });
});

describe('main action hook', () => {
  it('reports the native button so the screen can drop its duplicate', () => {
    install({ version: '8.0' });
    function Screen() {
      const native = useTelegramMainAction({ text: 'Continue', onClick: () => undefined });
      return <p>{native ? 'native' : 'inline'}</p>;
    }
    render(
      <MemoryRouter>
        <Screen />
      </MemoryRouter>,
    );
    expect(screen.getByText('native')).toBeTruthy();
  });

  it('keeps the on-screen control when the client is too old', () => {
    install({ version: '6.0', withVersion: false });
    function Screen() {
      const native = useTelegramMainAction({ text: 'Continue', onClick: () => undefined });
      return <p>{native ? 'native' : 'inline'}</p>;
    }
    render(
      <MemoryRouter>
        <Screen />
      </MemoryRouter>,
    );
    expect(screen.getByText('inline')).toBeTruthy();
  });
});

describe('unsaved edits hook', () => {
  it('arms confirmation only while dirty', () => {
    const app = install({ version: '6.2' });
    function Form({ dirty }: { dirty: boolean }) {
      useTelegramUnsavedEdits(dirty);
      return null;
    }
    const view = render(
      <MemoryRouter>
        <Form dirty />
      </MemoryRouter>,
    );
    expect(app.enableClosingConfirmation).toHaveBeenCalled();
    view.rerender(
      <MemoryRouter>
        <Form dirty={false} />
      </MemoryRouter>,
    );
    expect(app.disableClosingConfirmation).toHaveBeenCalled();
  });
});
