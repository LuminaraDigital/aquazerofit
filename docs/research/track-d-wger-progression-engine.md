# Track D Brief — wger Workout/Routine & Progression Engine

## Key Findings

1. **The routine is a "shell" — training data is fully decomposed into a 4-level hierarchy** (Routine → Day → Slot → SlotEntry), with actual target values (weight/reps/sets/RiR/rest) stored in *separate config records*, not on the exercise itself. This is the single most reusable design.
2. **Progression is a deterministic, iteration-indexed rule engine** — records apply from a given `iteration` and stack (`+`/`-`/replace, absolute or %, repeatable). No AI needed; pure math. This maps perfectly to AquaZeroFit's "code calculates/enforces" invariant.
3. **Conditional progression ("requirements")** gates rule application on logged performance in the previous iteration — autoregulation without an ML model.
4. **Two computed schedule modes**: free-running cycle vs. `fit_in_week` (weekly calendar anchoring), plus `need_logs_to_advance` to stall a day until it's actually logged.
5. **Logs snapshot both prescribed and actual values** (`weight`/`weight_target`, etc.), so history survives routine edits.
6. **Pre-computed, cacheable "view" endpoints** (structure, date-sequence-display, date-sequence-gym, logs, stats) separate storage from presentation — a pattern AquaZeroFit's document store + API should adopt.
7. **Body tracking is deliberately minimal**: one WeightEntry model, generic Measurement+Category, date-stamped photo gallery. All trivially portable concepts.

## Concrete Facts

### Routine data model ([routine API docs](https://wger.readthedocs.io/en/latest/api/routines.html), [model files](https://api.github.com/repos/wger-project/wger/contents/wger/manager/models))

```
Routine      /api/v2/routine/          — max duration 120 days; fit_in_week flag
└ Day        /api/v2/day/              — order field; is_rest flag; need_logs_to_advance flag
  └ Slot     /api/v2/slot/             — one position in the day
    └ SlotEntry /api/v2/slot-entry/    — exercise; >1 entry = automatic superset
      ├ WeightConfig       /api/v2/weight-config/       (+ max- variant for ranges)
      ├ RepetitionsConfig  /api/v2/repetitions-config/  (+ max-)
      ├ SetsConfig         /api/v2/sets-config/         (+ max-)
      ├ RirConfig          /api/v2/rir-config/          (+ max-)
      └ RestConfig         /api/v2/rest-config/         (+ max-)
```
History: `WorkoutSession /api/v2/workoutsession/` → `WorkoutLog /api/v2/workoutlog/`. Templates: `/api/v2/templates/` (own), `/api/v2/public-templates/` (shared, read-only). Models: `wger/manager/models/{routine,day,slot,slot_entry,session,log,abstract_config,weight_config,repetitions_config,sets_config,rir_config,rest_config}.py`.

### Progression rules ([`abstract_config.py`](https://raw.githubusercontent.com/wger-project/wger/master/wger/manager/models/abstract_config.py), [routines manual](https://wger.readthedocs.io/en/latest/manual/routines.html))

- `AbstractChangeConfig` fields: `slot_entry` FK, `iteration` (unique_together with slot_entry), `value` (Decimal 6,2; 0–3000), `operation` (`+` / `-` / `r`eplace), `step` (`na`/`abs`/`percent`), `repeat` (bool), `requirements` (JSONField).
- Save-time invariants: iteration 1 is forced to REPLACE; REPLACE forces step=`na`. **Deterministic guardrails in code, not UI.**
- Example from docs: base 50 kg, `+10%` at iter 4, `+2kg` at 6, `+1kg` at 7, reset 45 kg at 8 → 50/50/50/55/55/57/58/45.
- `requirements = {"rules": ["weight","repetitions","rir","rest"]}` — rule applies only if **all** listed fields were met in ≥1 log of the previous iteration (autoregulation / double progression).
- Safety caps in code: `MAX_COMPOUND_VALUE = 9999.99`, `MAX_COMPOUND_RIR = 9.5`; RiR rounded to nearest 0.5 before serialization.
- Rounding per slot entry: `repetition_rounding`, `weight_rounding`, defaults copied from user profile.
- Escape hatch: slot entry `class_name` → custom Python class under `wger.manager.config_calculations` (unused, explicitly discouraged).
- Web-only editor for rules; mobile apps consume computed output.

### Scheduling / sequencing

- Iteration = one full pass through all days. Sequence computed from day order + routine start/end dates.
- `need_logs_to_advance` (per day) stalls on a day until a session is logged; can be set selectively (e.g., only solo days).
- `fit_in_week` (per routine) pads with placeholder rest days so each iteration restarts on the same weekday. Rest days = `is_rest=true`, no slots.

### Computed read endpoints (all server-cached, invalidated on routine change)

