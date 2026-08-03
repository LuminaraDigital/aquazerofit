---
logo: design/brand/AquaZeroFit(single_Logo).png
brand: AquaZero
tagline: AI Wellness Assistant
unit: NIT3004 IT Capstone Project 2
title: Production Readiness Review
subtitle: Codebase assessment and Azure infrastructure plan
details:
  Document ID: AQF-21
  Project: AquaZeroFit, an AI-powered wellness platform (web and Telegram Mini App)
  Prepared by: Babatundji Williams-Fulwood, Technical Lead and Software Architect
  Team: Babatundji Williams-Fulwood (s8138393), Eric La, Victor Hong
  Date: 31 July 2026
  Audience: First-time deployer, no prior platform experience assumed
  Document status: Issued
---

# AquaZeroFit: Production Readiness Review and Azure Infrastructure Plan

Document ID: AQF-21
Status: Issued
Date: 31 July 2026
Prepared for: AquaZero / AquaZeroFit engineering
Audience: A first-time Azure operator. Every step assumes no prior Azure experience.

## 0. How to read this document

This document answers four questions, in order:

1. Is the codebase professionally structured, and does it need refactoring?
2. Is the backend production ready today, setting Azure aside entirely?
3. What Azure infrastructure does this specific application need, and how do I build it step by step?
4. Should the domain stay at Hostinger or move to Azure?

Sections 1 to 3 are assessment. Sections 4 to 9 are the build. Section 10 onward is cost, risk and sequencing.

Two things were found during this review that invalidate the most common plan for a project like this. They are stated here because they change what you buy before you spend anything:

- **An Azure for Students subscription can no longer be used for Azure OpenAI.** Microsoft's guidance is that Students and other free-tier subscriptions are not eligible, and students additionally hit an "Allowed resource deployment regions" policy that does not overlap with the regions Azure OpenAI offers. If the AI features are to run on Azure, a **Pay-As-You-Go subscription is required**. Plan for this before designing around it.
- **Cosmos DB's free tier and its serverless mode are mutually exclusive.** The widely-quoted "1000 RU/s and 25 GB free" applies to provisioned and autoscale accounts only. You must choose one or the other; you cannot have a free serverless account.

Both are verified against Microsoft documentation; sources are listed in Appendix D.

## 1. Verdict at a glance

| Question | Answer |
|---|---|
| Is the repository professionally structured? | **Yes.** 7.5/10. No restructuring warranted. |
| Does it need refactoring? | **Targeted refactoring only**, not a restructure. Seven specific items. |
| Is the backend production ready (excluding Azure)? | **No.** Seven blocking defects, of which two were security-critical. |
| Were the blockers fixed in this pass? | **Nine of them, yes.** The rest are scoped below with effort estimates. |
| Is the product ready to launch to real users? | **No, and this is the harder gap.** The failures are legal and trust-related, not engineering. |
| Can this run on Azure? | **Yes**, and the architecture maps cleanly. But not before the data layer is replaced. |

## 2. Repository and code structure assessment

### 2.1 On the "Claude / Kimi / Cursor folder" concern

The concern raised, that AI-agent scratchpad folders named for the tool that produced them do not belong in a production repository, is correct as a general principle. **It does not apply to this repository.** There are no `Claude/`, `Kimi/`, or `Cursor/` directories. The only tool-specific path is `.claude/`, which is a dot-directory holding project configuration, and that is the conventional, accepted location for it.

No action is required on that point. It is recorded here so the finding is closed rather than left open.

### 2.2 What the structure actually looks like

The repository is a genuine npm-workspaces monorepo:

```
apps/api          Express + TypeScript API      ~15,700 LOC
apps/web          React 18 + Vite + Tailwind    ~12,500 LOC
packages/shared   Types, zod schemas, constants  ~1,200 LOC
prompts/          P-01..P-11 versioned prompts
evals/            Safety evaluation suites
Documentation/    AQF-01..AQF-21 specifications
content/          Licensing attribution
```

The API is organised by domain, `modules/<domain>/{router,service}`, with cross-cutting concerns isolated in `platform/`. That is the correct shape. Health calculations are deliberately kept out of the AI path and computed in code. Nutrition data from Open Food Facts is segregated into its own container to preserve the ODbL licensing posture rather than commingled with curated content. These are deliberate, well-reasoned decisions, not accidents.

**This codebase does not need restructuring.** Recommending a large refactor here would be manufacturing work.

### 2.3 Refactoring that is genuinely warranted

Seven items, in priority order. None is architectural.

