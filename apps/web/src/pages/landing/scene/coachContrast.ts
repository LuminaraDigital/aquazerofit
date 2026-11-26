/**
 * Deterministic WCAG 2.2 AA contrast helper for fighter theme colours on dark
 * Corner Card surfaces (`#161D1E` to `#2F3638`).
 *
 * Several coaches in `packages/shared/src/coaches.ts` carry saturated mid/dark
 * brand hues (e.g. Paul `#4338ca`, Dmitry `#475569`, Ogun `#dc2626`) that work
 * well for borders and decorative accent bars, but fall below 4.5:1 as small
 * text on `#161D1E` or `#2F3638`. This blends any dark accent toward `#DDE4E5`
 * (`onSurface`) until contrast against `#2F3638` reaches >= 5.5:1.
 */

const LIGHTEST_DARK_SURFACE: [number, number, number] = [47, 54, 56]; // #2F3638
const ON_SURFACE_RGB: [number, number, number] = [221, 228, 229]; // #DDE4E5
const TARGET_RATIO = 5.5;

function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function channelLum(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

export function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function toHex([r, g, b]: [number, number, number]): string {
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Returns an accessible text colour derived from `hex`, >= 5.5:1 on `#2F3638`. */
export function coachInkOnDark(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#8aebff';
  if (contrastRatio(rgb, LIGHTEST_DARK_SURFACE) >= TARGET_RATIO) return hex;

  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const mixed: [number, number, number] = [
      rgb[0] + (ON_SURFACE_RGB[0] - rgb[0]) * t,
      rgb[1] + (ON_SURFACE_RGB[1] - rgb[1]) * t,
      rgb[2] + (ON_SURFACE_RGB[2] - rgb[2]) * t,
    ];
    if (contrastRatio(mixed, LIGHTEST_DARK_SURFACE) >= TARGET_RATIO) {
      return toHex(mixed);
    }
  }
  return '#dde4e5';
}
