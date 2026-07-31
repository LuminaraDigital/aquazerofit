# wger × AquaZeroFit — Implementation Orchestration Plan

Implements all 5 phases of `wger-integration-plan.md` using staged sub-agents reporting to the orchestrator (CEO master agent). Stage gates are binary: build+tests green before the next stage.

## Stage 1 — Foundation (single agent, gate for everything)
**Role: Backend/Data Engineer.** Extend shared domain types (`packages/shared/src/types.ts` + zod schemas) with the wger-integration fields all other agents code against: extended `EQUIPMENT` enum, `Exercise.wgerUuid/variationGroup/licenceUrl`, `ProgressionRule.op/step/repeat/requires`, `PlanDay.needLogsToAdvance`, `SessionExercise` per-set logs + target fields, `Food` barcode/nutriscore/vegan fields, shared wger API payload schemas. Add `apps/api/src/data/wger/mappings.ts` (wger→AQF muscle/category/equipment maps + difficulty heuristic) with unit tests. Gate: `npm run build` + `npm test` green.

## Stage 2 — Parallel builders (5 agents, disjoint file sets)
- **BE-Data (Backend/Data Engineer)**: ETL + ingestion. `apps/api/scripts/`, `apps/api/src/data/wger/`, `platform/store.ts` (segregated `foodsOff`/`foodsFdc` containers), `modules/admin/router.ts` (import endpoints), `modules/foods/**` (barcode lookup). Runs the REAL wger exercise import (828 exercises + media mirror) and bounded OFF subset.
- **FS-Training (Full-Stack Engineer)**: training engine. `modules/workouts/**`, `modules/plans/**` only — variation-aware swap, `GET /exercises/:id/variations`, requirements-gated progression, target+actual logging, needLogsToAdvance, pre-computed `/workouts/today`, stats module (Brzycki e1RM), P-05/P-06 hookup via the AI contract.
- **AI-ML (AI/ML Engineer)**: `modules/ai/**`, `prompts/`, `evals/` only — implements the AI contract (`planEngine.ts`: `tryGenerateAiPlan`, `suggestExerciseSwap`) on the gateway lanes, prompt updates, new eval fixtures (plan-safety.json).
- **FE-App (Frontend/UI-UX)**: `apps/web/**` only — exercise library pagination + attribution + new equipment icons, variations UI, today-workout payload rendering, barcode scan/log UX, equipment onboarding options.
- **SecPriv (Security/Privacy Engineer)**: docs + review only — `THIRD_PARTY_NOTICES.md`, `content/ATTRIBUTION.md`, AQF-12 addendum, security/privacy review of the new endpoints, ODbL/CC-BY-SA compliance verification.

### AI contract (both FS-Training and AI-ML code against this exact signature)
`apps/api/src/modules/ai/planEngine.ts`:
```ts
export interface AiPlanRequest { profile: WellnessProfile; pool: Exercise[]; daysPerWeek: number; }
export interface AiPlanDraft { name: string; days: PlanDay[]; progressionRules: ProgressionRule[]; rationale: string; }
export async function tryGenerateAiPlan(req: AiPlanRequest): Promise<{ draft: AiPlanDraft; ai: AiMetadata } | null>; // null = fall back to deterministic
export interface SwapRequest { exercise: Exercise; pool: Exercise[]; profile: WellnessProfile; reason?: string; }
export async function suggestExerciseSwap(req: SwapRequest): Promise<{ exerciseIds: string[]; rationale: string } | null>;
```

## Stage 3 — Validation loop (until 100% green)
- **QA-Integrator (coder)**: `npm run build && npm test`, boot API, smoke-test every new endpoint, fix all integration mismatches. Loops with…
- **PM-Reviewer (plan)**: verify deliverable against `wger-integration-plan.md` phases 1–5 + professional structure; punch list → QA fixes.

## File-set ownership rules (no conflicts)
- `packages/shared/**`: Stage 1 only (frozen afterwards; changes via QA stage only)
- `modules/workouts/**`, `modules/plans/**`: FS-Training
- `modules/ai/**`, `prompts/`, `evals/`: AI-ML
- `modules/admin/**`, `modules/foods/**`, `platform/store.ts`, `scripts/`, `data/wger/`: BE-Data
- `apps/web/**`: FE-App
- Root docs/`content/`/`Documentation/`: SecPriv