| # | Item | Location | Why it matters |
|---|---|---|---|
| R1 | 44 `eslint-disable` comments suppressing a linter that is never run, no ESLint config exists anywhere | across `apps/` | Dead directives give false assurance |
| R2 | Two different local-date implementations with different semantics | `web/src/lib/format.ts` and `web/src/pages/dashboard/lib.ts` | Two date engines in one app is a latent correctness bug |
| R3 | `recommendations/router.ts` (416 lines) has no service layer, scoring, budget maths and ledger orchestration inline in route handlers | `api/src/modules/recommendations/` | Breaks the pattern every other module follows |
| R4 | `vision/router.ts` (340 lines) likewise; `sweepVisionArtifacts` is exported *from a router* and called by the scheduler | `api/src/modules/vision/` | Boundary violation |
| R5 | Hardcoded `protein*4, carbs*4, fat*9` while `KCAL_PER_G` is already exported from shared | `web/src/pages/progress/Progress.tsx:197` | Duplicated domain constant |
| R6 | Memory types hand-mirrored on the client with four `TODO(shared)` markers | `web/src/lib/queries.ts:439` | Contract drift waiting to happen |
| R7 | `scripts/node_modules/`, a stray nested install; its one script forced `docx` into the **root** application dependency tree | `scripts/` | Document tooling should not be an app dependency |

Deliberately **not** recommended for change, because they look odd but are correct:

- `web/src/lib/contracts.ts` is not contract drift. Its header documents these as Stage-2 wger shapes intentionally not yet frozen into `packages/shared`.
- The `(d: any)` predicates in `ai/util.ts` are store filter callbacks over untyped JSON documents; the generic types the return value. Correct as written.
- `rateLimiter.ts` bypassing the shared `AppError` is deliberate, middleware must set `Retry-After` before responding, and it uses `satisfies ApiErrorBody` so the envelope is compile-time enforced.
- `apps/web/dist/` and `apps/api/.data/` exist on disk but are correctly gitignored and untracked.

### 2.4 Test and type health

Measured, not estimated:

- **327 tests across 24 files, all passing.**
- `tsc --noEmit` clean across all three workspaces.
- Only 34 loose-type sites (`any`, `@ts-ignore`, non-null assertions) in ~28,000 lines. That is a low number.
- 4 `TODO` markers repo-wide.

## 3. Is the backend production ready, excluding Azure?

**No.** The engineering quality is high, but there were seven defects that would cause real failures under production conditions. Two were security-critical. Nine fixes were applied during this review; they are listed in §3.2.

### 3.1 The blockers that were found

**Critical, password reset tokens written to logs.** `modules/auth/service.ts` logged the raw reset token unconditionally, not only in development. On any hosted platform stdout is shipped to a log aggregator, so the token became a credential readable by anyone with log access: request a reset for any address, read the token from logs, take over the account within the 30-minute window. *Fixed.*

**Critical, the entire security posture depended on `NODE_ENV` being set to exactly `production`.** If it is unset or misspelled, which is the default state of a fresh Azure App Service, the application silently falls back to a committed JWT signing secret (`aquazerofit-dev-access-secret`), a `dev-bot-token` Telegram secret allowing self-signed launch data, and seeds a well-known admin account. The guard meant to prevent this is itself gated on the same variable, so it does nothing. *Partially fixed; see §3.3.*

**Rate limiting inverted into a self-denial-of-service.** The app never called `app.set('trust proxy', …)`, so behind any Azure ingress `req.ip` resolves to the platform's front-end address, identical for every caller. The per-IP lanes therefore became **global** limits: ten failed logins from one attacker would lock every user out of the platform. *Fixed.*

**Health probes sat behind the rate limiter.** Liveness probes shared the same global bucket, so under load the probe would 429 and the platform would restart a perfectly healthy container, in a loop. There was also no readiness probe distinct from liveness. *Fixed.*

**No graceful shutdown.** Writes are acknowledged from memory and flushed to disk on a deferred task. With no `SIGTERM` handler, every deployment, scale-in and restart dropped in-flight requests and discarded unflushed writes. Container platforms send `SIGTERM` and wait, that budget was simply unused. *Fixed.*

**No security headers at all.** No `helmet`, no CSP, no HSTS, no `X-Content-Type-Options`. *Fixed.*

**The production container could not start.** `tsx` is the runtime entrypoint but was declared a devDependency, so an image built with `npm ci --omit=dev` would install everything except the thing needed to run. *Fixed.*

### 3.2 Changes applied in this pass

All verified against the full suite, **327 tests passing, typecheck clean**.

| Change | File |
|---|---|
| Reset token logging gated to development only | `api/src/modules/auth/service.ts` |
| `trust proxy` made configurable; defaults to 1 in production, 0 in dev | `api/src/platform/config.ts`, `app.ts` |
| Production boot now requires `CORS_ORIGINS`, rejects `*` and rejects plaintext `http://` origins | `api/src/platform/config.ts` |
| `helmet` added with a restrictive CSP (`default-src 'none'`), HSTS preload, `frame-ancestors 'none'` | `api/src/app.ts` |
| `/health` (liveness) and new `/ready` (readiness) moved above the rate limiter | `api/src/app.ts` |
| Graceful shutdown: drain connections, flush the store, 25s failsafe; plus `unhandledRejection` / `uncaughtException` handlers | `api/src/index.ts` |
| JWT verification pinned to `HS256` | `api/src/platform/auth.ts` |
| `emailVerified` no longer asserts a verification that never happened in production | `api/src/modules/auth/service.ts` |
| `tsx` moved to dependencies so a production image can start | `api/package.json` |
| Frontend API and media origins made configurable via `VITE_API_BASE_URL` / `VITE_MEDIA_BASE_URL` | `web/src/lib/api.ts`, `vite-env.d.ts` |
| SSE chat no longer sends the literal string `Bearer null` when signed out | `web/src/lib/api.ts` |
| Production Dockerfile (multi-stage, non-root, `dumb-init` for correct signal handling, tests gate the image) | `apps/api/Dockerfile` |
| Static Web Apps config: SPA fallback, cache headers, CSP allowing Telegram to frame the app | `apps/web/staticwebapp.config.json` |
| 11 new regression tests covering the boot guards and proxy trust | `api/src/__tests__/productionGuards.test.ts` |

