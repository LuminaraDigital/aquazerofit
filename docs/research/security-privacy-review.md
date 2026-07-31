# Security & Privacy Review — wger / Open Food Facts Integration

**Reviewer:** SecPriv (Security/Privacy Engineering) · **Date:** 2026-07-30
**Scope:** New attack and privacy surface introduced by `wger-integration-plan.md` (ETL mirror, admin import endpoint, barcode lookup, media mirroring, crowdsourced content, OFF allergen data, AI plan generation on imported corpus).
**Method:** Spec-driven review against the plan, research briefs (track-c, track-e), the frozen Stage-1 contracts (`packages/shared/src/wger.ts`, `apps/api/src/data/wger/mappings.ts`), and existing API patterns (`requireAuth`/`requireAdmin`, `auditDataAccess`, zod-first validation, attribution immutability in `modules/admin/router.ts`). Stage-2 endpoint code was in flight at review time; items are therefore expressed as **requirements** with a verdict on the design/contract layer, and MUST be re-verified against the merged implementation at the QA stage.

---

## 1. Admin import endpoint (`POST /admin/exercises/import`)

**Surface:** an authenticated endpoint that triggers a long-running crawl of wger.de (828+ `exerciseinfo` calls) plus media downloads (plan §2.6, §4 Phase 1).

- **Authorization.** MUST sit behind the existing `requireAuth` + `requireAdmin` middleware chain, exactly like the rest of `modules/admin/router.ts` (which applies `adminRouter.use(requireAuth, requireAdmin)` to every route). No user-role path may reach it.
- **Idempotency.** Import MUST be an upsert keyed on `wgerUuid` (UUID identity per plan §2.1 / ADR-level rule "key on uuid, never integer IDs"), so a retried or double-submitted import converges to the same state. Re-runs must reconcile rather than duplicate, and must honor the wger deletion-log (`replaced_by`) for removals.
- **Resource exhaustion.** A full crawl is minutes of network + CPU. Requirements: (a) single-flight guard — one import job at a time, second invocation returns 409; (b) bounded pagination (`limit=200`, per plan §2.1) with polite pacing (~600 ms spacing, plan §5) so the job cannot be tuned into a hammer; (c) the endpoint should enqueue/return a job handle rather than hold the HTTP request open for the whole crawl; (d) per-request timeouts on every upstream fetch so a hung wger.de connection cannot pin a worker.
- **Audit.** Import invocations MUST emit `auditDataAccess` entries (actor, trigger, counts upserted/deleted), matching the existing admin audit pattern.

**Verdict: PASS (design) — contingent on QA verifying single-flight guard, job framing, timeouts, and audit logging in the merged router.**

## 2. Barcode endpoint (local mirror → OFF fallback)

**Surface:** user-supplied barcode → local `foodsOff` lookup, on miss a **server-side** call to Open Food Facts (plan §4 Phase 4; track-c barcode flow). Classic SSRF-adjacent shape: user input steers an outbound request.

- **Egress allowlist.** The outbound fallback MUST be hard-pinned to `https://world.openfoodfacts.org` (OFF product API) — host constant in code, never derived from request input. No arbitrary URL fetch, no redirect following off-host (disable redirect following or re-validate every redirect target against the allowlist).
- **EAN validation.** Barcode input MUST be validated before any outbound call: digits only, plausible EAN/UPC length (8/12/13/14), zod-enforced (`code` is a plain string in `wgerOffIngredientSchema` — the router must add the format refinement). This kills path/query injection into the OFF URL and junk lookups.
- **Timeout + response size cap.** Upstream call MUST have a hard timeout (≤ 5 s recommended) and a response body size cap (OFF product payloads can be large; parse through `wgerOffIngredientSchema`, which strips unknown keys — good). Never stream unbounded bodies into memory.
- **Rate politeness.** OFF requires a custom User-Agent and per-endpoint rate-limit respect (track-c risks); plan specifies 15 req/min respect with local-mirror-first resolution, which keeps outbound volume low by design.
- **Result trust.** OFF responses are crowdsourced third-party data — treat every field as untrusted input (schema-validated, never rendered raw, never fed to prompts unprocessed — see §4 and §7).

**Verdict: PASS (design) — contingent on QA verifying the host allowlist constant, redirect policy, EAN refinement, timeout, and size cap.**

## 3. Media mirroring (wger images/videos → `apps/api/assets/exercises/`)

**Surface:** importer downloads remote media and writes local files served via `/uploads` (plan §2.6; `wgerExerciseImageSchema`/`wgerExerciseVideoSchema` carry absolute wger.de URLs).

