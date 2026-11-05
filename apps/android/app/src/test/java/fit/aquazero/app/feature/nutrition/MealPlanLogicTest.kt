package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.R
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.IOException

/**
 * The meal-plan header was adding the unlogged plan onto the server's
 * remaining budget. A 1,500 kcal plan against a 2,740 kcal day rendered
 * "1,500 of 4,240".
 */
class MealPlanLogicTest {

    @Test
    fun `planned suggestions are not added onto the day's remaining budget`() {
        val state = MealPlanUiState(
            remainingKcal = 2740.0,
            remainingProteinG = 131.0,
            slots = listOf(
                MealPlanSlot(
                    mealType = MealType.LUNCH,
                    loading = false,
                    recommendation = MealRecommendationDto(
                        id = "r",
                        name = "Bowl",
                        kcal = 1500.0,
                        proteinG = 108.0,
                    ),
                ),
            ),
        )

        val resolved = state.withResolvedTargets()

        assertEquals(1500.0, resolved.plannedKcal, 0.0)
        assertEquals(108.0, resolved.plannedProteinG, 0.0)
        assertEquals(2740.0, resolved.kcalTarget!!, 0.0)
        assertEquals(131.0, resolved.proteinTarget!!, 0.0)
    }

    @Test
    fun `stored daily targets win once part of the day is already logged`() {
        val resolved = MealPlanUiState(
            storedKcalTarget = 2740.0,
            storedProteinTarget = 131.0,
            remainingKcal = 1740.0,
            remainingProteinG = 80.0,
        ).withResolvedTargets()

        assertEquals(2740.0, resolved.kcalTarget!!, 0.0)
        assertEquals(131.0, resolved.proteinTarget!!, 0.0)
    }

    @Test
    fun `out of credits names credits instead of a generic retry`() {
        val failure = ApiResult.Failure.Api(
            httpStatus = 402,
            code = "CREDITS_INSUFFICIENT",
            message = "You have run out of AI credits for today.",
        )
        assertEquals(R.string.meal_plan_slot_credits, mealPlanFailureMessageRes(failure))
    }

    @Test
    fun `other suggestion failures stay on the generic line`() {
        val failure = ApiResult.Failure.Network(IOException("offline"))
        assertEquals(R.string.meal_plan_slot_failed, mealPlanFailureMessageRes(failure))
    }

    @Test
    fun `credits are exhausted only when every slot settled on the credits failure`() {
        fun slot(type: MealType, failed: Boolean, res: Int) =
            MealPlanSlot(type, loading = false, failed = failed, failureMessageRes = res)

        val allCredits = MealPlanUiState(
            slots = MealType.entries.map { slot(it, true, R.string.meal_plan_slot_credits) },
        )
        val mixed = allCredits.copy(
            slots = allCredits.slots.take(3) + slot(MealType.SNACK, true, R.string.meal_plan_slot_failed),
        )

        assertEquals(true, allCredits.creditsExhausted)
        assertEquals(false, mixed.creditsExhausted)
        assertEquals(false, MealPlanUiState().creditsExhausted)
    }
}
