# AquaZeroFit — Native Android Implementation Plan (v2)

**Date:** 2026-08-27 · **Status:** **APPROVED** by adversarial senior review (round 1: REVISE with 5 blocking issues → all fixed → round 2: APPROVED; every load-bearing claim verified against repo source or live Google/Kotlin docs)
**Goal:** Ship AquaZeroFit as a native Android app on Google Play: Kotlin + Jetpack Compose + Room, built agent-first with Google's `android` CLI, backed by the existing Express API, stripped of everything Google Play does not need.

---

## 0. Locked product decisions (user-confirmed 2026-08-27)

| Decision | Choice | Consequence |
|---|---|---|
| Offline strategy | **Offline-first with sync** | Room = source of truth for logs + catalogs; outbox/WorkManager replay using the API's existing `Idempotency-Key` support. AI features online-only. |
| Monetization | **Free, no payments** | No Play Billing, no Google Pay SDK → Google Pay disclosure requirements do not apply. Telegram Stars purchase UI is stripped; coaches unlock by level only. |
| Auth | **Email/password only** (own backend) | Zero Google OAuth scopes → restricted-scope verification does not apply. |
| Health Connect | **Skip for v1** | No Google health app verification, no `android.permission.health.*`, no `FOREGROUND_SERVICE_HEALTH`. Revisit in v2. |

These four decisions deliberately zero out three of the six studied Google compliance regimes (restricted-scope verification, Health API/CASA verification, Google Pay disclosures). The remaining obligations are in §8.

---

## 1. Strategy

**Native rewrite, shared backend.** The web client (React) is not ported or wrapped — the Android app is a new Kotlin/Compose client speaking the same frozen `/api/v1` contract (AQF-07). The Express API, prompts (P-01…P-12), safety evals, and deterministic engines stay exactly where they are and continue to serve web + Telegram. The monorepo gains `apps/android/`.

**What is stripped (never built for mobile):**
- Entire marketing/landing surface: `apps/web/src/pages/landing/*`, SEO prerender machinery, OG/meta, HeroOrb/PhoneShowcase.
- Legal pages as native screens — Settings links out to `https://…/privacy`, `/terms`, `/support` via Chrome Custom Tabs (also satisfies AGPL source-link and Play privacy-policy-in-app requirements).
- All Telegram plumbing: SDK loader, initData auto-login, host theme binding, `openTelegramLink`, Stars purchase flows (`usePurchaseCoach`, invoice links), Smart App Banner, Telegram growth events.
- Cloudflare Turnstile widget (see §6.3 for the server-side consequence).
- PWA/browser assets, cookie-based refresh transport, `BarcodeDetector`/getUserMedia, `<input capture>`.

**Play-lean manifest (the compliance core):** permissions limited to `CAMERA`, `INTERNET`, `POST_NOTIFICATIONS`, plus `VIBRATE`. No `READ_MEDIA_*` (system Photo Picker for gallery import — zero permission), no location, no storage, no exact alarms, no foreground-service types, no `QUERY_ALL_PACKAGES`.

---

## 2. Toolchain (verified against live docs, Aug 2026)

