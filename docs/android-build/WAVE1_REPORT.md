# Wave 1 report — AquaZeroFit Android production foundation

**Date:** 2026-08-27 · **Exit state:** `./gradlew --no-daemon test assembleDebug` GREEN in
`apps/android` (24 JVM unit tests, 0 failures; `assembleRelease` with R8 minify +
resource shrinking also GREEN).

> **INCIDENT (orchestrator action needed):** a concurrent process (an IDE/agent
> active during this wave) relocated the entire Gradle project from
> `apps/android/` to the **repository root** mid-build and left ~729 tracked
> working-tree files (apps/api, apps/web, assets, configs) DELETED from the
> working tree (`git status` shows them as `D`; `.git` is intact). This agent
> restored the project into `apps/android/` (copy, wrapper jar regenerated) and
> re-verified green, but was not permitted to run `git restore .`. To recover:
> run `git restore .` at the repo root, then delete the stray root-level Gradle
> copy (`/app`, `/gradle`, `/gradlew*`, `/build.gradle.kts`,
> `/settings.gradle.kts`, `/gradle.properties`, `/local.properties`, `/.gradle`,
> `/.kotlin`) and revert the root `.gitignore` if still showing the Android
> template content. `apps/android/` is the canonical, verified project.
> The same process also injected a release `signingConfig` requiring a
> keystore; it was kept but made conditional on the keystore existing, so
> unsigned release builds work without CI secrets
> (`AZF_KEYSTORE_PATH/PASSWORD`, `AZF_KEY_ALIAS/PASSWORD`).

## What was built

- **Identity & Gradle**: package renamed `com.example.aquazerofit` → `fit.aquazero.app`
  (namespace, applicationId, source tree, manifest, tests). `versionCode 1`,
  `versionName "1.0.0"`, `compileSdk 37`, `targetSdk 36`, `minSdk 26`.
  `buildConfig` on with `API_BASE_URL` (debug `http://10.0.2.2:4000/api/v1`,
  release `https://app.aquazero.fit/api/v1`) and `MEDIA_BASE_URL`. Release build
  type: `minifyEnabled` + `shrinkResources` with real keep rules
  (`app/proguard-rules.pro`) for kotlinx-serialization, Retrofit, OkHttp, Room 3.
- **Manifest & shell**: permissions exactly CAMERA / INTERNET /
  POST_NOTIFICATIONS / VIBRATE; camera `uses-feature required=false`;
  `usesCleartextTraffic="false"` globally with a **debug-only** network security
  config permitting cleartext to `10.0.2.2` (release config is TLS-only);
  `allowBackup=true` with `backup_rules.xml` / `data_extraction_rules.xml`
  excluding the auth DataStore (`datastore/azf_auth.preferences_pb`); splash
  screen (core-splashscreen, `#0E1416` + aqua droplet mark); single-activity
  edge-to-edge with dark system bars; `@HiltAndroidApp` Application registering
  the WorkManager Hilt factory (default initializer removed) and starting the
  connectivity→sync trigger; hand-authored launcher vector (aqua droplet + ring
  on Deep Sea).
- **Design system** (`core/designsystem`, 21 files): `AzfTheme` (full Deep Sea
  `darkColorScheme` from DESIGN.md) + `AzfExtended` (ctaGradient 135°
  `#2FD9F4→#45DFA4`, ringTrack `#1E4C74`, coral `#FFB2B9`, fixed-dim accents);
  bundled fonts (Barlow Condensed SemiBold static TTF + DM Sans variable TTF
  with Compose `FontVariation` weights); `tnum` metric styles (`DataLarge`/
  `DataSmall`); Liquid Geometric shapes (20/16/pill) + spacing tokens;
  `AzfMotion` (reveal 600ms cubic-bezier(0.16,1,0.3,1), 80ms stagger, press
  0.97) with `Modifier.revealOnEnter(index)` and `pressScale`, all gated on
  animator-duration-scale=0. Components, one per file, each with `@Preview`:
  `AzfCard` (Hero/Standard/Compact), `PrimaryButton`, `SecondaryButton`,
  `AzfChip`, `AzfTextField`, `RingProgress`, `MacroBar`, `WaterDroplets`,
  `Sparkline`, `LevelBar`, `Skeleton`, `EmptyState`, `ErrorState`,
  `ToastHost` (+ injectable `ToastController`, max 3, 3.8s), `AzfBottomNav`
  (5 tabs, glow pill, haptic tick), `AzfAppHeader`, `AkinStage` (float-bob,
  pose crossfade, press squash, tap-advance), `GramsStepper` (±10, 5–2000,
  haptic detents), `AssetImage` + `BrandAssets` (Coil `file:///android_asset/`).
