# Google Play — Sign-in details (formerly "App access")

Play Console → App content → Sign-in details. Reviewers **cannot create accounts**
(production registration is behind Cloudflare Turnstile), so without working
credentials here the app is rejected in review.

## Security notice: the old demo credentials are compromised

This page used to send reviewers to the seeded demo account `demo@aquazero.fit`,
whose password was hard-coded in `apps/api/src/data/seed.ts`. This repository is
public, so **that password is public and must be treated as compromised**
everywhere it was ever used. It is no longer in the source (the demo account now
takes `AZF_DEMO_PASSWORD` in development and tests only), and the seeder refuses
it as a reviewer password.

Production never seeds the demo account (`AZF_SEED_DEMO=false`, and
`NODE_ENV=production` skips it regardless), but this page recorded a successful
production sign-in as it on 2026-08-17, so an account created before that gate
may still exist in the production database. An operator should sign in to it
once more with the old password: if that works, delete the account (Settings →
Delete account, then confirm a second time to erase it immediately) or reset its
password. Do not give it to Google.

## The reviewer account

A dedicated account, provisioned by the API at boot from two secrets:

| Variable | Value |
|---|---|
| `PLAY_REVIEWER_EMAIL` | A dedicated address on a domain we own, e.g. a `play-review@` alias at `luminara.digital`. Not on `aquazero.fit` (refused), and not the address of any existing account (refused). |
| `PLAY_REVIEWER_PASSWORD` | A random password of at least 16 characters (refused if shorter, a `replace-with…` placeholder, or a known-public password). |

How it behaves (`provisionPlayReviewer` in `apps/api/src/data/seed.ts`, tests in
`apps/api/src/__tests__/playReviewerSeed.test.ts`):

- **Both unset: nothing happens.** One set without the other: refused, with a warning in the logs.
- **Created once** under the fixed id `usr-play-reviewer`, with role `user`, a
  complete wellness profile and two weeks of sample meal, water, weight and
  workout history, so every tab shows real data rather than the setup prompt.
  Analytics and reminder consents are off for it.
- **Premium is comped through a server-side allowlist**, `COMPED_PREMIUM_ACCOUNTS`
  in the same file. Only the account the provisioner itself created under that
  fixed id can receive it, and registration can never create that id, so the
  variables cannot be pointed at an existing account to upgrade it. Adding
  anyone else to the allowlist is a reviewed code change.
- **Audited.** `play_reviewer.provisioned`, `play_reviewer.premium_comped` and
  `play_reviewer.password_rotated` go to the hash-chained audit log with a hash
  of the address, never the address or the password.
- **Idempotent.** Later boots change nothing unless the password secret has
  changed. Then the stored hash is replaced and every live session of the
  reviewer account is revoked, so rotating is: add a new secret version, roll a
  revision.
- No MFA, PIN, biometric, QR code or location gate applies to a `user`-role
  account, so the password is the only access control.

## Setting it up in Google Cloud (operator)

Run from a machine with `gcloud` signed in to project `aquazerofit`. Never paste
the values into a ticket, a commit or this file.

```bash
# 1. Create the two secrets (reads the values from your terminal, not argv).
read -r  -p 'Reviewer email: ' REVIEWER_EMAIL
read -rs -p 'Reviewer password (16+ chars): ' REVIEWER_PASSWORD; echo
# Or generate the password: REVIEWER_PASSWORD="$(openssl rand -base64 24)"
printf %s "$REVIEWER_EMAIL"    | gcloud secrets create PLAY_REVIEWER_EMAIL    --project=aquazerofit --replication-policy=user-managed --locations=australia-southeast1 --data-file=-
printf %s "$REVIEWER_PASSWORD" | gcloud secrets create PLAY_REVIEWER_PASSWORD --project=aquazerofit --replication-policy=user-managed --locations=australia-southeast1 --data-file=-

# 2. Let the Cloud Run runtime service account read them (skip if it already
#    has secretAccessor project-wide).
for s in PLAY_REVIEWER_EMAIL PLAY_REVIEWER_PASSWORD; do
  gcloud secrets add-iam-policy-binding "$s" --project=aquazerofit \
    --member="serviceAccount:azf-api@aquazerofit.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done

# 3. Mount them on the live service. This rolls one revision and keeps every
#    other secret, volume and variable (do NOT `services replace`).
gcloud run services update aquazerofit-api --project=aquazerofit --region=australia-southeast1 \
  --update-secrets=PLAY_REVIEWER_EMAIL=PLAY_REVIEWER_EMAIL:latest,PLAY_REVIEWER_PASSWORD=PLAY_REVIEWER_PASSWORD:latest
unset REVIEWER_EMAIL REVIEWER_PASSWORD
```

Confirm the runtime service account name first with
`gcloud run services describe aquazerofit-api --region=australia-southeast1 --format='value(spec.template.spec.serviceAccountName)'`.
Then check the boot log for `[seed] {... "playReviewer":"created"}` (or
`"unchanged"` on later boots), and sign in once at
`https://aquazerofit.com/sign-in` and in the Android app with the same details.

**Rotate:** `printf %s "$NEW" | gcloud secrets versions add PLAY_REVIEWER_PASSWORD --project=aquazerofit --data-file=-`,
then roll a revision (`gcloud run services update aquazerofit-api --region=australia-southeast1 --update-env-vars=PLAY_REVIEWER_ROTATED_AT=$(date +%s)`
or the next deploy). The boot log reads `"playReviewer":"rotated"`. Update Play
Console in the same sitting, or review breaks.

**Retire:** remove the two secrets from the service
(`--remove-secrets=PLAY_REVIEWER_EMAIL,PLAY_REVIEWER_PASSWORD`) and delete the
account from its own Settings. Unsetting the variables alone leaves the account
as it is.

## What goes into Play Console

**Is any part of your app restricted?** → **Yes** (account sign-in required).

| Field | Value |
|---|---|
| Name | `Play reviewer account (full premium access)` |
| Username / email | the value of the `PLAY_REVIEWER_EMAIL` secret |
| Password | the value of the `PLAY_REVIEWER_PASSWORD` secret |

Read both with `gcloud secrets versions access latest --secret=PLAY_REVIEWER_EMAIL --project=aquazerofit`
(and the same for the password) and paste them straight into the console.

"Any other information required to access your app" (under 500 characters):

```
Sign in with the email and password above. No 2-step verification, PIN, biometric, QR code, membership or location gate: the password is the only access control.

The account has premium access and about two weeks of sample nutrition, hydration, weight and workout history, so every tab shows real data.

Please don't create a new account: registration is protected by a human-verification check.
```
