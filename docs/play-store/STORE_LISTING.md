# Google Play — Default store listing

**Status: typed into the console but NOT saved.** Play refuses to save a listing
until the app icon, feature graphic and at least two phone screenshots are
uploaded, and those are file uploads I cannot perform. Everything needed is in
`docs/play-store/assets/`. The text below is the source of truth — if the
console tab was closed before saving, paste it back from here.

## App name (30 max)

`AquaZeroFit` — left as-is. It matches `app_name` in `strings.xml`, so the Play
title and the launcher label agree. A keyword-bearing variant such as
`AquaZeroFit: Calorie Coach` (26 chars) would carry more ASO weight, but
renaming the brand is a product decision, not a mechanical one.

## Short description (80 max — this is 76)

```
Photograph a meal and see it counted, with calorie, macro and water targets.
```

## Full description (4000 max — this is 3,687)

See the console, or regenerate from this file's history. Structure:
photo logging → targets you can verify → training → coach and its limits →
personas → offline behaviour → other features → privacy → the wellness
disclaimer verbatim → age.

Two claims were deliberately **cut** as unverifiable:
- **"Twenty-eight coach personas."** `CoachPersonas.kt` defines 28 ids, but only
  19 have art under `assets/coaches/`, and the KDoc at `CoachSelectScreen.kt:65`
  still says "nine fighters". A number in the listing that a reviewer can
  contradict by opening the screen is not worth the ASO.
- **Subscription and free trial.** `hasFreeTrial` is derived from Play's own
  pricing phases, so the claim only becomes true once a trial offer exists on
  the base plan in Console. Add it after that, not before.

Every retained number is traceable to `packages/shared/src/constants.ts`
(`KCAL_FLOOR`, `PROTEIN_G_PER_KG`, `FAT_KCAL_FRACTION_MIN`, `WATER_ML_PER_KG`,
`WEEKLY_LOSS_FRACTION`, `RANGES.age.min`, `BUDDY_CHALLENGE_MAX_MEMBERS`) and to
the Mifflin-St Jeor chain in `apps/api/src/modules/me/targets.ts`. The closing
disclaimer is `WELLNESS_DISCLAIMER` verbatim.

## Assets — all in `docs/play-store/assets/`

| File | Size | Notes |
|---|---|---|
| `play-icon-512.png` | 512×512 | Rendered from `ic_launcher_foreground.xml`, cropped to the adaptive safe zone so it matches the installed icon rather than looking shrunken |
| `feature-graphic-1024x500.png` | 1024×500 | Droplet is the icon geometry transformed, not redrawn. Text left of centre so Play's video overlay never covers it |
| `screenshots/01..07-*.png` | 1364×2424 | **Padded from 1080×2424.** The raw captures are 20:9 (0.446), taller than Play's stated 9:16 limit (0.5625); width is padded with the app's own `#0E1416` so no UI is cropped and the letterboxing is invisible |

Upload order for screenshots is the filename order. Rationale: #1 answers "what
is this app" in the search thumbnail, #2 and #3 must stay adjacent — the scan
earns attention, the confirm step converts anyone burned by an app that logged a
wrong number silently — and #4 is the trust close. Breadth comes after.

## Screenshots deliberately NOT used

- `screenshot.png` — **contains a real personal email address** on a sign-in screen.
- `coach-screen.png` — magenta UI-automation bounding boxes across the whole screen, and an error state.
- `food_search_results.png` — keyboard toolbar covering the results.
- `camera_real.png`, `photo_captured.png` — emulator camera pointed at the virtual living room, not food.
- `logged_barcode.png` — the Android launcher, not the app.
- `app_nutrition.png` — a loading spinner.
- `docs/screenshots/*` — these are 780×1688 captures of the **web** app; using them would misrepresent the native UI.

## Known gap worth closing before launch

All 51 candidate captures come from one QA run through nutrition and hydration.
There is no usable shot of Workouts, Progress, Coach chat, Coach select or
Challenges. Seven nutrition screenshots will read as a food logger that happens
to have a coach — which is not the positioning the description argues for.
Capturing three on device (guided session mid-rest, coach chat with the
disclaimer bar visible, coach-select roster) and slotting them at 5–7 would fix
it.
