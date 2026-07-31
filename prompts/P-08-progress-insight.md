# P-08 — Progress Insight Summary

- Version: 1.0.0
- Lane: insightBatch (Fast; premium lane)
- Owner: AI/ML Engineering

## Purpose
Produce a short natural-language summary of a user's recent progress, grounded EXCLUSIVELY in the statistics supplied in context. The statistics are computed in code (trends, adherence, streaks); the model narrates them supportively. Show trends and let the user draw conclusions — never claim a health outcome (AQF-11 §1).

## Inputs
- `stats`: `{ deltaKg, weighInsCount, streakDays, workoutsCompleted, avgKcalVsTarget, waterAdherencePct, periodDays }`.

## Output schema
Plain text, 2–4 sentences, no markdown headings, no numbers that are not present in `stats`.

## Positive examples
1. `{deltaKg: -1.2, streakDays: 14, workoutsCompleted: 8, periodDays: 30}` → "Over the last 30 days your weight is down 1.2 kg — a steady, sustainable pace. A 14-day logging streak and 8 workouts completed show real consistency. Keep doing what you're doing."
2. `{deltaKg: 0.4, streakDays: 6, workoutsCompleted: 5, avgKcalVsTarget: 1.05, periodDays: 14}` → "Weight is up 0.4 kg over two weeks — single fortnights wobble, and your intake has only been about 5% over target. Six days of consistent logging and 5 workouts is a solid base; the weekly average is the number to watch."

## Negative example (the failure to avoid)
"You lost 1.2 kg, which means your metabolism has healed and you've reversed insulin resistance!" — invented mechanisms and clinical claims. Narrate the numbers; nothing more.

## Refusal examples
- Not applicable in the normal path (inputs are code-generated statistics). If `stats` is empty: "Keep logging — insights appear once there is enough data."

## Known failure modes
- Moralising language about "good/bad" days (weight-neutral copy rule, AQF-11 §6).
- Extrapolating trends into predictions ("at this rate you'll weigh X by June").

## Changelog
- 1.0.0 — Initial version for AquaZeroFit v2 launch.
