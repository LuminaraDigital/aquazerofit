# Track E — Licensing & Legal Integration Strategy (wger × AquaZeroFit)

## Key Findings

1. **Self-hosting wger as a separate microservice called over HTTP does NOT force AquaZeroFit open-source.** AGPL §13 ("Remote Network Interaction") applies only to *modified versions of the AGPL-covered work itself* (wger), offered to users over a network. AquaZeroFit is a separate work communicating at arm's length over a documented REST/JSON API — the FSF's canonical "separate programs" case (pipes, sockets, CLI). Risk rises only if the coupling becomes "intimate" (exchanging complex internal data structures, shared process, tight semantic interdependence).
2. **Using only wger's exercise/ingredient DATA is the legally safest path** — data is Creative Commons licensed *per record* (not AGPL), matching AquaZeroFit's existing posture (AQF-12: "ADOPT DATA AND DOMAIN MODEL ONLY. No source code").
3. **Calling the public wger.de API at runtime is viable but operationally weak**: most endpoints are unthrottled with no published ToS/SLA; it is a community-run instance, not a commercial API product. Fine for prototyping; risky as a hard runtime dependency.
4. **Vendoring wger code is disqualifying** — AGPL-3.0-or-later is a strong network copyleft; any derivative/linked use contaminates the proprietary codebase and would trigger source-disclosure obligations toward AquaZeroFit's own users.

## Concrete Facts