- **Contract & network** (`core/network`): full DTO mirror of
  `packages/shared/src/types.ts` (see `CONTRACT.md`), tolerant `AzfJson`;
  14 Retrofit services matching the exact `/api/v1` mounts; `HeaderInterceptor`
  (X-Timezone, User-Agent `AquaZeroFit-Android/1.0.0`, Accept-Language, bearer);
  `TokenAuthenticator` (single-flight via `RefreshCoordinator` Mutex, one
  retry, family-revocation → forced logout); `RetryAfter` parser (seconds +
  HTTP-date); `ChatStreamClient` (OkHttp SSE → `Flow<ChatStreamEvent>`);
  `ApiResult<T>` + `safeCall` mapping the `{code,message,details?}` envelope;
  `IdempotencyKeys` (UUID). Debug-only HTTP logging via a source-set split
  (`NetworkLogging`), Authorization header redacted.
- **Auth** (`core/auth`): `AuthTokenStore` (access token memory-only,
  StateFlow); `KeystoreAead` interface + `AndroidKeystoreAead` (AES/GCM 256,
  alias `azf_rt_key`, generated on first use); `RefreshTokenVault`
  (ciphertext+IV in the backup-excluded `azf_auth` DataStore; decrypt failure
  degrades to signed-out); `RefreshCoordinator` (Mutex single-flight,
  body-transport `POST /auth/refresh`, atomic rotation vault-then-memory,
  emits `ForcedLogout`); `SessionManager` (restore/login/register/logout,
  `AuthState` Unknown/SignedOut/SignedIn consumed by the nav shell; transient
  restore failures stay signed-in for offline-first UX).
- **Database** (`core/database`): Room **3.0.2** (`androidx.room3`),
  `exportSchema=true` with `schemaDirectory` wired (schema JSON at
  `app/schemas/fit.aquazero.app.core.database.AzfDatabase/1.json` — check into
  VCS); explicit `AndroidSQLiteDriver`; NO destructive fallback. 23 entities
  per plan §4.1 (catalog: Food/Recipe/Exercise+Media/AchievementDefinition/
  Coach; logs: Meal/Water/Weight with `serverId?`, `localId`, `localDate`,
  `syncState`, `idempotencyKey`, weight unique-indexed on `localDate`;
  account: User/Profile/Targets/Consent/Entitlements; training:
  TrainingPlan(docJson)/WorkoutSession(+draft columns); progress:
  ProgressSummary(JSON)/TrendPoint; chat: Session/Message/MemoryFact/Challenge;
  infra: Outbox with state/attempts/firstInFlightAt/schemaVersion). 7 DAOs
  incl. the transactional `OutboxDao.claimHead`.
- **Sync** (`core/sync`): `OutboxRepository` (transactional QUEUED→IN_FLIGHT
  claim; `mutateQueuedPayload` enforces mutate-only-while-QUEUED at the SQL
  level); `SyncWorker` (@HiltWorker, unique work, network-constrained,
  exponential backoff, honors Retry-After by rescheduling with delay, FIFO per
  entity stream, DELETE→NOT_FOUND treated as success, 4xx → FAILED + row
  surfaced, >20h in-flight reconciliation implementing weight=always-resend /
  meal=match-day-logs / water=day-total-compare); `ConnectivityMonitor`
  (callbackFlow over ConnectivityManager); `SyncScheduler` (enqueue on write +
  on connectivity regained).
- **Repositories** (`core/data`): `AuthRepository`, `LogsRepository`
  (Room-first optimistic writes + outbox + live local `DailyNutrition`
  recompute via `DailyNutritionCalculator`), `CatalogRepository` (server-side
  food search w/ recent/frequent offline fallback, paged exercise bulk cache —
  always limit/offset, recipes wholesale), `ProfileRepository`,
  `ChatRepository` (SSE + offline history + meal drafts), `PlansRepository`
  (today envelope typed once, session draft persistence), `ProgressRepository`
  (summary snapshot + trend series), `CoachesRepository` (roster cache,
  ack-after-composition). No TODO-throwing stubs.
