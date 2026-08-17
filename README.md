# AquaZeroFit

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![Licence: AGPL v3](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

AI-powered wellness platform under the **AquaZero** brand. Users build a wellness profile, log meals manually or by photograph, and receive personalised calorie targets, meal suggestions and home training plans that adapt to measured progress. A conversational assistant ("Aqua Coach") answers nutrition and fitness questions inside strict safety boundaries.

> AquaZeroFit provides general wellness and fitness support only. It does not provide medical diagnosis, treatment or professional healthcare advice. This boundary is a product requirement, not a disclaimer (AQF-02 §1).

One React codebase delivers **two targets**: a responsive web application (the assessed surface) and a **Telegram Mini App** (theme binding + native controls when launched inside Telegram).

## The product

Captured from the running application (`npm run api` + `npm run dev`) signed in as the
seeded demo account — not mockups. Design references for each screen live in
`design/figma/`.

| Dashboard | Nutrition | Aqua Coach |
| :---: | :---: | :---: |
| <img src="docs/screenshots/03-dashboard.png" alt="Home dashboard showing calories remaining, macro split and hydration" width="240"> | <img src="docs/screenshots/04-nutrition.png" alt="Nutrition day view with calorie ring, macro targets and per-meal logging" width="240"> | <img src="docs/screenshots/07-coach.png" alt="Aqua Coach chat grounded in today's nutrition, workout and plan context" width="240"> |
| Deterministic calorie maths, macro split and hydration for the day | Per-meal logging with a searchable food corpus and day navigation | Conversational coach grounded in the user's real context, with the wellness boundary always visible |

| AI meal plan | Workout library | Progress |
| :---: | :---: | :---: |
| <img src="docs/screenshots/06-meal-plan.png" alt="AI generated meal plan matched to calorie and macro targets" width="240"> | <img src="docs/screenshots/08-workouts.png" alt="Workout library browsing the attributed exercise corpus" width="240"> | <img src="docs/screenshots/09-progress.png" alt="Progress view with weight journey chart and calorie trend" width="240"> |
| Suggestions generated against the user's targets and allergen exclusions | Exercise corpus with per-record licence attribution preserved | Weight journey and calorie trend over 7/30/90 days |

Also captured: [welcome](docs/screenshots/01-welcome.png), [sign-in](docs/screenshots/02-sign-in.png),
[meal photo capture](docs/screenshots/05-capture-meal.png) and [settings](docs/screenshots/10-settings.png).

## Repository layout

```
apps/web           React 18 + TypeScript + Vite + Tailwind — both delivery targets
apps/api           Node.js + TypeScript API implementing the /api/v1 contract (AQF-07)
packages/shared    Shared types, zod validation schemas, error taxonomy, constants
prompts/           Versioned AI prompt files P-01..P-11 (AQF-10)
evals/             Safety evaluation sets and runner (pipeline gate)
content/           Licensing attribution and workout-media governance
docs/specs/        AQF-01..AQF-22 document set
docs/research/     Upstream integration and licensing research tracks
docs/plans/        Integration and delivery plans
design/figma/      Screen references and the Modern Aquatic Wellness design system
design/brand/      Brand assets
tools/docgen/      Markdown to .docx renderer (build tooling, not a workspace)
tools/screenshots/ Re-encodes docs/screenshots into the WebP used by the landing page
```

`prompts/` and `evals/` must stay at the repository root: `apps/api/src/modules/ai/prompts.ts`
resolves prompt files by walking up the directory tree, and `evals/runner.ts` loads its
fixtures as siblings. Moving either silently breaks prompt loading.

`tools/docgen` is deliberately excluded from the npm workspaces so its `docx` dependency
never enters the deployed application's dependency tree. Install it separately if you need
to regenerate a document.

## Quick start

```bash
npm install
npm run api    # API on http://localhost:4000 (seeds demo data on first boot)
npm run dev    # Web app on http://localhost:5173 (proxies /api to :4000)
```

Demo account (seeded in every environment so the product opens populated, AQF-06 §7):

- **Email:** `demo@aquazero.fit`
- **Password:** `AquaZeroDemo!2026`

Other commands:

```bash
npm run build      # typecheck + production build of every workspace
npm run test       # unit + integration suites (vitest)
npm run seed       # re-run content/demo seeding
```

No `.env` is required for local development: the API generates dev secrets,
stores data as JSON under `apps/api/.data`, and the coach answers from a
deterministic offline mock until an AI provider key is set (see
`.env.example`).

> **Windows note:** if `npm run dev` fails with `EACCES: permission denied
> …:5173`, the port sits inside a Windows *excluded port range* (Hyper-V/WSL
> reserves blocks of ports; `netsh interface ipv4 show excludedportrange
> protocol=tcp` lists them). Start Vite on any free port instead:
> `npm run dev --workspace apps/web -- --port 5300` (the `--` must come after
> the workspace flag so the port reaches Vite rather than npm).

## Two surfaces: web is marketing, Telegram is the product

AquaZeroFit is delivered as a Telegram Mini App. The web build serves two
distinct jobs from the same codebase, and the split is worth stating because
several deliberate decisions only make sense in its light:

- **The marketing site** (`/`, `/features`, `/how-it-works`, `/aqua-coach`,
  `/safety`, plus the legal pages) is the only cold-traffic surface. Its
  primary call to action leaves the origin for `t.me/<bot>/<app>`, carrying
  whatever attribution brought the visitor in as a deep-link payload — the sole
  channel by which a ref code, UTM campaign or huddle invite survives the hop
  into Telegram, since `localStorage` does not cross it.
- **The application** is the same React app, and it works completely in an
  ordinary browser. That is not a fallback bolted on for completeness: it is
  the answer to the segment whose employer or network blocks Telegram, and the
  landing page says so next to the CTA rather than leaving them to bounce.

Two consequences that are easy to undo by accident:

1. **`/` serves marketing in place for signed-out browser visitors** — it is
   not a redirect to `/landing` (that path survives only as an alias). Cold
   traffic and crawlers land on the canonical URL directly. The decision lives
   in `RequireAuth`, which still redirects every *other* guarded route.
2. **The Telegram SDK is not in `index.html`.** It is fetched, with a timeout,
   only when the URL fragment shows a real Mini App launch. A blocking
   `telegram.org` script in `<head>` stalled the marketing page for exactly the
   users the browser path exists to serve.

Search visibility is generated at build time by `apps/web/vite-plugins/seo.ts`:
one real HTML file per marketing route, each with its own title, description,
canonical, Open Graph tags, JSON-LD and a `<noscript>` summary, plus
`robots.txt` and `sitemap.xml`. Routes come from `MARKETING_ROUTES` in
`apps/web/src/lib/site.ts` — **a marketing page missing from that list still
renders perfectly and is simply invisible to search.**

> **Hosting requirement.** The prerendered shells rely on the host resolving
> `/features` to `features/index.html` *before* applying the SPA fallback.
> Netlify, Vercel, Cloudflare Pages, S3+CloudFront and nginx `try_files` all do
> this by default. A host configured to rewrite *everything* to `/index.html`
> unconditionally will serve the generic shell again and silently undo the
> per-route metadata — the app keeps working, the SEO does not.

## Architecture in one paragraph

The frontend detects at bootstrap whether it is running inside Telegram (`isTMA()`): in the browser it renders the AquaZero design system directly; inside Telegram it additionally binds the client theme variables. The API is a stateless TypeScript service exposing the frozen `/api/v1` contract with JWT access tokens and single-use rotating refresh tokens (family revocation on reuse). Data is stored as documents in logical containers (`users`, `profiles`, `logs`, `plans`, `content`, `ai`, `ledger`, `audit`) behind a storage abstraction: a JSON file store by default, and Postgres when `DATABASE_URL` is set (a single `documents(container, id, doc jsonb)` table, write-through from an in-memory working set). Because each instance hydrates its own working set, the Postgres store is durable for **single-instance** deployments only — scale out requires moving reads off the local copy (AQF-04, AQF-22). All model access goes through a single AI gateway module with logical model groups (`visionPrimary`, `chatFast`, `planStructured`, `safetyCheap`, `insightBatch`); when no provider keys are configured the gateway falls back to a deterministic offline engine so every core journey works without external AI. Every model-calling endpoint enforces the admission sequence: authenticate → rate limit → tier/credit check → input guardrail → gateway → output guardrail and numeric rules → respond + telemetry (AQF-07 §4).

### Safety invariants (enforced in code, tested)

- Models identify, interpret, explain; **code calculates, filters, enforces**. Calorie math is deterministic lookup-and-multiply.
- Calorie targets are clamped to configured floors with a visible advisory (FR-031).
- Allergen exclusion is a deterministic filter with zero tolerance for false negatives.
- Meal photo recognition never commits a log without explicit user confirmation (FR-013).
- The assistant refuses medical/crisis/extreme-diet content with a supportive signpost (FR-045).
- The credit ledger is append-only; balances are derived by folding transactions.

## Configuration

Environment variables (all optional in development - dev defaults apply). Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

The `.env` file is gitignored and must never be committed. The API loads it automatically at boot via `dotenv`.

### Runtime

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default 4000) |
| `DATABASE_URL` | Postgres connection string. When set, the store switches from JSON files to Postgres; leave unset for local development. **Required in production** — see below |
| `AZF_DATA_DIR` | Data directory for the local JSON store (default `apps/api/.data`; used only when `DATABASE_URL` is unset) |
| `SERVE_WEB` | Set to `false` for an API-only deployment. By default the API also serves the built SPA from `apps/web/dist`, so one process serves the whole product on one origin |
| `WEB_DIST_DIR` | Override where the built SPA is found |
| `TRUST_PROXY` | Proxy hops to trust for `req.ip` (defaults to 1 in production, 0 otherwise). Wrong values collapse every caller into one rate-limit bucket |
| `APP_VERSION` | Build identity returned by `/health` and `/ready` |
| `AZF_SEED_DEMO` | Set to `false` to skip demo/admin account seeding (accounts are never seeded in production) |
| `ADMIN_PASSWORD` | Production-only: seeds the admin account with this password; without it no admin account is created |
| `EXPOSE_DEV_TOKENS` | Dev-only: echo password-reset tokens in API responses/logs when `true` (requires non-production `NODE_ENV`) |
| `UPLOADS_DIR` | Where in-flight meal photographs are written (default `apps/api/uploads`). Point this at a persistent volume on hosts with an ephemeral filesystem, or a redeploy loses photos mid-analysis |
| `ENABLE_LLM_SAFETY` | Override LLM second stage for input guardrails (`true`/`false`; defaults on when any AI provider key is set) |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins |

