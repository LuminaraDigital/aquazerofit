package fit.aquazero.app.core.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CoachPromptStoreTest {

    private val store = CoachPromptStore()

    @Test
    fun publishAndConsumeRoundTrip() {
        store.publish("How much protein do I need?", autoSend = true)
        val pending = store.consume()
        assertEquals(PendingCoachPrompt("How much protein do I need?", autoSend = true), pending)
        assertNull(store.consume())
    }

    @Test
    fun blankPromptIsIgnored() {
        store.publish("   ")
        assertNull(store.consume())
    }
}
