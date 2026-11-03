# AquaZeroFit Android — Production Readiness Report

**Date:** 2026-08-27 · **Commit:** `f9753a4` · **Branch:** `feat/android-app`

**Verdict: SHIP WITH FIXES.** No blocking defects found. The release build is
sound, the Play compliance surfaces are real rather than declared, and the
product invariants hold in code. The outstanding items are release-engineering
and on-device verification, not code defects.

---

## 1. Release build (R8 / minification)

Verified by running `assembleRelease`, not by inspection.

| Check | Result |
| --- | --- |
| `assembleRelease` | **BUILD SUCCESSFUL** at audit time, producing an *unsigned* APK. Since superseded — see the note below. |
| Release APK | `app-release-unsigned.apk`, **26.7 MB** (debug is 54.1 MB — shrinking is working) |
| `missing_rules.txt` | **Not generated** — R8 detected no missing keeps |
| kotlinx.serialization | **143 serializers retained**, 110 of them app DTOs, names preserved (`…$$serializer -> …$$serializer`) |
| Navigation 3 route keys | Serializers retained — type-safe routes survive minification |
| Retrofit interfaces | Obfuscated (`AuthApi -> rl`) which is correct: Retrofit needs the annotations and generic signatures, both kept |
| Room 3 | `-keep class * extends androidx.room3.RoomDatabase` present |
| Baseline profile | Generated into the release output |

The classic release-only crashes — a stripped `@Serializable`, a lost Retrofit
generic — are specifically ruled out by the mapping file rather than assumed.

**Both claims above were wrong, and running the build is what proved it.**
*(Corrected 2026-08-29.)*

The reasoning — "ruled out by the mapping file rather than assumed" — does not
hold. `missing_rules.txt` was indeed absent and 143 serializers were indeed
retained, and the minified build still failed at startup: R8 had stripped the
no-arg constructors of all three ML Kit `ComponentRegistrar` classes, which
Firebase's `ComponentDiscovery` instantiates reflectively from names in the
merged manifest. The mapping file showed each class kept and `getComponents()`
kept, with no `<init>` — visible, but only to someone looking for it.

R8 cannot statically detect reflective instantiation, so an empty
`missing_rules.txt` is evidence that R8 found no *statically reachable* gap.
It is not evidence that the app works. Only running it is.

Fixed by a keep rule in `proguard-rules.pro` written against the
`ComponentRegistrar` interface, verified three ways: `seeds.txt` shows the rule
matching all three classes, `usage.txt` shows none removed, and the minified
build launches on an emulator with zero `ComponentDiscovery` failures.

**The emulator claim was also false.** The `android` CLI emulator is not
disabled on Windows — `android emulator list` returns `Pixel_10a` and
`android emulator start` works. A smoke test of the minified build was
available the whole time and would have caught the defect above.

## 2. Play compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| Permissions minimal | **PASS with a note** | Source manifest declares exactly CAMERA, INTERNET, POST_NOTIFICATIONS, VIBRATE. The *merged* manifest adds four normal permissions injected by WorkManager: `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`. All are non-dangerous, need no runtime consent, and appear on no Play declaration form. |
| No media permissions | **PASS** | No `READ_MEDIA_*` anywhere; gallery import uses `PickVisualMedia` (the photo picker). |
| No location / storage / QUERY_ALL_PACKAGES | **PASS** | Absent from the merged manifest. |
| Foreground service type | **PASS** | None declared, and nothing calls `setExpedited`/`setForeground`, so the injected `FOREGROUND_SERVICE` is never exercised. Worth keeping true: on targetSdk 34+ starting an FGS without a declared type throws. |
| targetSdk 36 / minSdk 26 | **PASS** | Confirmed in the merged manifest. Meets the Aug 31 2026 Play requirement. |
| Cleartext traffic | **PASS** | `usesCleartextTraffic="false"` in the release manifest; the debug-only network config permits `10.0.2.2` alone. |
| Auth vault excluded from backup | **PASS** | `allowBackup="true"` but both `backup_rules.xml` and `data_extraction_rules.xml` exclude `datastore/azf_auth.preferences_pb`, and the filename matches the DataStore name `azf_auth`. Device-transfer is excluded too — the ciphertext would be useless off-device anyway, since the AES key is in hardware Keystore. |
| AI report control (AI-GC policy) | **PASS** | Long-press on an assistant message → `chatRepository.reportMessage`, with `onLongClickLabel` so it is reachable by TalkBack, not mouse-only. |
| In-app account deletion | **PASS** | Settings → two-step flow → `accountRepository.requestDeletion()`. |
| Deletion web URL | **PASS** | `ExternalLinks.ACCOUNT_DELETION` → `/account/deletion`, the page added server-side this session. |
| Privacy policy in-app | **PASS** | Settings row → Custom Tab to `/privacy`. |
| AGPL §13 source link | **PASS** | Settings → "Source code" row. |
| CC-BY-SA exercise attribution | **PASS** | Rendered on every list card and in the detail sheet (per-image credits + AI-media disclosure), not merely present in `strings.xml`. |
| ODbL Open Food Facts attribution | **PASS** | Rendered on barcode results. |

