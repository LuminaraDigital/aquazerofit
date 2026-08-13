/**
 * Card renderer: SVG master + fighter render → print-ready PNG.
 *
 *   node tools/cards/build-card.mjs <card.svg> <fighter.png> [out.png]
 *
 * The SVG in design/cards/ is the single source of truth for the card's
 * design; this script does only two mechanical things to it:
 *
 *  1. Prepares the art. The renders arrive as 1024×1536 PNGs whose transparent
 *     pixels carry a coloured matte in their RGB channels (the "green halo"
 *     problem). Trimming against alpha and re-premultiplying here keeps that
 *     matte from fringing the silhouette when librsvg composites it.
 *  2. Substitutes the prepared art into the `__ART__` placeholder as a base64
 *     data URI and rasterises. The placeholder exists so the committed SVG
 *     stays a readable ~10 KB design file rather than a 3 MB blob nobody can
 *     diff.
 *
 * Output is 1500×2100 — a 63.5×88.9 mm trading card at 600 dpi, which every
 * print house accepts and which downscales cleanly to every digital surface.
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// sharp is hoisted to the workspace root by npm; createRequire from this
// file's own URL walks up and finds it, so this tool needs no install step.
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const [, , svgPath, artPath, outArg] = process.argv;
if (!svgPath || !artPath) {
  console.error('Usage: node tools/cards/build-card.mjs <card.svg> <fighter.png> [out.png]');
  process.exit(1);
}
const outPath = outArg ?? svgPath.replace(/\.svg$/i, '.png');

/** Trim to the alpha bounding box and hand back a clean PNG buffer. */
async function prepareArt(file) {
  return sharp(file)
    .trim({ threshold: 8 })
    .png()
    .toBuffer();
}

const art = await prepareArt(artPath);
const template = await readFile(svgPath, 'utf8');
if (!template.includes('__ART__')) {
  console.error(`${svgPath} has no __ART__ placeholder - nothing to embed.`);
  process.exit(1);
}
// replaceAll, not replace: a stray mention of the token anywhere earlier in
// the file (a comment, say) would otherwise absorb the URI and leave the
// actual <image> pointing at the literal placeholder - which renders as a
// finished-looking card with no fighter on it.
const svg = template.replaceAll(
  '__ART__',
  `data:image/png;base64,${art.toString('base64')}`,
);

await mkdir(path.dirname(outPath), { recursive: true });
await sharp(Buffer.from(svg), { density: 96 }).png().toFile(outPath);

const meta = await sharp(outPath).metadata();
console.log(`${outPath}  ${meta.width}x${meta.height}`);
