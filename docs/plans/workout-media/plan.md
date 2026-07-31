# Implementation Plan: Workout Exercise Media

## Overview

Improve workout media coverage without replacing the working wger pipeline, changing workout selection, or making the app depend on a remote image host. The work will be delivered in small, reversible slices: audit the current library, define one visual standard, add a reviewed pilot set for the exercises users see most often, integrate those assets through a deterministic media registry, and expand only after build, API, visual, accessibility, licensing, and performance checks pass.

This plan deliberately does **not** propose generating an image for every exercise immediately. An inaccurate fitness demonstration is more harmful than a clearly intentional fallback, and a mixture of unrelated photo styles would weaken the AquaZeroFit brand.

## Current-State Findings

- `Exercise.media` already supports ordered image/video arrays, so the existing public type can remain unchanged.
- Exercise assets are served locally from `apps/api/assets/` through `/uploads`; production does not need to hotlink wger or another image service.
- The web app already lazy-loads images and falls back when an image is absent or fails.
- The imported wger library currently contains 360 mirrored image files covering 264 unique exercises.
- The original seed corpus points every exercise at the same generic barbell placeholder. That placeholder is inappropriate for cardio, core, mobility, and many bodyweight movements.
- The library, workout overview, exercise detail sheet, variations strip, and guided workout all consume the first media entry. A bad first entry therefore affects several screens.
- Attribution and AI-media disclosure are already visible in the exercise detail flow and must remain intact.

## Goals

1. Give active workout-plan exercises accurate, consistent, useful media.
2. Make missing media look intentional rather than broken.
3. Preserve all existing wger images, licences, authors, and import behavior.
4. Keep media local, responsive, accessible, and inexpensive to load.
5. Make every media addition auditable and easy to roll back.

## Non-Goals

- No changes to plan generation, progression, exercise selection, authentication, or workout logging.
- No replacement of valid wger media merely to make the library uniform.
- No remote runtime image generation or third-party hotlinking.
- No unreviewed AI image may be presented as exercise-form guidance.
- No videos in the first rollout; they add bandwidth, controls, captioning, and review requirements.
- No attempt to reach 100% bespoke-image coverage in the first release.

## Architecture Decisions

### 1. Preserve compatibility in the existing `Exercise.media` contract

Keep the existing ordered media array and add only optional provenance fields to `ExerciseMedia`, so existing clients remain compatible. Curated media is resolved before the API response is returned or when seed/import data is assembled, not through a parallel frontend-only data model.

### 2. Keep upstream and AquaZeroFit-owned media separate

Add a small, private, version-controlled curated-media manifest at `apps/api/src/data/media/curated-manifest.json`. It maps a stable exercise ID or wger UUID to local media files and provenance. Keep the decorative-fallback manifest beside it so runtime can validate exact hashes and dimensions. Neither manifest may overwrite `import-attribution.wger.json` or any mirrored wger binary.

Resolution order:

1. Valid reviewed wger media.
2. Reviewed AquaZeroFit curated media when no valid wger image exists.
3. Category-specific AquaZeroFit fallback art.
4. The existing CSS/icon fallback if all files fail.

This order prevents an incremental wger sync from silently deleting or misattributing project-owned artwork.

### 3. Use category fallbacks before bespoke coverage is complete

Replace the universal barbell placeholder with four intentionally designed fallbacks:

- Strength
- Cardio
- Core
- Mobility

These are decorative category illustrations, not form demonstrations. They must not imply a specific posture or technique. This immediately removes the misleading barbell-on-yoga problem while bespoke assets are reviewed progressively.

### 4. Prioritize by actual product exposure

Create the coverage audit from:

- Exercises referenced by current/demo generated plans.
- Exercises eligible for each `FOCUS_SLOTS` category and muscle.
- Frequency in the existing exercise library and workout sessions.
- Missing, placeholder, broken, and valid-media status.

Priority tiers:

