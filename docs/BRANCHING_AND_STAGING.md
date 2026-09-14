# Branching and staging

Promotion path for AquaZeroFit:

`feature/*` (or `fix/*` / `hotfix/*`) -> `staging` -> `main`

Anything that skips staging is treated as a release incident.

## Why

CI already runs typecheck, coverage-gated tests, the safety eval, and build on
every push (`.github/workflows/ci.yml`). That is necessary but not sufficient:
integration against real sandboxed keys, Turnstile hostnames, mail delivery,
and Telegram webhooks only happens in a staging deployment. Production must
only receive commits that already passed that environment.

## Required GitHub settings (operator)

These cannot live in the repo; configure them once in the GitHub UI:

1. **Branches**
   - Protect `main`: require PR, require status checks `verify` (CI) and
     `promote-path` (Branch Safety), dismiss stale reviews, no force push,
     no deletions.
   - Protect `staging`: require PR, require `verify`, no force push.
2. **Environments**
   - `staging` with optional reviewers; variable `STAGING_PUBLIC_URL`.
   - `production` with required reviewers; variable `PRODUCTION_PUBLIC_URL`.
3. **Secrets**
   - Staging and production secret sets are disjoint. Never copy
     `DATABASE_URL`, `JWT_ACCESS_SECRET`, bot tokens, Turnstile keys, or Play
     credentials between them.

## Environment files

| File | Purpose |
|---|---|
| `.env.example` | Local development defaults |
| `.env.staging.example` | Staging isolation checklist |
| `.env.production.example` | Production isolation checklist |

Filled `.env`, `.env.staging`, and `.env.production` files are gitignored.

## Workflows

| Workflow | Role |
|---|---|
| `ci.yml` | Lint/typecheck/test/eval/build on every branch |
| `branch-safety.yml` | Blocks PRs to `main` that are not from `staging` |
| `deploy.yml` | Re-runs verify + smoke on `staging` / `main`; remote smoke when URLs are set |
| `android-verify.yml` / `android-release.yml` | Android gates (unchanged) |

## Smoke

```bash
npm run build
npm run smoke                 # checks local dist artifacts
SMOKE_BASE_URL=https://staging.example.com npm run smoke
```

## Checklist before promoting staging -> main

- [ ] Staging deploy healthy (`/health` and `/ready`)
- [ ] Sign-in + one meal log + one workout on staging
- [ ] No production credentials in staging env
- [ ] CI green on the staging tip
- [ ] PR is `staging` -> `main` only
