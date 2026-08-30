# AquaZeroFit Operations: Observability & Alerting

This document defines the production observability surface of the AquaZeroFit API and the alerting rules an operator should configure on top of it. It is written for a single-instance or small-fleet deployment on Azure Container Apps (or Replit); anything that requires a Prometheus fleet is called out as future work.

## Endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | none | Liveness. Process is up; never touches the store. Platform restarts the container when this fails. |
| `GET /ready` | none | Readiness. Store hydrated AND (Postgres-backed) pool answers `SELECT 1`. Returns 503 with `NOT_READY` while unfit for traffic. |
| `GET /metrics` | none | In-process counters as JSON: `requestsTotal`, `responsesByClass` (2xx/3xx/4xx/5xx), `aiCallsTotal`, `aiCallsBlocked`, `startedAt`. No user data. |

All three are registered before the rate limiter so platform probes cannot be throttled into a restart loop.

## Structured logs (stdout)

Every log line is a single JSON object. Kinds:

- `kind: "http"` : one record per response: `requestId`, `method`, redacted `path`, `status`, `ms`. Query values for credential-bearing keys (`reset`, `token`, `refresh_token`, ... are replaced with `[redacted]` before logging).
- `kind: "ai"` : one record per model call: provider, model, promptVersion, latency, token usage, guardrail outcome.
- `kind: "error"` : 5xx failures with name/message/truncated stack and the `requestId` of the triggering request.
- `kind: "event"` : domain events with no user-visible audit trail of their own (payments chiefly).

`X-Request-Id` is honoured inbound (when shape-safe) and always set outbound; it is the join key between the `http` line and any `error` line for one request.

## Alerting rules to configure

These thresholds assume the platform can query structured logs (Azure Log Analytics / Container Apps diagnostic settings) or poll `/metrics` on an interval.

| Signal | Condition | Response |
| --- | --- | --- |
| Readiness failing | `/ready` returns non-200 for > 2 consecutive probes | Page. Usually: Postgres unreachable or credentials rotated. |
| 5xx rate | `responsesByClass.5xx` delta > 1% of `requestsTotal` delta over 5 min | Investigate `kind:"error"` lines for the same window. |
| Crash loop | container restart count > 3 in 10 min | Page. Boot failures (`[fatal]` lines) identify their own cause. |
| AI guardrail spike | `aiCallsBlocked` delta > 10 in 15 min | Possible prompt-injection probing; review `kind:"ai"` blocked records. |
| Refresh-theft events | log search for `Refresh token reuse detected` | Count > 0 is worth a look; > 5/hour for one user suggests credential stuffing. |
| Latency | p95 `ms` on http lines > 2 s over 5 min | Investigate store/Postgres health and AI provider latency. |

## Scaling: this API runs on exactly one instance

**Do not run more than one instance of the API. The process refuses to start if you declare that you have.**

The document store keeps its entire working set in memory and hydrates it once, at boot. Postgres is a durability mirror, not a source of truth for reads (`apps/api/src/platform/pgStore.ts` explains the shape). Two instances therefore hold two independent copies:

- A write on instance A is invisible to instance B until B restarts.
- The flush writes whole documents, so whichever instance flushes last silently overwrites the other's version of that row.
- Nothing errors, nothing logs, and no probe goes red. A user's food diary just loses entries, and which entries depends on which instance served which request.

The single exception is refresh-token rotation, which runs a genuine atomic `UPDATE` against the database (see `compareAndSwapRefreshToken`). Session anti-theft is multi-instance safe; **application data is not**.

### The declaration: `AZF_INSTANCE_COUNT`

None of the deploy surfaces expresses an instance count the process can read — Replit's autoscale limit lives in its UI, Compose is scaled with `--scale` on the command line, and the Dockerfile cannot know. So the count is declared explicitly:

| Value | Effect |
| --- | --- |
| unset | Treated as `1`. Normal local development and the current deployments. |
| `1` | Boots normally. |
| anything else (`2`, `0`, `auto`, …) | **Boot refused** with an error naming the data-loss risk. A value that is not a positive integer is refused too: a guard that cannot read its own input has verified nothing. |

Enforced by `assertSingleInstance()` in `apps/api/src/platform/config.ts`, called from `apps/api/src/index.ts` before the store initialises. Skipped under test.

Per platform:

- **Replit** — `deploymentTarget = "vm"` (Reserved VM, one machine). Not autoscale. See the comment block in `.replit`.
- **Docker Compose** — `AZF_INSTANCE_COUNT=1` is set in `docker-compose.yml`. Do not use `docker compose up --scale api=N`.
- **Azure Container Apps** — set min and max replicas both to 1.

### Lifting the restriction

