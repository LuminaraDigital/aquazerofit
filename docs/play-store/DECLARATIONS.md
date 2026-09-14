# Google Play — "Set up your app"

App **AquaZeroFit** (`fit.aquazero.app`) · LUMINARA DIGITAL PTY LTD
Console app id `4975561635774811714`. **Nothing reaches Google until
Publishing overview → Send for review.**

## Submitted

| Task | Answer | Basis |
|---|---|---|
| Privacy policy | `https://aquazerofit.com/google-play/privacy-policy` | Dedicated Play policy page; names the operator, covers collection, AI processing, photos, retention, deletion, APP rights |
| Ads | No | No ad SDK or network in the AAB; no third-party analytics beyond Firebase |
| Advertising ID | Not used | **Verified in the signed binary** — `tools:node="remove"` in the manifest, and `REJECTED` entries for `permission.AD_ID` in `build/outputs/logs/manifest-merger-release-report.txt` |
| Government apps | No | Private commercial app |
| Financial features | None of the listed | No lending, banking, wallets, transfers, crypto, trading or insurance. Financial advice is actively *refused* by the AI guardrails |
| Health | Activity and fitness · Nutrition and weight management | Workouts, meal/macro logging, hydration, weight. NOT sleep (no sleep tracking — `sleep` in the codebase is a timer utility), NOT mental health (refused and signposted out), NOT medication or physiotherapy (both refused) |
| App category | Health & fitness | Chosen over "Medical" deliberately — the app disclaims medical advice in 11 places and would fail a Medical review on its own terms |
| Contact details | `info@luminara.digital` · `https://aquazerofit.com` | Operator contacts already published on the live site |
| **Data safety** | **Submitted** — all 14 data types | See below |
| **Content rating** | **Rated for 3+**, no descriptors, interactive element: In-app purchases | Category "All other app types". UGC answered No (no voice/text/image/audio exchange; the only cross-user text is a display name, now filtered). Online content answered **Yes** — IARC's own examples name AI-generated content |
| **Target audience** | 16-17 and 18 and over | Matches the Terms and `RANGES.age.min` |
| **Store listing** | **Complete and saved** | Name, short (76/80) and full (3,687/4,000) description, icon, feature graphic, 7 screenshots |

## Data safety detail

Encrypted in transit **Yes** · account creation **Username and password** only
(the Android app deliberately omits the Telegram lane) · deletion URLs →
`https://aquazerofit.com/support`.

| Data type | Collected | Shared | Required | Purposes |
|---|---|---|---|---|
| Name | ✓ | ✓ | Required | App functionality, Personalisation |
| Email address | ✓ | ✓ | Required | App functionality, Account management |
| User IDs | ✓ | ✓ | Required | App functionality, Account management, Analytics |
| Other info (age, sex, timezone) | ✓ | ✓ | Optional | App functionality, Personalisation |
| Purchase history | ✓ | — | Optional | App functionality, Account management |
| Other in-app messages | ✓ | ✓ | Optional | App functionality, Personalisation |
| Photos | ✓ | — | Optional | App functionality |
| Health info | ✓ | ✓ | Optional | App functionality, Personalisation |
| Fitness info | ✓ | ✓ | Optional | App functionality, Personalisation |
| Crash logs | ✓ | ✓ | Optional | Analytics |
| Diagnostics | ✓ | ✓ | Optional | Analytics |
| App interactions | ✓ | ✓ | Optional | Analytics, App functionality |
| Other user-generated content | ✓ | — | Optional | App functionality |
| **Device or other IDs** | ✓ | ✓ | Optional | Analytics |

**Device or other IDs is declared because the AAB ships Firebase Analytics +
Crashlytics** (`app/build.gradle.kts:307-308`), which produce an App Instance
ID, a Firebase Installation ID and a Crashlytics UUID. Collection is
consent-gated and off by default (`core/telemetry/TelemetryConsentGate.kt`),
which is why every Firebase-derived row is marked **Optional** — but gating
controls *whether* collection happens, not whether it must be declared.

Two judgment calls worth revisiting:
- **Voice recordings — not declared.** `CoachVoiceEngine.kt:127` uses
  `SpeechRecognizer.createSpeechRecognizer` (not the on-device variant), so audio
  reaches the platform recogniser. The app never receives or stores it — only the
  transcript — so this is treated as out of scope. Revisit if you ship your own
  recogniser.
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

`apps/android/app/build.gradle.kts:118` compiles
`API_BASE_URL = https://app.aquazero.fit/api/v1` into `BuildConfig`.
**`aquazero.fit` does not exist** — NXDOMAIN from both 1.1.1.1 and 8.8.8.8, and
the parent domain is unregistered, not merely missing a subdomain.

The same host is assumed by the App Links intent filter
(`AndroidManifest.xml:195`), `DeepLinkStore.kt:108`, `CORS_ORIGINS`, and the
in-app privacy/support/deletion links. Either register and point it at the same
origin as aquazerofit.com, or repoint all of the above — then **rebuild**,
because the URL is baked into the binary.
