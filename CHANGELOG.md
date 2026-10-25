# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This history was reconstructed from the repository's tags and commit log.
Tagged releases are `v1.0.0`, `v1.1.0`, `v1.2.0` and `v1.3.0`. Anything after
`v1.3.0` sits under *Unreleased*.

## [Unreleased]

### Security

- Firebase sign-in no longer links onto an account whose email is unverified. `POST /me/credentials` keeps a new address unverified in every environment. There is still no mailbox-proof flow, so that address can be reserved but cannot be taken over.
- Telegram launch data rejects a future `auth_date` (30 seconds of clock skew), payloads over 4 KB, and a user object that does not match the expected shape.
- Telegram Web re-authenticates with initData when the SameSite=Lax refresh cookie is not sent. SameSite=None is not used.
- Replacing an existing Telegram link requires confirmation. Stripe checkout is refused for a Telegram session.

### Added

- Fight Camp (AZF-P1), shipped dark behind `FIGHT_RECORD_ENABLED` plus one
  `FC_*` sub-flag per feature: a relational `engage` Postgres schema with a
  forward-only migration runner, covered by export and erasure. Per-slice
  record in `docs/specs/AZF-P1_Fight_Camp_Build_Record.md`.
- Staging promotion path (`feature` to `staging` to `main`), with disjoint
  staging and production environment examples, and retention telemetry for
  onboarding, first value, error and abandon (commit `4e3f335`).
- Optional Firebase Auth verification on the API beside the existing access
  JWT, plus Firebase Hosting configuration for the web client (commit
  `5649e23`).

### Changed

- Web UI production hardening: skeletons, semantic tokens and accessibility
  (commits `ffcbe52`, `6f7ba97`).

## [1.3.0] - 2026-09-14

Annotated tag: Android Play release. The tag message records a signed AAB
built by `android-release` for Play internal testing, with `versionCode`
10300 derived from the tag.

### Changed

- The native Android client is on `main` (merge `d6fc467`). The `v1.2.0` tag
  already contained `apps/android`. This release is that merge onto the
  default branch, plus the Play build named by the tag.

## [1.2.0] - 2026-08-30

Lightweight tag on `f137564`, "Ship Android production readiness and Play
release pipeline" (2026-08-30). The entries below are the changes that were
previously listed as unreleased and that this tag already contains.

### Added

- **Native Android application** (`apps/android`): foundation, design system
  and an offline-first sync core, with the dashboard, nutrition day view,
  training and progress features built on top. Present in the `v1.2.0` tree.
  The merge onto `main` is `v1.3.0`.
- **Coach roster, gamification and first-run flow**, including Telegram Stars
  purchases with idempotent, roster-priced grants.
- **Observability**: request-id correlation through the stack, `/metrics`
  counters, a deep readiness probe and persisted error records.
- **Production-readiness pack**: Turnstile client integration, PWA assets and a
  CI coverage gate.
- Frontend engineering report, Heavens design documentation and the
  architecture presentation guide.

### Changed

- Sign-in surfaces are bridged: a Telegram account can be given web
  credentials, and Telegram can be linked from Settings.
- The production container image builds and boots, verified against a live
  Compose stack.

### Security

- Refresh tokens moved to httpOnly cookies with memory-only access tokens and
  atomic rotation.
- Containers hardened: pinned Postgres image digest, fail-closed secret
  handling and dropped Linux capabilities.

## [1.1.0] - 2026-08-04

### Added

- Growth surface: public landing pages, legal scaffolding (drafts until
  operator facts are supplied), buddy challenges, share cards and growth
  telemetry.
- Deliverable password reset: a pluggable mail transport and reset links that
  prefill the token. Production boot now requires `RESEND_API_KEY`, `MAIL_FROM`
  and `APP_PUBLIC_URL`.

### Changed

- Dependency policy reworked so a single major requiring migration can no
  longer hold every security patch hostage in the same pull request.

### Fixed

- Survived the Express 5 upgrade; the bare-wildcard route would otherwise have
  prevented boot.
- The kilocalorie floor no longer fires on remaining-calorie readouts.

### Security

- Account erasure now reaches buddy challenges and growth events.
- Bounded the unauthenticated telemetry write: capped payload, a 180-day
  retention sweep and a tighter rate lane.

## [1.0.0] - 2026-08-03

First public release, prepared for the capstone submission (NIT3004).

### Added

- The AquaZeroFit production baseline across both delivery targets, the React
  web application and the Telegram Mini App, served from a single React 18 +
  TypeScript + Vite codebase.
- A Node.js + TypeScript API implementing the `/api/v1` contract, with shared
  types, validation schemas and an error taxonomy in `packages/shared`.
- The AI gateway with versioned prompts and a deterministic offline engine, so
  every core journey works end to end with no provider keys configured.
- Safety evaluation sets and a runner wired into the pipeline as a release
  gate.
- The AQF specification document set, upstream integration and licensing
  research, and the `.docx` rendering tooling that produces it.

### Security

- Security and API contract fixes carried in the baseline.
- Released under the GNU Affero General Public License v3.0 or later, with
  third-party dependency and dataset licences recorded in
  `THIRD_PARTY_NOTICES.md`.

[Unreleased]: https://github.com/LuminaraDigital/aquazerofit/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/LuminaraDigital/aquazerofit/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/LuminaraDigital/aquazerofit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/LuminaraDigital/aquazerofit/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/LuminaraDigital/aquazerofit/releases/tag/v1.0.0
