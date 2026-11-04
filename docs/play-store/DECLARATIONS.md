# Google Play — "Set up your app"

App **AquaZeroFit** (`fit.aquazero.app`) · LUMINARA DIGITAL PTY LTD
Console app id `4975561635774811714`. **Nothing reaches Google until
Publishing overview → Send for review.**

> **Corrections pending in Console (4 November 2026).** The Health, Data safety
> and deletion URL answers below were wrong when first submitted: the app reads
> sleep from Health Connect, requests the microphone, and the deletion URL was
> the support page. The corrected answers are marked **(changed)** here, and the
> paste-ready text for every declaration is in
> [PLAY_CONSOLE_DECLARATIONS_CHECKLIST.md](PLAY_CONSOLE_DECLARATIONS_CHECKLIST.md).
> Update Console to match before sending for review.

## Submitted

| Task | Answer | Basis |
|---|---|---|
| Privacy policy | `https://aquazerofit.com/google-play/privacy-policy` | Dedicated Play policy page, published (no draft banner since 4 November 2026); names the operator, covers collection, Health Connect, microphone, AI processing, photos, retention, deletion, APP rights |
| Ads | No | No ad SDK or network in the AAB; no third-party analytics beyond Firebase |
| Advertising ID | Not used | **Verified in the signed binary** — `tools:node="remove"` in the manifest, and `REJECTED` entries for `permission.AD_ID` in `build/outputs/logs/manifest-merger-release-report.txt` |
| Government apps | No | Private commercial app |
| Financial features | None of the listed | No lending, banking, wallets, transfers, crypto, trading or insurance. Financial advice is actively *refused* by the AI guardrails |
| Health **(changed)** | Activity and fitness · Nutrition and weight management · Sleep management | Workouts, meal/macro logging, hydration, weight. **Sleep is read:** `HealthConnectManager.kt` requests `READ_SLEEP` and shows last night's `SleepSessionRecord` duration on the Health Connect card; the earlier "NOT sleep" answer was wrong. Health Connect: read-only steps, heart rate, sleep, total calories burned, on-device display only (checklist §3). NOT mental health (refused and signposted out), NOT medication or physiotherapy (both refused) |
| App category | Health & fitness | Chosen over "Medical" deliberately — the app disclaims medical advice in 11 places and would fail a Medical review on its own terms |
| Contact details | `info@luminara.digital` · `https://aquazerofit.com` | Operator contacts already published on the live site |
| **Data safety** **(changed)** | Submitted with 14 data types; **two to add, one to correct** (below) | See below |
| **Content rating** | **Rated for 3+**, no descriptors, interactive element: In-app purchases | Category "All other app types". UGC answered No (no voice/text/image/audio exchange; the only cross-user text is a display name, now filtered). Online content answered **Yes** — IARC's own examples name AI-generated content |
| **Target audience** | 16-17 and 18 and over | Matches the Terms and `RANGES.age.min` |
| **Store listing** | **Complete and saved** | Name, short (76/80) and full (3,687/4,000) description, icon, feature graphic, 7 screenshots |

## Data safety detail

Encrypted in transit **Yes** · account creation **Username and password** only
(the Android app deliberately omits the Telegram lane) · delete account URL →
**`https://aquazerofit.com/account/deletion`** **(changed** from `/support`; the
dedicated page states how to delete from the app or a browser and what is
erased and kept, and is readable without JavaScript).

| Data type | Collected | Shared | Required | Purposes |
|---|---|---|---|---|
| Name | ✓ | ✓ | Required | App functionality, Personalisation |
| Email address | ✓ | ✓ | Required | App functionality, Account management |
| User IDs | ✓ | ✓ | Required | App functionality, Account management, Analytics |
| Other info (age, sex, timezone) | ✓ | ✓ | Optional | App functionality, Personalisation |
| Purchase history | ✓ | — | Optional | App functionality, Account management |
| Other in-app messages | ✓ | ✓ | Optional | App functionality, Personalisation |
| Photos **(changed: shared)** | ✓ | ✓ | Optional | App functionality, Analytics (food photo training, opt-in). Shared because photos go to the AI vision provider, like the health and message rows |
| Health info | ✓ | ✓ | Optional | App functionality, Personalisation |
| Fitness info | ✓ | ✓ | Optional | App functionality, Personalisation |
| Crash logs | ✓ | ✓ | Optional | Analytics |
| Diagnostics | ✓ | ✓ | Optional | Analytics |
| App interactions | ✓ | ✓ | Optional | Analytics, App functionality |
| Other user-generated content | ✓ | — | Optional | App functionality |
| **Voice or sound recordings (added)** | ✓ (processed ephemerally) | — | Optional | App functionality |
| **In-app search history (added)** | ✓ (processed ephemerally) | — | Optional | App functionality |
| **Device or other IDs** | ✓ | ✓ | Optional | Analytics |

**Device or other IDs is declared because the AAB ships Firebase Analytics +
Crashlytics** (`app/build.gradle.kts:307-308`), which produce an App Instance
ID, a Firebase Installation ID and a Crashlytics UUID. Collection is
consent-gated and off by default (`core/telemetry/TelemetryConsentGate.kt`),
which is why every Firebase-derived row is marked **Optional** — but gating
controls *whether* collection happens, not whether it must be declared.

**Health Connect data is not collected.** Steps, heart rate, sleep and calories
burned are read and displayed on the device only and never transmitted
(`HealthConnectRepository` has one consumer, the Settings card's view model).

**Voice recordings are now declared** (collected, processed ephemerally, not
shared). `CoachVoiceEngine.kt` hands the microphone to
`SpeechRecognizer.createSpeechRecognizer` (not the on-device variant) and
receives only the transcript, which lands in the composer for the user to edit.
The app never receives or stores audio, but Play scopes the question to the
microphone access itself, so leaving it undeclared (the earlier judgment call)
was the riskier answer. `PLAY_STORE_RELEASE_GUIDE.md` §4B already said so.

One judgment call worth revisiting:
- **Approximate location — not declared.** Firebase derives coarse geo from IP,
  but the app requests no location permission and Google's own Firebase
  disclosure guidance does not list it. Worth confirming against current guidance.

## All 11 setup tasks are complete

The dashboard's "Set up your app" section is gone and the release tracks are
unlocked. Everything sits in **Publishing overview → Changes not yet submitted
for review**.

**`Send app for review` is greyed out**, with: *"To send changes for review,
complete the required steps in the app dashboard."* That is not a paperwork gap
— it is the missing release. No AAB has been uploaded to a track, and the one
that exists cannot be used (see below).

## The remaining blocker is the build, not the console

Earlier builds compiled `API_BASE_URL = https://app.aquazero.fit/api/v1` into
`BuildConfig`. **`aquazero.fit` does not exist** — NXDOMAIN from both 1.1.1.1
and 8.8.8.8, and the parent domain is unregistered, not merely missing a
subdomain. Any AAB signed before the fix cannot reach the API.

The release build, the App Links intent filter (`AndroidManifest.xml:195`) and
`DeepLinkStore.kt:108` now all use `https://aquazerofit.com`, the Worker that
serves the web app and proxies `/api/*` to Cloud Run. Two steps remain:

1. **Rebuild and upload** — the origin is baked into the binary.
2. **App Links** — `apps/web/public/.well-known/assetlinks.json` carries only
   the upload key. Copy the Play App Signing SHA-256 (Play Console → App
   integrity → App signing key certificate), run
   `npm run assetlinks:add -- "<SHA-256>"`, commit, and redeploy the web app, or
   Android will not verify the link (checklist §9).