### Production database (`DATABASE_URL`)

Production boot fails fast without `DATABASE_URL`; the JSON file store is dev-only. Point it at managed Postgres (Azure Cosmos DB for PostgreSQL, Azure Database for PostgreSQL, Replit Postgres): the schema (`documents` table) is created idempotently at boot, no separate migration step. Requirements:

- TLS: use `sslmode=verify-full` (public CA) or `ssl=true` for managed offerings without publicly anchored certs. Plaintext `postgres://` to a non-loopback host is rejected at boot. Loopback/plaintext stays allowed for local dev only.
- Least-privilege role: the runtime role needs only CONNECT plus SELECT/INSERT/UPDATE/DELETE on the `documents` table; it does not need superuser, replication, or DDL beyond `CREATE TABLE IF NOT EXISTS` in its own schema.
- Pooling: the app holds at most 5 connections with a 30s idle reap and a 15s statement timeout, so a small managed tier is sufficient. Boot probes the connection and exits 1 with an actionable message when the database is unreachable, credentials fail, or the database does not exist.
- One write path: refresh-token rotation is an atomic CAS against the database itself (safe across instances); all other reads are served from the per-instance working set, so run one instance until the read-path refactor lands (AQF-04, AQF-22).

### Web delivery (build-time, `VITE_` prefixed)

