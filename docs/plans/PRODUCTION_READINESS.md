# Production readiness plan

Status: **remediation complete for API and web; Android release BLOCKED.**

Verified after the work: `npm run verify` exit 0 (apps/api 66 test files, up from
58; web/shared 26, up from 25; AI safety eval gate passed). Android
`ktlintCheck detekt testDebugUnitTest lintDebug assembleDebug assembleRelease`
exit 0, 303 tests unchanged, lint 29 errors -> 0.

**Do not ship the Android release.** `app/build.gradle.kts` falls back to an
unsigned build when no keystore is present, and `android-release.yml` never
materialises one -- it passes `AZF_KEYSTORE_PATH` (a path) with no decode step.
A green release workflow therefore produces `app-release-unsigned.apk`. See
POST_AUDIT_FINDINGS below.

This plan answers a 15-point performance-and-security checklist against the
actual tree. Every status below was verified by reading the code or running the
build — nothing is assumed from the presence of a dependency.

The checklist was written for a Next.js + Supabase stack. This is a Vite/React
SPA, an Express API and a document store over `pg`. Four items therefore do not
apply as written, and two of those hide a **larger** problem than the one they
name. Those are called out rather than quietly marked N/A.

## Verified status of all 15 items

| # | Item | Status | Evidence |
|---|---|---|---|
| P1 | Image optimisation | **Partial** | `sharp` re-encodes and strips EXIF, but never resizes; JPEG only |
| P2 | Loading & optimistic UI | **Partial** | `Skeleton`/`PageSpinner`/`EmptyState`/`ErrorState` exist; 35 files use loading state; optimistic covers 3 mutations |
| P3 | Client & server caching | **Done (client)** | TanStack Query, `staleTime: 30_000`, `refetchOnWindowFocus: false`, per-query overrides |
| P4 | Bundle / code splitting | **Done** | Route-level `lazy()` throughout; build emits 56 chunks |
| P5 | Database indexing | **Does not apply — bigger problem underneath** | No relational schema; see §1 |
| S1 | RLS / `SECURITY DEFINER` | **Does not apply** | No Supabase, no RLS, no SQL functions; authorisation is app-level |
| S2 | CDN `Cache-Control` on authed routes | **Gap** | No `Cache-Control` on any `/api/v1/*` JSON response |
| S3 | Dangling DNS records | **Cannot verify from repo** | Requires a DNS dashboard audit |
| S4 | GitHub Actions SHA pinning | **Gap** | All 7 `uses:` refs are mutable tags |
| S5 | Webhook signature & replay | **Done** | Constant-time secret compare, fails closed, idempotent on charge id |
| S6 | Source maps excluded | **Done** | `find dist -name '*.map'` → 0 |
| S7 | Subresource Integrity | **Mostly N/A** | No external `<script>`; CSP is the operative control |
| S8 | Non-sequential IDs | **Done** | `newId()` = `crypto.randomUUID()` |
| S9 | Log redaction | **Partial** | `redactUrl` scrubs query params; `logEvent` payloads unscrubbed |
| S10 | MFA on admin | **Gap** | `requireAdmin` is role-only; no TOTP/WebAuthn anywhere |

Five items are already done, two do not apply, one is external. **Four are real
gaps and three are partial.** The rest of this plan is those seven, plus the one
problem the checklist did not ask about and should have.

---

## 1. The item the checklist got wrong, and what is actually underneath it

"Add B-Tree indexes on foreign keys; run `EXPLAIN ANALYZE`" assumes a
relational schema. There is not one. `apps/api/src/platform/pgStore.ts` defines
exactly one table:

```sql
CREATE TABLE IF NOT EXISTS documents (
  container   TEXT NOT NULL,
  id          TEXT NOT NULL,
  doc         JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (container, id)
);
```

Postgres is a **durability mirror**, not a query engine. Every read is served
from an in-process `Map`. `MemoryBackedStore.where()` is:

```ts
where<T>(name, pred) { return [...this.container(name).values()].filter(pred); }
```

That materialises the **entire container** into a fresh array on every call,
then scans it. `mealLogsForDate(userId, date)` walks every meal log, water log,
weight log and idempotency record belonging to **every user in the system** to
find one day for one person. Same for `waterTotalForDate` and
`weightLogsInRange`. Adding an index is not available as a fix; there is nothing
to index.

