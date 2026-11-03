package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.R
import fit.aquazero.app.core.model.ApiResult

/**
 * Denominator under "planned of X".
 *
 * [remaining] is the leftover daily budget the suggestion route returns:
 * the day's target minus meals already logged. The suggestions on this
 * screen are not logged, so adding them onto [remaining] reports a target
 * the server never set.
 *
 * The stored daily target wins when we have one. That stays correct after
 * some of the day is already logged and [remaining] is smaller than the
 * target. With no stored target, [remaining] itself is the figure: it
 * already is the day's budget, not a base to rebuild.
 */
internal fun mealPlanDenominator(serverTarget: Double?, remaining: Double?): Double? {
    val stored = serverTarget?.takeIf { it > 0.0 }
    if (stored != null) return stored
    return remaining
}

/** Apply [mealPlanDenominator] to both macros on the meal-plan state. */
internal fun MealPlanUiState.withResolvedTargets(): MealPlanUiState = copy(
    kcalTarget = mealPlanDenominator(storedKcalTarget, remainingKcal),
    proteinTarget = mealPlanDenominator(storedProteinTarget, remainingProteinG),
)

/**
 * Out of credits is a different fact from "the generator failed". The slot
 * should say so, including that Premium raises the cap, instead of a generic
 * retry line.
 */
internal fun mealPlanFailureMessageRes(failure: ApiResult.Failure): Int =
    if (failure is ApiResult.Failure.Api && failure.code == CREDITS_INSUFFICIENT) {
        R.string.meal_plan_slot_credits
    } else {
        R.string.meal_plan_slot_failed
    }

private const val CREDITS_INSUFFICIENT = "CREDITS_INSUFFICIENT"
