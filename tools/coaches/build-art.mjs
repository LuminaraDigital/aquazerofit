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
  anderson: ['Anderson Couture', 'anderson'],
  jacare: ['Jacaré Aldo', 'Jacare Aldo', 'jacare'],
  king: ['King Yamsiri', 'king'],
  kazushi: ['Kazushi Horiuchi', 'kazushi'],
  uthman: ['Uthman Nurmakhmedov', 'uthman'],
  sanzo: ['Sanzō', 'Sanzo', 'sanzo'],
  mataemon: ['Mataemon Aoki', 'mataemon'],
  carlos: ['Carlos Mendez', 'Carlos_Mendez', 'carlos'],
  craig: ['Craig Beast', 'Craig_Beast', 'craig'],
  danial: ['Danial Nickal', 'Danial_Nickal', 'Daniel_Nickal', 'danial'],
  dmitry: ['Dmitry Volkov', 'Dmitry_Volkov', 'dmitry'],
  fabio: ['Fabio Guedes', 'Fabio_Guedes', 'fabio'],
  frank: ['Frank Mason', 'Frank_Mason', 'frank'],
  gaius: ['Gaius Marcus', 'Gaius_Marcus', 'gaius'],
  george: ['George Saint', 'George_Saint', 'george'],
  kwon: ['Kwon Won-Ri', 'Kwon_Won_Ri', 'kwon'],
  mike: ['Mike Takayama', 'Mike_Takayama', 'mike'],
  paul: ['Paul Thomas', 'Paul_Thomas', 'paul'],
  randall: ['Randall Stevens', 'Randall_Stevens', 'randall'],
  reinier: ['Reinier Jansen', 'Reinier_Jansen', 'reinier'],
  rolando: ['Rolando Fitch', 'Rolando_Fitch', 'rolando'],
  ryoto: ['Ryoto Katou', 'Ry_to_Katou', 'Ryoto_Katou', 'ryoto'],
  sergio: ['Sergio Newton', 'Sergio_Newton', 'sergio'],
  terry: ['Terry Crawford', 'Terry_Crawford', 'terry'],
  usman: ['Usman Sergei Magomedov', 'Usman_Sergei_Magomedov', 'usman'],
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

async function buildCoach(id, files) {
  const file = findSource(files, SOURCES[id]);
  if (!file) {
    console.warn(`  ${id.padEnd(9)} no source found — the app will show a monogram`);
    return false;
  }

  const outDir = path.join(OUT_ROOT, id);
  await mkdir(outDir, { recursive: true });
  const input = path.join(sourceDir, file);

  // Trim the white margin once and work from the figure's own bounding box.
  // `flatten` first because several renders are PNGs with transparency, and
  // sharp trims against the top-left pixel — transparent there means it trims
  // nothing at all and every fraction below silently mismeasures.
  const trimmed = await sharp(input)
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;

  await sharp(trimmed.data)
    .resize({ height: PORTRAIT_HEIGHT, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(outDir, 'portrait.webp'));

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
    .webp({ quality: 86 })
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

  const trimmed = await sharp(path.join(sourceDir, file))
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 })
    .toBuffer({ resolveWithObject: true });

  await sharp(trimmed.data)
    .resize({ height: PORTRAIT_HEIGHT, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
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
