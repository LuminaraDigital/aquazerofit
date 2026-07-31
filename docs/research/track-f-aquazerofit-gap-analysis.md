# Track F — AquaZeroFit Codebase Gap Analysis (wger Integration Study)

## Key Findings

1. **An exercise library already exists and is already wger-shaped.** `apps/api/src/data/seeds/exercises.ts` seeds ~50 movements into the `content` container with `licence: 'CC-BY-SA 4.0'`, `licenceAuthor: 'wger.de community contributors'`, and `sourceId: wger-1xx` — i.e., the schema was designed for wger data but populated with only ~50 hand-written records vs wger's 845+. The importer slot is obvious; the corpus is the gap.
2. **Training plans are generated 100% by deterministic code today, not AI.** `apps/api/src/modules/plans/service.ts` (`buildPlan`) is a pure offline engine (pool filter → focus rotation → slot fill → progression rules); `generatedBy: null` by design. P-05 (AI plan generation) and P-06 (workout adjustment) prompts exist in `prompts/` and are registered in `apps/api/src/modules/ai/prompts.ts` but **are never invoked anywhere in the API** — plans router only calls the deterministic path.
3. **Attribution is a hard invariant.** Exercise `licence`/`licenceAuthor`/`sourceId` fields are "NEVER stripped" (AQF-12 obligation), enforced in types (`packages/shared/src/types.ts:168-183`), documented in `content/ATTRIBUTION.md` and `THIRD_PARTY_NOTICES.md`, and surfaced in the UI bottom sheet (`apps/web/src/pages/training/WorkoutLibrary.tsx`). This aligns perfectly with wger's CC-BY-SA data — the plumbing for compliance already exists.
4. **Storage is Cosmos-style documents in 8 containers** (`users, profiles, logs, plans, content, ai, ledger, audit` — `apps/api/src/platform/store.ts:15-24`), local JSON store with one file per container, in-memory + serialized flush. Exercises live in `content` alongside foods/recipes/achievements, so a 845-record import fits the existing container with zero schema change.
5. **The Telegram Mini App constraint means: mobile-first UI, no heavy assets, everything through `/api/v1`.** `apps/web/src/lib/telegram.ts` wraps `window.Telegram.WebApp` (initData auth, theme params, haptics); media must be small/served via API (placeholder SVG at `/uploads/exercise-placeholder.svg` today). wger images/videos would need proxying/caching, not hotlinking at scale.

## Concrete Facts (paths, schemas, endpoints)

**Data model (today):**
- `Exercise` — `packages/shared/src/types.ts:168`: `{ id, type:'exercise', name, description, category:'strength'|'cardio'|'mobility'|'core', primaryMuscles: string[], secondaryMuscles: string[], equipment: Equipment[], difficulty: 'beginner'|'intermediate'|'advanced', media: {kind:'image'|'video',url,caption?}[], licence, licenceAuthor, sourceId }`
- `Equipment` enum — `types.ts:45`: `none|dumbbells|resistanceBands|kettlebell|pullUpBar|bench|yogaMat|jumpRope` (8 values; wger has 12 incl. barbell, Swiss ball, incline bench — **enum gap**).
- `TrainingPlan/PlanDay/PlanSlot/SlotEntry/ProgressionRule` — `types.ts:248-288`; `WorkoutSession/SessionExercise` — `types.ts:290-314`. Progression is data (rules keyed by iteration), applied in `workouts/service.ts:41-58`.
- Containers hold: `users` (User + credentials + consent docs), `profiles` (WellnessProfile + DerivedTargets), `logs` (meal/water/weight), `plans` (trainingPlan + workoutSession), `content` (food + exercise + recipe + achievementDefinition), `ai` (chatSession/chatMessage/cvJob/recommendation), `ledger` (creditTransaction), `audit` (AuditEvent).

**Plan generation (offline engine):** `apps/api/src/modules/plans/service.ts` — `buildExercisePool` (experience rank + equipment subset filter, line 37), `FOCUS_SLOTS` muscle/category requirements per focus (line 89), `prescriptionFor` sets/reps/rest tables (line 127), progressive overload as `ProgressionRule` rows (line 240). Minimum pool: 8 exercises or `CONFLICT` (line 179). Session derivation + kcal estimate (6–10 kcal/min) in `workouts/service.ts:152`.

**Existing API endpoints (base `/api/v1`, `apps/api/src/modules/index.ts`):**
- `GET /plans/current`, `POST /plans/generate` (`plans/router.ts`)
- `GET /workouts/today`, `GET /workouts/exercises`, `POST /workouts/:id/complete`, `POST /workouts/:id/swap-exercise` (`workouts/router.ts`)
- `GET /exercises`, `GET /exercises/:id` (same file, `exercisesRouter`)
- `PUT /admin/exercises/:id` (patch only; **no create/import endpoint** — `admin/router.ts:85`)
- Swap constraint: same primary muscle + user equipment (`workouts/service.ts:233-246`) — directly reusable with a bigger pool.

