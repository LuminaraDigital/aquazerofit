# Technical debt reduction: SSOT, DRY, and context hygiene

**Author:** engineering notes from the incremental refactor pass  
**Scope:** `packages/shared`, `apps/web`, `apps/api`, `apps/android`  
**Stance:** preserve behaviour; reduce duplication and file size; do not rewrite product rules

## Why this work existed

AquaZeroFit is a monorepo with three clients and one API. Over time, the same ideas were reimplemented in several places: local calendar dates, list/envelope unwraps, React Query cache keys, AI credit settlement, and large page files that mixed helpers with UI.

That debt has two costs:

1. **Correctness risk.** Two copies of "today" or of credit settlement can drift. Credit settlement especially must stay identical: degraded AI output is never billed.
2. **Maintainability and AI-assisted work.** Files over ~900-1100 lines force reviewers (human or agent) to load more context than needed, which raises the chance of incomplete edits.

A full rewrite of every oversized file was rejected. Product invariants in `CONTRIBUTING.md` (append-only credits, allergen filters, confirm-first meal photos, named API envelopes) make large behavioural refactors unsafe. This pass was incremental, behaviour-preserving, and verified after each wave.

## What we did

### Wave 1: single sources of truth (TypeScript)

**Web date and number formatting.**  
`apps/web/src/lib/format.ts` is now the only definition for `todayLocalDate`, `addDays` / `shiftLocalDate`, `round1`, `fmtInt`, and weight conversion constants. `pages/dashboard/lib.ts` re-exports those helpers for nutrition/dashboard callers instead of reimplementing them. `LogWeight` stopped carrying its own `KG_PER_LB` and local "today" helper.

**Defensive API envelopes.**  
`apps/web/src/lib/envelopes.ts` centralises `asList`, `orNull`, and `unwrap`. Coach, workout library, progress, weight logging, and `queries.ts` import from there. Named envelopes (`{ profile }`, `{ items }`, …) remain the contract; unwrap stays defensive on purpose.

**React Query cache keys.**  
Call sites now use `queryKeys.nutritionDaily`, `nutritionTrends`, `weight`, `progress`, and `todayWorkoutQuery` / `queryKeys.workoutToday`. CoachPip no longer used a divergent `['workouts','today']` key. Coach meal confirm stopped invalidating a non-existent `['dashboard']` key. Unused `useTodayWorkout` was removed.

**API dates and Express helpers.**  
`apps/api/src/platform/dates.ts` documents two "today" semantics and owns them:

- `todayFor(req)`: client calendar day via `X-Timezone` (preferred on HTTP handlers).
- `processLocalToday()` / `localToday`: process calendar when there is no request.
- `utcToday()`: UTC day for the credit grant ledger (unchanged product rule).

AI meal/vision/recommendation defaults that previously ignored the timezone header now prefer `todayFor(req)` when a request exists. Chat meal-draft validation uses the shared `localDateSchema` from `@aquazerofit/shared` instead of a weaker regex-only copy. Duplicate `asyncHandler` in the AI util module now re-exports the platform implementation. `daysBetween` lives on the platform dates module for plans and workouts.

**Credit settlement.**  
`settleReservation(reservationId, billable)` in `apps/api/src/modules/ai/creditLedger.ts` is the shared degraded-safe settle path. Chat, vision confirm, recommendations, progress insight, and plan generation call it so commit-vs-release cannot diverge by copy-paste. Optional/complex workout-swap and memory paths still use ledger primitives where a simple settle did not fit without changing control flow.

### Wave 2: file-size hygiene

**Settings (web).**  
`Settings.tsx` remains the route shell. Account access, profile sections, and label maps moved to sibling modules (`AccountAccessSection.tsx`, `ProfileSections.tsx`, `settingsLabels.ts`). `PRIVACY_CONSENTS_ANCHOR` stays exported from the page for deep-link stability.

**Nutrition (web).**  
`GramsStepper`, `FoodSearchSheet`, and math helpers (`itemFromFood`, `rescaleItem`) moved to sibling modules. `BarcodeSheet` and `AnalysisResults` import those modules directly. The page composes queries and layout.

