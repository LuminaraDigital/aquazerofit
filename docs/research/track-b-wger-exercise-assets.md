# Track B Research Brief — wger Exercise Database & Content Assets

## Key Findings

1. **Dataset size (verified live against wger.de API, this turn):** 828 exercise bases, 3,286 translations, 360 images, 78 videos, 8 categories, 15 muscles, 12 equipment, 30 languages, 5 licenses.
2. **Everything is served from one public, auth-free REST API** (`https://wger.de/api/v2/`). The richest single endpoint is `/api/v2/exerciseinfo/` — one call per exercise returns category, muscles, equipment, all translations, images, videos, variation group, and full license metadata. This is the bulk-export path for AquaZeroFit; no self-hosted Django needed.
3. **Data model is normalized: `Exercise` (language-neutral base) ↔ `Translation` (name/description per language).** Name, description, aliases, notes live on the Translation; muscles/equipment/category/variations live on the Exercise base. Any importer must join these two levels.
4. **Licensing is per-object, not blanket.** Code = AGPL-3.0+ (irrelevant if AquaZeroFit only consumes data via API); exercise/ingredient data = Creative Commons, with **each exercise, translation, image, and video carrying its own `license` ID + `license_author` + optional derivative-source URLs**. The license fixture (`wger/core/fixtures/licenses.json`) defines exactly 5 licenses: pk1 CC-BY-SA 3, pk2 CC-BY-SA 4 (default for new submissions), pk3 CC0 1.0, pk4 CC-BY 4, pk5 ODbL (ingredients/OFF).
5. **ShareAlike (SA) is the dominant obligation.** Most content is CC-BY-SA 3/4: attribution + derived adaptations under same license. For read-only display of unmodified exercise text/images in AquaZeroFit, CC-BY-SA requires (a) author credit (`license_author`, e.g. "deusinvictus"), (b) license name + URI, (c) indication of changes. Translated/rewritten descriptions are adaptations → SA applies to those derived texts (your translations must be offered under the same CC-BY-SA).
6. **Language coverage is extremely uneven** (computed from all 3,286 translation records): en 827, es 645, de 627, fr 582 — then a cliff: it 138, pt 66, cs 51, nl 49, id/ar/el/zh 48 each, tr/hr 31, he 22, ru 10, and <5 for pl/sv/fa/eo/uk/az. 23 of 30 languages have effectively no data. English is the only complete corpus (827/828).
7. **Old media has weak attribution.** Sample images from the legacy corpus (e.g. `Crunches-1.png`) carry `license:1` (CC-BY-SA 3) but **empty `license_author`** — the historical author data was lost in migrations. The API exposes `author_history` lists on newer objects. This is a real compliance gap: CC-BY-SA technically requires the author name.
8. **Description quality varies.** Descriptions are crowdsourced, often one-liners (`<p>Two Handed Russian Style Kettlebell swing</p>`), stored as rendered HTML + `description_source` (plain text). No contraindication/safety fields exist — AquaZeroFit's safety layer must treat wger text as untrusted content.
9. **There is no bulk JSON dump of exercises.** Unlike ingredients (`sync-ingredients-bulk` downloads a dump), exercises only sync via API pagination. The `wger-project/data` repo ("Repository with the initial data", GPL-3.0, last pushed 2024-05) contains only `fixtures/ingredients.json.zip`, `ingredient_units`, `weight_units` — **no exercises**. There is also **no `exercise-images` repo anymore** (404); images live only in wger.de's media store. Historical separate repos were consolidated.
10. **Variations:** `variation_group` (UUID) groups exercise variants (e.g., all bench-press variants). 828 bases → roughly ~450 logical movements after grouping.

## Concrete Facts

**API root (verified):** `GET https://wger.de/api/v2/` → routes include `exercise`, `exerciseinfo`, `exercise-translation`, `exerciseimage`, `video`, `exercisecategory`, `muscle`, `equipment`, `exercisealias`, `exercisecomment`, `language`, `license`, `deletion-log`, `exercise-submission`, `ingredient`, `ingredientinfo`.

**Exercise base record** (`/api/v2/exercise/`): `id, uuid, created, last_update, category, muscles[], muscles_secondary[], equipment[], variation_group, license_author`.

**exerciseinfo record** (`/api/v2/exerciseinfo/{id}/`, serializer `ExerciseInfoSerializer`, `wger/exercises/api/serializers.py`): adds nested `category{name}`, `muscles[]{name,name_en,is_front,image_url_main,image_url_secondary}`, `images[]{uuid,image,thumbnails{small,medium},is_main,style,license,license_title,license_object_url,license_author,license_author_url,license_derivative_source_url,author_history,is_ai_generated}`, `videos[]{video,size,duration,width,height,codec,license*,author_history}`, `translations[]{id,uuid,name,description,description_source,language,aliases[],notes[],license,license_author,license_*,author_history}`, `variation_group`, `total_authors_history`, `last_update_global`.

