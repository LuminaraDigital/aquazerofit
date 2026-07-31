# AQF-12A — wger Integration Addendum

**Addendum to:** AQF-12 Upstream Integration and Licensing Register (v2.0)
**Date:** 2026-07-30 · **Status:** Ratification addendum — proposed for supervisor sign-off alongside AQF-12
**Scope:** Ratifies the wger verdict recorded as draft in AQF-12 and registers the obligations arising from the data-only adoption implemented per `wger-integration-plan.md`.

---

## 1. Ratified verdict

**wger: ADOPT DATA AND DOMAIN MODEL ONLY. No source code.**

wger application code is AGPL-3.0-or-later (network copyleft), incompatible with this proprietary codebase (ADR-013). The exercise/translation/image/video data is Creative Commons licensed **per record**; ingredient data originates from Open Food Facts (ODbL 1.0 + DbCL). Consuming the public REST API and importing the data is the legally clean path and is the implemented architecture (server-side ETL mirror; `wger-integration-plan.md` §3). This verdict is hereby ratified; it was previously marked "draft for supervisor review" in AQF-12.

Basis: research/track-e-licensing-legal.md, Scenario 2 — verdict "safest path, already policy", confidence High.

## 2. Registered obligations

| # | Obligation | Basis | Control |
| --- | --- | --- | --- |
| 1 | **Data-only adoption.** No wger source code is vendored, copied, linked, or shipped in any form. Domain patterns (progression rules, slot model, need_logs_to_advance, e1RM stats) are reimplemented independently — ideas and algorithms are not copyrighted. | track-e Scenario 4 (Prohibited); ADR-013 | Repo/dependency scan; licence allowlist (MIT / Apache-2.0 / BSD / ISC) re-verified at release gate |
| 2 | **Per-record licence preservation (ETL requirement).** wger licences vary per record (CC-BY-SA 3.0/4.0, CC-BY 4.0, CC0). The ETL copies each record's own `license` / `license_author` into `licence` / `licenceAuthor`; a blanket licence must never be assumed. Attribution fields are never stripped by any pipeline. | plan §2.2, §5, §6 risk 3; AQF-06 §3.3 | Zod payload schemas (`packages/shared/src/wger.ts`); import audit report; eval fixture for attribution preservation in AI output |
| 3 | **Legacy empty-author gray zone.** Legacy media with empty `license_author` is attributed "wger community contributors, CC-BY-SA 3.0" (wger's own app convention), documented as best-effort. | plan §2.2, §5 | Documented in `content/ATTRIBUTION.md`; sync corrects upstream fixes |
| 4 | **CC-BY-SA share-alike on adaptations.** AI translations/rewrites of wger descriptions are adaptations licensed CC-BY-SA; attribution must survive into generated plan/library content. | plan §5; track-e risks | Prompt-pipeline flag; eval fixture (attribution preservation); noted in `content/ATTRIBUTION.md` |
| 5 | **ODbL collective-database segregation.** OFF-derived data lives in the segregated `foodsOff` container — never commingled with proprietary records — so ODbL §4.4 share-alike does not attach to the whole database. Per-product attribution "© Open Food Facts contributors" + link. No paywalling/DRM of the OFF-derived dataset itself (§4.4/§4.6). Internal-only adaptation exempt per §4.5c; any publicly adapted database triggers §4.4 + §4.6 (machine-readable copy on request) — legal review required before any redistribution. | track-c §6; plan §2.3, §5, §6 risk 5 | Separate container enforced in the store layer; attribution spec in `content/ATTRIBUTION.md`; legal review gate before launch |
| 6 | **No runtime dependency on wger.de.** wger.de is a community instance with no ToS/SLA and unannounced breaking changes (2.5 removed four endpoints). Production reads are always from the local mirror; wger.de is used only for one-time/incremental ETL with polite pacing (~600 ms spacing). | plan §2.1, §5; track-e Scenario 3 | ETL mirror architecture; sync job with changelog gate |
| 7 | **Version pinning.** Integration keys all imported records on UUID (never integer IDs), records the wger server version per sync, and pins to **wger 2.6+**; upgrades are gated by CI contract tests against the disposable `wger/demo` Docker image. | plan §2.1, §2.7, §4 Phase 5 | Version gate in the sync job; CI contract tests |

## 3. Self-hosting preconditions (dormant scenario)

Self-hosting stock wger is **not adopted**. If it is ever considered (track-e Scenario 1, verdict "legal at arm's length", confidence High), all of the following preconditions must hold and be re-registered in AQF-12 before deployment:

1. **Stock, unmodified** wger via the official Docker compose, in a separate container/host.
2. Communication **only** via the documented public `/api/v2/` REST contract — no shared database, no custom wger plugins, no monkey-patching, no internal endpoints (avoid "intimate coupling" under the FSF separate-programs reading).
3. Any unavoidable wger modification is published as a public fork to discharge AGPL §13 **before** network use.
4. AquaZeroFit's independent features must remain dominant — the UX must not become a thin shell over wger (combined-program risk).
5. AQF-12 re-opened and the scenario re-ratified.

## 4. wger.de no-SLA risk and mirror mitigation

wger.de carries no published ToS, SLA, or commercial-use terms; silent policy change, shutdown, throttling, or IP blocking is possible (track-e risks). Mitigation, as implemented:

- **Import-and-cache, never runtime proxying**: all production reads resolve against the local `content` container; media is mirrored into `apps/api/assets/exercises/` and served via `/uploads` — never hotlinked.
- **Incremental sync**: `last_update_global` cursor + `/api/v2/deletion-log/` reconciliation keeps the mirror fresh without re-crawling.
- **Changelog gate**: each wger release is contract-tested in CI before the pin is moved.

## 5. Register cross-references

- ADR-013 — network copyleft exclusion (no AGPL in the product).
- AQF-06 §3.3 — attribution fields never stripped.
- AQF-11 — safety/privacy design (deterministic filter authority retained over imported data).
- `THIRD_PARTY_NOTICES.md` — dataset licence table.
- `content/ATTRIBUTION.md` — human-facing attribution record and placement spec.
- `research/security-privacy-review.md` — security/privacy review of the new import and lookup surface.

**Approval:** pending supervisor sign-off (same gate as AQF-12).
