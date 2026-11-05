/**
 * Coach art pipeline: source renders → the two sizes the app actually loads.
 *
 *   node tools/coaches/build-art.mjs <source-dir>
 *
 * For each coach in the roster it looks for a source file named after the
 * character (any of several spellings — the renders arrive with accents and
 * spaces in their names) and emits:
 *
 *   apps/web/public/coaches/<id>/portrait.webp   full body, character select
 *   apps/web/public/coaches/<id>/avatar.webp     square head crop, chat + card
 *
 * Why a build step rather than committing the renders as-is: the source files
 * are ~1024×1536 PNGs of 1–2 MB each. Nine of those on the character-select
 * grid is ~15 MB of portrait art on a screen most users open on mobile data,
 * for images displayed at 160 px tall. The avatar is worse — a 1.5 MB download
 * to fill a 44 px circle, on the dashboard, on every load.
 *
 * The head crop is geometric, not detected: these are full-body standing
 * renders on white, so the head is reliably in the top ~22% and horizontally
 * centred. A face-detection dependency would buy accuracy this framing does
 * not need. Sources that break that assumption should be cropped by hand and
 * dropped straight into the output directory — the app reads files, not this
 * script.
 *
 * Uses sharp, already a dependency of apps/api. Missing sources are skipped
 * with a warning rather than failing the run: the roster ships before the art
 * does, and `CoachAvatar` falls back to a monogram for whatever is absent.
 */
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_ROOT = path.join(root, 'apps/web/public/coaches');

/**
 * Coach id → the names their source renders turn up under. Kept here rather
 * than derived from the roster because the mapping is between *filenames a
 * human chose* and ids, which no amount of code can infer.
 */
const SOURCES = {
  akin: ['Akin Nguyen Celsus', 'Akin Celsus', 'Akin_Official_color', 'Akin_Official', 'akin'],
  ogun: ['Ogun Celsus', 'ogun'],
  anderson: ['Anderson Pike', 'Anderson Couture', 'anderson'],
  jacare: ['Tiago Arruda', 'Jacaré Aldo', 'Jacare Aldo', 'jacare'],
  king: ['King Yamsiri', 'king'],
  kazushi: ['Shūhei Horiuchi', 'Kazushi Horiuchi', 'kazushi'],
  uthman: ['Uthman Sadykov', 'Uthman Nurmakhmedov', 'uthman'],
  sanzo: ['Sanzō', 'Sanzo', 'sanzo'],
  mataemon: ['Mataemon Kuroda', 'Mataemon Aoki', 'mataemon'],
  carlos: ['Carlos Mendez', 'Carlos_Mendez', 'carlos'],
  craig: ['Craig Beast', 'Craig_Beast', 'craig'],
  danial: ['Danial Kessler', 'Danial Nickal', 'Danial_Nickal', 'Daniel_Nickal', 'danial'],
  dmitry: ['Dmitry Volkov', 'Dmitry_Volkov', 'dmitry'],
  fabio: ['Fabio Guedes', 'Fabio_Guedes', 'fabio'],
  frank: ['Frank Mason', 'Frank_Mason', 'frank'],
  gaius: ['Gaius Marcus', 'Gaius_Marcus', 'gaius'],
  george: ['Étienne Delorme', 'George Saint', 'George_Saint', 'george'],
  kwon: ['Kwon Won-Ri', 'Kwon_Won_Ri', 'kwon'],
  mike: ['Mike Takayama', 'Mike_Takayama', 'mike'],
  paul: ['Paul Thomas', 'Paul_Thomas', 'paul'],
  randall: ['Randall Stevens', 'Randall_Stevens', 'randall'],
  reinier: ['Reinier Jansen', 'Reinier_Jansen', 'reinier'],
  rolando: ['Rolando Fitch', 'Rolando_Fitch', 'rolando'],
  ryoto: ['Ryūsei Katou', 'Ryoto Katou', 'Ry_to_Katou', 'Ryoto_Katou', 'ryoto'],
  sergio: ['Sergio Newton', 'Sergio_Newton', 'sergio'],
  terry: ['Terry Bauer', 'Terry Crawford', 'Terry_Crawford', 'terry'],
  usman: ['Murad Alibekov', 'Usman Sergei Magomedov', 'Usman_Sergei_Magomedov', 'usman'],
  zhang: ['Zhang Kai', 'Zhang_Kai', 'zhang'],
};

