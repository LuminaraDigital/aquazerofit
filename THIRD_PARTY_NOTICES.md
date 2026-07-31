# Third-Party Notices

AquaZeroFit uses the following open-source software and licensed content. Full licence texts ship with each package under `node_modules/`. Content attribution obligations are recorded in `content/ATTRIBUTION.md` and in AQF-12 (Upstream Integration and Licensing Register).

## Runtime dependencies

| Package | Licence | Use |
| --- | --- | --- |
| react, react-dom | MIT | UI framework |
| react-router-dom | MIT | Routing |
| @tanstack/react-query | MIT | Server-state caching |
| express | MIT | HTTP server |
| cors | MIT | CORS middleware |
| zod | MIT | Validation schemas |
| jsonwebtoken | MIT | Access/refresh token signing |
| bcryptjs | MIT | Password hashing |
| multer | MIT | Multipart photo upload |

## Development dependencies

| Package | Licence | Use |
| --- | --- | --- |
| typescript | Apache-2.0 | Type system |
| vite, @vitejs/plugin-react | MIT | Build tooling |
| tailwindcss, postcss, autoprefixer | MIT | Styling |
| tsx | MIT | TypeScript execution |
| vitest | MIT | Test runner |
| supertest | MIT | HTTP integration testing |

## Fonts and iconography

| Asset | Licence | Source |
| --- | --- | --- |
| Barlow Condensed | SIL OFL 1.1 | Google Fonts |
| DM Sans | SIL OFL 1.1 | Google Fonts |
| Material Symbols Outlined | Apache-2.0 | Google Fonts |

## Platform scripts

| Asset | Terms | Use |
| --- | --- | --- |
| telegram-web-app.js | Telegram Mini Apps terms | Mini App bridge, loaded from telegram.org |

## Content corpora

Seeded exercise records carry `licence`, `licenceAuthor` and `sourceId` fields which are never stripped (AQF-06 §3.3). See `content/ATTRIBUTION.md`.

## Licensed datasets

The following third-party datasets are imported as **data only** via the server-side ETL mirror (`wger-integration-plan.md` §3, ADR-013). No upstream source code is vendored, linked, or shipped.

| Dataset | Licence | Source | Use |
| --- | --- | --- | --- |
| wger exercise dataset (exercises, translations, images, videos) | Creative Commons **per record** (CC-BY-SA 3.0 / CC-BY-SA 4.0 / CC-BY 4.0 / CC0; see each record's `licence` / `licenceAuthor` fields) | <https://wger.de> — wger community contributors | Exercise library corpus imported into the `content` container; per-record attribution rendered in-app (`content/ATTRIBUTION.md`) |
| wger application code | AGPL-3.0-or-later | <https://github.com/wger-project/wger> | **NOT USED — excluded by policy (ADR-013).** Only data and domain-model ideas are adopted; clean-room reimplementation of ideas is lawful (ideas are not copyrighted) |
| Open Food Facts ingredient data | Database: ODbL 1.0; contents: Database Contents License (DbCL); product images: CC-BY-SA 3.0 | <https://world.openfoodfacts.org> — © Open Food Facts contributors | Ingredient/macronutrient data, held in the **segregated `foodsOff` container** — never commingled with proprietary records (ODbL §4.5a collective-database posture). Per-product attribution "© Open Food Facts contributors" with a link to the OFF product page |
| USDA FoodData Central (reserved) | CC0 1.0 (public domain dedication) | <https://fdc.nal.usda.gov> | Reserved for a lab-grade whole-food layer (`foodsFdc` container); no share-alike exposure. Not yet ingested |

### Licence policy verification

- **No AGPL/GPL code in runtime dependencies.** Every runtime dependency above is MIT; development dependencies are MIT or Apache-2.0; fonts are SIL OFL 1.1 or Apache-2.0. The dependency-licence allowlist (MIT / Apache-2.0 / BSD / ISC) is re-verified as part of every release gate (AQF-12).
- **Zero wger source code in the repository.** wger is AGPL-3.0-or-later (network copyleft); vendoring or linking any of it is prohibited (ADR-013, AQF-12). Integration is strictly a data import over the public REST API plus independent reimplementation of documented design patterns.
- **Attribution fields are never stripped.** `licence`, `licenceAuthor` and `sourceId` are imported per record and preserved through every pipeline (AQF-06 §3.3); removals constitute a release-blocking defect.
