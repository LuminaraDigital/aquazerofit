# Production security checklist — audit and implementation plan

**Date:** 2026-08-29 · **Branch:** `feat/android-app` · **Commit:** `9050386`

Audit of the repository against a 10-item production hardening checklist.
Every status below was established by reading the code, not by assuming the
checklist's framing applies. Three items do not map onto this stack as
written; where that is the case the *underlying risk* is restated and the
codebase is audited against that instead.

Complements [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md), which covers
a broader surface. This document is scoped to the ten items only.

## Result

| # | Item | Status |
| --- | --- | --- |
| 1 | RLS bypass / `SECURITY DEFINER` | **N/A** — no RLS engine. Application-level analog verified sound. |
| 2 | Non-sequential resource IDs | **PARTIAL** — two weak generators outside the UUID path. |
| 3 | MFA on admin portals | **PARTIAL** — fully built, not enforced in production. |
| 4 | Cache-Control on authenticated pages | **PASS** |
| 5 | Dangling DNS records | **UNVERIFIED** — operational, cannot be settled from the repo. |
| 6 | GitHub Actions SHA pinning | **PASS** — but two unrelated CI findings surfaced. |
| 7 | Source maps excluded from production | **PASS**, implicitly. |
| 8 | Webhook replay prevention | **PASS** |
| 9 | SRI for third-party scripts | **N/A by design** — but a CSP drift was found here. |
| 10 | Token/password scrubbing in logs | **PASS** |

Six pass, two partial, two need work that is not the work the checklist
describes. The most serious finding in this audit is not on the checklist at
all — it is item 6's neighbour, below.

## Status — 2026-08-29

Every code item below is **done and verified**. The audit text is kept as
written so the reasoning survives; this block records what changed.

| Item | Done | Verified by |
| --- | --- | --- |
| P0 release key reachable from a PR | Split into `android-verify.yml` (no secrets) and `android-release.yml` (tags + `environment: release`) | Parsed triggers; `grep -c 'secrets\.'` → verify 0, release 10 |
| P1 admin MFA unenforced | `MFA_REQUIRE_ADMIN` added to `assertProductionSecrets()` | Real boot refuses without it |
| P1 CSP drift | Turnstile in `script-src` + `frame-src`; `media-src` restored; parity test added | Removed the origin → 2 named failures; restored → 189 pass |
| P2 `Math.random()` ids | `crypto.randomUUID()` in `ai/util.ts`, `creditLedger.ts` **and `guardrails.ts`** (a third site the audit missed) | Typecheck + full suite |
| P2 workflow permissions | `contents: read` on all three workflows | Parsed |
| P3 source maps / SRI | `sourcemap: false` explicit; `crossOrigin` on Turnstile; **no `integrity` added** | `dist` has 0 `.map`, 0 `sourceMappingURL` |
| P3 rotation runbook | `docs/OPERATIONS.md` §Rotating `TELEGRAM_WEBHOOK_SECRET` | Code citations spot-checked |

### Found during the work, not in the original audit

1. **R8 stripped the ML Kit component registrars** — barcode scanning crashed
   in release builds only. Fixed with a keep rule; see
   `docs/android-build/PRODUCTION_READINESS.md` §1. This is the one that would
   have shipped.
2. **Reaction delivery burned achievements on every new account.** The ack
   marked *everything earned* seen while the card showed at most three. Now the
   read records what it displayed and the ack marks exactly that.
   `seenRankId` was also being written unconditionally and could rewind.
3. **Android sign-up was impossible in any production configuration.**
   `AUTH_ALLOW_CAPTCHALESS_MOBILE` is boot-fatal, `verifyPlayIntegrity` is a
   stub, and the client never sent `captchaToken`. Closed by adding a Turnstile
   challenge surface to the Android client and a `/mobile/captcha` page for it
   to load.
4. **Production could boot with bot protection entirely off** on nothing but a
   `console.warn`. `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` are now
   required in production. **This makes a Cloudflare Turnstile widget a hard
   prerequisite for the production deploy.**

### Still open — none of it code

