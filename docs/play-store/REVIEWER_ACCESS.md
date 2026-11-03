# Google Play — Sign-in details (formerly "App access")

Play Console → App content → Sign-in details. Reviewers **cannot create accounts**,
so without working credentials here the app is rejected in review.

## Answer

**Is any part of your app restricted?** → **Yes** (account sign-in required).

| Field | Value |
|---|---|
| Name | `Demo user account (full access)` |
| Username / email | `demo@aquazero.fit` |
| Password | *the seeded demo password — see `apps/api/src/data/seed.ts`* |

Verified working against production on 2026-08-17:
`POST https://aquazerofit.com/api/v1/auth/login` → **200**.

## "Any other information required to access your app" (446 / 500 chars)

```
Sign in with the details above. No 2-step verification, PIN, biometric, QR code, membership or location gate — a password is the only access control.

This account holds ~2 weeks of seeded nutrition, hydration, weight and workout history, so every tab shows real data, not an empty state.

Please don't create a new account: registration is Turnstile-protected, and new accounts show a setup prompt until height, weight, age and goal are entered.
```

## Why the demo account matters more than usual here

`POST /auth/register` on production is gated by Cloudflare Turnstile, so a reviewer
cannot self-serve an account even if they tried. Confirmed:

```
{"code":"VALIDATION_FAILED","message":"Please complete the verification challenge."}
```

## Recommendation: use a dedicated reviewer account, not the shared demo one

The demo credentials are seeded, documented in the repo, and shared with anyone
reading it. If the password is ever rotated, or the account is deleted or has its
data altered by another demo user, **app review breaks with no obvious warning** —
and updates stop shipping. A dedicated, non-public reviewer account whose password
is not in version control is the safer arrangement.
