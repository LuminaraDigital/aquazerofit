# Android modularisation plan

Status: **Phases 0, 1 and 2 landed; Phases 3 and 4 blocked pending a quiet tree.**

Phase 1 closed on 2026-09-01: every feature-to-feature import is gone and the
layer graph is now strictly one-way (`:feature:* -> :core:*`), enforced for now
by the check in `Verifying the invariant` below rather than by the compiler.

The Android app is one Gradle module (`:app`) with `core/` and `feature/` as
Kotlin packages. This plan converts it to a multi-module build with convention
plugins, so that layer boundaries are enforced by the compiler instead of by
review.

Everything below was measured against the tree, not assumed. Re-verify the
counts before starting if substantial feature work has landed since.

## Why this is worth doing

`internal` currently enforces nothing: in a single module every package can see
every other. That is why Phase 1 was worth doing on its own, ahead of the
Gradle work: the edges it removed (`feature/nutrition` reaching into
`feature/dashboard` for five symbols, three of them pointlessly `internal`)
were real coupling regardless of how the build is structured. What the modules
add is that the edges cannot come back — `internal` and the convention plugins'
dependency allowlist start meaning something only once the modules are real.

## Measured dependency graph

Derived by extracting every `import fit.aquazero.app.{core,feature}.*` edge.

**Status as re-measured 2026-09-01.** All six violations below are resolved in
code, and there are now **zero** feature-to-feature edges. Re-measure before
trusting this table again — it drifted badly once already, and the edge counts
move whenever a feature grows. The command is in `Verifying the invariant`.

| # | Violation | Cause | Fix | Status |
|---|---|---|---|---|
| 1 | `core:auth` and `core:network` form a **cycle** | `SessionManager`/`RefreshCoordinator` need `AuthApi` + DTOs; `HeaderInterceptor` needs `AuthTokenStore`; `TokenAuthenticator` needs `RefreshCoordinator` | Declare `AuthTokenProvider` and `TokenRefresher` (+ `RefreshOutcome`) SPI interfaces **in** `:core:network`; `:core:auth` implements them; bind in `:app`. The edge becomes one-way. | **DONE** — `core/network/AuthSpi.kt` |
| 2 | `core:database` depends on `core:network` | `Converters.kt`, `LogEntities.kt` import `AzfJson` and `MealLogItemDto` | Move both to `:core:model`; storage stops depending on transport. | **DONE** |
| 3 | `feature:nutrition` depends on `feature:dashboard` | **23** imports (not 12) of `NutritionFormat`, `CardSkeleton`, `HydrationCard`, `MacroRow`, `rememberToastSink` | Move all five to `:core:ui`. | **DONE** — plus `TargetExplainSheet`, a sixth that appeared after this was written |
| 4 | `feature:onboarding` and `feature:settings` form a **cycle** | `SetupViewModel` needs `settings.reminders.{ReminderPrefsStore, ReminderScheduler}`; `SettingsScreen` needs `onboarding.{SetupUnits, TargetsNotSetCard}` | Move `reminders/`, `SetupUnits` and `TargetsNotSetCard` into `:core:ui`. | **DONE** |
| 5 | `feature:gamification` depends on `feature:coach` | `CelebrationOverlay` and `AchievementUnlockBanner` need `CoachPersona`, `CoachRoster`, `CoachAvatar`, `CoachPortrait` | Move the coach persona/art types into `:core:ui`, below both. | **DONE** |
| 6 | `ReminderNotifier` references `MainActivity` | Notification content intent is built from the `:app` entry point | Declare an `AppEntryPoint` SPI **in** `:core:ui`; `:app` binds `MainActivityEntryPoint`. Same shape as violation 1. | **DONE** |

Violation 5 mattered more than its size suggests: this document places
`feature/gamification` in `:core:ui` "to prevent the next feature-to-feature
edge by construction", and that move would have turned a feature-to-feature
edge into a `:core:ui -> :feature:coach` edge — worse than the thing it was
meant to prevent. The coach types had to go down first.