| Component | Version | Notes |
|---|---|---|
| Android CLI | latest | `android init` first (installs the android-cli skill into the agent), `android create` to scaffold, `android studio version-lookup` to pin exact patch versions at scaffold time. **Emulator subcommand is disabled on Windows** — local runs via Android Studio AVD or WSL; CI smoke tests on Linux runners where `android emulator` works. |
| AGP | 9.3.0 | Requires Gradle 9.5.0, JDK 17. Use AGP 9 built-in Kotlin support — the `kotlin-android` plugin is deprecated. New R8 optimization DSL; keep rules in `src/<variant>/keepRules/`. |
| Gradle | 9.5.0 | Version catalog (`gradle/libs.versions.toml`), configuration cache on. |
| Kotlin | 2.3.20 (option to move to 2.4.0 after Phase 1) | `-progressive`, `-Xjdk-release=17`, `-Xreturn-value-checker=check`, `-Werror` with targeted escapes. ktlint enforcing the official style guide in CI. |
| Compose BOM | 2026.08.00 | Compiles against API 37; Compose 1.12.0 minimum is AGP 9.2.0 (satisfied by the 9.3.0 pin). |
| Room | **3.0.2 — `androidx.room3:room3-runtime` + `ksp("androidx.room3:room3-compiler")`** | New coordinates; KSP-only; coroutines-first (suspend DAOs, Flow queries); explicit `setDriver(AndroidSQLiteDriver())`. |
| KSP | 2.3.10 | Decoupled from Kotlin versions since KSP2. |
| SDK levels | compileSdk **37**, targetSdk **36**, minSdk **26** | targetSdk 36 is mandatory for new Play apps as of Aug 31, 2026. Bump target to 37 later after auditing Android 17 behavior changes (adaptive-layout enforcement). |
| Navigation 3 | 1.1.x (1.1.7 at time of writing — pin via `version-lookup` at scaffold) | Stable; type-safe serializable route keys; NavEntry-scoped ViewModels. |
| Hilt | 2.57.1 (KSP) | `@HiltViewModel`, `@HiltWorker`. |
| Retrofit 3.0.0 + OkHttp 5 + kotlinx.serialization 1.11.0 | | Moshi is maintenance-mode; serialization is compiler-plugin based. OkHttp SSE for chat streaming. |
| CameraX 1.5.1 + `camera-compose` | | Stable Compose-native `CameraXViewfinder` — no AndroidView wrapper. |
| ML Kit barcode | `com.google.mlkit:barcode-scanning:17.3.0` + `androidx.camera:camera-mlkit-vision` (`MlKitAnalyzer`) | On-device/unbundled: no network, no extra Data-safety declaration. |
| Coil | 3.5.0 (`coil-compose` + `coil-network-okhttp`) | Shares the authenticated OkHttpClient so `/meal-photos/:id/image` and `/uploads/*` load with auth + disk cache. |
| WorkManager | 2.11.2 | Outbox replay + photo upload queue. |
| DataStore + Tink/Keystore | | **`EncryptedSharedPreferences` is deprecated** — refresh token stored as Keystore-AEAD-encrypted bytes in DataStore. |
| Charts | Hand-rolled Compose `Canvas` first (the web charts are hand-rolled SVG: Sparkline, Catmull-Rom weight line, kcal bars); Vico only if a screen outgrows that. |
| Mascot | Compose animation APIs over the existing 3 AKIN pose JPGs (float-bob via `rememberInfiniteTransition`, pose swap via `AnimatedContent`, press squash). Rive is the v2 upgrade path when rigged art exists; Lottie only if AE assets appear. |

**Agent-first dev loop (per feature):** edit → `./gradlew :app:assembleDebug` → `android run --apks=…` → `android screen capture --annotate` / `android screen resolve` / `android layout --diff` to verify UI → `android docs search` when blocked. Compose previews verified headlessly with `android studio render-compose-preview --print-semantics` against the pixel references in `design/figma/<screen>/screen.png` — as a **human-judged reference during development, not a CI pixel gate** (font rendering/shadow variance makes strict diffs a CI tax; CI asserts semantics/layout, not pixels).

---

## 3. App architecture

**Single Gradle module** (`:app`), package-by-feature — split into modules only if build times demand it:

```
apps/android/app/src/main/kotlin/fit/aquazero/app/
  core/
    network/      # Retrofit services, OkHttp (auth interceptor, Authenticator, SSE), DTOs mirroring packages/shared/src/types.ts
    database/     # Room 3: AppDatabase, DAOs, entities, converters
    sync/         # Outbox engine, WorkManager workers, connectivity monitor
    auth/         # AuthTokenStore (memory access token), RefreshTokenVault (Keystore+DataStore), session manager
    designsystem/ # AzfTheme, colors, type, shapes, motion, core components (§5)
    common/       # Result types, localDate/timezone utils, idempotency keys
  feature/
    onboarding/   # Welcome, SignIn, FirstRun, Setup
    dashboard/    # Dashboard + water card + suggest meal
    nutrition/    # Day view, food search sheet, capture, analysis, barcode, meal plan, recipes
    training/     # Library, plan, guided session
    progress/     # Progress, log weight, achievements
    coach/        # Chat (SSE), meal drafts, coach select, reactions
    challenges/
    settings/     # Settings, notifications, memory, consents, plan/entitlements, deletion
  MainActivity.kt  # single activity, edge-to-edge, Navigation 3 root
```

**Pattern:** MVVM with MVI-flavored state — one immutable `UiState` per screen exposed as `StateFlow`, one-shot effects as sealed types. No MVI framework.

**Navigation:** Navigation 3. Two top-level graphs: pre-auth (Welcome → SignIn) and the authed shell — a 5-tab `NavigationBar` (Home, Nutrition, Workouts, Progress, Coach — mirroring `BottomNav.tsx`) with full-screen destinations (capture, analysis, workout session, settings stack, coach select, challenges, log weight, meal plan, recipe) pushed on the root stack *above* the scaffold, exactly as the web renders them outside `AppLayout`. A `RequireTargets` gate composable mirrors the web's: Nutrition/Progress/MealPlan show the Setup interstitial when no profile exists.

