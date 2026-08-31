# AquaZeroFit - Google Play Store Release & Deployment Guide

This document outlines the end-to-end process for building, signing, and deploying the **AquaZeroFit** Android application to the Google Play Store.

---

## 1. App Identity & Architecture

- **Application ID / Package**: `fit.aquazero.app`
- **Min SDK**: 26 (Android 8.0 Oreo)
- **Target SDK**: 36 (Android 16)
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
1. `apps/android/release.jks` (4096-bit RSA key, 25-year validity).
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

---

## 4. Google Play Console Setup & Declarations

### A. Data Safety Disclosures
When completing the Google Play Data Safety form:

| Category | Data Type | Usage | Optional / Ephemeral? |
| :--- | :--- | :--- | :--- |
| **Photos & Videos** | Photos (`CAMERA`) | Real-time meal logging & AI macronutrient estimation | Ephemeral; sent to vision API only when user snaps meal photo. |
| **Health & Fitness** | Fitness / Weight Info | Weight logging, training sets, calories & hydration tracking | Stored locally in encrypted Room database; synced to user account. |
| **Personal Info** | Name, Email | Account authentication and profile personalization | Required for account creation. |
| **Device & IDs** | Device ID | Push notification dispatch token | App functionality only. |
| **Audio** | Voice input | Dictating a message to the coach | Ephemeral; transcribed on-device by the platform recognizer, never uploaded or stored as audio. |

*All data in transit is encrypted over HTTPS/TLS 1.3 (`network_security_config.xml` strictly enforces `cleartextTrafficPermitted="false"`).*

### B. App Permissions Declaration
- `android.permission.CAMERA`: Used exclusively for capturing meal photos for AI nutritional breakdown.
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
  marking it *ephemeral / processed on-device* rather than collected. Do not
  leave it undeclared because no audio reaches the server. Play scopes the
  question to the permission and the microphone access itself.

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

Change all three together if your API lives on a different host (for example `https://api.aquazero.fit`), then cut a new version tag and rebuild. Debug builds use `http://10.0.2.2:4000` (emulator loopback to a local API on port **4000**).

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

Without credentials, billing routes answer `PAYMENT_UNAVAILABLE` and grant nothing. A purchase token is only trusted after Google confirms it.

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

---

## 6. Rollout Strategy

1. **Internal Testing**: Upload initial AAB to the Internal Testing track for QA and team verification.
2. **Closed Beta**: Test with 20+ testers for at least 14 days as required by Google Play policy for new developer accounts.
3. **Open Production Track**: Perform staged rollout (10% -> 25% -> 50% -> 100%) while monitoring Crashlytics error rates and Vitals.

### Closed testing checklist (before promoting past Closed Beta)

Run these on a **release** build against the production API, not debug:

| Check | What to verify |
| :--- | :--- |
| **App Links** | Host `/.well-known/assetlinks.json` on `https://app.aquazero.fit` with the Play App Signing SHA-256. Install the closed-track build, open a growth deep link (for example `https://app.aquazero.fit/join?code=AQUA…`), and confirm Android offers to open AquaZeroFit without a disambiguation sheet. |
| **Barcode scan (free)** | On Nutrition, scan a real packaged product barcode (EAN-13). Confirm GS1 check-digit validation, local mirror lookup, Open Food Facts fallback when needed, ODbL attribution on the result screen, and that logging still requires an explicit confirm tap. This path must work on the minified release APK; it was the surface broken by an earlier R8 strip. |
| **Sign-up + sync** | Register through the Turnstile WebView bridge, log a meal, and complete one outbox sync cycle. |
| **Billing (if live)** | Purchase or restore a subscription and confirm entitlement on cold start. |
