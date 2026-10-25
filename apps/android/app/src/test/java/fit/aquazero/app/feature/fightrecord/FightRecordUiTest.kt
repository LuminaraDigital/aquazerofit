package fit.aquazero.app.feature.fightrecord

import fit.aquazero.app.core.data.fightRecordStatus
import fit.aquazero.app.core.model.BeltRungDto
import fit.aquazero.app.core.model.BeltTier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rules both Fight Record surfaces share: what the next belt asks for,
 * how full the bar is and which rungs are held. The sentences themselves are
 * string resources; what is tested here is the arithmetic and the choice of
 * sentence, which is where a wrong answer would come from.
 */
class FightRecordUiTest {

    @Test
    fun `the next belt is the gap to its threshold, singular at one`() {
        assertEquals(
            NextBelt.Days(days = 10, tier = BeltTier.PURPLE),
            NextBelt.of(fightRecordStatus(activeDays = 14).current),
        )
        assertEquals(
            NextBelt.Days(days = 1, tier = BeltTier.PURPLE),
            NextBelt.of(fightRecordStatus(activeDays = 23).current),
        )
    }

    @Test
    fun `holding black is the top of the ladder, and the bar is full`() {
        val current = fightRecordStatus(activeDays = 50, tier = BeltTier.BLACK, next = null).current

        assertEquals(NextBelt.TopOfLadder, NextBelt.of(current))
        assertEquals(1f, nextBeltProgress(current), 0f)
    }

    @Test
    fun `a next rung this build cannot name still gets its day count`() {
        val current = fightRecordStatus(activeDays = 50, next = BeltRungDto(BeltTier.UNKNOWN, 60)).current

        assertEquals(NextBelt.Days(10, BeltTier.UNKNOWN), NextBelt.of(current))
    }

    @Test
    fun `a snapshot out of step with itself never asks for zero days`() {
        val current = fightRecordStatus(activeDays = 30, next = BeltRungDto(BeltTier.PURPLE, 24)).current

        assertEquals(NextBelt.Days(1, BeltTier.PURPLE), NextBelt.of(current))
        assertEquals(1f, nextBeltProgress(current), 0f)
    }

    @Test
    fun `the bar fills toward the next belt`() {
        assertEquals(0.5f, nextBeltProgress(fightRecordStatus(activeDays = 12).current), 0.0001f)
        assertEquals(0f, nextBeltProgress(fightRecordStatus(activeDays = 0, tier = null).current), 0f)
    }

    @Test
    fun `rungs at or below the held belt are held, and none are before the first`() {
        assertTrue(isRungHeld(BeltTier.WHITE, BeltTier.BLUE))
        assertTrue(isRungHeld(BeltTier.BLUE, BeltTier.BLUE))
        assertFalse(isRungHeld(BeltTier.PURPLE, BeltTier.BLUE))
        assertFalse(isRungHeld(BeltTier.WHITE, null))
        // A tier newer than this build sits above every rung it knows.
        assertTrue(BeltTier.entries.all { isRungHeld(it, BeltTier.UNKNOWN) })
    }
}
