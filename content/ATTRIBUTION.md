# Content Attribution

Obligations recorded per AQF-12 (Upstream Integration and Licensing Register) and its addendum AQF-12A (wger Integration Addendum). This file is the human-facing attribution record; per-record attribution is stored on the data records themselves (`licence`, `licenceAuthor`, `sourceId`) and rendered in-app.

## Exercise corpus — wger community data

The AquaZeroFit exercise library is built on data contributed by the
**wger.de community**:

> **Exercise data and media © wger.de community contributors, licensed under
> Creative Commons per record (CC-BY-SA 3.0 / CC-BY-SA 4.0 / CC-BY 4.0 / CC0).
> Source: <https://wger.de>**

Licensing is per record, not blanket (wger-integration-plan.md §2.2). Every
imported exercise, translation, image and video carries its own `licence` /
`licenceAuthor` values, imported verbatim by the ETL and **never stripped** by
any pipeline (AQF-06 §3.3). Per-record authors are preserved in-app: the
exercise detail sheet shows "© {author}, {licence}, via wger.de" for each
record and its media, and this page (`content/ATTRIBUTION.md`, linked from the
in-app attribution page) holds the collective notice.

### Legacy records with empty author

Some legacy wger media records ship with an empty `license_author` field
(verified against the live wger API; plan §2.2, §5). These are attributed to
**"wger community contributors, CC-BY-SA 3.0"** — the same best-effort
attribution wger's own apps use. This is a documented gray zone: the per-record
licence id is preserved exactly, and only the author name falls back to the
community form. Any future upstream correction (via the wger deletion-log /
incremental sync) updates the record.

### AI adaptations — share-alike

AI translations or rewrites of wger descriptions (e.g. into languages wger does
not cover) are **adaptations of CC-BY-SA material** and are therefore licensed
**CC-BY-SA** themselves (share-alike), with attribution preserved into the
adapted text (wger-integration-plan.md §5; research/track-e §"Risks").
This is flagged in the prompt pipeline: generated plan or library content that
references wger-sourced exercises must retain attribution. AI output can never
re-license the underlying data.

### In-app attribution placement spec

| Surface | Placement |
| --- | --- |
| Exercise detail sheet | Per-record line under the description and beneath each media item: "© {author}, {licence}, via wger.de" |
| Exercise library | Attribution link in the library footer/header overflow menu |
| Attribution page (in-app) | Collective wger notice, OFF notice (below), and a link to this file |
| AI-generated plan text | Attribution must survive for any exercise named from the wger corpus (eval fixture: attribution preservation) |

## Food composition data — Open Food Facts

Ingredient data (names, macros per 100 g, barcodes, nutriscore, vegan /
vegetarian flags, serving units) derives from **Open Food Facts**:

> **© Open Food Facts contributors. Database available under the Open Database
> License (ODbL 1.0); individual contents under the Database Contents License
> (DbCL). Source: <https://world.openfoodfacts.org>**

Obligations honored (research/track-c §6; plan §5):

- **Per-product attribution and link**: each product shown in-app is credited
  "© Open Food Facts contributors" with a link back to its OFF product page.
- **Collective-database segregation (ODbL §4.5a)**: OFF data lives in its own
  segregated container (`foodsOff`) and is **never commingled** with
  proprietary AquaZeroFit records, so no share-alike duty attaches to the whole
  database.
- **No paywalling / DRM of the OFF-derived dataset itself** (ODbL §4.4/§4.6):
  the derived data is not restricted beyond ODbL's own terms; internal-only
  adaptations used in calculations are exempt under §4.5c.
- **Allergen data is best-effort, crowdsourced** (OFF `allergens_tags` /
  `traces_tags`, ingested directly from OFF — wger discards these fields). It
  is displayed with a best-effort disclaimer and never overrides the
  deterministic curated allergen filter.

A lab-grade whole-food layer from **USDA FoodData Central (CC0)** is reserved
(`foodsFdc` container); if ingested, no attribution duty applies, though
"Data courtesy of USDA FoodData Central" may be shown voluntarily.

## Seeded exercise entries (pre-wger)

Original seeded exercise entries were modelled on openly licensed community
exercise data (CC-BY-SA 4.0 style attribution). Where a wger import reconciles
and replaces a seed, the wger record's licence and author fields take
precedence and are preserved as above. Demonstration media ships as placeholder
artwork generated for this project until self-recorded media is produced.

## Recipes

Seeded recipes are original works created for AquaZeroFit and are licensed as
part of the project.
