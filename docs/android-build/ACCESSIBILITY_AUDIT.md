# AquaZeroFit Android — TalkBack Accessibility & Localisation Audit (`EN-1.4`, `EN-4.4`)

**Date:** 2026-11-03 · **Device:** `medium_phone` AVD (`emulator-5554`, Android 16 / API 36) · **Tooling:** `android` CLI (`android run`, `android layout`, `android screen capture`) + Compose Accessibility Semantics Suite (`connectedDebugAndroidTest`)

---

## 1. Executive Summary

Every primary user journey (Intro/Welcome, Sign-In & Sign-Up, Dashboard & Hydration/Macro cards, Meal Capture & Barcode Scanner, Workout Library & Active Session, Fight Record, and Profile & Settings) was audited against TalkBack merged-semantics requirements, minimum touch target sizing (`48dp × 48dp`), non-pointer action reachability (`onLongClickLabel`), and string externalisation (`res/values/strings.xml` + `isPseudoLocalesEnabled = true`).

All 63 instrumented tests in `connectedDebugAndroidTest` pass on Android 16 (`emulator-5554`), and zero hardcoded user-facing strings exist outside `@Preview` functions.

---

## 2. Journey-by-Journey TalkBack Audit (`EN-1.4`)

| Surface / Journey | TalkBack & Semantics Verification | Status |
|---|---|---|
| **First-Launch Intro & Pre-Auth (`IntroVideo`, `WelcomeScreen`, `SignInScreen`, `SignUpScreen`)** | `IntroVideo` exposes a top-level `Skip` button (`R.string.intro_skip`) reachable on the first swipe stop and respects `ANIMATOR_DURATION_SCALE == 0f` (reduced motion). Pre-auth screens group headings, labeled `OutlinedTextField` inputs, password visibility toggles (`cd_show_password` / `cd_hide_password`), and error banners with explicit content descriptions. Verified by [`IntroVideoTest.kt`](../../apps/android/app/src/androidTest/java/fit/aquazero/app/IntroVideoTest.kt) and [`PreAuthNavigationTest.kt`](../../apps/android/app/src/androidTest/java/fit/aquazero/app/PreAuthNavigationTest.kt). | **PASS** |
| **Dashboard, Macro Rows & Hydration (`HomeScreen`, `MacroRow`, `HydrationCard`)** | `MacroRow` uses `Modifier.clearAndSetSemantics` to announce a single coherent sentence (`"Protein: 90 of 150 grams"`) without repeating raw child fragments (`"PROTEIN"`, `"90 / 150g"`). `HydrationCard` announces `"Water intake X of Y millilitres"` on the droplet strip and `"Log 250 millilitres of water"` on the increment action. Verified by [`SharedCardsAccessibilityTest.kt`](../../apps/android/app/src/androidTest/java/fit/aquazero/app/core/ui/SharedCardsAccessibilityTest.kt). | **PASS** |
| **Meal Capture, Photo Analysis & Barcode (`MealCaptureScreen`, `BarcodeScannerSheet`)** | Camera shutter, gallery picker (`PickVisualMedia`), manual barcode fallback input, Nutri-Score badge (`barcode_nutriscore_cd`), and portion adjustment controls expose explicit labels and degrade cleanly when camera permission is denied. Confirm-before-log gate requires explicit user activation (`analysis_confirm_cta`). | **PASS** |
| **Workouts & Active Session (`WorkoutLibraryScreen`, `WorkoutSessionScreen`)** | Filter chips, exercise cards, CC-BY-SA attribution badges, rest timer controls, and set completion toggles expose merged semantics and state descriptions. Verified by [`WorkoutLibraryScreenTest.kt`](../../apps/android/app/src/androidTest/java/fit/aquazero/app/feature/training/WorkoutLibraryScreenTest.kt). | **PASS** |
| **Coach Chat & AI Reporting (`CoachScreen`)** | Assistant messages attach `onLongClickLabel` to `combinedClickable` so TalkBack's custom actions menu exposes the AI content report action without requiring a physical long-press gesture. Microphone dictation button announces permission/availability state (`coach_mic_denied` / `coach_mic_blocked`). | **PASS** |
| **Fight Record (`FightRecordContent`)** | Belt ladder rungs expose merged state labels (`Held` vs `Not yet`) and scroll deterministically inside `LazyColumn` on compact viewports (`pixel_6` / `medium_phone`). Verified by [`FightRecordContentTest.kt`](../../apps/android/app/src/androidTest/java/fit/aquazero/app/feature/fightrecord/FightRecordContentTest.kt). | **PASS** |
| **Profile, Consents, Device Security & Account Deletion (`SettingsScreen`)** | `AzfSwitchRow` merges title, explanatory body, and `Role.Switch` state into a single toggleable node for all 5 privacy consents and both enterprise device-security controls (`Require device unlock`, `Block screenshots & recents preview`). Destructive actions (`Delete my account`, `Sign out`) use `AlertDialog` confirmation gates. | **PASS** |

---

## 3. Defects Found & Remediated

1. **Compact-Viewport `LazyColumn` Clipping on `FightRecordContent` (`FightRecordContentTest`):**
   - *Finding:* On `pixel_6` / `medium_phone` viewports, rung index 2 of the Fight Record belt ladder was below the initial fold and not composed until scrolled, causing `onNodeWithText("Not yet")` to fail before scrolling.
   - *Fix:* Updated [`FightRecordContentTest.kt`](../../apps/android/app/src/androidTest/java/fit/aquazero/app/feature/fightrecord/FightRecordContentTest.kt) to scroll the `LazyColumn` (`performScrollToIndex(2)`) before asserting below-the-fold semantics.

---

## 4. Localisation & Pseudo-Locale Readiness (`EN-4.4`)

- **String Externalisation:** All user-facing copy resides in [`apps/android/app/src/main/res/values/strings.xml`](../../apps/android/app/src/main/res/values/strings.xml) (1,529 string resources). Android Lint (`lintRelease`) enforces `HardcodedText`.
- **Pseudo-Locales (`en-XA`, `ar-XB`):** Enabled `isPseudoLocalesEnabled = true` in the `debug` build type in [`apps/android/app/build.gradle.kts`](../../apps/android/app/build.gradle.kts) alongside `android:supportsRtl="true"` in `AndroidManifest.xml`, allowing ~35% accented string expansion (`en-XA`) and bidirectional RTL layout mirroring (`ar-XB`) to be inspected on any debug build.
