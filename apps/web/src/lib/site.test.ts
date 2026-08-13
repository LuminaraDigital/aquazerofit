/**
 * The marketing manifest drives three things that are generated once at build
 * time and then never looked at again: the sitemap, the prerendered per-route
 * shells, and the runtime meta tags. A bad entry does not break the site — it
 * produces a page that is live, looks fine, and is quietly unindexable or
 * canonicalised to the wrong URL. Nothing else in the codebase would notice,
 * so these invariants are asserted rather than assumed.
 */
import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  MARKETING_ROUTES,
  marketingRoute,
  NON_INDEXABLE_PREFIXES,
  resolveSiteConfig,
  SITE_DEFAULTS,
} from './site';

describe('marketing manifest', () => {
  it('covers the home page', () => {
    expect(marketingRoute('/')).toBeDefined();
  });

  it('has no duplicate paths', () => {
    const paths = MARKETING_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('uses rooted paths with no trailing slash', () => {
    for (const route of MARKETING_ROUTES) {
      expect(route.path.startsWith('/')).toBe(true);
      if (route.path !== '/') expect(route.path.endsWith('/')).toBe(false);
    }
  });

  it('never lists a route that robots.txt then forbids', () => {
    // The pair that silently cancels out: a URL in the sitemap and a Disallow
    // covering it. Search Console reports it as a warning nobody reads.
    for (const route of MARKETING_ROUTES) {
      const blocked = NON_INDEXABLE_PREFIXES.some((prefix) => route.path.startsWith(prefix));
      expect(blocked, `${route.path} is both in the sitemap and disallowed`).toBe(false);
    }
  });

  it('keeps titles and descriptions inside what search results display', () => {
    for (const route of MARKETING_ROUTES) {
      expect(route.title.length, `${route.path} title`).toBeLessThanOrEqual(65);
      expect(route.description.length, `${route.path} description`).toBeGreaterThan(50);
      expect(route.description.length, `${route.path} description`).toBeLessThanOrEqual(200);
    }
  });

  it('gives every route standalone crawlable copy', () => {
    for (const route of MARKETING_ROUTES) {
      // The <noscript> summary is all a non-executing crawler gets.
      expect(route.summary.length, `${route.path} summary`).toBeGreaterThan(120);
    }
  });

  it('normalises a trailing slash when looking a route up', () => {
    expect(marketingRoute('/features/')?.path).toBe('/features');
  });
});

describe('canonicalUrl', () => {
  it('keeps exactly one slash at the root and none elsewhere', () => {
    expect(canonicalUrl('https://x.test', '/')).toBe('https://x.test/');
    expect(canonicalUrl('https://x.test', '/features')).toBe('https://x.test/features');
  });
});

describe('resolveSiteConfig', () => {
  it('falls back to the defaults for an empty environment', () => {
    expect(resolveSiteConfig({})).toEqual(SITE_DEFAULTS);
  });

  it('strips a trailing slash from the origin so canonicals never double up', () => {
    expect(resolveSiteConfig({ VITE_SITE_ORIGIN: 'https://x.test/' }).siteOrigin).toBe(
      'https://x.test',
    );
  });

  it('accepts the bot username with or without the @ people actually type', () => {
    expect(resolveSiteConfig({ VITE_TELEGRAM_BOT_USERNAME: '@MyBot' }).telegramBotUsername).toBe(
      'MyBot',
    );
  });

  it('honours an explicitly empty Mini App short name', () => {
    // '' means "bot with no registered Mini App" — a real deployment, and one
    // a plain ?? fallback would silently override back to 'app'.
    expect(
      resolveSiteConfig({ VITE_TELEGRAM_MINI_APP_SHORT_NAME: '' }).telegramMiniAppShortName,
    ).toBe('');
  });

  it('ignores whitespace-only overrides rather than building a broken link', () => {
    expect(resolveSiteConfig({ VITE_TELEGRAM_BOT_USERNAME: '   ' }).telegramBotUsername).toBe(
      SITE_DEFAULTS.telegramBotUsername,
    );
  });
});
