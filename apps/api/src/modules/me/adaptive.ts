/**
 * Adaptive Energy Expenditure engine (API-first).
 *
 * Ports the deterministic logic from AdaptiveExpenditureCalculator.kt:
 * EWMA-smoothed weight velocity matched against logged caloric intake.
 * All arithmetic is code — never model-estimated (AQF-09 rule 1).
 */
import type { Sex, TrendPoint, WellnessProfile } from '@aquazerofit/shared';
import { FORMULA_VERSION, KCAL_FLOOR } from '@aquazerofit/shared';

export const KCAL_PER_KG_WEIGHT = 7700;
export const DEFAULT_EWMA_ALPHA = 0.15;
export const MIN_DAYS_FOR_CONFIDENCE = 7;
export const MAX_WEEKLY_ADJUSTMENT_KCAL = 100;

export type ExpenditureConfidence = 'high' | 'moderate' | 'low';

export interface AdaptiveExpenditureResult {
  estimatedTdeeKcal: number;
  baselineTdeeKcal: number;
  smoothedWeightKg: number | null;
  weightTrendDeltaKg: number;
  confidence: ExpenditureConfidence;
  recommendedTargetKcal: number;
  adaptationKcal: number;
  reasoning: string;
}

export const ADAPTIVE_FORMULA_VERSION = `${FORMULA_VERSION}+adaptive-v1`;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function floorKcalForSex(sex: Sex): number {
  if (sex === 'male') return KCAL_FLOOR.male;
  return KCAL_FLOOR.female;
}

/** Compute Exponentially Weighted Moving Average (EWMA) smoothed weight points. */
export function smoothWeightSeries(
  rawPoints: TrendPoint[],
  alpha: number = DEFAULT_EWMA_ALPHA,
): TrendPoint[] {
  if (rawPoints.length === 0) return [];
  const sorted = [...rawPoints].sort((a, b) => a.date.localeCompare(b.date));
  let currentSmoothed = sorted[0]!.value;

  return sorted.map((point) => {
    currentSmoothed = alpha * point.value + (1 - alpha) * currentSmoothed;
    return {
      date: point.date,
      value: round1(currentSmoothed),
    };
  });
}

/**
 * Calculate dynamic energy expenditure and adaptive targets.
 */
export function calculateAdaptiveExpenditure(
  weightHistory: TrendPoint[],
  calorieHistory: TrendPoint[],
  baselineTdee: number,
  sex: Sex = 'unspecified',
  targetDeficitSurplusKcal: number = 0,
): AdaptiveExpenditureResult {
  const floorKcal = floorKcalForSex(sex);
  const smoothedWeights = smoothWeightSeries(weightHistory);
  const validDays = calorieHistory.filter((p) => p.value > 500);

  if (smoothedWeights.length < 2 || validDays.length < MIN_DAYS_FOR_CONFIDENCE) {
    const safeTarget = Math.max(floorKcal, baselineTdee + targetDeficitSurplusKcal);
    return {
      estimatedTdeeKcal: baselineTdee,
      baselineTdeeKcal: baselineTdee,
      smoothedWeightKg: smoothedWeights.at(-1)?.value ?? null,
      weightTrendDeltaKg: 0,
      confidence: 'low',
      recommendedTargetKcal: round1(safeTarget),
      adaptationKcal: 0,
      reasoning:
        'More consistent logging (at least 7 days of food and weight) is needed for high-confidence metabolic adaptation.',
    };
  }

  const firstWeight = smoothedWeights[0]!.value;
  const lastWeight = smoothedWeights.at(-1)!.value;
  const totalWeightDelta = lastWeight - firstWeight;
  const daysSpan = Math.max(1, smoothedWeights.length);
  const dailyWeightVelocityKg = totalWeightDelta / daysSpan;

  const avgLoggedKcal = validDays.reduce((s, p) => s + p.value, 0) / validDays.length;
  const dailySurplusDeficitFromScale = dailyWeightVelocityKg * KCAL_PER_KG_WEIGHT;
  const rawTdee = avgLoggedKcal - dailySurplusDeficitFromScale;

  const clampedTdee = Math.min(Math.max(rawTdee, baselineTdee * 0.75), baselineTdee * 1.25);
  const adaptationDelta = clampedTdee - baselineTdee;
  const boundedAdjustment = Math.min(
    MAX_WEEKLY_ADJUSTMENT_KCAL,
    Math.max(-MAX_WEEKLY_ADJUSTMENT_KCAL, adaptationDelta),
  );

  const rawTarget = baselineTdee + boundedAdjustment + targetDeficitSurplusKcal;
  const finalTarget = Math.max(floorKcal, rawTarget);

  let confidence: ExpenditureConfidence = 'low';
  if (validDays.length >= 14 && smoothedWeights.length >= 10) confidence = 'high';
  else if (validDays.length >= 7) confidence = 'moderate';

  let reasoning: string;
  if (Math.abs(boundedAdjustment) < 15) {
    reasoning = `Metabolic expenditure is stable near baseline (${baselineTdee} kcal/day).`;
  } else if (boundedAdjustment > 0) {
    reasoning = `Your expenditure has adapted upward by +${Math.round(boundedAdjustment)} kcal/day based on recent activity and weight trends.`;
  } else {
    reasoning = `Metabolic rate slightly adjusted by ${Math.round(boundedAdjustment)} kcal/day to maintain optimal progression.`;
  }
  if (finalTarget <= floorKcal && rawTarget < floorKcal) {
    reasoning += ` Target clamped to safety floor (${Math.round(floorKcal)} kcal).`;
  }

  return {
    estimatedTdeeKcal: round1(clampedTdee),
    baselineTdeeKcal: baselineTdee,
    smoothedWeightKg: lastWeight,
    weightTrendDeltaKg: round1(totalWeightDelta),
    confidence,
    recommendedTargetKcal: round1(finalTarget),
    adaptationKcal: round1(boundedAdjustment),
    reasoning,
  };
}

/** Map baseline kcal target back to the goal adjustment applied at compute time. */
export function goalAdjustmentKcal(
  profile: Pick<WellnessProfile, 'goal' | 'weightKg'>,
  baselineTdee: number,
  kcalTarget: number,
): number {
  return kcalTarget - baselineTdee;
}
