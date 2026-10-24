# AquaZeroFit Operations: Observability & Alerting

This document defines the production observability surface of the AquaZeroFit API and the alerting rules an operator should configure on top of it. It is written for a single-instance or small-fleet deployment on Azure Container Apps (or a comparable managed PaaS); anything that requires a Prometheus fleet is called out as future work.

## Endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | none | Liveness. Process is up; never touches the store. Platform restarts the container when this fails. |
| `GET /ready` | none | Readiness. Store hydrated AND (Postgres-backed) pool answers `SELECT 1`. Returns 503 with `NOT_READY` while unfit for traffic. |
| `GET /metrics` | none | In-process counters as JSON: `requestsTotal`, `responsesByClass` (2xx/3xx/4xx/5xx), `aiCallsTotal`, `aiCallsBlocked`, `startedAt`. No user data. |

All three are registered before the rate limiter so platform probes cannot be throttled into a restart loop. With `REQUIRE_ORIGIN_SECRET=true` (below), `/health` and `/ready` stay open but `/metrics` needs the Worker's secret like every other path, and the Worker does not proxy it, so a poller on the run.app URL gets 403.

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

None of the deploy surfaces expresses an instance count the process can read — a managed PaaS keeps its autoscale limit in its own dashboard, Compose is scaled with `--scale` on the command line, and the Dockerfile cannot know. So the count is declared explicitly:

| Value | Effect |
| --- | --- |
| unset, off Cloud Run | Treated as `1`. Local development and Docker Compose. |
| unset, on Cloud Run (`K_SERVICE` set) | **Boot refused.** Cloud Run autoscales unless `max-instances` is pinned, and `gcloud run deploy --image` keeps whatever the live service has, so the default declares nothing there. |
| `1` | Boots normally. |
| anything else (`2`, `0`, `auto`, …) | **Boot refused** with an error naming the data-loss risk. A value that is not a positive integer is refused too: a guard that cannot read its own input has verified nothing. |

Enforced by `assertSingleInstance()` in `apps/api/src/platform/config.ts`, called from `apps/api/src/index.ts` before the store initialises. Skipped under test.

Per platform:

- **Cloud Run** — `cloudbuild.yaml` deploys with `--min-instances=1 --max-instances=1` and sets `AZF_INSTANCE_COUNT=1` in the same command, on every deploy. A revision made any other way (console, a hand-run `gcloud run deploy`) inherits both from the one before it; if the variable is missing, the new revision fails to start and the previous one keeps serving. Raising `max-instances` by hand is the one change the guard cannot see. Min and max are per revision, so during a rollout the old and new revisions briefly run side by side; that overlap is inherent to Cloud Run and is not something the guard can see.
- **Managed PaaS** — pin the deployment to a single reserved VM (one machine), never autoscale, and record that choice in whatever deployment manifest the host reads.
- **Docker Compose** — `AZF_INSTANCE_COUNT=1` is set in `docker-compose.yml`. Do not use `docker compose up --scale api=N`.
- **Azure Container Apps** — set min and max replicas both to 1.

### Lifting the restriction

Raising `AZF_INSTANCE_COUNT` does not make the deployment scalable; it makes the data loss permitted. The prerequisite is the **async `getStore()` refactor**, which routes reads through to Postgres instead of a per-instance memory copy. It is tracked as its own piece of work because it touches roughly 77 call sites. Until it lands, one instance is the only correct configuration, and the per-process rate limiter and login lockout noted in `PRODUCTION_READINESS.md` are a second, independent reason not to scale out.

## Closing the run.app bypass (`REQUIRE_ORIGIN_SECRET`)

Cloud Run ingress is `all` and cannot be limited to the Worker, so `https://aquazerofit-api-592686987043.australia-southeast1.run.app` answers anyone and skips the edge. With `REQUIRE_ORIGIN_SECRET=true` the API refuses, with `403 {"code":"FORBIDDEN"}`, every request whose `X-Origin-Shared-Secret` does not match `ORIGIN_SHARED_SECRET`. `/health` and `/ready` are exempt for Cloud Run's probes. The switch is off by default, and boot is refused if it is on while `ORIGIN_SHARED_SECRET` is empty, still a `replace-with-...` placeholder, or under 32 characters (`requireWorkerOrigin` in `apps/api/src/platform/clientIp.ts`, `assertOriginSecretConfigured` in `platform/config.ts`).

Refusals write at most one line a minute: `kind:"security"`, `event:"origin_secret_rejected"`, `refusedSinceLastLog`, and the `reason` and `path` of the request that tripped it. `secret_missing` is a direct caller. `secret_mismatch` on real traffic means the Worker and Cloud Run hold different values.

Telegram, Stripe and Pub/Sub cannot add a custom header. Only the Worker adds it, so after step 5 a webhook registered on run.app is refused outright. Every step is an operator action; nothing in this repository applies them.

1. **One value, one shell, both sides.**
   ```bash
   SECRET="$(openssl rand -hex 32)"
   ```
2. **Worker**, from `cloudflare/`:
   ```bash
   printf %s "$SECRET" | npx wrangler secret put ORIGIN_SHARED_SECRET
   ```
