# Replit ↔ repository drift

The deployment at <https://aquazerofit.com> contains work that exists in **no
commit, on no branch, in this repository's entire history**. Verified:

```bash
git log --all -S"auth/captcha"   # no results
git log --all -i -S"turnstile"   # no results
```

This file records what was found on 2026-08-17, what has been reconciled into
the repo, and what still needs the actual Replit source. It is written from
evidence — live HTTP responses, response headers, and the deployed (unminified)
`splash.js` — not from guesswork.

**The drift runs in both directions.** Replit is ahead on SEO surface, the boot
splash and bot protection; the repo is ahead on Telegram SDK loading and on the
2026-08-17 security hardening. Neither is simply "newer".

---

## Method

Everything below was established by observation, and every claim is reproducible:

```bash
curl -sI https://aquazerofit.com/                      # CSP, HSTS, edge headers
curl -s  https://aquazerofit.com/api/v1/auth/captcha   # bot-protection contract
curl -s  https://aquazerofit.com/sitemap.xml           # the live route set
```

One trap worth naming: **a missing asset returns `200 text/html`, not `404`,**
because the SPA fallback serves `index.html` for anything unmatched. A bare
status-code check reports files that do not exist — `manifest.webmanifest`
looked present until the bytes were examined and turned out to be the HTML
shell. Always check the content, never the status.

---

## Reconciled into the repo (2026-08-17)

| What | How it was recovered | Confidence |
|---|---|---|
| `GET /auth/captcha` + Turnstile enforcement | Probed the live API for its exact contract — endpoint shape, which routes enforce, both rejection envelopes | **Exact.** Pinned by `captchaContract.integration.test.ts` |
| CSP `media-src 'self' blob:` | Read from the live response header | **Exact** |
| CSP: Turnstile in `script-src`/`frame-src` but **not** `connect-src` | Read from the live header; live is correct and an earlier local draft was not — the widget's XHR is issued inside Cloudflare's own iframe, a separate browsing context governed by Cloudflare's policy | **Exact** |
| `splash.js` | Downloaded; ships unminified with its original comments | **Byte-identical** |
| `favicon.ico`, `favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png`, `og-image.jpg` | Downloaded; each verified with `file` to be a real image and not the HTML fallback | **Byte-identical** |
| Favicon + `apple-itunes-app` tags in `index.html` | Copied from the live `index.html`, which is unminified | **Exact** |
| `SOCIAL_IMAGE_PATH` → `/og-image.jpg` | The repo pointed at a 1280×900 screenshot; every major crawler crops to 1.91:1, cutting the heading off. Production's card is a correct 1200×630 | **Exact, and a real fix** |

## Still missing — needs the actual Replit source

These cannot be faithfully recovered from a minified production bundle. A
reconstruction would be plausible and wrong, which is worse than a documented
gap, so none was attempted.

| What | Evidence it exists | Why it can't be reconstructed here |
|---|---|---|
| **5 marketing routes** — `/fitness-tracker`, `/calorie-tracker`, `/ai-fitness-coach`, `/preview`, `/screens` | Present in the live `sitemap.xml` and `robots.txt`; absent from `MARKETING_ROUTES` in `src/lib/site.ts` | Only the rendered HTML is observable. The React components and their copy are not |
| **Boot splash wiring** | `index.html` markup + CSS is recoverable verbatim, and `splash.js` is recovered — but React dismisses it by calling `window.__azfSplashHide()` | The call site inside the app is not identifiable from the bundle. Shipping the markup without it would leave a full-screen overlay up for the 10s watchdog on every load |
| **JSON-LD** (`Organization`, `SoftwareApplication`) | In the live `index.html` | The repo generates structured data per route in `vite-plugins/seo.ts`; merging needs the Replit version of that plugin, not a paste of its output |
| **Blocking Telegram SDK `<script>`** | In the live `index.html` | **Do not port this back.** The repo deliberately removed it — it put a render-blocking third-party request in front of the marketing site for every visitor and stalled outright on networks that block telegram.org. The repo is ahead here |

## In the repo, not yet on Replit

Everything from the 2026-08-17 hardening pass — see `docs/PRODUCTION_READINESS.md`:

- HTTPS enforcement (`platform/https.ts`) and the trust-proxy sanity check
- `secureEquals` — fixes a `crypto.timingSafeEqual` call that threw `RangeError`
  on a short reset token, turning a bad request into a 500
- Constant-time Telegram webhook secret comparison
- Query-string redaction in the access log
- Coverage thresholds and the production dependency-scan gate in CI
- The `<noscript>` SEO block in `index.html`

---

## Getting the Replit source

The reliable way is to take it from Replit rather than infer it here:

1. In the Repl, use the built-in Git pane to commit and push to a branch — or
   download the project as a zip.
2. Diff that branch against `main` and merge deliberately, keeping the repo's
   newer Telegram SDK loading and the `<noscript>` block.
3. Delete this file once the branches agree.

## Preventing a recurrence

The root cause is that Replit is edited directly, so its filesystem is the only
copy of some work. Until every change reaches git first, this will happen again.
The cheapest guard is a deploy-time identity stamp:

`APP_VERSION` is already surfaced by `/health` and `/ready` and is meant to
carry the commit SHA. The live deployment currently reports `1.0.0-dev`, which
is the fallback — meaning nothing stamps it. Set `APP_VERSION` to the deployed
commit in the Replit build, and drift becomes visible in one request:

```bash
curl -s https://aquazerofit.com/health
```

A version that does not match any commit is the signal that something shipped
from outside git.