Two consequences, in order of severity.

**1a. The deployment cannot scale past one instance.** `pgStore.ts` says so
itself, and it is worth quoting because it is the single most important fact
about this system's production posture:

> This gives durable persistence for a SINGLE instance. It does NOT make the
> app multi-instance / Autoscale safe. Every instance hydrates its own in-memory
> copy at boot and never re-reads; a write on instance A is invisible to
> instance B until B restarts, and last-writer-wins at the row level will
> silently drop the other instance's version of a document.

The one exception is refresh-token rotation, which does a genuine atomic
`UPDATE` against the database — so session anti-theft is multi-instance safe
even though app data is not. Everything else is not. Running two instances does
not degrade performance; it **silently loses user data**. Health logs, at that.

**1b. Read cost is O(container) and memory is O(all data).** Every user's
working set is resident in RAM on every instance, and the `logs` container
grows without bound — it holds idempotency records alongside the logs.

### The fix, staged

**Stage 1 — pin the deployment closed (do this first, it is one line of
config).** Set `max-instances=1` / single Reserved VM and make it explicit in
the deploy config, not folklore. Add a boot-time assertion that refuses to start
if an instance-count env var says otherwise. This does not fix anything; it
stops the data-loss failure mode from being one autoscale toggle away.

**Stage 2 — secondary indexes in memory.** Cheapest real win. Keep the
architecture, add maintained indexes to `MemoryBackedStore`: a
`Map<container, Map<indexKey, Set<id>>>` updated in `upsert`/`delete`. Give
`logs` an index on `userId|type|localDate`. `mealLogsForDate` becomes a Map
lookup. No call-site changes, no async refactor, no schema migration. This is
the highest ratio of benefit to risk on this list.

**Stage 3 — sweep the `logs` container.** Idempotency records carry an
`expiresAt` and a 24h TTL but nothing prunes them. Add a periodic sweep. Until
Stage 2 lands this is also a direct read-latency win, because every expired
record is scanned on every log query.

**Stage 4 — the async `getStore()` refactor.** The comment in `store.ts` names
this as known outstanding work across ~77 call sites. Only this unlocks
horizontal scale. It is a large, separate project and should not be started
until Stages 1–3 are done and the tree is quiet — the same precondition
`ANDROID_MODULARISATION.md` sets for itself.