## 3. Product invariants (plan §5)

Each checked by reading the implementation, not the comments.

- **Nothing logged without confirmation — gate 1 (photo).** `AnalysisUiState.seeded`
  guards seeding; the list is populated once per job and re-entry returns early
  (`if (state.jobId == jobId && state.seeded) return`). No path commits without
  the explicit CTA.
- **Nothing logged without confirmation — gate 2 (chat draft).** An ambiguous
  line returns `ItemChoice(foodId = null, included = true)` *even when the
  server sends `suggestedFoodId`* — the comment is explicit that the invariant
  is "enforced here rather than assumed of the payload". Client-side
  enforcement, not trust.
- **Allergen acknowledgement.** Never pre-ticked, and `update()` sets
  `acknowledged = false` on *any* basket change, so re-selecting after ticking
  forces a fresh acknowledgement. (I initially suspected the `remember(draft.id)`
  key allowed a stale tick to survive a selection change; it does not — the
  reset lives in the mutation path.)
- **XP never decreases.** `MonotonicExperience.accept` ratchets `totalXp` and
  `level` with `max()`, and recomputes level *from the ratcheted total* rather
  than trusting the payload. It correctly distinguishes the legitimate
  midnight reset of "earned today" from a stale-snapshot drop.
- **No breakable streak.** Consistency is active-days-in-window; `ConsistencyCopy`
  is ported from the web and has no "broken" branch to render.
- **No red for weight gain.** Gain uses coral; the chart code carries the
  invariant in-line ("Coral, never red").

## 4. Code hygiene

| Check | Result |
| --- | --- |
| `TODO` / `FIXME` | **0** |
| `TODO()` / `NotImplementedError` stubs | **0** |
| Non-null assertions (`!!`) | **0** |
| `Log.*` / `println` in production code | **0** — so no token or PII leakage through logcat |
| Hardcoded user-facing strings | Only inside `@Preview` blocks |
| `runBlocking` | One occurrence, in `TokenAuthenticator` — **correct**: OkHttp's `Authenticator` is a synchronous interface, so blocking is required there. It also caps at one retry. |

## 5. Outstanding before submission

None of these are code defects.

1. **Run the release APK on a device.** *(Partly done 2026-08-29 — and it found
   a shipping defect; see §1.)* The minified build has now been launched on
   `Pixel_10a`: it starts, renders onboarding, and logs no ML Kit registrar
   failures since the keep rule landed. What remains is a **functional** pass
   behind a live API — sign-up, the barcode scanner specifically (it is the
   surface the R8 defect broke), meal capture, and a sync cycle. The claim that
   the emulator is unavailable on Windows was wrong; it works.
2. **Signing — now enforced.** *(Resolved after this audit was written.)* The
   release config used to attach a signing config only when a keystore existed,
   so `assembleRelease` printed BUILD SUCCESSFUL and emitted
   `app-release-unsigned.apk` — an artifact Play Console rejects — and the
   release workflow exported `AZF_KEYSTORE_PATH` without materialising a
   keystore for it to point at, so a tagged release would have gone green and
   shipped nothing usable. `packageRelease` now fails with "Refusing to package
   an unsigned release", verified by running it with no keystore present. CI
   still needs the `AZF_KEYSTORE_*` secrets and Play App Signing enrolment, and
   uploads should use `bundleRelease` (AAB) rather than the APK.
3. **Accessibility pass.** JVM tests only so far — no instrumented or TalkBack
   run. Content descriptions and live regions are present in code but unverified
   on device.
4. **Play Console paperwork** — Data safety form, Health apps declaration
   (Activity & Fitness + Nutrition and Weight Management only), IARC rating,
   reviewer demo credentials, and the closed-testing track if the developer
   account is a personal one created after Nov 2023.
5. **Known core gaps** carried from the feature waves, none user-blocking:
   `PlansRepository.todayWorkout()` overwrites in-session draft columns on
   refresh (worked around in the view model), `ProgressRepository` drops
   carbs/fat from trends so the macro donut stays empty, and a pending deletion
   is invisible after a token-refresh restart because `PublicUser` does not
   expose `deletionRequestedAt`.
