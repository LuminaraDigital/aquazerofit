# wger × AquaZeroFit — Deep Research & Integration Plan

**Date:** 2026-07-30 · **Status:** Proposal for review · **Research basis:** 7 parallel verified research tracks (see `research/track-*.md`)

---

## 1. Executive Summary

wger is a mature, actively maintained open-source fitness manager (Django/DRF, v2.6 stable, releases every 2–4 months). It owns three assets AquaZeroFit lacks at scale:

| wger asset | Size (verified live) | What it unlocks for AquaZeroFit |
|---|---|---|
| Exercise corpus | **828 exercise bases** (~450 logical movements after variation grouping), 3,286 translations, 360 images, 78 videos, 15 muscles, 12 equipment, 8 categories | Grows the in-app exercise library from ~50 hand-seeded records to 800+, with media and multilingual names |
| Ingredient database | **3,063,298 ingredients** (Open Food Facts derivative) with macros/100 g, nutriscore, vegan/vegetarian flags, barcodes, serving units | Barcode scanning, real food data for meal logging, cross-checks for the AI meal pipeline |
| Domain design patterns | Deterministic progression engine (iteration-indexed rules + autoregulation requirements), slot/slot-entry routine model, computed stats (Brzycki e1RM), `need_logs_to_advance` scheduling | Upgrades the training-plan engine and activates the dormant P-05/P-06 AI prompts on a rich data foundation |

**Strategic verdict (aligned with AQF-12 / ADR-013):** adopt wger's **data and domain model only — zero source code**. wger code is AGPL-3.0-or-later (network copyleft; incompatible with this proprietary codebase); exercise/translation/image/video data is Creative Commons **per record**; ingredient data is ODbL (via Open Food Facts). Consuming the public REST API and importing data is legally clean and is already AquaZeroFit's documented posture — the `Exercise` type already carries `licence` / `licenceAuthor` / `sourceId` fields marked "never stripped".

**Recommended architecture:** a server-side ETL mirror. AquaZeroFit's Node API imports wger data offline into its own document store, normalized behind zod schemas, with incremental refresh. No runtime dependency on wger.de (community instance, no SLA), no Django sidecar, no AGPL exposure.

---

## 2. Research Findings (condensed)

### 2.1 wger API surface (Track A)
- REST API v2, ~55 endpoints, OpenAPI schema at `/api/v2/schema`. Public read (no auth) on all reference data: `exercise`, `exerciseinfo`, `exercise-translation`, `exerciseimage`, `video`, `muscle`, `equipment`, `exercercategory`, `ingredient`, `ingredientinfo`, `license`.
- `exerciseinfo/{id}` is the bulk-export path: one call per exercise returns category, muscles, equipment, **all translations, images, videos, variation group, and full license metadata**.
- Pagination `?limit=&offset=` (limit=200 confirmed); incremental sync via `last_update_global`; deletions via `/api/v2/deletion-log/` (`uuid`, `replaced_by`).
- Throttling only on scoped hot endpoints (ingredients 120/min list, sync 600/min, login 10/min); other reads unthrottled at app layer — but **no ToS, no SLA**. Never a hard production dependency.
- v2.5/2.6 shipped breaking changes (removed search endpoints, int→UUID IDs). Pin to 2.6+; key all imported records on `uuid`, never integer IDs.