**Pagination:** `?limit=&offset=` (default limit ~20; limit=200 confirmed working). Media URLs absolute: `https://wger.de/media/exercise-images/{exercise_pk}/...` with auto thumbnails `...200x200_q85.png`, `...400x400_q85.png`.

**License fixture** (`wger/core/fixtures/licenses.json`): pk1 CC-BY-SA 3 (creativecommons.org/licenses/by-sa/3.0/), pk2 CC-BY-SA 4 (default, `CC_BY_SA_4_LICENSE_ID` in `wger/utils/constants.py`), pk3 CC0, pk4 CC-BY 4, pk5 ODbL. Queryable at `/api/v2/license/`.

**Self-hosted bulk commands** (`python manage.py …`, docs: wger.readthedocs.io/en/latest/administration/commands.html): `sync-exercises` (pulls full exercise DB from wger.de via API incl. categories/equipment/muscles; deletes locally-removed remote entries; touches nothing local), `download-exercise-images`, `download-exercise-videos` (no overwrite), `load-fixtures`, `sync-ingredients-bulk` (dump-based). **Deletion tracking:** `/api/v2/deletion-log/` exposes `model_type, uuid, replaced_by, timestamp` so mirrors can purge deleted exercises — critical for long-lived imports.

## Integration Implications for AquaZeroFit

- **Recommended ingestion (no self-host):** nightly/paged crawl of `/api/v2/exerciseinfo/?limit=200` (~5 requests) → normalize into AquaZeroFit's document store (Cosmos/local JSON) with `wger_uuid` as stable key (IDs can be renumbered; UUIDs are the durable identifier). Then pull `/api/v2/exerciseimage/` and `/api/v2/video/` lists and mirror binaries to your own blob storage — hotlinking wger.de media is not acceptable for production.
- **Refresh strategy:** use `last_update_global` for incremental updates and `/api/v2/deletion-log/` for removals. The `deletion-log` + `replaced_by` fields map directly onto AquaZeroFit's versioned-document model.
- **i18n:** only ship en/es/de/fr from wger; AquaZeroFit's AI layer (P-03 training plan / P-08 assistant prompts) can translate on demand, but translated wger text becomes an adaptation → must carry CC-BY-SA attribution (see above). Chinese corpus (48 exercises) is too thin to matter.
- **Attribution implementation (mandatory):** persist per-exercise `license_author`, `license` (map ID→short_name via `/api/v2/license/`), and show "© {author}, {license}, via wger.de" in the exercise detail UI; keep an attribution page listing `total_authors_history`. For images with empty `license_author` (legacy corpus), attribute to "wger community contributors, CC-BY-SA 3.0" — best-effort compliance, and flag as a known risk.
- **Zod schema:** one schema per level (`WgerExerciseBase`, `WgerTranslation`, `WgerImage`, `WgerVideo`, `WgerLicense`) in `packages/shared`; strip/sanitize `description` HTML (untrusted crowdsourced markup → XSS surface in React/TMA).
- **AI safety invariant fits well:** wger data has no medical/safety fields, so AquaZeroFit's code-enforced safety layer remains authoritative; wger text is display content only, never fed as instruction to models without sanitization.
- **No AGPL contamination:** consuming the public API does not trigger AGPL (no code combined). If AquaZeroFit ever self-hosts wger server code (the alternative "run `sync-exercises`" path), AGPL-3.0 network-use clause applies to that deployment — keep it strictly as a separate, isolated ETL service if ever used.

## Risks / Open Questions

- **Empty `license_author` on legacy images/translations** — strict CC-BY-SA compliance impossible for those records; pragmatic best-effort attribution ("wger community") is the norm (wger's own apps do this), but it is a residual legal gray zone for a proprietary commercial app.
- **ShareAlike scope debate:** whether an AquaZeroFit workout plan *combining* CC-BY-SA exercises becomes an "adaptation" is legally unsettled; safest posture = attribution everywhere + license your *own* translations/annotations as CC-BY-SA.
- **Quality:** descriptions are short/inconsistent; images cover only ~360 image objects across 828 exercises (roughly <40% of exercises have imagery, many being the same legacy set); 78 videos total.
- **API rate limits / ToS:** undocumented; be polite (the project's own sync commands and the Apify scraper use ~600ms spacing). No formal SLA — a self-hosted mirror via `sync-exercises` is the fallback if wger.de throttles.
- **Exercise count drift:** count was 828 this turn (deleted duplicates are pruned server-side; IDs are not stable across deletions — always key on UUID + deletion-log).
- Unverified: exact per-license distribution of the 360 images / 78 videos (would require full crawl; sample showed license=1); video codec/hosting details for TMA playback.