- **Tier 0:** exercises in the demo/current plan and guided workout path.
- **Tier 1:** common beginner movements covering every plan focus and equipment profile.
- **Tier 2:** remaining frequently selected exercises.
- **Tier 3:** long-tail library items; category fallback is acceptable until reviewed.

### 5. Use an instructional visual system, not generic fitness photography

Curated media should follow the existing “Modern Aquatic Wellness” direction:

- Deep ocean background using the existing surface colors.
- Aqua/sea-green accents used sparingly for motion or target-area cues.
- Athlete and equipment centered inside a crop-safe region.
- Neutral clothing, uncluttered environment, and no brand marks.
- Anatomically plausible pose with joints and equipment fully visible.
- One consistent camera language per movement family.
- No text baked into the image; labels belong in accessible HTML.

Master format:

- 16:9 composition, recommended 1600×900 source.
- WebP delivery where transparency is not needed; PNG only where justified.
- First media frame remains legible when center-cropped to a 64×64 thumbnail.
- Target file size under 250 KB per still after optimization, with a hard limit of 400 KB.
- No EXIF, location, or other unnecessary metadata.

For movements that cannot be explained safely in one still, use two reviewed images in the existing ordered media array (start and finish) rather than creating a misleading composite.

### 6. Treat exercise-form review as a release gate

Each bespoke demonstration needs:

- Movement name and intended equipment match.
- Correct start/end position and joint alignment.
- No impossible anatomy, unsafe loading, unstable surfaces, or missing equipment contact.
- Appropriate presentation across body types without sexualized framing.
- Review status, reviewer, review date, source, creation method, and licence recorded in the manifest.
- `isAiGeneratedMedia: true` when any displayed demonstration was AI-generated.

An asset that fails review stays out of the manifest; the category fallback remains.

### 7. Roll out additively

Do not bulk-rewrite stored exercise records. Add registry resolution and assets in reviewable batches. Each batch should be removable without touching workout data. Existing `ExerciseImage` error handling remains the final safety net.

## Dependency Graph

```text
Coverage audit
    |
    +--> visual specification and review rubric
    |        |
    |        +--> category fallback assets
    |        |
    |        +--> Tier 0 bespoke assets
    |
    +--> curated-media manifest and resolver
             |
             +--> API/seed/import integration
                      |
                      +--> library/detail/guided-workout QA
                               |
                               +--> staged expansion
```

## Task Breakdown

### Task 1: Add a read-only media coverage audit

**Description:** Add a script that inventories exercise records and asset files without modifying either. It should distinguish valid wger media, curated media, the legacy placeholder, missing media, missing files, and duplicate assets. It should also produce the Tier 0/Tier 1 candidate list.

**Acceptance criteria:**

- [ ] The report includes total exercises and counts by media status, category, and priority tier.
- [ ] Every local `/uploads` reference is checked against the expected on-disk asset.
- [ ] Running the audit does not update the store, manifests, or assets.

**Verification:**

- [ ] Run the audit against seed data and a wger-imported fixture.
- [ ] Deliberately reference one missing test file and confirm the audit reports it.
- [ ] Confirm `git status --short` is unchanged except for the planned source/report files.

**Dependencies:** None.

**Files likely touched:**

- `apps/api/scripts/auditExerciseMedia.ts`
- `apps/api/package.json`
- `tasks/media-coverage-baseline.md`

**Estimated scope:** Medium.

### Task 2: Define the asset specification and safety-review record

**Description:** Write the exact visual brief, crop rules, file constraints, prohibited failure modes, naming convention, provenance requirements, and reviewer checklist used for both generated and manually created assets.

**Acceptance criteria:**

- [ ] The specification covers 16:9 detail use and 1:1 thumbnail cropping.
- [ ] The checklist explicitly rejects unsafe or anatomically implausible form.
- [ ] Provenance fields cover ownership, AI status, licence, creation date, and reviewer.

**Verification:**

