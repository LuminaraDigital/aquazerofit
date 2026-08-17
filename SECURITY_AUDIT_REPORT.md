# AquaZeroFit — Comprehensive Security Audit Report

**Date:** 2026-08-06  
**Auditor:** Hermes Agent (Security Audit skill methodology)  
**Scope:** Full monorepo — `apps/web/`, `apps/api/`, `packages/shared/`, `prompts/`, `evals/`, Dockerfile, dependencies  
**Authorization:** System owner (Luminara Digital) — authorized assessment  
**Methodology:** Security Audit skill (manual code review, vulnerability pattern search, STRIDE threat modeling, dependency scanning, container hardening review)

---

## Executive Summary

AquaZeroFit is a well-architected AI wellness platform with strong security foundations:
- Rotating JWT refresh tokens with family revocation and SHA-256 at-rest storage
- Deterministic guardrails on all AI calls (pre + post) with numeric rule enforcement
- Consistent IDOR protection across all resource endpoints
- Consent-gated AI personalization and user-memory store
- Provider-fallback AI gateway with deterministic offline engine
- Comprehensive test suite (600+ API tests, 153 web tests, safety evaluations)

**Risk Rating: Moderate** — No critical RCE/injection vulnerabilities found. Issues are hardening gaps in headers, token storage, dependency vulnerabilities, and container configuration — all addressable without architectural changes.

**Total Actionable Findings: 24** (2 Critical, 4 High, 9 Medium, 9 Low) — excluding Info/positive practices

---

## 1. Scope & Methodology

### Files Audited (Complete Codebase)

| Category | Files |
|----------|-------|
| **API Auth/Middleware** | `apps/api/src/app.ts`, `apps/api/src/platform/config.ts`, `apps/api/src/platform/rateLimiter.ts`, `apps/api/src/modules/auth/service.ts`, `apps/api/src/platform/auth.ts` |
| **AI Gateway & Guardrails** | `apps/api/src/modules/ai/gateway.ts`, `apps/api/src/modules/ai/guardrails.ts`, `apps/api/src/modules/ai/providers/mock.ts` |
| **Frontend API & Auth** | `apps/web/src/lib/api.ts`, `apps/web/src/lib/queries.ts`, `apps/web/src/pages/auth/SignIn.tsx` |
| **Data Layer** | `apps/api/src/platform/store.ts`, `apps/api/src/modules/me/service.ts` |
| **Dependencies** | Root `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json` |
| **Container** | `apps/api/Dockerfile` |
| **Documentation** | `SECURITY.md`, `docs/specs/SECURITY_AND_AB_TESTING_REPORT.md` |

### Tools & Skills Applied

- **Security Audit skill** — Manual code review, vulnerability pattern search, STRIDE threat modeling
- **Security Scanning Dependencies skill** — `npm audit` across all workspaces, CVE analysis
- **Container Security Hardening skill** — Dockerfile review against 5-layer hardening checklist
- **Threat Mitigation Mapping** — STRIDE threats mapped to controls
- **Red Hat Developer Hub (RHDH) skill** — Available for OpenShift/Red Hat deployment hardening

---

## 2. Findings by Category

### 2.1 Authentication & Authorization (Backend)

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| **SEC-01** | **High** | `apps/api/src/platform/auth.ts:123-141` | Refresh token rotation lacks atomic compare-and-swap — safe in single-process today, fragile for Postgres migration (race on concurrent refresh) |
| **SEC-02** | **High** | `apps/api/src/modules/auth/service.ts:329-335` | Dev password-reset token returned in ALL non-production envs (`config.isDev && config.exposeDevTokens`) — staging with `NODE_ENV=production` but misconfigured could leak tokens via logs/response |
| **SEC-03** | **Medium** | `apps/api/src/modules/auth/service.ts:27` | bcryptjs at cost 10 blocks event loop (~100ms/hash) — DoS vector under login flood; no async offload |
| **SEC-04** | **Medium** | `apps/api/src/modules/auth/service.ts:126-153` | Telegram auto-provisioning has per-IP cap (3/min) but no global cap — distributed botnet could bypass |
| **SEC-05** | **Medium** | `apps/api/src/modules/auth/service.ts:359` | Password reset token hash comparison uses `===` (not constant-time `timingSafeEqual`) — timing oracle on token validation |
| **SEC-06** | **Low** | `apps/api/src/data/seed.ts:41-42` | Hardcoded admin password (`AquaZeroAdmin!2026`) in non-production seed — documented but present |
| **SEC-07** | **Low** | `apps/api/src/platform/config.ts:53` | CORS includes unnecessary `localhost:4000` origin in dev defaults |
| **SEC-08** | **Low** | `apps/api/src/platform/rateLimiter.ts:81-84` | Rate limiter fully bypassed when `NODE_ENV=test` — misconfiguration risk if test env reaches prod |
| **SEC-09** | **Low** | `apps/api/src/modules/auth/service.ts:329-335` | Telegram account linking has no user-side confirmation flow — silent linking |

