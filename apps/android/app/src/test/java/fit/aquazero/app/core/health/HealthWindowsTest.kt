package fit.aquazero.app.core.health

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * The instant ranges the daily figures are read over.
 *
 * Day arithmetic looks trivial and is not. Twice a year a local day is 23 or
 * 25 hours long, and a range built by adding 24 hours to midnight silently
 * loses an hour of steps in spring and counts one twice in autumn. The DST
 * cases below are the reason this object exists separately from the manager.
 */
class HealthWindowsTest {

    private val london: ZoneId = ZoneId.of("Europe/London")
    private val kolkata: ZoneId = ZoneId.of("Asia/Kolkata")

    // ----- ordinary days -----

    @Test
    fun `a day runs from local midnight to the next local midnight`() {
        val window = HealthWindows.day(LocalDate.parse("2026-06-15"), london)
        // London is UTC+1 in June.
        assertEquals(Instant.parse("2026-06-14T23:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-06-15T23:00:00Z"), window.end)
    }

    @Test
    fun `the window honours a half-hour offset zone`() {
        val window = HealthWindows.day(LocalDate.parse("2026-06-15"), kolkata)
        assertEquals(Instant.parse("2026-06-14T18:30:00Z"), window.start)
        assertEquals(Instant.parse("2026-06-15T18:30:00Z"), window.end)
    }

    @Test
    fun `the end is exclusive, so consecutive days abut without overlapping`() {
        val first = HealthWindows.day(LocalDate.parse("2026-06-15"), london)
        val second = HealthWindows.day(LocalDate.parse("2026-06-16"), london)
        assertEquals(first.end, second.start)
    }

    // ----- daylight saving -----

    @Test
    fun `the spring-forward day is 23 hours, not 24`() {
        // 29 March 2026: UK clocks go forward at 01:00.
        val window = HealthWindows.day(LocalDate.parse("2026-03-29"), london)
        assertEquals(Duration.ofHours(23), Duration.between(window.start, window.end))
    }

    @Test
    fun `the autumn day is 25 hours`() {
        // 25 October 2026: UK clocks go back at 02:00.
        val window = HealthWindows.day(LocalDate.parse("2026-10-25"), london)
        assertEquals(Duration.ofHours(25), Duration.between(window.start, window.end))
    }

    @Test
    fun `an ordinary day is 24 hours`() {
        val window = HealthWindows.day(LocalDate.parse("2026-06-15"), london)
        assertEquals(Duration.ofHours(24), Duration.between(window.start, window.end))
    }

    // ----- last night -----

    @Test
    fun `last night starts the previous evening and ends at midday`() {
        val window = HealthWindows.lastNight(LocalDate.parse("2026-06-15"), london)
        assertEquals(Instant.parse("2026-06-14T17:00:00Z"), window.start)
        assertEquals(Instant.parse("2026-06-15T11:00:00Z"), window.end)
    }

    @Test
    fun `last night spans the midnight a calendar day would cut in half`() {
        val date = LocalDate.parse("2026-06-15")
        val night = HealthWindows.lastNight(date, london)
        val midnight = HealthWindows.day(date, london).start
        assertTrue(night.start.isBefore(midnight))
        assertTrue(night.end.isAfter(midnight))
    }

    @Test
    fun `last night is 18 hours wide on an ordinary day`() {
        val window = HealthWindows.lastNight(LocalDate.parse("2026-06-15"), london)
        assertEquals(Duration.ofHours(18), Duration.between(window.start, window.end))
    }

    @Test
    fun `the night containing a clock change loses an hour with the clocks`() {
        // Sleeping through 01:00 on 29 March gives 17 real hours of window.
        val window = HealthWindows.lastNight(LocalDate.parse("2026-03-29"), london)
        assertEquals(Duration.ofHours(17), Duration.between(window.start, window.end))
    }
}
