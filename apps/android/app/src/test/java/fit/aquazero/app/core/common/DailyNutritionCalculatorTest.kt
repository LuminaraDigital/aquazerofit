package fit.aquazero.app.core.common

import org.junit.Assert.assertEquals
import org.junit.Test

class DailyNutritionCalculatorTest {

    private val targets = NutritionTargets(
        kcalTarget = 2000.0,
        proteinG = 140.0,
        carbsG = 220.0,
        fatG = 70.0,
        waterMl = 2500.0,
    )

    @Test
    fun `sums meals and rounds to one decimal like the API`() {
        val result = DailyNutritionCalculator.compute(
            meals = listOf(
                MealTotals(kcal = 450.25, proteinG = 32.33, carbsG = 40.0, fatG = 18.11),
                MealTotals(kcal = 620.13, proteinG = 41.02, carbsG = 55.5, fatG = 22.3),
            ),
            waterMl = 750,
            targets = targets,
        )
        assertEquals(1070.4, result.kcalConsumed, 1e-9)
        assertEquals(73.4, result.proteinConsumed, 1e-9)
        assertEquals(95.5, result.carbsConsumed, 1e-9)
        assertEquals(40.4, result.fatConsumed, 1e-9)
        assertEquals(929.6, result.kcalRemaining, 1e-9)
        assertEquals(750, result.waterConsumedMl)
        assertEquals(2500, result.waterTargetMl)
    }

    @Test
    fun `remaining clamps at zero when over target`() {
        val result = DailyNutritionCalculator.compute(
            meals = listOf(MealTotals(kcal = 2400.0, proteinG = 100.0, carbsG = 200.0, fatG = 90.0)),
            waterMl = 0,
            targets = targets,
        )
        assertEquals(0.0, result.kcalRemaining, 1e-9)
    }

    @Test
    fun `empty day is all zeros against targets`() {
        val result = DailyNutritionCalculator.compute(
            meals = emptyList(),
            waterMl = 0,
            targets = targets,
        )
        assertEquals(0.0, result.kcalConsumed, 1e-9)
        assertEquals(2000.0, result.kcalRemaining, 1e-9)
    }
}
