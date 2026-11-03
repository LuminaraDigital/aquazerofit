# P-05 — Weekly Training Plan Generation

- Version: 1.2.0
- Lane: planStructured (Structured)
- Owner: AI/ML Engineering

<!--
Admission sequence (AQF-07 §4): this prompt runs at the GATEWAY step, after
authenticate → rate limit → tier/credit check → input guardrail (all owned by
the plans router). Its output then passes the output-guardrail-and-numeric-rules
step in code (apps/api/src/modules/ai/planEngine.ts validatePlanDraft) before
anything is persisted or shown: every exerciseId must be in the supplied pool,
days must cover all seven calendar days with exactly daysPerWeek of them
training days, sets/reps/rest/weight/rir obey the shared
zod hard caps, prescribed loads are capped per experience level, and every
progression rule must reference a real slotEntryId. ANY validation failure →
the draft is discarded and the deterministic engine (plans/service buildPlan)
takes over. The model proposes; code disposes.
-->

## Purpose
Generate a weekly training-plan draft (days → slots → entries with sets, reps, rest, optional load/RIR) plus data-form progression rules, from the supplied exercise pool. The pool is pre-filtered in code for the user's equipment and experience (AQF-09 §2.4); the model arranges and explains. With the wger-imported library the pool may hold hundreds of exercises — only the compact fields below are supplied; never assume an exercise exists that is not listed.

## Inputs
- `profile`: `{ exerciseExperience, goal, equipment, weightKg, age, sex }`.
- `daysPerWeek`: integer 1–7 — how many of the seven days are TRAINING days. It is **not** the length of `days`: the draft always describes a full calendar week of seven days, and `7 - daysPerWeek` of them are rest days.
- `pool`: `[{ id, name, category, primaryMuscles, equipment, difficulty }]` — ALREADY equipment/experience-safe. Only these ids may appear in the output.

## Output schema (strict JSON, nothing else — no prose, no markdown fences)
```json
{
  "name": "string, <= 80 chars",
  "days": [
    {
      "order": 1,
      "focus": "Full Body Strength",
      "isRest": false,
      "slots": [
        {
          "order": 1,
          "entries": [
            {
              "id": "se-1-1",
              "exerciseId": "ex_squat",
              "sets": 3,
              "reps": 12,
              "restSeconds": 60,
              "weightKg": null,
              "rir": 3,
              "repsMax": null,
              "notes": "optional, <= 280 chars"
            }
          ]
        }
      ]
    }
  ],
  "progressionRules": [
    {
      "slotEntryId": "se-1-1",
      "kind": "weight | reps | sets | rest | rir",
      "iteration": 2,
      "value": 14,
      "op": "add | subtract | replace",
      "step": "abs | percent",
      "repeat": false,
      "requires": ["reps"]
    }
  ],
  "rationale": "string, <= 2000 chars, required — explain the structure in plain words"
}
```

## Hard rules (code rejects the whole draft on any violation)
- `days` MUST hold exactly SEVEN entries with `order` 1–7, each appearing once — a whole calendar week, not a list of sessions.
- Exactly `daysPerWeek` of those seven have `isRest: false`; the other `7 - daysPerWeek` have `isRest: true` and EMPTY `slots`. A training day has at least one slot.
- Every `exerciseId` MUST be an id from `pool`. Every entry `id` is unique across the draft.
- Caps: sets 1–20, reps 1–100, rest 0–900 s, weightKg 0–1000 (null = bodyweight/not prescribed), rir 0–9.5 in 0.5 steps, repsMax ≥ reps when set.
- Every `progressionRules[].slotEntryId` MUST reference an entry `id` present in this draft. `op` absent or `replace` means `value` is an absolute target (same caps as prescriptions); with `add`/`subtract` it is a delta.
- Keep at least 48 h between sessions hitting the same muscle group when the weekly layout allows it.

## Safety clauses (AQF-11)
- No medical advice, diagnosis, injury rehabilitation, or pain workarounds. If a user context hints at injury or illness, keep loads conservative and say to see a professional in `rationale` — never program around pain.
- Respect `profile.exerciseExperience`: beginners get bodyweight or `weightKg: null` by default, higher RIR (2.5–4), no failure sets, no advanced techniques (dropsets, forced reps), and rest days spread through the week rather than bunched at the end. Prescribe conservative loads; never near-maximal weights for beginners.
- Progression rules must be gentle: reps before load, single-variable changes per iteration.
- Attribution: if you reference or paraphrase an exercise description from the pool (wger-sourced), note in `rationale` that wger exercise texts are CC-BY-SA and their attribution is preserved in the app — never present them as original AquaZeroFit content.

## Positive examples
1. Beginner, no equipment, `daysPerWeek: 3` → seven days, orders 1–7: three full-body training days (say orders 1, 3, 5) with bodyweight-only entries (`weightKg: null`, `rir: 3`), and four rest days (orders 2, 4, 6, 7) with `isRest: true` and `slots: []`. One `reps`-kind replace rule per training day at iteration 2.
2. Intermediate, dumbbells + bench, `daysPerWeek: 4`, strength goal → seven days, orders 1–7: four training days in an upper/lower split with 75–90 s rests, three rest days with empty slots. `weightKg` prescribed only as conservative absolute values, progression `op: "add"` on `reps` with `requires: ["reps"]` (double progression).

## Negative example (the failure to avoid)
A beginner draft prescribing 1000 kg squats, seven consecutive max-effort days, or progression rules pointing at invented slotEntryIds — the deterministic validator discards all of these and the deterministic engine takes over (AQF-11 §2).

## Refusal examples
- "Plan through an ankle injury" → no rehabilitation programming; signpost a physiotherapist and offer upper-body-only alternatives once cleared.

## Known failure modes
- Returning `daysPerWeek` days instead of seven. `days` is always a full week; `daysPerWeek` counts only the training days inside it.
- Ignoring `daysPerWeek` and always producing 4 training days.
- Assigning equipment the user does not own (pool filtering is the first net; code validation is the second).
- Wrapping the JSON in prose or markdown fences (tolerated by the parser, but strict-JSON output is required).
- Omitting `rationale` — the draft is rejected without it.

## Changelog
- 1.0.0 — Initial version for AquaZeroFit v2 launch.
- 1.1.0 — wger integration Phase 3: full draft contract (entry ids, load/RIR targets, data-form progression rules with op/step/requires), days.length == daysPerWeek, explicit caps, safety clauses, CC-BY-SA attribution clause, admission-sequence documentation (AQF-07 §4).
- 1.2.0 — `days` is a seven-day calendar week and `daysPerWeek` counts the training days within it. Corrects a contract split that made this lane unusable: 1.1.0 asked for `days.length == daysPerWeek` and `planEngine.validatePlanDraft` enforced that, but `plans/service.aiDraftIsValid` — the second gate, matching the deterministic `buildPlan` the app actually renders — required seven days with `daysPerWeek` non-rest. Only `daysPerWeek == 7` could satisfy both, and `generatePlanSchema` caps the field at 6, so every draft this lane produced was validated, rejected and thrown away after the tokens had been spent.
