# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This history was reconstructed from the repository's tags and commit log. Only
`v1.0.0` and `v1.1.0` were ever tagged; everything since sits under
*Unreleased*.

## [Unreleased]

### Added

- **Native Android application** (`apps/android`), a multi-module Gradle build:
  foundation, design system and an offline-first sync core, with the dashboard,
  nutrition day view, training and progress features built on top. Not yet
  merged to the default branch.
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

[Unreleased]: https://github.com/LuminaraDigital/aquazerofit/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/LuminaraDigital/aquazerofit/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/LuminaraDigital/aquazerofit/releases/tag/v1.0.0
