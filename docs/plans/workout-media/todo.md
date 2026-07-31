# Workout Exercise Media Checklist

## Phase 1: Baseline and safeguards

- [x] Task 1: Add the read-only media coverage audit.
- [x] Task 2: Write the asset specification and safety-review record.
- [x] Task 3: Add four category-specific fallback illustrations.

## Checkpoint A: Safe fallback foundation

- [x] Confirm no workout history or user data changed.
- [x] Confirm existing wger image bytes are unchanged and image-level attribution is preserved.
- [x] Run tests, typecheck, build, responsive browser QA, and broken-image checks.
- [ ] Obtain approval before bespoke demonstrations.

## Phase 2: Pilot integration

- [x] Task 4: Add the curated-media manifest and validator.
- [x] Task 5: Integrate deterministic upstream/curated/fallback resolution.
- [ ] Task 6: Create and review the Tier 0 pilot asset set.

## Checkpoint B: Pilot approval

- [x] Confirm Tier 0 has reviewed media or an intentional category fallback.
- [x] Confirm no unreviewed curated asset can appear in the app.
- [x] Confirm file-size, provenance, AI disclosure, and attribution requirements.
- [ ] Obtain approval before expanding coverage.

## Phase 3: Presentation and verification

- [x] Task 7: Refine media presentation only where pilot testing proves necessary.
- [ ] Task 8: Run full regression, performance, licensing, accessibility, and visual QA.

## Phase 4: Controlled expansion

- [ ] Task 9: Add Tier 1 and Tier 2 media in batches of no more than 10.
- [ ] Repeat manifest validation, coverage audit, individual review, and regression QA for every batch.

## Final gate

- [ ] All acceptance criteria in `docs/plans/workout-media/plan.md` are met.
- [ ] Rollback has been rehearsed.
- [ ] Final media coverage report is approved.
- [ ] Broader release is approved.

## Current release position

- Safe category-fallback foundation: complete and verified.
- Bespoke exercise demonstrations: deliberately not shipped; qualified human form-safety approval is still required.
- Browser QA completed at 320px and 448px without horizontal overflow or broken loaded images.
- Automated verification: 416 tests, workspace typecheck, production build, and 51-exercise media audit passed.
- Rollback rehearsal is blocked by the repository having no baseline commit; use an atomic deployment-version revert once a baseline exists.
