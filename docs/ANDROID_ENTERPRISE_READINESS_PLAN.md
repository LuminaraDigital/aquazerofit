# Android enterprise readiness plan

**Status:** proposed, 2026-11-03. Nothing here is built.
**Scope:** `apps/android`, plus the API and operations work the Android app depends on.
**Companion docs:** `docs/android-build/PRODUCTION_READINESS.md` (the 2026-08-27 Play audit),
`docs/PRODUCTION_READINESS.md` (API controls and known gaps), `docs/security/SECURITY_AUDIT_REPORT.md`.

## Where we are

The Android app is a well-built consumer app that has not yet reached Play. Release
engineering, token storage, consent gating and account deletion are in good shape. What an
enterprise buyer asks for on top of that does not exist: single sign-on, an organisation
model, MDM configuration, device-side data protection beyond the OS defaults, and
independent assurance. Several existing controls are also built but never exercised in CI.

Every finding below was checked against the tree on 2026-11-03 unless marked **(from notes)**.

| Area | Finding |
|---|---|
| Identity | Sign-in is email and password plus Telegram. No SAML, OIDC or SCIM anywhere in `apps/api/src` or `apps/android`. |
| Tenancy | No `orgId` or tenant concept. Roles are `user` and a global `admin`; the isolation boundary is the user id. |
| Device management | No `app_restrictions.xml`, no `RestrictionsManager` use. |
| Device security | No `BiometricPrompt`, `FLAG_SECURE` or Play Integrity. No encryption of the Room database (`azf.db`) beyond the OS. |
| Network | System CAs only, no pinning (a documented decision in `network_security_config.xml`). A TLS-inspecting proxy whose root CA is user-installed will be rejected. **Untested.** |
| CI | 12 instrumented tests are assembled but never run. The R8 build is checked for kept classes but never launched. Dependabot has no `gradle` ecosystem, so Android dependencies get no update PRs. No SBOM tooling. |
| Tests | `LocalCachePurgerTest` seeds meals, user, outbox, catalog, coach and progress only. Chat, memory, training, workout, weight and water rows are neither seeded nor asserted, and most local tables have no `userId` column, so the purge in `LocalCachePurger` is what separates accounts on a shared device. |
| Accessibility | Unverified on device with TalkBack as of 2026-08-27. |
| Localisation | English only (`res/values` is the sole values directory). |
| Distribution | **(from notes)** no AAB uploaded and payments bank accounts unverified at the last Console check, 2026-09-14. Server-side Play verification is configured as of today (`/billing/config` reports `play.available:true`). |
| Backend | **(from notes)** single instance by design, whole dataset in RAM, no load test, Cloud SQL point-in-time recovery off, no staging host, Cloud Build deploy step fails on a missing permission. Re-read the live config before relying on any of this. |

## Decide first: who is the enterprise buyer?

Phases 2 and 3 change shape depending on the answer, so settle it before starting them.

| Buyer | What they need that we lack |
|---|---|
| Employer or insurer wellness programme (B2B2C) | SSO, org admin, org-level reporting that never exposes individual health data, a DPA, SOC 2 |
| IT-managed device fleet | Managed configuration, app lock, an answer on TLS inspection |
| Neither: "enterprise-grade quality" for consumers | Phases 0, 1 and 4 only |

Phases 0 and 1 are worthwhile in every case and need no decision.

## Phase 0: ship it (owner actions)

These block everything else and only the account owner can do them.

- **EN-0.1** Upload the first signed AAB to Internal testing. The existing draft release has no bundle.
- **EN-0.2** Verify both payments-profile bank accounts. Subscriptions cannot be created until a bundle exists and the profile is clean.
- **EN-0.3** Fill Sign-in details in the Console to match `docs/play-store/REVIEWER_ACCESS.md`, and add the API's service account as a Play Console user.
- **EN-0.4** Complete the Foreground service and Health Connect declarations, which only appear after the first upload.

**Done when:** a build is installable from the Internal testing track and a test purchase is granted by the live API.

## Phase 1: prove what already exists

No new features. Each item turns a claim into something CI would catch.

- **EN-1.1 Run the instrumented suite in CI.** Add an emulator job to `android-verify.yml` running `connectedDebugAndroidTest`. Today it only runs `assembleDebugAndroidTest`. **Done when:** a deliberately broken `LocalCachePurgerTest` fails a pull request.
- **EN-1.2 Smoke-test the R8 build.** Install the CI-built minified APK on an emulator, cold-start it offline, and fail on a dead process, a crash, or a `ComponentDiscovery` warning. Opening the barcode scanner would need a signed-in session against production, so the test stops at launch. **Done when:** a release build that crashes at startup, or that declares a Firebase registrar it cannot instantiate, fails CI. Reverting the ML Kit keep rule is no longer a valid test: `firebase-components` 19.0.0 ships the same rule, so ours is a backstop.
- **EN-1.3 Close the purge coverage gap.** Extend `LocalCachePurgerTest` to seed and assert chat sessions and messages, memory facts, challenges, training plans, workout sessions, and weight, water and trend rows. Add a test that enumerates every table in the schema and fails if one is neither purged nor on a catalogue allow-list, so a new user-scoped table cannot leak silently.
- **EN-1.4 TalkBack pass.** Walk onboarding, meal capture, workout session and settings with TalkBack on the emulator, record defects, fix them. **Done when:** the findings are written into `docs/android-build/` and each is closed or accepted.
- **EN-1.5 Dependency hygiene.** Add a `gradle` ecosystem for `/apps/android` to `.github/dependabot.yml`. Generate a CycloneDX SBOM for the Android build and the npm workspaces in CI and attach it to releases.
- **EN-1.6 Platform track (API and operations).**
  - Load test the API at the 200–500 user ceiling.
  - Turn Cloud SQL point-in-time recovery on.
  - Stand up a real staging host so `gate-staging` tests something.
  - Fix the Cloud Build deploy step's `run.services.get` permission.