Vite inlines these into the bundle at build time, so they are public by
definition and must never hold secrets. They are read by both the client and
the build-time SEO plugin (`apps/web/vite-plugins/seo.ts`), which is why they
are set for `npm run build --workspace apps/web` rather than for the API.

**Set `VITE_TELEGRAM_BOT_USERNAME` before shipping.** It defaults to
`AquaZeroFitBot`, and a deployment that leaves it alone points every "Open in
Telegram" button on its own landing page at somebody else's bot.

| Variable | Purpose |
| --- | --- |
| `VITE_TELEGRAM_BOT_USERNAME` | Bot hosting the Mini App, with or without the leading `@` (default `AquaZeroFitBot`) |
| `VITE_TELEGRAM_MINI_APP_SHORT_NAME` | Mini App short name from BotFather's `/newapp` (default `app`). Set it to an empty string for a bot with no registered Mini App; links then fall back to `t.me/<bot>` |
| `VITE_SITE_ORIGIN` | Public origin of the marketing site, e.g. `https://aquazero.fit`. Canonical tags, the sitemap and absolute OG image URLs are built from it — a stale value points every canonical at another domain while the site looks perfectly healthy |
| `VITE_API_BASE_URL` | Origin of the API when it is served from a different host to the SPA. Unset means same origin |
| `VITE_MEDIA_BASE_URL` | Origin serving exercise media under `/uploads`. Unset means same origin |

