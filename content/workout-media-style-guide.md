# AquaZeroFit Workout Media Style Guide

## Status and scope

This guide is the release contract for workout category fallbacks and curated exercise demonstrations. It applies to media shown in the exercise library, exercise detail sheet, workout overview, variation cards, and guided workout.

It does not approve any asset. An asset is eligible for the curated-media manifest only after it has a completed record in `content/workout-media-review-checklist.md` and all required reviewers have approved it.

The guide is grounded in:

- `Figma_aquazerofit_wellness_platform/modern_aquatic_wellness/DESIGN.md`
- `apps/web/src/pages/training/WorkoutLibrary.tsx`
- `apps/web/src/pages/training/WorkoutDetail.tsx`
- The mobile-first, `max-w-md` Telegram Mini App shell and its safe-area handling

## Product intent

Workout media must answer one of two questions clearly:

1. **What type of activity is this?** Category fallback art may answer this. It is decorative and must not teach a specific technique.
2. **What does this exercise look like?** Only reviewed demonstration media may answer this.

Do not use a category fallback that resembles a specific exercise. Do not use generic fitness photography as a form demonstration. When a safe movement cannot be communicated in one still, use two separately reviewed ordered images, such as start and finish, rather than a composite pose or motion trail.

Existing valid wger media and attribution remain authoritative. This guide governs newly created AquaZeroFit media and does not authorize replacement of valid upstream media.

## Visual direction

The visual system is **Modern Aquatic Wellness**: calm, technically precise, premium, and mobile-legible.

### Required palette

Use existing design tokens only:

| Role | Token | Value |
| --- | --- | --- |
| Base background | `surface` | `#0e1416` |
| Quiet background | `surface-container-low` | `#161d1e` |
| Elevated background | `surface-container-high` | `#242b2d` |
| Primary cue | `primary` | `#8aebff` |
| Secondary cue | `secondary` | `#45dfa4` |
| Main light neutral | `on-surface` | `#dde4e5` |
| Muted neutral | `on-surface-variant` | `#bbc9cd` |
| Boundary neutral | `outline-variant` | `#3c494c` |

Keep aqua and sea green subordinate to the athlete and equipment. Do not introduce a new palette, use the CTA gradient inside media, or use coral/error colours as decoration. A cue that communicates position, direction, or target area must not rely on colour alone; its shape and placement must remain understandable in grayscale.

### Athlete, environment, and camera language

- Use an uncluttered dark studio or restrained illustration background with gentle tonal depth.
- Keep the floor plane or contact surface visible whenever balance, stance, or equipment contact matters.
- Use neutral, non-branded clothing that contrasts with both the body silhouette and background.
- Avoid sexualized framing, dramatic bodybuilding poses, extreme muscle definition, wellness before/after imagery, and body-shape judgement.
- Represent a credible range of bodies, skin tones, ages, and genders across the collection without changing the technique standard.
- Keep body proportions, hands, feet, joints, equipment, shadows, and reflections anatomically and physically plausible.
- Use a level camera and natural lens perspective. Avoid fisheye distortion, extreme wide angle, Dutch angles, overhead glamour shots, and shallow focus that hides form.
- Prefer a side or three-quarter view when joint alignment, spinal position, or equipment path is important. Use a front view only when symmetry or lateral position is the primary teaching point.
- Maintain a consistent viewpoint for the start and finish frames of one exercise.

No logo, watermark, UI, caption, rep count, arrow label, or exercise name may be baked into the image. Accessible labels, sequencing, AI disclosure, and attribution belong in HTML.

## Asset classes

### Category fallback art

Create one fallback for each category: strength, cardio, core, and mobility.

Fallbacks:

- Communicate category through abstract equipment/silhouette motifs and the established aquatic palette.
- Must not depict a technically specific start or finish position.
- Must be clearly distinct from reviewed demonstrations.
- Are decorative. The UI should expose the exercise name in text and hide the fallback image from assistive technology.
- Need to remain recognizable at 64×64 without depending on fine lines or small accents.

### Exercise demonstration stills

Demonstrations:

- Show the named exercise, named equipment, and reviewed position exactly.
- Use one still for a safely recognizable static position or one representative phase.
- Use two ordered stills when both start and finish are required for safe interpretation.
- Must not imply animation, tempo, load, range, or direction that the image cannot establish.
- May use restrained non-textual floor/contact or direction cues only when those cues cannot be confused with equipment or anatomy.

An exercise with no approved demonstration must continue to use its category fallback. “No asset” is safer than an inaccurate asset.

## Master composition and crop contract

### Source master

- Canvas: exactly 1600×900 pixels (16:9).
- Colour: sRGB.
- Orientation metadata: normalized; pixels must display correctly without EXIF orientation.
- Main subject: centered horizontally and vertically within the action-safe region.
- Outer edges: quiet background only; do not place required anatomy or equipment there.

### Action-safe regions

The current UI uses `object-cover` in both 16:9 heroes and 64×64 thumbnails. A centered square crop of a 1600×900 source retains only x=350 through x=1250. Therefore:

