---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Deployment Guide
subtitle: Deploying AquaZeroFit and connecting the production domain
details:
  Document ID: AQF-22
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Prepared by: Babatundji Williams-Fulwood, Technical Lead and Software Architect
  Team: Babatundji Williams-Fulwood (s8138393), Eric La, Victor Hong
  Date: 31 July 2026
  Audience: First-time deployer, no prior platform experience assumed
  Document status: Issued
---

# AquaZeroFit: Deployment and Domain Guide

Document ID: AQF-22
Status: Issued
Date: 31 July 2026
Supersedes: AQF-21 sections 4 to 9 (Azure build steps). AQF-21's code assessment remains current.
Audience: A first-time deployer. No prior container-hosting experience assumed.

This guide is deliberately host-neutral. AquaZeroFit ships as an OCI container image built from `apps/api/Dockerfile`, and §3 Step 6 lists what a host has to provide for that image to run correctly. Any single-instance container host that meets those requirements will do; the guide names none, because the choice of host does not change a single step below.

## 0. The one fact that shapes everything

**Container filesystems are ephemeral. Nothing of value may be written to disk.**

A container's writable layer is discarded when the container is replaced, and a container is replaced on every deploy, every restart, every crash loop and every host-initiated migration. The image itself declares this at the top of its runtime stage: the writable paths exist so the process can start, not so data can survive.

AquaZeroFit's document store falls back to JSON files under `AZF_DATA_DIR` when no database is configured, and meal photographs are written to a local uploads directory. Running that fallback on a container host means **every user account and every health record is destroyed on the next restart.** This is not a scaling concern to address later; it is the blocking defect, and it applies to a pinned single machine exactly as much as it applies to an autoscaled one. There is no "one instance as a stopgap" escape.

The API now refuses to help you make this mistake: `assertProductionSecrets()` treats a missing `DATABASE_URL` as boot-fatal in production, with the message *"the JSON file backing is a local-development store and is not durable across deploys."* Everything in §3 exists to satisfy that guard honestly rather than to work around it.

## 1. Readiness verdict

| Area | State |
|---|---|
| Repository structure | **Ready.** Reorganised this pass, see §2 |
| Build & typecheck | **Ready.** Clean across all three workspaces |
| Test suite | **Ready.** `npm run verify` (typecheck, tests, safety eval) is green and gated on CI |
| Container image | **Ready.** `apps/api/Dockerfile`, multi-stage, distroless runtime, non-root |
| Single-origin hosting (one port, one domain) | **Ready.** Implemented this pass |
| Durable persistence | **Implemented this pass**, needs a real database attached and verified |
| File uploads surviving a restart | **Not ready.** Object storage migration outstanding, §6 |
| Security headers, boot guards, graceful shutdown | **Ready** (AQF-21) |
| Upload security (EXIF stripping, multer 2.x) | **Fixed this pass** |
| AI resilience (retry, backoff, circuit breaker, deadline) | **Fixed this pass**, with one caveat, §6 |
| Legal & trust surface (privacy policy, ToS, support contact, mail) | **Largely closed since first issue**, remaining gaps in §7 |

**Can you deploy today?** Yes, once §3 is done. **Should you invite real users?** Not until §7 is closed.

## 2. Repository structure

The concern about AI-tool folders polluting the tree was valid as a principle but did not apply here, there were no `Claude/`, `Kimi/` or `Cursor/` directories. There was, however, a subtler version of exactly that problem: **`.claude/` was untracked only because of a machine-local global ignore file**, which does not travel with a clone. Anyone cloning the repo on another machine would have committed it. That is now in the repository's own `.gitignore`.

Changes made:

