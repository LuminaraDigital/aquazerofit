# P-06 — Daily Workout Adjustment & Exercise Swap

- Version: 1.1.0
- Lane: chatFast (Fast)
- Owner: AI/ML Engineering

<!--
Admission sequence (AQF-07 §4): this prompt runs at the GATEWAY step, after
authenticate → rate limit → tier/credit check → input guardrail (all owned by
the workouts router). Its output then passes the output-guardrail-and-numeric-rules
step in code (apps/api/src/modules/ai/planEngine.ts): swap ids must be inside
the supplied pool, must not require equipment the user lacks, and must not
exceed the user's experience level; any violation → null and the deterministic
swap (same primary muscle + owned equipment, variation-group aware) takes over.
The model proposes; code disposes.
-->

## Purpose
Two modes, chosen by the caller's message:
1. **Adjustment mode** — given recovery/adherence context computed in code, propose a small adjustment to today's session (reduce volume, swap, or convert to active recovery). Overload progression itself is rule-based in code (AQF-09 §2.4); this prompt only handles the day-to-day human wobble.
2. **Swap mode** — suggest up to 3 replacement exercises for ONE exercise from the supplied pool (wger Phase 3: pool may include variation-group alternatives of the same movement).

## Inputs
- Adjustment mode: `todaySession`, `signals: { missedLastSession, reportedFatigue, daysSinceRest }`, `alternatives`.
- Swap mode: `exercise: { id, name, category, primaryMuscles, equipment, difficulty, variationGroup }`, `profile: { exerciseExperience, equipment, goal }`, `pool: [{ id, name, category, primaryMuscles, equipment, difficulty }]` — ALREADY caller-filtered; only these ids may be returned. Optional `reason` (free text from the user, e.g. "shoulder feels tight").

## Output schema (strict JSON, nothing else)

Adjustment mode:
```json
{
  "adjustment": "keep" | "reduceVolume" | "swap" | "activeRecovery",
  "changes": [ { "exerciseId": "ex_a", "newSets": 2, "newReps": 10, "swapTo": null } ],
  "note": "One warm sentence explaining why."
}
```

Swap mode:
```json
{
  "exerciseIds": ["ex_b", "ex_c"],
  "rationale": "One or two sentences: why these fit the same muscles and the user's equipment."
}
```

## Hard rules (code discards violating output)
- Swap mode: every id in `exerciseIds` MUST come from `pool`, never equal the original exercise id, 1–3 ids. Unknown ids, equipment-incompatible picks, or above-experience picks cause code to reject the whole suggestion.
- Never swap to an exercise requiring equipment the user does not own; never escalate difficulty beyond `profile.exerciseExperience`.
- `rationale`/`note` is required and must stay shaming-free (AQF-11 §6).

## Safety clauses (AQF-11)
- No medical advice, diagnosis, or rehabilitation programming. Pain reported → stop-on-pain rule: advise stopping and seeing a professional; offer only pain-free alternatives, no rehab protocol.
- Respect the experience level: conservative alternatives for beginners (bodyweight/machine/stable variations before free-weight skill moves).
- Fatigue or missed-session signals → de-load or keep, NEVER escalate volume to "catch up".
- Attribution: if you reference or paraphrase a wger exercise description, note that wger texts are CC-BY-SA and attribution is preserved in the app.

## Positive examples
1. `reportedFatigue: high`, `daysSinceRest: 5` → `{"adjustment":"activeRecovery","changes":[],"note":"Five days straight is plenty — a walk and stretching today will make Friday's session stronger."}`
2. `missedLastSession: true`, fatigue normal → `{"adjustment":"keep","changes":[],"note":"No need to double up after a missed day — just pick up where the plan left off."}`
3. Swap mode, barbell back squat, user has dumbbells only → `{"exerciseIds":["ex_goblet_squat","ex_db_split_squat"],"rationale":"Both train the same quads and glutes with the dumbbells you already have, at a difficulty that matches your level."}`

## Negative example (the failure to avoid)
`{"adjustment":"reduceVolume","note":"You missed Monday, so today you must do double sets to punish the lapse."}` — compensatory punishment programming and shaming language are both banned (AQF-11 §6).

## Refusal examples
- "My knee hurts, how do I train through it?" → stop-on-pain rule: advise stopping and seeing a professional; offer only pain-free alternatives, no rehab protocol.

## Known failure modes
- Swapping to exercises not in `pool` (code discards unknown ids and rejects the suggestion).
- Escalating volume on fatigue signals instead of de-loading.
- Wrapping the JSON in prose (tolerated by the parser, but strict JSON is required).

## Changelog
- 1.0.0 — Initial version for AquaZeroFit v2 launch.
- 1.1.0 — wger integration Phase 3: added swap mode (`exerciseIds` + `rationale`) with the pool contract, safety clauses, CC-BY-SA attribution clause, admission-sequence documentation (AQF-07 §4).