- **Navigation shell**: Navigation 3 kept and extended. `NavKeys.kt` has a
  serializable key for every plan screen. Auth-gated root (`AzfNavigation`):
  Unknown → hold, SignedOut → Welcome/SignIn flow, SignedIn → 5-tab scaffold
  (`AzfBottomNav`) on one root back stack, full-screen destinations pushed
  above the tabs (bottom bar hidden when the top entry is not a `TabKey`).
  **Welcome** (3-slide pager with the web's brand copy, logo, dots, CTA pair)
  and **SignIn** (login/register toggle, email validation, password-rules
  checklist mirroring `passwordSchema`, API error display, Hilt ViewModel →
  `AuthRepository`) are fully implemented. 19 placeholder screens (one file
  each, real `AzfTheme` scaffolding + header + "Coming online in Wave 2"
  EmptyState) ready for wholesale replacement. All template demo code deleted.
- **Tests** (JVM, no Robolectric): vault crypto roundtrip + decrypt-failure
  degradation (fake AEAD + fake DataStore), outbox state transitions +
  mutate-only-while-QUEUED + key-rotation rule, DailyNutrition recompute,
  Retry-After parsing, DTO serialization of realistic payloads (auth, daily
  nutrition, progress summary, OFF food, error envelope).

## Version deviations from the plan's pins (all verified to resolve)

| Component | Plan pin | Shipped | Why |
|---|---|---|---|
| AGP | 9.3.0 | **9.3.2** | Scaffold's 9.0.1 rejects Compose 1.12 transitive deps ("requires AGP 9.1.0+"); took latest stable patch of the plan's minor. |
| Gradle wrapper | 9.5.0 | **9.5.0** | Bumped from scaffold's 9.1.0 (AGP 9.3.x requirement); sha256 updated. |
| Compose BOM | 2026.08.00 | **2026.03.01** (scaffold) | Kept the template's BOM per mission ("KEEP the template's Navigation 3 artifacts"); libraries resolve to Compose 1.12.0 via transitive constraints. |
| KSP | 2.3.10 | **2.3.11** | Latest KSP2 (decoupled versioning), compatible with Kotlin 2.3.20. |
| Hilt | 2.57.1 | **2.60.1** | Latest stable; 2.57.1 also exists but 2.60.x has current KSP2 fixes. |
| Room | 3.0.2 `room3-*` | **3.0.2** | As planned. Note: **no `room3-ktx` artifact exists** (runtime is coroutines-first); annotations renamed (`@ColumnTypeConverter(s)` replace `@TypeConverter(s)`); Gradle plugin id `androidx.room3`, DSL block `room3 { schemaDirectory(…) }`. |
| Retrofit / OkHttp | 3.0.0 / 5.x | **3.0.0 / 5.5.0** | As planned (latest 5.x). |
| kotlinx-serialization-json | 1.11.0 | **1.11.0** | As planned. |
| Coil | 3.5.0 | **3.6.0** | Latest 3.x; coexists with the BOM. |
| CameraX | 1.5.1 | **1.6.2** | 1.5.x no longer latest-stable; 1.6.2 is stable and includes `camera-compose` + `camera-mlkit-vision`. |
| ML Kit barcode | 17.3.0 | **17.3.0** | As planned. |
| WorkManager | 2.11.2 | **2.11.2** | As planned. |
| DataStore | — | **1.2.1** | Latest stable. |
| androidx.hilt (work/navigation) | — | **1.4.0** | Latest stable. |
| splashscreen | — | **1.2.0** | Latest stable. |
| Fonts | bundle Barlow Condensed SemiBold + DM Sans | **done** | DM Sans ships as the upstream **variable** TTF (google/fonts has no static cuts); weights selected via Compose `FontVariation.Settings` (API 26+ OK). Barlow Condensed SemiBold is a static TTF. |
| `android.util.Base64` | — | `java.util.Base64` in the vault | JVM-testable without Robolectric; available since API 26 (= minSdk). |

## File inventory (packages under `fit.aquazero.app`)

- root: `AzfApplication`, `MainActivity`, `AzfNavigation` (+`RootViewModel`), `NavKeys`
- `core/common`: `LocalDates`, `IdempotencyKeys`, `DailyNutritionCalculator`
- `core/designsystem`: `Color`, `Theme`, `Type`, `Shapes`, `Spacing`, `Motion`,
  `AzfCard`, `PrimaryButton`, `SecondaryButton`, `AzfChip`, `AzfTextField`,
  `RingProgress`, `MacroBar`, `WaterDroplets`, `Sparkline`, `LevelBar`,
  `Skeleton`, `EmptyState`, `ErrorState`, `ToastHost`, `AzfBottomNav`,
  `AzfAppHeader`, `AkinStage`, `GramsStepper`, `AssetImage`
- `core/network`: `AzfJson`, `ApiResult`, `RetryAfter`, `HeaderInterceptor`,
  `TokenAuthenticator`, `ChatStreamClient`, `NetworkModule`,
  `NetworkLogging` (debug/release source sets), `dto/*` (16 files),
  `api/*` (15 services)
- `core/auth`: `KeystoreAead`, `AuthTokenStore`, `RefreshTokenVault`,
  `RefreshCoordinator`, `SessionManager`, `AuthModule`
- `core/database`: `AzfDatabase`, `DatabaseModule`, `Converters`, `SyncState`,
  entities (`CatalogEntities`, `LogEntities`, `UserEntities`,
  `TrainingEntities`, `ProgressEntities`, `ChatEntities`, `OutboxEntity`),
  DAOs (`LogsDao`, `OutboxDao`, `CatalogDao`, `UserDao`, `TrainingDao`,
  `ProgressDao`, `ChatDao`)
- `core/sync`: `ConnectivityMonitor`, `OutboxRepository`, `SyncScheduler`, `SyncWorker`
- `core/data`: `AuthRepository`, `LogsRepository`, `CatalogRepository`,
  `ProfileRepository`, `ChatRepository`, `PlansRepository`,
  `ProgressRepository`, `CoachesRepository`
- `feature/*`: onboarding (Welcome ✔, SignIn ✔, FirstRun, Setup), dashboard,
  nutrition (Nutrition, CaptureMeal, AnalysisResults, MealPlan, RecipeDetail),
  training (WorkoutLibrary, WorkoutSession), progress (Progress, LogWeight),
  coach (Coach, CoachSelect), challenges, settings (Settings,
  NotificationSettings, Memory, PlanEntitlements)
- tests: `RefreshTokenVaultTest`, `OutboxRepositoryTest`,
  `DailyNutritionCalculatorTest`, `RetryAfterTest`, `DtoSerializationTest`

## What Wave 2 can rely on

- **Screens plug in by replacing one file.** Every placeholder under
  `feature/<area>/<Screen>.kt` is wired into the Nav 3 entry provider in
  `AzfNavigation.kt`; args (`jobId`, `recipeId`, `sessionId`) already flow.
  Push full-screen destinations with `backStack.add(<Key>)`.
- **Repositories are the API surface** (`core/data`): all return `Flow`s for
  Room-backed reads and `ApiResult<T>` for network ops. Offline log writes go
  through `LogsRepository.logMeal/logWater/logWeight` — never call `LogsApi`
  POSTs directly, or you'll bypass the outbox and its idempotency rules.
- **Never reuse an idempotency key with a different payload.** Edits to a row
  whose create op has been claimed must be `OutboxRepository.enqueueUpdate`;
  `mutateQueuedPayload` returns false in exactly that case.
- `ToastController` is injectable anywhere; `ToastHost` is already mounted at
  the root. `LocalAzfExtended` carries brand tokens; metrics text must use
  `DataLarge`/`DataSmall` or `fontFeatureSettings = TabularNumbers`.
- `SessionManager.authState` flips the root automatically — login/logout flows
  need no manual navigation.
- `ChatStreamClient.stream(sessionId, content)` is the only way to send a chat
  turn; on `TransportError` poll `ChatRepository.refreshMessages` (bounded, ~4
  attempts/15s per plan §9).
- `catalogDao`/`CatalogRepository.refreshExercises()` bulk-caches the whole
  exercise corpus; exercise media (incl. attribution) is in `exercise_media`.
- Coil is present but not yet wired to the authenticated OkHttp client — Wave 2
  camera/media agents should install a Coil `ImageLoader` using the
  `@Named("api")` OkHttpClient so `/uploads/*` and `/meal-photos/:id/image`
  load with auth (gap listed below).

## Known gaps (deliberate for Wave 1)

1. Placeholder screens render an EmptyState — all feature UX is Wave 2.
2. Coil has no app-wide `ImageLoader` bound to the authenticated client yet
   (bundled-asset loading via `AssetImage` works; network media in Wave 2).
3. `SyncWorker` covers meal/water/weight creates + meal update/delete; photo
   upload queue (vision) is Wave 2 per plan Phase 3.
4. No Play Integrity token in `RegisterRequest.captchaToken` yet (backend
   delta 3); field exists and is sent when populated.
5. Logout outbox-drain UI (warn "N unsynced entries") has the data
   (`AuthRepository.pendingOutboxCount`) but no dialog yet.
6. `MealDayDto.totals` uses the nutrient shape; server's `totalsOf` may add
   fields — tolerant JSON absorbs them.
7. Room schema v1 JSON must be committed with this wave (orchestrator commit).
8. A concurrent editor (IDE/agent) was active during the build and ASCII-fied
   some KDoc punctuation; content was reconciled and verified by the final
   green build.