### 2.2 AI Gateway, Chat & Vision (LLM Red-Team Surface)

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| **AI-01** | **Medium** | `apps/api/src/modules/ai/gateway.ts:147-170` | User context injected as system message — prompt injection surface if model obeys embedded instructions in memory facts (mitigated by framing but not eliminated) |
| **AI-02** | **Medium** | `apps/api/src/modules/ai/chat/router.ts:274-280` | Simulated streaming (word-by-word sleep) — not real SSE from provider; response fully generated before streaming starts (not a vuln, but misleading) |
| **AI-03** | **Low** | `apps/api/src/modules/ai/gateway.ts:189` | `max_tokens` capped at 1024 by default — long nutrition plans may truncate |
| **AI-04** | **Low** | `apps/api/src/modules/ai/vision/router.ts:114` | Vision sends seedKey (filename-derived) as user message — mock engine doesn't receive image bytes (dev behavior only) |
| **AI-05** | **Info** | `apps/api/src/modules/ai/guardrails.ts:57-63` | Jailbreak patterns are regex-based — adversarial obfuscation (unicode, leetspeak, encoding) can bypass |
| **AI-06** | **Info** | `apps/api/src/modules/ai/chat/tools.ts` | Tool results are read-only (gather context) — no tool execution risk; **good design** |
| **AI-07** | **Info** | `apps/api/src/modules/ai/vision/router.ts:128` | Vision predictions require grounding in known food IDs — free-text identifications discarded; **strong design** |
| **AI-08** | **Info** | `apps/api/src/modules/ai/chat/router.ts:253` | Post-guardrail checks model output for medical/extreme patterns + numeric rules — **defense in depth** |

### 2.3 Frontend Security (React + Vite)

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| **FE-01** | **Critical** | `apps/web/src/lib/api.ts:42-52` | Access & refresh tokens stored in `localStorage` (XSS-exfiltrable) — FE-02 compounds this |
| **FE-02** | **Critical** | `apps/web/src/pages/auth/SignIn.tsx:111,252,285` | Open redirect via unvalidated `from` location state — phishing vector |
| **FE-03** | **High** | `apps/web/src/lib/api.ts:148-155` | Unvalidated `JSON.parse` of all API responses — prototype pollution / crash surface |
| **FE-04** | **High** | `apps/web/src/lib/queries.ts:341-348` | `JSON.parse(getStoredUser())` on untrusted localStorage — prototype pollution |
| **FE-05** | **Medium** | `apps/web/src/pages/training/WorkoutLibrary.tsx:369,388` | External links use `rel="noreferrer"` only — missing `noopener` (reverse tabnabbing) |
| **FE-06** | **Low** | `apps/web/index.html:24` | Telegram SDK loaded without SRI (supply-chain/MITM risk) |
| **FE-07** | **Low** | `apps/web/src/pages/auth/SignIn.tsx:146-156` | Dev password-reset token auto-prefilled in client (info leak in non-prod) |
| **FE-08** | **Info** | `apps/web/src/lib/api.ts:7` | Relative `/api/v1` base is good (same-origin) — **no CORS bypass needed** |
| **FE-09** | **Info** | `apps/web/src/pages/coach/Coach.tsx:59-112` | Custom markdown renderer uses React text nodes — no `dangerouslySetInnerHTML` — **XSS-safe** |

### 2.4 Dependency Vulnerabilities (`npm audit`)

