package fit.aquazero.app.core.common

import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.TrendPointDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AdaptiveExpenditureCalculatorTest {

    @Test
    fun `empty weight or calorie series returns baseline with low confidence`() {
        val result = AdaptiveExpenditureCalculator.calculate(
            weightHistory = emptyList(),
            calorieHistory = emptyList(),
            baselineTdee = 2200.0,
            sex = Sex.MALE,
        )

        assertEquals(2200.0, result.estimatedTdeeKcal, 1e-9)
        assertEquals(2200.0, result.recommendedTargetKcal, 1e-9)
        assertEquals(ExpenditureConfidence.LOW, result.confidence)
        assertEquals(0.0, result.adaptationKcal, 1e-9)
    }

    @Test
    fun `smoothWeightSeries reduces noise via EWMA`() {
        val raw = listOf(
            TrendPointDto("2026-08-01", 80.0),
            TrendPointDto("2026-08-02", 82.0), // Spike
            TrendPointDto("2026-08-03", 80.0),
        )
        val smoothed = AdaptiveExpenditureCalculator.smoothWeightSeries(raw, alpha = 0.2)
        assertEquals(3, smoothed.size)
        assertEquals(80.0, smoothed[0].value, 1e-9)
        // 80.0 * 0.8 + 82.0 * 0.2 = 80.4
        assertEquals(80.4, smoothed[1].value, 1e-9)
    }

    @Test
    fun `adapts upward when scale weight drops during maintenance intake`() {
        val weights = (0..14).map { day ->
            TrendPointDto("2026-08-%02d".format(day + 1), 80.0 - (day * 0.1)) // Losing 100g/day
        }
        val calories = (0..14).map { day ->
            TrendPointDto("2026-08-%02d".format(day + 1), 2200.0)
        }

        val result = AdaptiveExpenditureCalculator.calculate(
            weightHistory = weights,
            calorieHistory = calories,
            baselineTdee = 2200.0,
            sex = Sex.MALE,
        )

        assertTrue("TDEE should adapt upward", result.estimatedTdeeKcal > 2200.0)
        assertTrue("Weekly adjustment should be positive", result.adaptationKcal > 0.0)
        assertEquals(ExpenditureConfidence.HIGH, result.confidence)
    }

    @Test
    fun `never breaches female or male safety calorie floors`() {
        val weights = (0..14).map { day ->
            TrendPointDto("2026-08-%02d".format(day + 1), 60.0 + (day * 0.2)) // Gaining fast
        }
        val calories = (0..14).map { day ->
            TrendPointDto("2026-08-%02d".format(day + 1), 1000.0)
        }

        val femaleResult = AdaptiveExpenditureCalculator.calculate(
            weightHistory = weights,
            calorieHistory = calories,
            baselineTdee = 1300.0,
            sex = Sex.FEMALE,
            targetDeficitSurplusKcal = -500.0, // Aggressive deficit attempt
        )

        assertTrue(
            "Female target must not breach 1200 floor, got: ${femaleResult.recommendedTargetKcal}",
            femaleResult.recommendedTargetKcal >= AdaptiveExpenditureCalculator.FEMALE_FLOOR_KCAL,
        )

        val maleResult = AdaptiveExpenditureCalculator.calculate(
            weightHistory = weights,
            calorieHistory = calories,
            baselineTdee = 1600.0,
            sex = Sex.MALE,
            targetDeficitSurplusKcal = -500.0,
        )

        assertTrue(
            "Male target must not breach 1500 floor, got: ${maleResult.recommendedTargetKcal}",
            maleResult.recommendedTargetKcal >= AdaptiveExpenditureCalculator.MALE_FLOOR_KCAL,
        )
    }
}