- **DNS audit** of `aquazero.fit` and `app.aquazerofit.com` (registrar access).
- **A Turnstile widget** must exist before production will boot. Free; the
  domain need not use Cloudflare DNS; adding the root `aquazero.fit` covers all
  subdomains. Cloudflare's test keys (`1x00000000000000000000AA` /
  `1x0000000000000000000000000000000AA`) unblock local work meanwhile.
- **A live Turnstile challenge has never been solved end to end.** Both halves
  of the `AzfCaptcha` bridge are built and unit-tested; nothing has exercised a
  real widget. Note debug builds point `WEB_BASE_URL` at production while the
  API points at `10.0.2.2`, so a local end-to-end run needs one of them
  overridden.
- **TalkBack pass**, **Play Console paperwork**, and a **functional on-device
  smoke test** behind a live API — the barcode scanner especially, since that is
  what the R8 defect broke.
- **Two feature-module import cycles** (`coach ↔ gamification`,
  `settings ↔ onboarding`) mean `docs/plans/ANDROID_MODULARISATION.md` cannot be
  executed as written. Architectural debt, not a release blocker.

---

## P0 — Release signing key is reachable from a pull request

`.github/workflows/android-release.yml` triggers on `pull_request` and consumes
`AZF_KEYSTORE_BASE64`, `AZF_KEYSTORE_PASSWORD`, `AZF_KEY_ALIAS` and
`AZF_KEY_PASSWORD`. A pull request from a branch in this repository runs with
access to those secrets **and** with the workflow file as the PR author wrote
it. Anyone who can push a branch can rewrite the "Decode Release Keystore" step
to print the key to the log or send it elsewhere.

The upload signing key for a published Play listing cannot be rotated without
Google's intervention. This is the one secret in the repository whose
compromise is not recoverable by re-issuing it.

Note this is exactly the class of risk item 6 exists to prevent — the actions
are correctly pinned, and then the pipeline hands its most valuable secret to
untrusted workflow content anyway.

**Fix.** Split the workflow in two:

- A `pull_request` job that runs `ktlintCheck detekt lintRelease test` and
  `assembleDebug`. No secrets, no `assembleRelease`.
- A signing job gated on `push` to tags (`v*.*.*`) plus a GitHub Environment
  with required reviewers, which is what actually holds the secrets.

Verify afterwards that a PR run shows the keystore step skipped rather than
failing on an empty secret.

## P1 — Admin MFA is built but not enforced

`apps/api/src/modules/mfa/middleware.ts` is a complete step-up gate:
`requireAuth → requireAdmin → requireFreshMfa`, TOTP verified against a
step-up record bound to the presenting access token. An admin who enrols is
protected immediately, regardless of configuration.

The gap is the unenrolled admin. `config.mfaRequireAdmin` reads
`MFA_REQUIRE_ADMIN` and defaults to **false**, and on that path the request is
audited, logged loudly, and **allowed through**. `assertProductionSecrets()`
checks `JWT_ACCESS_SECRET`, `TELEGRAM_BOT_TOKEN`, `CORS_ORIGINS`, the mail
transport and the captcha bypass — but not this. A production deployment can
therefore boot with `GET /admin/users`, which returns every account on the
platform, behind a password alone.

The middleware's own comment is candid about this being a migration posture.
Production readiness is where the migration ends.

**Fix.** Add `MFA_REQUIRE_ADMIN` to the `assertProductionSecrets()` guard so
the process refuses to start in production without it — the same treatment
`AUTH_ALLOW_CAPTCHALESS_MOBILE` already gets, and for the same reason: an
operator forgetting is the failure mode, and a boot failure is the only
enforcement that survives it. Enrol the existing admin account first, or the
guard locks you out of your own panel.

## P1 — CSP drift blocks Turnstile on the static host

Two content security policies exist and they have diverged:

| Source | `script-src` includes Turnstile? | `frame-src`? |
| --- | --- | --- |
| `apps/api/src/app.ts` (helmet) | Yes — `TURNSTILE_ORIGIN` | Yes |
| `apps/web/staticwebapp.config.json` | **No** | **Absent** (falls back to `default-src 'self'`) |

