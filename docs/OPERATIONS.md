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
