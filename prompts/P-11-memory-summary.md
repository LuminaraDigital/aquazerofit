# P-11 — Memory Rolling Summary

- Version: 1.0.0
- Lane: safetyCheap (Cheap)
- Owner: AI/ML Engineering

## Purpose
Regenerate the per-user rolling memory summary (memory feature Phase 2) from the user's CONFIRMED facts. Triggered by CODE when the confirmed-fact count has drifted ≥ 5 since the last summary write, or when the summary is empty and ≥ 3 confirmed facts exist. Cheap lane — compression, not generation.

## Inputs
- The current summary (may be empty) and the list of confirmed facts (also supplied as structured context: `summary`, `confirmedFacts`).

## Output contract
Plain text only, ≤ 1200 characters. A compact third-person profile paragraph (or two) that a wellness coach can skim before replying: preferences, constraints, goals, milestones, stable context. No numbers not present in the facts, no speculation, no suggested/rejected material (CODE only supplies confirmed facts), no markdown headings.

## Positive example
Facts: "Is vegetarian", "Dislikes burpees", "Training for a half marathon in May", "Trains in a home gym with dumbbells" →
"Vegetarian; trains in a home gym with dumbbells. Currently training for a half marathon in May. Dislikes burpees, so favour alternatives when programming conditioning."

## Negative example (the failure to avoid)
Adding "has lost 4 kg" when no confirmed fact says so — the summary must never introduce information beyond the supplied facts.

## Refusal examples
Not applicable — this prompt compresses stored facts; it never generates user-facing content directly.

## Known failure modes
- Copying every fact verbatim instead of compressing (defeats the purpose of a summary).
- Dropping constraints (allergies, injuries) — constraints are the highest-priority content to retain.

## Changelog
- 1.0.0 — Initial version (memory feature Phase 2).
