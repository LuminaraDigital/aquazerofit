# AquaZeroFit - Google Play Store Release & Deployment Guide

This document outlines the end-to-end process for building, signing, and deploying the **AquaZeroFit** Android application to the Google Play Store.

---

## 1. App Identity & Architecture

- **Application ID / Package**: `fit.aquazero.app`
- **Min SDK**: 26 (Android 8.0 Oreo)
- **Target SDK**: 36 (Android 16) - the one Play enforces
- **Compile SDK**: 37, and **JVM toolchain 17**. Neither affects the listing; both
  are here so a reader comparing this section against `build.gradle.kts:39` does
  not have to wonder whether the 37 is a mistake.
- **No product flavors and no `applicationIdSuffix`.** Debug and release install
  under the *same* package, so a debug build on the test device shadows the
  release one. Uninstall before verifying a release APK.
- **Architecture**: Modern Android Development (MAD): Jetpack Compose, Material 3, Room 3, Offline-First Outbox, SSE Streaming.

---

## 2. Release Signing Configuration

Google Play uses **Play App Signing**. You sign your upload bundle (`.aab`) with an upload key, and Google signs the delivered APKs with your master app key.

### Generating an Upload Keystore Locally

Run the automated helper script in PowerShell:

```powershell
.\apps\android\scripts\generate-release-keystore.ps1
```

This generates:
1. `apps/android/release.jks` (4096-bit RSA key, 10 000-day validity - roughly 27 years; `$ValidityDays = 10000` in the script).
2. `apps/android/keystore.properties` (auto-configured for Gradle builds).

> [!WARNING]
> Keep `release.jks` and its passwords backed up in a secure vault (e.g. 1Password / Bitwarden / HashiCorp Vault). Never commit `.jks` or `keystore.properties` to version control.

### Configuring Signing for CI/CD (GitHub Actions)

In your GitHub repository, create a **`release`** environment (Settings → Environments) with required reviewers, then add these **repository secrets**:

- `AZF_KEYSTORE_BASE64`: Your upload keystore file, base64-encoded (`base64 -w0 release.jks` on Linux, `certutil -encode release.jks release.b64` on Windows and take the payload line)
- `AZF_KEYSTORE_PASSWORD`: Keystore master password
- `AZF_KEY_ALIAS`: Key alias (e.g. `aquazerofit-release`)
- `AZF_KEY_PASSWORD`: Key password

The release workflow decodes `AZF_KEYSTORE_BASE64` to a temp file and sets `AZF_KEYSTORE_PATH` automatically. Do **not** store a path as a secret.

**Status (local machine):** the `release` GitHub environment exists and all four repository secrets are configured for `LuminaraDigital/aquazerofit`. Push `.github/workflows/android-release.yml` to the default branch before triggering a release.

### Restrict the Firebase Android API key

Project: `aquazerofit`. The key in `google-services.json` must be restricted to this app only.

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials?project=aquazerofit).
2. Edit the **Android key** used by Firebase (Browser key / Android key for `fit.aquazero.app`).
3. Under **Application restrictions**, choose **Android apps** and add:

| Field | Value |
| :--- | :--- |
| Package name | `fit.aquazero.app` |
| SHA-1 (upload key) | `17:A5:6E:5D:6E:76:A5:0B:F3:66:A6:EE:B4:7A:C0:80:0A:31:C9:E8` |
| SHA-256 (upload key) | `AD:0A:15:F4:73:6A:74:0C:D5:B5:CA:96:1A:FC:46:0F:FD:BB:ED:3E:B3:6D:76:18:F9:20:AB:60:F2:BB:8B:E5` |

4. Under **API restrictions**, limit to Firebase services the app uses (Analytics, Crashlytics, Installations).

If you enrolled in **Play App Signing**, also add Google's **app signing certificate** SHA-1 from Play Console → Setup → App signing (that fingerprint differs from the upload key above).

To print fingerprints from your local upload keystore:

```powershell
. .\apps\android\scripts\env.ps1
keytool -list -v -keystore apps\android\release.jks -alias aquazerofit-release
```

---

## 3. Building Production Artifacts

> [!WARNING]
> **A locally built bundle carries `versionCode 1`.** `build.gradle.kts:17-20`
> falls back to `versionCode = 1` / `versionName = "1.0.0"` unless you pass
> `-Pazf.versionCode` / `-Pazf.versionName` (or set `AZF_VERSION_CODE` /
> `AZF_VERSION_NAME`), so the commands below produce an artifact Play accepts
> **exactly once** - every later upload is rejected as a duplicate version code.
>
> Prefer the tagged CI path (`.github/workflows/android-release.yml`), which
> derives both from the git tag: a `v<major>.<minor>.<patch>` tag becomes
> `versionCode = MAJOR*10000 + MINOR*100 + PATCH` (so `v1.2.0` -> `10200`), and
> the workflow hard-fails if minor or patch reaches 100. Build locally for
> testing; cut a tag for anything you intend to upload.
>
> `apps/android/scripts/verify-release-readiness.ps1` exists - run it before
> either command.

### 1. Build Android App Bundle (.aab) for Google Play
From `apps/android`:
```powershell
.\gradlew.bat bundleRelease --no-daemon
```
Output location:
`apps/android/app/build/outputs/bundle/release/app-release.aab`

### 2. Build Universal Release APK (for direct testing/distro)
From `apps/android`:
```powershell
.\gradlew.bat assembleRelease --no-daemon
```
Output location:
`apps/android/app/build/outputs/apk/release/app-release.apk`