- [ ] Review the specification against strength, cardio, core, and mobility examples.
- [ ] Confirm it uses AquaZeroFit’s existing design tokens rather than introducing a new palette.

**Dependencies:** Task 1.

**Files likely touched:**

- `content/workout-media-style-guide.md`
- `content/workout-media-review-checklist.md`

**Estimated scope:** Small.

### Task 3: Add category-specific fallback artwork

**Description:** Produce four restrained fallback illustrations that communicate category, not exercise technique. Optimize them and replace the single placeholder assignment with a category-based resolver.

**Acceptance criteria:**

- [ ] Strength, cardio, core, and mobility each have distinct fallback artwork.
- [ ] Fallbacks remain clear at 64×64 and at 16:9 without containing text.
- [ ] Missing or corrupt fallback assets still reach the existing icon/CSS fallback.

**Verification:**

- [ ] Compare all four fallbacks at library thumbnail and detail sizes.
- [ ] Simulate a failed URL and confirm the page remains usable.
- [ ] Run API tests, typecheck, and the production build.

**Dependencies:** Task 2.

**Files likely touched:**

- `apps/api/assets/exercises/fallbacks/strength.webp`
- `apps/api/assets/exercises/fallbacks/cardio.webp`
- `apps/api/assets/exercises/fallbacks/core.webp`
- `apps/api/assets/exercises/fallbacks/mobility.webp`
- `apps/api/src/data/seeds/exercises.ts`

**Estimated scope:** Medium.

### Checkpoint A: Safe fallback foundation

- [ ] No workout IDs, plan slots, progression rules, or session data changed.
- [ ] Existing wger media still resolves exactly as before.
- [ ] The app builds and API tests pass.
- [ ] Broken-image handling works in the library, detail sheet, and guided workout.
- [ ] Human approval obtained before bespoke demonstrations are added.

### Task 4: Add the curated-media manifest and validator

**Description:** Introduce a version-controlled manifest for AquaZeroFit-owned media plus a validator that rejects missing files, unsupported formats, oversized files, duplicate primary assignments, unreviewed demonstrations, and incomplete provenance.

**Acceptance criteria:**

- [ ] Manifest entries use stable exercise IDs or wger UUIDs, never display names alone.
- [ ] Validation fails for a missing asset, incomplete provenance, or unreviewed demonstration.
- [ ] The manifest cannot overwrite or masquerade as the wger attribution manifest.

**Verification:**

- [ ] Unit tests cover valid, missing, duplicate, AI-labelled, and rejected entries.
- [ ] The validator passes with an empty manifest before the pilot assets are added.

**Dependencies:** Tasks 1 and 2.

**Files likely touched:**

- `apps/api/src/data/media/curated-manifest.json`
- `apps/api/src/data/media/curatedMedia.ts`
- `apps/api/src/__tests__/curatedMedia.test.ts`

**Estimated scope:** Medium.

### Task 5: Integrate deterministic media resolution

**Description:** Merge reviewed curated media into exercises only when suitable upstream media is unavailable, while keeping category fallback and component-level error handling. Apply the same logic to seed data and imported records so all workout surfaces receive consistent ordering.

**Acceptance criteria:**

- [ ] Valid wger media remains first and its attribution is unchanged.
- [ ] Reviewed curated media is selected only for its intended stable exercise identifier.
- [ ] Re-running seed or incremental import produces the same media order and does not delete curated assets.

**Verification:**

- [ ] Integration tests cover wger-first, curated-second, category-fallback, and broken-file cases.
- [ ] Re-run the importer against a fixture twice and compare normalized output.
- [ ] Confirm the exercise API contract remains backward compatible.

**Dependencies:** Tasks 3 and 4.

**Files likely touched:**

- `apps/api/src/data/media/curatedMedia.ts`
- `apps/api/src/data/seeds/exercises.ts`
- `apps/api/src/data/wger/importer.ts`
- `apps/api/src/__tests__/curatedMedia.integration.test.ts`

