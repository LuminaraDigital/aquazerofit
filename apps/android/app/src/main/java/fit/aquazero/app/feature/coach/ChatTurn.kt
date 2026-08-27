package fit.aquazero.app.feature.coach

import fit.aquazero.app.core.network.ChatStreamEvent
import fit.aquazero.app.core.model.ChatMessageDto
import fit.aquazero.app.core.model.ChatRole
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow

/**
 * One chat turn: stream it, and when the stream dies mid-flight, find out
 * whether the reply landed anyway.
 *
 * The recovery rule is a property of the *server*, verified rather than
 * assumed: the assistant message is persisted **before** the `done` frame is
 * written. So a dropped connection is ambiguous — the reply may exist. What it
 * is never safe to poll for is a change in message *count*, because the user's
 * own message is persisted on every path including the failing ones; a count
 * poll would "recover" the user's own turn and render an empty reply. The poll
 * therefore looks for **a new assistant message id** against the set that
 * existed before the send.
 *
 * `AI_UNAVAILABLE` is the one error that persists nothing, so it is terminal
 * and never polls. `SAFETY_INPUT` / `SAFETY_OUTPUT` are the opposite: the
 * server has already written a supportive assistant message, so the turn ends
 * with a single refresh and no system frame — otherwise the refusal shows
 * twice, once from the frame and once from history.
 *
 * The poll is bounded (4 attempts over ~15 s). Past that the "awaiting reply"
 * state is released whatever happened, because a composer that stays disabled
 * forever is a worse failure than a reply the user has to ask for again.
 */
sealed interface ChatTurnResult {

    /** The stream finished normally. */
    data object Completed : ChatTurnResult

    /** The stream dropped, but the poll found the persisted reply. */
    data class Recovered(val message: ChatMessageDto) : ChatTurnResult

    /**
     * A guardrail fired. The supportive reply is already in history — render
     * nothing extra. [code] is `SAFETY_INPUT` or `SAFETY_OUTPUT`.
     */
    data class SafetyHandled(val code: String) : ChatTurnResult

    /** `AI_UNAVAILABLE`: nothing was persisted, and nothing will be. */
    data object Unavailable : ChatTurnResult

    /** The stream dropped and the bounded poll never found a reply. */
    data object Dropped : ChatTurnResult
}

/** Everything a turn needs from the data layer, narrowed so it can be faked. */
interface ChatTurnGateway {

    /** Open the SSE turn. */
    fun stream(sessionId: String, content: String): Flow<ChatStreamEvent>

    /**
     * Refresh the session's history and return it, or `null` when the refresh
     * itself failed (offline, 5xx). A failed refresh is not evidence of
     * absence, so it costs an attempt rather than ending the poll.
     */
    suspend fun refreshMessages(sessionId: String): List<ChatMessageDto>?
}

/**
 * Runs a turn against [gateway]. [sleep] is injected so the bounded poll can
 * be tested without fifteen seconds of real time.
 */
class ChatTurnRunner(
    private val gateway: ChatTurnGateway,
    private val attempts: Int = POLL_ATTEMPTS,
    private val intervalMs: Long = POLL_INTERVAL_MS,
    private val sleep: suspend (Long) -> Unit = { delay(it) },
) {

    /**
     * Stream a turn, emitting tokens through [onToken].
     *
     * [knownAssistantIds] must be captured *before* the send — it is the
     * baseline the recovery poll compares against.
     */
    suspend fun run(
        sessionId: String,
        content: String,
        knownAssistantIds: Set<String>,
        onToken: (String) -> Unit,
    ): ChatTurnResult {
        var outcome: ChatTurnResult? = null

        gateway.stream(sessionId, content).collect { event ->
            when (event) {
                is ChatStreamEvent.Token -> onToken(event.text)

                is ChatStreamEvent.Done -> outcome = ChatTurnResult.Completed

                is ChatStreamEvent.Error -> outcome = when (event.code) {
                    CODE_SAFETY_INPUT, CODE_SAFETY_OUTPUT ->
                        ChatTurnResult.SafetyHandled(event.code)
                    else -> ChatTurnResult.Unavailable
                }

                // Leaves `outcome` exactly as it was. An unsettled turn stays
                // null and falls through to recovery; a settled one is not
                // reopened by OkHttp's close callback arriving after `done`.
                is ChatStreamEvent.TransportError -> Unit
            }
        }

        return when (val settled = outcome) {
            // Both of these persisted something; sync history before returning.
            ChatTurnResult.Completed, is ChatTurnResult.SafetyHandled -> {
                gateway.refreshMessages(sessionId)
                settled
            }
            // Nothing was written and nothing will be: do not poll for a ghost.
            ChatTurnResult.Unavailable -> settled
            else -> recover(sessionId, knownAssistantIds)
        }
    }

    /** Bounded hunt for an assistant message that was not there before. */
    private suspend fun recover(
        sessionId: String,
        knownAssistantIds: Set<String>,
    ): ChatTurnResult {
        repeat(attempts) { attempt ->
            sleep(intervalMs)
            val messages = gateway.refreshMessages(sessionId)
            val fresh = messages?.firstOrNull { message ->
                message.role == ChatRole.ASSISTANT && message.id !in knownAssistantIds
            }
            if (fresh != null) return ChatTurnResult.Recovered(fresh)
            if (attempt == attempts - 1) return ChatTurnResult.Dropped
        }
        return ChatTurnResult.Dropped
    }

    companion object {
        /** Four looks over roughly fifteen seconds, then let the user go. */
        const val POLL_ATTEMPTS: Int = 4
        const val POLL_INTERVAL_MS: Long = 3_800L

        const val CODE_SAFETY_INPUT: String = "SAFETY_INPUT"
        const val CODE_SAFETY_OUTPUT: String = "SAFETY_OUTPUT"
        const val CODE_AI_UNAVAILABLE: String = "AI_UNAVAILABLE"
    }
}
