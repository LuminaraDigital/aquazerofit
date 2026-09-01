# Production Readiness

Status of the production hardening checklist for AquaZeroFit, and the operational
procedures that have no code surface. Companion to `SECURITY.md` (how to report a
vulnerability) and `docs/specs/AQF-15_Runbook_and_Deployment_Guide.docx` (how to deploy).

Last verified: **2026-08-17**, against `main`.

---

## 1. Authentication, sessions and access control

| Control | Status | Where |
|---|---|---|
| HTTPS enforcement | **Enforced** | `apps/api/src/platform/https.ts` — plaintext GET redirects 308, plaintext POST refused 403, probes and ACME exempt. HSTS one year, `includeSubDomains`, `preload` via helmet in `app.ts`. |
| TLS certificate rotation | **Platform-managed** | Certificates are issued and rotated by the hosting ingress (Azure Container Apps / App Service managed certificates, or the equivalent on another managed host). Nothing in this repo pins or terminates TLS. Verify renewal is on in the portal after every domain change — see §7. |
| Password hashing | **bcrypt, cost 12** | `apps/api/src/modules/auth/service.ts`. Cost 4 under vitest for suite speed only. Hashes live in a `credentials` document keyed separately from the user record. |
| Session and token expiry | **15 min / 30 days** | Access JWT 15 minutes (`config.accessTtlSeconds`), refresh 30 days, single-use with rotation and family revocation on reuse (`platform/auth.ts`). Refresh tokens stored as SHA-256 only. |
| Protected routes | **All routers guarded** | Every module router calls `requireAuth`. The three deliberate exceptions are `/auth/*`, `/analytics/events` and `/challenges/peek` (public invite preview), plus `/telegram/webhook` which authenticates by shared secret. |
| Roles and permissions | **RBAC** | `requireAdmin` on the whole admin router. Role and tier are re-read from the live user record on every request, never trusted from JWT claims — a demoted admin loses access immediately rather than at token expiry. |
| One-time reset links | **Single-use, 30 min** | `confirmPasswordReset` consumes the token and revokes every live session for that user. Token compared with `secureEquals` (length-guarded `timingSafeEqual`). |
| Bot protection | **Cloudflare Turnstile** | `apps/api/src/platform/botProtection.ts` + `apps/web/src/components/auth/Turnstile.tsx`, on register and password-reset request (sign-in is deliberately unchallenged — the per-email lockout and per-IP lane cover it). Fails closed when the verifier is unreachable. **Requires `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY`**, both read by the API at runtime; the site key reaches the browser via `GET /auth/captcha`. Setting only one leaves protection OFF by design and logs `bot_protection_half_configured` — a secret without a site key would otherwise make the server demand a token the browser is never told to produce, locking everyone out of signup. |

## 2. Data, database and secret security

| Control | Status | Where |
|---|---|---|
| Server-side secrets | **Enforced** | `.env` and `.env.*` gitignored (`.env.example` excepted); `git ls-files` confirms no env file is tracked. The only client-visible values are `VITE_*`, which are public by construction (API base URL, media base URL, Turnstile *site* key). |
| Boot-time secret guard | **Fails fast** | `assertProductionSecrets()` refuses to start production without `JWT_ACCESS_SECRET`, `TELEGRAM_BOT_TOKEN`, `CORS_ORIGINS` (https, no `*`), a real mail transport, `MAIL_FROM` and `APP_PUBLIC_URL`. |
| Least-privilege database access | **Operator action** | The app needs only `SELECT/INSERT/UPDATE/DELETE` on `documents` plus `CREATE TABLE` on first boot. Provision a dedicated role rather than using the instance owner — see §6. |
| Row-level security | **Application-tier** | The store is a single `documents` table (container, id, doc). Isolation is enforced in code: every read filters on `userId === req.user.id` and a foreign id returns 404, not 403. Covered by `accountAccess.integration.test.ts`. Postgres RLS is **not** enabled — if the database is ever shared with another consumer, add it (§6). |
| No default public tables | **Verified** | Only `documents` exists, reachable solely through the API's connection string. |
| Multi-tenancy isolation | **Per-user** | This is a single-tenant-per-user product; the boundary is the user id, tested as above. |
| PII and data retention | **Automated** | 30-day deletion grace then hard purge (`sweepExpiredDeletions`, 6-hourly); meal photos deleted 24h after a job reaches a terminal state, stripped of EXIF on upload and never statically served; growth events pruned on a retention sweep. Audit events store a truncated hash of the email/Telegram id, never the raw value. |

## 3. Input validation, code execution and API security

