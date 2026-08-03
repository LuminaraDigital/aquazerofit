# AquaZeroFit — Remediation & Fix Plan

**Date:** 2026-07-31  
**Based on:** `SECURITY_AND_AB_TESTING_REPORT.md`  
**Scope:** All findings from security audit, debug check, and A/B testing analysis  

---

## Fix Priority Legend

- **P0 (Immediate):** Block production deployment until fixed
- **P1 (Before Production):** Must fix before any public-facing deployment
- **P2 (Before Scale):** Harden before user growth beyond capstone demo
- **P3 (Defense in Depth):** Nice-to-have improvements

---

## P1 — Fix Before Production (5 items)

### Fix 1: Add security headers (SEC-02)
**File:** `apps/api/src/app.ts`  
**Change:** Add `helmet()` middleware after Express initialization

```typescript
// Install: npm install helmet
import helmet from 'helmet';
// In createApp():
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://telegram.org/js/telegram-web-app.js"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      frameAncestors: ["https://web.telegram.org"],
    },
  },
}));
```

**Verification:** `curl -I http://localhost:4000/health` — check for CSP, X-Frame-Options, HSTS headers.

---

### Fix 2: Configure `trust proxy` (SEC-03)
**File:** `apps/api/src/app.ts`  
**Change:** Add trust proxy setting based on environment

```typescript
// In createApp(), after app initialization:
if (config.isProduction) {
  app.set('trust proxy', 1); // Adjust to match proxy hop count
} else {
  app.set('trust proxy', 'loopback');
}
```

**Why:** Without this, `req.ip` returns the proxy IP behind any reverse proxy, breaking IP-based rate limiting entirely. All users share one rate-limit bucket.

**Verification:** Deploy behind nginx, check that different clients get different rate-limit buckets.

---

### Fix 3: Narrow `devToken` gate (SEC-04)
**File:** `apps/api/src/modules/auth/service.ts`  
**Change:** Replace `config.isDev` with explicit dev flag

```typescript
// Before:
if (config.isDev) { return { devToken: rawToken }; }

// After:
if (process.env.AZF_DEV_RESET_TOKEN === '1') { return { devToken: rawToken }; }
```

**Why:** `config.isDev` is `!isProduction()` — any staging env with `NODE_ENV=staging` or unset returns the raw reset token in the API response, enabling anyone to reset any account's password.

**Verification:** Set `NODE_ENV=staging` without `AZF_DEV_RESET_TOKEN=1` — confirm no `devToken` in response.

---

### Fix 4: Validate `from` redirect path (FE-02)
**File:** `apps/web/src/pages/auth/SignIn.tsx`  
**Change:** Validate `from` before navigating

```typescript
// Before:
const from = (location.state as { from?: string } | null)?.from;
// ...
navigate(from ?? '/', { replace: true });

// After:
function safeRedirect(from: unknown): string {
  if (typeof from !== 'string') return '/';
  // Must be a relative path, not protocol-relative or absolute URL
  if (/^(\/{2}|[a-z]+:)/i.test(from)) return '/';
  if (!from.startsWith('/')) return '/';
  return from;
}
// ...
navigate(safeRedirect(from), { replace: true });
```

**Apply at lines:** 111, 252, 285

**Verification:** Test with `{from: 'https://evil.com/'}` in router state — should redirect to `/`.

---

### Fix 5: Add `noopener` to external links (FE-05)
**Files:** `apps/web/src/pages/nutrition/BarcodeSheet.tsx:354`, `apps/web/src/pages/training/WorkoutLibrary.tsx:369,388`  
**Change:** Update `rel` attributes

```tsx
// Before:
rel="noreferrer"

// After:
rel="noopener noreferrer"
```

**Verification:** Inspect rendered HTML — confirm `rel="noopener noreferrer"` on all `target="_blank"` links.

---

## P2 — Fix Before Scale (6 items)

### Fix 6: Add CSP SRI to Telegram SDK (FE-06)
**File:** `apps/web/index.html:24`  
**Change:** Add integrity hash + crossorigin

```html
<!-- Before: -->
<script src="https://telegram.org/js/telegram-web-app.js"></script>

<!-- After: -->
<script
  src="https://telegram.org/js/telegram-web-app.js"
  integrity="sha384-<COMPUTE_HASH>"
  crossorigin="anonymous"
></script>
```

**Steps:** Download the script, compute SHA384 hash, add as `integrity` attribute. Update on each SDK version bump.

---

### Fix 7: Fix `npm audit` vulnerabilities
**Commands:**

```bash
# Non-breaking fix for react-router:
npm audit fix

# Breaking upgrade for esbuild/vite/vitest (plan carefully):
npm install vite@latest vitest@latest --save-dev
```