**Estimated scope:** Medium.

### Task 6: Create and review the Tier 0 pilot asset set

**Description:** Create a small pilot covering every exercise in the current/demo workout path, plus enough common movements to exercise strength, cardio, core, and mobility presentation. Generate or create one exercise at a time, inspect it at full resolution, and admit it to the manifest only after review.

**Acceptance criteria:**

- [ ] Every Tier 0 exercise has either valid wger media or reviewed curated media.
- [ ] Each curated asset passes the safety, crop, file-size, provenance, and brand checklist.
- [ ] AI-generated demonstrations show the existing AI disclosure in the detail flow.

**Verification:**

- [ ] A reviewer signs off every manifest entry individually.
- [ ] Run the media validator and coverage audit after the batch.
- [ ] Compare the pilot as thumbnails, detail heroes, and guided-workout images.

**Dependencies:** Tasks 4 and 5.

**Files likely touched:**

- `apps/api/src/data/media/curated-manifest.json`
- `apps/api/assets/exercises/curated/<exercise-id>/*.webp`
- `content/workout-media-review-log.md`

**Estimated scope:** Medium per 6–10-asset batch; never batch more than can be reviewed carefully.

### Checkpoint B: Pilot approval

- [ ] Tier 0 coverage is 100% valid or intentionally rejected to a category fallback.
- [ ] No unreviewed media appears in API responses.
- [ ] No valid upstream attribution was removed or changed.
- [ ] Asset-size budget is met.
- [ ] Human approval obtained before Tier 1 expansion.

### Task 7: Refine UI presentation without changing workout behavior

**Description:** After real pilot assets are available, adjust only presentation issues revealed by testing: crop focal point, background treatment, loading layout, and AI/provenance disclosure. Do not redesign the page or modify workout state.

**Acceptance criteria:**

- [ ] Cards do not shift while media loads.
- [ ] Thumbnails do not crop away the athlete, required equipment, or key posture.
- [ ] Alt text is useful and decorative fallbacks are hidden from assistive technology.

**Verification:**

- [ ] Keyboard and screen-reader review of the exercise detail sheet.
- [ ] Browser checks at 320, 768, 1024, and 1440 pixels.
- [ ] Test slow loading, 404 media, empty media, one image, and multiple images.

**Dependencies:** Task 6.

**Files likely touched:**

- `apps/web/src/pages/training/WorkoutLibrary.tsx`
- `apps/web/src/pages/training/WorkoutDetail.tsx`
- `apps/web/src/styles/index.css`

**Estimated scope:** Medium.

### Task 8: Run full regression, performance, licensing, and visual QA

**Description:** Verify the complete workout flow and ensure the media work has not changed APIs, plan generation, workout logging, attribution, accessibility, or load behavior.

**Acceptance criteria:**

- [ ] All repository tests, typechecks, and production builds pass.
- [ ] Library search/filter, detail, variations, workout overview, guided session, rest, and summary flows still work.
- [ ] The coverage report contains no missing local files or unreviewed active assets.

**Verification:**

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Browser console has no new errors or accessibility warnings.
- [ ] Network review confirms media is local, lazy-loaded, cacheable, and within budget.
- [ ] Attribution review confirms wger and AquaZeroFit-owned media are distinguishable and correctly disclosed.

**Dependencies:** Tasks 6 and 7.

**Files likely touched:**

- Test and documentation files only if a defect is found; fixes should be separate tasks.

**Estimated scope:** Medium.

### Task 9: Expand in small reviewed batches

**Description:** Add Tier 1 and Tier 2 assets only after the pilot passes. Each batch repeats generation/creation, individual review, manifest validation, coverage audit, visual QA, and regression checks.

**Acceptance criteria:**

- [ ] Each batch has a defined exercise list and review owner before creation starts.
- [ ] No batch exceeds 10 bespoke demonstrations.
- [ ] Coverage metrics improve without increasing missing-file, review, attribution, or performance failures.