### 2.2 Exercise dataset detail (Track B)
- Normalized model: `Exercise` base (muscles/equipment/category/variation_group) ↔ `Translation` (name/description/aliases per language). Importer must join both levels.
- Language coverage is a cliff: **en 827, es 645, de 627, fr 582** — then it 138, pt 66, zh 48, ru 10… Ship en/es/de/fr only; treat wger text as display content, never as model instructions (crowdsourced, XSS surface — sanitize HTML).
- Licensing is per-object (5 licenses: CC-BY-SA 3/4, CC0, CC-BY 4, ODbL). Each record carries `license` + `license_author`; **some legacy images have empty `license_author`** — attribute those to "wger community contributors, CC-BY-SA 3.0" (what wger's own apps do) and flag as a known gray zone.
- Only ~40% of exercises have imagery; descriptions are often one-liners; **no safety/contraindication fields exist** — AquaZeroFit's code-enforced safety layer remains authoritative.

### 2.3 Nutrition & Open Food Facts (Track C)
- wger's ingredient DB ≈ OFF mirror: macros per 100 g (Decimal), `code` (barcode), `nutriscore`, `is_vegan`/`is_vegetarian`, serving units (`IngredientWeightUnit`: name + grams). Energy factors 4/4/9/2 kcal/g (EU 1169/2011) — matches AquaZeroFit's deterministic-calculation invariant.
- **Critical gap: wger discards OFF allergen fields.** AquaZeroFit must ingest OFF `allergens_tags` / `traces_tags` **directly from OFF**, not via wger, to feed the deterministic allergen filter — and treat them as best-effort, not ground truth.
- Recommended path: direct OFF JSONL dump ingestion into a **segregated** container (ODbL §4.5a collective-database posture: never commingle OFF data with proprietary records; attribute "© Open Food Facts contributors" per product). Complement with **USDA FoodData Central (CC0, 1,000 req/h)** for lab-grade whole foods — no share-alike exposure.

### 2.4 Training-engine patterns worth adopting (Track D)
- **Progression as data:** rules keyed by `(slotEntry, iteration)` with `op: +|-|replace`, `step: abs|percent`, `repeat`, and `requirements` (apply only if the previous iteration's logs met the targets — autoregulation/double progression without ML). AquaZeroFit already has `ProgressionRule` rows — extend them with `requirements`; AI (P-06) *proposes* rules, deterministic `applyProgression()` *resolves* them.
- **Log both target and actual** on every set (history survives plan edits; feeds drift analysis for P-08 progress insights).
- **`need_logs_to_advance` + `fit_in_week`** solve schedule drift deterministically.
- **Computed read models:** pre-resolved "today's workout" document (folded sets, rounded weights, rest timers) — ideal for the Telegram Mini App's latency constraints.
- **Deterministic stats layer:** volume, set count, Brzycki e1RM per week/muscle/exercise — trustworthy input for the insightBatch prompt lane.
- Hard safety caps in validators (wger's `MAX_COMPOUND_*` pattern) → mirror in zod so no prompt output can produce absurd loads.

### 2.5 Legal analysis (Track E)
| Scenario | Verdict | Confidence |
|---|---|---|
| Import wger data into AquaZeroFit DB | **Safest path; already policy.** Per-record attribution, CC-BY-SA share-alike on *adapted texts* (e.g. AI translations of descriptions), ODbL duties on OFF ingredient republication. Share-alike applies to data, never to AquaZeroFit code. | High |
| Self-host stock wger as microservice | Legal at arm's length (FSF "separate programs"), but poor ROI for this use case; any wger modification triggers §13 source disclosure of the fork. | High |
| Runtime calls to public wger.de | Legally fine (CC data, no auth) but operationally fragile — dev/cache-warming only. | Medium/Low |
| Vendoring wger code | **Prohibited.** AGPL derivative → network copyleft on the combined work. Clean-room reimplementation of ideas/progressions is fine (ideas aren't copyrighted). | High |

### 2.6 AquaZeroFit integration points (Track F — file-level)
- `apps/api/src/data/seeds/exercises.ts` — the obvious importer slot; schema already wger-shaped.
- `packages/shared/src/types.ts:168` `Exercise`, `:45` `Equipment` enum (8 values vs wger's 12 — **barbell, Swiss ball, incline bench missing**), `:248-288` plan/slot/progression types.
- `apps/api/src/modules/plans/service.ts` — deterministic `buildPlan` (pool filter → focus rotation → progression rules); **P-05/P-06 prompts are registered but never invoked** — a 828-exercise pool makes activating them worthwhile.
- `workouts/service.ts:233` swap logic (same primary muscle + user equipment) — directly upgraded by wger's `variation_group`.
- New endpoints needed: `POST /admin/exercises/import`, optional `GET /exercises/:id/variations`; no user-facing contract changes — `/exercises`, `/workouts/today`, plan generation read the same `content` container.
- Media must be **mirrored** into `apps/api/assets/` (served via `/uploads`), never hotlinked — TMA bandwidth and wger.de politeness both demand it.

### 2.7 Precedents (Track G)
- Every known third-party consumer (Node-RED nodes, wger-mcp, openScale) uses **plain server-side REST + local cache** — the exact pattern recommended here. wger itself uses "dump-first, API-fallback" against OFF; mirror that pattern against wger.
- Version-gate the integration: record wger server version per sync (2.5 removed four endpoints with no deprecation window).
- A disposable `wger/demo` Docker container (or `dev.wger.de`) gives zero-cost contract testing in CI.

---

## 3. Target Architecture

```
                 ┌─────────────────────── AquaZeroFit ───────────────────────┐
                 │                                                           │
 wger.de API ──► │  ETL job (apps/api/scripts/wgerImport.ts)                 │
 (v2.6+, public)│   · exerciseinfo crawl (limit=200, UUID-keyed upsert)     │
                 │   · muscle/category/equipment mapping tables              │
 OFF JSONL ────► │   · difficulty heuristic + safety caps (zod)              │
 dump / API     │   · allergen_tags ingestion (OFF direct, not via wger)     │
                 │   · media mirror → apps/api/assets/exercises/             │
 USDA FDC ─────► │   · incremental: last_update_global + deletion-log        │
 (CC0 layer)    │                                                           │
                 │  content container (Cosmos/JSON)  ── segregated OFF       │
                 │   · exercises (CC-BY-SA, licence fields intact)           │
                 │   · foods_off (ODbL, separate namespace)                  │
                 │   · foods_fdc (CC0)                                       │
                 │                                                           │
                 │  Deterministic core (unchanged authority)                 │
                 │   buildPlan · applyProgression(+requirements) · allergen  │
                 │   filter · calorie math · stats (e1RM/volume)             │
                 │                                                           │
                 │  AI gateway (activated by the bigger pool)                │
                 │   P-05 planStructured · P-06 chatFast · P-08 insightBatch │
                 └───────────────────────────────────────────────────────────┘
```

Non-negotiables preserved: code calculates/filters/enforces; attribution fields never stripped; OFF data segregated; no AGPL code in repo; no runtime dependency on wger.de.

---

## 4. Phased Roadmap

### Phase 1 — Exercise library 16× (highest value, lowest risk)
1. `packages/shared`: extend `Equipment` enum (+barbell, swissBall, inclineBench, pullUpBar variants); add `wgerUuid`, `variationGroup`, `licenseUrl` to `Exercise`; zod schemas for the wger payload (`WgerExerciseBase/Translation/Image/Video`).
2. Mapping tables (`apps/api/src/data/wger/mappings.ts`): wger 15 anatomical muscles → AQF muscle strings; wger 8 categories → AQF 4; equipment 12 → extended enum.
3. Difficulty heuristic (category + equipment + movement complexity) with conservative default `beginner` bias — safety invariant AQF-11; unit-test the mapping on all 828 records.
4. `scripts/wgerImport.ts`: crawl `exerciseinfo`, sanitize description HTML, upsert by `wgerUuid`, reconcile/replace the 50 placeholder `wger-1xx` seeds, mirror images to `assets/exercises/`, emit `content/ATTRIBUTION.md` additions automatically from imported license fields.
5. `POST /admin/exercises/import` + `GET /exercises/:id/variations`; upgrade `swapExercise` to prefer same `variationGroup`.
6. UI: `WorkoutLibrary.tsx` — pagination/lazy images, per-exercise attribution line ("© {author}, {license}, via wger.de"), new equipment icons.

### Phase 2 — Training engine upgrade
1. Extend `ProgressionRule` with `requirements: ['weight','reps','rir']` semantics (apply only when previous iteration's logs met targets); deterministic `applyProgression()` in `workouts/service.ts`; zod hard caps (weight 0–1000 kg, RiR 0–9.5 step 0.5).
2. Log `*_target` alongside actuals in `WorkoutSession`; `needLogsToAdvance` + weekly anchoring on `PlanDay`.
3. Pre-computed `/workouts/today` payload (folded sets, rounded weights) — TMA latency win.
4. Stats module: weekly volume, set count, Brzycki e1RM (pinned formula version) → feeds P-08.

### Phase 3 — Activate dormant AI (P-05/P-06)
1. Wire `plans/router.ts` to the `planStructured` lane with the pre-filtered pool contract (already matches imported records); deterministic validation of all prompt output; fallback to offline engine unchanged.
2. P-06 workout adjustment with `alternatives` from the variation-aware swap pool.
3. New eval fixtures in `evals/` (plan-safety.json): absurd-load rejection, allergen-adjacent exercise contraindication refusals, attribution preservation in AI-generated plan text.

### Phase 4 — Nutrition data plane
1. OFF JSONL subset ingestion (language/category filtered) into segregated `foods_off` container, incl. `allergens_tags`/`traces_tags`; USDA FDC whole-food layer (`foods_fdc`, CC0).
2. Barcode lookup endpoint (local mirror → OFF API fallback, custom User-Agent, 15 req/min respect); Telegram camera scan UX.
3. Energy-factor cross-check (4/4/9/2) on AI-parsed meal estimates; nutriscore/vegan flags enrich P-02.

### Phase 5 — Continuous sync & governance
1. Scheduled sync job (Blueprint Automation): incremental via `last_update_global` + `deletion-log`; wger version pinning + changelog gate per release.
2. Update AQF-12 register (ratify wger verdict), `THIRD_PARTY_NOTICES.md`, `content/ATTRIBUTION.md`; ODbL collective-database note; CC-BY-SA statement covering adapted/translated descriptions.
3. CI contract tests against `wger/demo` Docker image.

---

## 5. Compliance Checklist (blocking)

- [ ] Per-record `licence`/`licenceAuthor`/`sourceId` imported and **never stripped** (AQF-06 §3.3); UI attribution on exercise detail + attribution page.
- [ ] CC-BY-SA share-alike: AI translations/rewrites of wger descriptions licensed CC-BY-SA and attributed; flagged in the prompt pipeline.
- [ ] Legacy empty-author images → "wger community contributors, CC-BY-SA 3.0" best-effort attribution (documented gray zone).
- [ ] OFF data segregated in its own container; "© Open Food Facts contributors" attribution; no paywalling of the OFF-derived dataset itself (ODbL §4.4/4.6).
- [ ] Zero wger source code in the repo; dependency licence allowlist (MIT/Apache-2.0/BSD/ISC) re-verified.
- [ ] wger.de used only for one-time/incremental ETL with polite pacing (~600 ms spacing); production reads are always local.
- [ ] Allergen data treated as best-effort; deterministic filter remains authoritative with its own curated allergen table.

## 6. Top Risks

1. **Lossy taxonomy mapping** (muscles/categories/equipment) — mitigate with tested mapping tables + audit report on import.
2. **`difficulty` is AQF-only** — wrong heuristics leak advanced moves to beginners; conservative defaults + manual review of the top 100 imported exercises.
3. **CC license heterogeneity per record** — ETL must copy each record's own license, never assume a blanket one.
4. **wger API churn** (2.5 broke 4 endpoints unannounced) — pin version, contract-test in CI, gate upgrades.
5. **ODbL boundary** if OFF data is enriched/merged with proprietary nutrition records — strict segregation; legal review before any redistribution.

## 7. Research appendix

Full verified briefs: `research/track-a-wger-api.md` (API surface), `research/track-b` (exercise assets — inline in swarm log), `research/track-c-wger-nutrition-off-brief.md`, `research/track-d` (progression engine — inline), `research/track-e-licensing-legal.md`, `research/track-f` (codebase gap analysis — inline), `research/track-g` (precedents — inline). All facts verified against live wger.de API, the wger master branch, OFF/USDA docs, and the local AquaZeroFit codebase on 2026-07-30.
