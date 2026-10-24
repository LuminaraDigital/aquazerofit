# Cloudflare cutover: aquazerofit.com

The API is already on Cloud Run. The public site is the `aquazerofit` Worker:
static assets from `apps/web`, with `/api`, `/uploads`, `/health`, and `/ready`
proxied to Cloud Run. Mail DNS stays as it is.

## What is live

| Piece | Value |
| --- | --- |
| API | `https://aquazerofit-api-592686987043.australia-southeast1.run.app` |
| Service | `aquazerofit-api` in `australia-southeast1` |
| Database | Cloud SQL `azf-pg` (`aquazerofit:australia-southeast1:azf-pg`), database `aquazerofit` |
| Worker | `aquazerofit` on account `2373013c66331e9660e47ffa3ae40f5c` |
| Zone | `721d5d72697845aeabf6fc18b91b4ecf` (`aquazerofit.com`) |
| Public URL | `https://aquazerofit.com` (www 301s to the apex) |

`/health` and `/ready` on the API return 200 and the Postgres store is hydrated.
Do not point the domain at Cloud Run directly. The Worker is the origin for
the apex and for www.

## Worker

Config: `cloudflare/wrangler.jsonc`.

- Name: `aquazerofit`
- Assets: `apps/web/dist`, SPA fallback
- `run_worker_first`: the Worker redirects `www` to the apex, proxies the API
  paths, and serves everything else from assets
- `API_ORIGIN`: the Cloud Run URL above (a var, not a secret)
- Custom domains: `aquazerofit.com` and `www.aquazerofit.com`
- `workers_dev`: left on so the `*.workers.dev` host can be smoked before DNS

Build the SPA with the public origin set and the API base unset, so the
browser calls same-origin `/api/v1` and canonical URLs use this domain:

```bash
VITE_SITE_ORIGIN=https://aquazerofit.com npm run build --workspace apps/web
```

Leave `VITE_API_BASE_URL` and `VITE_MEDIA_BASE_URL` unset. Leave the Firebase
web build-args unset. Sign-in stays `POST /auth/login`.

From `cloudflare/`:

```bash
npm install
npm test
npx wrangler deploy
```

`wrangler deploy` attaches the two custom domains. That creates the Worker
DNS records. It does not edit MX, SPF, DKIM, or DMARC.

A custom domain cannot be added while an A or CNAME already occupies that
hostname. Delete the Replit records first (next section), then deploy.

## DNS

Zone `aquazerofit.com` (NS `josh.ns.cloudflare.com` and `liz.ns.cloudflare.com`).
The apex A record is proxied, so public resolvers show Cloudflare anycast
addresses rather than the origin. In the dashboard, delete only:

1. The A record on `aquazerofit.com` whose content is `34.111.179.208`.
2. The apex TXT record whose content starts with `replit-verify=`.

The apex has a second TXT, `google-site-verification=...`. Leave that record.

Leave these mail records in place. They are Resend and Amazon SES, and
`MAIL_FROM` is `AquaZeroFit <noreply@aquazerofit.com>`:

- `send.aquazerofit.com` TXT `v=spf1 include:amazonses.com ~all`
- `send.aquazerofit.com` MX `feedback-smtp.ap-northeast-1.amazonses.com`
- `resend._domainkey.aquazerofit.com` TXT (the DKIM key)

`www.aquazerofit.com` is also proxied today. A Worker custom domain cannot be
created on a hostname that already has an A or CNAME. Delete that www A or
CNAME (it is not a mail record), then let `wrangler deploy` create the www
custom domain. Do not delete anything under `send` or `resend._domainkey`.

Then `npx wrangler deploy` from `cloudflare/`. Cloudflare creates the proxied
records for the apex and for www and issues the certificates. Confirm:

- `https://aquazerofit.com/health` returns the API health JSON
- `https://aquazerofit.com/ready` returns 200
- `https://aquazerofit.com/` returns the SPA
- `https://www.aquazerofit.com/` returns 301 to `https://aquazerofit.com/`
- MX and the Resend/SES TXT records are still present

Password-reset links use `APP_PUBLIC_URL` (`https://aquazerofit.com`). Send
them after the apex answers from the Worker, not while the A record still
points at Replit.

## Cloud Run service shape

`deploy/cloudrun/service.yaml` names the existing service `aquazerofit-api`.
One instance, Cloud SQL socket, secrets from Secret Manager. Mounted secrets:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `MAIL_FROM`
- `RESEND_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_SITE_KEY`

`PLAY_SERVICE_ACCOUNT_JSON` has no versions, so it is not mounted. Play
billing stays off until a version exists.

`DATABASE_URL` must be the Cloud SQL socket, not the public IP `35.189.27.65`:

```
postgres://azf:<password-already-in-the-secret>@/aquazerofit?host=/cloudsql/aquazerofit:australia-southeast1:azf-pg
```

The API treats that socket as a local transport. A public IP without TLS is
refused. Do not authorize `0.0.0.0/0`.

`cloudbuild.yaml` rebuilds the image and deploys it with
`gcloud run deploy aquazerofit-api --image`. It does not apply
`deploy/cloudrun/service.yaml`, and it does not touch DNS. A
`gcloud run services replace` of that file would drop secret mounts that
were added on the live service and are not listed there (the STRIPE_*
secrets and the FIREBASE_ADMIN_JSON volume). The running service does not
need a rebuild for this cutover.

## Staging

Do not point staging at instance `azf-pg` or database `aquazerofit`. Only one
instance exists.

## Follow-ups, not part of this cutover

- Stripe. The API reads `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` (see `.env.example`). Leave those mounts, and any other live secret or volume, on the service. The deploy step updates the image only.
- Orange-cloud in front of `run.app`, then `TRUST_PROXY=2`, then closing public ingress on the API hostname. Grey-cloud is not the public path. The Worker is.
- Firestore. The API is off. The store stays on Cloud SQL.
- Meal-photo object storage. Cloud Run disk is ephemeral.
- Firebase Auth on the web (build-args plus authorized domain).
- Turnstile hostnames must include `aquazerofit.com`.
- Admin MFA enrollment. `MFA_REQUIRE_ADMIN=true` locks admin routes until someone enrolls. The public site still boots.
- `PLAY_RTDN_SECRET` and a version of `PLAY_SERVICE_ACCOUNT_JSON` before Play billing notifications.
- A second database before any staging deploy.
