/**
 * TargetCalculator — normative algorithm AQF-09 §2.2.
 * Mifflin-St Jeor BMR -> activity-factored TDEE -> goal-adjusted kcal target
 * clamped to the safety floor (FR-031), plus macro split and water target.
 *
 * All arithmetic is deterministic code — never model-estimated (AQF-09 rule 1).
 * Constants live in @aquazerofit/shared; changes require an ADR (AQF-05).
 */
import {
  ACTIVITY_FACTORS,
  FAT_KCAL_FRACTION_MIN,
  FORMULA_VERSION,
  KCAL_FLOOR,
  KCAL_PER_G,
  KCAL_PER_KG,
  PROTEIN_G_PER_KG,
  WATER_ML_MAX,
  WATER_ML_MIN,
  WATER_ML_PER_KG,
  WEEKLY_LOSS_FRACTION,
  type DerivedTargets,
  type WellnessProfile,
} from '@aquazerofit/shared';

/**
 * Sex offset for Mifflin-St Jeor. 'unspecified' uses the midpoint of the male
 * (+5) and female (-161) offsets — documented default per AQF-06 §3.1 (sex is
 * used only for the metabolic formula and is optional).
 */
function sexOffset(sex: WellnessProfile['sex']): number {
  if (sex === 'male') return 5;
  if (sex === 'female') return -161;
  return -78;
}

export function computeBmr(profile: Pick<WellnessProfile, 'weightKg' | 'heightCm' | 'age' | 'sex'>): number {
  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexOffset(profile.sex);
}

/**
 * Daily kcal adjustment for the goal:
 * - lose: deficit sized at the midpoint of the permitted 0.5–1.0 %/wk band.
 * - gain: conservative surplus sized at the minimum of the band.
 * - maintain: zero.
 */
function dailyAdjustment(goal: WellnessProfile['goal'], weightKg: number): number {
  if (goal === 'lose') {
    const weeklyKg = weightKg * ((WEEKLY_LOSS_FRACTION.min + WEEKLY_LOSS_FRACTION.max) / 2);
    return -(weeklyKg * KCAL_PER_KG) / 7;
  }
  if (goal === 'gain') {
    const weeklyKg = weightKg * WEEKLY_LOSS_FRACTION.min;
    return (weeklyKg * KCAL_PER_KG) / 7;
  }
  return 0;
}

export function computeTargets(profile: WellnessProfile, now: Date = new Date()): DerivedTargets {
  const bmr = computeBmr(profile);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
  const rawTarget = tdee + dailyAdjustment(profile.goal, profile.weightKg);

  // Safety clamp: the engine never proposes intake below the floor (FR-031).
  const floor = KCAL_FLOOR[profile.sex];
  const clamped = rawTarget < floor;
  const kcalTarget = clamped ? floor : rawTarget;
  const clampReason = clamped
    ? `Calculated target (${Math.round(rawTarget)} kcal) is below the safe minimum of ${floor} kcal, so the target was raised to the floor. Consider a gentler rate of change.`
    : null;

  // Macros: protein by goal, fat supplies at least 20% of kcal, carbs remainder.
  const proteinG = PROTEIN_G_PER_KG[profile.goal] * profile.weightKg;
  const fatKcal = kcalTarget * FAT_KCAL_FRACTION_MIN;
  const fatG = fatKcal / KCAL_PER_G.fat;
  const carbsKcal = kcalTarget - proteinG * KCAL_PER_G.protein - fatKcal;
  const carbsG = carbsKcal > 0 ? carbsKcal / KCAL_PER_G.carbs : 0;

  // Water: 33 ml/kg clamped to the sensible band.
  const rawWater = profile.weightKg * WATER_ML_PER_KG;
  const waterMl = rawWater < WATER_ML_MIN ? WATER_ML_MIN : rawWater > WATER_ML_MAX ? WATER_ML_MAX : rawWater;

  return {
    userId: profile.userId,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcalTarget: Math.round(kcalTarget),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    waterMl: Math.round(waterMl),
    clamped,
    clampReason,
    computedAt: now.toISOString(),
    formulaVersion: FORMULA_VERSION,
  };
}