## Phase 2: protect data on the device

Independent of the buyer. Do the cheap controls first, then decide on encryption with evidence.

- **EN-2.1 Optional app lock.** `BiometricPrompt` with device-credential fallback, off by default, a Settings toggle, re-lock after a configurable background timeout. Must not break the `forceLogout()` resume path (same user, no purge).
- **EN-2.2 Screen-capture protection.** `FLAG_SECURE` on screens showing health and nutrition data, so they are blanked in the recents view and in screenshots. Setting-controlled; becomes policy-forced in EN-3.3.
- **EN-2.3 Database encryption: decision, not an assumption.** Write a short ADR first. Android file-based encryption already covers most current devices at rest. Adding SQLCipher means a native library per ABI and a Room 3 compatibility check. Measure APK size and cold-start cost, then decide. If adopted, it needs a migration path for existing installs.
- **EN-2.4 Play Integrity (optional).** Server-verified attestation on sign-up and on credit-spending calls. Decide fail-open versus fail-closed up front: fail-closed locks out devices without Google services.

## Phase 3: identity and management (only if the buyer needs it)

- **EN-3.1 Organisation model on the API.** An `orgId` on users, an org-scoped admin role distinct from the global `admin`, and org membership checks wherever the user id is checked today. Extend `isolation.integration.test.ts` so org A's admin can never read org B's data, and so an org admin sees membership and usage, never individual meal, weight or health records.
- **EN-3.2 OIDC single sign-on.** Authorization code with PKCE, with the IdP configured per organisation. On Android, drive it through Custom Tabs and the existing verified App Link host, then exchange into the existing `RefreshTokenVault` flow so token handling does not fork. Take SAML through an IdP broker only if a customer insists. SCIM deprovisioning comes after SSO, and must trigger the existing deletion pipeline.
- **EN-3.3 Managed configuration.** `res/xml/app_restrictions.xml`, read through `RestrictionsManager` at launch and on `ACTION_APPLICATION_RESTRICTIONS_CHANGED`. Candidate keys: organisation or SSO domain hint, force app lock, force `FLAG_SECURE`, disable data export. **Managed configuration may only restrict. It must never grant or pre-fill a consent**, because consent invariants live in `CONTRIBUTING.md`.
- **EN-3.4 TLS inspection: decide, then document.** First reproduce the failure on an emulator with a user-installed root CA. If it fails as expected, the options are to document that the app's host must be exempt from inspection, or to offer an enterprise build that trusts user CAs. Certificate pinning stays declined. Its prerequisites are in `network_security_config.xml`: a backup pin, monitored expiry and a server-driven kill switch.

## Phase 4: assurance and paperwork

- **EN-4.1 Independent penetration test** of the Android app and the API, by a third party. The current audit is self-run. Budget for remediation.
- **EN-4.2 Tamper-evident audit log.** The hash chain recorded under Known gaps in `docs/PRODUCTION_READINESS.md`.
- **EN-4.3 Compliance material (owner and counsel).** A DPA, a subprocessor list (Google Cloud, Firebase, Cloudflare, the AI providers), an SLA, and a SOC 2 Type I readiness assessment. The backend's single-instance design must be reconciled with any availability commitment before an SLA is signed.
- **EN-4.4 Localisation.** Add locales when a customer asks. First confirm no user-facing strings are hardcoded outside `@Preview` blocks, and add a pseudo-locale check so truncation shows up early.

## Sequencing

```
Phase 0 ──► Phase 1 ──► Phase 2 ──┐
                 │                ├──► Phase 4
                 └─ EN-1.6 ───────┤
                                  │
        buyer decision ──► Phase 3 ┘
```

- EN-1.1 before EN-1.3: the purge test only has value once CI runs it.
- EN-2.2 and EN-2.1 before EN-3.3: managed configuration needs something to force on.
- EN-3.1 before EN-3.2: SSO needs an organisation to resolve to.
- EN-1.6 gates any SLA in EN-4.3.

## Constraints that apply to all of it

- Feature modules never depend on one another. Shared code goes in `:core:ui` or `:core:designsystem`.
- Any new user-scoped Room table must be added to `LocalCachePurger.purgeUserScoped()`. EN-1.3 makes that mechanical.
- New behaviour ships with a test. A bug fix gets a failing test first.
- Changes to prompt behaviour bump the prompt version. None of this plan should touch prompts.
- The product invariants in `CONTRIBUTING.md` are out of scope for change: allergen exclusion, the append-only credit ledger, never billing degraded AI output, and confirm-before-log.

## Explicitly not planned

- Certificate pinning (see EN-3.4).
- Multi-instance API scaling. That is the async-store refactor named in `apps/api/src/platform/store.ts` and is a separate project. Revisit it only if the load test in EN-1.6 shows the ceiling is below a customer's headcount.
