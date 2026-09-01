# AquaZeroFit — Architectural & Technical Report

*Prepared by: Senior Software Architect / Senior Software Developer*  
*Date: 2026*  
*Version: 1.0*

---

## Executive Summary

AquaZeroFit is a production-grade, AI-powered wellness platform delivering **two targets from one React codebase**: a responsive web application and a **Telegram Mini App**. Built under the **AquaZero** brand, it enables users to build wellness profiles, log meals (manually or via photograph), receive deterministic calorie/macro/hydration targets, generate adaptive home training plans, and converse with a safety-bounded conversational coach ("Aqua Coach").

**Core philosophy**: *Models identify, interpret, explain; code calculates, filters, enforces.* This architectural invariant ensures every number presented to users is computable by hand, safety floors are enforced in code (never delegated to models), and the product works fully **offline** when no AI provider keys are configured.

**License**: AGPL-3.0-or-later — network deployments must offer corresponding source.

---

## 1. Technology Stack & Programming Languages

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Frontend** | React | 18.3.1 | UI framework |
| | TypeScript | 5.5.4 | Type-safe application code |
| | Vite | 5.4.0 | Build tool, dev server, HMR |
| | Tailwind CSS | 3.4.10 | Utility-first styling with design tokens |
| | React Router | 6.26.0 | Client-side routing |
| | TanStack Query | 5.51.23 | Server state, caching, mutations |
| | Zod | 3.23.8 | Shared validation schemas (client + server) |
| **Backend** | Node.js | ≥20 | Runtime |
| | Express | 4.19.2 | HTTP server |
| | TypeScript | 5.5.4 | Type-safe server code |
| | tsx | 4.16.2 | TypeScript execution (dev & scripts) |
| | bcryptjs | 2.4.3 | Password hashing (cost 10) |
| | jsonwebtoken | 9.0.2 | JWT access tokens |
| | pg | 8.13.1 | PostgreSQL driver (optional backing) |
| | sharp | 0.35.2 | Image processing for meal photos |
| | multer | 2.0.2 | Multipart upload handling |
| | helmet | 8.3.0 | Security headers / CSP |
| | cors | 2.8.5 | CORS policy |
| **Data** | JSON files (dev) / PostgreSQL (prod) | — | Document store abstraction |
| **AI/ML** | Multi-provider gateway (Groq, OpenAI, Gemini, NVIDIA NIM, Ollama) | — | Logical model groups with fallback chain |
| **Testing** | Vitest | 2.x | Unit + integration tests |
| | @testing-library/react | 16.3.2 | Component testing |
| | jsdom | 26.1.0 | DOM environment for tests |
| **Build/CI** | npm workspaces | — | Monorepo management |
| | ESLint / Prettier | — | Code quality (implied) |
| **Deployment** | Single-origin (API serves SPA) / managed PaaS / Azure Container Apps | — | Production targets |
| **Design** | Figma (Modern Aquatic Wellness design system) | — | Source of truth for tokens |
| | Custom WebGL shaders | — | Hero orb, aurora background |

---

## 2. Repository Architecture (Monorepo)

```
aquazerofit/
├── apps/
│   ├── api/                 # Express + TypeScript API (/api/v1)
│   │   ├── src/
│   │   │   ├── app.ts          # Express app factory
│   │   │   ├── index.ts        # Entry point, store bootstrap, sweeps
│   │   │   ├── platform/       # Config, store, errors, telemetry, rate-limiter
│   │   │   └── modules/        # Feature modules (me, nutrition, plans, vision, ai, auth, growth)
│   │   ├── scripts/            # wger import, media audit, offline import
│   │   └── assets/             # Committed exercise media (public)
│   └── web/                   # React + Vite + Tailwind (SPA + Telegram Mini App)
│       ├── src/
│       │   ├── components/     # layout, ui, brand, share
│       │   ├── lib/            # api client, queries, telegram, format, attribution
│       │   ├── pages/
│       │   │   ├── landing/        # Marketing pages (/, /features, /how-it-works, /aqua-coach, /safety)
│       │   │   ├── auth/           # Welcome, SignIn, Onboarding
│       │   │   ├── dashboard/      # Dashboard, nutrition, training, progress, coach, challenges, settings
│       │   │   └── legal/          # Privacy, Terms, Support
│       │   └── styles/       # Global CSS, design tokens (CSS custom properties)
│       ├── public/           # Static assets, screenshots
│       └── staticwebapp.config.json  # Azure Static Web Apps routing
├── packages/
│   └── shared/               # Shared types, Zod schemas, constants, errors
│       └── src/
│           ├── types.ts      # 660+ lines: all domain entities
│           ├── schemas.ts    # 320+ lines: client+server validation
│           ├── constants.ts  # 180+ lines: normative constants (safety-relevant)
│           └── index.ts      # Barrel export
├── prompts/                  # Versioned AI prompts P-01..P-11 (AQF-10)
├── evals/                    # Safety evaluation sets + runner (pipeline gate)
├── content/                  # Licensing attribution, workout media governance
├── design/
│   ├── brand/                # Logos, mascot (Akin) assets
│   └── figma/                # Screen references + DESIGN.md tokens
├── docs/
│   ├── specs/                # AQF-01..AQF-22 authoritative document set
│   ├── research/             # Upstream integration tracks (wger, OFF, FDC)
│   ├── plans/                # Integration & delivery plans
│   └── screenshots/          # Captured from running app (demo account)
├── tools/
│   ├── docgen/               # Markdown → .docx renderer (excluded from workspaces)
│   └── screenshots/          # WebP re-encoding for landing page
└── .env.example              # 124-line configuration reference
```