/**
 * Alternate illustrations of a fighter. Same character, same statistics, second
 * piece of art.
 *
 * Kept as a separate map rather than a second entry in SOURCES because a
 * variant is not a fallback: if the standard render is missing, the variant
 * must NOT quietly take its place. In a collectible line the base printing and
 * the alternate printing are different objects, and silently promoting one to
 * the other is the kind of bug that is invisible in code and expensive in a
 * marketplace.
 */
const VARIANTS = {
  ogun: 'Ogun in Dobok wear',
  akin: 'Akin_Muay_Thai_Gear',
};

const PORTRAIT_HEIGHT = 900;
const PORTRAIT_WIDTH = 600;
/** Space above the head and under the feet in the upright renders. */
const HEAD_GAP = 26;
const FLOOR_GAP = 72;
const AVATAR_SIZE = 256;

/**
 * Default head framing, as fractions of the *trimmed* figure: a square band
 * `band` tall starting `top` down from the crown, horizontally centred on
 * `focusX`.
 *
 * Trimming first is what makes a single default work at all — the renders
 * carry wildly different amounts of white margin, so any fraction measured
 * from the raw canvas edge lands somewhere different on every file.
 */
const DEFAULT_FRAME = { top: 0, band: 0.26, focusX: 0.5 };

/**
 * Per-coach overrides for poses the default misreads. Every entry here is a
 * pose where something is above or beside the head — a raised fist, a guard —
 * so the top band catches the wrong anatomy. Cheaper and more predictable than
 * adding face detection for nine known images.
 */
const FRAMES = {
  // Victory pose: the raised arm sits well above the crown.
  sanzo: { top: 0.1, band: 0.22, focusX: 0.46 },
  // Fighting stance with gloves up beside the jaw.
  king: { top: 0.02, band: 0.24, focusX: 0.5 },
  // Three-quarter turn: the figure stands left of centre, the head does not.
  mataemon: { top: 0.01, band: 0.24, focusX: 0.58 },
};

const sourceDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'Downloads');

function normalizeName(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Case-, accent-, and delimiter-insensitive lookup over recursive source directory files. */
function findSource(files, candidates) {
  const normCandidates = candidates.map(normalizeName);
  for (const file of files) {
    const base = path.parse(file).name;
    const normBase = normalizeName(base);
    if (normCandidates.some(c => normBase === c || normBase.startsWith(c + ' ') || normBase.endsWith(' ' + c))) {
      return file;
    }
  }
  return null;
}

/**
 * Strip contiguous solid white or black studio backdrops to transparent alpha
 * with soft edge de-fringing, while preserving already-transparent inputs.
 */
async function stripBackdropToAlpha(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const buf = Buffer.from(data);

  // If corners are already transparent, keep existing alpha channel.
  const cornerIdx = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  const transparentCorners = cornerIdx.filter((idx) => buf[idx + 3] < 16).length;
  if (transparentCorners >= 2) {
    return sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }

  const isBlack = buf[0] < 30 && buf[1] < 30 && buf[2] < 30;
  const bg = isBlack ? [0, 0, 0] : [255, 255, 255];
  const tolHard = 22;
  const tolSoft = 52;

  const distFromBg = (idx) =>
    Math.max(
      Math.abs(buf[idx] - bg[0]),
      Math.abs(buf[idx + 1] - bg[1]),
      Math.abs(buf[idx + 2] - bg[2]),
    );

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const trySeed = (x, y) => {
    const p = y * w + x;
    if (visited[p]) return;
    if (distFromBg(p * 4) <= tolHard) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) trySeed(x - 1, y);
    if (x + 1 < w) trySeed(x + 1, y);
    if (y > 0) trySeed(x, y - 1);
    if (y + 1 < h) trySeed(x, y + 1);
  }

  // Clear contiguous background and softly feather/de-fringe 1-2px boundary pixels.
  for (let p = 0; p < w * h; p++) {
    if (visited[p]) {
      const idx = p * 4;
      buf[idx] = 0;
      buf[idx + 1] = 0;
      buf[idx + 2] = 0;
      buf[idx + 3] = 0;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (visited[p]) continue;
      const touchesBg =
        (x > 0 && visited[p - 1]) ||
        (x + 1 < w && visited[p + 1]) ||
        (y > 0 && visited[p - w]) ||
        (y + 1 < h && visited[p + w]);
      if (!touchesBg) continue;
      const idx = p * 4;
      const d = distFromBg(idx);
      if (d < tolSoft) {
        const alpha = Math.max(0, Math.min(1, (d - tolHard * 0.5) / (tolSoft - tolHard * 0.5)));
        buf[idx + 3] = Math.round(alpha * 255);
        if (alpha > 0.05 && alpha < 0.98) {
          for (let c = 0; c < 3; c++) {
            const unpremult = (buf[idx + c] - (1 - alpha) * bg[c]) / alpha;
            buf[idx + c] = Math.max(0, Math.min(255, Math.round(unpremult)));
          }
        }
      }
    }
  }

  return sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function buildCoach(id, files) {
  const file = findSource(files, SOURCES[id]);
  if (!file) {
    console.warn(`  ${id.padEnd(9)} no source found — the app will show a monogram`);
    return false;
  }

  const outDir = path.join(OUT_ROOT, id);
  await mkdir(outDir, { recursive: true });
  const input = path.join(sourceDir, file);

  // Strip any solid backdrop to transparent alpha, then trim transparent margins
  // so every fraction below is measured from the figure's own bounding box.
  const transparentPng = await stripBackdropToAlpha(input);
  const trimmed = await sharp(transparentPng)
    .trim({ threshold: 12 })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;

  // A wide stance fitted to full height would fill the select tile edge to
  // edge and dwarf every upright figure, so it is fitted inside the same 2:3
  // frame instead, with the headroom and floor gap the upright renders carry.
  // Upright figures are unchanged.
  const wide = width / height > PORTRAIT_WIDTH / PORTRAIT_HEIGHT;
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const portrait = wide
    ? sharp(trimmed.data)
        .resize({ width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT - HEAD_GAP - FLOOR_GAP, fit: 'contain', position: 'bottom', background: clear })
        .extend({ top: HEAD_GAP, bottom: FLOOR_GAP, background: clear })
    : sharp(trimmed.data).resize({ height: PORTRAIT_HEIGHT, fit: 'inside', withoutEnlargement: true });
  await portrait.webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(outDir, 'portrait.webp'));

  // Square head crop. Every value is clamped into the image: a squarer source
  // or an aggressive override must produce a worse crop, never a sharp error
  // that fails the whole run.
  const frame = { ...DEFAULT_FRAME, ...(FRAMES[id] ?? {}) };
  const side = Math.min(Math.round(height * frame.band), width, height);
  const top = Math.min(Math.max(0, Math.round(height * frame.top)), height - side);
  const left = Math.min(
    Math.max(0, Math.round(width * frame.focusX - side / 2)),
    width - side,
  );

  await sharp(trimmed.data)
    .extract({ left, top, width: side, height: side })
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .webp({ quality: 86, alphaQuality: 90 })
    .toFile(path.join(outDir, 'avatar.webp'));

  const variant = await buildVariant(id, files, outDir);
  console.log(`  ${id.padEnd(9)} ${file}${variant ? `  + variant` : ''}`);
  return true;
}

