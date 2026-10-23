# UX friction, staging safeguards, and retention telemetry

**Date:** 2026-09-14  
**Scope:** Web client, shared growth-event contract, CI/CD workflows, environment templates  
**Out of scope this pass:** Android Firebase event parity, live host provisioning, GitHub UI branch-protection clicks

This note records what changed, why it was necessary, and how to verify it. The companion runbook for the promotion path is [`BRANCHING_AND_STAGING.md`](./BRANCHING_AND_STAGING.md).

---

## Problem

Three product risks were stacking:

1. **Cognitive friction.** New users could land on a populated-looking dashboard with zero meals logged and no explicit next action. Setup validation surfaced as a single bottom alert. Accidental navigation dropped in-progress Setup and Coach composer text.
2. **Release risk.** CI already typechecked, tested, evaluated, and built on every push, but nothing enforced `feature/*` -> `staging` -> `main`, and there were no staging/production env templates. A green PR could still land on production without a staging soak.
3. **Blind retention.** Growth telemetry covered shares, challenges, and Telegram CTAs, but not onboarding completion, time-to-first-value, error surfaces, or form abandonments. Without those events, churn is guesswork.

The working assumption was that users should not need to invent the next step, and that code reaching production without staging validation is a release incident.

---

## What we did

### 1. Reduce first-session friction (web)

| Change | Why |
|---|---|
| Dashboard **Next step** callout when `kcalConsumed === 0` | An empty day previously looked “ready” (rings at zero) without telling the user what to do. First value in this product is logging a meal; the callout points at Nutrition and capture in one decision. |
| Setup validation moved **next to fields** (age, height, weight, goal, activity, consent) | A single footer error forces users to hunt. Field-adjacent copy matches the existing `Input` error affordance and cuts rework on the only mandatory onboarding form. |
| **Draft persistence** on Setup (first run) and Coach composer | Refresh or tab-hide should not erase half-finished biometrics or a typed coach message. Dirty drafts restore from `localStorage`; successful submit clears them. |

Loading and double-submit guards on meal log, AI suggest, and workout complete were already present and were left alone.

### 2. Enforce staging separation in the repo

| Artifact | Role |
|---|---|
| `.github/workflows/branch-safety.yml` | PRs into `main` must come from `staging`. Staging intake prefers `feature/*`, `fix/*`, `hotfix/*`. |
| `.github/workflows/deploy.yml` | On push to `staging` / `main`: re-run verify, build, and smoke. Optional remote smoke when Environment variables are set. |
| `.env.staging.example` / `.env.production.example` | Checklists that force disjoint `DATABASE_URL`, JWT, bots, Turnstile, mail, and Play credentials. |
| `scripts/smoke-check.mjs` + `npm run smoke` | Local: web `dist` + API entry. Remote: `/health` and `/ready` when `SMOKE_BASE_URL` or `APP_PUBLIC_URL` is set. |
| `docs/BRANCHING_AND_STAGING.md` | Operator checklist for GitHub branch protection and Environments. |

**Why this shape:** GitHub Actions can refuse the wrong PR base/head. It cannot configure protected branches or Environments by itself. Those remain a one-time operator step; the workflows are the machine-readable half of the same policy.

Existing `ci.yml` stays the universal quality gate on every branch. Deploy gates are additive, not a replacement.

### 3. Instrument the retention funnel

Extended `GROWTH_EVENT_NAMES` in `packages/shared` and routed events through the existing unauthenticated `POST /analytics/events` path (same budget and retention sweep as share telemetry).

| Event | Intent |
|---|---|
| `onboarding_completed` / `onboarding_skipped` | Completion vs bail on Setup |
| `first_value_meal` / `first_value_workout` | Time-to-first-value proxies (once per browser) |
| `error_encountered` | Load failures via `ErrorState` |
| `page_abandoned` | Dirty draft present when the tab hides |

Client helpers live in `apps/web/src/lib/retention.ts` and `useDraftPersistence.ts`. First-value events are gated once per browser so dashboards stay readable without a warehouse dedupe job; the server still accepts repeats if storage is cleared.

Wired at: Setup submit/skip, Nutrition add-meal, dashboard SuggestMeal, Coach meal confirm, WorkoutDetail complete, and `ErrorState` mount.

---

## Design decisions

- **Reuse growth events instead of a new analytics vendor.** The API already stores bounded, retention-swept growth events. Adding names to the shared enum keeps client and server in lockstep (the schema is derived from `GROWTH_EVENT_NAMES`).
- **Once-per-browser for conversion milestones.** Onboarding and first-value are funnel metrics; spamming them on every log would drown the signal.
- **Always-on for errors and abandons.** Those are friction signals; frequency matters.
- **No production deploy automation with real host credentials in-repo.** Secrets stay in GitHub Environments. The workflow warns and exits cleanly when URLs are unset so CI does not fake a deploy.
- **Web-first.** Android already has Firebase collection and solid pending/empty patterns. Parity for the new event names is a follow-up, not a blocker for the staging path.

---

## Files touched (summary)

- Shared: `packages/shared/src/types/coaches.ts` (event names)
- Web lib: `retention.ts`, `useDraftPersistence.ts` (+ tests)
- Web UI: `Setup.tsx`, `Dashboard.tsx`, `Coach.tsx`, `Nutrition.tsx`, `SuggestMealCard.tsx`, `WorkoutDetail.tsx`, `ErrorState.tsx`
- Ops: `.github/workflows/branch-safety.yml`, `deploy.yml`, `.env.*.example`, `.gitignore`, `package.json` (`smoke`), `scripts/smoke-check.mjs`, `docs/BRANCHING_AND_STAGING.md`

---

## Verification

**Verified in this work:**

- Unit tests for retention once-gating and draft restore/clear
- `apps/web` production build
- `npm run smoke` (local artifact mode)

**Operator still needs:**

1. Create and protect the `staging` branch; require `verify` + `promote-path` on `main`
2. Add GitHub Environments `staging` / `production` with disjoint secrets and public URL variables
3. Promote only via `staging` -> `main` PRs

**Follow-ups:**

- Mirror retention events on Android Firebase
- Run full `npm run verify` before merging a large batch
- Point `STAGING_PUBLIC_URL` at a real staging host so remote smoke becomes a hard gate

---

## How to reason about success

- **UX:** A new user with an empty day sees one clear next action and can recover Setup/Coach text after an accidental leave.
- **Release:** A PR from `feature/foo` into `main` fails Branch Safety; the same change must enter through `staging` first.
- **Retention:** Funnel queries can compare `onboarding_completed` vs `onboarding_skipped`, and measure delay until `first_value_meal` / `first_value_workout`, with `error_encountered` and `page_abandoned` as friction side channels.