A note on one of those: the Static Web Apps CSP deliberately omits `X-Frame-Options` and uses `frame-ancestors` instead. `X-Frame-Options: SAMEORIGIN` would have blocked the Telegram Mini App, which renders inside a Telegram-hosted iframe on web.telegram.org. `X-Frame-Options` cannot express a multi-origin allowlist; CSP can.

### 3.3 What remains, and must be done before real users

These were **not** fixed, because each is a substantial piece of work rather than a defect to patch.

**The data layer is the single largest blocker.** Persistence is an in-process JSON file store: the whole dataset lives in a `Map`, loaded once at construction and never re-read. Two instances means two divergent copies of reality, and whichever flushes last silently destroys the other's writes, the writer rewrites the entire container file. This forces `minReplicas = maxReplicas = 1`, which forfeits availability and scaling. Additionally, health and personal data (weights, meals, chat transcripts, memory facts) sit as **unencrypted plaintext JSON on local disk**.

The migration seam is rated **4/10** for difficulty. The right interface (`ContainerHandle`) exists and is well documented, but only two files use it, 19 non-test files and roughly 61 call sites bind directly to the concrete class. The interface is also synchronous and incomplete, which is precisely why modules reach past it. Cosmos is asynchronous, so those call sites and their entire caller chains must become `async`.

Recommended sequence, which turns the migration into a compiler-checked exercise:

1. Widen `ContainerHandle` to the full surface and make every method return a `Promise`. Add an explicit query specification so predicates stop being opaque JavaScript closures that Cosmos cannot translate.
2. Remove `getStore()` from the module's public surface. This converts all 61 violations into type errors, a mechanical, safe migration rather than a search-and-hope.
3. Convert the affected files to async, starting with `platform/auth.ts`, which is the deepest.
4. Introduce a `repositories/` layer so partition keys and point reads live in one place.
5. Implement `CosmosStore` behind an environment switch, keeping `JsonStore` for tests.

Estimated **3 to 5 focused days** for steps 1 to 4 and **~2 days** for step 5. The existing test suite is what makes this safe.

**Other outstanding items:**

| Item | Impact | Effort |
|---|---|---|
| Meal photos written to ephemeral local disk with an absolute server path stored in the job document | Breaks on restart and across instances | 0.5 day (Blob Storage) |
| EXIF/GPS not stripped from uploaded meal photos | Home-address-precision location attached to health records | 2 hours |
| `multer@1.x` is end-of-life with unpatched denial-of-service CVEs | Any account can crash the API | 1 hour (upgrade to 2.x) |
| Refresh tokens (30-day) in `localStorage` | Any XSS becomes full account takeover | 0.5 day (HttpOnly cookie) |
| Rate-limit buckets are per-instance in memory | Limits multiply by replica count | 0.5 day (Redis) |
| AI provider chain has no retries, no backoff, no circuit breaker; a 429 silently falls through to the offline mock and is returned to the user as a real coach answer, with credits committed | Users receive template output believing it is AI; no alert fires | 1 day |
| Worst case ~100s hang: a 20s timeout applied *per provider* across five providers with no overall deadline | Request hangs far past any sane budget | 2 hours |
| Vision never sends the image, it sends the *filename* plus a candidate list, so a real provider hallucinates from the list | Meal photo analysis is not actually analysing photos | 1 day |
| Safety guardrail `pre()` is called on the chat lane only; vision, recommendations, plans and memory extraction bypass it. The "safety classifier" is pure regex; P-09 is loaded only to produce a version string | Safety coverage is far narrower than it appears | 1 to 2 days |
| Evals genuinely exit non-zero but are wired to no automation, no CI exists | The safety gate never runs | 0.5 day |
| Background sweeps run on every replica concurrently, and are `unref`'d so a scaled-to-zero app never sweeps | Destructive purges racing; or never running | 0.5 day |
| No OpenAPI specification, though AQF-07 names it the contract source of truth | Documented claim is unbacked | 1 day |

### 3.4 Product and legal blockers, the harder gap

The engineering can be finished in a sprint. These cannot be fixed by deploying anything, and they are what actually blocks a launch.