/**
 * Alternate art, rendered at portrait size only. No avatar crop: a variant is a
 * card illustration and a collectible, not a chat avatar, and cropping one to a
 * 44 px circle throws away the only thing that makes it worth owning.
 */
async function buildVariant(id, files, outDir) {
  const name = VARIANTS[id];
  if (!name) return false;
  const file = findSource(files, [name]);
  if (!file) return false;

  const transparentPng = await stripBackdropToAlpha(path.join(sourceDir, file));
  const trimmed = await sharp(transparentPng)
    .trim({ threshold: 12 })
    .toBuffer({ resolveWithObject: true });

  await sharp(trimmed.data)
    .resize({ height: PORTRAIT_HEIGHT, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(path.join(outDir, 'variant.webp'));

  return true;
}

async function main() {
  let files;
  try {
    files = await readdir(sourceDir, { recursive: true });
  } catch {
    console.error(`Source directory not readable: ${sourceDir}`);
    process.exit(1);
  }

  console.log(`Building coach art from ${sourceDir}`);
  await mkdir(OUT_ROOT, { recursive: true });

  let built = 0;
  for (const id of Object.keys(SOURCES)) {
    if (await buildCoach(id, files)) built += 1;
  }

  // A note beside the output so the next person to open the directory knows
  // it is generated and where from.
  await writeFile(
    path.join(OUT_ROOT, 'README.md'),
    [
      '# Coach art (generated)',
      '',
      'Built by `node tools/coaches/build-art.mjs <source-dir>` from the character',
      'renders. Do not hand-edit: re-run the script instead.',
      '',
      'Each coach directory may also contain `celebrate.webp` and `encourage.webp`',
      'expression variants. Those are optional and are dropped in by hand — the',
      'app falls back to `avatar.webp` for any that are missing, and to a tinted',
      'monogram when even that is absent.',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`\n${built}/${Object.keys(SOURCES).length} coaches have art.`);
}

await main();
