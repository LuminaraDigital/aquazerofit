# AquaZeroFit — Google Play Store Release & Deployment Guide

This document outlines the end-to-end process for building, signing, and deploying the **AquaZeroFit** Android application to the Google Play Store.

---

## 1. App Identity & Architecture

- **Application ID / Package**: `fit.aquazero.app`
- **Min SDK**: 26 (Android 8.0 Oreo)
- **Target SDK**: 36 (Android 16)
- **Architecture**: Modern Android Development (MAD) — Jetpack Compose, Material 3, Room 3, Offline-First Outbox, SSE Streaming.

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
  point of use — only when the user taps the microphone in the coach composer,
  never at launch. Audio goes to Android's `SpeechRecognizer`; the app receives
  only the transcribed text and never records, retains, or transmits audio.
  Declining is fully supported: the composer stays usable by typing, and both
  the "not now" and the permanently-blocked cases show their own explanation
  (`coach_mic_denied` / `coach_mic_blocked`).

  In the Data safety form this means answering **yes** to collecting audio, and
  marking it *ephemeral / processed on-device* rather than collected. Do not
  leave it undeclared because no audio reaches the server — Play scopes the
  question to the permission and the microphone access itself.

### C. Advertising identifiers — declare NONE

The app has no ads and no advertising ID. `firebase-analytics` nonetheless
merges four ad/attribution permissions into the manifest transitively
(`AD_ID`, `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`,
`BIND_GET_INSTALL_REFERRER_SERVICE`). Play Console reads the **merged**
manifest, so their presence alone would oblige an advertising-ID declaration
that is not true of this app.

They are therefore removed at merge time with `tools:node="remove"` in
`app/src/main/AndroidManifest.xml`. If a future dependency genuinely needs one,
delete its removal line deliberately **and update this form in the same
change** — the two must never drift apart.

---

## 5. Rollout Strategy

1. **Internal Testing**: Upload initial AAB to the Internal Testing track for QA and team verification.
2. **Closed Beta**: Test with 20+ testers for at least 14 days as required by Google Play policy for new developer accounts.
3. **Open Production Track**: Perform staged rollout (10% -> 25% -> 50% -> 100%) while monitoring Crashlytics error rates and Vitals.