3. **Cloud Run.** Create the Secret Manager secret and mount it, which rolls one revision. If the runtime service account (`azf-api`) is granted secrets one by one rather than project-wide, grant it `roles/secretmanager.secretAccessor` on this secret first.
   ```bash
   printf %s "$SECRET" | gcloud secrets create ORIGIN_SHARED_SECRET \
     --project=aquazerofit --replication-policy=automatic --data-file=-
   gcloud run services update aquazerofit-api --project=aquazerofit --region=australia-southeast1 \
     --update-secrets=ORIGIN_SHARED_SECRET=ORIGIN_SHARED_SECRET:latest
   ```
4. **Every provider webhook must be on `https://aquazerofit.com`.** Check each one against the provider's own record. The repository only documents the Telegram URL as `https://<host>/...`, so the docs do not settle this.

   | Provider | Must be | Check |
   | --- | --- | --- |
   | Telegram | `https://aquazerofit.com/api/v1/telegram/webhook` | `curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`, field `url` |
   | Stripe (live and test) | `https://aquazerofit.com/api/v1/billing/stripe/webhook` | Dashboard, Developers, Webhooks: endpoint URL |
   | Play RTDN | `https://aquazerofit.com/api/v1/billing/play/webhook` | `gcloud pubsub subscriptions list --format='table(name,pushConfig.pushEndpoint)'` in the RTDN topic's project |

   To move Telegram, re-run the full `setWebhook` command under "Rotating `TELEGRAM_WEBHOOK_SECRET`" with the new URL. Leaving out `secret_token` clears it, and the route then refuses everything. To move Stripe, edit the endpoint URL; the signing secret does not change. To move Pub/Sub, run `gcloud pubsub subscriptions modify-push-config` and keep any `?secret=` query. Uptime checks or schedulers on run.app need the same treatment. Anything you missed will show up in `origin_secret_rejected` lines after step 5.
5. **Flip the switch.** `cloudbuild.yaml` updates only the variables it names, so the setting survives later deploys.
   ```bash
   gcloud run services update aquazerofit-api --project=aquazerofit --region=australia-southeast1 \
     --update-env-vars=REQUIRE_ORIGIN_SECRET=true
   ```
6. **Verify.**
   ```bash
   RUN=https://aquazerofit-api-592686987043.australia-southeast1.run.app
   curl -s -o /dev/null -w '%{http_code}\n' "$RUN/api/v1/auth/captcha"                 # 403
   curl -s -o /dev/null -w '%{http_code}\n' "$RUN/health"                              # 200
   curl -s -o /dev/null -w '%{http_code}\n' https://aquazerofit.com/api/v1/auth/captcha # 200
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="aquazerofit-api" AND jsonPayload.event="origin_secret_rejected"' \
     --project=aquazerofit --freshness=1h
   ```
   A 403 through `aquazerofit.com`, a `secret_mismatch` line, or a line whose `path` is a webhook means roll back now, then fix the cause:
   ```bash
   gcloud run services update aquazerofit-api --project=aquazerofit --region=australia-southeast1 \
     --update-env-vars=REQUIRE_ORIGIN_SECRET=false
   ```
7. **Rotate the Stripe live secret key and the Resend API key.** Both are held only by the operator. The secret ids below assume each matches its env name; confirm with `gcloud run services describe aquazerofit-api --region=australia-southeast1`.
   - Stripe, live mode: Developers, API keys, secret key, **Roll key**. Give the old key an expiry (an hour is enough) so the serving revision keeps working until the new one is up.
   - Resend: create a new API key with sending access. Do not delete the old one yet.
   ```bash
   printf %s "$NEW_STRIPE_KEY" | gcloud secrets versions add STRIPE_SECRET_KEY --project=aquazerofit --data-file=-
   printf %s "$NEW_RESEND_KEY" | gcloud secrets versions add RESEND_API_KEY --project=aquazerofit --data-file=-
   gcloud run services update aquazerofit-api --project=aquazerofit --region=australia-southeast1 \
     --update-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,RESEND_API_KEY=RESEND_API_KEY:latest
   ```
   `:latest` is read when an instance starts, so a new revision has to be serving before the new keys take effect; check with `gcloud run revisions list --service=aquazerofit-api --region=australia-southeast1`. Then confirm the plan page on `aquazerofit.com` shows the Stripe price and a password reset reaches an operator mailbox. After that, delete the old Resend key. The old Stripe key expires on its own.

To rotate `ORIGIN_SHARED_SECRET` later, set `REQUIRE_ORIGIN_SECRET=false` first. The two sides cannot change at the same instant, and with the gate on every request between the two updates is refused.

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
2. **Whether the environment can change without replacing the process.** `config.telegramWebhookSecret` is a getter that re-reads `process.env` on every call, so the *process* needs no restart to see a new value. Whether the managed host or Azure Container Apps can apply an environment change in place, rather than by rolling a new revision, is not visible from this repository. If it can, the window shrinks to the time between two commands — but nobody has run it that way.
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