**Key Architectural Decisions**:
- **npm workspaces** for monorepo: `apps/*`, `packages/*`
- **Shared package** (`@aquazerofit/shared`) consumed by both `api` and `web` — single source of truth for types, validation, constants
- **Prompts & evals at repo root** — `apps/api/src/modules/ai/prompts.ts` walks up the tree; moving them silently breaks prompt loading
- **tools/docgen excluded from workspaces** — its `docx` dependency never enters deployed app

---

## 3. Backend Architecture (apps/api)

### 3.1 High-Level Request Flow

```
Request → Helmet (CSP) → CORS → JSON body parser → Request Logger
        → Rate Limiter (per-IP, auth lane 10/min, global 120/min)
        → /health, /ready (probes, NO limiter)
        → /api/v1/* → Feature Routers
        → Store (MemoryBackedStore: JsonStore or PostgresStore)
        → Response → Error Handler (standardized envelope)
```

### 3.2 Storage Abstraction: Document Store (Cosmos-style)

**Containers** (logical partitions):
- `users` — accounts, credentials, consents
- `profiles` — wellness profiles + derived targets
- `logs` — mealLog, waterLog, weightLog
- `plans` — trainingPlan, workoutSession
- `content` — curated food, exercise, recipe, achievementDefinition
- `foodsOff`, `foodsFdc` — segregated upstream nutrition (ODbL, CC0)
- `ai` — userMemory (one doc per user, consent-gated)
- `ledger` — credit transactions (append-only)
- `audit` — security events

**Two Backings** (same in-memory API):
| Backing | When Used | Persistence |
|---------|-----------|-------------|
| `JsonStore` | Dev, tests, `DATABASE_URL` unset | One JSON file/container under `config.dataDir` (tmp+rename atomic writes) |
| `PostgresStore` | `DATABASE_URL` set (managed host, prod) | Single `documents(container, id, doc jsonb)` table; write-through from in-memory working set |

**Critical invariant**: `getStore()` is synchronous. Postgres hydration is async (`initStore()` awaited at boot before `app.listen()`). Single-instance durability only — scale-out requires moving reads off local copy (AQF-04, AQF-22).

### 3.3 Authentication & Tokens (AQF-07 §1)

- **Access tokens**: JWT (HS256), 15 min TTL, stored in `localStorage`/`sessionStorage`
- **Refresh tokens**: Opaque random, 30 day TTL, **single-use, rotating**, family revocation on reuse
- **Server stores**: Only `sha256(refreshToken)` — token itself never persisted
- **Logout**: Sends refresh token to server for family revocation (best-effort); local clear always proceeds
- **Telegram Mini App**: `initData` HMAC validation (bot token) → issues same token pair

### 3.4 AI Gateway (AQF-09 §2.3) — `apps/api/src/modules/ai/gateway.ts`

**Logical Model Groups** (app code never names real providers):
- `visionPrimary` — meal photo analysis
- `chatFast` — Aqua Coach streaming replies
- `planStructured` — meal/training plan generation (JSON)
- `safetyCheap` — input/output guardrails
- `insightBatch` — progress summaries

**Provider Chain** (ordered fallback):
1. Groq (Llama 4 Scout, Llama 3.3 70B, Llama 3.1 8B)
2. OpenAI (GPT-4o-mini, GPT-4o)
3. Gemini (2.0 Flash, Flash-lite)
4. NVIDIA NIM (Llama 3.2 90B Vision, Llama 3.3 70B)
5. Ollama (local, key-optional)

