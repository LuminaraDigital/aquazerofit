package fit.aquazero.app.feature.settings.reminders

import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * When each reminder lane next fires.
 *
 * Pure and framework-free so the arithmetic that decides whether someone is
 * woken at 3am is covered by plain JVM tests. Every function returns a delay
 * from `now` rather than an absolute instant: WorkManager takes a delay, and a
 * delay survives the device clock moving in a way an absolute time does not.
 *
 * No exact alarms anywhere — the manifest carries no `SCHEDULE_EXACT_ALARM`
 * (plan §1), so these are "around this time", and the copy says so.
 */
object ReminderSchedule {

    /** Delay until the next occurrence of [time], today or tomorrow. */
    fun untilDaily(
        now: ZonedDateTime,
        time: TimeOfDay,
    ): Duration {
        val todayAt = now.with(LocalTime.of(time.hour, time.minute)).withSecond(0).withNano(0)
        val next = if (todayAt.isAfter(now)) todayAt else todayAt.plusDays(1)
        return Duration.between(now, next)
    }

    /**
     * Delay until the next [day] at [time]. Landing exactly on the target
     * weekday but past the hour rolls a full week rather than firing
     * immediately.
     */
    fun untilWeekly(
        now: ZonedDateTime,
        day: DayOfWeek,
        time: TimeOfDay,
    ): Duration {
        val atTime = now.with(LocalTime.of(time.hour, time.minute)).withSecond(0).withNano(0)
        var next = atTime.with(java.time.temporal.TemporalAdjusters.nextOrSame(day))
        if (!next.isAfter(now)) {
            next = next.plusWeeks(1)
        }
        return Duration.between(now, next)
    }

    /**
     * Delay until the next hydration slot.
     *
     * Slots run from [windowStartHour] every [intervalHours] up to and
     * including [windowEndHour]. Outside the window the next slot is the start
     * of the following day's window — so the nudges track waking hours instead
     * of marching around the clock.
     */
    fun untilNextWaterSlot(
        now: ZonedDateTime,
        intervalHours: Int,
        windowStartHour: Int = ReminderPrefs.WATER_WINDOW_START_HOUR,
        windowEndHour: Int = ReminderPrefs.WATER_WINDOW_END_HOUR,
    ): Duration {
        require(intervalHours > 0) { "intervalHours must be positive" }
        val next = nextWaterSlot(now, intervalHours, windowStartHour, windowEndHour)
        return Duration.between(now, next)
    }

    /** The slot itself, exposed for tests that assert the wall-clock time. */
    fun nextWaterSlot(
        now: ZonedDateTime,
        intervalHours: Int,
        windowStartHour: Int = ReminderPrefs.WATER_WINDOW_START_HOUR,
        windowEndHour: Int = ReminderPrefs.WATER_WINDOW_END_HOUR,
    ): ZonedDateTime {
        val slots = waterSlotHours(intervalHours, windowStartHour, windowEndHour)
        val today = now.toLocalDate()
        slots.firstOrNull { hour -> atHour(now, today, hour).isAfter(now) }
            ?.let { return atHour(now, today, it) }
        return atHour(now, today.plusDays(1), slots.first())
    }

    /** The hours a hydration nudge can land on, inside the waking window. */
    fun waterSlotHours(
        intervalHours: Int,
        windowStartHour: Int = ReminderPrefs.WATER_WINDOW_START_HOUR,
        windowEndHour: Int = ReminderPrefs.WATER_WINDOW_END_HOUR,
    ): List<Int> {
        require(intervalHours > 0) { "intervalHours must be positive" }
        if (windowEndHour < windowStartHour) return listOf(windowStartHour)
        return generateSequence(windowStartHour) { it + intervalHours }
            .takeWhile { it <= windowEndHour }
            .toList()
            .ifEmpty { listOf(windowStartHour) }
    }

    /** Delay for a lane, given the current preferences. */
    fun until(
        type: ReminderType,
        prefs: ReminderPrefs,
        now: ZonedDateTime = ZonedDateTime.now(ZoneId.systemDefault()),
    ): Duration = when (type) {
        ReminderType.MEALS -> untilDaily(now, prefs.mealsTime)
        ReminderType.WORKOUT -> untilDaily(now, prefs.workoutTime)
        ReminderType.WEIGH_IN -> untilWeekly(now, prefs.weighInDay, prefs.weighInTime)
        ReminderType.WATER -> untilNextWaterSlot(now, prefs.waterFrequency.hours)
    }

    private fun atHour(reference: ZonedDateTime, date: LocalDate, hour: Int): ZonedDateTime =
        ZonedDateTime.of(date, LocalTime.of(hour, 0), reference.zone)
}
