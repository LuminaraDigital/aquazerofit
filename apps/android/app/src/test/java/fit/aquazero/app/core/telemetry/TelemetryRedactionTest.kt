package fit.aquazero.app.core.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The redaction backstop. These cases are the ones that actually reach a crash
 * report in practice: an exception message that interpolated the request it
 * failed on, and a custom key holding whatever the caller had to hand.
 */
class TelemetryRedactionTest {

    @Test
    fun `strips an email address from a message`() {
        val scrubbed = TelemetryRedaction.scrub("login failed for ada@example.com after 3 tries")

        assertFalse(scrubbed.contains("ada@example.com"))
        assertTrue(scrubbed.contains(TelemetryRedaction.REDACTED))
        assertTrue("surrounding text is kept", scrubbed.contains("after 3 tries"))
    }

    @Test
    fun `strips a jwt`() {
        val jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLWhlcmU"

        val scrubbed = TelemetryRedaction.scrub("refresh rejected: $jwt")

        assertFalse(scrubbed.contains("eyJ"))
        assertEquals("refresh rejected: ${TelemetryRedaction.REDACTED}", scrubbed)
    }

    @Test
    fun `strips a bearer header value`() {
        val scrubbed = TelemetryRedaction.scrub("Authorization: Bearer abc.def-ghi_jkl")

        assertFalse(scrubbed.contains("abc.def-ghi_jkl"))
        assertTrue(scrubbed.contains(TelemetryRedaction.REDACTED))
    }

    @Test
    fun `truncates an oversized value`() {
        val scrubbed = TelemetryRedaction.scrub("x".repeat(TelemetryRedaction.MAX_VALUE_LENGTH * 2))

        assertEquals(TelemetryRedaction.MAX_VALUE_LENGTH + 1, scrubbed.length)
        assertTrue(scrubbed.endsWith("…"))
    }

    @Test
    fun `leaves an ordinary diagnostic untouched`() {
        val message = "outbox op MEAL_LOG failed with VALIDATION_FAILED"

        assertEquals(message, TelemetryRedaction.scrub(message))
    }

    @Test
    fun `scrubs values but keeps keys`() {
        val scrubbed = TelemetryRedaction.scrub(
            mapOf("endpoint" to "/logs/meals", "actor" to "ada@example.com"),
        )

        assertEquals(setOf("endpoint", "actor"), scrubbed.keys)
        assertEquals("/logs/meals", scrubbed["endpoint"])
        assertEquals(TelemetryRedaction.REDACTED, scrubbed["actor"])
    }

    @Test
    fun `redacts an email inside a longer json body`() {
        val body = """{"user":{"email":"ada@example.com"},"code":"CONFLICT"}"""

        val scrubbed = TelemetryRedaction.scrub(body)

        assertFalse(scrubbed.contains("ada@example.com"))
        assertTrue("the diagnostic part survives", scrubbed.contains("CONFLICT"))
    }
}
