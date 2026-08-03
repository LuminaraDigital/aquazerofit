# Workout Media Review Log

## Batch 1 — adopted upstream wger media (2026-08-04)

**Scope.** No new binaries were created or downloaded. This batch reuses images
already mirrored into `apps/api/assets/exercises/` by the wger importer, which
were sitting unreferenced because the seed corpus carries no `wgerUuid`. Every
licence, author and AI-generated flag is read verbatim from
`apps/api/assets/exercises/import-attribution.wger.json` at load time, so
attribution cannot drift from the binaries (AQF-12).

**Identity is not changed.** The mapping keys on the stable exercise id and
deliberately does **not** write `wgerUuid` onto the seed records. `wgerUuid` is
the wger importer's upsert key (`importer.ts` §"Identity"), so setting it would
hand each seed's name, category, muscles, equipment and difficulty to the next
import — e.g. "Bench Dip" would be renamed "Dips Between Two Benches" and its
equipment recomputed. Media reuse must not change exercise identity or plan
selection inputs.

**Review method.** Every candidate image was opened at full resolution and
checked against the seed's name, equipment list and category. Name similarity
alone was never sufficient — two candidates were rejected because the picture
showed a different movement than its wger title claimed.

**Reviewer.** Claude (Opus 5), automated agent, technical and content-match
review only.

> **Form-safety sign-off is still OUTSTANDING for this batch.** Per
> `workout-media-review-checklist.md` and plan Task 6, a qualified human must
> confirm each demonstration before it is treated as form guidance. Every image
> below is an upstream community asset shown with its own attribution, not
> AquaZeroFit-authored instruction, but the checklist gate is not satisfied by
> this log alone.

### Accepted — 14

| Exercise | wger source | Notes |
| --- | --- | --- |
| ex-decline-push-up | Push-Ups \| Decline | Anatomical render, feet on bench; start and finish in one frame. |
| ex-reverse-lunge | Reverse lunges | Photographic sequence, bodyweight, matches seed equipment. |
| ex-chair-dip | Dips Between Two Benches | Line drawing; seed already requires a bench. |
| ex-db-goblet-squat | Dumbbell Goblet Squat | Photograph, single dumbbell at chest. |
| ex-db-romanian-deadlift | Dumbbell Romanian Deadlift | Anatomical render, hinge and lockout; 1200×630 fits the media box exactly. |
| ex-db-bench-press | Dumbbell Floor Press | Photograph, knees bent, floor press. Exact name match. |
| ex-db-overhead-triceps | Triceps Overhead (Dumbbell) | Anatomical render, triceps highlighted. |
| ex-db-lateral-raise | Lateral Raises | Chose the raised-arm frame; the sibling frame shows only the rest position. |
| ex-plank | Plank | Forearm plank, neutral spine, 1800×656. |
| ex-russian-twist | Russian Twist | **Caveat:** depicts an optional medicine ball; the seed lists no equipment. |
| ex-leg-raise | Leg Raises, Lying | Chose the top-of-rep frame. |
| ex-jumping-jacks | Jumping Jacks | Upstream flags this AI-generated; `isAiGeneratedMedia` disclosure is preserved. |
| ex-hip-flexor-stretch | Hip Flexor Stretch | Photograph, half-kneeling on a mat. |
| ex-worlds-greatest-stretch | Lunge with Twist Stretch | Photograph, half-kneeling lunge with thoracic rotation. |

### Rejected — 14

| Exercise | wger candidate | Reason |
| --- | --- | --- |
| ex-push-up | Push-Up | Image is plainly AI-generated cartoon art (superhero in a space station) but is flagged `isAiGenerated: false` upstream. Shipping it would publish an inaccurate AI disclosure. Also 2.4 MB and off-brand. |
| ex-diamond-push-up | Close-grip Press-ups | **Wrong movement.** The photograph shows hands at shoulder width, not a diamond or close grip. |
| ex-db-bent-over-row | Bent Over Dumbbell Rows | **Wrong movement.** The illustration shows a single-arm bench-supported row, not a two-arm bent-over row. |
| ex-bulgarian-split-squat | Bulgarian split squats left | Spanish muscle labels baked into the image; the style guide forbids baked-in text. Also adds dumbbells the seed does not list, and is 474 px wide. |
| ex-db-shoulder-press | Shoulder Press, Dumbbells | Seated on a bench (seed lists dumbbells only), and 578×960 portrait would crop the dumbbells out of a 16:9 card. |
| ex-db-reverse-fly | Rear Delt Raises | Incline-bench supported; the seed lists no bench. |
| ex-db-bicep-curl | Biceps Curls With Dumbbell | Shows only the arms-down rest position — teaches nothing — at 800×1766. |
| ex-db-hammer-curl | Hammer Curls | Same drawing and same problems as the bicep curl candidate. |
| ex-calf-raise | Standing Calf Raises | 244×207; unusable at card size. Also adds dumbbells and a platform. |
| ex-band-glute-kickback | rubber band glute kickback | Correct movement, but 258×157. Too small to display. |
| ex-db-single-arm-row | Single arm row | 7.9 MB PNG — 13× the transfer budget. |
| ex-step-up | Step-ups | 3.4 MB PNG. |
| ex-high-knees | High knees | 3.1 MB PNG. |
| ex-pike-push-up | Pike Push Ups | 2.4 MB PNG. |

### Follow-ups

- The last four rejections are **correct, appropriately licensed images that
  are simply too large**. Downscaling them to WebP inside the 600 KB budget
  would add four more exercises, including two Tier 0/1 movements. That
  produces a derivative work, which CC-BY-SA permits with share-alike and
  attribution preserved, but it is a separate decision and a separate batch.
- One wger "Plank" asset in that exercise's image group does not depict a plank
  (grey silhouettes performing a different movement). It was not selected. No
  upstream correction was filed.
