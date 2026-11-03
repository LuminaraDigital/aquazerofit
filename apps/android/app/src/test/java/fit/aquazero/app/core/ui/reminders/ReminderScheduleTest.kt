package fit.aquazero.app.core.ui.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * When each reminder actually fires.
 *
 * The failure this guards against is not a crash: it is a hydration nudge at
 * three in the morning, or a weekly weigh-in that fires again five minutes
 * after the last one. Both are arithmetic, so both are tested here.
 */
class ReminderScheduleTest {

    private val zone: ZoneId = ZoneId.of("Europe/London")

    private fun at(date: String, time: String): ZonedDateTime =
        ZonedDateTime.of(LocalDateTime.parse("${date}T$time"), zone)

    // ----- daily -----

    @Test
    fun `a daily reminder later today fires today`() {
        val now = at("2026-08-27", "07:00")
        val delay = ReminderSchedule.untilDaily(now, TimeOfDay(8, 30))
        assertEquals(Duration.ofMinutes(90), delay)
    }

    @Test
    fun `a daily reminder already past today rolls to tomorrow`() {
        val now = at("2026-08-27", "09:00")
        val delay = ReminderSchedule.untilDaily(now, TimeOfDay(8, 30))
        assertEquals(Duration.ofHours(23).plusMinutes(30), delay)
    }

    @Test
    fun `landing exactly on the slot books the next day rather than firing twice`() {
        val now = at("2026-08-27", "08:30")
        val delay = ReminderSchedule.untilDaily(now, TimeOfDay(8, 30))
        assertEquals(Duration.ofDays(1), delay)
    }

    // ----- weekly -----

    @Test
    fun `a weekly reminder later this week waits for that day`() {
        // Thursday 27 Aug 2026 → next Monday is the 31st.
        val now = at("2026-08-27", "12:00")
        val delay = ReminderSchedule.untilWeekly(now, DayOfWeek.MONDAY, TimeOfDay(8, 0))
        assertEquals(Duration.ofDays(3).plusHours(20), delay)
    }

    @Test
    fun `the target weekday but past the hour rolls a full week`() {
        // Monday 31 Aug 2026 at 09:00, target Monday 08:00.
        val now = at("2026-08-31", "09:00")
        val delay = ReminderSchedule.untilWeekly(now, DayOfWeek.MONDAY, TimeOfDay(8, 0))
        assertEquals(Duration.ofDays(7).minusHours(1), delay)
    }

    @Test
    fun `the target weekday before the hour fires the same day`() {
        val now = at("2026-08-31", "06:00")
        val delay = ReminderSchedule.untilWeekly(now, DayOfWeek.MONDAY, TimeOfDay(8, 0))
        assertEquals(Duration.ofHours(2), delay)
    }

    // ----- hydration window -----

    @Test
    fun `hydration slots run from the window start to the window end`() {
        assertEquals(listOf(8, 10, 12, 14, 16, 18, 20), ReminderSchedule.waterSlotHours(2))
        assertEquals(listOf(8, 12, 16, 20), ReminderSchedule.waterSlotHours(4))
        assertEquals(8, ReminderSchedule.waterSlotHours(1).first())
        assertEquals(21, ReminderSchedule.waterSlotHours(1).last())
    }

    @Test
    fun `a hydration nudge inside the window goes to the next slot`() {
        val now = at("2026-08-27", "09:15")
        val next = ReminderSchedule.nextWaterSlot(now, intervalHours = 2)
        assertEquals(10, next.hour)
        assertEquals("2026-08-27", next.toLocalDate().toString())
    }

    @Test
    fun `nobody is woken at three in the morning`() {
        val now = at("2026-08-27", "03:00")
        val next = ReminderSchedule.nextWaterSlot(now, intervalHours = 2)
        assertEquals(ReminderPrefs.WATER_WINDOW_START_HOUR, next.hour)
        assertEquals("2026-08-27", next.toLocalDate().toString())
    }