That filename only appears when signing is configured. Without
`keystore.properties` (or the CI env vars) the task emits
`app-release-unsigned.apk` instead - which is what the `packageRelease` guard in
`build.gradle.kts:204-225` and the `*unsigned*` check in CI both exist to catch.
If you see `-unsigned` in the name, signing did not happen; do not upload it.

---

## 4. Google Play Console Setup & Declarations

### A. Data Safety Disclosures
When completing the Google Play Data Safety form:

| Category | Data Type | Usage | Optional / Ephemeral? |
| :--- | :--- | :--- | :--- |
| **Photos & Videos** | Photos | Meal logging & AI macronutrient estimation. Captured with `CAMERA` (CameraX) **or** imported through the Android Photo Picker, then uploaded to `POST /meal-photos`. | Optional - only when the user logs a meal by photo. **Not ephemeral:** the server writes a resized copy to disk (`vision/router.ts`) and deletes it on confirm, on analysis failure, or by the 24-hour TTL sweep. Declare it collected, *not* "processed ephemerally". |
| **Health & Fitness** | Health / fitness info the user logs in the app: meals, hydration, weight, workouts | Tracking, targets, progress | Required for the core product. Cached locally in Room and synced to the account over HTTPS. |
| **Health & Fitness** | Health Connect reads: steps, heart rate, sleep, total energy burned | Drawn on the Health Connect card in Settings | **Not collected.** Read on-device for display only; never uploaded, never included in diagnostics, never shared. |
| **Personal Info** | Name, Email | Account authentication and profile personalisation | Required for account creation. |
| **Crash logs** | Stack traces and developer-authored breadcrumbs (Crashlytics) | Diagnosing failures the user should not have to report by hand | **Optional.** Off at process start; collected only after the user turns on *Anonymised analytics*. |
| **Diagnostics** | Firebase Analytics' automatic device/session data | Product analytics | **Optional.** Same consent switch. |
| **App interactions** | Firebase Analytics' automatic events (`first_open`, `session_start`, `screen_view`) | Product analytics | **Optional.** Same consent switch. The app defines no bespoke events of its own today - nothing injects `AnalyticsTracker`. |
| **Audio** | Voice input | Dictating a message to the coach | Ephemeral **as far as AquaZeroFit is concerned**: handed straight to Android's `SpeechRecognizer`, and the app receives only the transcript. See §4B for the caveat on where the platform transcribes it. |

*All data in transit goes over HTTPS; cleartext is refused outright (`network_security_config.xml` sets `cleartextTrafficPermitted="false"` and the manifest sets `android:usesCleartextTraffic="false"`).*

> [!WARNING]
> The local Room database (`azf.db`) is **not** encrypted at rest - there is no
> SQLCipher dependency and no `openHelperFactory` in `core/database/DatabaseModule.kt`.
> It relies on the Android app sandbox and platform disk encryption. Do not claim
> application-level encryption at rest anywhere in the listing or the privacy policy.

**Device & IDs: there is no push token.** The app ships **no** `firebase-messaging`
dependency (`gradle/libs.versions.toml`, `app/build.gradle.kts`) and no Kotlin
source references FCM. Every notification is composed locally by
`core/ui/reminders/ReminderNotifier.kt` and `core/service/WorkoutLiveService.kt`.
The app itself neither reads nor transmits a device or advertising identifier -
`google_analytics_adid_collection_enabled` is `false` in the manifest and the four
ad/attribution permissions are stripped at merge time (see §4C). The only
identifiers in play are the ones the Firebase SDKs mint for themselves once
consent is given (Analytics App Instance ID, Crashlytics installation UUID); if
you declare those, declare them **optional**, on the same footing as the three
telemetry rows above. That last point rests on Google's published Firebase Data
Safety guidance, not on anything in this repository - check it against the current
guidance before you tick the box.

**"Off by default" is not "undeclared".** Both Firebase SDKs are started disabled
by `<meta-data>` in `app/src/main/AndroidManifest.xml`
(`firebase_analytics_collection_enabled` / `firebase_crashlytics_collection_enabled`
set to `false`), and `core/telemetry/TelemetryConsentGate.kt` only ever switches
them on when the account's `anonymisedAnalytics` consent is true - a null or
signed-out consent row reads as "no". The user sets that switch under
**Settings -> Anonymised analytics**, and turning it off discards what has been
gathered and not yet sent (`resetAnalyticsData()` / `deleteUnsentReports()`).

Play's form asks what your app *can* collect, not what it collects for a user who
never opts in. Crash logs, Diagnostics and App interactions must therefore all be
declared, with **"Is this data collection optional?" answered yes** and "users can
choose whether this data is collected" ticked. Omitting them because the default is
off is the mistake this section exists to prevent; a reviewer who toggles the
Settings switch sees traffic the form denied.

### B. App Permissions Declaration
- `android.permission.CAMERA`: Two uses, both in Nutrition - capturing meal
  photos for AI nutritional breakdown (`CaptureMealScreen`), and the barcode
  scanner (`barcode/BarcodeScannerSheet`, ML Kit on-device; no frames leave the
  phone). Declare both; "meal photos only" understates it.