| Control | Status | Where |
|---|---|---|
| XSS prevention | **No HTML sinks** | No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval` anywhere in `apps/web/src`. The coach's markdown renderer builds React text nodes. Admin-supplied media URLs are restricted to `http(s)` or relative `/uploads` paths, so `javascript:` and `data:` cannot enter the content library. |
| Injection prevention | **Parameterized** | `platform/pgStore.ts` uses positional parameters throughout; no string-built SQL. No shell execution anywhere in the request path. All request bodies parse through zod schemas in `packages/shared`. |
| CSRF | **Not applicable by design** | Authentication is a `Authorization: Bearer` header, never a cookie — the browser attaches nothing automatically, so a cross-site form post arrives unauthenticated. `SameSite` is moot because the app sets no cookies. |
| File upload restrictions | **Magic-byte equivalent** | Meal photos are size-capped and MIME-allowlisted by multer, then **re-encoded through sharp**: only bytes libvips can actually decode as an image survive, so the attacker-controlled multipart `Content-Type` proves nothing. Output is always baseline JPEG under a UUID name, stored outside the web root and served only through an authenticated, ownership-checked route. |
| Webhook signature verification | **Shared secret, fails closed** | `/telegram/webhook` requires `X-Telegram-Bot-Api-Secret-Token` to match `TELEGRAM_WEBHOOK_SECRET` via `secureEquals`. An unset secret rejects **every** request rather than trusting all — the endpoint grants paid entitlements. |
| Rate limiting | **Four lanes** | `platform/rateLimiter.ts`: 10/min per IP on `/auth`, 20/min on model-calling routes, 30/min on anonymous writes, 300/min default — plus a per-email lockout (5 failures → 15 min). |
| API contracts | **zod, shared** | Request and response shapes live in `packages/shared/src/schemas.ts` and are the same objects the client validates against. Error envelope is a closed union (`ERROR_CODES`). |

## 4. Infrastructure, reliability and operations

| Control | Status | Where |
|---|---|---|
| Debug/admin endpoints | **Locked down** | No debug routes exist. `/admin/*` is `requireAuth + requireAdmin`. Reset tokens are echoed only when `NODE_ENV=development` **and** `EXPOSE_DEV_TOKENS=true`. |
| Sanitized error handling | **Enforced** | `platform/errors.ts` maps everything unknown to a generic `INTERNAL` envelope; stack traces go to the console only. |
| Log redaction | **Enforced** | `redactUrl` in `platform/telemetry.ts` strips token-shaped query values (`reset`, `token`, `refresh_token`, `password`, `secret`, `code`, `signature`, `initdata`, …), keeping the key so a replayed reset link is still visible as a signal. Passwords and bearer tokens are never logged; audit rows carry hashed identifiers. |
| Audit trails | **Append-only event log** | `auditAuthEvent` / `auditDataAccess` write to the `audit` container with action, actor, IP and timestamp. **Not tamper-evident** — see "Known gaps" below. |
| Billing alerts | **Operator action** | §5. |
| Automated backups and DR | **Operator action** | §6. |
| Dependency scanning | **Gated in CI** | `npm run audit:prod` (`--omit=dev --audit-level=high`) blocks the build; a full-tree audit runs advisory-only. Dependabot opens weekly grouped PRs for npm and monthly for GitHub Actions, with majors split out so one migration cannot hold every security patch hostage. |
| Resilience patterns | **Implemented** | AI gateway: jittered exponential backoff, per-provider circuit breaker, provider fallback chain, and a deterministic offline engine as final graceful degradation. Log writes accept `Idempotency-Key`. Refresh rotation uses a compare-and-swap so two concurrent refreshes cannot both win. |
| Testing and CI | **Gated** | 836 tests (680 API, 156 web) across 80 files. CI runs typecheck → coverage-gated tests → safety eval → production audit → build on every push and PR. Coverage thresholds are a ratchet in each workspace's `vitest.config.ts`. |
| Documentation and standards | **Maintained** | ADRs in `docs/specs/AQF-05`, architecture in `AQF-04`/`AQF-24`, UML in `AQF-08`, runbook in `AQF-15`, test plan in `AQF-14`. Accessibility: semantic landmarks, `aria-label`/`aria-pressed` on icon controls, visible focus rings, `sr-only` state text, `role="alert"`/`role="status"` on live regions. |

---

## 5. Billing alerts (operator action)

Unbounded spend has two doors in this product: the AI providers, and the host.
The credit ledger caps what any single user can consume, but nothing in the
application can see a bill.

Set these outside the repo, once per environment:

- **AI providers** — usage or spend caps on every key in use. OpenAI (Settings →
  Limits: soft + hard monthly cap), Groq, Gemini and NVIDIA each expose their own.
  A hard cap is what actually stops a runaway; a soft cap only emails.
- **Azure** — a Cost Management budget on the resource group with alerts at 50 / 80 / 100 %
  of the expected monthly figure, delivered to a real inbox and not to a shared alias
  nobody reads.
- **Cloudflare / Resend** — plan-limit notifications on, so a Turnstile or mail
  volume spike surfaces as a message rather than as a failed signup.

Every AI call is already recorded through `logAiCall` with provider, model, tokens
and latency, so a spend spike can be attributed after the fact from stdout.

## 6. Backups and disaster recovery (operator action)

**Targets.** RPO **24 hours** (at most one day of logs lost), RTO **4 hours**
(service restored within half a working day). These suit a wellness tracker where
the data is user-generated history, not transactions — revise upward before any
clinical or paid-tier use.

**What must be backed up.** Only the Postgres `documents` table. Everything else
is rebuildable: the container image comes from the registry, seed content from
`apps/api/src/data/seeds`, and in-flight meal photos are deliberately ephemeral
(24-hour TTL) and out of scope.

**How.**

1. Enable the provider's automated backups with a **7-day** point-in-time
   retention window (Azure Database for PostgreSQL: Backup blade; other managed
   providers usually handle it automatically). This alone meets the 24-hour RPO.
2. Take a weekly logical dump to storage in a **different region** from the
   database, so a regional outage does not take the backups with it:
   ```bash
   pg_dump --format=custom --no-owner "$DATABASE_URL" > aqf-$(date +%F).dump
   ```
3. Restore drill **quarterly** — restore the newest dump into a scratch database,
   point a staging API at it, and confirm sign-in plus one day of logs. A backup
   nobody has restored is a hypothesis, not a backup. Record the date and the
   measured restore time in the runbook.

**Recovery order.** Restore database → redeploy the API image (stateless) →
confirm `/ready` returns 200 → confirm sign-in and one authenticated read.

**Least-privilege role.** Provision the application's own role rather than reusing
the instance owner, and use the owner only for migrations and restores:

```sql
CREATE ROLE aqf_app LOGIN PASSWORD '<generated>';
GRANT CONNECT ON DATABASE aquazerofit TO aqf_app;
GRANT USAGE ON SCHEMA public TO aqf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO aqf_app;
```

Create the `documents` table as the owner first — the app creates it on boot only
because it currently connects with rights to do so.

## 7. Deployment verification

After every deploy, and after any domain or certificate change:

```bash
curl -sI http://<domain>/ | head -3
```

Expect `HTTP/1.1 308` and a `Location:` on `https://`. Then:

```bash
curl -sI https://<domain>/api/v1/../health | grep -i strict-transport
```

Expect `strict-transport-security: max-age=31536000; includeSubDomains; preload`.
Check the boot log for `bot_protection_disabled` and `trust_proxy_mismatch` — both
are single-line JSON warnings that mean a required setting is missing or wrong.

---

## Edge TLS and duplicate HSTS

A managed host's edge typically performs the HTTP→HTTPS redirect itself and
adds its own HSTS header, so a response carries **two** `Strict-Transport-Security`
headers. Per RFC 6797 a browser honours the first and ignores the rest, so the
edge's `max-age=63072000` (no `preload`) wins and the app's `preload` directive
is inert there. That is harmless — the app-level enforcement in `platform/https.ts`
remains correct defence in depth for any host without such an edge — but do not
expect the domain to be preload-eligible on the strength of the app header alone.

## Known gaps

Recorded honestly rather than closed off, because each is a real decision with a cost:

- **Audit trail is append-only, not tamper-evident.** Events cannot be edited
  through any API, but an actor with database access could rewrite them. A hash
  chain over each event would fix it; it has not been built.
- **Tokens live in `localStorage`.** An XSS would exfiltrate a session. The
  mitigations in place are the absence of any HTML sink, a strict CSP, and a
  15-minute access lifetime. Moving the web session to an httpOnly cookie is the
  real fix, and would need a separate path for the Telegram Mini App, which has no
  usable cookie jar.
- **Dev-tree advisories remain** (`esbuild` → `vite` → `vitest`). Reachable only by
  someone who can already run this repo's dev server; the fix is a Vite 8 major
  upgrade, tracked by Dependabot as its own PR. The **production** tree is clean.
- **Rate limiter and login lockout are per-process.** Correct on a single
  instance; on a horizontally scaled deployment each replica keeps its own
  counters, multiplying the effective limit by the replica count. A shared Redis
  store is the fix when scaling out.
