package fit.aquazero.app.feature.coach

import fit.aquazero.app.R
import fit.aquazero.app.core.database.ChatMessageEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The 2026-11-02 coach replay: a 402 was rendered as the dropped-reply line
 * ("your message is saved") and the sent sentence was then removed. Out of
 * credits uses the meal-plan sentence, and the optimistic user line stays.
 */
class CoachTurnOutcomeTest {

    private val sent = "What should I eat tonight?"

    @Test
    fun `a credits refusal names credits and keeps the sent line`() {
        assertEquals(TurnFailure.OutOfCredits, coachTurnFailure(ChatTurnResult.OutOfCredits))
        assertEquals(
            R.string.coach_error_credits,
            coachTurnFailureMessageRes(TurnFailure.OutOfCredits),
        )
        assertEquals(
            sent,
            pendingUserMessageAfterTurn(
                result = ChatTurnResult.OutOfCredits,
                sent = sent,
                pending = null,
                messages = listOf(user(sent)),
            ),
        )
    }

    @Test
    fun `history refreshing does not hide a credits refusal line`() {
        val kept = retainPendingUserMessage(
            pending = sent,
            failure = TurnFailure.OutOfCredits,
            messages = listOf(user(sent)),
        )
        assertEquals(sent, kept)
    }

    @Test
    fun `dismissing the credits note leaves the sent line in the thread`() {
        assertEquals(
            sent,
            pendingUserMessageAfterDismiss(TurnFailure.OutOfCredits, sent),
        )
    }

    @Test
    fun `a dropped reply keeps the line until history actually has it`() {
        assertEquals(
            sent,
            pendingUserMessageAfterTurn(
                result = ChatTurnResult.Dropped,
                sent = sent,
                pending = null,
                messages = emptyList(),
            ),
        )
        assertNull(
            pendingUserMessageAfterTurn(
                result = ChatTurnResult.Dropped,
                sent = sent,
                pending = sent,
                messages = listOf(user(sent)),
            ),
        )
        assertEquals(
            sent,
            pendingUserMessageAfterDismiss(TurnFailure.Dropped, sent),
        )
    }

    @Test
    fun `a finished turn drops the optimistic line`() {
        assertNull(coachTurnFailure(ChatTurnResult.Completed))
        assertNull(
            pendingUserMessageAfterTurn(
                result = ChatTurnResult.Completed,
                sent = sent,
                pending = sent,
                messages = emptyList(),
            ),
        )
    }

    @Test
    fun `an ordinary history emit still retires a line that has landed`() {
        assertNull(
            retainPendingUserMessage(
                pending = sent,
                failure = null,
                messages = listOf(user(sent)),
            ),
        )
    }

    private fun user(content: String) = ChatMessageEntity(
        id = "m-$content",
        sessionId = "s1",
        role = "user",
        content = content,
    )
}