- `android.permission.INTERNET`: Required for backend synchronization and AI coach streaming.
- `android.permission.POST_NOTIFICATIONS`: Context-aware hydration reminders and workout notifications (user opted-in).
- `android.permission.VIBRATE`: Haptic feedback on timer and workout set completion.
- `android.permission.RECORD_AUDIO`: **Dangerous permission.** Requested at the
  point of use: only when the user taps the microphone in the coach composer,
  never at launch. Audio goes to Android's `SpeechRecognizer`; the app receives
  only the transcribed text and never records, retains, or transmits audio.
  Declining is fully supported: the composer stays usable by typing, and both
  the "not now" and the permanently-blocked cases show their own explanation
  (`coach_mic_denied` / `coach_mic_blocked`).

  In the Data safety form this means answering **yes** to collecting audio, and
  marking it *ephemeral* rather than collected. Do not leave it undeclared
  because no audio reaches the server. Play scopes the question to the
  permission and the microphone access itself.

  Do **not** state that the transcription happens on-device.
  `core/audio/CoachVoiceEngine.kt` calls `SpeechRecognizer.createSpeechRecognizer`
  and sets no `EXTRA_PREFER_OFFLINE`, so the platform recogniser is free to
  transcribe in the cloud - which is why the engine has an `ERROR_NETWORK` branch
  at all. What is true, and all that should be claimed, is that AquaZeroFit never
  receives, stores or transmits the audio itself (`onBufferReceived` is a no-op).
- `android.permission.ACTIVITY_RECOGNITION`: **Dangerous permission.** Declared
  as a *prerequisite* for the `health` foreground service type, not as a feature
  in its own right - the platform refuses to promote a `health`-typed service on
  API 34+ unless the caller holds one of that type's prerequisite permissions.
  Requested on the "Start workout" tap (`WorkoutSessionScreen`), never at launch.
  The session starts whether it is granted or refused; a denial costs only the
  lock-screen rest timer, and says so (`session_activity_denied` /
  `session_activity_blocked`).

  Nothing in the app reads the step-counter sensor - step counts come from
  Health Connect (`READ_STEPS`). Describe it as what it is: the permission that
  lets the workout session show an ongoing notification. A granted Health
  Connect `READ_HEART_RATE` satisfies the same prerequisite, so users who linked
  Health Connect keep the notification even after declining this prompt.
- `android.permission.FOREGROUND_SERVICE` + `android.permission.FOREGROUND_SERVICE_HEALTH`:
  Normal permissions, no runtime prompt. They back `WorkoutLiveService`, the
  ongoing rest-timer notification. See §4E for the Play Console declaration
  these now require.
- `android.permission.health.READ_STEPS`, `READ_HEART_RATE`, `READ_SLEEP`,
  `READ_TOTAL_CALORIES_BURNED` (`AndroidManifest.xml:36-39`): **Health Connect
  read permissions.** Granted in Health Connect's own UI, not by an Android
  runtime dialog, and only when the user links Health Connect from Settings.
  **Four reads, no write** - see §5F.5 for the Console declaration.

  In the Data safety form these are the one group that is *not* collected: they
  are read on-device for the Health Connect card in Settings, never uploaded,
  never included in diagnostics, never shared (§4A). That is a narrower claim
  than the rest of the form and it has to stay true - anything that later posts
  a Health Connect reading to the API turns this row from "not collected" into
  an undeclared health-data collection.

  Play also requires the permission-rationale screen these imply, declared
  twice: `.HealthPermissionRationaleActivity` for
  `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`
  (`AndroidManifest.xml:299-306`, pre-Android 14) and the
  `ViewPermissionUsageActivity` alias for `VIEW_PERMISSION_USAGE` +
  `CATEGORY_HEALTH_PERMISSIONS` (`:307-316`, Android 14+). Both are present;
  removing either fails review.

### C. Advertising identifiers: declare NONE

The app has no ads and no advertising ID. `firebase-analytics` nonetheless
merges four ad/attribution permissions into the manifest transitively
(`AD_ID`, `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`,
`BIND_GET_INSTALL_REFERRER_SERVICE`). Play Console reads the **merged**
manifest, so their presence alone would oblige an advertising-ID declaration
that is not true of this app.

They are therefore removed at merge time with `tools:node="remove"` in
`app/src/main/AndroidManifest.xml`. If a future dependency genuinely needs one,
delete its removal line deliberately **and update this form in the same
change** - the two must never drift apart.

### D. App access: reviewer credentials (required)

> [!WARNING]
> There is no guest mode. `AzfNavigation.kt` renders `PreAuthFlow` (Welcome ->
> Sign in) for `AuthState.SignedOut` and the tabbed shell only for
> `AuthState.SignedIn`, so **every** surface is behind an account. Submitting
> without App access credentials gets the release rejected with "we could not
> access your app".

Fill in **Play Console -> App content -> App access -> All or some functionality
is restricted**, with one entry:

| Field | Value |
| :--- | :--- |
| Access requirements | All functionality (sign-in required) |
| Username | the demo account's email address |
| Password | the demo account's password |
| Any other instructions | See the steps below |

Instructions to paste, adjusted for what you actually seed:

1. Launch the app, tap **Sign in** on the welcome screen, and enter the
   credentials above. No captcha, email verification or second factor is asked
   for on this path.
2. The five tabs (Home, Nutrition, Workouts, Progress, Coach) are then all
   reachable. Settings is the gear in the top bar; the subscription surface is
   **Settings -> Your plan**.

#### The account must be pre-created

Create the demo account yourself before you submit, and give the reviewer only
its credentials - never ask them to register.

`assertHuman` runs on `POST /auth/register` and `POST /auth/password-reset/request`
and on **nothing else**: `apps/api/src/modules/auth/router.ts` calls it at the top
of both handlers, while the `/auth/login` handler goes straight to
`loginSchema.parse`. The module comment in `apps/api/src/platform/botProtection.ts`
says so deliberately - sign-in is left unchallenged because the per-email lockout
and the per-IP auth lane already cover it. So an existing account signs in with no
Turnstile interaction at all, whereas a reviewer sent through **Get started** would
land in the WebView captcha bridge and could plausibly fail it.

