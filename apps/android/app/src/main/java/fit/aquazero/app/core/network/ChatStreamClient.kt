package fit.aquazero.app.core.network

import fit.aquazero.app.core.model.ApiErrorEnvelope
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.ChatMessageDto
import fit.aquazero.app.core.model.ChatSendRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
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
 *
 * Credit admission is not an SSE frame. The ledger answers HTTP 402 with a
 * JSON error envelope before any event stream starts, and [ChatStreamClient]
 * surfaces that as [ChatStreamEvent.Error] with [CHAT_CODE_CREDITS_INSUFFICIENT].
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
    val message: JsonElement? = null,
    val code: String? = null,
)

/**
 * SSE client for the streaming chat turn
 * (`POST /chat/sessions/:id/messages`, `Accept: text/event-stream`).
 * Emits a cold [Flow] of [ChatStreamEvent]s; collection cancels the source.
 */
@Singleton
class ChatStreamClient @Inject constructor(
    @param:Named("sse") private val okHttpClient: OkHttpClient,
    @param:Named("apiBaseUrl") private val baseUrl: String,
) {

    /**
     * Open a streaming turn on [sessionId] with the user's [content].
     *
     * [localDate] is sent on the body so today's logs are the day the device
     * logged them against, not the server's fallback zone.
     */
    fun stream(sessionId: String, content: String, localDate: String): Flow<ChatStreamEvent> = callbackFlow {
        val body = AzfJson
            .encodeToString(
                ChatSendRequest.serializer(),
                ChatSendRequest(content = content, localDate = localDate),
            )
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
                                message = frame.message.asDisplayText(),
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
                if (!finished) {
                    val admission = response?.let { chatStreamAdmissionError(it) }
                    if (admission != null) {
                        finished = true
                        trySend(admission)
                    } else {
                        trySend(ChatStreamEvent.TransportError(t))
                    }
                }
                close()
            }
        }

        val source = EventSources.createFactory(okHttpClient).newEventSource(request, listener)
        awaitClose { source.cancel() }
    }
}

/**
 * Render an SSE frame's `message` as text fit for a user.
 *
 * The field is typed [JsonElement] because the `done` frame carries a message
 * *object*, but the `error` frame carries a plain string - and `toString()` on
 * a string [JsonPrimitive] re-emits it in JSON form, quotes included. Server
 * error copy was reaching the UI as `"Something went wrong"`, quote marks and
 * all. Unwrap the primitive; fall back to the raw form for any other shape so
 * an unexpected payload degrades to something inspectable rather than empty.
 */
private fun JsonElement?.asDisplayText(): String {
    val primitive = this as? JsonPrimitive ?: return this?.toString().orEmpty()
    return if (primitive.isString) primitive.content else primitive.toString()
}

/**
 * Credit admission fails before the response is an event stream: HTTP 402,
 * body `{code: CREDITS_INSUFFICIENT, message, details?}`. OkHttp reports that
 * as [EventSourceListener.onFailure] with the response still attached, not as
 * an `error` frame. Either the status or the envelope code is enough. The
 * screen does not show [ChatStreamEvent.Error.message] for this code. The
 * ledger sentence is not the product copy.
 */
internal fun chatStreamAdmissionError(response: Response): ChatStreamEvent.Error? {
    val body = runCatching { response.peekBody(ADMISSION_BODY_BYTES).string() }.getOrNull()
    return chatStreamAdmissionError(response.code, body)
}

internal fun chatStreamAdmissionError(httpStatus: Int, body: String?): ChatStreamEvent.Error? {
    val envelope = body?.takeIf { it.isNotBlank() }?.let { raw ->
        runCatching { AzfJson.decodeFromString(ApiErrorEnvelope.serializer(), raw) }.getOrNull()
    }
    val code = envelope?.code
    if (httpStatus != HTTP_PAYMENT_REQUIRED && code != CHAT_CODE_CREDITS_INSUFFICIENT) {
        return null
    }
    return ChatStreamEvent.Error(
        code = CHAT_CODE_CREDITS_INSUFFICIENT,
        message = envelope?.message.orEmpty(),
    )
}

/** Bytes of an admission body worth inspecting. Error envelopes are tiny. */
private const val ADMISSION_BODY_BYTES: Long = 64L * 1024L

internal const val HTTP_PAYMENT_REQUIRED: Int = 402
internal const val CHAT_CODE_CREDITS_INSUFFICIENT: String = "CREDITS_INSUFFICIENT"
