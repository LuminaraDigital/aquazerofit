package fit.aquazero.app.core.gamification

import fit.aquazero.app.core.model.CoachRankDto
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.core.model.XpBreakdownEntryDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The level curve, the rank bands, and the one rule that is not negotiable:
 * **XP never decreases.**
 */
class XpMathTest {

    @Test
    fun `the level curve matches the shared triangular formula`() {
        assertEquals(0, XpMath.xpForLevel(1))
        assertEquals(75, XpMath.xpForLevel(2))
        assertEquals(225, XpMath.xpForLevel(3))
        assertEquals(450, XpMath.xpForLevel(4))
        assertEquals(750, XpMath.xpForLevel(5))
    }

    @Test
    fun `levelForXp is exact at every boundary up to the cap`() {
        for (level in 1..XpMath.MAX_LEVEL) {
            val start = XpMath.xpForLevel(level)
            assertEquals("at the start of level $level", level, XpMath.levelForXp(start))
            if (level > 1) {
                assertEquals(
                    "one XP short of level $level",
                    level - 1,
                    XpMath.levelForXp(start - 1),
                )
            }
        }
    }

    @Test
    fun `levelForXp is monotonically non-decreasing across the whole range`() {
        var previous = 1
        var xp = 0
        while (xp <= XpMath.xpForLevel(XpMath.MAX_LEVEL) + 1_000) {
            val level = XpMath.levelForXp(xp)
            assertTrue("level fell at $xp XP", level >= previous)
            previous = level
            xp += 37
        }
    }

    @Test
    fun `the ladder tops out rather than running away`() {
        assertEquals(XpMath.MAX_LEVEL, XpMath.levelForXp(Int.MAX_VALUE / 2))
        assertEquals(1f, XpMath.levelProgress(Int.MAX_VALUE / 2))
    }

    @Test
    fun `negative or absurd totals are clamped, never negative levels`() {
        assertEquals(1, XpMath.levelForXp(-500))
        assertEquals(0f, XpMath.levelProgress(-500))
    }

    @Test
    fun `rank bands follow the Heavens bracket`() {
        assertEquals("rookie", rankForLevel(1).id)
        assertEquals("rookie", rankForLevel(2).id)
        assertEquals("contender", rankForLevel(3).id)
        assertEquals("prospect", rankForLevel(6).id)
        assertEquals("ranked", rankForLevel(8).id)
        assertEquals("top-eight", rankForLevel(13).id)
        assertEquals("heavens", rankForLevel(14).id)
        assertEquals("champion", rankForLevel(50).id)
    }

    @Test
    fun `bond is linear and stops at ten`() {
        assertEquals(1, Bond.levelForXp(0))
        assertEquals(2, Bond.levelForXp(250))
        assertEquals(3, Bond.levelForXp(500))
        assertEquals(Bond.MAX_LEVEL, Bond.levelForXp(999_999))
    }

    // -----------------------------------------------------------------------
    // The ratchet
    // -----------------------------------------------------------------------

    private fun status(totalXp: Int, level: Int, earnedToday: Int = 0) = ExperienceStatusDto(
        totalXp = totalXp,
        level = level,
        rank = CoachRankDto("rookie", "Rookie", 1),
        levelStartXp = XpMath.xpForLevel(level),
        nextLevelXp = XpMath.xpForLevel(level + 1),
        levelProgress = 0.0,
        earnedToday = earnedToday,
    )

    @Test
    fun `a stale snapshot can never lower the total or the level`() {
        val ratchet = MonotonicExperience()
        ratchet.accept(status(totalXp = 1_200, level = 6))

        val stale = ratchet.accept(status(totalXp = 900, level = 5))

        assertEquals(1_200, stale.totalXp)
        assertEquals(6, stale.level)
    }

    @Test
    fun `a genuinely higher snapshot moves everything forward`() {
        val ratchet = MonotonicExperience()
        ratchet.accept(status(totalXp = 1_200, level = 6))

        val fresh = ratchet.accept(status(totalXp = 2_000, level = 7))

        assertEquals(2_000, fresh.totalXp)
        assertEquals(XpMath.levelForXp(2_000), fresh.level)
        assertEquals(XpMath.xpForLevel(fresh.level), fresh.levelStartXp)
    }

    @Test
    fun `the level is recomputed from the ratcheted total, not trusted blindly`() {
        val ratchet = MonotonicExperience()
        // A payload claiming level 2 on 5,000 XP is wrong; the curve wins.
        val merged = ratchet.accept(status(totalXp = 100, level = 2))
            .let { ratchet.accept(status(totalXp = 5_000, level = 2)) }

        assertEquals(XpMath.levelForXp(5_000), merged.level)
        assertEquals(rankForLevel(merged.level).name, merged.rank.name)
    }

    @Test
    fun `earned today holds its floor while the total is unchanged`() {
        val ratchet = MonotonicExperience()
        ratchet.accept(status(totalXp = 1_200, level = 6, earnedToday = 85))

        val stale = ratchet.accept(status(totalXp = 1_200, level = 6, earnedToday = 20))

        assertEquals(85, stale.earnedToday)
    }

    @Test
    fun `the daily cap flag follows the ratcheted earnings`() {
        val ratchet = MonotonicExperience()
        ratchet.accept(status(totalXp = 1_200, level = 6, earnedToday = 100))
        val capped = ratchet.accept(
            status(totalXp = 1_250, level = 6, earnedToday = XpMath.MAX_PER_DAY),
        )

        assertTrue(capped.dailyCapReached)
    }

    @Test
    fun `a hundred out-of-order snapshots never produce a decrease`() {
        val ratchet = MonotonicExperience()
        val shuffled = (0..100).map { it * 63 }.shuffled(kotlin.random.Random(7))
        var highest = 0
        shuffled.forEach { xp ->
            val merged = ratchet.accept(status(xp, XpMath.levelForXp(xp)))
            assertTrue("total fell to ${merged.totalXp} from $highest", merged.totalXp >= highest)
            highest = merged.totalXp
        }
    }

    @Test
    fun `top of the ladder reports no next level`() {
        val ratchet = MonotonicExperience()
        val merged = ratchet.accept(status(totalXp = 1_000, level = 5)).let {
            ratchet.accept(status(totalXp = XpMath.xpForLevel(XpMath.MAX_LEVEL), level = 50))
        }

        assertEquals(XpMath.MAX_LEVEL, merged.level)
        assertNull(merged.nextLevelXp)
    }

    @Test
    fun `banked framing exposes progress, never a shortfall`() {
        val experience = ExperienceStatusDto(
            totalXp = 1_240,
            level = 6,
            levelStartXp = 1_125,
            nextLevelXp = 1_575,
            todayBreakdown = listOf(XpBreakdownEntryDto("activeDay", "Showed up", 20)),
        )
        assertEquals(115, experience.bankedIntoLevel)
        assertEquals(450, experience.levelSpan)
    }

    @Test
    fun `grouped formats thousands without a locale dependency`() {
        assertEquals("0", 0.grouped())
        assertEquals("999", 999.grouped())
        assertEquals("1,000", 1_000.grouped())
        assertEquals("12,345", 12_345.grouped())
    }
}