Do **not** add Redis (checklist P3's backend half). There are no SQL queries to
cache; a second cache in front of an in-memory store adds a coherence problem
and solves nothing.

---

## 2. Real gaps, in priority order

### 2a. `Cache-Control` on authenticated API responses (S2)

Static assets and `index.html` are handled correctly in `app.ts`, meal photos
are `private, no-store`, and chat SSE is `no-cache`. But `GET /api/v1/me/profile`
and every other authenticated JSON route returns **no `Cache-Control` header at
all**. `apps/web/staticwebapp.config.json` shows an Azure Static Web Apps edge
in the picture, so this is not hypothetical.

**Fix:** one middleware on the API router, before the module mounts:

```ts
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  next();
});
```

Then let the few genuinely cacheable public routes (exercise catalogue, coach
roster) opt out explicitly. Default closed, opt in — not the reverse.

**Test:** assert the header on an authenticated route and on the public
catalogue in the existing supertest suite.

### 2b. MFA on admin (S10)

`adminRouter.use(requireAuth, requireAdmin)` is correct as far as it goes, and
`auditDataAccess` records every admin action. But `requireAdmin` checks a role
on a password-authenticated session. There is no TOTP, WebAuthn or step-up
anywhere in the tree. `/admin/users` lists every account.

**Fix:** TOTP is the proportionate choice — WebAuthn needs a credential store
and a recovery flow this codebase does not have yet. Enrolment on the account,
a `requireFreshMfa` middleware in front of `adminRouter`, a short step-up window
so a single admin session does not re-prompt continuously, and recovery codes
issued once at enrolment. The audit log already exists to record the step-up.

### 2c. GitHub Actions SHA pinning (S4)

All seven `uses:` refs across `ci.yml` and `android-release.yml` are mutable
tags (`actions/checkout@v5`, `gradle/actions/setup-gradle@v3`, …). `ci.yml` runs
`npm ci` and the safety eval gate; `android-release.yml` holds the four signing
secrets. A repointed tag on either is a supply-chain compromise with the
keystore password in reach.

**Fix:** pin all seven to full commit SHAs with the version in a trailing
comment. Add Dependabot's `github-actions` ecosystem so the pins are maintained
rather than frozen — an unmaintained pin is its own risk.

### 2d. Image resizing (P1)

`toStorableJpeg` is genuinely good on the security and privacy axes: it decodes
through libvips (so the multipart `mimetype` header is not trusted), applies
EXIF orientation, and discards every metadata block — which matters, because a
phone photo carries GPS at home-address precision and these are health-adjacent
records. That reasoning is sound and should not be disturbed.

What is missing is the performance half. The pipeline is:

```ts
sharp(buffer).rotate().jpeg({ quality: 82 }).toBuffer()
```

No `.resize()`. A 12-megapixel phone photo is stored at 4000×3000 and served at
that size into a card a few hundred pixels wide.

**Fix:**
- Add `.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })` before
  the encode. 1600px is comfortably above what the vision model needs and an
  order of magnitude below a raw capture.
- Emit a WebP alongside the JPEG and serve it by `Accept` negotiation, keeping
  JPEG as the fallback. Note this changes the "every stored photo is JPEG"
  invariant that `visionRouter` line 367 relies on, so the served content type
  must become a property of the stored record rather than a constant.
- Add `loading="lazy"` and explicit `width`/`height` to all 16 `<img>` tags in
  the web app. None currently has either; the dimensions also fix layout shift.

### 2e. `logEvent` payload redaction (S9)

`redactUrl` correctly scrubs a denylist of sensitive query parameters, and the
request logger deliberately logs no bodies or headers — the hard part is
already right. The gap is that `logEvent(name, payload)` writes its payload
verbatim, and call sites pass freeform objects.

**Fix:** a recursive key-matching scrubber inside `logEvent` itself, reusing the
existing denylist, so redaction cannot be forgotten at a call site. Extend the
denylist with `creditCard` and `cookie` while there.

---

## 3. Partial items worth finishing

### 3a. Optimistic UI coverage (P2)

The pattern is established and correct — `onMutate` with rollback in
`useUpdateMemoryFact`, `useDeleteMemoryFact` and `WaterCard`. It has simply not
been applied to the highest-frequency writes: logging a meal, logging weight,
completing a set. Those are the actions where latency is most visible.

**Fix:** extend the existing pattern; no new dependency. Note the Android client
already solves this properly with the outbox — the web app is the one behind.

### 3b. Vendor chunk (P4)

Code splitting is done well: 56 chunks, every route lazy. The one remaining
lump is a 348 kB (109 kB gzip) `index` chunk holding React, React DOM, React
Router and TanStack Query together. That is not alarming, and splitting it
mainly helps repeat visits by letting the vendor half stay cached across
deploys. Low priority.

---

## 4. What I could not check

**S3, dangling DNS records**, is genuinely outside the repository. It needs
someone with the DNS dashboard to walk every CNAME and A record and confirm the
target still exists — particularly any subdomain that ever pointed at a
preview deployment. Worth a calendar reminder, not a code change.

---

## Suggested order

Each step should end green before the next starts.

1. **Pin instance count to 1** (§1 Stage 1) — config only, removes a silent
   data-loss mode.
2. **`Cache-Control` middleware** (§2a) — one middleware, two tests.
3. **Pin GitHub Actions to SHAs** (§2c) — mechanical, protects the signing keys.
4. **`logEvent` scrubber** (§2e) — small and self-contained.
5. **Image resize + lazy loading** (§2d) — user-visible speed win.
6. **In-memory secondary indexes + `logs` sweep** (§1 Stages 2–3) — the real
   performance work.
7. **Admin MFA** (§2b) — needs enrolment, recovery and step-up UX; size it
   properly.
8. **Optimistic UI on hot writes** (§3a).
9. **Async `getStore()` refactor** (§1 Stage 4) — its own project, its own
   quiet tree.

Steps 1–5 are small and independent. Step 6 is the one that changes how the
system behaves under load. Step 9 is the one that decides whether this can ever
run on more than one box.

## Preconditions

The same two this repo already sets for `ANDROID_MODULARISATION.md`: a single
writer for anything touching the store, and a green baseline to verify against.
`npm run verify` is that baseline, and the safety eval inside it is a release
gate that must not be worked around.


---

# Post-audit findings (adversarial review)

Ranked. S1 and S5 block the Android release; nothing blocks API or web.

## S1 — BLOCKER: the release build is unsigned and nothing checks

`apps/android/app/build.gradle.kts:67` — `if (releaseKeystore.exists())`. No
keystore, no signing config, build still succeeds. `android-release.yml` has no
`base64 -d` step and never writes a `.jks`. Confirmed: the local artifact is
literally `app-release-unsigned.apk`.

**Fix:** decode the keystore from a base64 secret in CI, add an `apksigner
verify` step, and FAIL the build when the keystore is absent rather than
silently producing an unsigned artifact.

## S5 — The Android quality gate is not a gate

`android-release.yml` runs only `./gradlew test`. No `ktlintCheck`, no `detekt`,
no `lintDebug`. The 29->0 lint fix is enforced only on whoever remembers to run
it locally. Also: `app/src/androidTest/` does not exist -- zero instrumented
tests for an app whose core is offline sync.

**Fix:** add `ktlintCheck detekt lintDebug` to the workflow ahead of `test`.

## S3 — Half-finished locale migration

13 `Locale.getDefault()` sites remain. Worst: `AquaCalendarPicker.kt:259-263`
top-level `DateTimeFormatter` vals capture locale at class-init, while the
weekday row above them was migrated. Changing system language now leaves the
widget internally inconsistent until the process is killed.

## S4 — Dependabot has no Gradle coverage

`.github/dependabot.yml` covers npm and github-actions. The entire Android
runtime tree (AGP, Kotlin, Compose, OkHttp, Room, WorkManager, CameraX/ML) gets
no automated security updates.

## S6 — `assertSingleInstance()` only catches the honest operator

`AZF_INSTANCE_COUNT` defaults to 1 and is declared, not detected. Setting
replicas to 2 in the Azure portal without touching the env var boots cleanly and
silently loses data. Real fix remains the async `getStore()` refactor.

## S8 — No ESLint anywhere in the repository

No config, no dependency, no script -- yet `store.ts` and `pgStore.ts` carry
`// eslint-disable-next-line` directives nothing reads. The Node service holding
the health data has no static analysis beyond `tsc --noEmit`, in the same pass
that added two Kotlin linters.

## S9 — Scrubber misses MFA-shaped keys

`telemetry.ts:80` puts `code` in `EXACT_ONLY_KEYS` (correct -- `barcode`,
`statusCode`). Consequence: `recoveryCode`, `otpCode`, `totpCode`, `mfaCode`
pass through `logEvent` unredacted. Latent today (no call site passes one), but
MFA and that decision landed in the same changeset unreconciled.

## S10 — `optimisticPatch` rollback contract is a landmine

`apps/web/src/lib/optimistic.ts:207` returns a 1-arg `onError(context)`. React
Query calls `onError(error, variables, context)`. All three current call sites
override it correctly, so there is no live bug -- but a fourth that merely
spreads `...patch` gets `context = Error`, performs no rollback, and leaves a
wrong weight or meal row on screen. Rename to `rollbackTo(context)` or return
the 3-arg shape.

## Pre-existing product bug found in passing

Workout burn estimate diverges between clients and server. Both Android
(`TrainingModels.kt:89`) and web use a flat **5.5 kcal/min**; the API
(`workouts/service.ts:363`) uses **6-10 kcal/min by focus**, and its own
docstring says the intended band starts at 6. The client estimate is 8-45% below
what the server records for the same session. Not caused by this pass -- the
Android client faithfully ported the web behaviour.

## Documentation defect

`docs/plans/ANDROID_MODULARISATION.md:137` states `allWarningsAsErrors` is wired
via `-Pazf.warningsAsErrors=true`. It exists only in `build-logic/`, which
`settings.gradle.kts` never includes -- so it is inert. A document of record
describes a safeguard that does not run.
