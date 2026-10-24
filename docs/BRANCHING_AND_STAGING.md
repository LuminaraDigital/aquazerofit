# Branching and staging

Promotion path for AquaZeroFit:

`feature/*` (or `fix/*`, `hotfix/*`, `chore/*`) -> `staging` -> `main`

Dependabot and Renovate use the same second hop: their branches merge into
`staging`, and production only receives them inside a `staging` -> `main`
pull request. Anything that skips staging is treated as a release incident.

## Why

CI (`.github/workflows/ci.yml`, job `verify`) runs on every push and pull
request: typecheck, coverage-gated tests, a blocking production dependency
audit, the safety eval, and build. A full-tree `npm audit` also runs and is
advisory only. That is necessary but not sufficient: integration against real
sandboxed keys, Turnstile hostnames, mail delivery, and Telegram webhooks only
happens in a staging deployment. Production must only receive commits that
already passed that environment.

## Required GitHub settings (operator)

These cannot live in the repo; configure them once in the GitHub UI:

1. **Branches**
   - Protect `main`: require a pull request, require status checks `verify`
     (workflow CI) and `promote-path` (workflow Branch Safety), dismiss stale
     reviews, no force push, no deletions.
   - Protect `staging`: require a pull request, require `verify`, no force
     push.
2. **Environments**
   - `staging` with optional reviewers; variable `STAGING_PUBLIC_URL`.
   - `production` with required reviewers; variable `PRODUCTION_PUBLIC_URL`.
3. **Secrets**
   - Staging and production secret sets are disjoint. Never copy
     `DATABASE_URL`, `JWT_ACCESS_SECRET`, bot tokens, Turnstile keys, Play
     credentials, Firebase Admin keys, or future `STRIPE_*` keys between them.

`verify` on a pull request is the CI job. Deploy Gates also has a job named
`verify`, but that workflow runs on push to `staging` / `main` and on
`workflow_dispatch`, not on pull requests. Require the pull-request checks
above. A green Deploy Gates run is not a substitute for the staging soak.

## What Branch Safety allows

`.github/workflows/branch-safety.yml` (job `promote-path`) is the CI twin of
the branch-protection rule:

| Pull request | Result |
|---|---|
| `staging` -> `main` | Pass |
| any other head -> `main` | Fail |
| `feature/*`, `fix/*`, `hotfix/*`, `chore/*`, `dependabot/*`, `renovate/*` -> `staging` | Pass |
| `main` -> `staging` | Fail (cherry-pick or revert forward) |
| any other head -> `staging` | Warning, then pass |

The warning exists so a one-off branch name is not a hard fail. Prefer the
prefixes above.

## Dependabot

`.github/dependabot.yml` sets `target-branch: staging` for the root npm
workspaces, `tools/docgen` npm, and github-actions. New pull requests from
those ecosystems should use `staging` as the base. `tools/docgen` keeps its
own monthly schedule and the same base.

GitHub reads `dependabot.yml` from the repository default branch (`main`).
The retarget starts only after this file is on `main`, which means it has to
ride a `staging` -> `main` promotion. Until that promotion, Dependabot keeps
opening pull requests against `main`.

Pull requests already open against `main` are not moved by the config change.
Do not close them as a batch. Each one fails Branch Safety while its base is
`main`, because the head is not `staging`. After reading the diff, either
change that pull request's base to `staging` (`dependabot/*` is an accepted
intake) or leave it until a replacement opens against `staging`.

As of 2026-10-23 these were still open against `main`: #13, #14, #20, #21,
#22, #23, #24, #31, #32, and #39. #33 was already closed (Dependabot replaced
it with #39). Re-check the list before acting. This paragraph is a snapshot,
not an instruction to close them.

## Environment files

| File | Purpose |
|---|---|
| `.env.example` | Local development defaults, plus commented placeholders |
| `.env.staging.example` | Staging isolation checklist |
| `.env.production.example` | Production isolation checklist |

Filled `.env`, `.env.staging`, and `.env.production` files are gitignored.

Commented names in `.env.example` (not a second secret store):

- `STRIPE_*`: read by the API for web Checkout. Staging gets test-mode keys
  and its own webhook endpoint and signing secret; production gets live ones.
- `VITE_FIREBASE_*` and `FIREBASE_*`: web client and Admin SDK. Hosting and
  Auth use Firebase project `aquazerofit` (see `.firebaserc`). Public ids in
  the comments match `apps/web/src/lib/firebase.ts`. Leave the API key and
  the service-account private key blank in git.
- `AZURE_OPENAI_*`: unused / reserved. The gateway does not read them.

## Workflows

| Workflow | Role |
|---|---|
| `ci.yml` | Every branch and pull request: typecheck, coverage tests, blocking production audit, advisory full audit, safety eval, build. Job name `verify`. |
| `branch-safety.yml` | Pull requests to `main` and `staging`. Job name `promote-path`. |
| `deploy.yml` | Push to `staging` / `main`, and `workflow_dispatch`. Re-runs typecheck, coverage tests, eval, build, and local smoke. It does not run the dependency audit. Then a `staging` or `production` environment job. |
| `android-verify.yml` / `android-release.yml` | Android gates. The promotion rules do not change them. |

Deploy Gates does not publish a host release by itself. Ship the image with
the host pipeline, then set `STAGING_PUBLIC_URL` or `PRODUCTION_PUBLIC_URL`
on the matching GitHub Environment. Remote smoke runs `scripts/smoke-check.mjs`
only when that variable is set. When it is unset the job warns and exits 0.
That is a missing URL, not a failed deploy. This document does not change
that behaviour.

## Smoke

```bash
npm run build
npm run smoke                 # checks local dist artifacts
SMOKE_BASE_URL=https://staging.example.com npm run smoke
```

`staging.example.com` above is a placeholder for whatever host the operator
already configured. This document does not assign a domain.

## Checklist before promoting staging -> main

- [ ] Staging deploy healthy (`/health` and `/ready`)
- [ ] Sign-in + one meal log + one workout on staging
- [ ] No production credentials in the staging env
- [ ] CI `verify` green on the staging tip
- [ ] The pull request is `staging` -> `main` only
- [ ] Dependabot updates that should ship are already on `staging` (their own
      pull requests merged there), not still open against `main`
- [ ] After the promotion, confirm `.github/dependabot.yml` on `main` still
      has `target-branch: staging` so the next dependency pull requests open
      against `staging`
