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

This project handles health-adjacent personal data — weight, body metrics,
meal logs, allergies and free-text conversations with an AI coach. Anything
that crosses a user boundary is treated as high severity, particularly:

- Reading or writing another user's documents (the cross-user isolation suite
  in `apps/api/src/__tests__/isolation.integration.test.ts` exists for this).
- Authentication and refresh-token handling, including token reuse detection.
- Meal-photo access control — uploads are stored under unguessable names and
  streamed only to their authenticated owner, never served statically.
- Consent enforcement on AI personalisation and the user-memory store.
- Prompt injection that causes the assistant to leak another user's context.

## Known and accepted trade-offs

These are documented decisions, not undiscovered bugs. Reports that restate
them without a new exploitation path will be closed as known:

- **Tokens in `localStorage`** — the app also runs as a Telegram Mini App where
  cookie sessions are impractical. Access tokens live 15 minutes; refresh
  tokens are single-use, rotated, family-revoked on reuse, and stored
  server-side only as SHA-256 hashes.
- **Pure-JS bcrypt at cost 10** (`bcryptjs`) — a portability floor; a native
  binding and higher cost factor is the first hardening step for real load.
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

This is a capstone/portfolio project. Security fixes land on the default
branch; there are no maintained release branches.
