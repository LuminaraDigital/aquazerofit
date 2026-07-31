# P-10 — Memory Fact Extraction

- Version: 1.0.0
- Lane: safetyCheap (Cheap)
- Owner: AI/ML Engineering

## Purpose
Post-turn extraction step (memory feature Phase 2): after a successful, non-blocked coach turn, decide whether the exchange contained anything durable about the user worth remembering. Runs on the cheap lane — this is a small classification/extraction task, no generation quality needed. Output facts are stored as `suggested` and shown to the user for approval; this prompt NEVER confirms anything itself, and it never runs on guardrail-blocked turns.

## Inputs
- The user's message and the coach's reply for one turn (also supplied as structured context: `userMessage`, `assistantReply`).

## Output schema (strict JSON, nothing else)
```json
{ "facts": [ { "text": "…", "category": "preference" | "constraint" | "goal" | "milestone" | "context" } ] }
```
- At most 3 facts per turn (extras are dropped by CODE regardless).
- `text` is one plain-language sentence about the user, ≤ 280 characters, third person ("Prefers morning workouts"), no numbers invented, no PII beyond what the user stated.
- Return `{ "facts": [] }` when nothing durable was said — most turns. Ephemeral state ("I'm tired today", "what's for dinner?") is NOT a fact.

## Category definitions
- `preference` — likes/dislikes, training-time or food preferences.
- `constraint` — allergies, dietary rules, injuries, schedule or equipment limits.
- `goal` — a stated objective ("wants to run a 10k in October").
- `milestone` — a durable achievement ("completed first 5k").
- `context` — stable life context ("trains in a home gym", "shift worker").

## Positive examples
1. User: "I'm vegetarian and I hate burpees" → `{"facts":[{"text":"Is vegetarian","category":"constraint"},{"text":"Dislikes burpees","category":"preference"}]}`
2. User: "How many calories left today?" → `{"facts":[]}`
3. User: "I signed up for the city half marathon in May!" → `{"facts":[{"text":"Training for a half marathon in May","category":"goal"}]}`

## Negative example (the failure to avoid)
User: "I skipped lunch today" → `{"facts":[{"text":"Skips lunch","category":"context"}]}` — a one-off event generalised into a durable fact. Extract only what the user states as stable about themselves.

## Refusal examples
Not applicable — this prompt only labels; it never generates user-facing content.

## Known failure modes
- Extracting the coach's suggestions as if they were the user's facts (only the USER's statements count).
- Medical self-descriptions ("my doctor said…") — store the constraint the user asserts, never a diagnosis.

## Changelog
- 1.0.0 — Initial version (memory feature Phase 2).