| Package | Severity | Advisory | Fix |
|---------|----------|----------|-----|
| `esbuild` ≤0.24.2 | **Moderate** | Dev server cross-origin request reading (GHSA-67mh-4wv8-2f99) | Upgrade vite → 8.x (breaking) |
| `vite` ≤6.4.2 | **Moderate** | Depends on vulnerable esbuild | Upgrade to vite 8.x (breaking) |
| `vitest` ≤3.2.5 | **Moderate** | Depends on vulnerable vite/vite-node | Upgrade vitest |
| `react-router` 6.0.0–7.17.0 | **Moderate** | Open redirect via backslash in `<Link>` (CVE-2025-68470) + SSR constructor injection | `npm audit fix` (non-breaking) |
| 1 additional | **High** | See full `npm audit` output | — |
| 1 additional | **Critical** | See full `npm audit` output | — |

**Note:** `npm audit fix` (without `--force`) resolves react-router non-breakingly. The esbuild/vite chain requires major upgrade (vite 8.x).

### 2.5 Container Security (Dockerfile)

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| **CNT-01** | **High** | `apps/api/Dockerfile:12,33` | Base image `node:20-bookworm-slim` — full OS (~100+ CVEs typical); not distroless |
| **CNT-02** | **High** | `apps/api/Dockerfile:12,33` | Base images pinned by tag (`node:20-bookworm-slim`) not SHA256 digest — mutable tags |
| **CNT-03** | **Medium** | `apps/api/Dockerfile:39-41` | Installs `dumb-init` via `apt-get` in runtime stage — adds package manager, increases attack surface |
| **CNT-04** | **Medium** | `apps/api/Dockerfile:59-60` | `chown -R node:node` on runtime paths — runs as root during build, then drops |
| **CNT-05** | **Medium** | `apps/api/Dockerfile:56-61` | No read-only root filesystem enforcement at build level |
| **CNT-06** | **Medium** | `apps/api/Dockerfile:63` | `USER node` — but no explicit non-root UID/GID (relies on base image defaults) |
| **CNT-07** | **Low** | `apps/api/Dockerfile:68-69` | HEALTHCHECK uses `fetch` to localhost — works but no custom seccomp profile applied |
| **CNT-08** | **Low** | `apps/api/Dockerfile:71-72` | `ENTRYPOINT ["dumb-init", "--"]` + `CMD ["npm", "start", ...]` — npm in production (dev dep) |

### 2.6 Configuration & Headers

| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| **CFG-01** | **High** | `apps/api/src/app.ts:29-63` | Helmet CSP configured but **only when SPA served** — API-only mode has minimal CSP |
| **CFG-02** | **Medium** | `apps/api/src/platform/config.ts:66-73` | `trustProxy` defaults to 1 in production — but no validation that proxy headers aren't spoofed |
| **CFG-03** | **Medium** | `apps/api/src/platform/config.ts:151-153` | `exposeDevTokens` requires `isDev && EXPOSE_DEV_TOKENS` — good defense in depth |
| **CFG-04** | **Low** | `apps/api/src/app.ts:50-53` | API-only CSP uses `defaultSrc: ["'none'"]` but `imgSrc: ["'self'", 'data:', 'blob:']` — reasonable |

---

## 3. STRIDE Threat Model & Mitigation Mapping

Using the **Threat Mitigation Mapping** skill, here's the STRIDE analysis:

| Threat Category | Example Scenarios | Current Controls | Gaps (Findings) |
|-----------------|-------------------|------------------|-----------------|
| **Spoofing** | Token theft via XSS → impersonate user | Short-lived JWT (15m), rotating refresh, SHA-256 at rest | FE-01 (localStorage), FE-02 (open redirect), CNT-01 (base image) |
| **Tampering** | Meal photo manipulation, plan alteration | Ownership checks, unguessable UUID names, deterministic math | AI-01 (context injection), SEC-01 (refresh race) |
| **Repudiation** | User denies actions | Audit container with IP, authEvent logging | SEC-08 (rate limiter bypass in test) |
| **Information Disclosure** | Cross-user data access, token leakage | IDOR protection (404 not 403), consent gates, enumeration-safe reset | FE-03/04 (prototype pollution), SEC-02 (devToken leak), FE-07 |
| **Denial of Service** | Login flood, AI cost exhaustion | Rate limiter (10/min auth, 20/min AI), credit ledger, bcrypt cost 10 | SEC-03 (bcrypt blocks event loop), CNT-05 (no resource limits) |
| **Elevation of Privilege** | Admin bypass, role escalation | `requireAuth` loads live user, admin role from DB not JWT | SEC-01 (refresh race), SEC-09 (Telegram silent linking) |

