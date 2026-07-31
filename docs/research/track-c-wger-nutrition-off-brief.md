# Track C — wger Nutrition & Open Food Facts: Integration Options Brief
(Research date: 2026-01; wger master branch + wger.de live API verified)

## Key Findings
- wger's ingredient DB is essentially an Open Food Facts (OFF) derivative: **3,063,298 ingredients** live on wger.de (verified `GET /api/v2/ingredient/?limit=1` → `"count":3063298`), virtually all with `source_name="Open Food Facts"`. OFF itself has **4,649,885 products** (verified via OFF search API).
- Data flow is 3-tier: OFF full JSONL dump → wger.de central import (`import-off-products`) → downstream/self-hosted instances sync **from wger.de, not from OFF** (`sync-ingredients-bulk`, gzipped JSONL dump; fallback `/api/v2/ingredient-sync`).
- Barcode flow: `Ingredient.code` stores the barcode (db_indexed). App scans → lookup by `code`; cache-miss → `Ingredient.fetch_ingredient_from_off(code)` calls OFF live and persists locally (wger/nutrition/models/ingredient.py).
- Macro math is pure deterministic multiplication per 100 g — fully aligned with AquaZeroFit's "code calculates, models only interpret" invariant.
- OFF licensing is the load-bearing constraint: DB = ODbL 1.0 (attribution + share-alike), contents = DbCL, images = CC-BY-SA 3.0. wger's own curated data adds CC-BY-SA 3.0; wger code = AGPL-3.0+.

## Concrete Facts
### Ingredient model (wger/nutrition/models/ingredient.py)
- `Ingredient(AbstractLicenseModel)`: `uuid`, `name`, `energy` (kcal/100g, int), `protein/carbohydrates/carbohydrates_sugar/fat/fat_saturated/fiber/sodium` (g/100g, Decimal 6.3), `code` (barcode), `remote_id`, `source_name`, `source_url`, `brand`, `category` (FK IngredientCategory), `is_vegan`, `is_vegetarian` (from OFF `ingredients_analysis_tags`), `nutriscore` (a–e), `last_update`, `last_imported`. **No allergen fields** — OFF `allergens_tags` are dropped by `extract_info_from_off`.
- `IngredientWeightUnit`: serving units, `name` + `gram` (e.g. "1 Portion (2 biscuits)" = 25 g), auto-imported from OFF serving sizes; 1 g/ml fallback for volume units.
- `IngredientImage`: CC-BY-SA 3.0 with `license_author` = OFF uploader name.
### Plan/diary model
- `NutritionPlan` (UUIDv7 PK): `user`, `start`, `end`, `description`, `only_logging`, `goal_energy/goal_protein/goal_carbohydrates/goal_fiber/goal_fat`, `has_goal_calories`.
- `Meal` (UUID PK): `plan` FK, `order`, `time`, `name` (≤25 chars).
- `MealItem` / `LogItem` (diary): share `BaseMealItem` — `ingredient` FK, `weight_unit` FK (nullable), `amount` (Decimal, 1–1000); LogItem adds `plan` FK, optional `meal` FK, `datetime`, `comment`.
- Calculation: `get_nutritional_values()` sums meals → `percent` macro split via `ENERGY_FACTOR` = protein 4, carbs 4, fat 9, fiber 2 kcal/g (EU Reg. 1169/2011 Annex XIV, wger/nutrition/consts.py); `KJ_PER_KCAL = 4.184`; plan deviation graded within 3/7/10% of goal.
### REST endpoints (wger/urls.py, all under /api/v2/)
- Public read (no auth, throttled): `ingredient/`, `ingredientinfo/` (nested), `ingredient-sync/` (cursor-paginated, incremental via `last_update__gt`), `ingredientweightunit/`, `ingredient-image/`, `ingredient/{id}/get_values/` (amount+unit → macro dict).
- Private CRUD (JWT via allauth headless; permanent token from settings page): `nutritionplan/`, `nutritionplaninfo/`, `nutritionplan/{id}/nutritional_values/`, `meal/`, `meal/{id}/nutritional_values/`, `mealitem/`, `nutritiondiary/` (LogItems).
- Removed: `/api/v2/ingredient/search/` (use `ingredientinfo` with filters); ingredient filter supports `code`, `name` (trigram GinIndex FTS), `language__in`, `nutriscore` exact/in/gt/gte/lt/lte.
### Sync mechanics (wger/nutrition/sync.py, consts.py)
- `OFF_FULL_DUMP_URL = https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz`; daily deltas at `static.openfoodfacts.org/data/delta/`.
- Commands: `import-off-products --jsonl | --delta-updates | (mongo)`; `sync-ingredients-bulk --set-mode=update|replace` (recommended, dump-based); `sync-ingredients[-async]` (API-based, slow); `export-ingredients` (generates the JSONL dump others consume); Celery for periodic sync (`SYNC_INGREDIENTS_CELERY`).
- Images: `DOWNLOAD_INGREDIENTS_FROM = 'WGER'` default — wger docs explicitly warn against hammering OFF.

