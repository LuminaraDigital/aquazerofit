/**
 * Share Kit story art (AZF-P1 US-F2): one 1080×1920 PNG per card kind, belt
 * and season accent.
 *
 *   node tools/share/build-story-art.mjs
 *
 * Writes apps/web/public/share/story/<kind>-<tier>-<accent>.png, the path
 * `storyArtPath` in packages/shared/src/fightCamp.ts builds.
 *
 * Why static: Telegram's `shareToStory` takes a public HTTPS URL it fetches
 * itself, so a story image cannot be drawn per person in the browser. Each
 * image is identical for everyone with the same kind, belt and season, which
 * is what lets it be public: it carries a belt, a season name and the
 * wordmark, and nothing about the person sharing it. Their link rides in the
 * caption. Effort only: no number of any kind, no weight, food or photo.
 *
 * Layout respects the story safe zone (120 px top, 240 px bottom), which the
 * Telegram and Instagram story chrome covers. Flat colour and a palette PNG
 * keep each file small (well under the 400 KB budget).
 *
 * The colours, season names and belt shapes mirror packages/shared
 * (SEASON_ACCENTS, SEASON_NAMES) and apps/web/src/lib/fightRecord.ts
 * (BELT_COLOUR). This script cannot import TypeScript, so a change there means
 * a change here and a re-run; the web test `shareKit.test.tsx` fails if any
 * file the app can ask for is missing.
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// sharp is hoisted to the workspace root by npm (see tools/belts).
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'apps', 'web', 'public', 'share', 'story');

/** Index = season number % 6, as in SEASON_ACCENTS. */
const ACCENTS = [
  { id: 'gold', colour: '#c9a227', season: 'Title Run' },
  { id: 'red', colour: '#d1495b', season: 'Fight Camp' },
  { id: 'teal', colour: '#2a9d8f', season: 'Ground Game' },
  { id: 'blue', colour: '#3d7bd9', season: 'Second Wind' },
  { id: 'amber', colour: '#e08e2b', season: 'Ring Craft' },
  { id: 'violet', colour: '#8b5cf6', season: 'Long Game' },
];

const BELTS = {
  white: { label: 'WHITE BELT', colour: '#f4f6f8', bar: '#16181d' },
  blue: { label: 'BLUE BELT', colour: '#2f6fed', bar: '#16181d' },
  purple: { label: 'PURPLE BELT', colour: '#7b4fd6', bar: '#16181d' },
  brown: { label: 'BROWN BELT', colour: '#8a5a3b', bar: '#16181d' },
  black: { label: 'BLACK BELT', colour: '#16181d', bar: '#d62828' },
};

/** Headline and line per kind. `belt` kinds put the belt's name up top. */
const KINDS = {
  belt: { tiers: Object.keys(BELTS), headline: (b) => b.label, line: 'Earned by showing up' },
  season: { tiers: ['none', ...Object.keys(BELTS)], headline: () => 'IN FIGHT CAMP', line: 'Showing up, day by day' },
  recap: { tiers: ['none', ...Object.keys(BELTS)], headline: () => 'MY SEASON', line: 'Every day I showed up counted' },
  week: { tiers: ['none'], headline: () => 'SHOWED UP THIS WEEK', line: 'One day at a time' },
  squad_invite: { tiers: ['none'], headline: () => 'JOIN MY SQUAD', line: 'Five people who show up together' },
};

function beltShape({ colour, bar }, outline = 'rgba(242,251,255,0.6)') {
  return `
    <g stroke="${outline}" stroke-width="2" stroke-linejoin="round">
      <rect x="4" y="16" width="112" height="16" rx="5" fill="${colour}"/>
      <rect x="88" y="18" width="14" height="12" fill="${bar}" stroke="none"/>
      <path d="M57 32 L46 52 L53 54 L61 32 Z" fill="${colour}"/>
      <path d="M63 32 L74 52 L67 54 L59 32 Z" fill="${colour}"/>
      <rect x="50" y="11" width="20" height="26" rx="5" fill="${colour}"/>
    </g>`;
}

/**
 * What fills the middle of a card with no belt on it: something true to the
 * kind, never a count. A squad has five places; a week has seven days; a
 * season with no belt yet shows the belt still to come, in outline.
 */
function motif(kind, accent) {
  const font = 'Segoe UI, Helvetica Neue, Arial, sans-serif';
  if (kind === 'squad_invite') {
    return [0, 1, 2, 3, 4]
      .map((i) => `<circle cx="${220 + i * 160}" cy="680" r="56" fill="${i === 0 ? accent.colour : 'none'}"
        stroke="${accent.colour}" stroke-width="8"/>`)
      .join('');
  }
  if (kind === 'week') {
    return ['M', 'T', 'W', 'T', 'F', 'S', 'S']
      .map((d, i) => `<text x="${180 + i * 120}" y="700" text-anchor="middle" font-family="${font}"
        font-size="64" font-weight="700" fill="${accent.colour}">${d}</text>`)
      .join('');
  }
  return `<g transform="translate(90 600) scale(7.5)">${beltShape({ colour: 'none', bar: 'none' }, accent.colour)}</g>`;
}

function storySvg(kind, tier, accent) {
  const font = 'Segoe UI, Helvetica Neue, Arial, sans-serif';
  const belt = tier === 'none' ? null : BELTS[tier];
  const spec = KINDS[kind];
  // Everything sits between y=120 and y=1680: outside the safe zone the
  // story chrome would cover it.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#06151f"/>
  <rect x="0" y="200" width="1080" height="24" fill="${accent.colour}"/>
  <text x="540" y="380" text-anchor="middle" font-family="${font}" font-size="44" font-weight="600"
        letter-spacing="10" fill="${accent.colour}">SEASON · ${accent.season.toUpperCase()}</text>
  ${belt ? `<g transform="translate(90 600) scale(7.5)">${beltShape(belt)}</g>` : motif(kind, accent)}
  <text x="540" y="1260" text-anchor="middle" font-family="${font}" font-size="${kind === 'week' ? 84 : 104}"
        font-weight="700" fill="#f2fbff">${spec.headline(belt ?? {})}</text>
  <text x="540" y="1350" text-anchor="middle" font-family="${font}" font-size="42"
        fill="#c8e6f0">${spec.line}</text>
  <text x="540" y="1580" text-anchor="middle" font-family="${font}" font-size="52" font-weight="700"
        fill="#f2fbff">AquaZeroFit</text>
  <text x="540" y="1640" text-anchor="middle" font-family="${font}" font-size="34"
        fill="#c8e6f0">aquazerofit.com</text>
</svg>`;
}

await mkdir(outDir, { recursive: true });
let total = 0;
let largest = 0;
for (const [kind, spec] of Object.entries(KINDS)) {
  for (const tier of spec.tiers) {
    for (const accent of ACCENTS) {
      const png = await sharp(Buffer.from(storySvg(kind, tier, accent)))
        .png({ palette: true, colours: 64, compressionLevel: 9 })
        .toBuffer();
      if (png.length > 400 * 1024) throw new Error(`${kind}-${tier}-${accent.id} is ${png.length} B, over 400 KB`);
      await writeFile(path.join(outDir, `${kind}-${tier}-${accent.id}.png`), png);
      total += 1;
      largest = Math.max(largest, png.length);
    }
  }
}
console.log(`share story art: ${total} files, largest ${largest} B, in ${path.relative(root, outDir)}`);