The Android client reinforces this: `SessionManager.login()` sends only email and
password, while `SessionManager.register()` carries a `captchaToken`.

Two operational cautions:

- **Complete onboarding once on the demo account.** The Home tab branches on
  `hasProfile`; an account with no profile gets `FirstRunScreen` rather than the
  dashboard. Set targets once so the reviewer sees the real product.
- **Do not rotate the password after submitting, and test the credentials
  yourself last.** Five consecutive failures lock that email address for 15
  minutes (`MAX_FAILURES` / `LOCKOUT_MS` in `apps/api/src/modules/auth/service.ts`),
  which a reviewer reads as a broken app.

#### Production env vars that sign-in depends on

Login itself needs no captcha configuration - see §5B for the variables and why
they are boot-fatal. Mapping them to this section:

| Variable | Affects login? | Affects registration? |
| :--- | :--- | :--- |
| `TURNSTILE_SECRET_KEY` / `TURNSTILE_SITE_KEY` | No | Yes - and the API refuses to boot in production without **both**, so in practice a running production API always has them |
| `AUTH_ALLOW_CAPTCHALESS_MOBILE` | No | Yes - and it is boot-fatal in production, so it can never be the reason a reviewer gets through |

What login genuinely requires is the API being up and durable: `JWT_ACCESS_SECRET`
and `DATABASE_URL` from §5D. Without `DATABASE_URL` the store falls back to JSON
files and the demo account disappears on the next deploy - mid-review.

#### Premium entitlement for the demo account

Not required to *reach* the subscription surface: **Settings -> Your plan** renders
for a free account, showing the tier, the locked premium lanes and the Play offers
(`feature/settings/PlanEntitlementsScreen.kt`). A reviewer can see and exercise the
purchase flow without any grant.

Be precise with the reviewer about what that surface does, because it is no longer
a single buy button. `PlanEntitlementsScreen.kt:450-497` draws **two** selectable
cards - **Annual**, carrying a `SAVE %d%%` badge and a **7-day free trial** badge
when Play reports a zero-price phase, and **Monthly** - and
`PlanEntitlementsViewModel.kt:36` defaults the selection to `PlanPeriod.ANNUAL`.
A reviewer who taps the CTA without changing anything therefore starts the
**annual** plan, on a free trial if one is configured, not a monthly charge. Say
so in the App access notes: a reviewer expecting a small monthly charge who meets
an annual trial reads the mismatch as a dark pattern.

Grant premium only if you want the reviewer to see the unlocked lanes without
transacting. The admin route is:

```http
POST /api/v1/admin/users/:id/premium
{ "action": "grant", "days": 30, "reason": "Play review demo account" }
```

Find `:id` with `GET /api/v1/admin/users`. The router is mounted at `/admin`
(`apps/api/src/modules/index.ts`) behind `requireAuth, requireAdmin, requireFreshMfa`,
so you must call it as an admin whose authenticator has been used recently - which
is the practical consequence of `MFA_REQUIRE_ADMIN=true` in §5D. The grant is
audited with your admin id and the `reason` string; use one that identifies the
submission.

### E. Foreground service types declaration (required)

Play Console -> App content -> **Foreground service types**. Any app targeting
Android 14+ that declares a foreground service must declare its types here, and
this app declares exactly one: `WorkoutLiveService`, typed **`health`**.

Fill it in as: an ongoing notification carrying the live rest-timer countdown and
its +30s / skip actions to the lock screen and shade during a workout, started by
the user's "Start workout" tap and stopped when the session ends. Play asks for a
short screen recording; record the workout session screen with the shade pulled
down over it, showing the countdown ticking and one action tap landing.

> [!WARNING]
> This declaration replaced an earlier **`specialUse`** one whose free-form
> subtype string read "Live workout tracking and rest timer". If any draft of
> that declaration still exists in Console, delete it. `specialUse` is
> hand-reviewed against the rule that it is only for cases no other type covers,
> and the platform's own description of `health` - "long-running use cases to
> support apps in the fitness category such as exercise trackers" - describes
> this service exactly, so the old subtype string handed a reviewer the argument
> for rejecting it. The manifest comment above the `<service>` block records this
> so nobody reverts it.

The type change is why `ACTIVITY_RECOGNITION` is now in §4B: the platform refuses
a `health` promotion without a prerequisite permission. Declare that permission
and this service type together - they exist for each other, and a form that
mentions one without the other reads as unexplained.

---

## 5. Production backend handshake

The Play Store build talks to your live Node.js API. Configure the server **before** you invite testers, or sign-up and subscriptions will fail even though the AAB installs cleanly.

### A. Android production URLs (Gradle)

Release builds bake these into `apps/android/app/build.gradle.kts`:

| BuildConfig field | Current release value |
| :--- | :--- |
| `API_BASE_URL` | `https://app.aquazero.fit/api/v1` |
| `MEDIA_BASE_URL` | `https://app.aquazero.fit` |
| `WEB_BASE_URL` | `https://app.aquazero.fit` |

Change all three together if your API lives on a different host (for example `https://api.aquazero.fit`), then cut a new version tag and rebuild.

Debug builds point `API_BASE_URL` and `MEDIA_BASE_URL` at `http://10.0.2.2:4000` (emulator loopback to a local API on port **4000**) but deliberately keep `WEB_BASE_URL` on `https://app.aquazero.fit`, so the legal pages, support and captcha bridge resolve without a local web server running. Do not "correct" that to loopback.

On the server, set matching public URLs:

```env
APP_PUBLIC_URL=https://app.aquazero.fit
CORS_ORIGINS=https://app.aquazero.fit
PORT=4000
```

Do **not** set `PORT=4040` on production. The repo standard is 4000 (`config.ts`, `docker-compose.yml`, `.env.example`).

### B. Bot protection for Android sign-up (required today)

Play Integrity is the durable path, but the decode call in `apps/api/src/platform/botProtection.ts` is **not wired yet**. Even with integrity env vars set, auth **falls through to Cloudflare Turnstile**.

Set on production:

```env
TURNSTILE_SECRET_KEY=...
TURNSTILE_SITE_KEY=...
AUTH_ALLOW_CAPTCHALESS_MOBILE=false
```

The API **refuses to boot** in production without both Turnstile keys or with `AUTH_ALLOW_CAPTCHALESS_MOBILE=true`. The Android client solves Turnstile through its WebView captcha bridge (`WEB_BASE_URL/mobile/captcha`).

Prepare Play Integrity for when the decoder lands:

```env
PLAY_INTEGRITY_ENABLED=true
PLAY_INTEGRITY_PACKAGE_NAME=fit.aquazero.app
```

Until `verifyPlayIntegrity()` decodes Google tokens, these vars alone do not bypass Turnstile.

### C. Google Play billing (subscriptions)

> [!WARNING]
> **Blocking pre-condition for any track where someone will test a purchase.**
> With either `PLAY_SERVICE_ACCOUNT_JSON` or `PLAY_PACKAGE_NAME` unset,
> `playBillingConfigured()` is false and `POST /billing/play/verify` throws
> `PAYMENT_UNAVAILABLE` (`apps/api/src/modules/billing/play.ts`), which the shared
> error table maps to **HTTP 503** (`packages/shared/src/errors.ts`). Google has
> already taken the purchase by then. The client maps 503 to
> `BillingFailure.VERIFY_UNAVAILABLE` and shows *"Google took the purchase, but we
> could not confirm it just yet…"* - and because the app only acknowledges to
> Google **after** verification succeeds, the purchase is auto-refunded after three
> days. A reviewer sees a paid subscription that never activates.
>
> Nor does the buy button hide itself. The server advertises
> `GET /billing/config -> { play: { available } }` for exactly that purpose, but no
> Android source reads it, so the offer renders regardless. Set these variables
> before you invite anyone who will test billing.

This is a **server-configuration** prerequisite, not a client defect. The Android
side degrades correctly: `feature/settings/PlanEntitlementsViewModel.kt` maps every
`BillingFailure` to its own string - `plan_upgrade_play_unavailable` when Play
itself is unusable or the product is missing, `plan_upgrade_verify_later` for the
503 above, `plan_upgrade_rejected` for a 402 verdict, `plan_upgrade_offline`,
`plan_upgrade_failed`. Nothing crashes and nothing silently grants; the flow simply
never completes.

A purchase token is only trusted after Google confirms it - a missing credential costs a sale rather than giving one away.

**Minimum (purchase verification on subscribe):**

```env
PLAY_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
PLAY_PACKAGE_NAME=fit.aquazero.app
```

**How to obtain the service account:**

1. Google Cloud Console: create a service account and download its JSON key.
2. Play Console: **Users and permissions** → invite that account with **View financial data** (and subscription management as needed).
3. Paste the entire JSON as **one line** in `PLAY_SERVICE_ACCOUNT_JSON`. Escaped `\n` in the private key is supported.

**Recommended (prompt refund / revoke handling):**

```env
PLAY_RTDN_SECRET=<your-random-secret>
```

Wire a Pub/Sub push subscription to your Real-time Developer Notifications endpoint with that secret. Renewals still work without RTDN (the app re-verifies on launch), but refunds and revocations may not revoke premium promptly without it.

See `.env.example` for the full variable list and comments.

### D. Other production boot requirements

`assertProductionSecrets()` in `apps/api/src/platform/config.ts` also requires:

| Variable | Purpose |
| :--- | :--- |
| `JWT_ACCESS_SECRET` | Auth token signing |
| `DATABASE_URL` | Postgres (JSON file store is dev-only) |
| `MFA_REQUIRE_ADMIN=true` | Admin routes (enrol every admin first) |
| `RESEND_API_KEY` + `MAIL_FROM` | Password-reset email delivery |
| `TELEGRAM_BOT_TOKEN` | Also boot-fatal in production, and the easiest to miss because nothing in the Android client touches it |
| `APP_PUBLIC_URL` | Set it here as well as in §5A - same value, checked at boot |
| `CORS_ORIGINS` | Boot refuses a `*` wildcard and any `http://` origin in production |

Together with the two Turnstile keys and the absent `AUTH_ALLOW_CAPTCHALESS_MOBILE`
from §5B, that is the complete boot gate. Any one of them missing means the API
does not start at all - the good failure mode, but only if you find out before a
tester does.

### E. Smoke test after deploy

```bash
curl https://app.aquazero.fit/health
curl https://app.aquazero.fit/ready
```

On an internal-testing build: sign up (Turnstile captcha), sync a meal log, and exercise a subscription purchase if billing is live.

### F. Competitive release checklist (Daily Energy Loop)

See [PLAY_STORE_COMPETITIVE_RELEASE_PLAN.md](PLAY_STORE_COMPETITIVE_RELEASE_PLAN.md) for the full P0/P1 implementation plan.

Before promoting past Closed Beta:

1. Set `ADAPTIVE_TARGETS=true` on the production API (see `.env.example`).
2. Deploy `apps/web/public/.well-known/assetlinks.json` on `https://app.aquazero.fit`. The repo ships the **upload key** SHA-256 (`AD:0A:15:…` in section 2). After Play App Signing is enabled, replace that fingerprint with the **Play App Signing certificate** from Play Console if they differ, then redeploy web.
3. Verify challenge invites open the app (or web fallback with Play Store CTA) via `https://app.aquazero.fit/challenges?code=AQUA…`.
4. Run release APK smoke: guided workout foreground notification, readiness chip on Home/Workouts, achievement share sheet.
5. Complete Health Connect Play Console declaration if shipping Health Connect in v1.
   Declare **four read types and no write type**: `READ_STEPS`, `READ_HEART_RATE`,
   `READ_SLEEP`, `READ_TOTAL_CALORIES_BURNED`. `WRITE_WEIGHT` was declared and
   requested until 2026-09-02 and never wrote a record; it was removed rather
   than wired up, so a declaration listing it would no longer match the
   manifest. Verify against the merged manifest, not this list, before filing.

---

## 6. Rollout Strategy

1. **Internal Testing**: Upload initial AAB to the Internal Testing track for QA and team verification.
2. **Closed Beta**: Test with **12+** testers for at least 14 days - the figure `docs/ANDROID_IMPLEMENTATION_PLAN.md:232` and `:266` also use. *(Google)* The requirement applies to new **personal** developer accounts; an organisation account may not face it at all, and the number has changed before. Confirm the current rule in Console before recruiting - see row 29.
3. **Open Production Track**: Perform staged rollout (10% -> 25% -> 50% -> 100%) while monitoring Crashlytics error rates and Vitals.

### Closed testing checklist (before promoting past Closed Beta)

Run these on a **release** build against the production API, not debug:

| Check | What to verify |
| :--- | :--- |
| **Billing credentials (blocking)** | Before inviting testers: confirm `PLAY_SERVICE_ACCOUNT_JSON` and `PLAY_PACKAGE_NAME` are set on the production API (§5C). `curl https://app.aquazero.fit/api/v1/billing/config` (unauthenticated) must return `{"play":{"available":true}}`. If it returns `false`, every purchase is charged, never granted, and auto-refunded after three days - do not let a reviewer or tester reach the upgrade button in that state. |
| **App access credentials (blocking)** | Play Console -> App content -> App access lists a working, pre-created demo account with a completed profile (§4D). Sign in with exactly those credentials on a clean install before submitting. |
| **App Links** | Host `/.well-known/assetlinks.json` on `https://app.aquazero.fit` with the Play App Signing SHA-256. Install the closed-track build, open a growth deep link (for example `https://app.aquazero.fit/challenges?code=AQUA…`), and confirm Android offers to open AquaZeroFit without a disambiguation sheet. |
| **Barcode scan (free)** | On Nutrition, scan a real packaged product barcode (EAN-13). Confirm GS1 check-digit validation, local mirror lookup, Open Food Facts fallback when needed, ODbL attribution on the result screen, and that logging still requires an explicit confirm tap. This path must work on the minified release APK; it was the surface broken by an earlier R8 strip. |
| **Sign-up + sync** | Register through the Turnstile WebView bridge, log a meal, and complete one outbox sync cycle. |
| **Billing (if live)** | Purchase or restore a subscription and confirm entitlement on cold start. |

---

## 7. Support runbook: a deleted account strands its Play subscription

This is a known, **unclosable-in-code** defect. It is written down here because
the first anyone hears of it is a refund request, and the reply has to be right
the first time.

### What the user reports

> "I paid but the app says I'm on the free plan."

Usually with a Play receipt attached, and usually after they mention deleting
their account and starting again.

### What actually happened

At purchase time the app hands Play an `obfuscatedExternalAccountId` — the
SHA-256 of the user id (`obfuscatedAccountIdFor`, `apps/api/src/modules/billing/play.ts:254`).
Google stores it against the subscription and echoes it back on every
verification for the life of that purchase. `POST /billing/play/verify` refuses
any purchase whose echoed identifier is not this caller's
(`apps/api/src/modules/billing/router.ts:85`).

Delete the account and sign up again and the user gets a **new** user id, so a
new hash. Google keeps echoing the old one. Every verification from the new
account therefore mismatches — and there is no way for us to rewrite the
identifier on a live purchase, so this does not heal with time, reinstalls, or
retries.

> [!WARNING]
> Do not "fix" this by relaxing the identifier check. It is the primary defence
> against one paid subscription serving two accounts. The fallback check
> underneath it (`play_purchase_token_rebind_refused`, `router.ts:115`)
> deliberately **skips** deleted accounts so this case is not double-refused,
> and the comment above it records that Google's own identifier still refuses
> it and only Play can re-issue the purchase. Weakening the check trades a rare
> support ticket for indefinite subscription sharing.

The three-day auto-refund does **not** rescue this user. That safety net only
covers purchases the app never acknowledged; theirs was acknowledged when it
verified successfully on the old account, so Play keeps billing monthly while
the app keeps showing the free tier.

### How support confirms it

