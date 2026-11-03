# AquaZeroFit Android — Enterprise Security & Architecture Decisions

**Date:** 2026-11-03 · **Companion plan:** [`docs/ANDROID_ENTERPRISE_READINESS_PLAN.md`](../ANDROID_ENTERPRISE_READINESS_PLAN.md)

This document records the engineering decisions and implemented controls for Phase 2 (`EN-2.1`, `EN-2.2`, `EN-2.3`) and Phase 3 (`EN-3.3`, `EN-3.4`) of the Android Enterprise Readiness Plan.

---

## 1. Device-Side Security Controls (`EN-2.1`, `EN-2.2`, `EN-3.3`)

### 1.1 Optional App Lock (`EN-2.1`)
- **Implementation:** [`MainActivity.kt`](../../apps/android/app/src/main/java/fit/aquazero/app/MainActivity.kt) and [`EnterpriseSecurityPolicy.kt`](../../apps/android/app/src/main/java/fit/aquazero/app/core/security/EnterpriseSecurityPolicy.kt).
- **Behaviour:** Off by default for consumer installs. Users can enable **Require device unlock** under **Settings → Device security**, or an enterprise MDM administrator can force it on via the `force_app_lock` managed restriction.
- **Mechanism:** `MainActivity` records `SystemClock.elapsedRealtime()` in `onStop()` (ignoring configuration changes). On `onStart()`, if `effectiveAppLockEnabled` is `true` and at least `300` seconds (5 minutes) have elapsed in the background, `KeyguardManager.createConfirmDeviceCredentialIntent` prompts for the device biometric or screen lock credential.
- **Session & Cache Preservation:** Cancelling the prompt backgrounds the task (`moveTaskToBack(true)`) without calling `authRepository.forceLogout()` or `LocalCachePurger`, so unsynced outbox items and the active session are preserved for the returning user.

### 1.2 Screen-Capture & Recents Protection (`EN-2.2`)
- **Implementation:** [`MainActivity.kt`](../../apps/android/app/src/main/java/fit/aquazero/app/MainActivity.kt), [`SettingsScreen.kt`](../../apps/android/app/src/main/java/fit/aquazero/app/feature/settings/SettingsScreen.kt), and [`DeviceSecurityController`](../../apps/android/app/src/main/java/fit/aquazero/app/core/security/EnterpriseSecurityPolicy.kt).
- **Behaviour:** Off by default. Users can toggle **Block screenshots & recents preview** in **Settings → Device security**, or an MDM policy can force it on via `force_screen_capture_protection`. When active, `WindowManager.LayoutParams.FLAG_SECURE` is applied to the activity window, blanking the app in the Android recents switcher and blocking screenshots/screen recordings.

### 1.3 Managed Configuration (`EN-3.3`)
- **Schema:** [`apps/android/app/src/main/res/xml/app_restrictions.xml`](../../apps/android/app/src/main/res/xml/app_restrictions.xml), linked via `<meta-data android:name="android.content.APP_RESTRICTIONS" android:resource="@xml/app_restrictions" />` in [`AndroidManifest.xml`](../../apps/android/app/src/main/AndroidManifest.xml).
- **Supported Keys:**
  - `force_app_lock` (`bool`, default `false`): Forces device-credential unlock after 5 minutes in the background and disables the user toggle in Settings.
  - `force_screen_capture_protection` (`bool`, default `false`): Forces `FLAG_SECURE` on the window and disables the user toggle in Settings.
  - `disable_data_export` (`bool`, default `false`): Disables the local JSON data export share action in Settings (`SettingsViewModel.exportData()`).
  - `allowed_email_domain` (`string`, default `""`): Optional organisation email domain restriction (`ManagedRestrictions.isEmailAllowed`).
- **Consent Invariant (`CONTRIBUTING.md`):** Managed configuration may **only restrict** device behaviour. `ManagedRestrictions.fromMap` reads exclusively the four keys above and ignores any consent-shaped keys (`wellnessDataProcessing`, `aiPersonalisation`, `anonymisedAnalytics`, `reminders`, `foodPhotoTraining`). Covered by [`EnterpriseSecurityPolicyTest.kt`](../../apps/android/app/src/test/java/fit/aquazero/app/core/security/EnterpriseSecurityPolicyTest.kt).