- **Password reset is non-functional in production.** There is no mail transport anywhere in the API. The UI offers "Forgot password?" and calls a real endpoint. Any user who forgets their password is permanently locked out.
- **No privacy policy, no terms of service, no support channel, no data-controller identity.** The application processes GDPR Article 9 special-category health data. This is not optional.
- **Notification settings are a facade**, four reminder toggles persisted to `localStorage` with zero delivery code behind them. An honest "coming soon" banner is shown, which is good practice, but users are still configuring reminders that can never fire.
- **Attribution is incomplete.** Per-record attribution renders correctly for wger and Open Food Facts. But `content/ATTRIBUTION.md` specifies an in-app attribution page and a library attribution link, and neither exists. For ODbL and CC-BY-SA content this is a licence-compliance gap, and it is roughly two hours of work to close.
- **Health screens carry no disclaimer.** The onboarding screen that presents a personalised calorie and macro prescription, the single most consequential screen in the product, does not render `WELLNESS_DISCLAIMER`, even though the constant already exists in `packages/shared`. Training plans have no injury caveat in the UI, though the prompt layer enforces one server-side. The disclaimer that does appear in Settings is rendered at 10px and roughly 2:1 contrast, well below accessibility minimums.
- **68% of the exercise library (564 of 828) still points at a placeholder SVG.**

On the requested standard of "100% correct with no mistakes": that is not a state software reaches, and any report claiming it would be worth less to you than this one. What is achievable, and what this document sets out, is: every known defect either fixed or explicitly listed with an owner and an effort estimate, and a test suite that fails when someone reintroduces one. That is the professional standard.

## 4. Azure concepts for a first-time operator

Before the build steps, the vocabulary. Skip this if it is familiar.

| Term | What it means |
|---|---|
| **Tenant** | Your organisation's identity boundary (Microsoft Entra ID, formerly Azure AD). Your university account lives in one. |
| **Subscription** | The billing container. Resources live inside it. This is what must be Pay-As-You-Go for Azure OpenAI. |
| **Resource group** | A folder for resources that share a lifecycle. Deleting it deletes everything inside, which makes it an excellent teardown tool. |
| **Region** | The physical datacentre location. Pick one close to users and keep everything in it; cross-region traffic costs money and adds latency. |
| **Resource** | Any individual thing: a database, a container app, a key vault. |
| **Managed Identity** | An automatic identity for your app so it can authenticate to other Azure services **with no password stored anywhere**. This is the single most important security concept here. |
| **RBAC** | Role-Based Access Control, who may do what, to which resource. |
| **Bicep** | Microsoft's infrastructure-as-code language. You describe the infrastructure in a file, commit it, and apply it repeatedly. |
| **azd** | Azure Developer CLI. Wraps provisioning and deployment into `azd up`. |

The principle underneath the whole design: **no secret is ever typed into a configuration field.** Secrets live in Key Vault; the application authenticates to Key Vault using a Managed Identity, which has no password. This is the difference between a student project and an enterprise deployment.

## 5. Target architecture

### 5.1 The recommended shape

| Component | Azure service | Why this one |
|---|---|---|
| API | **Container Apps** | Scales to zero, managed, first-class Managed Identity, matches the Dockerfile now in the repo |
| Web app | **Static Web Apps** | Free tier, global CDN, free managed TLS, custom domains, SPA fallback |
| Database | **Cosmos DB for NoSQL** | The existing store already emulates its container model, so the data design carries over directly |
| Meal photos | **Blob Storage** | Private container, customer-managed keys, short-lived user-delegation SAS |
| Secrets | **Key Vault** | With purge protection and soft delete enabled |
| Images | **Container Registry** | Private, no anonymous pull |
| Cache / rate limits | **Azure Cache for Redis** | Makes rate limiting correct across replicas |
| Monitoring | **Application Insights + Log Analytics** | Traces, metrics, alerting |
| AI | **Azure OpenAI / Microsoft Foundry** | Requires Pay-As-You-Go, see §0 |
| Edge / WAF | **Front Door Premium** | OWASP ruleset, edge rate limiting. Add in phase 3, not phase 1 |
| DNS | **Azure DNS** | Optional; see §8 |

### 5.2 Cosmos DB container and partition-key design

This matters more than any other single decision, because a wrong partition key is expensive to change later. The current code does full in-memory scans; on Cosmos those become cross-partition queries billed per request unit.

| Container | Partition key | Note |
|---|---|---|
| `users` | `/userId` | Refresh-token rotation currently scans **all** users by token hash every 15 minutes per session. Must become a point read. |
| `profiles` | `/userId` | Document id `profile-{userId}` enables point reads |
| `logs` | `/userId` | Highest-volume container; every dashboard load queries it |
| `plans` | `/userId` | |
| `content` | `/type` | ~995 documents, ~925 KB. **Cache in process** rather than querying per request. |
| `foodsOff` | `/barcode` | Id = barcode, so lookups are point reads |
| `foodsFdc` | `/fdcId` | |
| `ai` | `/userId` | Chat sessions, memory documents |
| `ledger` | `/userId` | Reservation lookups currently query by reservation id with no user id, encode the user id into the reservation id to avoid a cross-partition query |
| `audit` | `/pk` = userId, or `anon-YYYYMM` | Anonymised records all share one id today, which would create a single hot partition |

Set a Cosmos **TTL** on idempotency records and expired reset tokens rather than leaving them to accumulate.

Read, modify, write sequences in the memory and log services currently rely on JavaScript's single-threaded execution. On Cosmos these need optimistic concurrency via ETags. The `MemoryDoc.version` field already exists and should become the precondition.