Raising `AZF_INSTANCE_COUNT` does not make the deployment scalable; it makes the data loss permitted. The prerequisite is the **async `getStore()` refactor**, which routes reads through to Postgres instead of a per-instance memory copy. It is tracked as its own piece of work because it touches roughly 77 call sites. Until it lands, one instance is the only correct configuration, and the per-process rate limiter and login lockout noted in `PRODUCTION_READINESS.md` are a second, independent reason not to scale out.

## Rotating `TELEGRAM_WEBHOOK_SECRET`

`TELEGRAM_WEBHOOK_SECRET` is the only thing standing between the public URL `POST /api/v1/telegram/webhook` and a free coach roster: the route is unauthenticated, it grants entitlements, and it decides whether to trust a delivery by comparing Telegram's `X-Telegram-Bot-Api-Secret-Token` header against that one value (`secretMatches` in `apps/api/src/modules/payments/router.ts:55-62`). It is a long-lived bearer credential, so it needs a rotation procedure.

**There is no zero-downtime rotation.** The handler holds exactly one expected value — `config.telegramWebhookSecret` is a single string read from the environment (`apps/api/src/platform/config.ts:158-160`) — so the deployment cannot honour an old and a new secret at the same time. Telegram, symmetrically, stores one `secret_token` per webhook registration. Every rotation therefore has a window between the two steps in which the two sides disagree and deliveries are refused. The procedure below makes that window short and its failure mode self-healing; it does not remove it.

### What the window costs

| Delivery arriving mid-window | Outcome |
| --- | --- |
| `message.successful_payment` | Refused now, redelivered later. Recoverable. |
| `pre_checkout_query` | Refused now, redelivered too late. **The purchase is cancelled.** |

On a mismatch the handler returns **`401`** with body `{"code":"AUTH_INVALID","message":"Invalid webhook secret."}` and logs the event **`telegram_webhook_rejected`** with `reason: "secret_mismatch"` (`router.ts:69-70`). 401 is non-2xx, and the whole design of this route rests on Telegram redelivering non-2xx responses (see the header comment in `router.ts`), so a payment that clears during the window is not lost: it comes back, `completePayment` is idempotent on `telegram_payment_charge_id` (`apps/api/src/modules/payments/stars.ts:169-179`), and the invoice it must match survives for 24 h (`PENDING_INVOICE_TTL_MS`).

Pre-checkout is the casualty. Telegram cancels the payment if `answerPreCheckoutQuery` does not arrive within ten seconds, so a redelivery that arrives after the rotation lands is worthless — the user has already been told the purchase failed. The cost of the window is measured in cancelled checkouts, not in lost entitlements.

Two things make that worse than it sounds, and both are worth knowing before choosing a rotation time:

- **The buy button does not disappear during the window.** `starsAvailable()` returns `botConfigured()`, which checks the *bot token* only (`stars.ts:50-52`, `apps/api/src/modules/payments/telegramBot.ts:61-63`). Blanking or changing the webhook secret does not switch purchases off in the client; the roster keeps rendering buy buttons and the API keeps minting invoices the webhook will then refuse to complete.
- **The window is wall-clock, not per-request.** Rotate at a low-traffic hour.

### Order of operations: environment first, then `setWebhook`

| Order | Window runs from → to | If the second step fails |
| --- | --- | --- |
| **Env, then `setWebhook`** (use this) | New revision starts serving → the one `setWebhook` call returns. Seconds. | Telegram is still registered with the old secret; re-run `setWebhook`. An automatic rollback to the previous revision restores a working pair on its own. |
| `setWebhook`, then env | The `setWebhook` call returns → the new revision starts serving. The whole deploy. Minutes. | Every delivery is refused until someone re-runs `setWebhook` with the old value. A rollback makes it worse, not better, because the rolled-back revision expects a secret Telegram is no longer sending. |

Both orders have a window; only the length and the blast radius of a half-finished rotation differ. Setting the environment first keeps the window bounded by a single HTTP call rather than by a deployment, and leaves the *old* pairing intact while the risky, slow step is in flight.

> Note: `docs/security/PRODUCTION_SECURITY_CHECKLIST.md` §"Document the webhook secret rotation" records the reverse order (`setWebhook` first). This runbook is the corrected one, for the reasons in the table.

### Procedure

1. **Generate a secret.** Same recipe as `.env.example`:
   ```bash
   openssl rand -hex 32
   ```
