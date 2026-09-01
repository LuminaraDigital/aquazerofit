package fit.aquazero.app.core.network

import java.time.Duration
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * `Retry-After` parsing for 429 handling (chat/vision lanes are 20/min; the
 * outbox honors this on replay). The header is either delta-seconds or an
 * HTTP-date (RFC 7231).
 */
object RetryAfter {
    /**
     * Parse a `Retry-After` header value into whole seconds from [now].
     * Returns null for absent/garbage input; clamps negatives to 0.
     */
    fun parseSeconds(value: String?, now: Instant = Instant.now()): Long? {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) return null
        raw.toLongOrNull()?.let { return maxOf(0L, it) }
        return runCatching {
            val date = ZonedDateTime.parse(raw, DateTimeFormatter.RFC_1123_DATE_TIME)
            maxOf(0L, Duration.between(now, date.toInstant()).seconds)
        }.getOrNull()
    }
}
