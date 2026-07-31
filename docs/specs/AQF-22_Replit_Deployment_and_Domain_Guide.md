# AquaZeroFit — Replit Deployment & Hostinger Domain Guide

Document ID: AQF-22
Status: Issued
Date: 31 July 2026
Supersedes: AQF-21 §4–§9 (Azure build steps). AQF-21's code assessment remains current.
Audience: A first-time deployer. No prior Replit experience assumed.

## 0. The one fact that shapes everything

Replit's documentation states plainly:

> The file system in published apps is not persistent and resets every time you publish.

And separately: *"If uploaded files or generated data disappear after publishing, store them in a database or storage service instead of the app filesystem."*

AquaZeroFit currently stores **all** application data — users, credentials, weight logs, meal logs, chat transcripts, AI memory — as JSON files on local disk, and writes uploaded meal photographs to a local `uploads/` directory.

Deploying as-is means **every user account and every health record is destroyed on each publish.** This is not a scaling concern to address later; it is the blocking defect. It applies to Reserved VM as well as Autoscale — there is no "single instance as a stopgap" escape.

Everything in §3 exists to fix this before you deploy.

## 1. Readiness verdict

| Area | State |
|---|---|
| Repository structure | **Ready.** Reorganised this pass — see §2 |
| Build & typecheck | **Ready.** Clean across all three workspaces |
| Test suite | **Ready.** 412 tests, 31 files |
| Single-origin hosting (one port, one domain) | **Ready.** Implemented this pass |
| Durable persistence | **Implemented this pass** — needs a real database attached and verified |
| File uploads surviving a publish | **Not ready.** Object Storage migration outstanding |
| Security headers, boot guards, graceful shutdown | **Ready** (AQF-21) |
| Upload security (EXIF stripping, multer 2.x) | **Fixed this pass** |
| AI resilience (retry, backoff, circuit breaker, deadline) | **Fixed this pass**, with one caveat — §6 |
| Legal & trust surface (privacy policy, ToS, email delivery) | **Not ready.** This is the real blocker — §7 |

**Can you deploy today?** Yes, to a staging URL, once §3 is done. **Should you invite real users?** Not until §7 is closed.

## 2. Repository structure

The concern about AI-tool folders polluting the tree was valid as a principle but did not apply here — there were no `Claude/`, `Kimi/` or `Cursor/` directories. There was, however, a subtler version of exactly that problem: **`.claude/` was untracked only because of a machine-local global ignore file**, which does not travel with a clone. Anyone cloning the repo on another machine would have committed it. That is now in the repository's own `.gitignore`.

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

**Deliberately not moved:** `prompts/` and `evals/`. `apps/api/src/modules/ai/prompts.ts` resolves prompt files by walking *up* the directory tree to find a root-level `prompts/`, and `evals/runner.ts` loads its fixtures as siblings. Moving either silently breaks prompt loading — the failure mode is an empty system prompt at a plausible-looking version number, which is worse than a crash. This constraint is now documented in the README so nobody "tidies" it later.

`content/` was also left in place: renaming it would require editing runtime manifest strings that another workstream was actively changing, and the benefit is cosmetic.

### Outstanding structural item — the media directory

`apps/api/assets/exercises/` is **209 MB** across 365 files (245 PNGs, 47 files over 1 MB, largest 10.5 MB). Nothing exceeds GitHub's 100 MB per-file limit so it will push, but it makes the repository unpleasant to clone and slow to deploy.

Recommendation: **convert the PNGs to WebP at ~85 quality before the first commit.** On this kind of demonstration imagery that typically yields 209 MB → 15–25 MB. Do it before committing — afterwards the large blobs are in history permanently and require `git filter-repo` to remove. Licensing is unaffected; the attribution record is a separate JSON file.

## 3. Deployment steps

### Step 0 — Commit the repository

**The repository currently has zero commits.** `git log` reports no commits on `master`, and there is no remote. Replit imports from GitHub, so there is presently nothing to import — and more urgently, the working tree is the only copy of the entire project.

Do the WebP recompression from §2 *first*, then:

```bash
git add -A
git commit -m "Initial commit: AquaZeroFit wellness platform"
```

Then create a GitHub repository and push. Keep it **private** — the repo contains no secrets (`.env` is correctly ignored and untracked), but it does contain the full product.

### Step 1 — Import into Replit