**Resilience Layer**:
- Per-provider timeout: 20s default
- **Overall deadline**: 12s ceiling (caller waits at most this)
- Retries with jittered exponential backoff (max 2 retries/provider)
- Circuit breaker: 3 consecutive failures → 60s cooldown
- **Deterministic mock engine** as terminal fallback — every AI feature works with **zero keys**
- `degraded: true` flag on result when real providers tried & failed (callers must branch on this)

### 3.5 Safety & Guardrails (AQF-11, prompts P-09)

**Two-Stage Classification** (input + output):
1. **Deterministic pattern matching in code** (first line, not a model)
2. Optional LLM second stage (`safetyCheap` lane) when keys configured

**Categories** (priority order):
| Label | Covers | Response |
|-------|--------|----------|
| `crisis` | Self-harm, suicidal, eating-disorder signals | Stop + signpost real support (Lifeline 13 11 14 AU) |
| `medical` | Diagnosis, medication, dosage, test results, treatment, rehab | Decline + pointer to clinician |
| `extremeDiet` | <floor calories, prolonged fasting, purging, crash diets | Decline (floors are non-negotiable) |
| `outOfScope` | Legal, financial, mental-health treatment | Decline as outside wellness scope |
| `safe` | Everyday wellness | Answer, grounded in logged day |

**Output Guardrails**: Numeric claims validated against calorie floor, macro sanity; wellness disclaimer pinned to coach screen & profile.

### 3.6 Credit Ledger (Append-Only)

- Every AI task costs credits (configurable in `constants.ts`)
- Ledger = append-only transactions; balance derived by folding
- Free tier: 50 credits/day
- Costs: chat=1, mealPhoto=3, mealRecommendation=2, planGeneration=5, recipeGeneration=2, progressInsight=1

### 3.7 Background Sweeps (Boot + Interval)

| Sweep | Interval | Purpose |
|-------|----------|---------|
| Account deletion grace | 6h | Purge accounts past 30-day grace |
| Growth events | 6h | Remove events >180 days |
| Vision artifacts | 1h | Delete expired meal photo jobs (24h TTL) |

All timers `.unref()` — never block shutdown.

### 3.8 Graceful Shutdown (25s budget)

```
SIGTERM/SIGINT → stop accepting connections → drain in-flight → flush store → exit
```
Hard failsafe at 25s forces exit. Unhandled rejection/exception → log + shutdown.

---

## 4. Frontend Architecture (apps/web)

### 4.1 Dual-Target Delivery

| Target | Detection | Adaptation |
|--------|-----------|------------|
| **Web (browser)** | `!isTMA()` | Full AquaZero design system, custom theme |
| **Telegram Mini App** | `isTMA()` → `window.Telegram.WebApp` | Binds client theme variables, native back button, MainButton, haptic feedback; silent auto-login via `initData` |

**Single codebase** — no fork. `isTMA()` gate at bootstrap routes to `/welcome` (Mini App carousel) vs `/landing` (marketing).

### 4.2 Routing & Code Splitting (`App.tsx`)

```tsx
// Marketing (lazy, public)
/landing, /features, /how-it-works, /aqua-coach, /safety, /privacy, /terms, /support

// Auth
/welcome (Mini App), /sign-in, /onboarding

// Authenticated (RequireAuth guard)
/ → Dashboard
/nutrition, /nutrition/capture, /nutrition/analysis/:jobId, /nutrition/meal-plan, /recipes/:id
/workouts, /workouts/:id
/progress, /progress/log-weight
/coach
/challenges
/settings, /settings/notifications, /settings/memory
```

**Lazy loading** on every route → minimal initial bundle. `Suspense` + `PageSpinner` fallback.

### 4.3 Authentication Guard (`RequireAuth.tsx`)

- Unauthenticated web → renders marketing `publicIndex` **in-place at `/`** (no redirect, preserves SEO, avoids double-hop)
- Unauthenticated Telegram → redirect to `/welcome`
- Authenticated → loads profile via `useProfile` query
- **Missing profile ≠ redirect** — `hasProfile: false` is first-class state; each surface decides if it needs targets (`RequireTargets`)

### 4.4 Data Layer: TanStack Query + Typed API Client

**API Client** (`lib/api.ts`):
- Transparent refresh-token rotation (single-flight promise)
- `ApiError` with typed envelope (`code`, `message`)
- SSE streaming for chat (`streamChat`)
- `mediaUrl()` helper for committed exercise media