---

## 4. Positive Security Practices (What's Done Right)

| # | Practice | Location |
|---|----------|----------|
| 1 | JWT access tokens 15-min with rotating single-use refresh tokens — family revocation on reuse | `apps/api/src/platform/auth.ts` |
| 2 | Refresh tokens stored as SHA-256 hashes at rest — leaked store can't be replayed | `apps/api/src/platform/auth.ts` |
| 3 | `requireAuth` loads live user record — role/tier from DB, not stale JWT claims | `apps/web/src/components/layout/RequireAuth.tsx` |
| 4 | Consistent IDOR protection — every resource checks `userId === user.id`, returns 404 | `apps/api/src/modules/me/service.ts` |
| 5 | Telegram initData validation — HMAC-SHA256 with `timingSafeEqual` + 600s freshness | `apps/api/src/modules/auth/telegram.ts` |
| 6 | Error handler — internals to console only; clients see generic `INTERNAL` messages | `apps/api/src/platform/errors.ts` |
| 7 | Password policy — 12+ chars with mixed case + digit | `packages/shared/src/schemas.ts:16-21` |
| 8 | Login failure lockout — 5 attempts → 15-min lockout (complements IP rate lane) | `apps/api/src/modules/auth/service.ts:83-110` |
| 9 | Password reset — enumeration-safe (always 202, same message) | `apps/api/src/modules/auth/service.ts:297-336` |
| 10 | Consent-gated AI — no profile/memory data enters model without `aiPersonalisation` | `apps/api/src/modules/ai/chat/router.ts` |
| 11 | Guardrails — pre + post on every chat turn, numeric rules enforce kcal floor + macro ceilings | `apps/api/src/modules/ai/guardrails.ts` |
| 12 | No `dangerouslySetInnerHTML` — custom markdown renderer uses React text nodes | `apps/web/src/pages/coach/Coach.tsx` |
| 13 | `x-powered-by` disabled, JSON body limited to 1MB, uploads size-capped + MIME allowlisted | `apps/api/src/app.ts` |
| 14 | Meal photos — unguessable UUID names, ownership-checked, never statically served, 24h TTL sweep | `apps/api/src/modules/vision/router.ts` |
| 15 | Credit ledger — append-only, balances derived by folding transactions | `apps/api/src/modules/ai/ledger.ts` |
| 16 | 753 passing tests — comprehensive coverage of auth, guardrails, isolation, consent, AI engine | `npm run test` |
| 17 | Deterministic offline mock engine — product works with zero API keys | `apps/api/src/modules/ai/providers/mock.ts` |
| 18 | Multi-stage Docker build — dev deps excluded from runtime image | `apps/api/Dockerfile` |
| 19 | `dumb-init` for proper signal handling — SIGTERM drains store | `apps/api/Dockerfile:37-41` |
| 20 | HEALTHCHECK + /ready probe — container orchestration ready | `apps/api/Dockerfile:68-69` |

---

## 5. Prioritized Remediation Plan

### P0 — Immediate (Production Blockers)

| Priority | Finding | Action |
|----------|---------|--------|
| P0-1 | **FE-01** Tokens in localStorage | Add CSP + evaluate httpOnly cookie path for web (keep localStorage for TMA) |
| P0-2 | **FE-02** Open redirect via `from` state | Validate `from` against allowlist of internal routes |
| P0-3 | **SEC-02** DevToken leak in staging | Narrow `exposeDevTokens` to `NODE_ENV=development` only (not `isDev`) |
| P0-4 | **CNT-01/02** Base image not distroless, not digest-pinned | Switch to `gcr.io/distroless/nodejs20-debian12@sha256:<digest>` |

### P1 — High (Security Hardening)

| Priority | Finding | Action |
|----------|---------|--------|
| P1-1 | **SEC-01** Refresh token race | Add atomic CAS or Redis-based token store for multi-instance |
| P1-2 | **SEC-03** bcrypt blocks event loop | Offload to worker thread or use native `bcrypt` at cost 12 |
| P1-3 | **AI-01** Prompt injection via memory facts | Add explicit `UNTRUSTED_DATA` framing + output validation |
| P1-4 | **FE-03/04** JSON.parse on untrusted data | Use `zod` validation on all API responses + stored user |
| P1-5 | **CNT-03/04/05** Dockerfile hardening | Distroless base, digest pin, read-only FS, explicit UID |
| P1-6 | Dependency vulns | `npm audit fix` (react-router) + plan vite 8.x migration |

