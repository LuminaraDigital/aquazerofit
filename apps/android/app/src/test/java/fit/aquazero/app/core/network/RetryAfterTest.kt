package fit.aquazero.app.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class RetryAfterTest {

    @Test
    fun `parses delta seconds`() {
        assertEquals(30L, RetryAfter.parseSeconds("30"))
        assertEquals(0L, RetryAfter.parseSeconds("0"))
    }

    @Test
    fun `negative delta clamps to zero`() {
        assertEquals(0L, RetryAfter.parseSeconds("-5"))
    }

    @Test
    fun `parses an RFC 1123 http-date relative to now`() {
        val now = Instant.parse("2026-08-27T10:00:00Z")
        val seconds = RetryAfter.parseSeconds("Thu, 27 Aug 2026 10:01:30 GMT", now)
        assertEquals(90L, seconds)
    }

    @Test
    fun `past http-date clamps to zero`() {
        val now = Instant.parse("2026-08-27T10:00:00Z")
        assertEquals(0L, RetryAfter.parseSeconds("Thu, 27 Aug 2026 09:00:00 GMT", now))
    }

    @Test
    fun `garbage and blanks return null`() {
        assertNull(RetryAfter.parseSeconds(null))
        assertNull(RetryAfter.parseSeconds(""))
        assertNull(RetryAfter.parseSeconds("  "))
        assertNull(RetryAfter.parseSeconds("soon"))
    }
}
