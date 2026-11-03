package fit.aquazero.app.feature.coach

import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.ChatSendRequest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class ChatContextRequestTest {

    @Test
    fun `a chat turn sends the device local date with the message`() {
        val wire = AzfJson.encodeToString(
            ChatSendRequest.serializer(),
            ChatSendRequest(content = "How am I doing today?", localDate = "2026-11-02"),
        )
        val json = AzfJson.parseToJsonElement(wire).jsonObject
        assertEquals("How am I doing today?", json.getValue("content").jsonPrimitive.content)
        assertEquals("2026-11-02", json.getValue("localDate").jsonPrimitive.content)
    }
}