- **Path traversal.** Local filenames MUST be derived from the record's **UUID** (`uuid` fields are `z.string().uuid()`-validated in the frozen schemas) plus a fixed extension from the validated content type — never from the upstream URL path, which may contain `../`, encoded separators, or host-controlled segments. Resolve the final path and assert it stays inside `apps/api/assets/exercises/` (reject if the resolved path escapes the directory root).
- **Content-type sniffing / confusion.** Do not trust the URL extension or the `Content-Type` header alone: verify magic bytes for the allowed set (JPEG/PNG/WebP for images; MP4/WebM for videos), reject everything else, and set the extension from the verified type. Serve mirrored media with an explicit `Content-Type` and `X-Content-Type-Options: nosniff` so a smuggled HTML/SVG payload cannot execute as active content in the TMA/web origin.
- **Size caps.** Hard per-file cap (recommend ≤ 10 MB images / ≤ 50 MB videos) enforced during download (abort on exceed), plus an aggregate mirror quota check. Prevents disk exhaustion from a malicious or corrupted upstream asset.
- **Existing precedent:** the admin content router already restricts media URLs to `https?://…` or `/uploads/…` paths, blocking `javascript:`/`data:` schemes — mirrored-media serving must preserve that invariant.

**Verdict: PASS (design) — contingent on QA verifying UUID-only filenames, directory-escape assertion, magic-byte validation, nosniff header, and size caps in the mirror code.**

## 4. Crowdsourced HTML descriptions (XSS surface)

**Surface:** wger `Translation.description` is crowdsourced HTML (plan §2.2 flags it explicitly: "crowdsourced, XSS surface — sanitize HTML"). Rendered in React web app and Telegram Mini App; also embedded in AI prompts (§7).

- **Sanitizer coverage.** Stage 1 shipped `sanitizeWgerDescription()` in `apps/api/src/data/wger/mappings.ts`: strips `<script>`/`<style>` blocks wholesale, removes ALL remaining tags (including a truncated trailing tag), decodes numeric/named entities, and collapses whitespace. Output is **plain text** — the strongest position: no HTML allowlist to get wrong, no attribute-based bypasses (`onerror=`, `href="javascript:…"`) survive because no markup survives.
- **Residual risk: double-encoding.** Entities are decoded once after tag stripping. A payload like `&lt;script&gt;` decodes to a literal `<script>` *string* — harmless as text (React escapes it on render) but MUST never be re-parsed as HTML downstream. Requirement: descriptions are stored and rendered as plain text only; **no `dangerouslySetInnerHTML` anywhere in the render path** (QA must grep `apps/web/**` for it), and no markdown/HTML re-rendering of description text in the TMA.
- **Schema-level backstop.** `wgerExerciseTranslationSchema.description` is a plain `z.string()`; sanitization happens at ETL time, so the stored corpus is clean even if a future consumer forgets.

**Verdict: PASS.** Sanitizer is deterministic, total (strip-all, not allowlist), and applied at import. QA gate: confirm zero `dangerouslySetInnerHTML` uses on imported description text in `apps/web`.

## 5. Allergen data: best-effort disclaimer vs deterministic filter

**Surface:** OFF `allergens_tags` / `traces_tags` are crowdsourced and incomplete (track-c: "best-effort, not ground truth"). wger **discards** allergen fields entirely — ingestion is OFF-direct only (frozen `wgerOffIngredientSchema` comment, plan §2.3).

- **Authority separation (invariant preserved).** The deterministic curated allergen filter remains the sole safety authority: user allergen exclusions are enforced by code against AquaZeroFit's own curated allergen table. OFF allergen tags may only **inform/display**, never **override or widen** a block, and never **clear** a food the curated table blocks.
- **Disclaimer.** Any UI surface showing OFF allergen info MUST carry a best-effort disclaimer (crowdsourced, may be incomplete/absent). Absence of an OFF allergen tag must never be presented as "allergen-free".
- **Data provenance.** `allergens_tags`/`traces_tags` are marked "OFF direct only, best-effort" in the frozen schema — correct. QA must confirm no wger-sourced ingredient record is treated as allergen-annotated (wger drops the fields, so wger-routed data is allergen-blind by construction).

**Verdict: PASS (design).** Authority separation is architectural. QA gate: verify the deterministic filter's curated table is untouched by OFF imports and that the disclaimer copy ships with the barcode/log UX.

## 6. Health-adjacent data & privacy (GDPR-style minimization)

**Surface:** the integration imports reference data only; the privacy question is whether any user data flows to wger.de/OFF, and whether imported data drags third-party PII in.

