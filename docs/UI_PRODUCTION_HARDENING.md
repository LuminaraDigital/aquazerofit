# UI production hardening: skeletons, tokens, a11y, and Android parity

**Branch:** `ui-a11y-production-hardening`  
**PR:** https://github.com/LuminaraDigital/aquazerofit/pull/26  
**Scope:** `apps/web`, `apps/android`, shared dependency audit fixes  

This note documents the production-readiness pass that moved the product UI from prototype loading and styling patterns toward stable, accessible, token-driven surfaces suitable for staged release.

---

## Problem

Several client surfaces still behaved like an early prototype:

1. **Loading** used full-page spinners. When data arrived, the real layout remounted and the page jumped (layout shift / poor perceived performance).
2. **Colour** mixed semantic intent with raw Tailwind palette classes and hex values (`text-emerald-400`, `#2fd9f4`, etc.). That breaks theme binding (including Telegram neutrals) and makes status chrome inconsistent.
3. **Copy** included AI-typical filler under section titles ("Fueling your aquatic performance", reminder taglines, coach subheaders). It added noise without helping the task.
4. **Accessibility** gaps remained on overlay sheets: Escape often worked, but Tab did not stay inside the dialog and focus was not restored to the trigger.
5. **Contrast** on muted text used opacity modifiers (`text-on-surface-variant/70`) that can fall below WCAG AA on the Deep Sea background.
6. **Android** still showed `CircularProgressIndicator` on auth/setup/settings cold paths and still shipped the same filler strings, while web had already moved toward skeletons and semantic roles.

Leaving these in place would block a clean staging promotion: CI already enforces high-severity dependency audits, Android ktlint, and a protected `staging` merge path.

---

## Goals

| Goal | Success criteria |
| --- | --- |
| Zero layout jump on cold load | Geometry-matched skeletons reserve the same space as hydrated content |
| One colour system | Status UI uses semantic tokens (`success` / `warning` / `info` / `error`), not raw greens/reds/ambers |
| Quieter UI | Remove redundant explanatory subheaders; keep legal, consent, and empty-state guidance |
| WCAG-oriented overlays | Focus trap, Escape dismiss, focus restore on nutrition and training sheets |
| Readable secondary text | Prefer full `on-surface-variant` (or `outline` for placeholders) over low-opacity muted text |
| Cross-client parity | Android Compose mirrors skeletons, semantic status colours, and purged filler strings |
| Ship via protected branch rules | Land through a PR into `staging` after CI |

---

## What we changed

### 1. Skeleton loading (web)

Extended `apps/web/src/components/ui/Skeleton.tsx` with layout-aware shells:

- `AuthGateSkeleton` - session restore / profile gate (replaces `PageSpinner` in `RequireAuth`)
- `DashboardSkeleton`, `NutritionSkeleton`, `ProgressSkeleton`, `CoachSkeleton`
- `SettingsSkeleton`, `SetupTargetsSkeleton`
- `RouteFallbackSkeleton` - React `Suspense` fallback in `App.tsx`

Shimmer respects `prefers-reduced-motion` (static tonal block instead of animation).

**Why:** Spinners communicate "something is happening" but not *what shape* is coming. Matching card/ring/list geometry keeps Cumulative Layout Shift near zero and makes the app feel already structured while queries resolve.

### 2. Semantic colour tokens (web + Android)

**Web**

- Added `--azf-success`, `--azf-warning`, `--azf-info` (and on/container pairs) in `apps/web/src/styles/index.css`
- Wired the same names through `tailwind.config.js` and `tokens.test.ts`
- Remapped status chrome (`AquaStatusline`, calendar legend, copy-yesterday icon) off raw palette classes
- Pointed `.cta-gradient` and `.lp-gradient-text` at CSS variables instead of hard-coded hex

**Android**

- Extended `AzfColors` and `AzfExtendedColors` / `LocalAzfExtended` with `success`, `warning`, and `info`
- Replaced auth/setup/settings spinner cold paths with Compose `Skeleton` layouts (`AzfNavigation`, `SetupScreen`, `SettingsScreen`)

**Why:** Product colour must stay brand-stable under Telegram theme binding and dark Deep Sea. Semantic roles also make reviews and future light-theme work cheaper: "this is a warning" stays a token, not a one-off amber hex.

### 3. Copy purge

Removed redundant subheaders and reminder taglines on web (meal plan, suggest meal, notifications, coach select, workout detail) and emptied or shortened matching Android string resources so switch rows hide blank bodies.

**Why:** Controls that already say "Meal reminders" do not need a marketing sentence underneath. Shorter chrome improves scan speed and removes an AI-prototype smell from screens users open daily.

### 4. Focus management (web)

Introduced `apps/web/src/lib/useFocusTrap.ts` and applied it to:

- Training `BottomSheet`
- `FoodSearchSheet`
- `BarcodeSheet`
- Nutrition edit-meal dialog

Behaviour: trap Tab inside the panel, dismiss on Escape, restore focus to the previously focused control.

**Why:** Overlay UIs that ignore keyboard focus are a WCAG failure and a real keyboard-user blocker. Native dialogs are expected to own the focus cycle for as long as they are open.

### 5. Contrast pass (web)

Systematically replaced readable `text-on-surface-variant/{50,70,80}` with full `text-on-surface-variant`, and placeholder muting with `placeholder:text-outline` / `text-outline` where appropriate.

**Why:** Opacity on already-muted tokens drops effective contrast under AA. Secondary labels still need to be readable on `#0E1416`.

### 6. CI / shipping fixes

PR CI failed on two production gates we then fixed on the same branch:

- **Android ktlint:** import order, unused imports, and indentation introduced while wiring skeletons
- **`npm run audit:prod`:** high-severity advisories on `multer` and `sharp` - bumped to `multer@^2.2.1` and `sharp@^0.35.4`

**Why:** Protected `staging` rejects direct pushes and requires a green `verify` path. Hardening UI without clearing those gates would leave the work stranded on a feature branch.

---

## Architecture notes

- **Web remains the design-token source of truth** for channel triplets (`--azf-*`). Android ports the same Deep Sea values in `AzfColors` so both clients stay visually aligned without sharing a runtime stylesheet.
- **Feature modules still must not import each other on Android.** Shared skeleton and form primitives stay in `core/designsystem` / `core/ui`.
- **PageSpinner is not deleted.** It remains available for rare full-screen waits; product routes that already know their chrome should prefer skeletons.

---

## Verification performed

- Web: `vitest` on design-token / RequireAuth / Settings anchor suites; `tsc --noEmit` clean after the pass
- Prod audit: `npm run audit:prod` passes at `--audit-level=high` after dependency bumps (remaining `qs` issues are moderate only)
- Delivery: changes pushed to `origin/ui-a11y-production-hardening` and opened as PR #26 into `staging`

Recommended follow-up before calling the surface "done": merge PR #26 after CI green, then spot-check cold loads and sheet keyboard behaviour on a staging deploy.

---

## Explicit non-goals (this pass)

- Full redesign of marketing landing structure (Hallmark page rebuild)
- Systematic remapping of every SVG chart hex to tokens (Progress charts / share cards still use some literal brand hex)
- Committing large local demo binaries under `docs/specs/` (left untracked on purpose)

---

## Summary

We treated loading, colour, copy, and focus as release blockers rather than polish. The result is a client that holds layout while data loads, speaks status through semantic tokens on both web and Android, keeps overlays keyboard-safe, and can enter protected `staging` through the normal PR and CI path.