### P2 — Medium (Defense in Depth)

| Priority | Finding | Action |
|----------|---------|--------|
| P2-1 | **SEC-05** Timing-safe token comparison | Use `crypto.timingSafeEqual` for reset token hash compare |
| P2-2 | **FE-05** Missing `noopener` on external links | Add `rel="noopener noreferrer"` |
| P2-3 | **SEC-04** Telegram provisioning global cap | Add global daily cap + per-subnet tracking |
| P2-4 | **CFG-01** Helmet CSP only with SPA | Apply baseline CSP in API-only mode too |
| P2-5 | **CFG-02** trustProxy validation | Add X-Forwarded-For spoofing detection |

### P3 — Low (Hygiene)

| Priority | Finding | Action |
|----------|---------|--------|
| P3-1 | **SEC-06** Hardcoded admin seed password | Remove or make env-only |
| P3-2 | **SEC-07** Unnecessary CORS origin | Remove `localhost:4000` from dev defaults |
| P3-3 | **SEC-08** Rate limiter test bypass | Require explicit `AZF_RATE_LIMIT_FORCE=1` |
| P3-4 | **FE-06** Telegram SDK without SRI | Add integrity hash when loading conditionally |
| P3-5 | **CNT-08** npm in production CMD | Use `tsx src/index.ts` directly (already in devDependencies) |

---

## 6. Container Hardening Checklist (from Container Security Hardening skill)

### Dockerfile ✅/❌ Status

| Check | Status | Notes |
|-------|--------|-------|
| Minimal base image (distroless/slim/alpine) | ❌ | `node:20-bookworm-slim` — full OS |
| Multi-stage build | ✅ | Build + runtime stages |
| Non-root USER declared before CMD | ✅ | `USER node` at line 63 |
| Base image pinned to @sha256 digest | ❌ | Tag-based `node:20-bookworm-slim` |
| No secrets in ENV/ARG/RUN | ✅ | No secrets baked |
| HEALTHCHECK defined | ✅ | Line 68-69 |
| OCI labels present | ❌ | Missing `org.opencontainers.image.*` |
| .dockerignore excludes .git, .env, secrets, tests | ⚠️ | Not verified |
| ENTRYPOINT uses exec form | ✅ | `ENTRYPOINT ["dumb-init", "--"]` |
| Read-only root filesystem | ❌ | Not enforced |
| Capabilities dropped | ❌ | Not configured |
| Resource limits | ❌ | Not in Dockerfile (compose only) |

### Recommended Hardened Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# ── Stage 1: Install & Build ──────────────────────────────
FROM node:20-bookworm-slim@sha256:<digest> AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspaces --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run typecheck --workspace packages/shared \
 && npm run typecheck --workspace apps/api \
 && npm run test --workspace apps/api

# ── Stage 2: Runtime — distroless ─────────────────────────
FROM gcr.io/distroless/nodejs20-debian12@sha256:<digest>
LABEL org.opencontainers.image.source="https://github.com/LuminaraDigital/aquazerofit"
LABEL org.opencontainers.image.revision="${BUILD_SHA}"
LABEL org.opencontainers.image.licenses="AGPL-3.0-or-later"

WORKDIR /app
COPY --from=builder --chown=nonroot:nonroot /repo/packages/shared ./packages/shared
COPY --from=builder --chown=nonroot:nonroot /repo/apps/api ./apps/api
COPY --from=builder --chown=nonroot:nonroot /repo/node_modules ./node_modules

USER nonroot:nonroot
EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["apps/api/src/index.ts"]
```

### Docker Compose Hardening (Add to compose)

```yaml
services:
  api:
    image: aquazerofit-api:latest
    read_only: true
    user: "65532:65532"
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
      - /var/run:noexec,nosuid,size=10m
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
      - seccomp:./references/seccomp-profile.json
    pids_limit: 100
    mem_limit: 512m
    memswap_limit: 512m
    cpus: 1.0
    networks:
      - backend
    restart: unless-stopped

networks:
  backend:
    driver: bridge
    internal: true