Where the SPA is served by Azure Static Web Apps rather than by Express, the
Cloudflare Turnstile script is blocked and its challenge iframe with it. The
bot challenge on registration and password reset is the control that fails, so
the visible symptom is a form nobody can submit — and the security-relevant
outcome is whatever the failure path does when the widget never loads.

The Express comment is explicit that the directive must be present
unconditionally because a CSP cannot vary per response. The static host config
did not get the same edit.

**Fix.** Add `https://challenges.cloudflare.com` to `script-src` and a
`frame-src 'self' https://challenges.cloudflare.com` directive in
`staticwebapp.config.json`. Then add a test that asserts the two policies list
the same third-party origins, so the next divergence fails in CI rather than
on a registration form.

## P2 — Two ID generators fall back to `Math.random()`

Item 2's control is met on the main path: `store.newId()` is
`crypto.randomUUID()`, and `vision/router.ts` deliberately uses
`crypto.randomUUID` for job ids with a comment naming enumerability as the
reason.

Two helpers do not:

- `apps/api/src/modules/ai/util.ts` — `newId(prefix)`
- `apps/api/src/modules/ai/creditLedger.ts` — `txId()`

Both compose `Date.now()` in base 36, a module-level counter that increments
predictably, and four base-36 characters from `Math.random()`. That is roughly
20 bits of non-cryptographic entropy attached to a timestamp an attacker
already knows and a counter that reveals volume. `Math.random()` is not a
CSPRNG and V8's state is recoverable from enough outputs.

`ai/util.ts`'s `newId` is imported by the chat, vision and progress routers, so
it names real user documents. Exploitation still requires defeating the
ownership checks in §1 below, so this is defence-in-depth rather than a live
IDOR — but it is a one-line fix and the codebase already knows the rule.

**Fix.** Replace both bodies with `crypto.randomUUID()` behind the existing
prefix convention, keeping the prefixes so existing log greps and any stored
references still read the same. Check for stored ids with a length assumption
before changing the format.

## P2 — Workflows run with default token permissions

Neither `ci.yml` nor `android-release.yml` declares a `permissions:` block, so
`GITHUB_TOKEN` receives the repository default — historically read/write on
every scope. Neither workflow writes anything to the repository.

**Fix.** Add `permissions: contents: read` at the top of both files.

## P3 — Make the source-map exclusion explicit

`apps/web/vite.config.ts` sets no `build.sourcemap`, and Vite's default is
`false`, so production maps are already not emitted. The control is met by
default rather than by decision, which is a fragile way to hold a security
property.

On Android the equivalent artifact is R8's `mapping.txt`. The release workflow
uploads only `*.apk` and `*.aab`, so it is not published — correct, though it
also means no deobfuscated crash reports until it is archived somewhere
private.

**Fix.** Set `build: { sourcemap: false }` explicitly with a comment, or
`'hidden'` if maps are ever uploaded to an error tracker.

## P3 — DNS audit (cannot be settled from the repository)

Item 5 is operational. The repository references these first-party hostnames,
which is the list to start from — note two distinct apex domains:

```
aquazero.fit          app.aquazero.fit          api.aquazero.fit
app.aquazerofit.com
```

**Fix.** Enumerate every record on both zones and delete any `CNAME`/`A`
pointing at a decommissioned host — old Vercel, Azure, Replit, S3 or Zendesk
targets are the usual finds. `app.aquazerofit.com` is worth particular
attention: it appears in the codebase alongside `app.aquazero.fit`, which
suggests one of the two is a migration leftover.

## P3 — Document the webhook secret rotation

Item 8's substance is met (§8 below). The residual is that
`TELEGRAM_WEBHOOK_SECRET` is a long-lived bearer credential with no rotation
procedure written down.

**Correction to an earlier draft of this document.** It prescribed calling
`setWebhook` first and updating the environment second. That is backwards, and
the reason matters. `config.telegramWebhookSecret` returns a single value, so
`secretMatches` can only ever accept one secret — there is no dual-secret
window, and every rotation has a gap where deliveries are refused with 401.
Calling `setWebhook` first opens that gap for the whole length of the deploy
and a rollback makes it worse; setting the environment first bounds it to one
curl and leaves the old pairing intact during the slow step, so an auto-rollback
self-heals. **Environment first, then `setWebhook`.**

