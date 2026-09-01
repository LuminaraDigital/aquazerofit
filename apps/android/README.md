# AquaZeroFit for Android

[![Android Verification](../../../../actions/workflows/android-verify.yml/badge.svg)](../../.github/workflows/android-verify.yml)
[![Licence: AGPL v3](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue.svg)](../../LICENSE)

The native Android client: **Kotlin + Jetpack Compose + Room + Hilt**, speaking
the same frozen `/api/v1` contract as the web app. Not a wrapper and not a
WebView — a separate client against a shared backend, offline-first, built to
ship on Google Play.

> AquaZeroFit provides general wellness and fitness support only. It does not
> provide medical diagnosis, treatment or professional healthcare advice.

---

## Quick start

You need JDK 17+ and the Android SDK. There is no `java` on `PATH` on a stock
Windows machine — Android Studio's bundled JBR works:

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
```

Point Gradle at your SDK by creating `apps/android/local.properties`:

```properties
sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

Then, from `apps/android`:

```bash
./gradlew assembleDebug
```

The debug build targets `http://10.0.2.2:4000/api/v1` — the emulator's route to
the host machine — so start the API first from the repository root:

```bash
npm run api
```

Install and run on a connected device or a booted emulator:

```bash
./gradlew installDebug
```

> Do **not** pipe `./gradlew` into `tail` or `head`. The pipeline's exit status
> is `tail`'s, so a failed build reports success. Redirect to a log file and
> check `$?`.

## Verifying

The four gates CI runs, in the order it runs them:

```bash
./gradlew ktlintCheck detekt lintDebug testDebugUnitTest
```

| Gate | What it enforces |
| --- | --- |
| `ktlintCheck` | Formatting and import order. `./gradlew ktlintFormat` fixes most of it. |
| `detekt` | Complexity and code smells, configured in [`config/detekt/detekt.yml`](config/detekt/detekt.yml) with a recorded reason beside every raised threshold. |
| `lintDebug` | Android Lint. **0 errors**; 156 warnings — see below. |
| `testDebugUnitTest` | **518 JVM unit tests** across 63 classes. |

Lint's warning count is not zero and is not being quietly ignored. The
breakdown, from `app/build/reports/lint-results-debug.sarif`:

| Count | Rule | Standing |
| --- | --- | --- |
| 60 | `UnusedResources` | Strings superseded by later naming. Deliberately not deleted: `isShrinkResources = true` strips them from release builds, and removing user-facing copy is a product decision, not a refactor one. The modularisation plan files them by feature prefix in Phase 3. |
| 36 | `PluralsCandidate` | Real, and worth fixing before any locale beyond `en` is added — `%d` formatting breaks in languages with more than two plural forms. Tracked, not urgent while the app ships English only. |
| 25 | `UseKtx` | Suggestions to swap platform calls for `androidx.core` KTX equivalents. Cosmetic. |
| 10 | `GradleDependency`, `NewerVersionAvailable`, `AndroidGradlePluginVersion` | "A newer version exists" notices, which appear the day after any pin. |
| 25 | assorted | `ModifierParameter`, `ObsoleteSdkInt`, `ExifInterface`, `ConstantLocale` and others in single digits. |

`abortOnError` is at its default, so an **error**-severity finding fails the
build and CI. That is what happened to `StartActivityAndCollapseDeprecated` in
the Quick Settings tile, and it is why that suppression names the lint id
rather than using `@Suppress("DEPRECATION")` — a Kotlin suppression does not
reach an Error-severity lint issue.

Instrumented tests (55, needing a device or emulator):

```bash
./gradlew connectedDebugAndroidTest --no-build-cache
```

They cover the Room DAOs and the outbox state machine, schema-migration
readiness against the exported
`app/schemas/fit.aquazero.app.core.database.AzfDatabase/1.json`, navigation through the
signed-in and pre-auth shells, the workout library screen, and the
purge-on-user-switch path.

**Trust the count, not the banner.** Gradle's local build cache has served a
partial ASM-transform output on this project before, producing a green run over
a truncated suite. Verify:

```bash
ls app/build/test-results/testDebugUnitTest/*.xml | wc -l
```

If that is short of 63, re-run with `--no-build-cache --rerun-tasks`.

## Architecture

One Gradle module, layered by package, with a strictly one-way dependency
graph:

```
core/model          Pure Kotlin DTOs, ApiResult — no Android, no Retrofit
core/common         Calculators: energy, nutrition, overload, session burn
core/database       Room 3 - 23 entities, exported schemas, migration tests
core/network        Retrofit + OkHttp, three clients, SSE, token refresh
core/auth           Keystore-backed refresh-token vault, session lifecycle
core/sync           Outbox + WorkManager replay, connectivity monitor
core/designsystem   Compose primitives, motion, toast controller
core/ui             Shared composables and formatters used by 2+ features
core/gamification   Celebration, confetti, XP maths, brag cards
       |
feature/{dashboard, nutrition, training, progress, coach,
         settings, onboarding, challenges}      21 screens, 25 ViewModels
       |
app                 MainActivity, navigation shell, widget, DI wiring
```