- `/api/v2/routine/{id}/structure/` — full nested tree for editors
- `/api/v2/routine/{id}/date-sequence-display/` — date → day → slots, folded sets
- `/api/v2/routine/{id}/date-sequence-gym/` — set-by-set, supersets interleaved (gym-mode view)
- `/api/v2/routine/{id}/logs/` — sessions+logs grouped by session
- `/api/v2/routine/{id}/stats/` — volume, set count, avg intensity (**estimated 1RM via Brzycki formula**), split by day / ISO week / iteration / routine, and by total / upper-lower / muscle / exercise

### Logging model

`WorkoutLog` carries actual (`weight`, `repetitions`, `rir`, `rest`) **and** targets (`weight_target`, `repetitions_target`, `rir_target`, `rest_target`), back-linked to routine, day, slot entry, and iteration.

### Body weight, measurements, gallery (verified sources)

- `WeightEntry` in [`wger/weight/models.py`](https://raw.githubusercontent.com/wger-project/wger/master/wger/weight/models.py): `uuid` (UUID7), `date` (DateTime), `weight` Decimal(5,2) validated 30–600, user FK. That's it.
- `Measurement` in [`wger/measurements/models/measurement.py`](https://raw.githubusercontent.com/wger-project/wger/master/wger/measurements/models/measurement.py): UUID PK, `category` FK to generic `Category` (user-defined measurement types), `date`, `value` Decimal(6,2) 0–5000, `notes`.
- Gallery `Image` in [`wger/gallery/models/image.py`](https://raw.githubusercontent.com/wger-project/wger/master/wger/gallery/models/image.py): `date`, `image` (PNG/JPEG only, validator `validate_image_static_no_animation`), stored height/width, `description` ≤1000 chars; `post_delete`/`pre_save` signals auto-delete files.

### Gym management

- `Gym` model in [`wger/gym/models/gym.py`](https://raw.githubusercontent.com/wger-project/wger/master/wger/gym/models/gym.py): name/phone/email/owner/address only. Multi-user role model is **Django permissions** on the model's Meta: `gym_trainer` (see gym's users), `manage_gym` (manage users), `manage_gyms` (administrate gyms). "Gym mode" in the routine sense is the `date-sequence-gym` computed view above, not the management app.

### License

AGPL-3.0 for all code (headers confirmed in every fetched file); exercise/ingredient data is CC-licensed separately. **No code or prompt copying into proprietary AquaZeroFit** — concepts and schemas only.

## Integration Implications for AquaZeroFit

1. **Adopt "config records per iteration" for P-03 training plans.** AquaZeroFit's zod schemas can model progression as `{field, iteration, value, op: '+'|'-'|'replace', step: 'abs'|'percent', repeat, requires: ['weight','reps',...]}` — validated and executed by `apps/api` code, never by the model. This is exactly your "code enforces, models interpret" invariant: AI (P-04 workout adjustment) *proposes* rules; a deterministic `applyProgression()` resolves them.
2. **Snapshot target + actual on every logged set.** Enables requirement-checking, drift analysis for P-06 progress insights, and history that survives plan edits. Cheap in a document store.
3. **Two-level set containers (Slot/SlotEntry) give supersets/circuits for free**, with interleaving computed at read time — worth copying even for a simpler model.
4. **Separate computed "display" and "gym-mode" payloads.** For a Telegram Mini App, one pre-resolved "today's workout" document (folded, rounded, rest-timed) minimizes client logic and latency.
5. **`need_logs_to_advance` + `fit_in_week`** solve the classic "user skipped a day, schedule drifts" problem deterministically — better than date-anchoring plans that go stale.
6. **Deterministic stats layer** (volume, set count, Brzycki e1RM per week/muscle/exercise) is a trustworthy input for the P-06 progress-insights prompt — model narrates, code computes.
7. **Body tracking**: keep WeightEntry-like minimal model; add generic `Category + Measurement` so waist/BF%/etc. need no schema changes; photo gallery as date-stamped documents with stored dimensions.
8. **Safety caps as hard validators** (wger's MAX_COMPOUND_* pattern) — mirror this in zod schemas so no prompt output can produce absurd loads.
9. Gym management (roles/permissions) is likely **out of scope** for a consumer app, but the permission-tuple pattern is a clean template if trainer/coach mode ever lands.

## Risks / Open Questions

- **AGPL-3.0 contagion**: any code-level reuse or derived schema translation must be treated as off-limits; document that designs were re-derived from docs, not code.
- wger's rule engine assumes *same routine for weeks*; AquaZeroFit's AI-generated plans may change dynamically — need a "re-baseline iteration counter on plan regeneration" policy.
- `requirements` semantics check "at least one log of previous iteration" — verify whether that's strong enough for double progression (wger itself has open UX gaps, e.g. [Discussion #2011](https://github.com/wger-project/wger/discussions/2011) on RiR=0 baselines).
- RiR is capped/rounded to 0.5 steps; decide whether AquaZeroFit wants RPE as well (wger reuses the RiR field for both).
- Progression-rule editing is web-only in wger and confusing to users; for a Telegram Mini App, rules should be AI-authored with a simple human-readable diff preview, not a raw rule editor.
- Brzycki e1RM is one of several formulas; if P-06 compares to external benchmarks, pin the formula in code and version it.