The gap is not free: `completePayment` is idempotent on the charge id and
Telegram redelivers non-2xx, so a refused `successful_payment` settles late
rather than being lost — but `answerPreCheckoutQuery` runs on a ten-second
clock, so a `pre_checkout_query` arriving mid-window is a cancelled purchase.
Rotate at low traffic. The buy button stays live throughout, because
`starsAvailable()` gates on `botConfigured()` — the bot token alone — and never
consults the webhook secret.

**Status: done.** `docs/OPERATIONS.md` now carries the procedure, the cost of
the window, the verification steps, and four honest open questions — including
that no dual-secret cutover exists and that the procedure has never been run.

---

## Items requiring no work, and why

### 1. RLS bypass / `SECURITY DEFINER` — not applicable

There is no Supabase, no RLS, no `CREATE POLICY`, and no SQL function anywhere
in the repository. Persistence is a document store: a single table
`documents(container, id, doc JSONB)` in `apps/api/src/platform/pgStore.ts`,
reached by one application-owned connection pool. There is no second database
principal for a policy to distinguish, so `SECURITY DEFINER` has nothing to
bypass.

The risk the item exists for — a caller reading another user's rows — moves
entirely into application code. Audited there, it holds:

- Every authenticated router derives the subject with `userIdOf(req)` from the
  verified access token. The user id is never read from a path parameter, a
  query string or a body field.
- Services take `userId` as their first argument and scope on it.
  `deleteMealLog` calls `getMealLog(userId, id)` purely as an ownership check
  before deleting.
- 36 `requireAuth` mounts across the module routers. The two routers without
  it are `auth` (pre-authentication by definition) and `payments` (the Telegram
  webhook, which authenticates by shared secret — §8).

This is the correct analog and it is enforced by construction rather than by
per-route vigilance. **Worth adding:** a test that asserts every service
function taking an `id` also takes a `userId`, so the property is defended
mechanically rather than by review.

### 4. Cache-Control — pass

`apps/api/src/modules/index.ts` applies `private, no-store, max-age=0` to the
entire API surface before any route runs, with a narrow, default-closed
allowlist for published catalogue content. Two details are handled correctly
that are usually not:

- The default is written with `setHeader` **before** `next()`, so a handler
  that sets its own policy later — the chat SSE stream, the meal-photo route —
  overwrites it rather than being clobbered.
- The public upgrade is deferred to `writeHead` time, so an expired token's
  401 can never be stamped `public, max-age=300` and served to everyone else
  for five minutes.

The allowlist comments name the routes deliberately excluded and why
(`GET /exercises` filters against the caller's injuries; `GET /coaches` ships
per-user entitlements). That is the reasoning the item asks for.

### 6. GitHub Actions pinning — pass

All seven `uses:` entries across both workflows are full 40-character commit
SHAs with the version in a trailing comment, exactly the pattern the checklist
prescribes. The two findings above are adjacent to this item, not failures of
it.

### 8. Webhook replay prevention — pass

`apps/api/src/modules/payments/router.ts`:

- Authenticates on Telegram's `X-Telegram-Bot-Api-Secret-Token` via
  `secureEquals` (constant-time), and **fails closed** — an unset secret
  rejects everything rather than trusting everything.
- Always answers 200, because Telegram redelivers any non-2xx and a malformed
  payload would otherwise loop forever.
- Grants idempotently on `telegram_payment_charge_id`, so a redelivered
  `successful_payment` cannot create a second purchase against an append-only
  ledger.
- Prices from the roster, never from the request.

Telegram does not sign webhook deliveries with a timestamp the way Stripe
does, so the checklist's "reject anything older than five minutes" has no
value to read. Idempotency on the charge id is the control that actually
closes the replay-to-double-grant path, and it is present.