2. **Set `TELEGRAM_WEBHOOK_SECRET` on the deployment and roll out.** Wait for the new revision to serve and for `GET /ready` to return 200. Purchases are refused from this moment until step 3 completes.
3. **Re-register the webhook** — the registration command of record, unchanged from the header comment in `router.ts`:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d url="https://<host>/api/v1/telegram/webhook" \
     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" \
     -d allowed_updates='["message","pre_checkout_query"]'
   ```
   Run it with every parameter present, as written. `setWebhook` rewrites the registration, and this is the only place the intended registration is spelled out.
4. **Verify** (below) before declaring the rotation done.
5. **Retire the old value.** There is nothing to revoke server-side: the old secret stopped being accepted the instant step 2's revision began serving. Delete it from the password manager entry, the deploy platform's secret store and any ticket or chat where it was pasted.

### Verifying the rotation landed

**Does the deployment hold the new secret?** Ask it directly. An update of a shape the handler does not recognise is acknowledged and ignored (`router.ts:116-118`), so an empty JSON body with the right header is a safe probe that grants nothing:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://<host>/api/v1/telegram/webhook" \
  -H "X-Telegram-Bot-Api-Secret-Token: <NEW_SECRET>" \
  -H 'Content-Type: application/json' -d '{}'
```

`200` means the environment half of the rotation is live; `401` means it is not. This says nothing about what Telegram is sending.

**Is Telegram sending it?** `getWebhookInfo` is the other half:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

It does **not** echo `secret_token` back, so it cannot confirm the value — it confirms the registered `url` and reports `pending_update_count` and `last_error_date` / `last_error_message`. A pending count that keeps climbing, or a last error timestamped after the rotation, means Telegram is still being refused. (These are Telegram's field names; nothing in this repository calls `getWebhookInfo`.)

**Did the window actually close?** Watch the logs. Every refusal writes a `kind:"event"` line named `telegram_webhook_rejected` (`apps/api/src/platform/telemetry.ts:287-294`):

```
{"t":"...","kind":"event","name":"telegram_webhook_rejected","reason":"secret_mismatch"}
```

A burst during the window is expected. **Any occurrence after the rotation is complete is a defect, not noise** — either the two sides still disagree, or someone is probing the URL. The same requests also appear as `kind:"http"` lines with `status: 401` on the webhook path.

The only end-to-end proof is a real Stars purchase completing after the rotation: Telegram provides no test delivery that carries the secret.

### When to rotate

| Trigger | Timing |
| --- | --- |
| Suspected exposure — the value appears in a log, screenshot, ticket, chat or shared `.env` | Immediately. Accept the window; a leaked secret mints entitlements for free. |
| Operator offboarding — anyone with read access to the deployment environment or the password-manager entry leaves | Same day, as part of offboarding. |
| `TELEGRAM_BOT_TOKEN` is rotated or suspected leaked | Rotate both together. A leaked bot token is the worse of the two: it lets someone re-point the webhook with their own `setWebhook` call, which no server-side secret can defend against. |
| Calendar | None defined. Because every rotation costs cancelled checkouts, adopting an interval is a policy decision rather than a technical one; record it here if one is adopted. |

### Open questions

These are unresolved, and the procedure above deliberately does not pretend otherwise.

1. **No dual-secret cutover exists.** `secretMatches` compares against one configured value, so the "accept old *or* new for a bounded period" pattern that would make this rotation seamless is not implemented. Adding it (e.g. a `TELEGRAM_WEBHOOK_SECRET_PREVIOUS` accepted for one deploy cycle) is a code change to `router.ts`, and an unmade decision.
2. **Whether the environment can change without replacing the process.** `config.telegramWebhookSecret` is a getter that re-reads `process.env` on every call, so the *process* needs no restart to see a new value. Whether Replit or Azure Container Apps can apply an environment change in place, rather than by rolling a new revision, is not visible from this repository. If it can, the window shrinks to the time between two commands — but nobody has run it that way.
3. **How long Telegram retries a refused update, and with what backoff.** The route's design assumes redelivery of non-2xx; the retry duration is not recorded anywhere here. If it is shorter than the rotation window, updates in that window are lost outright rather than delayed, and the `successful_payment` row of the cost table above becomes optimistic.
4. **This procedure has not been executed against production.** Rehearse the first run against a staging bot with its own token and webhook URL before doing it live.

## What is NOT here (deliberately)

- No Prometheus pull format. `/metrics` is JSON because the target platforms scrape stdout and HTTP probes; the counters backing it are structured so a Prometheus exporter can be added later without code archaeology.
- No third-party error tracking (Sentry etc.). The `kind:"error"` records plus request-id correlation cover a single-instance deployment; wire a sink when the fleet or the on-call rotation justifies it.
- No tracing. Async lanes are bounded and request-scoped today; revisit if chat streaming fan-out grows.

## Local verification

```bash
npm run dev --workspace apps/api &   # or the production container
curl -s http://localhost:4000/health
curl -s http://localhost:4000/ready
curl -s http://localhost:4000/metrics
```
