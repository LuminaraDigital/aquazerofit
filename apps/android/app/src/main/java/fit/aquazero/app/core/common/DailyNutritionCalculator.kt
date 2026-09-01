package fit.aquazero.app.core.common

import kotlin.math.max
import kotlin.math.roundToInt

/** Inputs for the local recompute: one meal's totals. */
data class MealTotals(
    val kcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
)

/** Targets snapshot used by the recompute. */
data class NutritionTargets(
    val kcalTarget: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val waterMl: Double,
)

/** Output mirroring the display-relevant fields of `DailyNutrition`. */
data class LocalDailyNutrition(
    val kcalTarget: Double,
    val kcalConsumed: Double,
    val kcalBurned: Double = 0.0,
    val kcalNet: Double = kcalConsumed,
    val kcalRemaining: Double,
    val proteinConsumed: Double,
    val proteinTarget: Double,
    val carbsConsumed: Double,
    val carbsTarget: Double,
    val fatConsumed: Double,
    val fatTarget: Double,
    val waterConsumedMl: Int,
    val waterTargetMl: Int,
)

/**
 * Local `DailyNutrition` recompute so the dashboard rings stay live offline
 * (plan §4.2 "derived-day recompute"). Display-only: the server's version
 * replaces it on the next fetch — the "code calculates" invariant holds on
 * both sides because both run the same trivial arithmetic.
 */
object DailyNutritionCalculator {

    /** Fold meal totals + water + optional burn against targets into ring-ready numbers. */
    fun compute(
        meals: List<MealTotals>,
        waterMl: Int,
        targets: NutritionTargets,
        kcalBurned: Double = 0.0,
    ): LocalDailyNutrition {
        val kcal = round1(meals.sumOf { it.kcal })
        val protein = round1(meals.sumOf { it.proteinG })
        val carbs = round1(meals.sumOf { it.carbsG })
        val fat = round1(meals.sumOf { it.fatG })
        val burned = round1(kcalBurned.coerceAtLeast(0.0))
        val net = round1(kcal - burned)
        val remaining = round1(max(0.0, targets.kcalTarget - net))
        return LocalDailyNutrition(
            kcalTarget = targets.kcalTarget,
            kcalConsumed = kcal,
            kcalBurned = burned,
            kcalNet = net,
            kcalRemaining = remaining,
            proteinConsumed = protein,
            proteinTarget = targets.proteinG,
            carbsConsumed = carbs,
            carbsTarget = targets.carbsG,
            fatConsumed = fat,
            fatTarget = targets.fatG,
            waterConsumedMl = waterMl,
            waterTargetMl = targets.waterMl.roundToInt(),
        )
    }

    /** One-decimal rounding, matching the API's `round1`. */
    fun round1(value: Double): Double = (value * 10.0).roundToInt() / 10.0
}