**Query Keys** (namespaced, `lib/queries.ts`):
```ts
me: ['me']
profile: ['profile']
targets: ['targets']
nutritionDaily: (date) => ['nutrition', 'daily', date]
nutritionTrends: (range) => ['nutrition', 'trends', range]
progress: ['progress']
plan: ['plan']
workoutToday: ['workout', 'today']
foods: (term) => ['foods', term]
weight: (range) => ['weight', range]
memory: ['memory']
```

**Mutation Invalidation** — precise, documented per mutation (e.g., `useLogMeal` invalidates `['nutrition']` + `['progress']`)

### 4.5 Design System: Modern Aquatic Wellness

**Tokens** → CSS custom properties (`--azf-*`) in `styles/index.css` → Tailwind `colors` config maps to `rgb(var(--azf-*) / <alpha-value>)`

**Why indirection?** Telegram Mini App must adopt host client colours; token layer is the single binding point — no component opt-in needed.

| Palette | Token | Value |
|---------|-------|-------|
| Primary | `--azf-primary` | `#2fd9f4` (cyan) |
| Secondary | `--azf-secondary` | `#45dfa4` (green) |
| Coral (error/crisis) | `--azf-coral` | `#ff5252` |
| Surface | `--azf-surface` | `#0e161a` (deep ocean) |
| On-Surface | `--azf-on-surface` | `#e8f0f2` |

**Typography**: Barlow Condensed (headings) + DM Sans (body) — loaded via Google Fonts

**Components**: Card tiers (hero/standard/compact), custom shadows (`glow-sm`, `glow-md`, `cta`, `card`, `card-hero`), reveal animation, shimmer

### 4.6 Motion System (`pages/landing/motion.tsx`)

- **IntersectionObserver** reveals (one-shot, staggered via CSS `--lp-delay`)
- **Pointer tilt** → CSS custom properties (`--lp-rx`, `--lp-ry`, `--lp-mx`, `--lp-my`) written in rAF; compositor does the work
- **Count-up** animation (easeOutExpo)
- **Hash scroll** for lazy-loaded marketing pages
- **All effects respect `prefers-reduced-motion`** — CSS media query backstop + hooks stop work

### 4.7 WebGL Visuals (Zero Dependencies)

| Component | File | Technique |
|-----------|------|-----------|
| **AppBackground** (app shell) | `AppBackground.tsx` | Full-screen triangle, banded aurora rays, 3-layer (canvas + hatch + vignette) |
| **HeroOrb** (landing hero) | `HeroOrb.tsx` | Raymarched metaball (3 spheres + smooth-min), pointer parallax (orbits camera), pixel budget cap (900k px @ DPR≤1.75) |

**Guards** (both): prefers-reduced-motion → no init; no WebGL context → CSS fallback; off-screen → rAF stops (IntersectionObserver); backgrounded tab → browser pauses rAF; context loss → clean cancel.

---

## 5. Landing Pages Architecture

### 5.1 Page Inventory

| Route | Component | Purpose |
|-------|-----------|---------|
| `/landing` | `Landing.tsx` | Marketing front door (hero, marquee, stats, features, gallery, how-it-works, coach demo, safety, platform, final CTA) |
| `/features` | `Features.tsx` | Deep reference: formulas, limits, constants **read from `@aquazerofit/shared` at build time** — cannot drift |
| `/how-it-works` | `HowItWorks.tsx` | Journey walkthrough (6 steps: profile → log → plan → train → ask → trend) |
| `/aqua-coach` | `AquaCoach.tsx` | Coach scope, grounding, guardrails (classifier table), crisis signpost, memory, examples |
| `/safety` | `Safety.tsx` | Safety & privacy deep-dive |
| `/privacy`, `/terms`, `/support` | Legal pages | Static content |

### 5.2 Shared Marketing Shell (`Page.tsx`)

- `MarketingPage` — background, skip link, chrome, Telegram guard
- `PageHero` — breadcrumb, headline, lead, dual CTAs
- `Bullet` — checkmark + bold lead-in
- `Spec` — key/value table (rows from shared constants)
- `PageCta` — closing conversion block with wellness disclaimer

### 5.3 Landing-Specific Components