| Before | After | Reason |
|---|---|---|
| `Documentation/` | `docs/specs/` | Conventional location |
| `research/` | `docs/research/` | Collapses a root entry |
| `plan.md`, `tasks/`, `wger-integration-plan.md` | `docs/plans/` | Removes a `plan.md` / `tasks/plan.md` name collision |
| `Figma_aquazerofit_wellness_platform/` | `design/figma/` | Readable name |
| `Logo_Images/` | `design/brand/` | Groups design assets |
| `scripts/` | `tools/docgen/` + own manifest | See below |
| `scripts/node_modules/` (131 MB, unmanaged) | deleted | No `package.json` backed it |
| `docx` in root `dependencies` | moved to `tools/docgen` | A document renderer had no business in a deployed API's dependency closure |
| `wger-integration-plan.docx` | deleted | Regenerable from the `.md` |

Root went from 20 entries to 13.

**Deliberately not moved:** `prompts/` and `evals/`. `apps/api/src/modules/ai/prompts.ts` resolves prompt files by walking *up* the directory tree to find a root-level `prompts/`, and `evals/runner.ts` loads its fixtures as siblings. Moving either silently breaks prompt loading, the failure mode is an empty system prompt at a plausible-looking version number, which is worse than a crash. This constraint is now documented in the README so nobody "tidies" it later. The Dockerfile honours it too: it copies `prompts/` into the build stage explicitly, because `loadPrompt` reads those files at boot and in tests.

`content/` was also left in place: renaming it would require editing runtime manifest strings that another workstream was actively changing, and the benefit is cosmetic.

### Outstanding structural item: the media directory

`apps/api/assets/exercises/` is **209 MB** across 365 files (245 PNGs, 47 files over 1 MB, largest 10.5 MB). Nothing exceeds GitHub's 100 MB per-file limit so it pushes cleanly, but it makes the repository unpleasant to clone and slows every image build that copies it.

Recommendation: **convert the PNGs to WebP at ~85 quality.** On this kind of demonstration imagery that typically yields 209 MB to somewhere between 15 and 25 MB. The blobs are already in history, so a recompression now shrinks future clones and build contexts but not the existing history; removing them from history entirely requires `git filter-repo` and a force push, which is a separate decision. Licensing is unaffected; the attribution record is a separate JSON file.

## 3. Deployment steps

The unit of deployment is one container image, built from the monorepo root, plus one managed Postgres database. Nothing in this section is specific to a particular host.

### Step 1: Build the image

The image **must** be built from the repository root so the npm workspace linkage to `packages/shared` resolves:

```bash
docker build -f apps/api/Dockerfile -t aquazerofit-api:<commit-sha> .
```

Two properties of this build are worth knowing before you wait on it:

- **It is a quality gate, not just a packaging step.** Stage 1 installs the full workspace including dev dependencies and runs `typecheck` on `packages/shared` and `apps/api` followed by the API test suite. A commit that does not build clean cannot produce a runnable image. That is why the build takes minutes rather than seconds.
- **Stage 2 is distroless and runs as `nonroot` (UID 65532).** There is no shell in the runtime image, so the entrypoint is `node` invoking a JS path directly and the healthcheck is a `node -e` one-liner rather than `curl`. Do not expect to `docker exec` a shell into a running container; use the logs and the HTTP endpoints instead.

**Tag by commit SHA, never `latest`.** `docker-compose.yml` builds `aquazerofit-api:latest` for local convenience and says so in a comment, but a mutable tag in a registry makes "which build is in production?" unanswerable and makes rollback a guess.

### Step 2: Provision Postgres

Create a managed Postgres database and take its connection string. That single `DATABASE_URL` variable is all the application needs: the store switches from JSON files to Postgres the moment it is present, and refuses to boot in production when it is absent.

Two things to know:

- **Use the host's managed Postgres, not a database container, for anything real.** The `db` service in `docker-compose.yml` exists so the stack runs on one machine for development and demonstration. It stores its data in a named Docker volume, it publishes no host port deliberately, and it carries none of the backup, point-in-time recovery or patching that a managed service provides.
- **Development and production use separate databases.** Data you create while testing locally will not appear in the deployed app. This surprises people; plan for it.

A note on drivers: the application uses the plain `pg` driver with a small connection pool, which is correct for an ordinary managed Postgres endpoint. Do not substitute a serverless HTTP driver or append a connection-pooler hostname suffix unless your host's documentation specifically tells you to; older tutorials recommending either will cause problems here.

