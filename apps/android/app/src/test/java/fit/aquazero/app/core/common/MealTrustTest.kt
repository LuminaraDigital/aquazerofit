package fit.aquazero.app.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MealTrustTest {

    @Test
    fun `confidence bands use 80 and 55 thresholds`() {
        assertEquals(MatchConfidenceBand.HIGH, MealTrust.confidenceBandFromScore(80))
        assertEquals(MatchConfidenceBand.HIGH, MealTrust.confidenceBandFromScore(100))
        assertEquals(MatchConfidenceBand.MODERATE, MealTrust.confidenceBandFromScore(79))
        assertEquals(MatchConfidenceBand.MODERATE, MealTrust.confidenceBandFromScore(55))
        assertEquals(MatchConfidenceBand.LOW, MealTrust.confidenceBandFromScore(54))
        assertEquals(MatchConfidenceBand.LOW, MealTrust.confidenceBandFromScore(0))
    }

    @Test
    fun `fat caution when fat share is at least 0_45 of kcal`() {
        assertTrue(
            MealTrust.shouldShowFatCaution(
                itemNames = listOf("Plain rice"),
                kcal = 200.0,
                fatG = 10.0,
            ),
        )
        assertFalse(
            MealTrust.shouldShowFatCaution(
                itemNames = listOf("Plain rice"),
                kcal = 200.0,
                fatG = 9.9,
            ),
        )
    }

    @Test
    fun `fat caution from name cues`() {
        assertTrue(
            MealTrust.shouldShowFatCaution(
                itemNames = listOf("Stir fry vegetables"),
                kcal = 100.0,
                fatG = 1.0,
            ),
        )
    }

    @Test
    fun `portion correction worth remembering outside 0_8 to 1_2 ratio`() {
        assertFalse(MealTrust.portionCorrectionWorthRemembering(100.0, 80.0))
        assertTrue(MealTrust.portionCorrectionWorthRemembering(100.0, 79.0))
        assertFalse(MealTrust.portionCorrectionWorthRemembering(100.0, 120.0))
        assertTrue(MealTrust.portionCorrectionWorthRemembering(100.0, 121.0))
        assertFalse(MealTrust.portionCorrectionWorthRemembering(0.0, 100.0))
        assertFalse(MealTrust.portionCorrectionWorthRemembering(100.0, 0.0))
    }
}