| Component | File | Highlights |
|-----------|------|------------|
| `HeroOrb` | `HeroOrb.tsx` | Raymarched metaball, single draw call, DPR-capped pixel budget |
| `PhoneShowcase` | `PhoneShowcase.tsx` | CSS-3D device frame, crossfade screen gallery (all mounted, opacity toggle) |
| `AkinStage` | `brand/AkinStage.tsx` | Interactive mascot (idle/guard/lift poses) |
| `Marquee` | `LandingSections.tsx` | Infinite scrolling feature chips |
| `Stats` | `LandingSections.tsx` | Count-up tiles (2 targets, 11 prompts, 0 unconfirmed photos, AGPL) |
| `Features` (bento) | `LandingSections.tsx` | TiltCard + spotlight, 6 feature cards |
| `Gallery` | `LandingSections.tsx` | Roving-focus tab list (ARIA) + crossfade DeviceFrame |
| `HowItWorks` | `LandingSections.tsx` | 3-step cards |
| `CoachDemo` | `LandingSections.tsx` | 3 example exchanges (grounded, medical refusal, extreme diet refusal) |
| `Safety` | `LandingSections.tsx` | 3 invariant cards |
| `Platform` | `LandingSections.tsx` | TMA, offline engine, ledger, AGPL |
| `FinalCta` | `Landing.tsx` | Closing conversion |

### 5.4 Content Integrity Guarantees

- **No invented numbers** — every stat on landing/features pages sourced from `constants.ts` or real screenshots
- **Real screenshots** — captured from running app (demo account), not renderings
- **Features page constants** — imported from shared package; change constant → page updates in same commit
- **Safety claims** — drawn from shipped classifier (`guardrails.ts`, `P-09`), not marketing copy

---

## 6. Core Domain Features

### 6.1 Nutrition & Logging

- **Three input modes**: Camera (vision), Search (food corpus), Barcode (OFF integration planned)
- **Vision pipeline**: Upload → background job → proposals → user confirms → code multiplies per-100g → sweep photo (24h TTL, immediate on failure)
- **EXIF/XMP/IPTC/ICC stripped** on upload (GPS at home-address precision)
- **Allergen exclusion**: Deterministic filter post-generation, zero tolerance for false negatives (admits false positives)
- **Food corpus**: Curated `content` container + segregated `foodsOff` (OpenFoodFacts ODbL) + `foodsFdc` (USDA CC0)

### 6.2 Targets & Deterministic Maths (AQF-09 §2.2)

| Formula | Source | Code Location |
|---------|--------|---------------|
| BMR | Mifflin-St Jeor | `modules/me/targets.ts` |
| TDEE | BMR × activity factor | `ACTIVITY_FACTORS` constant |
| kcalTarget | TDEE ± bounded rate of change | `WEEKLY_LOSS_FRACTION` (0.5–1% bw/week) |
| Protein | g/kg by goal | `PROTEIN_G_PER_KG` (lose 2.0, maintain 1.6, gain 2.2) |
| Fat | Minimum kcal fraction | `FAT_KCAL_FRACTION_MIN` = 20% |
| Carbs | Remainder | Computed |
| Hydration | ml/kg bodyweight | `WATER_ML_PER_KG` = 33, clamped 1.5–4L |

**Calorie floors** (never proposed below, clamp advisory shown):
- Female: 1200 kcal
- Male: 1500 kcal
- Unspecified: 1200 kcal

**Biometric ranges** (rejected at boundary, not coerced):
- Weight: 30–300 kg
- Height: 100–250 cm
- Age: 16–100 years

### 6.3 Training Plans (wger Integration)

- **Corpus**: Openly licensed (CC BY-SA) exercise library from wger.de
- **Filtering**: Equipment → muscle group → movement type (before assembly)
- **Adaptive**: Plan adjusts as logged sessions & weight change (not fixed PDF)
- **Attribution**: CC BY-SA licence, author, source link preserved on every card
- **AI-generated media**: Disclosed on card (`isAiGeneratedMedia` flag)
- **Progression engine** (Phase 2): weight/reps/sets/rest/RIR rules with autoregulation

### 6.4 Aqua Coach (Conversational Assistant)

- **Context injected per turn**: Today's nutrition, current workout, progress summary, approved memory facts
- **History budget**: Last 12 exchanges, ≤6000 chars (truncated oldest-first)
- **Streaming**: SSE (`streamChat`), token-by-token
- **Memory** (Phase 1+2):
  - Facts: `suggested` → user confirms → `confirmed` (eligible for injection) or `rejected`
  - Caps: 60 confirmed, 20 suggested, 3/turn extraction, 280 chars/fact
  - Rejected retained 30 days (avoid re-suggestion), then erased
  - Rolling summary regenerated when confirmed count drifts ≥5
- **Personalisation**: Off until explicit consent (`aiPersonalisation`), revocable

### 6.5 Progress & Trends

- Weight journey (7/30/90 days) plotted against goal
- Calorie trend bar chart with average
- Written insights: describe data, **no diagnosis, no moralising**

### 6.6 Growth & Telegram (P0)