### Step 3: Set the environment

Inject configuration through the host's secret store, never through a committed `.env`. Appendix A is the full list. The minimum production set is:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | From Step 2 |
| `JWT_ACCESS_SECRET` | A 64-character random hex string, generate it, do not invent one |
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | 32 random hex bytes, and register it with `setWebhook` |
| `CORS_ORIGINS` | `https://your-domain.com`, https only, no wildcard |
| `RESEND_API_KEY`, `MAIL_FROM`, `APP_PUBLIC_URL` | A real mail transport and a verified sender domain |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Both, from the Cloudflare Turnstile dashboard |
| `MFA_REQUIRE_ADMIN` | `true`, after every admin has enrolled an authenticator |
| `AZF_INSTANCE_COUNT` | `1`. See §3 Step 5 |
| `TRUST_PROXY` | `1` behind a single reverse proxy, `2` if a CDN sits in front of that |

Generate the random secrets with either of:

```bash
openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**These are enforced at boot.** `assertProductionSecrets()` runs on module load and **refuses to start** when any of them is missing, when `CORS_ORIGINS` contains `*` or a plaintext `http://` origin, when the effective mail transport is the console stub, or when `AUTH_ALLOW_CAPTCHALESS_MOBILE` is still set from a closed test. A misconfigured deployment fails loudly rather than serving with development secrets, which is the behaviour you want, but it does mean a missing variable looks like a crash loop. **Read the boot logs before assuming the image is broken:** every one of these throws names the variable and why it matters.

`NODE_ENV=production` is load-bearing for the entire security posture. The Dockerfile sets it in the runtime stage and `docker-compose.yml` sets it again, both as deliberate second lines of defence.

### Step 4: Deploy the image

Point the host at the tagged image and give it the environment from Step 3. Whatever the host's deployment surface looks like, four settings have to end up right:

| Setting | Value | Why |
|---|---|---|
| Instance count | Exactly **1**, minimum and maximum | §3 Step 5. Anything else corrupts user data |
| Container port | `4000` | `EXPOSE 4000`, overridable with `PORT` |
| Liveness probe | `GET /health` | Never touches the store, so it stays honest during a database outage |
| Readiness probe | `GET /ready` | Returns 503 until the store is hydrated and Postgres answers `SELECT 1` |

`/health`, `/ready` and `/metrics` are all registered ahead of the rate limiter, precisely so platform probes cannot be throttled into a restart loop.

If the host will not run a prebuilt image and insists on building from source, give it the same two arguments the command in Step 1 uses: the repository root as build context and `apps/api/Dockerfile` as the dockerfile. A build context set to `apps/api/` will fail, because the workspace root manifests are not inside it.

### Step 5: One instance, and the guard that enforces it

**Do not run more than one instance of the API. The process refuses to start if you declare that you have.**

The document store keeps its entire working set in memory and hydrates it once, at boot. Postgres is a durability mirror, not a source of truth for reads. Two instances therefore hold two independent copies: a write on instance A is invisible to instance B until B restarts, and because the flush writes whole documents, whichever instance flushes last silently overwrites the other's version of that row. Nothing errors, nothing logs, and no probe goes red. A user's food diary just loses entries.

No deployment surface expresses an instance count that the process can read: a managed host keeps its autoscale limit in its own dashboard, Compose is scaled from the command line, and the Dockerfile cannot know. So the count is declared explicitly in the environment:

| `AZF_INSTANCE_COUNT` | Effect |
|---|---|
| unset | Treated as `1` |
| `1` | Boots normally |
| anything else (`2`, `0`, `auto`, ...) | **Boot refused**, with an error naming the data-loss risk |

Enforced by `assertSingleInstance()` in `apps/api/src/platform/config.ts`, called before the store initialises. Set the value **and** pin the host to a single instance: the guard catches an environment that lies, not a dashboard that quietly scales out while the environment still says `1`. `docs/OPERATIONS.md` § Scaling is the authority on this and on what it would take to lift the restriction.