**The `/workouts/today` envelope trap** (documented production bug in `apps/web/src/lib/queries.ts`): type the envelope once as `TodayWorkoutEnvelope` and derive per-consumer views; never cache transformed slices.

---

## 4. Data layer: Room 3 schema + offline-first sync

### 4.1 Entities (mirroring `packages/shared/src/types.ts`)

**Catalog (server-owned, cached, read-only):**
`FoodEntity` (per100g nutrients, servings, allergens, barcode, nutriscore, source/licence), `RecipeEntity`, `ExerciseEntity` (+ `ExerciseMediaEntity` with licence/attribution/isAiGeneratedMedia — CC-BY-SA attribution must render on every card), `AchievementDefinitionEntity`, `CoachEntity` (roster, art refs, unlock levels).

**User data (offline-writable, synced):**
`MealLogEntity`, `WaterLogEntity`, `WeightLogEntity` — each with `localDate` keying, `serverId?`, `syncState (SYNCED | PENDING | FAILED)`, `idempotencyKey`. Weight is an upsert-per-localDate to match server semantics.

**User data (cached, online-write):**
`ProfileEntity` + `DerivedTargetsEntity`, `ConsentEntity`, `UserEntity`, `TrainingPlanEntity`, `WorkoutSessionEntity` (+ in-session draft state for process-death recovery), `ProgressSummaryEntity`, `TrendPointEntity`, `ChatSessionEntity` + `ChatMessageEntity` (read-only offline history), `MemoryFactEntity`, `CoachStateEntity`, `ChallengeEntity`, `EntitlementsEntity`.

**Infra:** `OutboxEntity` (op type, payload JSON, idempotency key, state, attempt count, createdAt, schemaVersion), `SyncCursorEntity` (per-catalog refresh watermarks — note: the API has no delta endpoints; catalogs re-fetch wholesale on a schedule, bounded: foods search is server-side so cache only *recent/frequent* foods; exercises via the paged `{items,total,limit≤200,offset}` envelope — **always pass at least one query param** (the bare `GET /exercises` returns a legacy plain array, not the envelope), and the catalog is small (tens of base exercises seeded, ~828 with the full wger import on the dev server), so a few pages bulk-cache the whole thing).

### 4.2 Sync engine (`core/sync`)

**Server idempotency facts the design is built on (verified in `apps/api/src/modules/logs/service.ts` + `router.ts`):** `Idempotency-Key` is honored only on the three POST creates (`/meal-logs`, `/water-logs`, `/weight-logs`); the dedupe id is `sha256(userId:method:path:key)` — **the request body is NOT fingerprinted**, and the cached response is replayed verbatim for 24h. `PUT`/`DELETE /meal-logs/:id` have **no** idempotency support.

