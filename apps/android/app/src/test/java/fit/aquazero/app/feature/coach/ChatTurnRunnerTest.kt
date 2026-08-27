package fit.aquazero.app.feature.coach

import fit.aquazero.app.core.network.ChatStreamEvent
import fit.aquazero.app.core.model.ChatMessageDto
import fit.aquazero.app.core.model.ChatRole
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The SSE contract and its recovery path.
 *
 * The case worth staring at is [dropped stream recovers only on a new
 * assistant message]: the user's own turn persists on every path, so a poll
 * that watched the message *count* would "recover" the user's own sentence and
 * present it as the coach's reply.
 */
class ChatTurnRunnerTest {

    private fun message(
        id: String,
        role: ChatRole,
        content: String = "hi",
    ) = ChatMessageDto(
        id = id,
        sessionId = "s1",
        userId = "u1",
        role = role,
        content = content,
        createdAt = "2026-08-27T10:00:00.000Z",
    )

    private class FakeGateway(
        val events: List<ChatStreamEvent>,
        val pollResults: List<List<ChatMessageDto>?> = emptyList(),
    ) : ChatTurnGateway {
        var refreshCount = 0
            private set

        override fun stream(sessionId: String, content: String): Flow<ChatStreamEvent> = flow {
            events.forEach { emit(it) }
        }

        override suspend fun refreshMessages(sessionId: String): List<ChatMessageDto>? {
            val index = refreshCount
            refreshCount += 1
            return pollResults.getOrNull(index)
        }
    }

    private fun runner(gateway: ChatTurnGateway, slept: MutableList<Long> = mutableListOf()) =
        ChatTurnRunner(gateway, sleep = { slept += it })

    @Test
    fun `tokens are emitted in order and done completes the turn`() = runTest {
        val gateway = FakeGateway(
            events = listOf(
                ChatStreamEvent.Token("Hello"),
                ChatStreamEvent.Token(" there"),
                ChatStreamEvent.Done(null),
            ),
            pollResults = listOf(emptyList()),
        )
        val tokens = mutableListOf<String>()

        val result = runner(gateway).run("s1", "hi", emptySet()) { tokens += it }

        assertEquals(ChatTurnResult.Completed, result)
        assertEquals(listOf("Hello", " there"), tokens)
        // One refresh to sync history — not a poll loop.
        assertEquals(1, gateway.refreshCount)
    }

    @Test
    fun `safety codes end the turn without a system frame`() = runTest {
        listOf("SAFETY_INPUT", "SAFETY_OUTPUT").forEach { code ->
            val gateway = FakeGateway(
                events = listOf(ChatStreamEvent.Error(code, "blocked")),
                pollResults = listOf(emptyList()),
            )
            val result = runner(gateway).run("s1", "hi", emptySet()) {}
            assertEquals(ChatTurnResult.SafetyHandled(code), result)
            assertEquals(1, gateway.refreshCount)
        }
    }

    @Test
    fun `AI_UNAVAILABLE is terminal and never polls`() = runTest {
        val slept = mutableListOf<Long>()
        val gateway = FakeGateway(
            events = listOf(ChatStreamEvent.Error("AI_UNAVAILABLE", "no gateway")),
        )

        val result = runner(gateway, slept).run("s1", "hi", emptySet()) {}

        assertEquals(ChatTurnResult.Unavailable, result)
        assertEquals(0, gateway.refreshCount)
        assertTrue(slept.isEmpty())
    }

    @Test
    fun `dropped stream recovers a new assistant message`() = runTest {
        val known = message("a1", ChatRole.ASSISTANT)
        val fresh = message("a2", ChatRole.ASSISTANT, "the recovered reply")
        val gateway = FakeGateway(
            events = listOf(
                ChatStreamEvent.Token("part"),
                ChatStreamEvent.TransportError(null),
            ),
            pollResults = listOf(
                listOf(known),
                listOf(known, fresh),
            ),
        )

        val result = runner(gateway).run("s1", "hi", setOf("a1")) {}

        assertTrue(result is ChatTurnResult.Recovered)
        assertEquals("a2", (result as ChatTurnResult.Recovered).message.id)
        assertEquals(2, gateway.refreshCount)
    }

    @Test
    fun `a new user message alone is never mistaken for a reply`() = runTest {
        // The user's turn persists even when the reply never does. A count-based
        // poll would stop here and render the user's own words as the coach's.
        val known = message("a1", ChatRole.ASSISTANT)
        val userTurn = message("u9", ChatRole.USER, "what should I eat?")
        val gateway = FakeGateway(
            events = listOf(ChatStreamEvent.TransportError(RuntimeException("closed"))),
            pollResults = List(ChatTurnRunner.POLL_ATTEMPTS) { listOf(known, userTurn) },
        )

        val result = runner(gateway).run("s1", "hi", setOf("a1")) {}

        assertEquals(ChatTurnResult.Dropped, result)
    }

    @Test
    fun `the poll is bounded to four attempts over about fifteen seconds`() = runTest {
        val slept = mutableListOf<Long>()
        val gateway = FakeGateway(
            events = listOf(ChatStreamEvent.TransportError(null)),
            pollResults = List(10) { emptyList() },
        )

        val result = runner(gateway, slept).run("s1", "hi", emptySet()) {}

        assertEquals(ChatTurnResult.Dropped, result)
        assertEquals(ChatTurnRunner.POLL_ATTEMPTS, gateway.refreshCount)
        assertEquals(ChatTurnRunner.POLL_ATTEMPTS, slept.size)
        val total = slept.sum()
        assertTrue("bounded to ~15s, was ${total}ms", total in 12_000L..16_000L)
    }

    @Test
    fun `a failed refresh costs an attempt but does not end the poll`() = runTest {
        val fresh = message("a2", ChatRole.ASSISTANT)
        val gateway = FakeGateway(
            events = listOf(ChatStreamEvent.TransportError(null)),
            // null = the refresh itself failed; absence of evidence, not evidence.
            pollResults = listOf(null, null, listOf(fresh)),
        )

        val result = runner(gateway).run("s1", "hi", emptySet()) {}

        assertTrue(result is ChatTurnResult.Recovered)
        assertEquals(3, gateway.refreshCount)
    }

    @Test
    fun `a stream that closes after done does not trigger recovery`() = runTest {
        val slept = mutableListOf<Long>()
        val gateway = FakeGateway(
            events = listOf(
                ChatStreamEvent.Token("done soon"),
                ChatStreamEvent.Done(message("a2", ChatRole.ASSISTANT)),
                // OkHttp's onClosed can still arrive; it must not re-open the turn.
                ChatStreamEvent.TransportError(null),
            ),
            pollResults = listOf(emptyList()),
        )

        val result = runner(gateway, slept).run("s1", "hi", emptySet()) {}

        // TransportError after a settled outcome does not reset it.
        assertNull(slept.firstOrNull())
        assertEquals(ChatTurnResult.Completed, result)
    }
}