| Where | What to look for |
| :--- | :--- |
| API logs | A `kind: "event"` line carrying `play_purchase_account_mismatch` with the **new** user's `userId` (emitted at `router.ts:86`). This is the confirming signal — it is emitted nowhere else. |
| Not these | `play_purchase_not_entitling` means the subscription is on hold, paused or expired — a different problem with a different answer. `play_purchase_token_rebind_refused` means the bound account still exists, i.e. genuine sharing or a shared device. |
| In the app | *"Google could not confirm that purchase, so it has not unlocked premium and we have not changed your plan…"* (`plan_upgrade_rejected`, `app/src/main/res/values/strings.xml:1238`), because `PURCHASE_INVALID` maps to HTTP 402 (`packages/shared/src/errors.ts:23`). The string now closes with *"If Google is still charging you for it, contact Support and we will work it out with you — it will not resolve on its own."* That is accurate for this case, and it is why the user is writing to you: it promises no refund and tells them to escalate. Answer with the resolution below rather than with reassurance. |
| Play Console | Order management → the purchase. Its account identifier will not match the SHA-256 of the current user id. |

### Resolution

There is no server-side grant that fixes this properly — granting premium by
hand leaves the user still paying Play for a subscription the app will never
verify. The only clean path runs through Play:

1. **Cancel** the existing subscription (the user does this from Play →
   Subscriptions; the app deep-links straight there via
   `ExternalLinks.PLAY_SUBSCRIPTION`).
2. **Refund** the unused portion from Play Console → Order management.
3. Have the user **re-subscribe on the new account**. That fresh purchase is
   stamped with the new user id's hash and verifies normally.

A goodwill admin grant (§4D) is reasonable to cover the gap between steps 1 and
3, with a `reason` naming this runbook — but it is a bridge, not the fix.

### Known gap: the app does not warn before deletion

The in-app deletion flow says nothing about an active subscription. The danger
zone at
`apps/android/app/src/main/java/fit/aquazero/app/feature/settings/SettingsScreen.kt:685`
renders `settings_delete_body`, `settings_delete_export_first` and
`settings_delete_dialog_body`, and none of those strings
(`apps/android/app/src/main/res/values/strings.xml:1056-1072`) mentions billing,
premium or Play. Neither does the web deletion route.

Closing this needs a change in that screen plus a new string alongside those —
shown only when the account holds a live Play entitlement — telling the user to
cancel in Play **first**. Until then the trap is reachable by any premium
subscriber in two taps, and support carries it.

---

## 8. First submission: the complete Play Console checklist

Everything Play Console requires before the **Submit** button unlocks for a
first release, in roughly the order Console presents it. Each row either points
at the section that already answers it, or is marked an **owner action** — a
decision or an upload with no code behind it.

This section exists because the material above is organised by *system*
(signing, backend, permissions) while Console asks by *form*, and the gap
between those two orderings is where a submission stalls.

> [!WARNING]
> Rows citing Google's published requirements rather than this repository are
> marked *(Google)*. Play's forms and asset specifications change; verify those
> against current Play Console guidance before filing. Everything else is
> traceable to a file in this repo.

### A. Account and app setup

| # | Requirement | Answer / where |
| :--- | :--- | :--- |
| 1 | Developer account verified, package `fit.aquazero.app` registered | **Owner action.** The package name is fixed (§1) and cannot change after the first upload. |
| 2 | Play App Signing enrolled; upload key backed up | §2. Read the app signing SHA-256 out of Console afterwards — it differs from the upload key, and both §5F.2 (`assetlinks.json`) and the Firebase key restriction depend on it. |
| 3 | AAB built at target SDK 36 | §1, §3. |

### B. Store listing

| # | Requirement | Answer / where |
| :--- | :--- | :--- |
| 4 | App category | **Health & Fitness** (`docs/ANDROID_IMPLEMENTATION_PLAN.md:225`). |
| 5 | Contact details: support email (required), website, phone | **Owner action.** No support address exists anywhere in the repo. Whatever Console carries must be the address reachable from `https://app.aquazero.fit/support`, which is what the app links users to (`ExternalLinks.kt:32`). |
| 6 | Privacy policy URL | `https://app.aquazero.fit/privacy` — `ExternalLinks.PRIVACY` (`ExternalLinks.kt:26`) resolved against `WEB_BASE_URL` (§5A); the route is served at `apps/web/src/App.tsx:91`. The app links to it in Settings, so a different URL in Console is a mismatch a reviewer can see. |
| 7 | App icon — 512×512 32-bit PNG *(Google)* | **Owner action.** Not present in `docs/`; export from the launcher icon source. |
| 8 | Feature graphic — 1024×500 *(Google)* | **Owner action.** No such asset exists in the repo. |
| 9 | Phone screenshots — 2 to 8, 16:9 or 9:16 *(Google)* | `docs/screenshots/*.png` are 780×1688 (390×844 at 2×, per `tools/screenshots/optimise.mjs`), which satisfies the ratio and the size bounds. Draw from `03-dashboard`, `04-nutrition`, `05-capture-meal`, `07-coach`, `08-workouts`, `09-progress`. Re-capture on-device before upload (`ANDROID_IMPLEMENTATION_PLAN.md:225`). |
| 10 | Short and full description | **Owner action.** One hard constraint: **no medical claims anywhere in the copy** (`ANDROID_IMPLEMENTATION_PLAN.md:225`). That phrasing is what keeps the app out of the medical health-app regime in row 18. |

### C. App content declarations

