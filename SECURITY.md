# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
(Security tab → *Report a vulnerability*). If that is unavailable, contact the
maintainer through the address listed on the repository owner's GitHub profile.

Please include the affected endpoint or module, reproduction steps, and what an
attacker gains. A proof of concept against your own local instance is welcome;
please do not test against anyone else's deployment.

Expect an acknowledgement within a few days. Fixes are prioritised by whether
user data is exposed.

## Scope

This project handles health-adjacent personal data - weight, body metrics,
meal logs, allergies and free-text conversations with an AI coach. Anything
that crosses a user boundary is treated as high severity, particularly:

- Reading or writing another user's documents (the cross-user isolation suite
  in `apps/api/src/__tests__/isolation.integration.test.ts` exists for this).
- Authentication and refresh-token handling, including token reuse detection.
- Meal-photo access control - uploads are stored under unguessable names and
  streamed only to their authenticated owner, never served statically.
- Consent enforcement on AI personalisation and the user-memory store.
- Prompt injection that causes the assistant to leak another user's context.

## Known and accepted trade-offs

These are documented decisions, not undiscovered bugs. Reports that restate
them without a new exploitation path will be closed as known:

- **Web session (FE-01).** The access JWT lives in memory in
  `apps/web/src/lib/api.ts` (15 minutes, `config.accessTtlSeconds`). The
  refresh token is the httpOnly cookie `azf_rt`: `SameSite=Lax`,
  `Path=/api/v1/auth`, `Secure` outside dev, test, and loopback
  (`apps/api/src/modules/auth/cookies.ts`). The web client, including the
  Telegram Mini App, does not write access or refresh tokens to
  `localStorage` or `sessionStorage`. `localStorage` still holds a public
  user snapshot (`azf.user`) and UI state. Refresh tokens are single-use,
  rotated, family-revoked on reuse, and stored server-side only as SHA-256
  hashes (`apps/api/src/platform/auth.ts`). The auth JSON body still includes
  the refresh token for non-browser clients. Android stores that value in
  `RefreshTokenVault` (Keystore AEAD, alias `azf_rt_key`). Page script that
  can read the response can see the body token; `httpOnly` stops
  `document.cookie` from exposing `azf_rt`. When Firebase Auth is enabled,
  the in-memory bearer may be a Firebase ID token, and 401 recovery tries
  `getIdToken(true)` before `POST /auth/refresh`.
- **Cookie-scoped refresh and CSRF.** Protected routes require
  `Authorization: Bearer`. The browser does not attach that header to a
  cross-site form post. `azf_rt` is host-only (no `Domain`), `SameSite=Lax`,
  and `Path=/api/v1/auth`, so a cross-site or cross-host POST does not
  include it and it is not sent to meal, profile, or other routes. CORS is
  `credentials: false` (`apps/api/src/app.ts`). There is no CSRF token. A
  document on the cookie's own host can POST `/auth/refresh` or
  `/auth/logout` and the browser will send the cookie (rotation or family
  revocation). Split-origin hosting (`VITE_API_BASE_URL` on another site)
  is outside this cookie design: Lax, host-only, and `credentials: false`
  mean the cookie is not sent cross-site.
- **Telegram Web does not widen the refresh cookie.** A Mini App inside
  web.telegram.org is a third-party iframe, so the Lax cookie is not sent.
  The client re-runs initData auth when cookie refresh fails
  (`apps/web/src/lib/api.ts`). SameSite=None; Secure was rejected: refresh
  and logout have no CSRF token, and None would let another site send
  `azf_rt` and rotate or revoke the session even though CORS
  `credentials: false` hides the response. Launch data older than 10
  minutes cannot refresh the session. The user reopens the Mini App. The
  refresh token from the JSON body is not copied into JavaScript memory.
- **Unverified email is not a Firebase link key.** `POST /me/credentials`
  stores a changed address with `emailVerified: false` in every environment,
  including dev. There is no email-verification token flow. Password reset
  proves a mailbox only while changing the password, and it is not reused
  here. Firebase sign-in returns 403 `AUTH_EMAIL_UNVERIFIED` when the token
  is unverified or when the existing account's email is unverified, and it
  does not write `firebaseUid`. Password login does not read the flag.
  What is left: a mailbox-proof flow that sets `emailVerified` only after
  the address is confirmed, and a way to release an unverified claim.
  Until then, register still returns CONFLICT while that row holds the
  address, so the address can be reserved. That is not an account takeover.
- **Stripe checkout is refused for Telegram sessions.** Access tokens from
  initData auth carry `channel: telegram`, and refresh rotation keeps it.
  `POST /billing/stripe/checkout` returns 403 for that channel and does not
  call Stripe. Password and Firebase sessions are unchanged. The block is
  the session, not a client header.
- **Pure-JS bcrypt at cost 12** (`bcryptjs`) on register, sign-in, and
  password change (`BCRYPT_ROUNDS` in `apps/api/src/modules/auth/service.ts`;
  cost 4 under vitest). Seeded demo and admin hashes in
  `apps/api/src/data/seed.ts` use cost 10. A native binding is still the
  throughput trade-off for this pure-JS hash.
- **Prompt injection via stored memory facts is mitigated, not eliminated.**
  Untrusted context is framed and fenced, and the AI never self-confirms a
  fact, but a determined injection remains possible.
- **Model output is never trusted for arithmetic or safety.** Calorie maths is
  deterministic lookup-and-multiply and allergen exclusion is a hard code-side
  filter. A report showing a model can be talked into bad numbers is only a
  vulnerability if those numbers reach the user.

See `docs/specs/AQF-11_Safety_Privacy_and_Ethical_Design.docx` for the full
threat model.

## Supported versions

Security fixes are developed on a branch, merged to `staging`, and promoted
to `main` (`docs/BRANCHING_AND_STAGING.md`). There are no maintained
long-term support branches. Tags `v1.0.0` through `v1.3.0` are historical
snapshots. Take fixes from `main`.
