/**
 * The marketing pages show real captures of the app, served from
 * public/screenshots at 1x and 2x. A renamed or deleted capture fails here
 * instead of shipping a broken image to the landing page.
 *
 * The heading face also keeps its metric-matched fallback: without it the
 * sub-page headlines wrapped wider while Barlow Condensed loaded and shifted
 * the page when it arrived.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const source = (file: string) => readFileSync(here(file), 'utf8');

const galleryIds = [...source('./LandingSections.tsx').matchAll(/^\s+id: '([a-z-]+)',$/gm)].map((m) => m[1]);
const stepIds = [...source('./HowItWorks.tsx').matchAll(/screenshot: '([a-z-]+)'/g)].map((m) => m[1]);

describe('landing screenshots', () => {
  it('finds the six gallery captures and the how-it-works captures', () => {
    expect(galleryIds).toHaveLength(6);
    expect(stepIds.length).toBeGreaterThan(0);
  });

  it.each([...new Set([...galleryIds, ...stepIds])])('%s exists at 1x and 2x', (id) => {
    expect(existsSync(here(`../../../public/screenshots/${id}.webp`))).toBe(true);
    expect(existsSync(here(`../../../public/screenshots/${id}@2x.webp`))).toBe(true);
  });
});

describe('heading font fallback', () => {
  it('declares a size-adjusted stand-in and lists it before the generic family', () => {
    expect(source('../../styles/index.css')).toMatch(
      /font-family: 'Barlow Condensed Fallback';[\s\S]*?size-adjust: 74\.4%;/,
    );
    expect(source('../../../tailwind.config.js')).toContain(
      `heading: ['"Barlow Condensed"', '"Barlow Condensed Fallback"', 'sans-serif']`,
    );
  });
});
