/**
 * REGRESSION GUARD — the palette moved behind CSS custom properties so the
 * Telegram Mini App could bind the host theme centrally. That refactor is only
 * acceptable if the browser target renders exactly what it rendered before,
 * so this test pins both halves of the indirection:
 *
 *   1. every Tailwind colour resolves through `rgb(var(--azf-*) / <alpha>)`
 *      — the `<alpha-value>` placeholder is what keeps `bg-surface/60` and
 *      the ~60 other opacity modifiers in this app working through a variable;
 *   2. every `--azf-*` default in :root is the exact channel form of the hex
 *      the "Modern Aquatic Wellness" palette shipped with.
 *
 * The hex table below is a frozen copy of the palette as of the commit before
 * the indirection. It is deliberately duplicated rather than derived: a table
 * derived from the source it checks would prove nothing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SHIPPED_PALETTE: Record<string, string> = {
  surface: '#0e1416',
  'surface-dim': '#0e1416',
  'surface-bright': '#343a3c',
  'surface-container-lowest': '#090f11',
  'surface-container-low': '#161d1e',
  'surface-container': '#1a2122',
  'surface-container-high': '#242b2d',
  'surface-container-highest': '#2f3638',
  'on-surface': '#dde4e5',
  'on-surface-variant': '#bbc9cd',
  outline: '#859397',
  'outline-variant': '#3c494c',
  'surface-tint': '#2fd9f4',
  primary: '#8aebff',
  'on-primary': '#00363e',
  'primary-container': '#22d3ee',
  'on-primary-container': '#005763',
  secondary: '#45dfa4',
  'on-secondary': '#003825',
  'secondary-container': '#00bd85',
  'on-secondary-container': '#00452e',
  tertiary: '#ffd2d5',
  'on-tertiary': '#67001f',
  'tertiary-container': '#ffaab2',
  'on-tertiary-container': '#94223a',
  error: '#ffb4ab',
  'on-error': '#690005',
  'error-container': '#93000a',
  'on-error-container': '#ffdad6',
  'primary-fixed-dim': '#2fd9f4',
  'secondary-fixed-dim': '#45dfa4',
  'tertiary-fixed-dim': '#ffb2b9',
  'border-aqua': '#1E4C74',
  coral: '#ffb2b9',
};

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const tailwindConfig = read('../../tailwind.config.js');
const stylesheet = read('./index.css');

/** The `:root { ... }` block that declares the defaults. */
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(stylesheet)?.[1] ?? '';

function hexToChannels(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

describe('design tokens', () => {
  it('routes every Tailwind colour through an --azf-* variable with an alpha placeholder', () => {
    for (const token of Object.keys(SHIPPED_PALETTE)) {
      expect(tailwindConfig).toContain(`rgb(var(--azf-${token}) / <alpha-value>)`);
    }
  });

  it('leaves no literal colour behind in the Tailwind palette', () => {
    const colours = /colors:\s*\{([\s\S]*?)\n\s{6}\},/.exec(tailwindConfig)?.[1];
    expect(colours).toBeTruthy();
    expect(colours).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('declares each default as the exact channel form of the shipped hex', () => {
    for (const [token, hex] of Object.entries(SHIPPED_PALETTE)) {
      const declared = new RegExp(`--azf-${token}:\\s*([^;]+);`).exec(rootBlock)?.[1]?.trim();
      expect(declared, `--azf-${token} is missing from :root`).toBeDefined();
      expect(declared, `--azf-${token} drifted from ${hex}`).toBe(hexToChannels(hex));
    }
  });

  it('declares no tokens beyond the shipped palette', () => {
    const declared = rootBlock.match(/--azf-[a-z-]+:/g) ?? [];
    expect(declared).toHaveLength(Object.keys(SHIPPED_PALETTE).length);
  });
});