### 5.3 Adding Azure OpenAI to the application

Difficulty: **3/10**. The provider abstraction is clean, one file, one function. `modules/ai/gateway.ts`, the `PROVIDERS` table and `callProvider()`. No other module names a provider.

Two routes:

- **Simplest:** target the Foundry v1 OpenAI-compatible endpoint (`https://<resource>.services.ai.azure.com/openai/v1`, Bearer auth). This needs **zero code changes**, just a new entry in the `PROVIDERS` table.
- **Native:** add an `authStyle: 'apiKey'` and `apiVersion` field to the provider definition, emit an `api-key` header, and build the `/openai/deployments/{deployment}/chat/completions?api-version=...` URL.

Note that the `models` map then holds Azure **deployment names**, not model identifiers. Suggested deployments, one per workload lane:

| Deployment name | Model | Used for |
|---|---|---|
| `azf-chat-fast` | gpt-4o-mini | Coach conversation |
| `azf-plan-structured` | gpt-4o | Meal and training plan generation |
| `azf-safety-cheap` | gpt-4o-mini | Safety classification (P-09) |
| `azf-vision-primary` | gpt-4o | Meal photo analysis |
| `azf-insight-batch` | gpt-4o-mini | Progress insights, memory extraction |

Keep the offline mock provider exactly as it is. It is deterministic, it is the terminal fallback, and the eval runner already scrubs provider keys, add `AZURE_OPENAI_API_KEY` to that scrub list. But fix the silent-fallback defect first (§3.3): today a provider failure produces mock output presented to the user as a genuine answer.

## 6. Step-by-step build

Follow in order. Nothing here assumes prior Azure experience.

### Step 1: Install the tooling

Azure CLI is **not installed** on this machine; this was verified during the review. Install it first.

```powershell
winget install --exact --id Microsoft.AzureCLI
winget install --exact --id Microsoft.Azd
```

Close and reopen the terminal, then confirm:

```powershell
az version
azd version
```

### Step 2: Sign in and choose the subscription

```powershell
az login
az account list --output table
```

If the only subscription listed is **Azure for Students**, stop and read §0. You can build everything except Azure OpenAI on it. For the AI features, create a Pay-As-You-Go subscription:

1. Go to portal.azure.com → **Subscriptions** → **Add**.
2. Choose **Pay-As-You-Go**. A payment method is required; you are billed only for what you use, and the services below have generous free grants.
3. Keep the student subscription for experiments and the Pay-As-You-Go one for anything real.

Set the active subscription:

```powershell
az account set --subscription "<SUBSCRIPTION-ID>"
```

### Step 3: Choose a region and naming convention

Pick **one** region and keep everything in it. For an Australian user base, `australiaeast`. For EU data-residency obligations, an EU region. Note that Azure OpenAI is not available in every region, check availability for your chosen region before committing.

Naming convention used throughout: `azf-<component>-<env>`, for example `azf-api-prod`.

### Step 4: Create the resource group

```powershell
az group create --name rg-aquazerofit-prod --location australiaeast
```

Everything else goes inside this. Deleting this group later removes every resource in one action, the cleanest possible teardown.

### Step 5: Key Vault, with purge protection

```powershell
az keyvault create `
  --name azf-kv-prod `
  --resource-group rg-aquazerofit-prod `
  --location australiaeast `
  --enable-purge-protection true `
  --enable-rbac-authorization true
```

Purge protection must not be disabled. It prevents an attacker, or an accident, from permanently destroying secrets.

Generate and store the JWT signing secret. Note that the secret value is generated locally and piped in; it is never typed into a portal field.

```powershell
$jwt = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
az keyvault secret set --vault-name azf-kv-prod --name JWT-ACCESS-SECRET --value $jwt
az keyvault secret set --vault-name azf-kv-prod --name TELEGRAM-BOT-TOKEN --value "<token from BotFather>"
```

### Step 6: Cosmos DB

Decide first, per §0: **free tier or serverless, not both.**

- **Learning and low traffic:** provisioned throughput with free tier, the first 1000 RU/s and 25 GB are free for the account's lifetime, one such account per subscription.
- **Spiky or unpredictable traffic:** serverless, billed per request unit, no free allowance.

Free-tier route:

```powershell
az cosmosdb create `
  --name azf-cosmos-prod `
  --resource-group rg-aquazerofit-prod `
  --locations regionName=australiaeast `
  --enable-free-tier true `
  --default-consistency-level Session
```

Create the database and the containers with the partition keys from §5.2:

```powershell
az cosmosdb sql database create `
  --account-name azf-cosmos-prod --resource-group rg-aquazerofit-prod `
  --name aquazerofit --throughput 1000

$containers = @(
  @{n='users';    p='/userId'}
  @{n='profiles'; p='/userId'}
  @{n='logs';     p='/userId'}
  @{n='plans';    p='/userId'}
  @{n='content';  p='/type'}
  @{n='foodsOff'; p='/barcode'}
  @{n='foodsFdc'; p='/fdcId'}
  @{n='ai';       p='/userId'}
  @{n='ledger';   p='/userId'}
  @{n='audit';    p='/pk'}
)
foreach ($c in $containers) {
  az cosmosdb sql container create `
    --account-name azf-cosmos-prod --resource-group rg-aquazerofit-prod `
    --database-name aquazerofit --name $c.n --partition-key-path $c.p
}
```