- **Outbox op state machine:** `QUEUED → IN_FLIGHT → SYNCED | FAILED`. The worker marks an op `IN_FLIGHT` before sending. Because the server replays by key without checking the body, **mutating an op's payload in place is legal only while it is `QUEUED` and the worker hasn't claimed it** (guarded by a Room transaction). Editing a row whose create op ever went `IN_FLIGHT` must instead: (1) keep the original op with its original key (drain it first to learn/replay the `serverId`), then (2) enqueue a follow-up `PUT` op carrying the edit. Never reuse an idempotency key with a different payload.
- **Writes (meal/water/weight creates):** repository writes Room first (optimistic, `PENDING`), enqueues `OutboxEntity`, returns immediately. A WorkManager unique worker (`Constraints(NetworkType.CONNECTED)`, exponential backoff, honoring `Retry-After`) drains the outbox FIFO per entity stream. On 2xx → `SYNCED` + reconcile serverId; on 4xx validation → `FAILED` + surfaced in UI (non-silent); on 5xx/network → retry with the same key (safe: replay returns the cached response with `Idempotency-Replayed: true`).
- **Deletes/edits of logs:** outboxed as `PUT`/`DELETE` ops sequenced after their create. Since these have no server idempotency: a replayed **DELETE that returns `NOT_FOUND` is treated as success** (the first attempt already landed); **PUT is last-write-wins** by design — acceptable for single-device v1, documented as a known multi-device limitation.
- **24h idempotency window:** an op older than ~20h that has ever been `IN_FLIGHT` is not blindly retried — past 24h the server would duplicate. Per-type policy: **weight** — always safe to resend (deterministic per-`localDate` upsert makes it naturally idempotent); **meal** — reconcile first by fetching the day's meal logs (`GET /meal-logs` returns full logs) and matching on localDate + totals + source; **water** — `GET /water-logs` returns only day totals, so individual entries can't be matched: compare expected vs server day total and accept the residual duplicate risk for this doubly-rare case (response lost AND >24h offline). Ops that never left `QUEUED` are always safe to send.
- **Outbox on logout / forced logout:** explicit policy — user-initiated logout with a non-empty outbox blocks on a drain attempt (with visible progress); if unreachable, warn "N unsynced entries will be lost" and require confirmation. Token-family-revocation forced logout (security event) preserves the outbox rows tagged to the user id; they resume draining only if the same user signs back in, and are purged on a different-user sign-in.
- **Reads:** repository pattern = Room `Flow` as UI source + refresh-on-observe network fetch that upserts Room. Server wins on conflict for server-owned data.
- **Online-only surfaces** (no queueing, calm degraded states as designed on web): vision jobs, chat send/stream, meal drafts, recommendations, plan generation, insight, readiness, coach select, challenges create/join, profile/consent/memory writes (low-frequency; simple retry UI instead of outbox).
- **Meal photo uploads:** WorkManager one-off with the photo staged in app-private cache; delete local copy after `confirm` (server deletes its copy too).
- **Derived-day recompute:** `DailyNutrition` ring totals are recomputed locally from Room meal/water logs when offline so the dashboard stays live; server's version replaces it on next fetch (server stays authority — "code calculates" invariant holds on both sides).
- **Timezone:** every request carries `X-Timezone` (IANA, from `TimeZone.getDefault()`); all day-keying uses `localDate` computed client-side identically to the web. Payloads always carry explicit `localDate` (the server's header fallback never fires), so sync is timezone-safe. **Spec'd display behavior for QA:** after a timezone change, pending rows keyed to the departure-timezone `localDate` render under that date, not re-bucketed — matching server semantics.
- **Room schema durability (blocking-issue fix):** Room is the source of truth for unsynced user data, so destructive migration is forbidden. `exportSchema = true` with schema JSON checked into VCS from the first Phase 2 commit; every schema change ships a `Migration` with `MigrationTestHelper` tests in CI; `fallbackToDestructiveMigration` never enabled; outbox entities carry a `schemaVersion` and migrations must preserve pending ops (a migration that cannot is a release blocker).

---

## 5. Design system + UX port

- **Theme:** dark-only "Deep Sea" — the web palette is already expressed in M3 role names; port verbatim from `design/figma/modern_aquatic_wellness/DESIGN.md` into a single `darkColorScheme` (primary `#8AEBFF`, background `#0E1416`, etc.) + `AzfExtended` (CTA gradient `#2FD9F4→#45DFA4`, ring track `#1E4C74`, coral `#FFB2B9`). No light theme; `enableEdgeToEdge` with dark system bars.
- **Type:** Barlow Condensed SemiBold uppercase headings (+0.02–0.04em tracking), DM Sans body; **tabular figures (`FontFeatureSettings "tnum"`) on every metric**. Bundle fonts as resources (no runtime Google Fonts fetch — offline-first).
- **Shape/spacing:** 20dp card radius, 16dp inner radius, 20dp container margins/padding.
- **Core components** (from the extraction report, built in `core/designsystem` in Phase 1): `AzfCard(Hero|Standard|Compact)`, `AuroraBackground` (AGSL `RuntimeShader` on API 33+, static radial gradient below; honor animator-duration-scale=0 as reduced motion), `AzfBottomNav`, `RingProgress`, `CircularMacroRing`, `MacroBar`, `WaterDroplets`, `Sparkline`/`WeightChart`/`KcalBars` (Canvas), `LevelBar`+`XpBreakdown`, `AzfChip`, `PrimaryButton` (gradient, press scale 0.97), `GramsStepper`, `Skeleton`/`EmptyState`/`ErrorState`, `ToastHost`, `AkinStage`, `CoachAvatar`/`CoachCard`, chat bubbles + `SafetyFrame` + `TypingDots` + `MiniMarkdown` (bold + bullets ONLY — deliberate), `MealDraftCard`, `ShareMomentSheet` (Android Canvas → system share sheet), `ViewfinderOverlay`, `NutriscoreBadge`, `AllergenWarning`, `AchievementTile`, `AquaCalendarPicker`.
- **Motion vocabulary:** `Modifier.revealOnEnter(index)` (fade + 16dp rise, 600ms, `CubicBezier(0.16,1,0.3,1)`, 80ms stagger), shared `AzfMotion` specs, press-scale everywhere; ALL of it gated behind reduced-motion.
- **Haptics (mobile upgrade):** tick on nav/chips/stepper detents, `CONFIRM` on log success, heavy click on set-complete, celebration pattern on level-up/achievement.
- **Product invariants — carried verbatim, treated as acceptance criteria:**
  1. Nothing is logged without explicit confirmation (photo analysis confirm gate AND chat draft per-item opt-in + allergen acknowledgement — two independent gates).
  2. XP never decreases; no streaks that reset; consistency is "active days in window", never a breakable chain.
  3. No red for weight gain (coral only); no loss-framed animation.
  4. `WELLNESS_DISCLAIMER` persistent in chat; `CRISIS_SIGNPOST` shown on crisis guardrail — **localize beyond AU Lifeline for a global Play release** (see §6.5).
  5. Allergen exclusion is deterministic client-mirrored (barcode sheet warning), zero false negatives.
  6. Attribution renders on every exercise card (CC-BY-SA) and OFF barcode results ("© Open Food Facts contributors").

---

## 6. Backend deltas (small, deliberate — the API is 95% mobile-ready)

The `/api/v1` contract is frozen; these are additive changes in `apps/api`:

1. **Refresh flow: none needed.** `POST /auth/refresh` already accepts the refresh token in the JSON body and returns a new pair — the Android client uses body transport, no cookie jar. Access token in memory; refresh token Keystore-encrypted. Single-flight refresh via OkHttp `Authenticator` + `Mutex`, one retry, family-revocation 401 → forced logout (matches the server's reuse-detection CAS rotation).
2. **Client identification:** send `User-Agent: AquaZeroFit-Android/<version>` and keep `X-Timezone` on every call.
3. **Turnstile / bot protection:** `POST /auth/register` and `/auth/password-reset/request` demand a Turnstile token when the server has keys configured. Native Android cannot render Turnstile sanely. Decision: add a **Play Integrity API verdict path** to `platform/botProtection.ts` — `assertHuman` accepts either a Turnstile token (web) or a Play Integrity token (Android, verified server-side via Google's decode endpoint). Fallback if deferred: an interim server config flag exempting captcha-less registration — but note the server cannot authenticate "the mobile app" (User-Agent is spoofable), so this flag is a global bypass. Therefore it must be **compile-time incompatible with production** (config validation refuses to boot with the flag set when `NODE_ENV=production`), not merely an operator convention — acceptable only for closed testing.
4. **Stars/payments:** no server change needed for v1 (free app). `GET /coaches` returns `starsAvailable` — Android simply never shows purchase UI; level-unlock path (`unlock.level`) is already the primary door.
5. **Crisis signpost localization:** `CRISIS_SIGNPOST` is AU-only (Lifeline 13 11 14). Add a small locale→helpline map (server-side constant keyed by client locale header, with AU default) before global release. Play-relevant (health app content quality).
6. **Account deletion web URL:** in-app deletion exists (`DELETE /me`, two-step with 30-day grace). Play additionally requires a **web URL where users can request deletion without reinstalling** — add a small page/route on the web app (`/account/deletion`) that fronts the same flow (sign in → request deletion). Declared in the Data safety form.
7. **AI-report control:** `POST /chat/messages/:id/report` already exists — the Android chat UI must expose it prominently (long-press → Report) to satisfy Play's AI-Generated Content policy. Add an "AI estimate" disclaimer line on photo analysis results (client copy only).
8. **Media base URL:** exercise media served from `/uploads/*` — Android needs the same `mediaUrl()` resolution as `VITE_MEDIA_BASE_URL` (build-config field `MEDIA_BASE_URL`).
9. **Rate limits:** client-side respect for 429 + `Retry-After` (chat/vision lanes are 20/min; outbox honors Retry-After on replay).
10. **Vision confirm recoverability (blocking-issue fix):** today a second `POST /meal-photos/:jobId/confirm` throws bare `CONFLICT {status}` (`vision/router.ts:400-403`) — a mobile client that lost the 201 response cannot learn which MealLog was created, dead-ending or duplicating. One-line delta: include the confirmed `mealLogId` in the CONFLICT details, mirroring the chat-draft confirm which already returns `loggedMealId` on conflict. Client fallback until it lands: reconcile by fetching the day's meal logs and matching on `visionJobId` (field exists on MealLog).

**Explicitly rejected backend work:** push notifications (none exist server-side; reminders are client-local via WorkManager — `POST_NOTIFICATIONS` runtime permission, notifications channel per reminder type, honoring the `reminders` consent bit), delta-sync endpoints (wholesale catalog refresh is fine at this corpus size), GraphQL/BFF layers.

---

## 7. Phased build plan

Each phase ends with: `./gradlew ktlintCheck test assembleDebug` green + android-CLI emulator smoke (human-reviewed screenshot + layout diff vs Figma reference — CI asserts semantics/layout, never pixels) + demo-account walkthrough (`demo@aquazero.fit` seeded with 14 days of history).

### Phase 0 — Foundation (scaffold + CI)
- `android init`; `android create --name=AquaZeroFit --output=apps/android empty-activity-agp-9`; `android sdk install platforms/android-37 build-tools/36.0.0`; `android studio version-lookup` to pin the catalog.
- Repo integration: `apps/android/` with its own Gradle root (NOT an npm workspace); root `.gitignore` additions; version catalog; ktlint + detekt; `-Werror`.
- CI: GitHub Actions Linux job — lint → unit tests → assembleDebug → (nightly) emulator smoke via android CLI → bundleRelease on tags. Upload-key signing config via secrets; Play App Signing holds the app key.
- App IDs: `applicationId fit.aquazero.app` (register the package name in Play Console early — required by the Sept 30, 2026 developer-verification regime).
- Deliverable: empty themed app boots on emulator; CI green.

### Phase 1 — Design system + network/auth core
- `core/designsystem`: full theme, type (bundled fonts), motion, ~15 foundational components with `@Preview`s verified via `render-compose-preview` against `design/figma/*/screen.png`.
- `core/network`: DTOs mirroring `packages/shared/src/types.ts` (single source: keep a `CONTRACT.md` mapping DTO↔TS type; error envelope `{code,message,details?}`), auth interceptor, single-flight Authenticator, SSE client, 429 handling.
- `core/auth`: token vault (Keystore AEAD + DataStore), session manager, login/register/reset flows against dev server.
- Screens: Welcome, SignIn (+ password rules checklist, reset), FirstRun, Setup form.
- Backend delta 3 (Play Integrity path) lands here, behind a server flag; closed-testing builds may use the interim exemption.
- Deliverable: full auth lifecycle on device incl. token rotation across process death; 15-min access expiry exercised in an integration test.

### Phase 2 — Nutrition core, offline-first (the hard center)
- `core/database` (Room 3) + `core/sync` outbox engine + WorkManager workers + connectivity monitor.
- Dashboard (rings, macro bars, water card one-tap +250ml optimistic, sparkline, suggest-meal card in degraded-tolerant form), Nutrition day view (day switcher + calendar, meal timeline CRUD, food search sheet with recent/frequent offline cache, grams stepper, copy-previous), LogWeight (canonical-kg submission, unit toggle, clamp advisory toast), water/weight/meal offline writes with airplane-mode acceptance tests.
- Local `DailyNutrition` recompute for offline ring correctness.
- **Room schema discipline from the first migration-bearing commit:** `exportSchema=true` with schemas in VCS, `MigrationTestHelper` tests in CI, destructive fallback forbidden (§4.2).
- Deliverables: (a) log meals/water/weight in airplane mode → reconnect → outbox drains → server state identical to an online run (verified against `GET /analytics/nutrition/daily`); (b) outbox correctness tests: edit-of-`IN_FLIGHT`-create produces create+PUT with distinct keys, replayed DELETE `NOT_FOUND` treated as success, >20h-old in-flight ops reconcile before resend.

### Phase 3 — Camera: photo meal logging + barcode
- `CaptureMealScreen` (CameraX Compose viewfinder, meal-type chips prefilled by `mealTypeForNow`, torch, gallery import via **Photo Picker**, client-side downscale ≤10MB, JPEG/PNG/HEIC validation).
- Upload worker → `POST /meal-photos` → `AnalysisResultsScreen` (1s poll while queued/processing, seed-once editable list, per-gram ratio recompute, confidence chips, add/remove/rename, **confirm gate with exact copy**, failed→manual escape, idempotent confirm guard, "AI estimate" disclaimer).
- `BarcodeSheet` (MlKitAnalyzer EAN-8/13/UPC, torch, manual EAN fallback, Nutri-Score badge, deterministic allergen warning, OFF attribution).
- Deliverable: end-to-end photo→confirm→log on device against dev server incl. HEIC and >10MB rejection paths; barcode scan of a real EAN.

### Phase 4 — Training
- WorkoutLibrary (paged exercise search + filters, detail sheet with CC-BY-SA attribution, plan strip, plan-generation sheet → `POST /plans/generate` online-only with deterministic-fallback tolerance), WorkoutDetail overview (resolved targets, swap flow).
- Guided session: work/rest/summary phases, RingProgress countdown, keep-screen-on, per-set actuals, a11y live-region announcements, **session state in SavedStateHandle + Room draft so process death mid-workout loses nothing** (deliberate upgrade over web), completion → invalidations + achievement toast + ShareMoment.
- Exercise media cached via Coil disk cache for offline library browsing.
- Deliverable: complete a full guided session with process-kill mid-workout recovery test.

### Phase 5 — Coach + gamification
- Coach chat: SSE streaming (frames `token|done|error` with `SAFETY_INPUT|SAFETY_OUTPUT|AI_UNAVAILABLE`), history from Room offline, wellness disclaimer banner, SafetyFrame for guardrail responses, crisis signpost, suggested prompts, **long-press Report** (Play AI-GC compliance), MiniMarkdown.
- Chat meal drafts: explicit "log this as a meal" button (never inferred), server-persisted drafts survive process death, per-item opt-in (ambiguous = nothing preselected), allergen acknowledgement checkbox, confirm/dismiss.
- CoachSelect (9 personas, level-gated, NO purchase UI), reactions with ack-after-composition (never burn a celebration unseen), LevelBar/XP breakdown ("banked" framing, never "you need N more"), AkinStage mascot with full animation choreography + haptics, level-up celebration moment (brand-color confetti only).
- Deliverable: streamed conversation with meal-draft confirm on device; guardrail paths exercised against the eval-tested dev server.

### Phase 6 — Progress, challenges, settings, account lifecycle
- Progress (range chips, weight chart with goal line, kcal bars, macro donut, consistency card — "recovering/steady", never "broken streak"), achievements grid, insight card with deterministic-fallback rendering, export (share sheet for JSON/CSV from `GET /export/diary`).
- Challenges (create/join by `AQUA…` code, peek deep link), App Links for the deep-link payloads worth keeping (`join_challenge`, `log_meal`, `water_add`) minus the Telegram transport.
- Settings: profile editing (target recompute display), consents (4 granular toggles gating AI personalisation/memory/analytics/reminders), Memory screen (facts CRUD, optimistic with rollback), NotificationSettings → real local reminders (WorkManager + notification channels, gated on `reminders` consent + `POST_NOTIFICATIONS`), entitlements/Plan read-only screen, legal links via Custom Tabs, **in-app account deletion** (two-step flow with grace-period messaging), data export.
- Deliverable: full account lifecycle on device — register → consent → use → export → delete.

### Phase 7 — Hardening + polish
- Accessibility pass: TalkBack on every screen, 48dp targets, contrast audit (dark-only theme), live regions in session/chat, reduced-motion audit.
- Performance: baseline profile generation, R8 release build audit (`analyzeReleaseR8Config`), startup < 1.5s cold on mid-range, Compose recomposition audit on Dashboard/Nutrition.
- Offline torture: outbox replay across reboot, clock skew, 429 storms (honor Retry-After), token-family revocation mid-drain.
- Error-state sweep: every screen's `ErrorState`/`EmptyState`/`Skeleton` verified via android CLI screenshot diffs.
- Security review: no tokens in logs, `android:allowBackup` decision (off, or backup rules excluding vault), certificate pinning decision (recommend: no pinning v1, HSTS-backed TLS only), R8 keep rules audit.

### Phase 8 — Release engineering + Play submission
1. Play Console: developer account verification complete (org account w/ D-U-N-S if available — skips the 12-tester/14-day gate; personal account otherwise accepts it), package name registered, app created. **Re-verify `answer/17125096` (Sept 30, 2026 regime) and the org-account carve-out at Phase 8 start** — a policy shift there changes account-setup lead time.
2. Store listing: Health & Fitness category, screenshots from `docs/screenshots` regenerated on-device, no medical claims anywhere in copy.
3. **Data safety form** — declared from the audit (§9 of codebase report): Personal info (email, name); Health & fitness (health info: nutrition/allergens/hydration; fitness info: workouts, weight); Photos (meal photos — collected-and-deleted, encrypted in transit, user-deletable); App activity; no sharing; no ads SDKs. Must match privacy policy and observed traffic exactly.
4. **Health apps declaration**: "Activity and Fitness" + "Nutrition and Weight Management" only — never medical categories (also keeps personal-account eligibility).
5. **AI-GC policy**: report control demoed in review notes.
6. Account deletion declared: in-app path + the new web URL (§6.6).
7. Content rating (IARC): health & fitness, discloses AI chatbot + user interaction where asked.
8. App access: permanent demo credentials for reviewers (dedicated reviewer account, not `demo@aquazero.fit` if that's dev-only).
9. Target API 36 confirmed; AAB via `bundleRelease`; Play App Signing enrolled; internal testing → closed testing (12 testers × 14 days with genuine engagement evidence if on a personal account) → production.
10. Post-launch: crash triage plan (add a crash SDK ONLY after adding it to the Data safety form — candidate: Firebase Crashlytics, or skip at v1 for a zero-SDK declaration).

---

## 8. Google Play compliance summary (from live-doc study)

| Regime | Status for this app | Why |
|---|---|---|
| Data safety section (`answer/11416267`) | **APPLIES** | Declare health/fitness data, photos, personal info; §7 Phase 8.3. |
| Play Console Requirements eff. 2026-09-30 (`answer/17125096`) | **APPLIES** | Verified identity, registered package, complete listing, demo creds. Org-account mandate does NOT hit (wellness ≠ Medical/HSR). |
| Restricted-scope verification | **AVOIDED** | No Google OAuth scopes at all. Do not add Google Sign-In without re-review. |
| Google Health API verification (CASA, $500–4500, user cap) | **AVOIDED** | No Google Health/Fitbit API. Health Connect also skipped v1 (separate regime, also avoided). |
| Google Pay disclosures | **AVOIDED** | No payments; future digital goods must use Play Billing anyway. |
| Photo & Video permissions policy | **SATISFIED BY DESIGN** | Photo Picker + CameraX; no `READ_MEDIA_*`. |
| AI-Generated Content policy | **APPLIES** | In-app report control (exists server-side), guardrails (exist + eval-tested), estimate disclaimers. |
| Target API policy | **APPLIES** | targetSdk 36. |
| Account deletion | **APPLIES** | In-app exists; web URL to add (§6.6). |
| Health apps declaration | **APPLIES** | Fitness + Nutrition categories only. |

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Windows dev machine: `android emulator` disabled | Android Studio AVD locally; android-CLI emulator loop runs in Linux CI; WSL fallback documented. |
| Toolchain freshness (AGP 9 / Room 3 / Nav 3 are all young) | Versions pinned via `version-lookup` at scaffold time; Phase 0 proves the full build before feature work. |
| Turnstile blocks native registration | §6.3 Play Integrity path; interim flag limited to closed testing. |
| Offline recompute drift vs server "code calculates" | Local recompute limited to display; server values overwrite on fetch; contract tests compare local vs server math on the same inputs. |
| SSE over OkHttp behind mobile networks | Precise fallback (per verified server behavior): the assistant message is persisted **before** the `done` frame, so a dropped stream is recoverable by polling `GET /chat/sessions/:id/messages` for a **new assistant message** (not message-count — the user message persists even on error paths). But the `AI_UNAVAILABLE` path and a server crash mid-generation persist **nothing** — so the poll is bounded: ~4 attempts over ~15s, then release the "awaiting reply" state and render the calm error with a retry affordance. |
| Rate-limit lanes (20/min chat/vision) vs retry logic | Outbox + workers honor `Retry-After`; user-facing actions debounced. |
| DTO drift from `packages/shared` | `CONTRACT.md` mapping + a CI job that diffs the TS types file hash and fails when it changes without a Kotlin-side acknowledgement. |
| AGPL §13 | Settings "Source code" link to the repo (reachable in-app requirement carried from web). |
| Closed-testing gate (personal account) | Recruit 12+ real testers early (Phase 6 timeframe), gather documented feedback for the production-access application. |
| HEIC decode variance | Server already re-encodes; client validates by decode-attempt and shows the "Most Compatible" iOS guidance copy equivalent for problem files. |

## 10. Explicit non-goals for v1
Health Connect, Google Sign-In, payments/Play Billing, push notifications (server-side), tablets/large-screen optimization beyond sane defaults, Wear OS, iOS, widget/glance surfaces, per-coach voice audio, prompt/eval changes, any `/api/v1` breaking change.

## 11. Definition of done (v1)
1. All Phase 0–8 deliverables green; `npm run verify` (API) untouched and green.
2. Airplane-mode logging parity test passes (Phase 2 acceptance).
3. Product invariants §5 verified by instrumented tests (confirm gates, XP monotonicity, no-red-for-gain snapshot tests).
4. Play pre-launch report clean; Data safety form matches a network-traffic capture of a full session.
5. Closed-testing track live with the compliance declarations accepted by Play review.