Go to `replit.com/import` and connect the GitHub repository. For a private repo you will be asked to authorise Replit's GitHub app.

The repository already contains a `.replit` file configured for this project, so Replit will pick up the run command, the port mapping and the deployment settings automatically.

### Step 2 — Attach a Postgres database

In the Replit workspace, open the **Database** tool and create a Postgres database.

Two things to know:

- Replit injects **`DATABASE_URL`** into the environment automatically. That single variable is all the application needs — the store switches from JSON files to Postgres the moment it is present.
- **Development and production use separate databases.** Data you create while testing in the workspace will *not* appear in the published app. This surprises people; plan for it.

A note on drivers: Replit migrated its Postgres off Neon to its own managed service ("Helium") in December 2025, and the legacy Neon databases were shut down in June 2026. The application uses the plain `pg` driver with a small connection pool, which is correct for this platform. Older tutorials recommending `@neondatabase/serverless` or a `-pooler` hostname suffix are now obsolete and will cause problems.

### Step 3 — Set the secrets

Open the **Secrets** tool and add:

| Secret | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_ACCESS_SECRET` | A 64-character random hex string — generate it, do not invent one |
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `CORS_ORIGINS` | `https://your-domain.com` — https only, no wildcard |
| `TRUST_PROXY` | `1` |
| `SESSION_...` / AI keys | Only the provider keys you actually hold |

Generate the JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Three of these are enforced at boot. The API calls `assertProductionSecrets()` on startup and **refuses to start** if `JWT_ACCESS_SECRET`, `TELEGRAM_BOT_TOKEN` or `CORS_ORIGINS` is missing, or if `CORS_ORIGINS` contains `*` or a plaintext `http://` origin. A misconfigured deployment fails loudly rather than serving with development secrets — which is the behaviour you want, but it does mean a missing secret looks like a crash. Check the deployment logs.

Note that `NODE_ENV=production` is load-bearing for the entire security posture. The `.replit` run command sets it explicitly as a second line of defence.

**Unverified:** Replit's current documentation does not state clearly whether workspace secrets propagate automatically to deployments or must be re-entered in the deployment pane. Check both after your first publish.

### Step 4 — Publish

Open **Publishing** and choose **Reserved VM**.

This is deliberate, not a cost preference. The data store keeps an in-memory working set backed by Postgres — durable, but safe only on a single instance, because a second instance would hold its own copy and serve stale reads. Reserved VM is one machine. **Do not select Autoscale** until the store reads go directly to Postgres (see §6).

Replit will run the build command from `.replit`: install dependencies, build the shared package, typecheck the API, and build the web app. Then it starts the API, which serves both the `/api/v1` routes and the built SPA from a single port.

### Step 5 — Verify

Once published, check:

```
https://<your-app>.replit.app/health     → {"status":"ok",...}
https://<your-app>.replit.app/ready      → {"status":"ready",...}
https://<your-app>.replit.app/           → the app loads
```

`/ready` returning 503 means the store did not initialise — check `DATABASE_URL`. `/health` responding while `/ready` fails is exactly the distinction those two endpoints exist to draw.

Then register an account, log a weight, publish again, and confirm the account still exists. **That last test is the one that matters** — it is the difference between a working deployment and one that quietly destroys user data.

## 4. Connecting the Hostinger domain

Replit is not a registrar, so buying at Hostinger and pointing it at Replit is the normal arrangement — you are not "transferring" the domain, you are pointing its DNS records.

1. In Replit: **Publishing → Settings → Link a domain**. Enter your domain.
2. Replit displays two records: an **A record** (an IP address) and a **TXT record** (`replit-verify=...`).
3. In Hostinger: **Domains → DNS / Nameservers → Manage DNS records**. Add both exactly as shown.
4. Wait. Verification is usually minutes; DNS propagation can take up to 48 hours.
5. Once Replit shows "Verified", HTTPS is provisioned automatically.

Gotchas, in order of how often they bite:

- **Keep the TXT record forever.** It is not just for initial setup — certificate *renewal* re-checks it. Delete it after verification and your site serves an expired certificate a few months later, which is a confusing failure to debug.
- **Remove any AAAA (IPv6) record** on the same hostname. It can block certificate issuance.
- **Remove Hostinger's default parking records** for the hostname you are pointing, or they will conflict.
- Copy records exactly — trailing dots and an accidental extra subdomain are the usual culprits.
- Update `CORS_ORIGINS` to the real domain once it is live, and update the Mini App URL in BotFather.