### Step 6: What the host must provide

The image will run anywhere that offers all of the following. Check the list against a candidate host before committing to it, rather than after.

| Requirement | Why it is not optional |
|---|---|
| Runs an OCI image from a registry, or builds one from a Dockerfile with a repository-root context | The build is a monorepo build; see Step 1 |
| A **single**, always-on instance, with autoscaling disabled or pinned to min = max = 1 | §3 Step 5 |
| Managed Postgres, or a route to one, injected as `DATABASE_URL` | §0. Without it the API refuses to boot in production |
| A secret store for environment variables | Step 3 lists credentials that must never enter the repository or an image layer |
| TLS termination and a custom domain with automatic certificate renewal | §4 |
| HTTP liveness and readiness probes on separate paths | Step 4. A host that offers only one probe should be pointed at `/ready` |
| A persistent volume mount, **or** an object storage service | Meal photographs are still written to disk; see §6 item 1. A volume is the stopgap, object storage is the fix |
| Log collection from stdout | Every log line is a single JSON object; `docs/OPERATIONS.md` defines the alerting rules built on them |
| Support for a non-root, read-only-root, distroless container | The runtime stage has no shell and runs as UID 65532. A host that requires a shell entrypoint or a root user cannot run this image unmodified |

A host that cannot do TLS or custom domains is not disqualifying on its own; a reverse proxy in front can supply both, in which case set `TRUST_PROXY` to the number of proxy hops and leave `FORCE_HTTPS` at its default. Getting the hop count wrong collapses every caller into one rate-limit bucket and locks out all logins, so verify it against a real request rather than guessing.

### Step 7: Verify

Once deployed, check:

```
https://<your-host>/health     → {"status":"ok",...}
https://<your-host>/ready      → {"status":"ready",...}
https://<your-host>/           → the app loads, if SERVE_WEB is on
```

`/ready` returning 503 means the store did not initialise, check `DATABASE_URL` and the database's network reachability. `/health` responding while `/ready` fails is exactly the distinction those two endpoints exist to draw, and it is the fastest way to tell "the process is dead" apart from "the database is unreachable".

Then register an account, log a weight, **restart the container**, and confirm the account still exists. **That last test is the one that matters**, it is the difference between a working deployment and one that quietly destroys user data. Restarting is the honest test because it is what the host will do to you unannounced; deploying a new revision tests the same thing.

## 4. Connecting the domain

The domain for this project is registered with Hostinger, but nothing below is registrar-specific: a container host is not a registrar, so buying the domain in one place and pointing its DNS at another is the normal arrangement. You are not "transferring" the domain, you are pointing its records.

1. In the host's dashboard, add the custom domain to the deployment.
2. The host displays the records to create. Expect an **A record** (an IP address) or a **CNAME** (a hostname), plus a **TXT record** carrying a verification token. Some hosts issue an `ACME` challenge record instead; the mechanics below are the same.
3. At the registrar, open the DNS record editor for the domain and add the records exactly as shown.
4. Wait. Verification is usually minutes; DNS propagation can take up to 48 hours.
5. Once the host reports the domain verified, HTTPS is provisioned automatically.

Gotchas, in order of how often they bite:

- **Keep the verification TXT record forever.** It is not just for initial setup, certificate *renewal* re-checks it. Delete it after verification and the site serves an expired certificate a few months later, which is a confusing failure to debug.
- **Remove any AAAA (IPv6) record** on the same hostname unless the host explicitly gave you one. An AAAA pointing somewhere that does not answer can block certificate issuance.
- **Remove the registrar's default parking records** for the hostname you are pointing, or they will conflict with yours.
- Copy records exactly. Trailing dots and an accidental extra subdomain (`app.example.com.example.com`) are the usual culprits.
- Update `CORS_ORIGINS` and `APP_PUBLIC_URL` to the real domain once it is live, re-register the Telegram webhook against the new host, and update the Mini App URL in BotFather.