- Buddy challenges (private accountability, max 4 members)
- Share cards (OG image generation via `shareCard.ts`)
- Growth events (unauthenticated, bounded props, 180-day retention)
- Telegram Mini App: theme binding, native controls, silent auto-login

---

## 7. Safety & Compliance Architecture

### 7.1 Safety Invariants (Enforced in Code, Tested)

1. **Models identify/interpret/explain; code calculates/filters/enforces**
2. **Calorie targets clamped to floors** with visible advisory (FR-031)
3. **Allergen exclusion** = deterministic filter, zero false-negative tolerance
4. **Meal photo never commits without explicit confirmation** (FR-013)
5. **Assistant refuses** medical/crisis/extreme-diet with supportive signpost (FR-045)
6. **Credit ledger append-only**; balances derived by folding

### 7.2 Evaluation Pipeline (`evals/`)

- `assistant-safety.json` — 50 test cases
- `plan-safety.json` — 319 test cases
- `recommendation-safety.json` — 129 test cases
- `runner.ts` — executes against gateway, asserts classifications
- **CI gate**: `npm run verify` = typecheck → tests → safety eval

### 7.3 Privacy & Data Handling

- **GDPR export/purge**: `USER_SCOPED_CONTAINERS` covers `ai` (memory), `logs`, `profiles`, `plans`
- **Meal photos**: Size-capped (10MB), allowlisted MIME, unguessable UUID names, never static-served, streamed only to owner, deleted on confirm/failure + 24h TTL
- **Telegram launch data**: HMAC validated, 600s freshness window
- **Consent gates**: `wellnessDataProcessing`, `aiPersonalisation`, `anonymisedAnalytics`, `reminders` — all granular, revocable

### 7.4 Security Posture

| Measure | Implementation |
|---------|----------------|
| Helmet CSP | Split config: SPA mode (allows Telegram frame-ancestors, fonts, inline styles) vs API-only (strict) |
| Rate Limiting | Per-IP: auth 10/min, global 120/min; `trustProxy` calibrated for Azure ingress |
| Password Hashing | bcryptjs cost 10 (portability floor; native binding + higher cost for real prod) |
| Tokens | Short-lived JWT (15m) + rotating refresh (family revocation); stored in localStorage (TMA constraint) |
| CORS | Explicit origins; production rejects `*` and `http://` |
| Mail | Production refuses boot without Resend + verified `MAIL_FROM` + `APP_PUBLIC_URL` |
| Uploads | Private, ownership-checked, size-capped, metadata-stripped |

---

## 8. Development & Deployment Workflow

### 8.1 Local Development

```bash
npm install
npm run api    # API on :4000 (seeds demo data)
npm run dev    # Web on :5173 (Vite proxies /api → :4000)
```

**Demo account** (seeded everywhere): `demo@aquazero.fit` / `AquaZeroDemo!2026`

### 8.2 Build & Verification

```bash
npm run build      # typecheck + production build (shared → api → web)
npm run test       # vitest (unit + integration)
npm run eval       # safety evaluation runner
npm run verify     # typecheck → test → eval (exact CI pipeline)
```

### 8.3 Configuration (`.env` — 124 variables documented)