- **Square crop-safe region:** the central 900×900 area, x=350–1250 and y=0–900.
- **Action-safe region:** keep all essential anatomy, contact points, and required equipment inside the central 800×800 area, x=400–1200 and y=50–850.
- Decorative ambience may extend outside the square crop-safe region.
- Do not assume a custom focal point; the current components use centered `object-cover`.

Review the source at all current display shapes:

| Surface | Current shape | Minimum review viewport | What must survive |
| --- | --- | --- | --- |
| Library row | 64×64, 1:1 | 320 px app viewport | Recognizable silhouette and required equipment |
| Workout overview | 64×64, 1:1 | 320 px app viewport | Same as library row |
| Variation card | 2:1 (`w-32 h-16`) | 320 px app viewport | Athlete, equipment, and variation distinction |
| Detail single image | 16:9, full width | 320 px app viewport | Complete reviewed position |
| Detail image strip | 16:9 (`w-64`) | 320 px app viewport | Frame sequence remains individually understandable |
| Guided workout | 16:9, full width | 320 px app viewport | Complete reviewed position without competing detail |

At the app’s narrowest supported review width of 320 px, 20 px side margins leave an approximately 280×158 hero. Avoid facial detail, small annotations, or subtle joint cues that disappear at that size.

## Telegram Mini App constraints

- Treat 320 px as the minimum QA width and 448 px (`max-w-md`) as the normal maximum content width.
- Keep the focal action central so Telegram viewport changes, browser chrome, bottom navigation, and safe-area insets cannot obscure it.
- Do not place information near the bottom edge of an image where a user may associate it with sticky controls.
- Prefer a single strong subject and low visual noise for small webviews and outdoor viewing.
- Assets must be local and independently cacheable; do not add remote image hosts, runtime generation, or hotlinks.
- Preserve the current lazy-loading behavior. The first still must be useful without loading later frames.
- Avoid animated formats and video in this rollout. They add memory, bandwidth, motion preferences, controls, and captioning requirements.

## Fitness-form safety standard

Every demonstration must pass a movement-specific review by a qualified human reviewer before release. Review is for the exact depicted exercise, not merely for visual quality.

At minimum, verify:

- The athlete’s setup, stance, grip, joint stacking, spinal position, range, and finish match the exercise description.
- Every load is plausible and symmetrically represented unless the exercise is intentionally unilateral.
- Hands and feet visibly contact the correct surface or equipment.
- Benches, bands, dumbbells, mats, ropes, walls, and anchor points are present and physically usable where required.
- Bands have credible anchor points, tension, routing, and attachment; they do not pass through the body or environment.
- Weights have consistent geometry and do not float, merge, multiply, or change between frames.
- The floor and any raised surface appear stable, dry, level, and unobstructed.
- No joint is shown in an obviously hazardous or impossible position.
- The image does not encourage excessive range, ballistic loading, unsafe landing, neck loading, lumbar overextension, knee collapse, or unstable balance.
- Start and finish frames belong to the same movement, equipment setup, camera side, athlete presentation, and environment.

Reject an image if a reviewer cannot confidently determine the form from the full-resolution source. Cropping, blur, darkness, clothing, or props must not conceal a safety-critical area.

AI-generated media receives the same review plus explicit checks for extra/missing digits or limbs, fused joints, asymmetric anatomy, impossible shadows, duplicated equipment, discontinuous bands, and inconsistent start/finish identity. If any displayed demonstration frame was AI-generated, the exercise record must retain `isAiGeneratedMedia: true` so the existing disclosure remains visible.

The image is supportive content, not a substitute for coaching or medical advice. Do not visually claim injury prevention, treatment, guaranteed results, or suitability for every user.

## Accessibility and content rules

- Demonstration images are informative. Use concise alt text based on the exercise and frame, for example `Push-Up start position` and `Push-Up lowered position`.
- A single representative image may use `[Exercise name] demonstration`.
- Do not put “image of” or provenance in alt text.
- Category fallbacks are decorative because the adjacent exercise name already carries meaning. Use an empty alt value or an `aria-hidden` wrapper; do not announce “strength fallback”.
- When multiple frames are necessary, captions or adjacent HTML must establish their order. Do not encode “start” and “finish” only with colour.
- Maintain visible AI disclosure and licence attribution outside the image.
- Do not use the athlete’s appearance, gender, or body size in alt text unless it is necessary to distinguish instructional content.

## File and delivery constraints

| Property | Requirement |
| --- | --- |
| Preferred format | WebP |
| PNG | Only when transparency is required and documented |
| Source size | 1600×900 |
| Target encoded size | Under 250 KB per still |
| Hard encoded limit | 400 KB per still |
| Metadata | Strip EXIF, GPS, thumbnails, comments, and unused profiles |
| Runtime path | Local `/uploads` asset |
| Animation | Not allowed in this rollout |
| Text/watermark | Not allowed |