*The AAAA and permanent-TXT points are consistent with how ACME certificate issuance works generally rather than being drawn from any one host's documentation, but both are cheap to honour.*

## 5. Running costs

No figures are given here, because they belong to whichever host is chosen and would be stale by the time this document is read. What is fixed is the *shape* of the bill, which is worth checking before committing to a host:

| Line item | Note |
|---|---|
| Compute | One always-on instance. Scale-to-zero pricing does not apply: this deployment cannot autoscale (§3 Step 5), and a cold start empties nothing but does delay the store hydration |
| Managed Postgres | The durability substrate. Small at this scale, but not optional |
| Object storage | Only once §6 item 1 lands; small at this scale |
| Egress and TLS | Usually included, occasionally not |
| Domain | Already purchased |
| AI provider usage | Variable, and the only line item that can surprise you |

**On AI cost:** one chat turn can trigger more than one provider call, because memory extraction runs alongside the answer. Set a spend cap with your AI provider before enabling real keys. The gateway's own controls (a per-provider circuit breaker, a 12-second deadline across the whole provider chain, a `maxTokens` ceiling, and a budget stop that marks results `degraded` so callers release their credit holds) bound a runaway, but they bound it in your application, not on the provider's invoice.

## 6. What was fixed this pass, and what remains

### Fixed

- **Durable persistence.** The store now writes through to Postgres when `DATABASE_URL` is present, keeping the synchronous read API unchanged. This avoided converting 77 call sites across 24 files to async, a multi-day refactor, while still removing the data-loss defect. A production boot without `DATABASE_URL` is now refused outright.
- **Single-origin hosting.** The API serves the built SPA with correct cache headers (immutable for hashed assets, `no-cache` for the shell) and a client-side routing fallback that cannot shadow the API: an unknown `/api/v1/*` path still returns the JSON error envelope, never HTML. This is covered by a regression test.
- **CSP for a Telegram Mini App.** Serving HTML and API from one origin required loosening the API's `default-src 'none'` policy. The policy is now conditional on whether a SPA is present. Critically, `frame-ancestors` allows `web.telegram.org`, Telegram renders Mini Apps in an iframe, and the obvious `X-Frame-Options: SAMEORIGIN` would have broken the Mini App entirely. `X-Frame-Options` cannot express a multi-origin allowlist, so it is deliberately not sent when serving the SPA.
- **Upload security.** Meal photos are re-encoded through `sharp` before storage, which strips EXIF/GPS, a phone photo otherwise attaches home-address-precision location data to a health record. `multer` upgraded from the end-of-life 1.x to 2.x.
- **AI resilience.** Retry with jittered exponential backoff on 429/5xx, `Retry-After` honoured, a per-provider circuit breaker, an overall 12-second deadline across the whole provider chain (previously ~100 seconds worst case), and a `maxTokens` ceiling.
- **The `degraded` flag is now consumed.** When a real answer could not be obtained and a template response was substituted, the gateway says so and the call sites act on it: chat, recommendations, progress, vision, the plan engine and workout substitution all read `meta.degraded` and decide billing and presentation from it, rather than passing it through and charging anyway.
- **Reproducible, gated builds.** `apps/api/Dockerfile` pins both base images by digest and runs typecheck and the test suite inside the build, and `.github/workflows/ci.yml` runs `npm run verify` (typecheck, tests, safety eval) on every push and pull request. The eval gate that was a release gate on paper now actually blocks.

### Remaining, in priority order

1. **Meal photo uploads still write to local disk** and are lost when the container is replaced. The stopgap is a persistent volume mounted at `UPLOADS_DIR` (this is what `docker-compose.yml` does with its `api_uploads` volume); the fix is the host's object storage service. When you do the migration, keep authorisation in the Express layer and stream bytes through the API rather than relying on bucket ACLs or signed URLs, so the access rules stay in one place. **~0.5 day.**

