package fit.aquazero.app.core.common

import java.time.Clock
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Local-date helpers. All day-keying in the app uses `localDate` strings
 * (`YYYY-MM-DD`) computed in the device's current timezone, identically to
 * the web client — payloads always carry it explicitly so the server's
 * `X-Timezone` fallback never fires.
 *
 * **Every call takes a [Clock].** The default reads the system clock in the
 * device zone, so ordinary call sites are unchanged, but a caller that holds
 * a day across time — any ViewModel with a selected date — must inject the
 * app [Clock] and re-read rather than caching the string. Two ViewModels
 * cached it at construction and misfiled every log made after midnight; the
 * injectable clock is what makes that regression testable.
 */
object LocalDates {
    private val formatter: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

    /** Today's `YYYY-MM-DD`, in the zone carried by [clock]. */
    fun today(clock: Clock = Clock.systemDefaultZone()): String =
        LocalDate.now(clock).format(formatter)

    /** Shift an ISO local date by [days] (negative for the past). */
    fun shift(isoDate: String, days: Long): String =
        LocalDate.parse(isoDate, formatter).plusDays(days).format(formatter)

    /** True when [isoDate] parses as a valid `YYYY-MM-DD`. */
    fun isValid(isoDate: String): Boolean = runCatching {
        LocalDate.parse(isoDate, formatter)
    }.isSuccess
}