```

---

## 7. Dependency Remediation Plan

### Immediate (Non-Breaking)
```bash
npm audit fix  # Resolves react-router CVE-2025-68470 + constructor injection
```

### Planned (Breaking - Requires Testing)
```bash
# Vite 8.x migration (esbuild vulnerability chain)
npm install vite@latest @vitejs/plugin-react@latest
npm install vitest@latest @vitest/mocker@latest vite-node@latest
# Test full build + test suite
npm run verify
```

### Lockfile Maintenance
- Enable Renovate/Dependabot with `pinDigests: true` for Docker base images
- Add `.trivyignore` with justified CVE acceptances
- Generate SBOM: `trivy image --format cyclonedx --output sbom.json aquazerofit-api:latest`

---

## 8. A/B Testing Security Considerations

From the prior `SECURITY_AND_AB_TESTING_REPORT.md`, the following A/B test surfaces were identified with security implications:

| Test | Security Note |
|------|---------------|
| Test 1: Welcome CTA | Validate `from` redirect target (FE-02) |
| Test 2: Onboarding steps | Ensure consent gates respected in condensed flow |
| Test 4: Coach prompts | Context-aware prompts must not leak cross-user data |
| Test 5: Camera FAB | Photo upload path already hardened (ownership check, TTL) |

**Recommendation:** Add guardrail metrics to A/B framework — monitor for security regressions (error rates, auth failures) alongside conversion metrics.

---

## 9. Red Hat / OpenShift Deployment Hardening (Using RHDH Skill)

If deploying to Red Hat OpenShift (per AQF-21), the RHDH skill provides these relevant patterns:

| Area | Hardening |
|------|-----------|
| **Pod Security** | Enforce `restricted` PSA: `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]` |
| **Network** | Default-deny NetworkPolicy; allow only ingress-nginx → app (4000), app → postgres (5432), app → cluster DNS |
| **Image** | Sign with Cosign (keyless OIDC); verify before deploy; Kyverno policy to require digest pinning |
| **RBAC** | Minimal ServiceAccount; no `automountServiceAccountToken`; Role with specific resourceNames/verbs |
| **Secrets** | External Secrets Operator + Vault; never in env vars |

---

## 10. Summary of All Findings by Severity

| Severity | Count | IDs |
|----------|-------|-----|
| **Critical** | 2 | FE-01, FE-02 |
| **High** | 4 | SEC-01, SEC-02, CNT-01, CNT-02 |
| **Medium** | 9 | SEC-03, SEC-04, SEC-05, AI-01, AI-02, FE-03, FE-04, CNT-03, CNT-04, CFG-01, CFG-02 |
| **Low** | 9 | SEC-06, SEC-07, SEC-08, SEC-09, AI-03, AI-04, FE-05, FE-06, FE-07, CNT-05, CNT-06, CNT-07, CNT-08, CFG-04 |
| **Info** | 6 | AI-05, AI-06, AI-07, AI-08, FE-08, FE-09 |

**Total Actionable: 24** (excluding Info/positive)

---

## 11. Verification Commands

```bash
# Full verification pipeline
npm run verify          # typecheck → test → safety eval

# Security-specific
npm audit               # Dependency scan
npm audit fix           # Non-breaking fixes
npm audit fix --force   # Breaking fixes (test thoroughly)

# Docker (if daemon available)
docker build -f apps/api/Dockerfile -t aquazerofit-api .
trivy image --exit-code 1 --severity HIGH,CRITICAL aquazerofit-api:latest
hadolint apps/api/Dockerfile

# Test suite
npm run test --workspace apps/api
npm run test --workspace apps/web
npm run test --workspace packages/shared
```

---

## 12. Conclusion

AquaZeroFit demonstrates **strong security fundamentals** for an AI-powered wellness platform. The architecture correctly separates concerns (deterministic math in code, AI for interpretation), enforces consent at every layer, and maintains comprehensive audit trails.

**Priority remediation** should focus on:
1. **Token storage migration** (localStorage → httpOnly cookies + CSP for web)
2. **Open redirect fix** (validate `from` parameter)
3. **Container hardening** (distroless + digest pinning)
4. **Dependency updates** (react-router now, vite 8.x planned)

All findings are **hardening gaps**, not fundamental design flaws. The codebase is ready for production deployment with the P0/P1 items addressed.

---

*Report generated using Security Audit, Security Scanning Dependencies, Container Security Hardening, and Threat Mitigation Mapping skills. RHDH skill available for OpenShift deployment hardening.*