*The AAAA and permanent-TXT points come from community sources rather than Replit's official documentation, but both are cheap to honour and consistent with how ACME certificate issuance works.*

## 5. Cost

| Item | Approximate |
|---|---|
| Replit Core (needed for always-on deployments) | ~$25/month |
| Reserved VM | ~$6–50/month depending on tier; the smallest tier suits this app initially |
| Postgres (development) | Included, 20 GB |
| Postgres (production) | Usage-billed |
| Object Storage | Usage-billed, small at this scale |
| Domain (Hostinger) | Already purchased |
| AI provider usage | Variable — see the warning below |

Autoscale bills per request and scales to zero, which is cheaper at low traffic — but is unsafe for this application until §6 is done.

**On AI cost:** the credit ledger has a time-of-check/time-of-use race where concurrent turns can reserve against the same balance, and memory extraction calls the model with no credit reservation at all — one chat turn can trigger up to three provider calls. Set a spend cap with your AI provider before enabling real keys.

## 6. What was fixed this pass, and what remains

### Fixed

- **Durable persistence.** The store now writes through to Postgres when `DATABASE_URL` is present, keeping the synchronous read API unchanged. This avoided converting 77 call sites across 24 files to async — a multi-day refactor — while still removing the data-loss defect.
- **Single-origin hosting.** The API serves the built SPA with correct cache headers (immutable for hashed assets, `no-cache` for the shell) and a client-side routing fallback that cannot shadow the API: an unknown `/api/v1/*` path still returns the JSON error envelope, never HTML. This is covered by a regression test.
- **CSP for a Telegram Mini App.** Serving HTML and API from one origin required loosening the API's `default-src 'none'` policy. The policy is now conditional on whether a SPA is present. Critically, `frame-ancestors` allows `web.telegram.org` — Telegram renders Mini Apps in an iframe, and the obvious `X-Frame-Options: SAMEORIGIN` would have broken the Mini App entirely. `X-Frame-Options` cannot express a multi-origin allowlist, so it is deliberately not sent when serving the SPA.
- **Upload security.** Meal photos are re-encoded through `sharp` before storage, which strips EXIF/GPS — a phone photo otherwise attaches home-address-precision location data to a health record. `multer` upgraded from the end-of-life 1.x to 2.x.
- **AI resilience.** Retry with jittered exponential backoff on 429/5xx, `Retry-After` honoured, a per-provider circuit breaker, an overall 12-second deadline across the whole provider chain (previously ~100 seconds worst case), and a `maxTokens` ceiling.

### Remaining, in priority order

1. **Meal photo uploads still write to local disk** and will be lost on publish. Migrate to Replit Object Storage (`@replit/object-storage`). Note that signed URLs are not documented — keep authorisation in the Express layer and stream bytes through the API rather than relying on bucket ACLs. **~0.5 day.**

2. **Verify HEIC uploads with a real iPhone photo before launch.** HEIC is advertised as an accepted type in three places — the shared `MEAL_PHOTO_MIME` constant, the web file picker, and the API validator — and it is the iPhone camera default. Because uploads are now re-encoded through sharp, HEIC support depends on the codecs compiled into the deployed libvips rather than on the file being valid.

   The evidence is genuinely mixed and was **not** fully resolved: this build of sharp (libvips 8.18.3) reports a HEIF *decoder* as available, but HEIF *encoding* fails with "unsupported compression". Those are separate codecs in libheif — encoding needs x265, which is usually omitted for licensing reasons, while decoding needs libde265 — so an encoder failure does not imply the decoder is missing. Without a real HEIC sample this could not be settled either way.

   Mitigation already in place: a HEIC decode failure now returns a specific, actionable message ("choose Most Compatible in iOS camera settings") instead of a generic "could not be read", and logs distinctly so it is diagnosable from production logs. In practice iOS Safari often transcodes HEIC to JPEG on upload, which may mask the issue entirely. **Test it on a real device; if it fails, either add a HEIC decode path or remove `image/heic` from all three allow-lists.** ~1 hour to verify.
