package fit.aquazero.app.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProgressiveOverloadEngineTest {

    @Test
    fun `estimate1Rm calculates exact 1RM for single rep`() {
        val oneRm = ProgressiveOverloadEngine.estimate1Rm(100.0, 1)
        assertEquals(100.0, oneRm, 0.01)
    }

    @Test
    fun `estimate1Rm uses Epley formula for low to moderate reps`() {
        // Epley formula: 100 * (1 + 5/30) = 100 * 1.166666... = 116.7
        val oneRm = ProgressiveOverloadEngine.estimate1Rm(100.0, 5)
        assertEquals(116.7, oneRm, 0.1)
    }

    @Test
    fun `estimate1Rm uses Brzycki formula for high reps`() {
        // Brzycki formula: 80 * (36 / (37 - 12)) = 80 * (36/25) = 115.2
        val oneRm = ProgressiveOverloadEngine.estimate1Rm(80.0, 12)
        assertEquals(115.2, oneRm, 0.1)
    }

    @Test
    fun `evaluatePr correctly flags new personal records`() {
        val eval = ProgressiveOverloadEngine.evaluatePr(
            weightKg = 100.0,
            reps = 6, // 1RM ~ 120kg
            historicalBest1RmKg = 115.0,
        )
        assertTrue(eval.isNewPr)
        assertEquals(120.0, eval.currentEstimated1RmKg, 0.1)
        assertEquals(5.0, eval.deltaKg, 0.1)
    }

    @Test
    fun `evaluatePr returns false when performance does not beat historical best`() {
        val eval = ProgressiveOverloadEngine.evaluatePr(
            weightKg = 100.0,
            reps = 3, // 1RM ~ 110kg
            historicalBest1RmKg = 115.0,
        )
        assertFalse(eval.isNewPr)
        assertEquals(0.0, eval.deltaKg, 0.01)
    }

    @Test
    fun `recommendProgression increases weight when all sets hit top target reps`() {
        val sets = listOf(
            SetPerformance(1, 100.0, 10, 10, rir = 2.0),
            SetPerformance(2, 100.0, 10, 10, rir = 2.0),
            SetPerformance(3, 100.0, 10, 10, rir = 2.0),
        )

        val rec = ProgressiveOverloadEngine.recommendProgression(
            completedSets = sets,
            targetMinReps = 8,
            targetMaxReps = 10,
            category = MovementCategory.COMPOUND_LOWER,
        )

        assertEquals(ProgressionAction.INCREASE_WEIGHT, rec.action)
        assertEquals(102.5, rec.suggestedWeightKg, 0.01)
        assertEquals(8, rec.suggestedReps)
    }

    @Test
    fun `recommendProgression increases reps when min target is met but not max`() {
        val sets = listOf(
            SetPerformance(1, 100.0, 8, 10, rir = 1.0),
            SetPerformance(2, 100.0, 8, 10, rir = 1.0),
            SetPerformance(3, 100.0, 8, 10, rir = 0.0),
        )

        val rec = ProgressiveOverloadEngine.recommendProgression(
            completedSets = sets,
            targetMinReps = 8,
            targetMaxReps = 10,
            category = MovementCategory.COMPOUND_UPPER,
        )

        assertEquals(ProgressionAction.INCREASE_REPS, rec.action)
        assertEquals(100.0, rec.suggestedWeightKg, 0.01)
        assertEquals(9, rec.suggestedReps)
    }

    @Test
    fun `generateWarmUpSets creates proper ramp up sets for working weight`() {
        val warmUps = ProgressiveOverloadEngine.generateWarmUpSets(100.0, barbellWeightKg = 20.0)
        assertTrue(warmUps.isNotEmpty())
        assertEquals(3, warmUps.size)

        // Set 1: ~45% (45kg)
        assertEquals(45.0, warmUps[0].weightKg, 0.1)
        assertEquals(10, warmUps[0].reps)

        // Set 2: ~65% (65kg)
        assertEquals(65.0, warmUps[1].weightKg, 0.1)
        assertEquals(5, warmUps[1].reps)

        // Set 3: ~85% (85kg)
        assertEquals(85.0, warmUps[2].weightKg, 0.1)
        assertEquals(2, warmUps[2].reps)
    }
}
