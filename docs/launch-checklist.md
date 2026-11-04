# AquaZeroFit — Production & Enterprise Launch Checklist

**Product:** AquaZeroFit (AI wellness platform: React web app + Telegram Mini App + native Android app backed by a shared Node.js / Express 5 API and AI safety gateway)
**Stack:** React 18 / Vite (`apps/web`), Cloudflare Worker edge proxy + static asset host (`cloudflare/`), Node 20 / Express 5 (`apps/api`) on Google Cloud Run + Cloud SQL Postgres (`azf-pg`), and Kotlin / Jetpack Compose (`apps/android`) on Google Play.
**Estimated total cutover time:** ~2.5 hours (excluding Google Play review window).

### Legend
- 🧑 **You** — requires account owner credentials, billing/bank verification, or Play/Cloud Console UI actions.
- 🤖 **Agent** — can be executed directly by your coding agent from the repository or CLI.
- 🤝 **Together** — the agent prepares and verifies the build/config; you confirm the live secret or Console toggle.

---

## Phase 1: Repository & CI Gate Verification (GitHub Actions)

- [x] 🤖 **1.1 Verify the full monorepo, AI safety evals, and CycloneDX SBOMs (`~3 min`)**
  Run the full TypeScript typecheck, unit/integration suite, AI safety evaluation gate (`evals/runner.ts`), and CycloneDX 1.5 SBOM generator (`npm run sbom`).
  > **Prompt:** `Run npm run verify and npm run sbom and confirm zero errors.`
  - **You'll know it worked when:** `EVAL GATE PASSED: zero critical safety misses, zero allergen violations, zero plan-safety failures` and `Generated Android CycloneDX SBOM (38 components)` appear in the terminal output.

- [x] 🤖 **1.2 Verify the Android app static analysis, unit tests, and 63+ instrumented tests (`~6 min`)**
  Run `ktlintCheck`, `detekt`, JVM unit tests, and the full emulator instrumented test suite (`connectedDebugAndroidTest`) plus the R8 release smoke test (`apps/android/scripts/release-smoke.sh`).
  > **Prompt:** `Run ./gradlew ktlintCheck detekt test connectedDebugAndroidTest in apps/android and run apps/android/scripts/release-smoke.sh against the release APK.`
  - **You'll know it worked when:** All 116+ JVM unit tests and 65/65 instrumented tests pass on the emulator, and `Release smoke test passed` prints.

- [x] 🤖 **1.3 Merge stacked feature & enterprise readiness PRs into `staging`, then promote `staging -> main` (`~10 min`)**
  Because `.github/workflows/branch-safety.yml` enforces the promotion path (`feature/* | fix/* | chore/* | dependabot/* -> staging -> main`), merge PRs `#140`–`#145` into `staging` first, verify `gate-staging`, and then open a promotion PR from `staging` to `main`.
  > **Prompt:** `Check gh pr list and merge the approved enterprise readiness PRs (#140-#145) into staging in dependency order.`
  - **You'll know it worked when:** `staging` is green on `ci.yml`, `android-verify.yml`, and `deploy.yml`.

---

## Phase 2: Google Cloud Run & Cloud SQL Production Backend (`apps/api`)

- [ ] 🤝 **2.1 Verify Cloud SQL Point-in-Time Recovery (PITR) & Automated Backups (`EN-1.6`, `~10 min`)**
  *Point-in-Time Recovery (a database feature that records a continuous transaction log so you can restore the database to any second in the last 7 days)* protects against accidental data corruption.
  - In Google Cloud Console -> **SQL** -> `azf-pg` -> **Backups**, enable **Automated backups** and **Point-in-time recovery** (7 days retention).
  - **You'll know it worked when:** `gcloud sql instances describe azf-pg` shows `backupConfiguration.enabled: true` and `pointInTimeRecoveryEnabled: true`.

