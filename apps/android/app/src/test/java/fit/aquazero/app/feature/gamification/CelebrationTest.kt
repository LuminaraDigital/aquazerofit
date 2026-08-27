package fit.aquazero.app.feature.gamification

import fit.aquazero.app.core.model.CoachExpression
import fit.aquazero.app.core.model.CoachRankDto
import fit.aquazero.app.core.model.CoachReactionDto
import fit.aquazero.app.core.model.ExperienceStatusDto
import fit.aquazero.app.core.model.ProgressionStatusDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What earns a moment, and what the acknowledgement is allowed to claim.
 */
class CelebrationTest {

    private val experience = ExperienceStatusDto(
        totalXp = 1_800,
        level = 7,
        rank = CoachRankDto("prospect", "Prospect", 5),
        levelStartXp = 1_575,
        nextLevelXp = 2_100,
        levelProgress = 0.43,
    )

    private fun status(vararg reactions: CoachReactionDto) = ProgressionStatusDto(
        experience = experience,
        activeCoachId = "akin",
        reactions = reactions.toList(),
    )

    private fun reaction(kind: String, text: String = "line") =
        CoachReactionDto("akin", kind, text, CoachExpression.CELEBRATE)

    @Test
    fun `only the three celebratory kinds earn a moment`() {
        val queue = celebrationsOf(
            status(
                reaction("levelUp"),
                reaction("achievement"),
                reaction("steady"),
                reaction("greeting"),
                reaction("restDay"),
                reaction("resting"),
                reaction("returning"),
            ),
        )

        assertEquals(2, queue.size)
        assertTrue(queue[0] is Celebration.LevelUp)
        assertTrue(queue[1] is Celebration.Achievement)
    }

    @Test
    fun `ambient reactions alone produce an empty queue`() {
        assertTrue(celebrationsOf(status(reaction("greeting"))).isEmpty())
        assertTrue(celebrationsOf(status(reaction("steady"))).isEmpty())
    }

    @Test
    fun `a level-up carries the authored line verbatim`() {
        val text = "Level 7. You didn't get that from one big day, you got it from turning up."
        val queue = celebrationsOf(status(reaction("levelUp", text)))
        val moment = queue.single() as Celebration.LevelUp

        assertEquals(text, moment.reaction)
        assertEquals(7, moment.level)
        assertEquals("Prospect", moment.rankName)
        assertEquals("akin", moment.coachId)
    }

    @Test
    fun `a rank-up carries the rank id so the ack can name it`() {
        val queue = celebrationsOf(status(reaction("rankUp", "Prospect. Earned.")))
        val moment = queue.single() as Celebration.RankUp

        assertEquals("prospect", moment.rankId)
        assertEquals(7, moment.level)
    }

    @Test
    fun `the ack is built from what was shown, not from the latest snapshot`() {
        val shown = listOf(
            Celebration.LevelUp(6, "Prospect", "akin", "line"),
        )
        // The server has since moved on to level 9; the ack must still speak
        // for the moment that was actually on screen.
        val ahead = experience.copy(level = 9)

        val ack = ackRequestFor(shown, ahead)

        assertEquals(6, ack.level)
        assertNull(ack.rankId)
    }

    @Test
    fun `a rank-up in the shown queue contributes its rank id`() {
        val shown = listOf(
            Celebration.RankUp("heavens", "Heavens Bracket", 14, "ogun", "line"),
        )
        val ack = ackRequestFor(shown, experience)

        assertEquals("heavens", ack.rankId)
        assertEquals(14, ack.level)
    }

    @Test
    fun `an achievement-only queue acks at the current level`() {
        val shown = listOf(Celebration.Achievement("akin", "First full week"))
        val ack = ackRequestFor(shown, experience)

        assertEquals(experience.level, ack.level)
        assertNull(ack.rankId)
    }

    @Test
    fun `the full-screen treatment is reserved for level and rank`() {
        assertTrue(
            CelebrationUiState(
                queue = listOf(Celebration.LevelUp(7, "Prospect", "akin", "x")),
            ).isFullScreen,
        )
        assertTrue(
            CelebrationUiState(
                queue = listOf(Celebration.RankUp("prospect", "Prospect", 7, "akin", "x")),
            ).isFullScreen,
        )
        assertEquals(
            false,
            CelebrationUiState(queue = listOf(Celebration.Achievement("akin", "x"))).isFullScreen,
        )
        assertEquals(false, CelebrationUiState().isFullScreen)
    }
}
