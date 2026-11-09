/**
 * /llms.txt is generated from the marketing manifest. A link to a page that
 * is not in that list, or a claim that is not on the page, would ship as
 * fact to any client that fetches the file.
 */
import { describe, expect, it } from 'vitest';
import { LLMS_SUMMARY, PLAY_STORE_LISTING_URL, llmsLineForPath, llmsSectionPaths, renderLlmsTxt } from './llms';
import { MARKETING_ROUTES, SITE_DEFAULTS, canonicalUrl, resolveSiteConfig } from './site';

const cfg = resolveSiteConfig({});

function render(): string {
  return renderLlmsTxt(cfg);
}

describe('renderLlmsTxt', () => {
  it('opens with the project H1 and a single blockquote line', () => {
    const lines = render().split('\n');
    expect(lines[0]).toBe('# AquaZeroFit');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe(`> ${LLMS_SUMMARY}`);
    expect(lines[2].startsWith('> ')).toBe(true);
    expect(lines[2].includes('\n')).toBe(false);
    expect(render().split('\n').filter((line) => line.startsWith('> '))).toHaveLength(1);
  });

  it('states the Play listing and the published Premium prices', () => {
    expect(LLMS_SUMMARY).toContain(PLAY_STORE_LISTING_URL);
    expect(LLMS_SUMMARY).toContain('available in Australia');
    expect(LLMS_SUMMARY).toContain('A$9.99/month');
    expect(LLMS_SUMMARY).toContain('A$79.99/year');
    expect(LLMS_SUMMARY).not.toMatch(/\d[\d,]*\s+(users|downloads|customers|members)/i);
  });

  it('lists each sitemap route once, and no other site path', () => {
    const paths = llmsSectionPaths();
    expect(new Set(paths)).toEqual(new Set(MARKETING_ROUTES.map((route) => route.path)));
    expect(paths).toHaveLength(MARKETING_ROUTES.length);

    const text = render();
    for (const route of MARKETING_ROUTES) {
      const url = canonicalUrl(SITE_DEFAULTS.siteOrigin, route.path);
      expect(text).toContain(`](${url}): ${route.description}`);
    }

    const links = [...text.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]);
    expect(links).toHaveLength(MARKETING_ROUTES.length);
    for (const link of links) {
      const url = new URL(link);
      expect(url.origin).toBe(SITE_DEFAULTS.siteOrigin);
      const path = url.pathname === '' ? '/' : url.pathname;
      expect(MARKETING_ROUTES.some((route) => route.path === path)).toBe(true);
    }
  });

  it('uses H2 sections and absolute links on the production origin', () => {
    const text = render();
    expect(text).toContain('\n## Product\n');
    expect(text).toContain('\n## Policies and support\n');
    expect(text).toContain('- [Home](https://aquazerofit.com/):');
    expect(text).toContain('- [Privacy notice](https://aquazerofit.com/privacy):');
    expect(text).toContain('- [Terms of use](https://aquazerofit.com/terms):');
    expect(text).toContain('- [Support](https://aquazerofit.com/support):');
    expect(text).not.toContain('](/');
  });

  it('follows a configured site origin instead of hard-coding the host in the list', () => {
    const text = renderLlmsTxt(resolveSiteConfig({ VITE_SITE_ORIGIN: 'https://preview.example' }));
    expect(text).toContain('https://preview.example/privacy');
    expect(text).not.toContain('https://aquazerofit.com/privacy');
    expect(text).toContain(PLAY_STORE_LISTING_URL);
  });

  it('uses commas, colons, and hyphens, not em or en dashes', () => {
    expect(render()).not.toMatch(/[\u2013\u2014]/);
  });

  it('does not link signed-in application paths', () => {
    const text = render();
    expect(text).not.toContain('/sign-in');
    expect(text).not.toContain('/nutrition');
    expect(text).not.toContain('/settings');
  });

  it('rejects a path that is not a marketing route', () => {
    expect(() => llmsLineForPath('/sign-in', cfg)).toThrow(/not a marketing route/);
  });
});