**No feature imports another feature, and nothing under `core` imports a
feature.** That invariant is currently held by convention rather than by the
compiler; see [Modularisation](#modularisation) below.

State flows one way: a screen renders an immutable `UiState` exposed as a
`StateFlow`, and sends one-shot effects (toasts, navigation, share sheets)
through a `Channel`. ViewModels emit **string resource ids**, never formatted
text, so they stay free of `Context` and testable on the JVM.

### Offline-first

Room is the source of truth for logs. A write lands locally, enters an outbox
row, and a WorkManager job replays it against the API using the server's
existing `Idempotency-Key` support — so a double-send cannot double-log. AI
features (coach, photo analysis, meal plans) are online-only by design.

### Dependency injection

Hilt throughout — **14 `@Module`s, 25 `@HiltViewModel`s, 73 files using
`@Inject`**, all constructor injection. There is no service locator and no
static singleton anywhere in the app.

Where a boundary needs to be swappable it is an interface bound with `@Binds`
rather than a concrete class: `DashboardData`, `NutritionData`, `CrashReporter`,
`AnalyticsTracker`, `KeystoreAead`, `CoachVoiceEngine`. Those seams exist so
tests can substitute fakes, and the tests do — see `FakeDashboardData`,
`FakeNutritionData`, `FakeCoachesRepository`.

`@Named` qualifiers separate the three OkHttp clients (`api`, `authless`,
`sse`) and the two Retrofit instances. The split is load-bearing, not
cosmetic: the authless client is what makes a 401 refresh non-recursive, and
each client gets its own `Dispatcher` because sharing one deadlocked the
refresh path. [`NetworkModule.kt`](app/src/main/java/fit/aquazero/app/core/network/NetworkModule.kt)
documents why.

Hilt reaches into the tests too: `AzfTestRunner` swaps the application, and
`FakeNetworkModule` replaces the entire network graph for instrumented runs.
`EntryPointAccessors` appears exactly once, in the Glance widget, because a
widget cannot be `@AndroidEntryPoint`.

## Testing approach

ViewModel tests use `StandardTestDispatcher` with `Dispatchers.setMain`,
hand-written fakes at the DI seam, and an injected `java.time.Clock` so
midnight-rollover behaviour is deterministic rather than flaky at 23:59.

Pure logic — calorie maths, progressive overload, XP curves, barcode rules,
password policy, locale formatting, telemetry redaction — is tested directly on
the JVM, which is why those files carry no Android imports in the first place.

## Release

Release builds are minified and resource-shrunk (R8), and **refuse to package
unsigned**. A missing keystore used to degrade silently to
`app-release-unsigned.apk` with a green build; it is now a hard failure at
packaging time, with `-Pazf.allowUnsignedRelease=true` as the deliberate local
escape hatch. CI must never pass it.

`versionCode`/`versionName` come from the release tag via `-Pazf.versionCode`
/ `AZF_VERSION_CODE`, because Play rejects a re-used `versionCode` and a
constant would have made every release after the first fail at upload.

Two workflows:

- [`android-verify.yml`](../../.github/workflows/android-verify.yml) — runs on
  every push and PR touching `apps/android/**`. References no secrets.
- [`android-release.yml`](../../.github/workflows/android-release.yml) — runs on
  a release tag: static analysis, tests, signed APK + AAB, signature
  verification with `apksigner`.

Full instructions: [`docs/PLAY_STORE_RELEASE_GUIDE.md`](../../docs/PLAY_STORE_RELEASE_GUIDE.md).

## Permissions

Deliberately lean, because every permission is a Play review surface:

`CAMERA` · `INTERNET` · `POST_NOTIFICATIONS` · `VIBRATE` · `RECORD_AUDIO`
(coach voice) · `FOREGROUND_SERVICE` (+ `SPECIAL_USE`, live workout) · five
Health Connect scopes (steps, heart rate, sleep, total calories read; weight
write).

No `READ_MEDIA_*` — gallery import goes through the system Photo Picker, which
needs none. No location, no storage, no exact alarms, no `QUERY_ALL_PACKAGES`.

## Modularisation

The app is one Gradle module layered by package. Splitting it into per-layer
Gradle modules is planned and specified in
[`docs/plans/ANDROID_MODULARISATION.md`](../../docs/plans/ANDROID_MODULARISATION.md),
which carries the measured dependency graph and the execution order.

The build files for that split are deliberately **not** kept on disk ahead of
the move. A build file for a module with no source is never configured by
Gradle, so nothing validates it — a typo would sit there undetected — and its
presence misrepresents a single-module build as a multi-module one.
`./gradlew projects` lists exactly one module, and the tree says so too. The
design is the durable artefact and it lives in the plan; the build files are
cheap to write when the sources actually move.

Phase 1 — removing every feature-to-feature import so the graph is one-way
before the build is restructured — is **done**. Until the compiler enforces it,
the check is a grep, and it prints nothing when the graph is clean:

```bash
cd app/src/main/java/fit/aquazero/app
for f in feature/*/; do
  grep -rho "import fit\.aquazero\.app\.feature\.[a-z]*" "$f" |
    grep -v "feature.$(basename "$f")"
done
grep -rn "import fit\.aquazero\.app\.feature" core/
```

The second line matters as much as the first: a `core -> feature` edge is worse
than the `feature -> feature` edges Phase 1 removed.

## Toolchain

| | |
| --- | --- |
| Android Gradle Plugin | 9.3.2 |
| Gradle | 9.5.0 |
| Kotlin | 2.3.20 (JVM target 17) |
| compileSdk / targetSdk / minSdk | 37 / 36 / 26 |
| Compose BOM | 2026.08.00, Navigation 3 |
| Hilt | 2.60.1 (KSP 2.3.11) |
| Room | 3.0.2 |
| Retrofit / OkHttp | 3.0.0 / 5.5.0 |

`detekt` is pinned to a `2.0.0-alpha` deliberately: 1.23.8 is the last 1.x, and
its embedded Kotlin compiler throws on the JDK 25 that Android Studio's JBR now
ships, so it cannot run at all. Move back to a stable release the moment one
supports JDK 25.

## Licence

AGPL-3.0-or-later, with the rest of the repository. See
[`LICENSE`](../../LICENSE) and [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)
— the exercise corpus is CC-BY-SA and the ingredient data ODbL, and both carry
terms independent of this one.
