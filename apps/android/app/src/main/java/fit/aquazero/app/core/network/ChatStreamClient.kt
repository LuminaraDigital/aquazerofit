package fit.aquazero.app.core.network

import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.ChatMessageDto
import fit.aquazero.app.core.model.ChatSendRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/**
 * One frame of the chat stream, per the API's SSE contract
 * (`{type: token|done|error}` with error codes
 * `SAFETY_INPUT` / `SAFETY_OUTPUT` / `AI_UNAVAILABLE`).
 */
sealed interface ChatStreamEvent {
    /** One generated token. */
    data class Token(val text: String) : ChatStreamEvent

    /** Stream complete; the persisted assistant message. */
    data class Done(val message: ChatMessageDto?) : ChatStreamEvent

    /** Server-signaled error frame. */
    data class Error(val code: String, val message: String) : ChatStreamEvent

    /** Transport failure (connection dropped before `done`). */
    data class TransportError(val cause: Throwable?) : ChatStreamEvent
}

/** Raw SSE frame shape. */
@Serializable
private data class SseFrame(
    val type: String,
    val token: String? = null,
    val message: kotlinx.serialization.json.JsonElement? = null,
    val code: String? = null,
)

/**
 * SSE client for the streaming chat turn
 * (`POST /chat/sessions/:id/messages`, `Accept: text/event-stream`).
 * Emits a cold [Flow] of [ChatStreamEvent]s; collection cancels the source.
 */
@Singleton
class ChatStreamClient @Inject constructor(
    @Named("api") private val okHttpClient: OkHttpClient,
    @Named("apiBaseUrl") private val baseUrl: String,
) {

    /** Open a streaming turn on [sessionId] with the user's [content]. */
    fun stream(sessionId: String, content: String): Flow<ChatStreamEvent> = callbackFlow {
        val body = AzfJson
            .encodeToString(ChatSendRequest.serializer(), ChatSendRequest(content))
            .toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("$baseUrl/chat/sessions/$sessionId/messages")
            .header("Accept", "text/event-stream")
            .post(body)
            .build()

        val listener = object : EventSourceListener() {
            private var finished = false

            override fun onEvent(
                eventSource: EventSource,
                id: String?,
                type: String?,
                data: String,
            ) {
                val frame = runCatching {
                    AzfJson.decodeFromString(SseFrame.serializer(), data)
                }.getOrNull() ?: return
                when (frame.type) {
                    "token" -> trySend(ChatStreamEvent.Token(frame.token.orEmpty()))
                    "done" -> {
                        finished = true
                        val message = frame.message?.let {
                            runCatching {
                                AzfJson.decodeFromJsonElement(ChatMessageDto.serializer(), it)
                            }.getOrNull()
                        }
                        trySend(ChatStreamEvent.Done(message))
                        close()
                    }
                    "error" -> {
                        finished = true
                        trySend(
                            ChatStreamEvent.Error(
                                code = frame.code ?: "AI_UNAVAILABLE",
                                message = frame.message?.toString().orEmpty(),
                            ),
                        )
                        close()
                    }
                }
            }

            override fun onClosed(eventSource: EventSource) {
                if (!finished) trySend(ChatStreamEvent.TransportError(null))
                close()
            }

            override fun onFailure(
                eventSource: EventSource,
                t: Throwable?,
                response: Response?,
            ) {
                if (!finished) trySend(ChatStreamEvent.TransportError(t))
                close()
            }
        }

        val source = EventSources.createFactory(okHttpClient).newEventSource(request, listener)
        awaitClose { source.cancel() }
    }
}