**Shared types.**  
`packages/shared/src/types.ts` is an 8-line barrel. Domain files live under `packages/shared/src/types/` (enums, users, profiles, content, logs, plans, ai, ledger, audit, progress, auth, growth, coaches, deeplinks). Public imports remain `@aquazerofit/shared`; no call-site churn.

Chat meal-draft route extraction from `chat/router.ts` was left for a later pass (optional in the plan; credit settle already landed).

### Wave 3: Android alignment

**Hydration constant.**  
`Hydration.WATER_INCREMENT_ML` lives in `core/common`. Dashboard and nutrition ViewModels and the home-screen widget all use it. The widget no longer imports a feature ViewModel just for a constant (module-boundary fix).

**Meal trust parity.**  
Kotlin `MealTrust` gained `portionCorrectionWorthRemembering`, matching `packages/shared/src/mealTrust.ts`. Unit tests cover confidence bands, fat caution, and portion thresholds. TS and Kotlin remain dual SSOT by platform necessity; parity is enforced by tests, not by sharing a runtime.

**Cooking-fat UI.**  
`CookingFatPresetsRow` in `core/designsystem` replaces duplicated chip rows in coach meal draft and nutrition analysis.

**Context split.**  
`AnalysisReview` moved out of `AnalysisResultsViewModel.kt` into its own file so pure review logic can load without the full ViewModel.

Full decomposition of `WorkoutSessionScreen` / `NutritionSections` was intentionally deferred; those remain candidates for a follow-up PR.

## What we deliberately did not do

- No mass deletion of "maybe unused" exports without reference proof (beyond the proven `useTodayWorkout` removal).
- No move of calorie or allergen logic into prompts.
- No merge of Kotlin meal-trust into the npm shared package (would need codegen).
- No rewrite of `coaches.ts` content blobs for line count alone.
- No dependency upgrades or Gradle module split.
- No change to credit billing rules, allergen filtering, or confirm-first photo logging.

## Verification

| Gate | Result |
|------|--------|
| `npm run verify` (typecheck, API + web tests, AI eval) | Passed after Waves 1 and 2 |
| Android `compileDebugKotlin` + MealTrust / NutritionFormat / DeepLink unit tests | Passed after Wave 3 |

## Central paths to prefer going forward

| Concern | Canonical location |
|---------|--------------------|
| Web dates / display numbers / weight conversion | `apps/web/src/lib/format.ts` |
| Web API envelope unwrap | `apps/web/src/lib/envelopes.ts` |
| Web React Query keys | `apps/web/src/lib/queries.ts` (`queryKeys`, `todayWorkoutQuery`) |
| API client vs process vs UTC calendar | `apps/api/src/platform/dates.ts` |
| AI credit settle (commit vs release) | `settleReservation` in `apps/api/src/modules/ai/creditLedger.ts` |
| Shared domain types | `packages/shared/src/types/*` via `@aquazerofit/shared` |
| Android water increment | `fit.aquazero.app.core.common.Hydration` |
| Android meal-trust rules | `fit.aquazero.app.core.common.MealTrust` |

## Approximate impact (context hygiene)

| Surface | Before (approx.) | After (approx.) |
|---------|------------------|-----------------|
| `Settings.tsx` | ~1138 lines | ~547 + sibling sections |
| `Nutrition.tsx` | ~1120 lines | ~844 + sheet/math modules |
| `packages/shared/src/types.ts` | ~932 lines | 8-line barrel + domain files (largest ~160) |

Line count alone is not the goal. The goal is one place to change a rule, and files small enough that a future change loads only the relevant module.

## Suggested follow-ups

1. Extract chat meal-draft routes from `apps/api/src/modules/chat/router.ts`.
2. Move `allergenFilter` into `@aquazerofit/shared` for cross-client parity.
3. Align or document deep-link action vocabularies across shared, web, and Android.
4. Continue Android section splits for `WorkoutSessionScreen` and `NutritionSections` along existing composable seams.
5. Wire remaining raw React Query tuples (if any) to `queryKeys` as pages are touched.

## Summary

This pass tightened single sources of truth for dates, envelopes, query keys, and AI credit settlement; split the largest web and shared type surfaces for context hygiene; and aligned Android hydration, meal-trust, and cooking-fat UI with the same product rules. Behaviour and product invariants were preserved; verification gates passed for each wave.
