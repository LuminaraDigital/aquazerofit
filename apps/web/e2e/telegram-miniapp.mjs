/**
 * Telegram Mini App screenshots against the production build.
 *
 * Serves dist with the Worker CSP (including the JSON-LD nonce), injects a
 * mocked Telegram.WebApp before the app boots, and writes 390x844 dark and
 * light shots. Not part of `npm test` or CI: Playwright is not a workspace
 * dependency, because its install downloads browsers.
 *
 *   npm run build -w @aquazerofit/web
 *   npm install --prefix /tmp/azf-pw playwright-core
 *   node apps/web/e2e/telegram-miniapp.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const playwrightCore =
  process.env.PLAYWRIGHT_CORE || '/tmp/azf-pw/node_modules/playwright-core/index.mjs';
const { chromium } = await import(playwrightCore);

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '../dist');
const outDir = process.env.AZF_SHOTS || '/opt/cursor/artifacts/telegram-miniapp';
const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const { contentSecurityPolicy } = await import(
  new URL('../../../cloudflare/src/securityHeaders.ts', import.meta.url).href,
);

const LD_JSON_OPEN = '<script type="application/ld+json">';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const user = {
  id: 'user_ada',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'user',
  tier: 'free',
  emailVerified: true,
  hasProfile: true,
  telegramLinked: true,
  hasPassword: false,
  timezone: 'Australia/Melbourne',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const profile = {
  userId: user.id,
  weightKg: 72,
  heightCm: 170,
  age: 34,
  sex: 'female',
  goal: 'maintain',
  activityLevel: 'moderate',
  exerciseExperience: 'intermediate',
  dietaryPreferences: [],
  allergies: [],
  equipment: [],
  unitPreference: 'metric',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const targets = {
  userId: user.id,
  bmr: 1450,
  tdee: 1950,
  kcalTarget: 1950,
  proteinG: 120,
  carbsG: 190,
  fatG: 65,
  waterMl: 2500,
  clamped: false,
  clampReason: null,
  computedAt: '2026-10-01T00:00:00.000Z',
  formulaVersion: 'screenshot',
};

function daily() {
  return {
    date: new Date().toISOString().slice(0, 10),
    kcalTarget: 1950,
    kcalConsumed: 640,
    kcalBurned: 180,
    kcalNet: 460,
    kcalRemaining: 1490,
    proteinG: { consumed: 42, target: 120 },
    carbsG: { consumed: 70, target: 190 },
    fatG: { consumed: 18, target: 65 },
    waterMl: { consumed: 500, target: 2500 },
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
  };
}

const progress = {
  currentWeightKg: 72,
  startWeightKg: 74,
  targetWeightKg: 70,
  weightSeries: [],
  streakDays: 4,
  consistency: {
    currentDays: 4,
    bestDays: 12,
    activeDays: 5,
    windowDays: 7,
    graceRemaining: 1,
    state: 'building',
    lastActiveDate: '2026-10-24',
  },
  workoutsCompleted: 2,
  totalKcalBurned: 400,
  achievements: [],
};

const readiness = {
  mode: 'maintain',
  score: 72,
  signals: [],
  headline: 'Steady week. Keep logging.',
  volumeMultiplier: 1,
  periodDays: 7,
};

const progression = {
  activeCoachId: 'akin',
  bondXp: 40,
  bondLevel: 1,
  reactions: [
    {
      coachId: 'akin',
      kind: 'greeting',
      text: 'You are here. What are we doing today?',
      expression: 'neutral',
    },
  ],
  experience: {
    totalXp: 120,
    level: 2,
    rank: { id: 'rookie', name: 'Rookie', minLevel: 1 },
    levelStartXp: 0,
    nextLevelXp: 200,
    levelProgress: 0.4,
    earnedToday: 20,
    todayBreakdown: [],
    dailyCapReached: false,
  },
};

const authBody = {
  accessToken: 'header.payload.signature',
  refreshToken: 'refresh',
  user,
};

function apiBody(pathname, method) {
  if (pathname === '/api/v1/auth/refresh') return { status: 401, body: { code: 'UNAUTHENTICATED', message: 'no cookie' } };
  if (pathname === '/api/v1/auth/telegram' && method === 'POST') return { status: 200, body: authBody };
  if (pathname === '/api/v1/me') return { status: 200, body: { user } };
  if (pathname === '/api/v1/me/profile') return { status: 200, body: { profile } };
  if (pathname === '/api/v1/me/targets') return { status: 200, body: { targets } };
  if (pathname === '/api/v1/me/consents') {
    return {
      status: 200,
      body: {
        consents: {
          wellnessDataProcessing: true,
          aiPersonalisation: false,
          anonymisedAnalytics: false,
          reminders: true,
        },
      },
    };
  }
  if (pathname === '/api/v1/analytics/nutrition/daily') return { status: 200, body: daily() };
  if (pathname === '/api/v1/analytics/nutrition/trends') return { status: 200, body: { kcal: [], weight: [] } };
  if (pathname === '/api/v1/progress/summary') return { status: 200, body: progress };
  if (pathname === '/api/v1/progress/insight') return { status: 200, body: { insight: null } };
  if (pathname === '/api/v1/plans/readiness') return { status: 200, body: { readiness } };
  if (pathname === '/api/v1/workouts/today') return { status: 200, body: { rest: true, session: null, exercises: {} } };
  if (pathname === '/api/v1/coaches/progression') return { status: 200, body: progression };
  if (pathname === '/api/v1/analytics/events') return { status: 204, body: null };
  if (pathname === '/api/v1/coaches/reactions/ack') return { status: 204, body: null };
  return { status: 404, body: { code: 'NOT_FOUND', message: pathname } };
}

function nonce() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}

async function readHtml(filePath) {
  const html = await readFile(filePath, 'utf8');
  if (!html.includes(LD_JSON_OPEN)) {
    return { html, scriptNonce: undefined };
  }
  const value = nonce();
  return {
    html: html.replaceAll(LD_JSON_OPEN, `<script type="application/ld+json" nonce="${value}">`),
    scriptNonce: value,
  };
}

function securityHeaders(scriptNonce) {
  return {
    'Content-Security-Policy': contentSecurityPolicy(scriptNonce),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

async function startServer() {
  const unknown = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        const result = apiBody(url.pathname, req.method || 'GET');
        if (result.status === 404) unknown.push(`${req.method} ${url.pathname}`);
        const headers = {
          ...securityHeaders(),
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        };
        if (result.status === 204) {
          res.writeHead(204, headers);
          res.end();
          return;
        }
        res.writeHead(result.status, headers);
        res.end(JSON.stringify(result.body));
        return;
      }

      const requested = path.normalize(decodeURIComponent(url.pathname));
      const relative = requested === '/' ? '/index.html' : requested;
      let filePath = path.join(distDir, relative);
      if (!filePath.startsWith(distDir)) {
        res.writeHead(400);
        res.end('bad path');
        return;
      }
      let info;
      try {
        info = await stat(filePath);
      } catch {
        info = undefined;
      }
      if (!info || !info.isFile()) {
        filePath = path.join(distDir, 'index.html');
      }
      const ext = path.extname(filePath);
      if (ext === '.html') {
        const stamped = await readHtml(filePath);
        res.writeHead(200, {
          ...securityHeaders(stamped.scriptNonce),
          'Content-Type': MIME['.html'],
          'Cache-Control': 'no-store',
        });
        res.end(stamped.html);
        return;
      }
      res.writeHead(200, {
        ...securityHeaders(),
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
      });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(error instanceof Error ? error.message : 'error');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    unknown,
  };
}

function mockSource(theme) {
  const themeJson = JSON.stringify(theme);
  return `(() => {
    const calls = [];
    const record = (name, detail) => { calls.push({ name, detail: detail ?? null }); };
    const button = (kind) => ({
      show: () => record(kind + '.show'),
      hide: () => record(kind + '.hide'),
      onClick: (fn) => record(kind + '.onClick', typeof fn),
      offClick: () => record(kind + '.offClick'),
      enable: () => record(kind + '.enable'),
      disable: () => record(kind + '.disable'),
      setParams: (params) => record(kind + '.setParams', params),
      setText: (text) => record(kind + '.setText', text),
    });
    const theme = ${themeJson};
    const handlers = {};
    window.Telegram = {
      WebApp: {
        initData: 'query_id=screenshot&user=%7B%22id%22%3A1%7D&auth_date=1700000000&hash=stub',
        initDataUnsafe: { user: { id: 1, first_name: 'Ada' } },
        platform: theme.platform,
        version: '8.0',
        colorScheme: theme.colorScheme,
        themeParams: theme.themeParams,
        viewportStableHeight: 844,
        viewportHeight: 844,
        isExpanded: true,
        safeAreaInset: { top: 47, bottom: 34, left: 0, right: 0 },
        contentSafeAreaInset: { top: 8, bottom: 0, left: 0, right: 0 },
        ready: () => record('ready'),
        expand: () => record('expand'),
        isVersionAtLeast: (version) => {
          record('isVersionAtLeast', version);
          const parse = (value) => String(value).split('.').map((part) => Number(part) || 0);
          const got = parse('8.0');
          const need = parse(version);
          for (let i = 0; i < Math.max(got.length, need.length); i += 1) {
            const a = got[i] || 0;
            const b = need[i] || 0;
            if (a > b) return true;
            if (a < b) return false;
          }
          return true;
        },
        setHeaderColor: (color) => record('setHeaderColor', color),
        setBackgroundColor: (color) => record('setBackgroundColor', color),
        disableVerticalSwipes: () => record('disableVerticalSwipes'),
        enableVerticalSwipes: () => record('enableVerticalSwipes'),
        enableClosingConfirmation: () => record('enableClosingConfirmation'),
        disableClosingConfirmation: () => record('disableClosingConfirmation'),
        onEvent: (event, handler) => {
          record('onEvent', event);
          (handlers[event] ||= []).push(handler);
        },
        offEvent: (event) => record('offEvent', event),
        BackButton: button('BackButton'),
        MainButton: button('MainButton'),
        HapticFeedback: {
          impactOccurred: () => record('haptic'),
          notificationOccurred: () => record('haptic'),
          selectionChanged: () => record('haptic'),
        },
      },
    };
    window.__azfTgCalls = calls;
    window.__azfCsp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__azfCsp.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
        source: event.sourceFile || '',
      });
    });
  })();`;
}

const DARK = {
  platform: 'ios',
  colorScheme: 'dark',
  themeParams: {
    bg_color: '#17212b',
    text_color: '#ffffff',
    hint_color: '#708499',
    link_color: '#6ab7ff',
    button_color: '#5288c1',
    button_text_color: '#ffffff',
    secondary_bg_color: '#232e3c',
  },
};

const LIGHT = {
  platform: 'ios',
  colorScheme: 'light',
  themeParams: {
    bg_color: '#ffffff',
    text_color: '#000000',
    hint_color: '#999999',
    link_color: '#2481cc',
    button_color: '#2481cc',
    button_text_color: '#ffffff',
    secondary_bg_color: '#f0f0f0',
  },
};

function luminance(rgb) {
  const channels = rgb.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
  const lin = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

async function shoot(browser, origin, theme, filename, unknown) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.addInitScript({ content: mockSource(theme) });
  const before = unknown.length;
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  try {
    await page.getByRole('heading', { name: /Hey,\s*Ada/ }).waitFor({ timeout: 15000 });
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    const href = page.url();
    throw new Error(`${filename} did not reach the home screen (${href})\n${body.slice(0, 800)}\n${error}`);
  }
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
  await page.evaluate(() =>
    Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]),
  );
  const report = await page.evaluate(() => {
    const header = document.querySelector('header');
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    const root = document.documentElement;
    const style = root.style;
    return {
      theme: root.dataset.tgTheme || '',
      active: root.classList.contains('tg-active'),
      headerPadTop: header ? getComputedStyle(header).paddingTop : '',
      navPadBottom: nav ? getComputedStyle(nav.querySelector('div')).paddingBottom : '',
      headingColor: getComputedStyle(document.querySelector('main h1')).color,
      surface: style.getPropertyValue('--azf-surface').trim(),
      viewport: style.getPropertyValue('--tg-viewport-stable-height').trim(),
      safeTop: style.getPropertyValue('--tg-safe-area-inset-top').trim(),
      contentTop: style.getPropertyValue('--tg-content-safe-area-inset-top').trim(),
      safeBottom: style.getPropertyValue('--tg-safe-area-inset-bottom').trim(),
      staticBg: Boolean(document.querySelector('.azf-bg-static')),
      cameraFab: Boolean(document.querySelector('[aria-label="Scan a meal with your camera"]')),
      calls: window.__azfTgCalls || [],
      csp: window.__azfCsp || [],
    };
  });
  const freshUnknown = unknown.slice(before);
  const calls = report.calls.map((entry) => entry.name);
  const headerColor = report.calls.find((entry) => entry.name === 'setHeaderColor')?.detail;
  const backgroundColor = report.calls.find((entry) => entry.name === 'setBackgroundColor')?.detail;
  const mainParams = report.calls.find((entry) => entry.name === 'MainButton.setParams')?.detail;
  const problems = [];
  if (!report.active) problems.push('html is missing tg-active');
  if (report.theme !== theme.colorScheme) problems.push(`theme is ${report.theme}`);
  if (report.headerPadTop !== '55px') problems.push(`header safe area ${report.headerPadTop}`);
  if (report.navPadBottom !== '34px') problems.push(`nav safe area ${report.navPadBottom}`);
  if (theme.colorScheme === 'dark' && report.surface !== '23 33 43') problems.push(`surface ${report.surface}`);
  if (theme.colorScheme === 'light' && report.surface !== '255 255 255') problems.push(`surface ${report.surface}`);
  if (report.safeTop !== '47px' || report.contentTop !== '8px' || report.safeBottom !== '34px') {
    problems.push(`safe insets ${report.safeTop}/${report.contentTop}/${report.safeBottom}`);
  }
  if (report.viewport !== '844px') problems.push(`viewport ${report.viewport}`);
  if (headerColor !== theme.themeParams.bg_color) problems.push(`header color ${headerColor}`);
  if (backgroundColor !== theme.themeParams.bg_color) problems.push(`background color ${backgroundColor}`);
  if (!calls.includes('disableVerticalSwipes')) problems.push('vertical swipes were not disabled');
  if (calls.includes('enableClosingConfirmation')) problems.push('closing confirmation enabled with no edits');
  if (!calls.includes('BackButton.hide')) problems.push('back button was not hidden on the root route');
  if (!mainParams || mainParams.text !== 'Log a meal') problems.push('main button is not Log a meal');
  if (report.cameraFab) problems.push('camera button is still on screen beside the main button');
  if (theme.colorScheme === 'light' && !report.staticBg) problems.push('light theme did not use the static background');
  if (theme.colorScheme === 'light' && luminance(report.headingColor) > 0.4) {
    problems.push(`light heading is too bright (${report.headingColor})`);
  }
  if (theme.colorScheme === 'dark' && luminance(report.headingColor) < 0.4) {
    problems.push(`dark heading is too dim (${report.headingColor})`);
  }
  if (report.csp.length) problems.push(`CSP violations: ${JSON.stringify(report.csp)}`);
  if (pageErrors.length) problems.push(`page errors: ${pageErrors.join(' | ')}`);
  if (problems.length) {
    throw new Error(
      `${filename} failed\n${problems.join('\n')}\nunknown api: ${freshUnknown.join(', ')}\n` +
        JSON.stringify({ ...report, calls: undefined }, null, 2),
    );
  }
  const file = path.join(outDir, filename);
  await page.screenshot({ path: file, fullPage: false });
  await page.close();
  return { file, headerColor, backgroundColor, mainText: mainParams.text, staticBg: report.staticBg };
}

async function main() {
  try {
    await stat(path.join(distDir, 'index.html'));
  } catch {
    throw new Error(`missing ${distDir}. Run npm run build -w @aquazerofit/web first.`);
  }
  await mkdir(outDir, { recursive: true });
  const { server, origin, unknown } = await startServer();
  const browser = await chromium.launch({
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const dark = await shoot(browser, origin, DARK, 'home-dark.png', unknown);
    const light = await shoot(browser, origin, LIGHT, 'home-light.png', unknown);
    console.log(JSON.stringify({ origin, dark, light, unknown }, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
