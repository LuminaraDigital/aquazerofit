/**
 * Belt art: one SVG design → the two raster sets Fight Record needs.
 *
 *   node tools/belts/build-belt-art.mjs
 *
 * Writes, for each of the five belts:
 *
 *   apps/web/public/belts/<tier>.png     1080×1920 story art (Telegram stories)
 *   design/belts/emoji/<tier>.png        100×100 custom emoji (emoji status)
 *
 * Why static files rather than rendering per user: `shareToStory` takes a
 * public HTTPS URL that Telegram fetches itself, so the story image has to be
 * something the server can hand out to anyone. Making it identical for every
 * holder of a belt is what lets it be public at all: it carries a tier and the
 * wordmark, and nothing about the person sharing it (AZF-W3-05 §5.2). The
 * invite link travels in the story caption instead.
 *
 * The emoji set is the input to tools/belts/create-emoji-set.mjs. Telegram's
 * static custom emoji must be exactly 100×100, with transparency.
 *
 * Colours mirror BELT_COLOUR and rankBarColour in apps/web/src/lib/fightRecord.ts,
 * which is the source of truth; this script cannot import TypeScript, so a
 * colour change there means a change here and a re-run.
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// sharp is hoisted to the workspace root by npm (see tools/cards).
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const BELTS = [
  { tier: 'white', label: 'WHITE BELT', colour: '#f4f6f8', bar: '#16181d' },
  { tier: 'blue', label: 'BLUE BELT', colour: '#2f6fed', bar: '#16181d' },
  { tier: 'purple', label: 'PURPLE BELT', colour: '#7b4fd6', bar: '#16181d' },
  { tier: 'brown', label: 'BROWN BELT', colour: '#8a5a3b', bar: '#16181d' },
  { tier: 'black', label: 'BLACK BELT', colour: '#16181d', bar: '#d62828' },
];

/** The belt itself, in a 120×56 box, matching the web BeltBadge geometry. */
function beltShape({ colour, bar }, outline) {
  return `
    <g stroke="${outline}" stroke-width="2" stroke-linejoin="round">
      <rect x="4" y="16" width="112" height="16" rx="5" fill="${colour}"/>
      <rect x="88" y="18" width="14" height="12" fill="${bar}" stroke="none"/>
      <path d="M57 32 L46 52 L53 54 L61 32 Z" fill="${colour}"/>
      <path d="M63 32 L74 52 L67 54 L59 32 Z" fill="${colour}"/>
      <rect x="50" y="11" width="20" height="26" rx="5" fill="${colour}"/>
    </g>`;
}

function storySvg(belt) {
  const font = "Segoe UI, Helvetica Neue, Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#04141f"/>
      <stop offset="0.55" stop-color="#0a2a38"/>
      <stop offset="1" stop-color="#062018"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <text x="540" y="430" text-anchor="middle" font-family="${font}" font-size="44" font-weight="600"
        letter-spacing="10" fill="#8aebff">FIGHT RECORD</text>
  <g transform="translate(90 640) scale(7.5)">${beltShape(belt, 'rgba(242,251,255,0.6)')}</g>
  <text x="540" y="1280" text-anchor="middle" font-family="${font}" font-size="104" font-weight="700"
        fill="#f2fbff">${belt.label}</text>
  <text x="540" y="1370" text-anchor="middle" font-family="${font}" font-size="40"
        fill="rgba(200,230,240,0.8)">Earned by showing up</text>
  <text x="540" y="1760" text-anchor="middle" font-family="${font}" font-size="48" font-weight="600"
        fill="rgba(200,230,240,0.75)">AquaZeroFit</text>
</svg>`;
}

function emojiSvg(belt) {
  // Cropped to the knot rather than the whole belt: an emoji status renders at
  // about 20 px, where a full-width belt is a hairline. The knot, the tails and
  // a stub of band either side still read as a belt at that size. The outline
  // is dark so the white belt holds on Telegram's light themes.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="26 6 68 52"
       preserveAspectRatio="xMidYMid meet">${beltShape(belt, '#0b1d26')}</svg>`;
}

const storyDir = path.join(root, 'apps', 'web', 'public', 'belts');
const emojiDir = path.join(root, 'design', 'belts', 'emoji');
await mkdir(storyDir, { recursive: true });
await mkdir(emojiDir, { recursive: true });

for (const belt of BELTS) {
  const story = await sharp(Buffer.from(storySvg(belt))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(storyDir, `${belt.tier}.png`), story);
  const emoji = await sharp(Buffer.from(emojiSvg(belt))).resize(100, 100).png().toBuffer();
  await writeFile(path.join(emojiDir, `${belt.tier}.png`), emoji);
  console.log(`belts: ${belt.tier} → story ${story.length} B, emoji ${emoji.length} B`);
}