**AI wiring:** 5 model groups (`visionPrimary, chatFast, planStructured, safetyCheap, insightBatch`) in `apps/api/src/modules/ai/gateway.ts`; provider chain Groq→Gemini→deterministic mock; P-05 lane `planStructured`, P-06 lane `chatFast`. P-05 expects a **pre-filtered pool input** `[{id,name,category,primaryMuscles,difficulty}]` — wger-imported records drop straight into this contract. P-06 expects `alternatives` — producible from the swap pool logic.

**wger API facts (verified, wger.de/api/v2, public/no-auth):** `exercise`, `exerciseinfo/{id}`, `exercise/search/?term=`, `exercisecategory` (IDs 8 Arms…15 Cardio), `muscle` (15 named muscles, e.g. 4 Pectoralis, 10 Quadriceps, 12 Lats), `equipment` (1 Barbell, 3 Dumbbell, 7 bodyweight, 10 Kettlebell…), `exerciseimage`, `exercisecomment`, `license`, `language`. Filter pattern: `/api/v2/exercise/?muscles={id}&language=2&status=2&format=json`. Records carry `license`, `license_author`, `uuid`, `variations`, multilingual translations.

## Integration Implications for AquaZeroFit

1. **Import path (lowest risk, highest value):** offline seeder script (sibling of `apps/api/src/data/seeds/exercises.ts`, e.g. `seeds/wgerImport.ts`) fetching `exerciseinfo` → map to existing `Exercise` type → upsert into `content` container via existing `JsonStore`/Cosmos. AGPL never touches runtime: only CC-BY-SA data is imported; `licence`/`licenceAuthor`/`sourceId` fields already satisfy attribution (AQF-12 register already lists wger).
2. **Mapping work needed:** wger muscles (15 anatomical names) → AQF free-text muscle strings (`'chest'`,`'back'`,`'quadriceps'`,`'core'`…); wger categories (9) → AQF 4 (`strength|cardio|mobility|core`); wger equipment (12) → AQF 8 — barbell/Swiss ball/incline bench have no AQF value, so either extend `EQUIPMENT` in `packages/shared/src/types.ts:45` (touches `WellnessProfile.equipment`, onboarding UI, `EQUIPMENT_ICONS` in `WorkoutLibrary.tsx:33`) or exclude those exercises on import. `difficulty` does not exist in wger — must be derived (heuristic by category/equipment) or defaulted, since the plan engine and pool filter depend on it.
3. **Media:** `Exercise.media[]` supports image+video URLs; wger `exerciseimage` records carry per-image license authors. For the Telegram Mini App, mirror images into `apps/api/assets/` (already statically served at `/uploads`) rather than hotlinking; keep placeholder fallback.
4. **Endpoints to add:** `POST /admin/exercises/import` (admin exists, only PATCH today); optional `GET /exercises/:id/variations` (wger `variations` group ID → better swap suggestions in `swapExercise`); no user-facing changes required — `/exercises` search, `/workouts/today`, plan generation all read the same `content` container.
5. **AI upside:** P-05/P-06 are dormant; a 845-record pool makes them worth activating (`planStructured` lane, pool contract already matches). wger's richer pool also fixes `buildPlan`'s 8-exercise minimum failure mode for restricted-equipment users.
6. **Nutrition parallel:** same pattern applies to `foods` (wger `ingredient` endpoint via Open Food Facts) — `Food.source`/`licence` fields exist (`types.ts:132-133`).

## Risks / Open Questions

- **License split:** wger *code* is AGPL-3.0 (do not vendor Django code into this closed-source TS app); *exercise data* is CC-BY-SA — share-alike obligations on derivative exercise descriptions need legal sign-off vs AQF-12 register. Ingredient data is CC/licensed per OFF terms.
- **Muscle/category taxonomy lossy mapping:** AQF's plan engine matches on strings like `'chest'`; wger's anatomical names need a maintained mapping table (no such table exists in repo today).
- **`difficulty` is AQF-only:** imported records need a defensible difficulty heuristic; wrong values leak advanced moves to beginners (safety invariant AQF-11).
- **Duplicate provenance:** current seed fakes `sourceId: wger-1xx`; a real import must reconcile/upsert by wger `uuid` to avoid duplicates with the existing 50 records.
- **TMA payload/bandwidth:** 845 exercises × images must not bloat the Mini App — pagination exists (`search`/`category` params) but no limit/offset on `/exercises`; media mirroring + lazy loading required.
- **P-05/P-06 activation is untested:** prompts registered but no caller, no eval fixtures (`evals/` only has assistant-safety + recommendation-safety JSONs) — activating them needs new eval coverage and code-side validation per prompt contracts.