Do not upscale a visibly soft source to meet dimensions. Reject severe banding, compression halos around limbs/equipment, crushed dark detail, or a file that only looks correct on a wide desktop.

## Naming convention

Use a stable exercise identifier, never the display name alone:

```text
<stable-exercise-id>/<stable-exercise-id>-<sequence>-<view>.webp
```

Examples:

```text
ex-push-up/ex-push-up-01-side.webp
ex-push-up/ex-push-up-02-side.webp
ex-plank/ex-plank-01-side.webp
```

Rules:

- Lowercase ASCII letters, numbers, and hyphens only.
- Sequence starts at `01` and matches manifest order.
- Approved view labels are `front`, `side`, `rear`, and `three-quarter`.
- Do not include “final”, dates, reviewer names, model names, or mutable exercise titles in filenames.
- A replacement that intentionally invalidates caches must use the project’s manifest/version mechanism; do not improvise filename suffixes.

## Required provenance record

Every candidate asset must carry these fields before review:

| Field | Required content |
| --- | --- |
| Stable exercise ID or wger UUID | Exact immutable target |
| Exercise name | Human-readable cross-check only |
| Asset path | Local path relative to the curated asset root |
| Sequence and frame role | Primary/start/finish and display order |
| Asset class | Category fallback or exercise demonstration |
| Ownership/source | Creator or source collection |
| Creation method | Manual illustration, photography, AI-generated, or AI-assisted |
| AI status | Boolean; true if any generative model produced displayed pixels |
| Model/tool and version | Required when AI status is true |
| Prompt/source references | Internal reference sufficient to reproduce/audit |
| Licence | Exact licence or AquaZeroFit-owned |
| Licence URL | Required for third-party licensed work |
| Licence author | Exact credit where required |
| Creation/acquisition date | ISO `YYYY-MM-DD` |
| File hash | SHA-256 of the reviewed binary |
| Technical reviewer/date | Named reviewer and ISO date |
| Form-safety reviewer/date | Named qualified reviewer and ISO date |
| Content/licensing reviewer/date | Named reviewer and ISO date |
| Decision | Approved, rejected, or changes requested |
| Review notes | Specific evidence, defects, or limitations |

Blank, unknown, “TBD”, or assumed provenance is not approval.

## Concrete Tier 0 pilot recommendation

Tier 0 is a **coverage scope**, not a request to create 19 new images. The media audit must first retain valid wger media and identify only the gaps that need curated demonstrations or intentional category fallbacks.

The deterministic demo account’s current four-day general plan resolves to 18 unique exercises. Review them in user-flow order, in batches of no more than ten:

### Batch A — first workout and first guided-session path

1. `ex-band-chest-press` — Band Chest Press
2. `ex-band-row` — Seated Band Row
3. `ex-db-goblet-squat` — Dumbbell Goblet Squat
4. `ex-reverse-lunge` — Reverse Lunge
5. `ex-plank` — Plank

### Batch B — cardio and core day

1. `ex-jumping-jacks` — Jumping Jacks
2. `ex-skater-jump` — Skater Jump
3. `ex-shadow-boxing` — Shadow Boxing
4. `ex-bicycle-crunch` — Bicycle Crunch

`ex-plank` repeats in this day and must reuse the same approved media assignment.

### Batch C — upper-body day

1. `ex-push-up` — Push-Up
2. `ex-db-lateral-raise` — Dumbbell Lateral Raise
3. `ex-diamond-push-up` — Diamond Push-Up
4. `ex-db-bicep-curl` — Dumbbell Bicep Curl

`ex-band-row` repeats and must reuse the same approved media assignment.

### Batch D — lower-body day

1. `ex-band-squat` — Band Squat
2. `ex-glute-bridge` — Glute Bridge
3. `ex-db-romanian-deadlift` — Dumbbell Romanian Deadlift
4. `ex-calf-raise` — Standing Calf Raise
5. `ex-mountain-climber` — Mountain Climber

### Batch E — mobility presentation specimen

1. `ex-hip-flexor-stretch` — Half-Kneeling Hip Flexor Stretch

The mobility specimen is included because the current demo plan does not contain a mobility slot, but the pilot must validate the fourth category’s fallback/detail presentation. It remains a category fallback unless an individually reviewed demonstration is justified.

For every item above, the release choice is one of:

1. Retain valid reviewed wger media.
2. Add reviewed curated media if valid upstream media is unavailable.
3. Use the approved category fallback intentionally.

No choice is pre-approved by this document. Final status depends on the coverage audit, provenance validation, crop review, and human form-safety sign-off.

## Release gate

An asset may enter the curated manifest only when:

- The stable exercise identifier matches.
- Provenance and licence fields are complete.
- The reviewed binary hash matches the delivered file.
- Technical, mobile crop, accessibility, brand, and fitness-form checks pass.
- AI disclosure state is correct.
- The asset is approved in `content/workout-media-review-checklist.md`.

If any gate fails, keep the existing valid upstream image or category/icon fallback. Do not modify workout plans, exercise selection, workout logging, or user data to work around a media defect.
