package fit.aquazero.app.core.network

import fit.aquazero.app.feature.coach.ChatTurnRunner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Credit admission is a JSON 402, not an SSE error frame. The chat client has
 * to turn that response into [ChatStreamEvent.Error] or the turn runner treats
 * the send as a dropped stream.
 */
class ChatStreamAdmissionTest {

    @Test
    fun `HTTP 402 with CREDITS_INSUFFICIENT becomes a credits error`() {
        val body = """
            {"code":"CREDITS_INSUFFICIENT","message":"You have run out of AI credits for today.","details":{"required":1,"available":0,"task":"chatTurn"}}
        """.trimIndent()

        val event = chatStreamAdmissionError(response(HTTP_PAYMENT_REQUIRED, body))

        assertEquals(
            ChatStreamEvent.Error(
                code = ChatTurnRunner.CODE_CREDITS_INSUFFICIENT,
                message = "You have run out of AI credits for today.",
            ),
            event,
        )
        assertEquals(CHAT_CODE_CREDITS_INSUFFICIENT, event?.code)
    }

    @Test
    fun `a 402 with an unreadable body is still out of credits`() {
        assertEquals(
            ChatStreamEvent.Error(CHAT_CODE_CREDITS_INSUFFICIENT, ""),
            chatStreamAdmissionError(HTTP_PAYMENT_REQUIRED, "<html>nope</html>"),
        )
    }

    @Test
    fun `the credits code counts even when the status is not 402`() {
        val body = """{"code":"CREDITS_INSUFFICIENT","message":"empty"}"""
        assertEquals(
            ChatStreamEvent.Error(CHAT_CODE_CREDITS_INSUFFICIENT, "empty"),
            chatStreamAdmissionError(500, body),
        )
    }

    @Test
    fun `other failures stay transport problems`() {
        val body = """{"code":"INTERNAL","message":"Internal server error"}"""
        assertNull(chatStreamAdmissionError(500, body))
        assertNull(chatStreamAdmissionError(response(200, body)))
    }

    private fun response(code: Int, body: String): Response =
        Response.Builder()
            .request(
                Request.Builder()
                    .url("https://api.aquazero.fit/chat/sessions/s1/messages")
                    .build(),
            )
            .protocol(Protocol.HTTP_1_1)
            .code(code)
            .message("status")
            .body(body.toResponseBody("application/json".toMediaType()))
            .build()
}