Then **disable key-based access** so the only way in is Managed Identity plus RBAC. Do this after the application is confirmed working with its identity, not before.

### Step 7: Blob Storage for meal photos

```powershell
az storage account create `
  --name azfstorageprod --resource-group rg-aquazerofit-prod `
  --location australiaeast --sku Standard_LRS `
  --min-tls-version TLS1_2 --allow-blob-public-access false

az storage container create --name meal-photos --account-name azfstorageprod
```

`--allow-blob-public-access false` is not optional. These are health-adjacent photographs.

### Step 8: Container Registry

```powershell
az acr create `
  --name azfacrprod --resource-group rg-aquazerofit-prod `
  --sku Basic --admin-enabled false
```

Admin access stays disabled; Container Apps pulls using its Managed Identity.

Build and push the image, note this builds from the repository root, because the Dockerfile depends on the workspace linkage to `packages/shared`:

```powershell
az acr build --registry azfacrprod --image aquazerofit-api:v1 --file apps/api/Dockerfile .
```

### Step 9: Container Apps environment and the API

```powershell
az containerapp env create `
  --name azf-env-prod --resource-group rg-aquazerofit-prod `
  --location australiaeast

az containerapp create `
  --name azf-api-prod --resource-group rg-aquazerofit-prod `
  --environment azf-env-prod `
  --image azfacrprod.azurecr.io/aquazerofit-api:v1 `
  --target-port 4000 --ingress external `
  --min-replicas 1 --max-replicas 3 `
  --system-assigned `
  --env-vars NODE_ENV=production TRUST_PROXY=1 `
             CORS_ORIGINS=https://app.aquazero.fit
```

The target port must match the port the application listens on, 4000 here, which is what `config.port` defaults to.

**`min-replicas 1` and `max-replicas 3` are only safe once Cosmos replaces the JSON store.** Until then both must be 1, or instances will silently destroy each other's writes (§3.3).

Now grant the app's identity access to the vault and the database:

```powershell
$principalId = az containerapp show --name azf-api-prod `
  --resource-group rg-aquazerofit-prod --query identity.principalId -o tsv

az role assignment create --assignee $principalId `
  --role "Key Vault Secrets User" `
  --scope $(az keyvault show --name azf-kv-prod --query id -o tsv)
```

This is the payoff: the application can now read its secrets with no password stored anywhere.

### Step 10: Application Insights

```powershell
az monitor app-insights component create `
  --app azf-insights-prod --resource-group rg-aquazerofit-prod `
  --location australiaeast --application-type web
```

Wire the connection string into the container app and add the OpenTelemetry exporter to the API. Today `platform/telemetry.ts` logs to stdout with no correlation id, which means requests cannot be traced across a distributed system. Add a per-request id at the same time.

### Step 11: Azure OpenAI

Requires the Pay-As-You-Go subscription from Step 2.

```powershell
az cognitiveservices account create `
  --name azf-openai-prod --resource-group rg-aquazerofit-prod `
  --location australiaeast --kind OpenAI --sku S0

az cognitiveservices account deployment create `
  --name azf-openai-prod --resource-group rg-aquazerofit-prod `
  --deployment-name azf-chat-fast `
  --model-name gpt-4o-mini --model-version "2024-07-18" `
  --model-format OpenAI --sku-capacity 10 --sku-name Standard
```

Repeat for each deployment in §5.3. Then set `AZURE_OPENAI_ENDPOINT` and the deployment names in the container app configuration. These entries are already present in `.env.example`.

### Step 12: Deploy the web app

```powershell
az staticwebapp create `
  --name azf-web-prod --resource-group rg-aquazerofit-prod `
  --location eastasia
```

Build with the API origin baked in, Vite inlines these at build time, so they must be set before building:

```powershell
$env:VITE_API_BASE_URL = "https://api.aquazero.fit"
$env:VITE_MEDIA_BASE_URL = "https://api.aquazero.fit"
npm run build --workspace apps/web
```

`apps/web/staticwebapp.config.json` is already in the repository and handles SPA fallback, cache headers and the Telegram-compatible CSP. **Edit its `connect-src` directive to your real API origin** before deploying.

### Step 13: Infrastructure as code

Everything above is portal- and CLI-driven, which is the right way to *learn*. It is the wrong way to *operate*: it is not reproducible and not reviewable.

Once the architecture is confirmed working, capture it as Bicep in an `infra/` folder and deploy with `azd up`. Microsoft's own deployment guidance is explicit on this: prefer infrastructure-as-code over CLI scripts, always validate with `azd provision --preview` or `az deployment group what-if` before applying, and never disable Key Vault purge protection or enable anonymous registry pull.

## 7. CI/CD

There is no CI in the repository, no `.github/` directory at all. This is a real gap: the evals genuinely exit non-zero on a safety regression, but nothing ever runs them.