**Verification:**

- [ ] Repeat Task 6 and Task 8 verification for every batch.
- [ ] Compare bundle/API behavior and page load against the previous approved checkpoint.

**Dependencies:** Task 8.

**Files likely touched:**

- `apps/api/src/data/media/curated-manifest.json`
- `apps/api/assets/exercises/curated/<exercise-id>/*.webp`
- `content/workout-media-review-log.md`

**Estimated scope:** Medium per batch.

## Test Matrix

| Case | Library | Detail | Guided workout | Expected result |
| --- | --- | --- | --- | --- |
| Valid wger image | Image | Image + wger attribution | Image | Unchanged |
| Reviewed curated image | Image | Image + AI disclosure when applicable | Image | Curated asset shown |
| Multiple reviewed images | First image | Scrollable ordered images | First image | Stable ordering |
| Category fallback | Category art | Category art | Category art | Clearly intentional, not technique-specific |
| Empty media | Icon fallback | Icon fallback | Icon fallback | No broken layout |
| 404/corrupt media | Icon fallback | Icon fallback | Icon fallback | No uncaught error |
| Slow connection | Reserved media box | Reserved media box | Reserved media box | No major layout shift |
| Incremental wger sync | Valid wger media retained | Attribution retained | Valid image | No curated-file deletion |

## Rollback Strategy

Once the repository has a baseline commit, every implementation batch must be a separate commit and deployment version. Rollback does not require deleting or migrating user data:

1. Revert the complete affected deployment version or commit atomically, including its manifest and assets.
2. Leave asset files temporarily in place if necessary; unreferenced static files are safer than deleting referenced files during incident response.
3. The existing category/icon fallback immediately resumes.
4. Re-run the coverage audit, API tests, typecheck, and build.

Do not roll back by modifying workout plans, deleting exercises, resetting the content store, or rewriting user sessions.
The current unborn repository cannot support a meaningful commit-based rollback rehearsal; that gate remains open until a baseline commit exists.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| AI image shows unsafe form or impossible anatomy | High | Individual human review; reject to category fallback; small batches |
| Incremental wger import overwrites curated media | High | Separate manifest and deterministic resolver; idempotence integration test |
| Attribution becomes inaccurate | High | Keep wger manifest untouched; record project provenance separately; licensing QA gate |
| A file path is committed without its asset | Medium | Manifest validator plus on-disk coverage audit in CI |
| Large images slow the mobile app | Medium | WebP, strict file-size limit, lazy loading, network-budget check |
| Square thumbnails hide key posture | Medium | Crop-safe visual specification and multi-breakpoint visual QA |
| Content becomes stylistically inconsistent | Medium | One approved pilot style; no expansion until pilot sign-off |
| Existing IDs or workout data are changed accidentally | High | Media-only scope, regression tests, and explicit checkpoint diff review |
| A valid wger image is replaced unnecessarily | Medium | Upstream-first resolution and test coverage |
| Decorative fallback is mistaken for instruction | Medium | Category-level abstract art, decorative semantics, no specific exercise pose |

## Definition of Done

- [ ] Tier 0 exercises have valid reviewed media or an intentional category fallback.
- [ ] No workout, plan, progression, logging, or user-data behavior changed.
- [ ] Existing wger media and attribution are preserved.
- [ ] Curated provenance and AI status are complete and visible where required.
- [ ] Audit and validator report no active missing files or unreviewed assets.
- [ ] Tests, typechecks, and production build pass.
- [ ] Browser verification passes at the required breakpoints and failure states.
- [ ] Rollback has been rehearsed on the pilot manifest.
- [ ] The user approves the pilot before broader generation begins.

## Decisions Needed Before Implementation

1. Approve the instructional illustration direction described above.
2. Confirm whether the first bespoke batch should cover only the current/demo plan or the top 10 most frequently eligible beginner exercises as well.
3. Identify who will provide the final human form-safety approval for each demonstration.