2. **Verify HEIC uploads with a real iPhone photo before launch.** HEIC is advertised as an accepted type in three places, the shared `MEAL_PHOTO_MIME` constant, the web file picker, and the API validator, and it is the iPhone camera default. Because uploads are now re-encoded through sharp, HEIC support depends on the codecs compiled into the deployed libvips rather than on the file being valid, which makes it a property of the runtime image and therefore something to re-check whenever the base image moves.

   The evidence is genuinely mixed and was **not** fully resolved: the build of sharp examined here (libvips 8.18.3) reports a HEIF *decoder* as available, but HEIF *encoding* fails with "unsupported compression". Those are separate codecs in libheif, encoding needs x265, which is usually omitted for licensing reasons, while decoding needs libde265, so an encoder failure does not imply the decoder is missing. Without a real HEIC sample this could not be settled either way.

   Mitigation already in place: a HEIC decode failure returns a specific, actionable message ("choose Most Compatible in iOS camera settings") instead of a generic "could not be read", and logs distinctly so it is diagnosable from production logs. In practice iOS Safari often transcodes HEIC to JPEG on upload, which may mask the issue entirely. **Test it on a real device against the deployed image; if it fails, either add a HEIC decode path or remove `image/heic` from all three allow-lists.** ~1 hour to verify.

3. **Rate-limit buckets and the login lockout are per-process.** Correct on one instance; they must move to a shared store before the deployment can ever run more than one.

4. **Full async store migration.** Routing reads through to Postgres instead of a per-instance memory copy is the prerequisite for lifting §3 Step 5 at all. Roughly 77 call sites. **~5 to 7 days.**

5. **No automated deploy.** CI verifies every push but nothing promotes an image. Whether the host can deploy on push, or whether promotion stays a deliberate manual step, is a decision to record once the host is chosen. A manual promotion is a defensible choice for a single-instance deployment; an undocumented one is not.

## 7. Before you invite real users

These are not infrastructure problems and no deployment fixes them. Several items recorded at first issue have since been closed and are noted as such.

- **Closed: account recovery.** A real mail transport is wired and the API refuses to boot in production without one, so a password-reset token can no longer be minted into a void while the endpoint answers 202.
- **Closed: the legal surface.** Privacy policy, terms of service, support contact and account-deletion pages exist and are routed, and the wellness disclaimer now renders on the coach and landing surfaces rather than only in Settings. The app processes weight, meal logs, allergens, photographs and free-text health conversation. Under GDPR that is Article 9 special-category data; under the Australian Privacy Act it is sensitive information, so treat any regression here as a launch blocker rather than a copy bug.
- **Notification settings are non-functional.** Four reminder toggles persist with no delivery code behind them. An honest "coming soon" banner is shown, which is the right call, but the toggles still imply a feature that does not exist.
- **Attribution is incomplete.** Per-record attribution renders correctly for wger and Open Food Facts, but the in-app attribution page specified in the project's own attribution document does not exist. For ODbL and CC-BY-SA content this is a licence-compliance gap, roughly two hours to close.
- **The webhook secret rotation has never been executed against production.** `docs/OPERATIONS.md` documents the procedure and is explicit that every rotation costs cancelled checkouts. Rehearse it against a staging bot before it is needed in anger.

## 8. Honest summary

The engineering quality here is genuinely high: a real monorepo, a clean domain-oriented module structure, deterministic health calculations kept out of the AI path, thoughtful licence segregation, and a test suite that made every change in this pass verifiable and now gates every push. That is well above what a project at this stage usually looks like.

The gaps are concentrated in two places: **persistence**, which is addressed for structured data and outstanding for uploaded photographs, and the **operational unknowns** that only a real deployment settles, the HEIC codec question and the webhook rotation rehearsal chief among them. The single-instance constraint is the one thing a reader should carry away: it is not a temporary configuration, it is a property of the store, and the boot guard exists because a dashboard scaling slider is easier to move than to notice.

On the standard of "100% correct with no mistakes": software does not reach that state, and a report claiming otherwise would be less useful than this one. What is achievable, and what this pass delivers, is that every known defect is either fixed or written down with an owner and an estimate, and the test suite fails when someone reintroduces one.

## Appendix A: Environment variables