### Security (required in production)

| Variable | Purpose |
| --- | --- |
| `JWT_ACCESS_SECRET` | Access-token signing secret (**required in production**; refresh tokens are opaque randoms and need no secret) |
| `TELEGRAM_BOT_TOKEN` | Bot token for Mini App launch-data validation *and* Stars payments (dev default `dev-bot-token`; **required in production**) |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret Telegram echoes on every webhook delivery. **Required before coach purchases can complete** — the webhook grants entitlements and is otherwise unauthenticated, so it rejects everything while this is unset |

### Mail (required in production)

Password reset is undeliverable without a real transport, and a deployment
without one looks healthy while every locked-out user stays locked out — so the
API refuses to boot in production until these are set.

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | API key for [Resend](https://resend.com). Its presence selects the `resend` transport (**required in production**) |
| `MAIL_FROM` | Envelope sender, e.g. `AquaZeroFit <no-reply@yourdomain>`. Must be a domain verified with the provider or messages are dropped silently (**required in production**) |
| `APP_PUBLIC_URL` | Public origin used to build links inside mail, e.g. `https://app.yourdomain` (**required in production**) |
| `MAIL_PROVIDER` | `resend`, `console` (dev: prints the message) or `memory` (tests). Defaults to `resend` when `RESEND_API_KEY` is set, `console` otherwise |

### AI Provider Keys (all optional - gateway falls back to offline engine)

The gateway tries providers in order and falls back to a deterministic mock engine when none are available. Put in only the keys you have.

| Variable | Provider | Notes |
| --- | --- | --- |
| `GROQ_API_KEY` | Groq | https://console.groq.com/keys |
| `GEMINI_API_KEY` | Google Gemini | https://aistudio.google.com/apikey |
| `OPENAI_API_KEY` | OpenAI | https://platform.openai.com/api-keys |
| `NVIDIA_API_KEY` | NVIDIA NIM | https://build.nvidia.com/ |
| `NVIDIA_BASE_URL` | NVIDIA NIM | Override endpoint (default `https://integrate.api.nvidia.com/v1`) |
| `OLLAMA_API_KEY` | Ollama | Optional - local Ollama needs no auth |
| `OLLAMA_BASE_URL` | Ollama | Override endpoint (default `http://localhost:11434/v1`) |

## Coach personas and progression

The nine fighters of the *Aqua Zero Heavens Tournament* ship as selectable
coach personas. A persona is a **voice skin over the existing engine**, never a
second engine: `packages/shared/src/coaches.ts` holds the roster, and
`apps/api/src/modules/ai/persona.ts` prepends the selected coach's voice block
as its own system message *ahead of* P-07.

That ordering is the safety-relevant part. Instruction-following weakens toward
the end of a prompt, so the rules go last and sit in the strongest position
while the voice sits in the weaker one — if the two ever conflict, the
arrangement resolves it the safe way before the persona's own subordination
clause is consulted. Everything downstream is unchanged: the grounding block is
still untrusted data, numbers still come only from tool results, and the full
admission sequence still runs. `apps/api/src/__tests__/persona.test.ts` fails if
anyone merges the two messages or flips them.

**Progression** (`packages/shared/src/gamification.ts`) follows one rule, and it
is a safety rule rather than a design preference: **XP is awarded for behaviour,
never for outcomes.** Nothing can score a deficit, a rate of loss or a kilogram
moved. Logging, training, hydrating, weighing in and *resting after work* earn;
eating less does not. Every lane is capped per day and the total is capped again
(`XP_MAX_PER_DAY`), so a frantic day cannot out-earn two ordinary ones — which
removes the incentive to over-log, and with it the incentive to over-eat to have
something to log. XP is derived by folding activity, never stored, so a level
cannot drift from the behaviour that earned it or be granted by a client.

Coaches unlock by level. **Every locked coach is reachable without paying** —
`unlock.level` is the real door and the Telegram Stars price is a shortcut past
it. A roster whose best-written character sits behind a paywall is a slot
machine, not a wellness product.

### Enabling Stars purchases

Purchases stay off until a real bot token *and* a webhook secret are configured;
until then the roster reports `starsAvailable: false` and no buy button renders.

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d url="https://<host>/api/v1/telegram/webhook" \
  -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" \
  -d allowed_updates='["message","pre_checkout_query"]'
```

Grants happen only when Telegram reports the payment cleared, are idempotent on
the charge id (Telegram redelivers), and the price is always read from the
roster rather than from the request.

### Coach art

```bash
node tools/coaches/build-art.mjs <source-dir>
```

Generates `apps/web/public/coaches/<id>/{portrait,avatar}.webp` from the
character renders — ~445 KB total, against ~15 MB of raw PNGs for a screen that
displays them at 160 px. Optional `celebrate.webp` / `encourage.webp` variants
are dropped in by hand. **Art is never required:** `CoachAvatar` degrades
expression → avatar → tinted monogram, so the roster is fully usable with no
art present and each file that lands upgrades one card silently.

## Documentation

The authoritative document set lives in `docs/specs/` (AQF-01 Charter … AQF-22 Deployment Guide). The API surface is specified in AQF-07; algorithms in AQF-09; the prompt bank and LLMOps plan in AQF-10; safety and privacy design in AQF-11; deployment and domain setup in AQF-22.

## Security notes

Accepted tradeoffs for the capstone deployment, reviewed and documented rather than hidden:

- **Tokens in localStorage** — the app runs as a Telegram Mini App where cookie-based sessions are impractical; access tokens are short-lived (15 min) and refresh tokens are single-use, rotated, family-revoked on reuse, and stored server-side only as sha256 hashes.
- **Pure-JS bcrypt at cost 10** (`bcryptjs`) — the portability floor for this capstone; a native binding and/or higher cost factor is the first hardening step for real production load.
- **Client-declared MIME with extension-derived content type** for meal-photo uploads — uploads are size-capped, allowlisted (jpeg/png/heic), stored under unguessable UUID names, never statically served, streamed only to their authenticated owner, and deleted on confirm/failure plus a 24 h TTL sweep.

To report a vulnerability, see [SECURITY.md](SECURITY.md) — please do not open a public issue.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run verify` (typecheck → tests → safety eval) before opening a pull request; it is exactly what CI runs.

## Licence

Copyright (C) 2026 AquaZero.

AquaZeroFit is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU Affero General Public License](LICENSE) for more details.

> **Section 13 — network use.** The AGPL's defining clause: if you run a modified version of AquaZeroFit and let anyone interact with it over a network, you must offer those users the corresponding source of *your* version. Deploying a fork publicly without publishing its source is a licence violation. A "Source code" link in the running application is the customary way to satisfy this.

Third-party dependency and dataset licences — including the CC-BY-SA exercise corpus and ODbL ingredient data, whose terms are independent of this one — are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