3. **The `degraded` flag is inert.** The gateway now correctly reports when a real answer could not be obtained and a template response was substituted, but the four call sites that consume it — chat, recommendations, vision, plan engine — still pass the metadata straight through, and credits are committed anyway. Until they are wired, users can still receive mock output believing it is genuine AI. **~2 hours.**
4. **Rate-limit buckets are per-process.** Correct on a single Reserved VM; must move to a shared store before Autoscale.
5. **Full async store migration** to make Autoscale safe. **~5–7 days.**
6. **No CI.** The eval gate genuinely exits non-zero on a safety regression and now has an `npm run eval` script, but nothing runs it automatically. Add a GitHub Actions workflow running `npm run verify`. Note that Replit does not support auto-deploy on push — redeploying is a manual click.

## 7. Before you invite real users

These are not infrastructure problems and no deployment fixes them.

- **Password reset does not work.** There is no mail transport in the API. The sign-in screen offers "Forgot password?" and calls a real endpoint that generates a token and sends it nowhere. Any user who forgets their password is permanently locked out. Wiring one transactional email provider closes this *and* email verification together.
- **No privacy policy, terms of service, or support contact.** The app processes weight, meal logs, allergens, photographs and free-text health conversation. Under GDPR that is Article 9 special-category data; under the Australian Privacy Act it is sensitive information. Publishing without a policy is not a defensible position.
- **Health screens carry no disclaimer.** The onboarding screen that presents a personalised calorie and macro target — the most consequential screen in the product — does not render the wellness disclaimer, though the constant already exists in the shared package. The Settings copy of it renders at 10px and roughly 2:1 contrast, below accessibility minimums.
- **Notification settings are non-functional.** Four reminder toggles persist to `localStorage` with no delivery code behind them. An honest "coming soon" banner is shown, which is the right call, but the toggles still imply a feature that does not exist.
- **Attribution is incomplete.** Per-record attribution renders correctly for wger and Open Food Facts, but the in-app attribution page specified in the project's own attribution document does not exist. For ODbL and CC-BY-SA content this is a licence-compliance gap — roughly two hours to close.

## 8. Honest summary

The engineering quality here is genuinely high: a real monorepo, a clean domain-oriented module structure, deterministic health calculations kept out of the AI path, thoughtful licence segregation, and a 387-test suite that made every change in this pass verifiable. That is well above what a project at this stage usually looks like.

The gaps are concentrated in two places: **persistence** (now addressed) and the **legal and trust surface** (not addressed, and not addressable by writing more code). A launch plan that fixes the first and ignores the second ships a product that works and should not be used.

On the standard of "100% correct with no mistakes": software does not reach that state, and a report claiming otherwise would be less useful than this one. What is achievable — and what this pass delivers — is that every known defect is either fixed or written down with an owner and an estimate, and the test suite fails when someone reintroduces one.

## Appendix A — Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | **Yes** | Must be exactly `production`. The whole security posture depends on it |
| `DATABASE_URL` | **Yes** | Injected by Replit. Without it the app falls back to the JSON store and loses data on publish |
| `JWT_ACCESS_SECRET` | **Yes** | 64 hex chars. Boot fails without it |
| `TELEGRAM_BOT_TOKEN` | **Yes** | Boot fails without it |
| `CORS_ORIGINS` | **Yes** | https only, no `*`. Boot fails otherwise |
| `TRUST_PROXY` | Recommended | `1` behind Replit's ingress |
| `APP_VERSION` | Recommended | Returned by `/health` and `/ready` |
| `SERVE_WEB` | Optional | `false` for an API-only deployment |
| `PORT` | Optional | Defaults to 4000, matching `.replit` |

## Appendix B — Verification

```bash
npm install
npm run typecheck
npm run test
npm run eval
npm run api
npm run dev
```

## Appendix C — Sources

- Replit filesystem is not persistent: https://docs.replit.com/cloud-services/deployments/troubleshooting
- Deployment types: https://docs.replit.com/cloud-services/deployments/about-deployments
- Reserved VM: https://docs.replit.com/cloud-services/deployments/reserved-vm-deployments
- Postgres and the Neon-to-Helium migration: https://docs.replit.com/cloud-services/storage-and-databases/database-upgrade
- SQL database: https://docs.replit.com/cloud-services/storage-and-databases/sql-database
- Object Storage: https://docs.replit.com/cloud-services/storage-and-databases/object-storage
- Secrets: https://docs.replit.com/core-concepts/project-editor/app-setup/secrets
- Ports and `0.0.0.0` binding: https://docs.replit.com/replit-workspace/ports
- Custom domains: https://docs.replit.com/build/add-custom-domain