**wger licensing (verified against repo metadata):**
- Application code: **AGPL-3.0-or-later** ([wger README](https://github.com/wger-project/wger/blob/master/README.md), license badge + License section).
- Exercise/ingredient data: **Creative Commons, per individual entry** ("see individual entries" — not a single blanket license; historically CC-BY-SA 3.0 for the initial exercise/ingredient corpus per [v1.9 docs](https://wger.readthedocs.io/_/downloads/en/1.9/pdf/)).
- Documentation: CC-BY-SA-4.0.
- Exercise **images/videos** carry their own license + author per asset (e.g., 150 videos donated by "Goulart" under CC-BY-SA); the API exposes `license` / `license_author` fields on image/video objects ([Apify wger scraper field table](https://apify.com/jungle_synthesizer/wger-exercise-database-api-scraper)).
- Ingredient data originates from **Open Food Facts**, whose database is **ODbL** (database-level share-alike) with contents under the Database Contents License.

**API mechanics ([wger API docs](https://wger.readthedocs.io/en/latest/api/api.html)):**
- Base: `/api/v2/`; JSON default; OpenAPI schema at `/api/v2/schema`, Swagger UI `/api/v2/schema/ui/`, ReDoc `/api/v2/schema/redoc/`.
- Public list endpoints (exercises, ingredients) require **no authentication**; user-owned objects (routines) require auth.
- Auth: JWT via `POST /allauth/app/v1/auth/login` (10-min access / 120-day refresh, Docker defaults), permanent `Token` header for scripts, or web "API key" page (User settings → API key). No formal commercial API-key program.
- Rate limits (per IP anon / per user auth): login `10/min`; registration `/api/v2/userprofile/` `5/min`; `/api/v2/ingredient/` + `ingredientinfo/` list `120/min`, detail `300/min`; `/api/v2/ingredient-sync/` bulk `600/min`. **All other endpoints unthrottled.** 429 + `Retry-After` on exceed.
- No CORS support for browser clients (per third-party monitoring); server-to-server calls required anyway.
- No published ToS, SLA, or commercial-use terms for wger.de were found; it is the maintainers' community instance.

**FSF guidance (GPL FAQ, applies to the AGPL boundary):**
- "Mere aggregation": separate programs distributed together are fine even with non-free software ([GPL FAQ mirror](http://gnu.ist.utl.pt/copyleft/gpl-faq.html)).
- "Pipes, sockets and command-line arguments are communication mechanisms normally used between two separate programs… But if the semantics of the communication are intimate enough, exchanging complex internal data structures, that too could be a basis to consider the two parts as combined into a larger program." (quoted in [IPO paper](https://ipo.org/wp-content/uploads/2013/04/Will-Google-Break-GPL.pdf) and [GROBID FAQ](https://grobid.readthedocs.io/en/feature-segmentation-light/Frequently-asked-questions/)).
- AGPL §13: if you *modify* the covered program and let users interact with it remotely, you must offer the modified source. An unmodified stock deployment creates no new code-disclosure duty toward your users, but any wger-side patch forces publishing the wger fork.

**AquaZeroFit existing posture (local files):**
- `THIRD_PARTY_NOTICES.md`: all runtime deps MIT/Apache-2.0/OFL; exercise seed records carry `licence`, `licenceAuthor`, `sourceId` fields "never stripped" (AQF-06 §3.3); `content/ATTRIBUTION.md` exists.
- `Documentation/AQF-12_Upstream_Integration_and_Licensing_Register.docx` v2.0: wger verdict = **"ADOPT DATA AND DOMAIN MODEL ONLY. No source code. Network copyleft is incompatible with a commercial product (ADR-013)"**; obligations already accepted include CC-BY-SA 3.0 attribution + share-alike on the derived dataset; standing controls include a dependency-licence allowlist (MIT/Apache-2.0/BSD/ISC) and "no modified [AGPL] instance deployed".

## Scenario Analysis & Confidence

| # | Scenario | Verdict | Confidence |
|---|----------|---------|------------|
| 1 | Self-host stock wger as separate microservice, AquaZeroFit calls over HTTP | **Legal for AquaZeroFit's own code** (arm's-length, separate programs, documented public API as the interface). wger side stays AGPL; unmodified deployment = no extra disclosure duty. | **High** — mainstream FSF reading; residual risk only if integration becomes "intimate" (custom wger plugins, shared DB, internal endpoints) |
| 2 | Import wger exercise/ingredient DATA into AquaZeroFit DB | **Safest path, already AquaZeroFit policy.** Obligations: per-record attribution (license + author fields), CC-BY-SA share-alike on adaptations of the exercise dataset, ODbL share-alike if OFF-sourced ingredient data is republished as a database. Share-alike applies to the *data*, not AquaZeroFit code. | **High** |
| 3 | Runtime calls to public wger.de API | **Legally OK (data is CC, no auth needed for public reads) but operationally fragile**: no SLA/ToS, community instance, unthrottled ≠ guaranteed, CORS blocks browser calls, single point of failure. Acceptable for dev/prototyping or cache-warming, not as a hard production dependency. | **Medium** (legal) / **Low** (reliability) |
| 4 | Vendoring wger code (copying Django models, views, or wger-project/react components) | **Prohibited under current architecture.** Creates a derivative work under AGPL-3.0-or-later; §13 would oblige offering the combined work's source to network users. Violates AQF-12's licence allowlist and "no external code until verified" control. Clean-room reimplementation of *ideas* (progression model, session envelope) is fine — ideas/algorithms are not copyrighted. | **High** |

## Recommended Architecture (legally safest)

**Data-import architecture (Scenario 2) as the foundation + optional self-hosted stock wger (Scenario 1) only if live wger-specific features (gym management, OFF sync) are ever needed:**

1. One-time/periodic **ETL import** of the wger exercise corpus (`/api/v2/exercise*`, exercise images/videos) and ingredient data into AquaZeroFit's own document store, preserving `licence`, `licenceAuthor`, `sourceId` per record — exactly the mechanism already built (AQF-06 §3.3, ATTRIBUTION.md).
2. Render in-app attribution on the exercise library screen; keep the derived dataset share-alike (CC-BY-SA 3.0) and note ODbL obligations for OFF-derived ingredient data.
3. **Never** import wger source; model AquaZeroFit's domain (routines, progression, slots) independently — consistent with ADR-013/AQF-12.
4. If Scenario 1 is ever adopted: run **stock, unmodified** wger via the official Docker compose in a separate container; communicate only via the public `/api/v2/` REST contract; no shared database, no custom wger plugins, no monkey-patching. Publish any unavoidable wger modifications as a public fork to discharge §13.

## Risks / Open Questions

- **CC license version varies per record** (CC-BY-SA 3.0 corpus vs. individually licensed images/videos, some possibly CC0 or other CC variants): the ETL must copy each record's own `license`/`license_author` rather than assuming one blanket license. Verify via `/api/v2/exerciseimage/` and `/api/v2/video/` fields.
- **ODbL on ingredients**: republishing an OFF-derived ingredient database triggers ODbL share-alike + attribution ("© Open Food Facts contributors"); internal use in calculations is largely unencumbered, but the boundary (produced work vs. derivative database) should be confirmed before redistributing any ingredient dump.
- **wger.de runtime dependence**: no ToS found — silent policy change, shutdown, or IP blocking is possible; mitigation = import-and-cache, not runtime proxying.
- **Scenario 1 "intimacy" creep**: if AquaZeroFit's UX becomes a thin shell over wger (its value = wger's functionality), a court could see one combined program. Keep AquaZeroFit's independent features dominant; document the arm's-length design.
- **AI prompt outputs (P-01..P-09)** prompted with wger exercise text: CC-BY-SA attribution should survive into generated plan content referencing those exercises — flag for the safety/attribution pipeline.
- AQF-12 is marked "Draft for supervisor review" (v2.0, July 2026) — the wger verdict should be ratified before commercial release, as the register itself requires.
