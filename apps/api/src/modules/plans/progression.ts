/**
 * ProgressionEngine — deterministic resolution of ProgressionRule data
 * (Phase 2, wger progression-as-data patterns; AQF-06 §3.4: progression is
 * data, not branching code). Pure functions: no store, no AI — the same code
 * resolves a plan for the "today" payload and is unit-tested against the
 * wger docs reference example.
 *
 * Semantics:
 * - Legacy rule (no `op`): `value` is the absolute target from `iteration`
 *   onwards; the latest applicable rule wins (exact pre-Phase-2 behaviour).
 * - `op` add/subtract/replace with `step` abs/percent: applied in iteration
 *   order on a running value; percent deltas compound on the running value.
 * - `repeat`: re-applies the rule on every iteration from `iteration` to the
 *   target iteration (one application per iteration).
 * - `requires`: autoregulation — an application is skipped unless the caller's
 *   gate confirms the previous iteration's logs met the listed targets. When
 *   no gate is supplied, gated applications fail closed (never applied).
 *
 * Hard caps mirror the shared zod load schemas (AQF-11): weight 0–1000 kg,
 * RiR 0–9.5 (0.5 step), reps 1–100, sets 1–20, rest 0–900 s.
 */
import type { ProgressionRule } from '@aquazerofit/shared';

export type RuleKind = ProgressionRule['kind'];

export interface ProgressionBase {
  sets: number;
  reps: number;
  restSeconds: number;
  weightKg?: number | null;
  rir?: number | null;
}

export interface ResolvedPrescription {
  sets: number;
  reps: number;
  restSeconds: number;
  weightKg: number | null;
  rir: number | null;
}

/**
 * Gate callback: should this rule application at `atIteration` be honoured?
 * Implementations inspect the logs of iteration `atIteration - 1`.
 */
export type ProgressionGate = (atIteration: number, rule: ProgressionRule) => boolean;

const CAPS: Record<RuleKind, { min: number; max: number }> = {
  sets: { min: 1, max: 20 },
  reps: { min: 1, max: 100 },
  rest: { min: 0, max: 900 },
  weight: { min: 0, max: 1000 },
  rir: { min: 0, max: 9.5 },
};

function clamp(value: number, kind: RuleKind): number {
  return Math.min(CAPS[kind].max, Math.max(CAPS[kind].min, value));
}

/** Per-kind output rounding: integers for counts, 2dp for kg, 0.5 for RiR. */
function roundFor(kind: RuleKind, value: number): number {
  switch (kind) {
    case 'sets':
    case 'reps':
    case 'rest':
      return clamp(Math.round(value), kind);
    case 'weight':
      return clamp(Math.round(value * 100) / 100, kind);
    case 'rir':
      return clamp(Math.round(value * 2) / 2, kind);
  }
}

function applyOp(current: number, rule: ProgressionRule): number {
  const op = rule.op ?? 'replace';
  if (op === 'replace') return rule.value;
  const delta = rule.step === 'percent' ? (current * rule.value) / 100 : rule.value;
  return op === 'add' ? current + delta : current - delta;
}

/**
 * Resolve one progression kind for a slot entry at `iteration`.
 * `base` of null means "not prescribed" (e.g. bodyweight weight target): only
 * a replace op can introduce a value, except weight where null is treated as
 * a 0 kg baseline so add-ops can prescribe load on top of bodyweight.
 */
export function resolveKind(
  base: number | null,
  kind: RuleKind,
  rules: ProgressionRule[],
  iteration: number,
  gate?: ProgressionGate,
): number | null {
  const applicable = rules
    .filter((r) => r.kind === kind && r.iteration >= 1 && r.iteration <= iteration)
    .sort((a, b) => a.iteration - b.iteration);
  let current: number | null = base;
  for (const rule of applicable) {
    if (!rule.op) {
      // Legacy absolute rule: value is the target from this iteration on.
      current = rule.value;
      continue;
    }
    const applications = rule.repeat ? iteration - rule.iteration + 1 : 1;
    for (let k = 0; k < applications; k += 1) {
      const atIteration = rule.iteration + k;
      if (rule.requires && rule.requires.length > 0) {
        // Autoregulation fails closed: without a gate, or a gate that cannot
        // confirm the previous iteration's logs, the application is skipped.
        if (!gate || !gate(atIteration, rule)) continue;
      }
      if (current === null) {
        if (rule.op === 'replace') current = rule.value;
        else if (kind === 'weight') current = applyOp(0, rule);
        // rir with no baseline and a delta op: nothing to add to — skip.
      } else {
        current = applyOp(current, rule);
      }
    }
  }
  return current === null ? null : roundFor(kind, current);
}

/** Resolve all kinds for one slot entry at `iteration`. */
export function resolvePrescription(
  slotEntryId: string,
  base: ProgressionBase,
  rules: ProgressionRule[],
  iteration: number,
  gate?: ProgressionGate,
): ResolvedPrescription {
  const mine = rules.filter((r) => r.slotEntryId === slotEntryId);
  return {
    sets: resolveKind(base.sets, 'sets', mine, iteration, gate) ?? base.sets,
    reps: resolveKind(base.reps, 'reps', mine, iteration, gate) ?? base.reps,
    restSeconds: resolveKind(base.restSeconds, 'rest', mine, iteration, gate) ?? base.restSeconds,
    weightKg: resolveKind(base.weightKg ?? null, 'weight', mine, iteration, gate),
    rir: resolveKind(base.rir ?? null, 'rir', mine, iteration, gate),
  };
}

/** Round a working weight to loadable plates (default 2.5 kg steps). */
export function roundToPlate(weightKg: number, plateStepKg = 2.5): number {
  return Math.round(weightKg / plateStepKg) * plateStepKg;
}