A minimal pipeline that would have caught most of what this review found:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`, 327 tests
4. `npm run eval`, add this script; it does not exist yet
5. `az acr build` on success
6. Deploy to a staging container app revision
7. Smoke test `/health` and `/ready`, asserting the returned version matches the commit
8. Promote to production

Authenticate the pipeline with a federated credential (OpenID Connect), not a stored service-principal secret.

## 8. The domain question: Hostinger or Azure

The distinction that resolves this: **a registrar is not a DNS host.** Hostinger is currently both. Azure DNS is only the second, Azure does not sell domain names through Azure DNS at all.

Three options:

**Option A, Keep everything at Hostinger.** Add a CNAME and a TXT validation record pointing at the Static Web App. Free, simple, works today.

*Limitation:* apex domains (`aquazero.fit` with no `www`) need ALIAS/ANAME records or CNAME flattening. Not every registrar supports this. Verify Hostinger does before committing to an apex domain.

**Option B, Keep registration at Hostinger, delegate DNS to Azure DNS. Recommended.** Create a DNS zone in Azure, then update the nameservers at Hostinger to point at Azure's. Azure then handles apex records natively, and when you add a custom domain to Static Web Apps, Azure creates the validation and ALIAS records for you automatically.

This is what enterprises actually do, registration and DNS hosting are separate concerns, deliberately. It gives you Azure-native DNS management, works cleanly with Front Door later, and costs roughly $0.50 per zone per month plus negligible query charges. It is also the better answer for your internship: it demonstrates you understand the distinction.

**Option C, Transfer registration to Azure App Service Domains.** Not recommended. It is a GoDaddy-backed reseller arrangement, requires a Pay-As-You-Go subscription, supports a limited set of top-level domains, and imposes restrictions on nameserver delegation that an external registrar does not. You would be giving up flexibility for no real gain.

**Recommendation: Option B.** Keep the money you have already spent at Hostinger, delegate DNS to Azure, and get the Azure-native experience you want without a risky registrar transfer.

Steps for Option B:

```powershell
az network dns zone create `
  --resource-group rg-aquazerofit-prod --name aquazero.fit

az network dns zone show `
  --resource-group rg-aquazerofit-prod --name aquazero.fit `
  --query nameServers -o tsv
```

Take those four nameservers, log into Hostinger, and replace the existing nameservers with them. Propagation can take up to 72 hours for apex changes; plan the cutover accordingly and do not do it the night before a demonstration.

Suggested records:

| Name | Type | Points to |
|---|---|---|
| `aquazero.fit` | ALIAS | Static Web App |
| `www` | CNAME | Static Web App |
| `api` | CNAME | Container App ingress |

## 9. Cost

Approximate monthly figures for a low-traffic deployment. **Verify against the Azure pricing calculator before committing**, prices change and vary by region.

| Service | Configuration | Approx. monthly |
|---|---|---|
| Container Apps | 1 to 3 replicas, small | $0 to 30 (generous free grant) |
| Static Web Apps | Free tier | $0 |
| Cosmos DB | Free tier, 1000 RU/s | $0 within the allowance |
| Blob Storage | A few GB | $1 to 3 |
| Key Vault | Standard, low operation count | ~$1 |
| Container Registry | Basic | ~$5 |
| Application Insights | Low volume | $0 to 5 (free data grant) |
| Azure DNS | 1 zone | ~$0.50 |
| Azure OpenAI | Pay per token | **Highly variable, see below** |
| **Subtotal, excluding AI** | | **roughly $10 to 45** |

Azure OpenAI is the variable that matters, and the current code has no meaningful spend control. Before enabling a real provider, address these:

- The credit ledger has a time-of-check/time-of-use race: reserve, balance read and append each yield the event loop, so concurrent turns can all reserve against the same balance. The daily grant can double-apply.
- Memory extraction calls the model with **no credit reservation and no rate limit**, one chat turn (1 credit) can buy up to three provider calls.
- `maxTokens` is caller-overridable with no ceiling.
- Cost is never recorded, only token counts, and only to stdout.

Set an **Azure budget alert** on the resource group on day one, before any traffic. This is the cheapest insurance available.

## 10. Recommended sequence

**Phase 1, Make it deployable (1 to 2 weeks).** Cosmos migration per §3.3. Blob Storage for meal photos. Redis for rate limits. Upgrade multer. Add CI with the eval gate. Deploy to a staging environment and keep it at one replica until Cosmos lands.

**Phase 2, Make it safe to show real users (1 week).** Wire a transactional email provider, which unblocks both password reset and email verification. Publish a privacy policy, terms and support channel. Add the in-app attribution page. Surface `WELLNESS_DISCLAIMER` on the onboarding targets screen and the training screens, and fix its contrast in Settings. Either implement notification delivery or remove the toggles.

**Phase 3, Make it enterprise-grade (1 to 2 weeks).** Front Door with the OWASP WAF ruleset and edge rate limiting. Private Endpoints for Cosmos, Key Vault, Storage and Redis, with public network access disabled. Customer-managed keys on the photo container. Defender for Cloud. Bicep in `infra/` and `azd up`. Move refresh tokens to HttpOnly cookies. Add AI resilience, retries, backoff, circuit breaking, an overall deadline, and surfacing degraded responses instead of passing mock output off as real.