- [ ] 🤝 **2.2 Grant Cloud Build Service Account `run.services.get` & Deploy `aquazerofit-api` (`EN-1.6`, `~10 min`)**
  `cloudbuild.yaml` deploys `aquazerofit-api` to `australia-southeast1` pinned to `--min-instances=1 --max-instances=1` (`AZF_INSTANCE_COUNT=1`, required because `PgStore` caches state in memory on a single instance).
  - Ensure Secret Manager secrets are populated (`JWT_SECRET`, `COOKIE_SECRET`, `DATABASE_URL`, `ORIGIN_SHARED_SECRET`, `MFA_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `TURNSTILE_SECRET_KEY`).
  - Set `REQUIRE_ORIGIN_SECRET=true` and `MFA_REQUIRE_ADMIN=true` in production environment variables.
  - **You'll know it worked when:** `curl -s https://aquazerofit-api-592686987043.australia-southeast1.run.app/ready` returns `{"status":"ready"}`.

- [ ] 🤖 **2.3 Verify the Tamper-Evident Audit Hash Chain in Production (`EN-4.2`, `~2 min`)**
  After deployment, call `GET /api/v1/admin/audit/verify` with an MFA-authenticated admin session to confirm the SHA-256 audit chain (`GENESIS -> headHash`) is intact.
  - **You'll know it worked when:** The response returns `{"verification":{"valid":true,"count":...,"headHash":"..."}}`.

---

## Phase 3: Cloudflare Worker Edge & Web Cutover (`cloudflare/` + `apps/web`)

- [ ] 🤝 **3.1 Build `apps/web` for Production & Set Worker Secrets (`~10 min`)**
  The Cloudflare Worker (`cloudflare/wrangler.jsonc`) serves the compiled `apps/web/dist` bundle and proxies `/api/*`, `/uploads/*`, `/health`, and `/ready` to Cloud Run while injecting `X-Origin-Shared-Secret` and strict CSP nonces.
  > **Prompt:** `Build apps/web with VITE_SITE_ORIGIN=https://aquazerofit.com and run the Cloudflare Worker test suite.`
  - Run `npx wrangler secret put ORIGIN_SHARED_SECRET` inside `cloudflare/` and paste the exact secret configured on Cloud Run.
  - Run `npx wrangler deploy` inside `cloudflare/`.
  - **You'll know it worked when:** `https://aquazerofit.com/health` returns `200 OK` with `Content-Security-Policy` headers from the Cloudflare Worker.

- [ ] 🧑 **3.2 Verify Provider Webhooks & Turnstile Hostname Allowlist (`~15 min`)**
  - **Cloudflare Turnstile:** Confirm `aquazerofit.com` is in the widget's allowed hostnames list.
  - **Stripe:** Point the live webhook endpoint to `https://aquazerofit.com/api/v1/payments/stripe/webhook`.
  - **Telegram Bot:** Set webhook URL to `https://aquazerofit.com/api/v1/payments/telegram/webhook`.
  - **Google Play RTDN:** Confirm Cloud Pub/Sub push subscription delivers to `https://aquazerofit.com/api/v1/billing/play/rtdn`.
  - **You'll know it worked when:** `GET /api/v1/billing/config` reports live payment rails enabled.

---

## Phase 4: Google Play Store & Android Enterprise Release (`apps/android`)

- [ ] 🤝 **4.1 Tag Release `v*.*.*` to Build Signed AAB, APK, and CycloneDX SBOM (`~10 min`)**
  Pushing a version tag (`v1.0.0`) triggers `.github/workflows/android-release.yml`, which runs unit tests, builds the R8-minified release AAB (`bundleRelease`) and APK (`assembleRelease`), verifies signatures with `apksigner` and `jarsigner`, and attaches `sbom-android.cdx.json` and `sbom-npm.cdx.json`.
  > **Prompt:** `Verify apps/android versionCode and versionName in apps/android/app/build.gradle.kts before tagging the release.`
  - **You'll know it worked when:** The `Android Release Build` GitHub Actions workflow finishes green and uploads the signed `.aab`, `.apk`, R8 `mapping.txt`, and CycloneDX SBOM artifacts.

- [ ] 🧑 **4.2 Complete Owner Play Console Actions (`EN-0.1`–`EN-0.4`, `~30 min`)**
  Only the Google Play Console account owner can perform these four steps:
  1. **EN-0.1:** Upload the signed `.aab` from step 4.1 to the **Internal testing** track in Play Console.
  2. **EN-0.2:** Verify both payments-profile bank accounts in Play Console (**Settings -> Payments profile**) so subscription products can activate.
  3. **EN-0.3:** Fill **App content -> App access** reviewer sign-in credentials to match `docs/play-store/REVIEWER_ACCESS.md`, and invite the API's GCP service account under **Users and permissions**.
  4. **EN-0.4:** Complete the **Foreground service** (`shortService` meal upload) and **Health Connect** declarations unlocked after the first AAB upload.
  - **You'll know it worked when:** The app is installable from the Play Store Internal testing link and a test purchase is verified by `/api/v1/billing/play/verify`.

- [ ] 🤝 **4.3 Optional Android Enterprise MDM Policy Verification (`EN-3.3`, `~5 min`)**
  IT administrators deploying AquaZeroFit via Managed Google Play can configure the 4 restriction keys declared in `res/xml/app_restrictions.xml` (`force_app_lock`, `force_screen_capture_protection`, `disable_data_export`, `allowed_email_domain`).
  - **You'll know it worked when:** Pushing managed restrictions via an EMM test DPC (or `DeviceSecurityController`) locks the **Device security** switches On, disables JSON export, and restricts sign-in to `@<allowed_email_domain>`.