Remaining feature-to-feature edges:

```
(none)
```

The 33 edges this table used to list were all fan-in to two packages that were
not really features. Both were resolved together, because fixing either alone
would have left the other looking acceptable:

- The six shared symbols (`NutritionFormat`, `CardSkeleton`, `HydrationCard`,
  `MacroRow`, `rememberToastSink`, `TargetExplainSheet`) moved out of
  `feature/dashboard` into `core/ui`. `dashboard` was never their owner — it
  was just the first screen that needed them, and `SharedCards.kt` said so in
  its filename.
- `feature/gamification` became `core/gamification`. It owns no screen and no
  nav destination, so it was never a feature; it is a cross-cutting
  presentation capability that features mount. It is a leaf — it imports
  nothing from any feature — so this was a package rename with no logic
  change. Kept as its own `core` package rather than folded into `:core:ui` as
  this document originally proposed: confetti, haptics, XP maths and the brag
  card renderer are a coherent unit, and `:core:ui` is already the destination
  for everything else homeless.

### Verifying the invariant

Until Phase 3 makes the compiler enforce this, the check is a grep. It prints
nothing when the graph is clean:

```bash
cd apps/android/app/src/main/java/fit/aquazero/app
for f in feature/*/; do
  grep -rho "import fit\.aquazero\.app\.feature\.[a-z]*" "$f" |
    grep -v "feature.$(basename "$f")"
done
grep -rn "import fit\.aquazero\.app\.feature" core/
```

The second line matters as much as the first: a `core -> feature` edge is
worse than the `feature -> feature` edges this phase removed, and moving code
downward is exactly how one gets introduced by accident. Phase 4 turns both
into a CI assertion.

### Two findings that improved the target design

1. **All 16 DTO files and `AzfJson` are pure Kotlin** — zero `android`,
   `androidx`, `retrofit2`, `okhttp3`, `dagger` or `javax` imports. `:core:model`
   is therefore a **JVM module**, not an Android library. Domain models
   physically cannot reach for a `Context`.

2. **Features do not need `:core:network`.** Their non-DTO imports are
   `ApiResult` (11 uses), `AzfJson` (3), `ChatStreamEvent` (2) and three request
   types misfiled in `api/`. The `ApiResult` sealed interface is pure — only
   `safeCall` needs Retrofit. Split that one file and features depend on
   `:core:data` and never see the HTTP layer. `AndroidFeatureConventionPlugin`
   encodes this: it grants `:core:model`, `:core:common`, `:core:designsystem`,
   `:core:ui` and `:core:data`, and nothing else.

### Target graph

```
:core:model        JVM, no Android      16 DTO files + AzfJson + ApiResult
   |-- :core:common
   |-- :core:database ---------+        Room; schemas/ moves with it
   |-- :core:network ----------+        api/, interceptors, SafeCall, SSE
   |      \-- :core:auth       |
   |            \-- :core:sync +
   |                  \-- :core:data
   \-- :core:designsystem --> :core:ui
                                 |
        :feature:{dashboard, nutrition, training, progress,
                  coach, settings, onboarding, challenges}
                                 |
                               :app
```

`feature/gamification` (celebration, confetti, XP) is **not** a feature module.
It is now `core/gamification`, below every feature — coach and progress both
import it, and training and challenges both will. Placing it under `core`
prevents the next feature-to-feature edge by construction. It becomes
`:core:gamification` in Phase 3, depending on `:core:ui` and `:core:model`.

## The largest piece: 1,244 string resources

Library modules cannot see `fit.aquazero.app.R`. 75 files import it.

**These counts are stale by design.** The partition below was measured at 643
strings across 51 files; the table has since grown to 1,244 across 75. The
shape of the finding held — most strings belong to exactly one module, a small
shared core belongs in `:core:ui`, and a long tail is referenced by nothing —
but the numbers must be re-measured before Phase 3, not carried over. Recorded
here as a method rather than as a result:

| Bucket | Count (at 643) | Destination |
|---|---|---|
| Used by exactly one module | 533 | that module's `res/values/strings.xml` |
| Used by two or more modules | 27 | `:core:ui` (allergen names, `action_back`, `action_retry`, `app_name`, `kcal_value`, ...) |
| Referenced by nothing | 85 | file with the feature their prefix implies |

The 85 orphans are leftovers from earlier naming (for example `analysis_confirm`,
superseded by `analysis_confirm_cta`). They are **not** deleted: `isShrinkResources
= true` strips them from release builds, and removing user-facing copy is a
product decision, not a refactor decision.

Every `R` reference is a compile-time symbol, so a mis-filed string fails the
build rather than reaching a user. That is what makes this large job verifiable.

## Resources and manifest

Small and simple:

- `res/font/` (2 files) moves to `:core:designsystem`; the `R` import in
  `Type.kt` changes with it.
- `res/drawable/` (launcher + splash), `res/mipmap-*`, `res/xml/` (backup,
  data-extraction, network-security), `values/themes.xml` and `values/colors.xml`
  stay in `:app`.
- `AndroidManifest.xml` — permissions stay in `:app`. Only `CAMERA` and
  `VIBRATE` are feature-specific; splitting them into per-feature manifests is
  optional and not worth the churn at this size.

## Execution order

Each step ends green before the next begins. Do not batch them.

**Phase 1 — break the violations while still single-module. DONE.** (1a)
extract the `:core:model` contents in place, (1b) invert auth/network via the
SPI interfaces, (1c) move the shared symbols to `core/ui` and `core/gamification`.
Nothing about the Gradle structure changed, so each step stayed independently
reviewable and revertable — which is the whole reason this phase runs before
the build is touched. The graph is one-way as of 2026-09-01.

**Phase 2 — convention plugins.** *Already written*: `build-logic/` providing
`azf.android.application`, `azf.android.library`, `azf.android.compose`,
`azf.android.feature`, `azf.android.hilt`, `azf.android.room` and
`azf.jvm.library`, plus all 17 module build files. Inert until
`settings.gradle.kts` includes them. Wiring it up also needs version-catalog
entries for the AGP / Kotlin / KSP / Hilt / Compose Gradle plugins, and
`enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")` for the `projects.*`
accessors the module files already use.

**Phase 3 — extract modules bottom-up**, following the graph: `:core:model`,
then `common`, `designsystem`, `network`, `auth`, `database`, `sync`, `data`,
`ui`, then the features, then `:app`. Use `git mv` so history survives.
Partition the strings in one central pass *before* the feature modules split,
because `strings.xml` is a single shared file and cannot be edited
concurrently. Move `app/src/debug/.../core/network/NetworkLogging.kt` into the
`:core:network` debug source set, and `app/schemas/` with `:core:database`.

**Phase 4 — quality gates.** ktlint and detekt via a convention plugin applied
to every module. Create the `androidTest` source set — its dependencies are
already declared in `app/build.gradle.kts` with nothing to run — and seed it
with the Room `MigrationTestHelper` test. Add `ktlintCheck detekt` to
`android-release.yml` ahead of `test`, plus a module-graph assertion so a
feature-to-feature import fails CI. Turn on `org.gradle.parallel` (currently
commented out): it is worth little at one module and a lot at eighteen.

`allWarningsAsErrors` is wired as opt-in via `-Pazf.warningsAsErrors=true`
rather than always-on, so CI can enforce it while a local build stays workable
when a dependency bump deprecates something mid-task.

## Preconditions

1. **A single writer.** This refactor moves every source file; it cannot run
   while another session edits the same tree.
2. **A green baseline.** The verification method is "build green after each
   step", and there is nothing to verify against otherwise.

## Gotcha worth remembering

Do not pipe Gradle into `tail` or `head` to inspect output — the pipe's exit
status masks Gradle's, and a failed build reports success. Redirect to a log
file, capture `$?`, then grep the log.