**Note:** The react-router open-redirect fix is non-breaking and should be applied immediately. The vite/esbuild upgrade is a breaking change — test thoroughly after.

**Verification:** `npm audit` — 0 vulnerabilities (or only dev-deps that don't affect production).

---

### Fix 8: Validate API responses with zod (FE-03, FE-04)
**File:** `apps/web/src/lib/api.ts:122`  
**Change:** Wrap `JSON.parse` in try/catch

```typescript
// Before:
const text = await res.text();
const json = text ? JSON.parse(text) : undefined;

// After:
const text = await res.text();
let json: unknown;
if (text) {
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(res.status, { code: 'INTERNAL', message: 'Invalid response from server' });
  }
}
```

**File:** `apps/web/src/lib/queries.ts:341-348`  
**Change:** Validate stored user with a schema

```typescript
// Before:
return raw ? (JSON.parse(raw) as PublicUser) : null;

// After:
import { publicUserSchema } from '@aquazerofit/shared';
// ...
const raw = localStorage.getItem(USER_KEY);
if (!raw) return null;
try {
  const parsed = JSON.parse(raw);
  const result = publicUserSchema.safeParse(parsed);
  return result.success ? result.data : null;
} catch {
  return null;
}
```

**Note:** `publicUserSchema` may need to be exported from the shared package — check if it exists.

---

### Fix 9: Document refresh rotation single-threading dependency (SEC-01)
**File:** `apps/api/src/platform/auth.ts:123-141`  
**Change:** Add code comment documenting the constraint

```typescript
/**
 * SECURITY NOTE: This rotation is safe ONLY because:
 * 1. The in-memory store mutation is synchronous (no await between check and upsert)
 * 2. Node.js is single-threaded (no concurrent access between check and write)
 *
 * When migrating to Cosmos DB or any external store, this MUST use an atomic
 * conditional update (e.g. Cosmos patch with condition c.usedAt = null, or
 * SQL UPDATE ... WHERE usedAt IS NULL with affected-row check).
 */
export function rotateRefresh(token: string): IssuedRefresh & { userId: string } {
```

**Verification:** Code review — comment present. Future DB migration must implement atomic CAS.

---

### Fix 10: Add Telegram account-creation throttle (SEC-06)
**File:** `apps/api/src/modules/auth/service.ts`  
**Change:** Add per-IP account creation limit

```typescript
// In telegramAuth, before creating a new account:
const recentTelegramAccounts = store.where<User>(
  'users',
  (d) => d.createdByIp === ip && d.type === 'user' &&
    new Date(d.createdAt).getTime() > Date.now() - 3600_000 // 1 hour
);
if (recentTelegramAccounts.length >= 3) {
  throw new AppError('RATE_LIMITED', 'Too many accounts created from this IP. Please try later.');
}
```

**Note:** Need to add `createdByIp` field to User records at creation time.

---

### Fix 11: Harden rate limiter against NODE_ENV misconfiguration (SEC-09)
**File:** `apps/api/src/platform/rateLimiter.ts:67-70`  
**Change:** Force-enable in production regardless of test flag

```typescript
// Before:
if (config.isTest && process.env.AZF_RATE_LIMIT_FORCE !== '1') {
  next();
  return;
}

// After:
if (config.isProduction) {
  // Rate limiter ALWAYS runs in production, regardless of any test flag
} else if (config.isTest && process.env.AZF_RATE_LIMIT_FORCE !== '1') {
  next();
  return;
}
```

---

## P3 — Defense in Depth (5 items)

### Fix 12: Use `timingSafeEqual` for hash comparisons (SEC-07)
**File:** `apps/api/src/platform/auth.ts:126-128` and `apps/api/src/modules/auth/service.ts:277-285`  
**Change:** Replace `===` comparison with `crypto.timingSafeEqual`

```typescript
import crypto from 'node:crypto';
// When comparing token hashes:
const a = Buffer.from(existing.tokenHash, 'hex');
const b = Buffer.from(tokenHash, 'hex');
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  throw new AppError('AUTH_INVALID', 'Token not recognised');
}
```

---

### Fix 13: Remove `localhost:4000` from CORS (SEC-08)
**File:** `apps/api/src/platform/config.ts:24`  
**Change:**

```typescript
// Before:
return ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000'];

// After:
return ['http://localhost:5173', 'http://127.0.0.1:5173'];
```

---

### Fix 14: Disable admin seeding in exposed non-prod envs (SEC-05)
**File:** `apps/api/src/data/seed.ts` or environment config  
**Change:** Document that non-production environments must not be publicly accessible. Add:

```typescript
// In seed function, before creating admin:
if (process.env.AZF_SEED_DEMO === 'false' || config.isProduction) return;
```

**Or:** Ensure staging/preview deployments set `AZF_SEED_DEMO=false`.

---

### Fix 15: Migrate bcryptjs → native bcrypt or argon2 (SEC-10)
**File:** `apps/api/src/modules/auth/service.ts:26`  
**Change:**

```bash
npm install bcrypt  # native C++ binding (releases event loop)
# or
npm install argon2   # modern alternative
```

```typescript
// Replace bcryptjs import and usage:
import bcrypt from 'bcrypt';  // native — runs off event loop
```

**Verification:** Run login test suite, measure event loop blocking with `clinic doctor`.

---

### Fix 16: Add Telegram-side confirmation for account linking (SEC-11)
**File:** `apps/api/src/modules/me/service.ts:312-327`  
**Change:** Log link events prominently, add unlink capability, consider a confirmation step:

```typescript
// After linking, create an audit event:
await store.upsert('audit', {
  id: newId('audit'),
  userId: user.id,
  type: 'telegramLinkEvent',
  action: 'linked',
  detail: { tgId: tgUser.id, ip: req.ip },
  createdAt: nowIso(),
});
```

**Consider:** Send a Telegram message to the linked account notifying them of the link.

---

## A/B Testing Implementation Plan

### Infrastructure Setup

AquaZeroFit doesn't have an A/B testing framework. The simplest approach for a Telegram Mini App:

1. **Variant assignment:** Server-side, stored on the user record (`abVariant: 'A' | 'B'`)
2. **Variant delivery:** API returns variant in `/me` response; frontend reads it
3. **Tracking:** Server logs events with variant label; dashboard queries compare

### Recommended First Test: Context-Aware Coach Prompts (Test 4)

**Why first:** Highest ICE score (8.0), easiest to implement, directly tests AI engagement.

**Implementation:**

```typescript
// Backend: chat/router.ts — in sessions endpoint response
// Replace static SUGGESTED_PROMPTS with context-aware logic
function getContextualPrompts(user: User, daily: DailyNutrition | null): string[] {
  if (!daily || daily.kcalConsumed < 100) {
    return ["You haven't logged any meals today — want suggestions?", ...];
  }
  if (daily.kcalConsumed < daily.kcalTarget * 0.5) {
    return ["You're under your calorie target — here are meal ideas", ...];
  }
  return SUGGESTED_PROMPTS; // default
}
```

```typescript
// Frontend: Coach.tsx — replace static array with API-provided prompts
const { data: sessionData } = useQuery({
  queryKey: ['chat', 'sessions'],
  queryFn: () => api<{ sessions: ChatSession[]; suggestedPrompts: string[] }>('/chat/sessions'),
});
const prompts = sessionData?.suggestedPrompts ?? SUGGESTED_PROMPTS;
```

**Metrics to track:**
- First coach message sent per session (primary)
- Coach session duration
- Return rate to coach

**Sample size:** ~2,000 users per variant at 30% baseline engagement, 20% MDE.

---

## Verification Checklist

After applying fixes, verify each:

- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run build` — succeeds
- [ ] `npm run test` — 297+ tests pass (new tests for fixes)
- [ ] `curl -I localhost:4000/health` — shows security headers (Fix 1)
- [ ] Open redirect test: `{from: 'https://evil.com'}` → redirects to `/` (Fix 4)
- [ ] `npm audit` — react-router vuln resolved (Fix 7)
- [ ] External links have `rel="noopener noreferrer"` (Fix 5)
- [ ] `devToken` absent when `AZF_DEV_RESET_TOKEN` not set (Fix 3)
- [ ] Rate limiter active when `NODE_ENV=production` regardless of test flags (Fix 11)

---

## Timeline

| Phase | Fixes | Estimated Effort |
|-------|-------|-----------------|
| **Week 1** | P1 fixes (1-5) | 4-6 hours |
| **Week 2** | P2 fixes (6-11) + dependency upgrades | 6-8 hours |
| **Week 3** | P3 fixes (12-16) | 3-4 hours |
| **Week 4** | A/B test infrastructure + first test | 4-6 hours |
| **Ongoing** | Run A/B tests, analyze, iterate | 2 hours/week |

---

## Key Decisions Needed

1. **Token storage architecture:** Keep localStorage (simple, Telegram Mini App constraint) or move refresh token to HttpOnly cookie (requires CORS/credentials changes)?
2. **Vite major upgrade:** Breaking change — plan when to upgrade vite from v5 to v8?
3. **A/B test framework:** Build minimal in-house (server-side variant flag) or integrate PostHog/GrowthBook?
4. **Native bcrypt:** Install `bcrypt` C++ addon (requires build tools) or use `argon2` (also native)?

---

*Report generated by Hermes Agent using the autonomous-red-team, security-audit, systematic-debugging, and ab-testing skills.*