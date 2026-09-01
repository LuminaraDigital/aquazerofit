# Play Store Competitive Release Plan

Production implementation plan for the Daily Energy Loop, P0 wiring, and deployment gates identified in competitive analysis (August 2026).

## Goal

Ship a unified Android experience where adaptive calories, workout readiness, session burn, meal trust, and coach narrative reference the same deterministic numbers, with explainability on every figure.

## Workstreams

### WS1: P0 wiring (ship blockers)

| ID | Item | Owner layer | Files | Acceptance |
|----|------|-------------|-------|------------|
| P0-1 | Health Connect in Settings | Android | `NavKeys.kt`, `AzfNavigation.kt`, `SettingsScreen.kt`, `AndroidManifest.xml` | Row visible; screen reachable; permissions declared |
| P0-2 | WorkoutLiveService | Android | `WorkoutSessionViewModel.kt`, `WorkoutSessionScreen.kt` | Foreground notification during WORK/REST; +30s/skip actions work |
| P0-3 | Readiness UI | Android + API | `ReadinessChip.kt`, `DashboardViewModel`, `WorkoutLibraryViewModel` | Protect/Maintain/Progress on Home and Workouts |
| P0-4 | Adaptive flag alignment | API + Android | `ADAPTIVE_TARGETS=true`, `ProgressViewModel.kt` | Progress card hidden when flag off; server targets authoritative |
| P0-5 | Brag card share | Android | `AchievementUnlockBanner.kt`, `CelebrationHost.kt`, Dashboard/Progress | Share intent on achievement unlock |
| P0-6 | Challenge deep links | Android + Web | `strings.xml`, `ChallengesScreen.kt`, `assetlinks.json`, web `Challenges.tsx` | Share URL includes `https://app.aquazero.fit/challenges?code=`; web reads `code` param |

### WS2: P1 Daily Energy Loop

| ID | Item | Files | Acceptance |
|----|------|-------|------------|
| P1-1 | `effectiveKcalBurned` merge | `DashboardUiState`, `DashboardScreen` | Offline session burn reflected in derivation row |
| P1-2 | Readiness + coach fetch | `DashboardData.kt`, `DashboardViewModel.kt` | `GET /plans/readiness` + `GET /coaches/progression` on refresh |
| P1-3 | DailyEnergyLoopCard | `DailyEnergyLoopCard.kt`, `DashboardScreen.kt` | Coach line + adaptive delta above hero ring |
| P1-4 | CelebrationHost on Home/Progress | `DashboardScreen.kt`, `ProgressScreen.kt` | Achievements show outside Coach tab |

### WS3: Deployment gates (before production promotion)

| Gate | Action | Verify |
|------|--------|--------|
| API env | Set `ADAPTIVE_TARGETS=true` on production API | `GET /me/targets` returns `adaptiveEnabled: true` after 7+ days data |
| App Links | Host `/.well-known/assetlinks.json` on `app.aquazero.fit` | Play App Signing SHA-256; no disambiguation sheet |
| Health Connect | Complete Play Console Health apps declaration | Only if Health Connect ship is in scope for v1 |
| Closed testing | 20+ testers, 14 days (new dev accounts) | Play Console policy |
| Release build | `./gradlew ktlintCheck detekt test bundleRelease` | CI green |
| Smoke | Sign up, log meal (photo confirm), complete workout, join challenge link | End-to-end on release APK |

## Environment variables (API production)

```env
ADAPTIVE_TARGETS=true
JWT_ACCESS_SECRET=<set>
DATABASE_URL=<set>
MFA_REQUIRE_ADMIN=true
RESEND_API_KEY=<set>
MAIL_FROM=<set>
```

## Rollout sequence

```
Week 1: P0-2, P0-3, P0-4, P0-6 (user-visible + growth)
Week 1: P1 Daily Energy Loop
Week 2: P0-5 brag share, P0-1 Health Connect (if verification timeline allows)
Week 2: Closed testing track upload
Week 3: Internal QA against smoke checklist
Week 4+: Staged production rollout (10% -> 100%)
```

## Post-launch (P2, same product track)

- Portion memory UX (`MealTrust.portionCorrectionWorthRemembering`)
- Canvas brag cards (1080x1350, AQF-23 spec)
- Squat form check (pose landmarker, squat-only)
- GLP-1 mode (protein floor + side-effect log)
- Health Connect data feeding readiness signals

## Product invariants (do not violate)

From `CONTRIBUTING.md`:

- Models identify; code calculates and enforces
- Confirm-first meal logging
- Allergen hard filter
- Append-only credit ledger
- Never bill degraded AI output

## Test matrix

| Area | Unit | Instrumented |
|------|------|--------------|
| Adaptive calculator | `AdaptiveExpenditureCalculatorTest` | - |
| Adaptive API flag | `adaptiveTargets.test.ts` | - |
| Progress gating | `ProgressViewModel` test | - |
| Deep links | `DeepLinkStoreTest` | Manual App Link |
| Brag card | `BragCardGeneratorTest` | Share chooser manual |
| Readiness | `readiness.test.ts` (API) | Dashboard compose |
| Workout live | ViewModel sync helper | Notification actions manual |

## Play Store copy (recommended)

**Short:** AI coach + adaptive targets + home workouts. Log meals in seconds. See why your numbers change.

**Screenshot order:** Dashboard rings with burn credited, meal trust confirm, target explain sheet, guided workout rest timer, coach chat, adaptive metabolism card, buddy challenge invite.