| Category | Key Variables |
|----------|---------------|
| Runtime | `PORT`, `DATABASE_URL`, `AZF_DATA_DIR`, `SERVE_WEB`, `TRUST_PROXY` |
| Security | `JWT_ACCESS_SECRET`, `TELEGRAM_BOT_TOKEN` |
| Mail | `RESEND_API_KEY`, `MAIL_FROM`, `APP_PUBLIC_URL`, `MAIL_PROVIDER` |
| AI Providers | `GROQ_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `OLLAMA_API_KEY` |
| Uploads | `UPLOADS_DIR` (persistent volume on ephemeral hosts) |
| Safety | `ENABLE_LLM_SAFETY` |

**Production secret guard** (`assertProductionSecrets`) — fails fast at boot if dev fallbacks detected.

### 8.4 Deployment Targets

| Target | Strategy |
|--------|----------|
| **Single-instance managed PaaS** | Single-origin (API serves SPA), `DATABASE_URL` → PostgresStore, persistent volume for `UPLOADS_DIR` |
| **Azure Container Apps** | Same; `TRUST_PROXY=1` for ingress; HSTS preload |
| **Static Web App + API** | `SERVE_WEB=false`, split origins, configure `CORS_ORIGINS`, `VITE_API_BASE_URL` |

---

## 9. Documentation Corpus (AQF-01..AQF-22)

| Doc | Title | Purpose |
|-----|-------|---------|
| AQF-01 | Project Charter & Team Roles | Governance |
| AQF-02 | Product Requirements Document | Product scope |
| AQF-03 | Software Requirements Specification | Functional/non-functional reqs |
| AQF-04 | System Architecture HLD | High-level design |
| AQF-05 | Architecture Decision Records | ADR log |
| AQF-06 | Data Model & Database Schema | Document store schema |
| AQF-07 | API Contract | `/api/v1` specification |
| AQF-08 | UML Diagram Package | Structural/behavioral diagrams |
| AQF-09 | Low-Level Design | Algorithms, gateway, store |
| AQF-10 | AI Prompt Bank & LLMOps Plan | P-01..P-11, eval strategy |
| AQF-11 | Safety, Privacy & Ethical Design | Guardrails, privacy, ethics |
| AQF-12 | Upstream Integration & Licensing | wger, OFF, FDC licensing |
| AQF-13 | Technical Implementation Document | Code-level design |
| AQF-14 | Test Plan & QA Strategy | Test approach |
| AQF-15 | Runbook & Deployment Guide | Operations |
| AQF-16 | Development Diary | Build log |
| AQF-17 | Progress Report | Milestone tracking |
| AQF-18 | User Manual | End-user guide |
| AQF-19 | Final Report | Project closure |
| AQF-20 | Traceability Matrix | Req → code → test |
| AQF-21 | Azure Production Readiness | Infra, scaling, monitoring |
| AQF-22 | Deployment & Domain Guide | Platform-specific ops |

---

## 10. Code Quality & Engineering Practices

### 10.1 Type Safety

- **End-to-end TypeScript**: Shared types → API handlers → React Query hooks → components
- **Zod schemas** single source of validation (client inline feedback + server authoritative)
- **No `any`** in application code (enforced by `tsc --noEmit`)

### 10.2 Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit | Vitest | Pure functions (targets, format, attribution, progression) |
| Integration | Vitest + Supertest | Full HTTP request → store → response cycles |
| Component | @testing-library/react | Landing sections, auth forms, coach memory UI |
| Safety Eval | Custom runner | Classifier assertions against fixture sets |
| Contract | Zod schemas | Request/response validation |

### 10.3 Observability

- **Request logger** (method, path, status, latency, IP)
- **AI call telemetry** (provider, model, promptVersion, latency, tokens, guardrail outcome)
- **Structured error envelope** (`code`, `message`, `details`) — consistent across API

### 10.4 Accessibility

- Semantic HTML, ARIA roles (tablist, tabpanel, roving focus)
- Skip links, focus-visible outlines
- `prefers-reduced-motion` respected at every layer
- Colour contrast per WCAG (design tokens)

---

## 11. Known Constraints & Accepted Trade-offs (Documented)

| Area | Trade-off | Mitigation |
|------|-----------|------------|
| **Tokens in localStorage** | TMA makes cookie sessions impractical | Short TTL (15m), rotating refresh, family revocation, server stores only sha256 |
| **bcryptjs cost 10** | Portability floor for capstone | Native binding + higher cost = first hardening step for prod |
| **Client-declared MIME** | Meal photo uploads | Size cap, allowlist, UUID names, private, ownership-checked, TTL sweep |
| **Single-instance Postgres** | Local working set hydration | Documented in AQF-04/22; scale-out requires read replicas |
| **Offline mock engine** | Template output when providers fail | `degraded` flag forces caller branching; never silently served as genuine |

---

## 12. File/Module Map (Key Entry Points)

### API
```
apps/api/src/
├── index.ts                    # Bootstrap, sweeps, graceful shutdown
├── app.ts                      # Express factory, middleware stack, SPA serving
├── platform/
│   ├── config.ts               # Central config (getters, production guards)
│   ├── store.ts                # MemoryBackedStore, JsonStore, PostgresStore, initStore/getStore
│   ├── errors.ts               # AppError, errorHandler, notFoundHandler
│   ├── telemetry.ts            # requestLogger, logAiCall
│   └── rateLimiter.ts          # Per-IP buckets (auth + global)
└── modules/
    ├── index.ts                # buildRouter() composes all feature routers
    ├── auth/                   # login, register, refresh, logout, telegram, password reset
    ├── me/                     # profile, targets, consents, memory, identity
    ├── nutrition/              # daily, trends, meal-logs, water-logs, weight-logs, foods
    ├── plans/                  # training plans, workout sessions, progression
    ├── vision/                 # meal photo upload, analysis job, confirmation
    ├── ai/                     # chat (SSE), gateway, guardrails, prompts, providers
    ├── growth/                 # buddy challenges, share cards, growth events
    └── admin/                  # admin-only endpoints
