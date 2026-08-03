/**
 * Re-encode the captured product screenshots for the landing page.
 *
 *   node tools/screenshots/optimise.mjs
 *
 * Source of truth is docs/screenshots/*.png (captures of the running app at a
 * 390x844 viewport, 2x). This writes 1x and 2x WebP into apps/web/public so the
 * landing page can srcset between them — roughly a tenth of the PNG bytes.
 *
 * Run this whenever the screenshots are re-captured; the WebP files are
 * committed because the web build has no image pipeline of its own.
 *
 * Uses sharp, already a dependency of apps/api — nothing extra to install.
 */
import { createRequire } from 'node:module';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(root, 'docs/screenshots');
const OUT = path.join(root, 'apps/web/public/screenshots');

/** Capture file -> landing page asset name. Only these reach the web build. */
const SCREENS = {
  '03-dashboard.png': 'dashboard',
  '04-nutrition.png': 'nutrition',
  '05-capture-meal.png': 'capture-meal',
  '06-meal-plan.png': 'meal-plan',
  '07-coach.png': 'coach',
  '08-workouts.png': 'workouts',
  '09-progress.png': 'progress',
  '10-settings.png': 'settings',
};

await mkdir(OUT, { recursive: true });

let total = 0;
for (const [file, name] of Object.entries(SCREENS)) {
  for (const [suffix, width] of [
    ['', 390],
    ['@2x', 780],
  ]) {
    const out = path.join(OUT, `${name}${suffix}.webp`);
    await sharp(path.join(SRC, file))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toFile(out);
    const { size } = await stat(out);
    total += size;
    console.log(`${name}${suffix}.webp  ${Math.round(size / 1024)} KB`);
  }
}
console.log(`\ntotal ${Math.round(total / 1024)} KB`);
