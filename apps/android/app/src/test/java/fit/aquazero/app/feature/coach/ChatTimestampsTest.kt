package fit.aquazero.app.feature.coach

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId

class ChatTimestampsTest {

    @Test
    fun `a sydney evening is not shown as the utc clock time`() {
        val stamp = formatChatTime(
            "2026-11-02T09:09:00.000Z",
            ZoneId.of("Australia/Sydney"),
        )
        assertEquals("20:09", stamp)
    }

    @Test
    fun `utc keeps the utc clock time`() {
        val stamp = formatChatTime(
            "2026-11-02T09:09:00.000Z",
            ZoneId.of("UTC"),
        )
        assertEquals("09:09", stamp)
    }

    @Test
    fun `an unparseable stamp is blank`() {
        assertEquals("", formatChatTime("not-a-time", ZoneId.of("UTC")))
    }
}