- **No user PII egress to wger.de.** ETL is a server-side, unauthenticated crawl of public reference data (plan §2.1: public reads need no auth). It carries **no user identifiers**. Production reads never hit wger.de at all (mirror architecture) — zero runtime user-data exposure to wger.
- **OFF fallback egress.** Barcode fallback leaks only the scanned barcode to OFF — this is **user-behavioral metadata** (what a specific user scanned, correlated by IP at OFF's side). Acceptable under minimization: (a) barcode only, no user id/token; (b) mirror-first design means the fallback fires on cache miss only; (c) document the third-party call in the privacy notice. Consent state: reuse the existing nutrition/consent surface — barcode scanning is a user-initiated action within already-consented food logging, so no new consent gate is required, but the OFF third-party disclosure MUST be added to the privacy notice (AQF-11 documentation duty).
- **No upstream PII import.** OFF contributor usernames and wger `license_author` names are attribution data, not AquaZeroFit user PII; they are stored solely to satisfy licence obligations (AQF-06 §3.3) and are never joined to user records. `license_author` on OFF-derived records may contain contributor handles — retained strictly for attribution compliance, which is the legally required purpose.
- **Minimization of the import itself.** OFF subset is language/category filtered (plan §4 Phase 4) — import only what the product uses. Health-adjacent inferences (nutriscore, vegan flags) enrich P-02 but are deterministic fields, not profiling outputs.

**Verdict: PASS — with one REQUIRED action: add the OFF third-party data transfer (barcode fallback) to the privacy notice before launch.**

## 7. AI plan generation — prompt injection via crowdsourced text

**Surface:** imported exercise names/descriptions enter P-05/P-06 prompt context (plan §4 Phase 3). Crowdsourced text can contain adversarial instructions ("ignore previous instructions…") — indirect prompt injection.

- **Sanitization before prompt inclusion.** Only the **sanitized plain-text** description (§4) and validated name may enter prompts. Since ETL stores sanitized text, prompt builders reading from the store inherit the clean form; QA must confirm no prompt lane reads raw upstream payloads.
- **Structural separation.** Imported corpus text MUST be embedded as data (delimited, labeled as untrusted reference content), never concatenated into the instruction/system portion of prompts. The AI contract keeps the deterministic core authoritative (`tryGenerateAiPlan` returns null → offline engine fallback; zod validates all output), so even a successful injection cannot directly authorize unsafe plans — but it could bias exercise selection, so the data/instruction split is still required.
- **Output containment.** Plan output passes deterministic validation + hard safety caps (zod weight/RiR caps, plan §2.4/§4 Phase 2) and the eval fixtures include absurd-load rejection and attribution preservation (plan §4 Phase 3) — injection cannot lift the caps.
- **Share-alike note.** Prompts/adaptations using wger text inherit CC-BY-SA attribution duties (see AQF-12A §2 item 4) — a compliance control, not a security one, but enforced in the same pipeline.

**Verdict: PASS (design) — contingent on QA verifying (a) prompt builders use store-sanitized text, (b) untrusted-content delimiting in the P-05/P-06 prompt templates, (c) the plan-safety eval fixtures exist and pass.**

## 8. Verdict table

| # | Item | Verdict | Blocking conditions for QA sign-off |
| --- | --- | --- | --- |
| 1 | Admin import endpoint | **PASS (design)** | requireAdmin on route; single-flight guard; job framing (no request-held crawl); upstream timeouts; audit entries |
| 2 | Barcode endpoint (SSRF) | **PASS (design)** | egress pinned to world.openfoodfacts.org; no off-host redirects; EAN format validation; ≤5 s timeout; response size cap; custom User-Agent |
| 3 | Media mirroring | **PASS (design)** | UUID-derived filenames; directory-escape assertion; magic-byte content-type validation; nosniff on serve; per-file size caps |
| 4 | Crowdsourced HTML (XSS) | **PASS** | grep `apps/web` for `dangerouslySetInnerHTML` on description text → must be zero; description rendered as plain text in TMA |
| 5 | Allergen data authority | **PASS (design)** | curated allergen table untouched by OFF imports; best-effort disclaimer shipped in barcode/log UX |
| 6 | Health-adjacent privacy | **PASS — 1 required action** | OFF third-party transfer disclosed in privacy notice before launch |
| 7 | AI prompt injection | **PASS (design)** | prompts read sanitized store text only; untrusted-content delimiting in templates; plan-safety evals green |
| 8 | Compliance register | **PASS** | `THIRD_PARTY_NOTICES.md` + `content/ATTRIBUTION.md` + AQF-12A updated (this stage); attribution fields never stripped (already enforced in admin patch route) |

**Overall: PASS at design/contract level.** No ISSUE-level findings. Seven QA verification gates above must close before release; the one required non-code action is the privacy-notice disclosure for the OFF barcode fallback.

## 9. Standing invariants re-confirmed

- Code calculates/filters/enforces — AI only proposes: unchanged; deterministic validation + hard caps gate all AI output (§7).
- Allergen exclusion is deterministic: unchanged; OFF tags are advisory only (§5).
- Attribution fields (`licence`/`licenceAuthor`/`sourceId`) never stripped: enforced at the admin edit route (patch schema re-applies stored values) and required of the ETL (AQF-12A §2 item 2).
- No AGPL code in the repo: integration is data-only; no wger source vendored (AQF-12A §1).
- OFF data segregated: `foodsOff` container, never commingled (AQF-12A §2 item 5).
- Calorie/progression math deterministic: imported data supplies values only; math stays in code.