Separately, Telegram Mini App `initData` **is** timestamp-checked:
`apps/api/src/modules/auth/telegram.ts` verifies the HMAC-SHA256 with
`crypto.timingSafeEqual` and rejects anything where
`now - auth_date > TG_AUTH_MAX_AGE_SECONDS` (600). That is the checklist's
pattern implemented in full, on the surface where it applies.

### 9. SRI — not applicable, deliberately

`apps/web/index.html` loads no third-party script tag. Two scripts are injected
at runtime, both only when needed:

| Script | Where | URL form |
| --- | --- | --- |
| Telegram WebApp SDK | `src/lib/telegram.ts` | `telegram.org/js/telegram-web-app.js` |
| Cloudflare Turnstile | `src/lib/turnstile.ts` | `challenges.cloudflare.com/turnstile/v0/api.js` |

**Neither can take an `integrity` hash.** Both are unversioned, rolling URLs
that the vendors update in place; pinning a hash would take out the Mini App
launch path and the registration bot challenge on the vendor's next push. This
is a known limitation of SRI against rolling CDN endpoints, not an oversight.

The control that does apply is CSP origin allowlisting, which is present — and
which is where the P1 drift above was found. Adding SRI here would be an
outage, so this reasoning is recorded to stop a future audit from "fixing" it
into one.

Minor: `telegram.ts` sets `script.crossOrigin = 'anonymous'`; `turnstile.ts`
does not. Worth matching for consistent error reporting, though it changes
nothing about integrity.

### 10. Log scrubbing — pass

`apps/api/src/platform/telemetry.ts` is more thorough than the checklist asks
for:

- `redactUrl` replaces sensitive query *values* while keeping the keys —
  knowing *that* a reset link was replayed is the operational signal worth
  having.
- `scrubLogFields` normalises keys before matching, so `X-Api-Key`, `api_key`
  and `apiKey` all collapse to one denylist entry. It distinguishes exact-match
  keys (`code`, `reset`, `signature` — too ordinary to match as substrings in a
  barcode-scanning app) from fragment-match keys.
- It is defensive because it runs inside a logger: cycles detected, depth
  capped at 6, arrays truncated at 200, `BigInt` stringified.
- `requestLogger` emits only method, redacted path, status and duration. No
  headers, no bodies.

The redaction lives inside `logEvent` rather than at the call sites, which the
comment justifies precisely: *"remember to redact" is a rule that gets
forgotten exactly once before a token is in stdout forever.*

**Android is clean too.** Zero `Log.*` or `printStackTrace` calls in the main
source set. OkHttp logging is `debugImplementation` only, at `BASIC` level,
with `redactHeader("Authorization")`, and the release source set ships a no-op
twin of `NetworkLogging` so the interceptor cannot reach a release build.

---

## Ordered plan

| Step | Work | Priority | Verify |
| --- | --- | --- | --- |
| 1 | Split `android-release.yml`; secrets move behind a tag trigger + protected Environment | P0 | Open a PR; the keystore step must be skipped, not failed |
| 2 | Enrol TOTP on the admin account | P1 | `POST /auth/mfa/enroll`, then a step-up challenge succeeds |
| 3 | Add `MFA_REQUIRE_ADMIN` to `assertProductionSecrets()` | P1 | Boot with it unset in `NODE_ENV=production` → refuses to start |
| 4 | Add Turnstile origin + `frame-src` to `staticwebapp.config.json`; add the CSP-parity test | P1 | Registration form renders the widget on the SWA host |
| 5 | `crypto.randomUUID()` in `ai/util.ts` and `creditLedger.ts` | P2 | `npm run test --workspace apps/api` |
| 6 | `permissions: contents: read` on both workflows | P2 | Workflows still green |
| 7 | Explicit `build.sourcemap: false`; `crossorigin` on the Turnstile tag | P3 | `npm run build` emits no `.map` |
| 8 | DNS audit of both apex zones | P3 | Manual; record the result here |
| 9 | Webhook secret rotation runbook in `OPERATIONS.md` | P3 | Review |

Steps 1–4 are the production blockers. Steps 5–9 are hardening and can follow
the release.

Every code step is covered by `npm run verify` plus, for the Android workflow,
`cd apps/android && ./gradlew ktlintCheck detekt test assembleDebug`.