| # | Requirement | Answer / where |
| :--- | :--- | :--- |
| 11 | Privacy policy (App content's own copy of row 6) | Same URL as row 6. |
| 12 | App access | **Restricted — sign-in required for everything.** Pre-created reviewer credentials are mandatory; §4D. Blocking. |
| 13 | Ads | **No ads: declare none.** The four ad/attribution permissions Firebase merges in are stripped at merge time; §4C. |
| 14 | Content rating (IARC) questionnaire | **Owner action** — it can only be answered in Console. Two repo facts it will need: the coach is an **AI chatbot** with an in-app report control (long-press a reply — `strings.xml:606-610`, `ChatRepository.kt:94`), and buddy challenges show other members' `displayName` and progress to each other (`ChallengeDtos.kt:7-11`) while carrying **no free-text user-to-user messaging**. Answer the "user interaction" questions from those two, not from a guess. |
| 15 | Target audience and content | **Not designed for children.** The profile schema accepts ages from **16** upward (`packages/shared/src/constants.ts:50`, enforced at `packages/shared/src/schemas.ts:81`) and the privacy notice says so (`apps/web/src/pages/legal/Privacy.tsx`, §11 "Age"). Ticking any under-13 band pulls the app into the Families policy — do not. **Owner action:** the exact age bands. |
| 16 | Data safety | §4A — the longest form and the one most likely to be filled in wrongly. Note in particular that Crash logs, Diagnostics and App interactions must all be declared **optional**, never omitted because they are off by default. |
| 17 | Foreground service types | **One service, typed `health`** (`WorkoutLiveService`); §4E. Needs a screen recording, and any leftover `specialUse` draft deleted. |
| 18 | Health apps declaration | Declare **"Activity and Fitness"** and **"Nutrition and Weight Management"** only — never a medical category (`ANDROID_IMPLEMENTATION_PLAN.md` Phase 8.4). Health Connect does ship: **four read types, no write type** — `READ_STEPS`, `READ_HEART_RATE`, `READ_SLEEP`, `READ_TOTAL_CALORIES_BURNED` (`AndroidManifest.xml:36-39`); §5F.5. Verify against the merged manifest, not against this list. |
| 19 | Government apps | **No.** |
| 20 | Financial features | **None of these.** Play Billing subscriptions are declared as in-app products (row 23), not as a financial feature. |
| 21 | News apps | **No.** |
| 22 | Data deletion | **Both paths exist:** in-app under Settings → Delete account (`SettingsScreen.kt:676`, `DeletionCard`), and the web route `https://app.aquazero.fit/account/deletion` (`ExternalLinks.kt:39`) for people who no longer have the app installed. Declare both. See §7 for the subscription trap this flow does not warn about. |

### D. Monetisation

| # | Requirement | Answer / where |
| :--- | :--- | :--- |
| 23 | Subscription products | **Two products, not one.** `azf_premium_monthly` **and** `azf_premium_annual` (`PlayPurchaseRules.PREMIUM_MONTHLY_PRODUCT_ID` / `PREMIUM_ANNUAL_PRODUCT_ID`, `apps/android/app/src/main/java/fit/aquazero/app/core/data/BillingRepository.kt:59-63`), selected through `enum class PlanPeriod { MONTHLY, ANNUAL }`. Both ids are compile-time constants asserted by `PlayPurchaseRulesTest.kt:22-29`, and the monthly id is embedded in the Play cancellation deep link (`ExternalLinks.kt:55-57`), so Console must match both exactly. Create only one and the paywall renders a half-empty selector - `premiumOffers()` returns whichever product resolved and the missing card never draws. **If you want the 7-day free trial the UI advertises, configure a free-trial offer on the annual base plan:** `hasFreeTrial` is derived from Play's own pricing phases (`priceAmountMicros == 0L`, `BillingRepository.kt:312`), never hard-coded, so an unconfigured trial silently downgrades the CTA. |
| 24 | Subscription price and currencies | **Owner decision**, and one price per product. Nothing is hard-coded: the app renders whatever `formattedPrice` Play returns (`BillingRepository.kt:316`). The `$59.99` / `$9.99` pair at `PlanEntitlementsScreen.kt:660-678` is a Compose `@Preview` stub and the `£3.99` at `BillingRepository.kt:135` is a KDoc example - neither reaches a user. Price the annual plan so the `SAVE %d%%` badge reads as a genuine saving; it is computed from the two live prices, so a bad ratio ships a nonsense discount. |
| 25 | Play billing server credentials | **Blocking before anyone can test a purchase.** `PLAY_SERVICE_ACCOUNT_JSON` and `PLAY_PACKAGE_NAME` on the production API; §5C, verified with the `billing/config` curl in §6. |
| 26 | App pricing (free vs paid) | **Free, with in-app purchases.** Follows from row 23 and from the free tier rendering the plan surface without any grant (§4D). |
| 27 | Countries and regions | **Owner decision.** Nothing in the repo geo-restricts the app; the subscription must be priced in every country selected. |

### E. Release

| # | Requirement | Answer / where |
| :--- | :--- | :--- |
| 28 | Production backend configured and reachable | §5 in full. §5B (Turnstile) and §5D (boot secrets) are the ones that make sign-in fail for a reviewer; smoke test per §5E. |
| 29 | Closed testing served before production | §6 and its checklist. §6 and `ANDROID_IMPLEMENTATION_PLAN.md:232` now agree on **12+ testers × 14 days** (they previously said 20 and 12). That figure is Google's rule for new **personal** developer accounts, which an organisation account may not face at all, and it is not traceable to anything in this repo. **Owner action:** confirm the current number in Console *(Google)* before recruiting — the plan's own Phase 8.1 already instructs a re-check of this regime. |
| 30 | Release notes and rollout percentage | §6. Staged: 10% → 25% → 50% → 100%. |
| 31 | Version tag cut before the upload build | §3. `v<major>.<minor>.<patch>` on the default branch; CI validates it against `^v[0-9]+\.[0-9]+\.[0-9]+$` and derives `versionCode` from it. A bundle built without one carries `versionCode 1` and can be uploaded only once - the failure lands on your *second* release, not your first, which is why it belongs on this list. |
