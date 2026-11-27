/**
 * The marketing pages show real captures of the app, served from
 * public/screenshots at 1x and 2x, plus the AZH-001 collectible card, intro
 * brand reels, and every coach portrait/avatar/variant referenced by the
 * interactive scenes. A renamed or deleted asset fails here instead of
 * shipping a broken image or video to production.
 *
 * The heading face also keeps its metric-matched fallback: without it the
 * sub-page headlines wrapped wider while Barlow Condensed loaded and shifted
 * the page when it arrived.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COACHES } from '@aquazerofit/shared';
import { SCREENSHOT_IDS } from './PhoneShowcase';

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const source = (file: string) => readFileSync(here(file), 'utf8');
const publicFile = (webPath: string) => here(`../../../public${webPath}`);

describe('landing screenshots', () => {
  it('tracks every canonical Android capture used across the marketing routes', () => {
    expect(SCREENSHOT_IDS.length).toBeGreaterThanOrEqual(8);
  });

  it.each([...SCREENSHOT_IDS])('%s exists at 1x and 2x', (id) => {
    expect(existsSync(publicFile(`/screenshots/${id}.webp`))).toBe(true);
    expect(existsSync(publicFile(`/screenshots/${id}@2x.webp`))).toBe(true);
  });
});

describe('marketing media assets', () => {
  it.each([
    '/cards/akin-divinus.webp',
    '/intro/intro-169.mp4',
    '/intro/intro-916.mp4',
  ])('%s exists in public/', (assetPath) => {
    expect(existsSync(publicFile(assetPath))).toBe(true);
  });

  it('has portrait, avatar, and optional variant artwork for every coach in the roster', () => {
    for (const coach of COACHES) {
      expect(existsSync(publicFile(coach.art.portrait)), coach.art.portrait).toBe(true);
      expect(existsSync(publicFile(coach.art.avatar)), coach.art.avatar).toBe(true);
      if (coach.art.variant) {
        expect(existsSync(publicFile(coach.art.variant)), coach.art.variant).toBe(true);
      }
    }
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
