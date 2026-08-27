package fit.aquazero.app.core.common

import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Local-date helpers. All day-keying in the app uses `localDate` strings
 * (`YYYY-MM-DD`) computed in the device's current timezone, identically to
 * the web client — payloads always carry it explicitly so the server's
 * `X-Timezone` fallback never fires.
 */
object LocalDates {
    private val formatter: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

    /** Today's `YYYY-MM-DD` in the device timezone. */
    fun today(zone: ZoneId = ZoneId.systemDefault()): String =
        LocalDate.now(zone).format(formatter)

    /** Shift an ISO local date by [days] (negative for the past). */
    fun shift(isoDate: String, days: Long): String =
        LocalDate.parse(isoDate, formatter).plusDays(days).format(formatter)

    /** True when [isoDate] parses as a valid `YYYY-MM-DD`. */
    fun isValid(isoDate: String): Boolean = runCatching {
        LocalDate.parse(isoDate, formatter)
    }.isSuccess
}
