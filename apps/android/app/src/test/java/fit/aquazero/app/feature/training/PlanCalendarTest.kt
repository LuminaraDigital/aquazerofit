package fit.aquazero.app.feature.training

import fit.aquazero.app.core.model.PlanDayDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

/** Mirrors the server's `(daysBetween(startDate, date) % 7) + 1` in readiness.ts. */
class PlanCalendarTest {

    private val days = (1..7).map { PlanDayDto(order = it, focus = "day $it", isRest = it == 7) }

    @Test
    fun `a plan started on Sunday puts day one on Sunday, not on Monday`() {
        val sunday = LocalDate.of(2026, 11, 1)
        assertEquals("day 1", PlanCalendar.dayOn(days, "2026-11-01", sunday)?.focus)
        assertEquals("day 2", PlanCalendar.dayOn(days, "2026-11-01", sunday.plusDays(1))?.focus)
    }

    @Test
    fun `the seven day cycle repeats from the start date`() {
        assertEquals("day 7", PlanCalendar.dayOn(days, "2026-11-01", LocalDate.of(2026, 11, 7))?.focus)
        assertEquals("day 1", PlanCalendar.dayOn(days, "2026-11-01", LocalDate.of(2026, 11, 8))?.focus)
    }

    @Test
    fun `days before the plan started have no plan day`() {
        assertNull(PlanCalendar.dayOn(days, "2026-11-01", LocalDate.of(2026, 10, 31)))
    }

    @Test
    fun `days are found by order, not by list position`() {
        val shuffled = days.reversed()
        assertEquals("day 1", PlanCalendar.dayOn(shuffled, "2026-11-01", LocalDate.of(2026, 11, 1))?.focus)
    }

    @Test
    fun `an unreadable start date yields no day rather than a crash`() {
        assertNull(PlanCalendar.dayOn(days, "not-a-date", LocalDate.of(2026, 11, 1)))
    }
}
