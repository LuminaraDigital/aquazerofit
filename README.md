# AquaZeroFit

AI-powered wellness platform under the **AquaZero** brand. Users build a wellness profile, log meals manually or by photograph, and receive personalised calorie targets, meal suggestions and home training plans that adapt to measured progress. A conversational assistant ("Aqua Coach") answers nutrition and fitness questions inside strict safety boundaries.

> AquaZeroFit provides general wellness and fitness support only. It does not provide medical diagnosis, treatment or professional healthcare advice. This boundary is a product requirement, not a disclaimer (AQF-02 §1).

One React codebase delivers **two targets**: a responsive web application (the assessed surface) and a **Telegram Mini App** (theme binding + native controls when launched inside Telegram).

## Repository layout

```
apps/web           React 18 + TypeScript + Vite + Tailwind — both delivery targets
apps/api           Node.js + TypeScript API implementing the /api/v1 contract (AQF-07)
packages/shared    Shared types, zod validation schemas, error taxonomy, constants
prompts/           Versioned AI prompt files P-01..P-11 (AQF-10)
evals/             Safety evaluation sets and runner (pipeline gate)
content/           Licensing attribution and workout-media governance
docs/specs/        AQF-01..AQF-21 document set
docs/research/     Upstream integration and licensing research tracks
docs/plans/        Integration and delivery plans
design/figma/      Screen references and the Modern Aquatic Wellness design system
design/brand/      Brand assets
tools/docgen/      Markdown to .docx renderer (build tooling, not a workspace)
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

## Architecture in one paragraph

The frontend detects at bootstrap whether it is running inside Telegram (`isTMA()`): in the browser it renders the AquaZero design system directly; inside Telegram it additionally binds the client theme variables. The API is a stateless TypeScript service exposing the frozen `/api/v1` contract with JWT access tokens and single-use rotating refresh tokens (family revocation on reuse). Data is stored as documents in Cosmos-style containers (`users`, `profiles`, `logs`, `plans`, `content`, `ai`, `ledger`, `audit`) behind a storage abstraction — locally a JSON store, in Azure Cosmos DB (AQF-04). All model access goes through a single AI gateway module with logical model groups (`visionPrimary`, `chatFast`, `planStructured`, `safetyCheap`, `insightBatch`); when no provider keys are configured the gateway falls back to a deterministic offline engine so every core journey works without external AI. Every model-calling endpoint enforces the admission sequence: authenticate → rate limit → tier/credit check → input guardrail → gateway → output guardrail and numeric rules → respond + telemetry (AQF-07 §4).

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
| `AZF_DATA_DIR` | Data directory for the local JSON store (default `apps/api/.data`) |
| `AZF_SEED_DEMO` | Set to `false` to skip demo/admin account seeding (accounts are never seeded in production) |
| `ADMIN_PASSWORD` | Production-only: seeds the admin account with this password; without it no admin account is created |
| `EXPOSE_DEV_TOKENS` | Dev-only: echo password-reset tokens in API responses/logs when `true` (requires non-production `NODE_ENV`) |
| `ENABLE_LLM_SAFETY` | Override LLM second stage for input guardrails (`true`/`false`; defaults on when any AI provider key is set) |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins |

### Security (required in production)

| Variable | Purpose |
| --- | --- |
| `JWT_ACCESS_SECRET` | Access-token signing secret (**required in production**; refresh tokens are opaque randoms and need no secret) |
| `TELEGRAM_BOT_TOKEN` | Bot token for Mini App launch-data validation (dev default `dev-bot-token`; **required in production**) |

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

## Documentation

The authoritative document set lives in `docs/specs/` (AQF-01 Charter … AQF-21 Deployment Plan). The API surface is specified in AQF-07; algorithms in AQF-09; the prompt bank and LLMOps plan in AQF-10; safety and privacy design in AQF-11.

## Security notes

Accepted tradeoffs for the capstone deployment, reviewed and documented rather than hidden:

- **Tokens in localStorage** — the app runs as a Telegram Mini App where cookie-based sessions are impractical; access tokens are short-lived (15 min) and refresh tokens are single-use, rotated, family-revoked on reuse, and stored server-side only as sha256 hashes.
- **Pure-JS bcrypt at cost 10** (`bcryptjs`) — the portability floor for this capstone; a native binding and/or higher cost factor is the first hardening step for real production load.
- **Client-declared MIME with extension-derived content type** for meal-photo uploads — uploads are size-capped, allowlisted (jpeg/png/heic), stored under unguessable UUID names, never statically served, streamed only to their authenticated owner, and deleted on confirm/failure plus a 24 h TTL sweep.
