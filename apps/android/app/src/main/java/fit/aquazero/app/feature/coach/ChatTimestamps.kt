package fit.aquazero.app.feature.coach

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val CLOCK_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Clock time for a chat stamp.
 *
 * Messages are stored as ISO-8601 instants (`2026-11-02T09:09:00.000Z`).
 * Reading the digits after `T` shows UTC, so a message sent at 20:09 in
 * Sydney was stamped 09:09. Format in [zone], which defaults to the device.
 */
internal fun formatChatTime(createdAt: String, zone: ZoneId = ZoneId.systemDefault()): String {
    val instant = runCatching { Instant.parse(createdAt) }.getOrNull() ?: return ""
    return CLOCK_TIME.format(instant.atZone(zone))
}
