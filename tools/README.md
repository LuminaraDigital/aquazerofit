# tools/

Four generators. None of them run in CI and none are needed to build or test
the application — they exist to turn source material (character renders, card
masters, screen captures, Markdown) into the committed artefacts the app and
the document set consume.

Everything these scripts produce is committed. That is deliberate: neither the
web build nor the Gradle build has an image pipeline, and the marked
specification set is submitted as `.docx`. You run a tool when the *source*
changes, then commit the result.

Root-level npm scripts exist for each, so they are discoverable from
`npm run`:

| Script | Tool |
| --- | --- |
| `npm run assets:coaches -- <source-dir>` | `tools/coaches/build-art.mjs` |
| `npm run assets:cards -- <card.svg> <fighter.png> [out.png]` | `tools/cards/build-card.mjs` |
| `npm run screenshots:optimise` | `tools/screenshots/optimise.mjs` |
| `npm run docs:setup` then `npm run docs:build -- <in.md> <out.docx>` | `tools/docgen/md-to-docx.js` |

The `--` matters: it passes the arguments through npm to the script rather
than letting npm consume them.

---

## `tools/coaches/` — coach art

```bash
node tools/coaches/build-art.mjs <source-dir>
```

Reads the character renders out of `<source-dir>` and writes, for each of the
nine coaches in the roster:

```
apps/web/public/coaches/<id>/portrait.webp   full body, 900 px tall, character select
apps/web/public/coaches/<id>/avatar.webp     256 px square head crop, chat and cards
apps/web/public/coaches/<id>/variant.webp    alternate art, portrait size (akin, ogun only)
```

It also drops a generated `README.md` at the output root marking the directory
as build output.

The source directory argument is optional and defaults to the current user's
`Downloads` folder, which is where the renders usually land. Filenames are
matched case- and extension-insensitively against a per-coach list of known
spellings, because the renders arrive with accents and spaces in their names.

**A missing source is a warning, not a failure.** The roster ships before the
art does, and `CoachAvatar` degrades expression → avatar → tinted monogram, so
the app is fully usable with no art present.

The head crop is geometric rather than face-detected: the renders are full-body
standing figures on white, so the head sits reliably in the top fraction of the
trimmed bounding box. Three coaches whose poses defeat that assumption (a
raised arm, gloves up beside the jaw, a three-quarter turn) have hand-tuned
framing overrides in the script. A source that breaks the assumption in a new
way should be cropped by hand and dropped straight into the output directory —
the app reads files, not this script.

Optional `celebrate.webp` and `encourage.webp` expression variants are added by
hand and are not produced here.

> **Note:** the script writes to `apps/web/public/coaches/` only. The matching
> files under `apps/android/app/src/main/assets/coaches/` are committed copies
> of the same output, and the generated `README.md` was copied across with
> them. If you regenerate the art you must mirror the result into the Android
> assets directory yourself.

**When you need it:** a coach render is added, replaced or re-cropped.

## `tools/cards/` — Heavens card renderer

```bash
node tools/cards/build-card.mjs <card.svg> <fighter.png> [out.png]
```

Renders one card. The SVG master in `design/cards/<fighter>/card.svg` is the
single source of truth for the design; the script does two mechanical things to
it:

1. Trims the fighter render to its alpha bounding box and re-premultiplies, so
   the coloured matte carried in the transparent pixels' RGB channels does not
   fringe the silhouette when the SVG is rasterised.
2. Substitutes the prepared art into the SVG's `__ART__` placeholder as a
   base64 data URI, then rasterises.

The placeholder is what keeps the committed SVG a readable ~10 KB design file
instead of a multi-megabyte blob nobody can diff. A master without an `__ART__`
token is rejected rather than silently rendered as a finished-looking card with
no fighter on it.

Output is a **PNG** at 1500x2100 — a 63.5 x 88.9 mm trading card at 600 dpi,
which every print house accepts and which downscales cleanly. `out.png`
defaults to the SVG's own path with the extension swapped. The script does not
produce WebP; the `_web.webp` files in `design/cards/` are derived separately.

Both arguments are required and it renders one card per invocation — there is
no glob over `design/cards/`.

**When you need it:** a card master or a fighter render changes.

## `tools/screenshots/` — landing page images

```bash
node tools/screenshots/optimise.mjs
```

Takes no arguments. Re-encodes a fixed set of eight captures from
`docs/screenshots/*.png` (captures of the running app at a 390x844 viewport at
2x) into `apps/web/public/screenshots/`, writing a 1x and a 2x WebP for each so
the landing page can `srcset` between them. Roughly a tenth of the PNG bytes.

The mapping from capture filename to asset name is a table at the top of the
script; only files listed there reach the web build. Adding a screenshot to the
landing page means adding a row.

**When you need it:** the product screenshots are re-captured.

## `tools/docgen/` — Markdown to `.docx`

Renders the tracked `docs/specs/AQF-*.docx` set from Markdown sources.

**This package is deliberately outside the npm workspaces** so its `docx`
dependency never enters the deployed application's dependency tree. Dependabot
watches it on its own monthly schedule (`.github/dependabot.yml`). Do not add it
to `workspaces` in the root `package.json`. The consequence is that it needs
its own install before first use:

```bash
npm --prefix tools/docgen install          # or: npm run docs:setup
node tools/docgen/md-to-docx.js <input.md> <output.docx> ["Running header"]
```

The renderer supports an optional front-matter cover page (brand mark,
wordmark, title block, details table), `#`/`##`/`###` headings, pipe tables,
fenced code blocks, bullets, `- [ ]` checklists, numbered lists, inline
`**bold**` / `*italic*` / `` `code` ``, `>` callout boxes and figures.

Figures use ordinary `![Caption](path)` syntax. Two or three on one line are
laid out side by side in a borderless table, which is the only way tall phone
screenshots fit on a page at a readable size. Captions are numbered
automatically and pixel dimensions are read from the file, so re-capturing a
screenshot at a different resolution keeps its aspect ratio and inserting a
figure does not mean renumbering the ones after it.

**House rule, enforced by the build:** no em dashes or en dashes outside fenced
code blocks. Word autocorrect and pasted text reintroduce them constantly and
they are banned in this document set, so the renderer fails with line numbers
rather than let one reach a submitted file. Code fences are exempt, because a
document quoting source must quote it verbatim.

Page numbers are fields filled by Word on *Update Field*, not guessed at build
time.

Two companions:

- `create-wger-plan-docx.js <output.docx>` — a one-off renderer for the wger
  integration plan with its own Times New Roman styling. It derives its input
  by swapping the output path's extension to `.md`, so the two must sit side by
  side.
- `finalise-docs.sh` — copies freshly rendered documents from
  `docs/specs/build/` over the tracked copies in `docs/specs/`. Word holds a
  lock on any open `.docx`, so the script reports `LOCKED` for those and
  carries on rather than failing the batch. Close the document and re-run.

**When you need it:** a specification's Markdown source changes and the `.docx`
has to be regenerated. Note that most of the `AQF-*.docx` set has no Markdown
source in the repository — those documents are maintained directly in Word and
this renderer does not touch them.