Boot-fatal in production means `assertProductionSecrets()` throws and the process exits rather than serving.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | **Yes** | Must be exactly `production`. The whole security posture depends on it |
| `DATABASE_URL` | **Yes** | Postgres connection string. Boot-fatal if absent: without it the store falls back to JSON files that a container restart destroys |
| `JWT_ACCESS_SECRET` | **Yes** | 64 hex chars. Boot-fatal |
| `TELEGRAM_BOT_TOKEN` | **Yes** | Boot-fatal |
| `CORS_ORIGINS` | **Yes** | Comma-separated, https only, no `*`. Boot-fatal otherwise |
| `RESEND_API_KEY` | **Yes** | Boot-fatal: the console transport is refused in production because password reset would be undeliverable while the endpoint still answers 202 |
| `MAIL_FROM` | **Yes** | Envelope sender on a domain verified with the provider, or every message is dropped provider-side |
| `APP_PUBLIC_URL` | **Yes** | Reset links are built from it |
| `TURNSTILE_SITE_KEY` | **Yes** | Boot-fatal. Bot protection is active only when **both** keys are set; one alone protects exactly as much as neither |
| `TURNSTILE_SECRET_KEY` | **Yes** | As above |
| `MFA_REQUIRE_ADMIN` | **Yes** | Must be `true`. Enrol every admin authenticator *before* setting it, or you lock yourself out |
| `TELEGRAM_WEBHOOK_SECRET` | Required for payments | The webhook grants entitlements and is otherwise unauthenticated. Empty means every delivery is refused, which is the correct default |
| `AZF_INSTANCE_COUNT` | Recommended | `1`, or unset. Any other value refuses boot. See §3 Step 5 |
| `TRUST_PROXY` | Recommended | Number of proxy hops to trust. Defaults to `1` in production. Wrong values collapse every caller into one rate-limit bucket |
| `APP_VERSION` | Recommended | Stamped by CI with the commit SHA, returned by `/health` and `/ready` |
| `UPLOADS_DIR` | Recommended | Point at a mounted persistent volume, or a restart loses photographs that are mid-analysis |
| `SERVE_WEB` | Optional | `false` for an API-only deployment. `docker-compose.yml` sets `false` |
| `WEB_DIST_DIR` | Optional | Overrides where the built SPA is found |
| `PORT` | Optional | Defaults to 4000, matching `EXPOSE` in the Dockerfile |
| `AZF_DATA_DIR` | Optional | JSON store location. Used **only** when `DATABASE_URL` is unset, so it should never matter in production |
| `FORCE_HTTPS` | Optional | On by default in production. Set `false` only when a sidecar has already terminated TLS and this container genuinely serves plaintext on a private network |
| `AUTH_ALLOW_CAPTCHALESS_MOBILE` | Must be unset | Boot-fatal if set. A closed-testing bypass of the registration challenge |

`.env.example` is the authoritative annotated list; this table is the production subset.

## Appendix B: Verification

Before building an image:

```bash
npm install
npm run typecheck
npm run test
npm run eval
npm run api
npm run dev
```

Against a running container, locally or deployed:

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/ready
curl -s http://localhost:4000/metrics
```

The full local stack, API plus Postgres, with the compose file's hardening applied:

```bash
cp .env.example .env     # then fill in POSTGRES_PASSWORD and JWT_ACCESS_SECRET
docker compose up --build
```

The stack refuses to start when those two are unset, deliberately. Do not use `docker compose up --scale api=N`; see §3 Step 5.

## Appendix C: References

Sources for this guide are in the repository rather than in any host's documentation, which is what makes the procedure portable:

- Container image and its build gate: `apps/api/Dockerfile`
- Local and demonstration stack, including the hardening rationale: `docker-compose.yml`
- Single-instance constraint, observability and alerting, webhook secret rotation: `docs/OPERATIONS.md`
- Boot guards and every variable in Appendix A: `apps/api/src/platform/config.ts`
- Annotated environment template: `.env.example`
- Verification pipeline: `.github/workflows/ci.yml`
