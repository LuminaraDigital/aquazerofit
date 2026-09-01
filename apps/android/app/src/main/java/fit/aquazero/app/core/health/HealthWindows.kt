package fit.aquazero.app.core.health

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** A half-open instant range `[start, end)` handed to a Health Connect query. */
data class HealthWindow(val start: Instant, val end: Instant)

/**
 * The instant ranges the daily figures are read over.
 *
 * Separated from [HealthConnectManager] because this is the part that is worth
 * testing and the only part that can be: no `Context`, no client, no device.
 * The arithmetic is not as obvious as it looks — a day is 23 or 25 hours twice
 * a year, and a range built by adding 24 hours to midnight either drops an
 * hour of steps or double-counts one. Every window here is built by asking the
 * calendar for the next local midnight instead.
 */
object HealthWindows {

    /** Sleep is looked for from this hour on the evening before. */
    private val NIGHT_START = LocalTime.of(18, 0)

    /** ...until this hour on the morning of [day]. */
    private val NIGHT_END = LocalTime.of(12, 0)

    /**
     * Local midnight to local midnight for [date] in [zone].
     *
     * The end is the *start* of the following day rather than `23:59:59`, so a
     * step taken in the last second of the day is still counted and one taken
     * in the first second of the next is not.
     */
    fun day(date: LocalDate, zone: ZoneId): HealthWindow = HealthWindow(
        start = date.atStartOfDay(zone).toInstant(),
        end = date.plusDays(1).atStartOfDay(zone).toInstant(),
    )

    /**
     * The night that ended on the morning of [date]: 18:00 the previous
     * evening through 12:00 that day.
     *
     * A calendar day is the wrong window for sleep — it splits every ordinary
     * night in two at midnight and reports roughly half of it. The evening
     * start is early enough for a shift worker turning in at seven, and the
     * midday end is late enough for a lie-in without reaching into the
     * following night.
     */
    fun lastNight(date: LocalDate, zone: ZoneId): HealthWindow = HealthWindow(
        start = date.minusDays(1).atTime(NIGHT_START).atZone(zone).toInstant(),
        end = date.atTime(NIGHT_END).atZone(zone).toInstant(),
    )
}