---

## 2. ADR-EN-2.3: Room Database Encryption at Rest (`azf.db`)

### Status
**Decided (2026-11-03):** Rely on Android OS File-Based Encryption (FBE) + Hardware Keystore (`RefreshTokenVault`) + App Lock (`EN-2.1`) + Table-Complete Account Purge (`EN-1.3`). Do **not** bundle SQLCipher in the standard Play release.

### Context
`AzfDatabase` (`azf.db`) caches meal logs, water logs, weight history, training plans, coach chat history, and offline outbox entries inside the application's private sandbox (`/data/user/0/fit.aquazero.app/databases/azf.db`). Authentication refresh tokens are stored separately in `RefreshTokenVault`, encrypted with AES-256-GCM using a hardware-backed Android Keystore master key and excluded from cloud backup and device-to-device transfer (`backup_rules.xml`, `data_extraction_rules.xml`).

### Trade-off Analysis

| Dimension | OS File-Based Encryption (FBE) + Keystore | SQLCipher (`sqlcipher-android`) |
|---|---|---|
| **At-rest protection (locked device)** | Hardware-backed AES-256-XTS per-file encryption tied to the user's lockscreen credential on all Android 10+ devices (and mandatory under enterprise MDM compliance policies). | AES-256-CBC page encryption using a passphrase stored in Android Keystore. |
| **At-rest protection (unlocked device)** | Sandbox-isolated (`MODE_PRIVATE`, SELinux per-app UID) + guarded by `force_app_lock` (`EN-2.1`) after 5 minutes idle. | Keystore passphrase must be unlocked and held in process memory while the app runs; a root attacker on an unlocked device can dump the key from memory in both designs. |
| **APK / AAB size impact** | **0 KB** additional native binaries. | **+4.8 MB to +7.2 MB** across `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` native `.so` libraries (~25% increase over theminified APK). |
| **Cold-start latency** | **0 ms** overhead. | **+35 ms to +80 ms** on first query due to PBKDF2 key derivation and native SQLite initialization. |
| **Room 3 driver compatibility** | Uses Room 3's first-party `AndroidSQLiteDriver` with single-thread `queryCoroutineContext`. | Requires a `SupportSQLiteOpenHelper.Factory` bridge that bypasses `AndroidSQLiteDriver`. |

### Decision
Keep `azf.db` on standard SQLite via `AndroidSQLiteDriver` protected by OS File-Based Encryption (FBE), `RefreshTokenVault` hardware Keystore encryption for credentials, `LocalCachePurger` (verified across all 23 tables by `LocalCachePurgerTest`) for shared-device account switching, and `force_app_lock` (`EN-2.1`/`EN-3.3`) for unattended unlocked devices. Revisit SQLCipher only if a regulated customer contract explicitly requires application-layer FIPS 140-3 database encryption.

---

## 3. ADR-EN-3.4: Corporate TLS Inspection & `network_security_config.xml`

### Status
**Decided (2026-11-03):** Retain `<certificates src="system" />` only in production builds; require enterprise web gateways to exempt `aquazerofit.com` from MITM TLS inspection.

### Context
[`apps/android/app/src/main/res/xml/network_security_config.xml`](../../apps/android/app/src/main/res/xml/network_security_config.xml) enforces `cleartextTrafficPermitted="false"` and trusts only `<certificates src="system" />`.

### Behaviour Under Corporate TLS Inspection
1. When a corporate proxy intercepts TLS traffic using a private root CA installed in the Android **user** certificate store (`src="user"`), Android's `X509TrustManager` rejects the certificate chain with `SSLHandshakeException: Trust anchor for certification path not found`.
2. Adding `<certificates src="user" />` to the production manifest would weaken security for every consumer user by allowing any user-installed certificate (including ad-blockers, local proxies, or social-engineered profiles) to intercept health and authentication traffic.
3. Certificate pinning remains declined for the reasons documented in `network_security_config.xml` (lack of an out-of-band pin kill-switch and automated rotation telemetry).

### Decision
- **Production builds (`release`):** Trust `<certificates src="system" />` only.
- **Enterprise network guidance:** Enterprise IT administrators deploying AquaZeroFit behind a TLS-inspecting proxy must add `aquazerofit.com` to the proxy's SSL/TLS inspection bypass list.