**Phase 4, Scale and polish.** Extend the safety guardrail to every AI lane. Send actual images to the vision model. Complete the Telegram Mini App SDK integration (BackButton, viewport handling, closing confirmation, swipe control). Replace the 68% placeholder exercise art.

## 11. Compliance summary

The data set, weight, body measurements, meal logs, allergens, free-text chat about diet and symptoms, is **GDPR Article 9 special-category data** and **sensitive information under the Australian Privacy Act 1988**. Meal photos with intact EXIF add precise geolocation on top.

Key obligations:

- **Explicit consent** (Art. 9(2)(a)). The opt-in-by-default consent model already implemented is the right shape; record purpose and version, not just a boolean.
- **A DPIA is mandatory**, AI-generated nutrition targets computed over special-category data at scale.
- **Processor agreements** (Art. 28) with every AI provider. Note that the current fallback chain means *which* provider sees user data depends on which keys happen to be set at runtime. Pin one provider per environment.
- **Cross-border disclosure** (APP 8). Chat context is currently sent to US inference endpoints. Even with EU- or AU-resident storage, that egress is the leak that data-residency settings cannot fix. Routing AI through Azure OpenAI in-region is the clean answer.
- **Retention.** Meal photos are swept at 24 hours, which is good minimisation. Chat transcripts and memory facts have no retention limit, define one.
- Treat any existing logs as containing live credentials, given the reset-token defect in §3.1, and purge them before go-live.

## Appendix A: Environment variables for production

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | **Yes** | Must be exactly `production`. Everything in §3.1 depends on it. |
| `JWT_ACCESS_SECRET` | **Yes** | Key Vault reference. Boot fails without it. |
| `TELEGRAM_BOT_TOKEN` | **Yes** | Key Vault reference. Boot fails without it. |
| `CORS_ORIGINS` | **Yes** | Boot now fails if absent, wildcarded, or plaintext http. |
| `TRUST_PROXY` | Recommended | 1 behind Container Apps ingress; 2 if Front Door is also in front. |
| `APP_VERSION` | Recommended | Commit SHA; returned by `/health` and `/ready`. |
| `AZF_DATA_DIR` | Interim | Only while the JSON store remains. Must be a mounted volume. |
| `AZURE_OPENAI_ENDPOINT` | For AI | Resource root, no trailing slash. |
| `AZURE_OPENAI_API_KEY` | For AI | Prefer Managed Identity in production. |
| `VITE_API_BASE_URL` | Web build | Baked in at build time, not runtime. |

## Appendix B: Verification commands

```powershell
npm run typecheck          # all three workspaces
npm test                   # 327 tests
npm run api                # API on :4000
npm run dev                # web on :5173

curl http://localhost:4000/health
curl http://localhost:4000/ready
```

## Appendix C: Files changed in this review

```
apps/api/src/app.ts                              helmet, trust proxy, /health + /ready
apps/api/src/index.ts                            graceful shutdown, process handlers
apps/api/src/platform/config.ts                  trustProxy, version, CORS production guard
apps/api/src/platform/auth.ts                    JWT algorithm pinning
apps/api/src/modules/auth/service.ts             reset-token logging, emailVerified
apps/api/src/__tests__/productionGuards.test.ts  new, 11 regression tests
apps/api/Dockerfile                              new, production image
apps/api/package.json                            tsx to dependencies, helmet, verify script
apps/web/src/lib/api.ts                          configurable origins, Bearer null fix
apps/web/src/vite-env.d.ts                       new, typed build configuration
apps/web/src/pages/training/WorkoutLibrary.tsx   media URL resolution
apps/web/staticwebapp.config.json                new, SPA fallback, headers, Telegram CSP
scripts/md-to-docx.js                            new, generic report renderer
.env.example                                     Azure OpenAI, TRUST_PROXY, APP_VERSION
```

## Appendix D: Sources

- Azure for Students and Azure OpenAI eligibility: https://learn.microsoft.com/en-us/answers/questions/2183197/azure-openai-with-azure-for-students
- Student subscription region policy conflict: https://learn.microsoft.com/en-us/answers/questions/5537167/unable-to-create-azure-openai-resource-due-to-regi
- Cosmos DB lifetime free tier, and its unavailability for serverless: https://learn.microsoft.com/en-us/azure/cosmos-db/free-tier
- Cosmos DB serverless pricing: https://azure.microsoft.com/en-us/pricing/details/cosmos-db/serverless/
- Static Web Apps custom domains with external providers: https://learn.microsoft.com/en-us/azure/static-web-apps/custom-domain-external
- Static Web Apps apex domains: https://learn.microsoft.com/en-us/azure/static-web-apps/apex-domain-external
- Azure DNS delegation from an external registrar: https://learn.microsoft.com/en-us/azure/dns/dns-delegate-domain-azure-dns
- Azure DNS does not sell domains: https://learn.microsoft.com/en-us/azure/dns/dns-zones-records
- Azure deployment best practices (Bicep in `infra/`, Managed Identity, Key Vault purge protection, `what-if` validation), retrieved from the Azure MCP best-practices tool, 31 July 2026