    @Test
    fun `past the last slot the next nudge is tomorrow morning`() {
        val now = at("2026-08-27", "22:30")
        val next = ReminderSchedule.nextWaterSlot(now, intervalHours = 2)
        assertEquals(ReminderPrefs.WATER_WINDOW_START_HOUR, next.hour)
        assertEquals("2026-08-28", next.toLocalDate().toString())
    }

    // ----- dispatch -----

    @Test
    fun `each lane reads the preference that belongs to it`() {
        val now = at("2026-08-27", "07:00")
        val prefs = ReminderPrefs(
            mealsTime = TimeOfDay(8, 0),
            workoutTime = TimeOfDay(17, 0),
            weighInDay = DayOfWeek.FRIDAY,
            weighInTime = TimeOfDay(9, 0),
            waterFrequency = WaterFrequency.EVERY_4H,
        )
        assertEquals(
            Duration.ofHours(1),
            ReminderSchedule.until(ReminderType.MEALS, prefs, now),
        )
        assertEquals(
            Duration.ofHours(10),
            ReminderSchedule.until(ReminderType.WORKOUT, prefs, now),
        )
        // Thursday 07:00 → Friday 09:00.
        assertEquals(
            Duration.ofDays(1).plusHours(2),
            ReminderSchedule.until(ReminderType.WEIGH_IN, prefs, now),
        )
        assertEquals(
            Duration.ofHours(1),
            ReminderSchedule.until(ReminderType.WATER, prefs, now),
        )
    }

    @Test
    fun `every delay is positive, so no lane is ever booked in the past`() {
        val prefs = ReminderPrefs()
        listOf("00:00", "08:30", "12:00", "17:00", "23:59").forEach { time ->
            val now = at("2026-08-27", time)
            ReminderType.entries.forEach { type ->
                val delay = ReminderSchedule.until(type, prefs, now)
                assertTrue(
                    "$type at $time was booked in the past: $delay",
                    !delay.isNegative && !delay.isZero,
                )
            }
        }
    }

    // ----- preference plumbing -----

    @Test
    fun `a time of day round-trips through its stored form`() {
        val time = TimeOfDay(8, 5)
        assertEquals("08:05", time.toIso())
        assertEquals(time, TimeOfDay.parse("08:05", TimeOfDay(0, 0)))
    }

    @Test
    fun `an unreadable stored time falls back rather than throwing`() {
        val fallback = TimeOfDay(7, 30)
        listOf(null, "", "8", "99:99", "ab:cd", "08:60").forEach { raw ->
            assertEquals(fallback, TimeOfDay.parse(raw, fallback))
        }
    }

    @Test
    fun `an unknown water frequency falls back to the default`() {
        assertEquals(WaterFrequency.EVERY_2H, WaterFrequency.fromHours(3))
        assertEquals(WaterFrequency.EVERY_1H, WaterFrequency.fromHours(1))
    }

    @Test
    fun `enabled lanes are read per type`() {
        val prefs = ReminderPrefs(
            mealsEnabled = true,
            waterEnabled = false,
            workoutEnabled = true,
            weighInEnabled = false,
        )
        assertTrue(prefs.isEnabled(ReminderType.MEALS))
        assertTrue(!prefs.isEnabled(ReminderType.WATER))
        assertTrue(prefs.isEnabled(ReminderType.WORKOUT))
        assertTrue(!prefs.isEnabled(ReminderType.WEIGH_IN))
    }

    @Test
    fun `each lane has its own channel, work name and notification id`() {
        val channels = ReminderType.entries.map { it.channelId }
        val works = ReminderType.entries.map { it.workName }
        val ids = ReminderType.entries.map { it.notificationId }
        assertEquals(channels.size, channels.toSet().size)
        assertEquals(works.size, works.toSet().size)
        assertEquals(ids.size, ids.toSet().size)
    }
}