## Integration Implications for AquaZeroFit
1. **Option A (recommended): direct OFF ingestion into AquaZeroFit's own store.** Mirror the OFF JSONL dump (or a filtered subset by language/category) as a nightly job; barcode hits resolve locally; miss → OFF API v2 `product/{code}` fallback. Keeps Node/TS stack, no Django sidecar, preserves deterministic allergen filtering — but **must ingest OFF `allergens_tags`/`traces_tags` directly since wger discards them**. ODbL compliance required (below).
2. **Option B: consume wger.de's public ingredient API** (`ingredientinfo`, `ingredient-sync`, barcode filter). Zero infra; but rate-throttled (`ingredient_list`/`ingredient_sync` scopes), third-party uptime dependency, no allergens, and you inherit both ODbL (OFF layer) and CC-BY-SA 3.0 (wger layer) attribution duties.
3. **Option C: self-host a minimal wger instance** purely as an ingredient mirror/proxy. Controlled rate limits, ready-made sync tooling; costs a Postgres + 3M-row table + Celery for a subset of features — poor ROI vs Option A.
4. Plan/diary: do NOT adopt wger's NutritionPlan model wholesale — AquaZeroFit already has AI meal plans (P-02). Reuse only patterns: per-100g normalization, `IngredientWeightUnit`-style serving units, and the EU 1169/2011 energy factors (4/4/9/2) for cross-checking AI-parsed meal estimates.
5. Barcode scanning: Telegram Mini App camera → zod-typed `code` → local mirror → OFF fallback mirrors wger's proven `fetch_ingredient_from_off` flow.
6. **ODbL compliance (Option A)**: attribute "Open Food Facts" + link per product; per ODbL §4.5a keep OFF data as a distinct component of a *collective database* (separate Cosmos container / JSON namespace, never commingled with proprietary records) to avoid §4.4 share-alike on the whole DB; internal-only adaptation is exempt (§4.5c), but any publicly used adapted database triggers §4.4 + §4.6 (offer machine-readable copy). Do not DRM/paywall the OFF-derived data itself.

## Risks / Open Questions
- ODbL "Derivative Database" boundary if OFF data is merged/enriched with proprietary nutrition data — needs legal review before public launch; safest is strict data segregation + attribution.
- OFF data quality: crowdsourced, packaged-food bias, values as-sold not as-consumed; missing micronutrients. Needs a validation layer (wger's 30%+5 kcal energy-vs-macros plausibility check is a good template).
- Allergen coverage in OFF is incomplete/crowdsourced — deterministic allergen filtering must treat OFF allergens as best-effort, not ground truth.
- wger.de API throttles + no SLA (Option B); OFF API requires custom User-Agent and enforces per-endpoint rate limits.
- Image reuse: CC-BY-SA 3.0 per photo with per-uploader attribution; third-party trademark/packaging rights explicitly disclaimed by OFF.
- Serving-size parsing is heuristic (1 g/ml); verify against AquaZeroFit portion UX before reuse.