```

### Web
```
apps/web/src/
├── main.tsx                    # React root
├── App.tsx                     # Routes (lazy), Suspense
├── components/
│   ├── layout/                 # AppLayout, RequireAuth, AppBackground, ToastProvider
│   ├── ui/                     # Buttons, RingProgress, Skeleton, Toast, PageSpinner
│   ├── brand/                  # AkinStage (mascot)
│   └── share/                  # ShareMoment (OG card)
├── lib/
│   ├── api.ts                  # Typed client, tokenStore, SSE streaming
│   ├── queries.ts              # React Query hooks (all data + mutations)
│   ├── telegram.ts             # isTMA, theme binding, auto-login
│   ├── format.ts               # Date, number, unit formatting
│   ├── attribution.ts          # Licence rendering for exercises
│   └── contracts.ts            # API response type guards
├── pages/
│   ├── landing/                # Landing, Features, HowItWorks, AquaCoach, Safety, Chrome, motion
│   ├── auth/                   # Welcome, SignIn, Onboarding, SetupPrompt
│   ├── dashboard/              # Dashboard, MacroBar, WaterCard, Sparkline, SuggestMealCard
│   ├── nutrition/              # Nutrition, CaptureMeal, AnalysisResults, MealPlan, RecipeDetail
│   ├── training/               # WorkoutLibrary, WorkoutDetail
│   ├── progress/               # Progress, LogWeight
│   ├── coach/                  # Coach (chat UI)
│   ├── challenges/             # Challenges
│   ├── settings/               # Settings, NotificationSettings, Memory
│   └── legal/                  # Privacy, Terms, Support
└── styles/
    └── index.css               # Design tokens (--azf-*), global styles, Tailwind layers
```

### Shared
```
packages/shared/src/
├── types.ts                    # All domain entities (660+ lines)
├── schemas.ts                  # Zod validation (client + server)
├── constants.ts                # Normative constants (safety-relevant, ADR-gated)
├── errors.ts                   # Shared error codes
├── wger.ts                     # wger API types
└── index.ts                    # Barrel export
```

---

## 13. Architectural Assessment

### Strengths

1. **Clean separation of concerns** — platform (config, store, errors, telemetry) vs feature modules
2. **Single source of truth** — `@aquazerofit/shared` eliminates type drift between client/server
3. **Deterministic core** — calorie maths, allergen filters, safety floors in code, not models
4. **Offline-first AI** — mock engine ensures every journey works without external dependencies
5. **Resilient gateway** — circuit breakers, overall deadline, fallback chain, telemetry
6. **Dual-target from one codebase** — Telegram Mini App is not a fork
4. **Design token indirection** — enables TMA theme binding without component changes
5. **Comprehensive documentation** — AQF-01..22 traceable to code
6. **Safety by architecture** — classifier in code, two-stage, output validation, eval gate
7. **Accessibility & motion respect** — built-in, not bolted on

### Areas for Evolution (Post-Capstone)

| Area | Recommendation |
|------|----------------|
| **Store scale-out** | Move reads off local working set; add read replicas or migrate to Cosmos/Postgres with proper connection pooling |
| **Password hashing** | Swap `bcryptjs` → native `bcrypt` (or argon2) at cost ≥12 |
| **Token storage** | Evaluate HTTP-only cookies + CSRF for web (keep localStorage for TMA) |
| **Observability** | Structured logging (pino), distributed tracing (OpenTelemetry), metrics (Prometheus) |
| **CI/CD** | GitHub Actions workflow (currently badge only); add dependency scanning, container build |
| **Multi-instance sweeps** | Coordinate sweeps via distributed lock or move to scheduled jobs |
| **AI provider abstraction** | Formalize provider SDK interface; add request/response transforms per provider quirks |

---

## 14. Conclusion

AquaZeroFit demonstrates **production-grade engineering** across the full stack:

- **Architecture**: Clean monorepo, document-store abstraction, dual-target frontend, resilient AI gateway
- **Safety**: Deterministic guardrails, two-stage classification, eval-gated pipeline, privacy-by-design
- **Quality**: End-to-end TypeScript, shared validation, comprehensive test pyramid, accessibility
- **Operations**: Graceful shutdown, background sweeps, configuration guards, single-origin deployment simplicity
- **Transparency**: AGPL licensing, open constants, real screenshots, no invented metrics

The codebase is **ready for production deployment** on Azure or a comparable managed host with the documented configuration, and the AQF document set provides full traceability for maintenance and evolution.

---

*End of Report*