# Workout Media Review Checklist

Use one copy of this record per candidate asset. A collection-level sign-off does not replace individual review.

## Review status

- Stable exercise ID or wger UUID:
- Exercise name:
- Candidate asset path:
- SHA-256:
- Sequence:
- Frame role: primary / start / finish / category fallback
- Asset class: category fallback / exercise demonstration
- Review decision: pending / changes requested / rejected / approved
- Decision date (`YYYY-MM-DD`):

An asset is **not approved** while any required field is blank, marked unknown/TBD, or has an unchecked release gate.

## Provenance and rights

- Owner or source:
- Creator:
- Creation/acquisition date (`YYYY-MM-DD`):
- Creation method: manual illustration / photography / AI-generated / AI-assisted
- AI-generated displayed pixels: yes / no
- Model or tool and version, if applicable:
- Prompt/source reference, if applicable:
- Licence:
- Licence URL, if third-party:
- Required attribution text:
- Licence author:
- Consent/model release reference, if a real identifiable person appears:

Checks:

- [ ] The source and ownership are verifiable.
- [ ] The licence permits the intended commercial, derivative, and distribution use.
- [ ] Required attribution is exact and can be shown in the existing detail flow.
- [ ] A real identifiable person has an appropriate release.
- [ ] The asset is not copied from search results, social media, a competitor, or an unlicensed reference.
- [ ] AI status is true when a generative model produced any displayed pixels.
- [ ] This asset cannot be mistaken for wger-owned media or overwrite wger attribution.

Failure of any rights or provenance check is an automatic rejection.

## Exercise identity

- Intended category: strength / cardio / core / mobility
- Intended equipment:
- Intended view: front / side / rear / three-quarter
- Exercise description or approved form reference:

Checks:

- [ ] The stable identifier, name, category, and media assignment all refer to the same exercise.
- [ ] The pictured equipment exactly matches the exercise record.
- [ ] The frame role and manifest order are correct.
- [ ] A category fallback communicates only its category and does not imitate a specific exercise.
- [ ] A demonstration is specific enough to distinguish this exercise from close variations.

## Fitness-form safety review

To be completed by a named qualified human reviewer for every demonstration. Category fallbacks mark this section not applicable and must pass the “not technique-specific” check above.

- Form-safety reviewer:
- Reviewer qualification/role:
- Review date (`YYYY-MM-DD`):
- Reference standard used:

### Whole-body and setup

- [ ] Athlete setup and orientation match the exercise.
- [ ] Head, neck, spine, pelvis, and ribcage are plausibly aligned for the depicted phase.
- [ ] Shoulders, elbows, wrists, hips, knees, and ankles are anatomically plausible.
- [ ] Stance, grip, and contact points are visible where safety depends on them.
- [ ] Required range of motion is neither exaggerated nor misleading.
- [ ] Balance and centre of mass are credible.
- [ ] Clothing and crop do not hide safety-critical joints or contact points.

### Equipment and environment

- [ ] Equipment count, shape, scale, load, and placement are physically plausible.
- [ ] Hands, feet, and body contact the equipment correctly.
- [ ] Benches, mats, walls, anchors, or raised surfaces are stable and correctly used.
- [ ] Resistance bands have a credible anchor, path, attachment, and tension.
- [ ] Dumbbells/weights do not float, merge, duplicate, or change geometry.
- [ ] Floor and landing area are level, dry, clear, and appropriate.

### Movement-specific risk

- [ ] The pose does not show obvious joint collapse, unsafe spinal loading, neck loading, or uncontrolled range.
- [ ] Loaded movement does not imply a hazardous bar, dumbbell, or band path.
- [ ] Jumping/landing movement shows credible soft landing mechanics and clear space.
- [ ] Unilateral movement clearly identifies the working/supporting side without impossible asymmetry.
- [ ] Start and finish frames depict the same athlete, setup, camera side, equipment, and environment.
- [ ] The image makes no injury-prevention, treatment, guaranteed-result, or universal-suitability claim.

### AI-specific defects

Complete when AI-generated displayed pixels is yes:

- [ ] Correct number and structure of limbs, hands, feet, fingers, and joints.
- [ ] No fused, duplicated, detached, or occluded anatomy.
- [ ] No impossible shadows, reflections, floor contact, or perspective.
- [ ] No duplicated, discontinuous, or body-intersecting equipment.
- [ ] No inconsistent identity, clothing, anatomy, or equipment between frames.
- [ ] The reviewer can confidently explain the depicted position without guessing around an artifact.

Any unsafe, impossible, ambiguous, or concealed form is an automatic rejection to the category fallback.

## Brand and visual review

- Brand reviewer:
- Review date (`YYYY-MM-DD`):

Checks:

- [ ] Uses only the existing Modern Aquatic Wellness palette.
- [ ] Background is restrained, uncluttered, and compatible with dark UI surfaces.
- [ ] Aqua/sea-green cues are sparse and do not compete with form.
- [ ] The image does not use the CTA gradient, decorative error colours, or an unapproved palette.
- [ ] Athlete and equipment have sufficient tonal separation from the background.
- [ ] Camera angle and perspective support instruction rather than drama.
- [ ] Clothing is neutral, non-branded, non-sexualized, and does not hide form.
- [ ] No logo, watermark, baked-in label, rep count, or UI text appears.
- [ ] The asset avoids body judgement, before/after framing, and unrealistic fitness promises.
- [ ] The collection remains inclusive without stereotyping users or changing the form standard.

## Crop and mobile review

- Technical/mobile reviewer:
- Review date (`YYYY-MM-DD`):

Source checks:

- [ ] Source is exactly 1600×900 and sRGB.
- [ ] Essential anatomy, contact points, and equipment fit inside x=400–1200 and y=50–850.
- [ ] Outer crop area contains only non-essential ambience.
- [ ] Orientation is normalized and does not depend on EXIF.

Rendered checks:

- [ ] 64×64 center crop: exercise silhouette/equipment remains recognizable.
- [ ] 2:1 variation crop: athlete and distinguishing variation remain visible.
- [ ] 16:9 detail hero: complete reviewed position remains visible.
- [ ] 16:9 guided-workout hero: complete reviewed position remains visible.
- [ ] Multi-frame strip: each 256 px-wide frame is understandable on its own and in order.
- [ ] 320 px Telegram viewport: no critical detail becomes unreadable or hidden.
- [ ] 448 px app viewport: composition remains balanced without relying on desktop space.
- [ ] No required information sits at the bottom edge near sticky controls/safe areas.
- [ ] Crop uses the current centered `object-cover` behavior; approval does not assume a custom focal point.

## Accessibility and content review

- Proposed alt text:
- Proposed caption/frame label, if multiple images:

Checks:

- [ ] Demonstration alt text names the exercise and, when needed, the frame role.
- [ ] Alt text is concise and does not repeat “image of”.
- [ ] Alt text does not describe appearance, gender, or body size unless instructionally necessary.
- [ ] A category fallback is marked decorative rather than announced as a demonstration.
- [ ] Start/finish order is available in HTML and is not communicated by colour alone.
- [ ] AI disclosure is enabled when required.
- [ ] Licence attribution remains visible in the exercise detail flow.
- [ ] The image contains no text that a screen reader would miss.

## File and delivery review

- File format:
- Pixel dimensions:
- Encoded file size:
- Local runtime URL:

Checks:

- [ ] WebP is used, or PNG transparency has a documented reason.
- [ ] File is under the 250 KB target, or the exception is documented.
- [ ] File does not exceed the 400 KB hard limit.
- [ ] EXIF, GPS, embedded thumbnails, comments, and unused metadata are removed.
- [ ] No animation or video is introduced.
- [ ] Local `/uploads` path resolves to the reviewed binary.
- [ ] File hash matches the hash recorded above.
- [ ] Filename follows `<stable-id>/<stable-id>-<sequence>-<view>.<ext>`.
- [ ] Image is sharp at source size without obvious upscaling, banding, halos, or crushed safety-critical detail.
- [ ] First ordered frame is useful without later frames loading.

## Surface acceptance

Verify in the real app after integration:

- [ ] Exercise library shows the intended image or deliberate fallback.
- [ ] Exercise detail sheet shows correct frame order, alt text, AI disclosure, and attribution.
- [ ] Variation card crop remains distinguishable.
- [ ] Workout overview shows the intended 64×64 crop.
- [ ] Guided workout shows the intended 16:9 frame.
- [ ] Slow load reserves the media area without disruptive layout shift.
- [ ] Missing URL, 404, and corrupt media all reach the existing icon/CSS fallback.
- [ ] No new browser console error or accessibility warning appears.
- [ ] Workout selection, workout state, logging, and user data are unchanged.

## Reviewer sign-off

Technical/mobile:

- Name:
- Decision: approved / changes requested / rejected
- Date:
- Notes:

Form safety:

- Name:
- Qualification/role:
- Decision: approved / changes requested / rejected / not applicable to category fallback
- Date:
- Notes:

Content/licensing:

- Name:
- Decision: approved / changes requested / rejected
- Date:
- Notes:

Final release owner:

- Name:
- Decision: approved / changes requested / rejected
- Date:
- Notes:

## Rejection or change record

- Failed check(s):
- User/safety impact:
- Required change:
- Replacement candidate path/hash:
- Re-review required from:
- Intentional fallback selected: yes / no

Rejected binaries must not appear in the curated manifest. Keep the approved category/icon fallback until a replacement passes a new review against its exact binary hash.

## Tier 0 tracking table

This is a recommendation and tracking aid, not approval. Populate media status from the read-only coverage audit; do not infer it from filenames or exercise names.

| Batch | Stable ID | Exercise | Audit status | Proposed disposition | Review status |
| --- | --- | --- | --- | --- | --- |
| A | `ex-band-chest-press` | Band Chest Press | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| A | `ex-band-row` | Seated Band Row | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| A | `ex-db-goblet-squat` | Dumbbell Goblet Squat | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| A | `ex-reverse-lunge` | Reverse Lunge | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| A | `ex-plank` | Plank | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| B | `ex-jumping-jacks` | Jumping Jacks | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| B | `ex-skater-jump` | Skater Jump | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| B | `ex-shadow-boxing` | Shadow Boxing | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| B | `ex-bicycle-crunch` | Bicycle Crunch | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| C | `ex-push-up` | Push-Up | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| C | `ex-db-lateral-raise` | Dumbbell Lateral Raise | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| C | `ex-diamond-push-up` | Diamond Push-Up | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| C | `ex-db-bicep-curl` | Dumbbell Bicep Curl | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| D | `ex-band-squat` | Band Squat | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| D | `ex-glute-bridge` | Glute Bridge | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| D | `ex-db-romanian-deadlift` | Dumbbell Romanian Deadlift | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| D | `ex-calf-raise` | Standing Calf Raise | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| D | `ex-mountain-climber` | Mountain Climber | Pending audit | Retain valid wger; otherwise review curated or fallback | Not reviewed |
| E | `ex-hip-flexor-stretch` | Half-Kneeling Hip Flexor Stretch | Pending audit | Mobility presentation specimen; fallback unless reviewed | Not reviewed |

