package fit.aquazero.app.feature.dashboard

import fit.aquazero.app.core.model.MealType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class DayLoopPlannerTest {

    private fun input(
        hour: Int,
        meals: Set<MealType> = emptySet(),
        waterMl: Int = 0,
        waterTargetMl: Int = 2000,
        workout: WorkoutToday = WorkoutToday.Scheduled,
        weighIn: WeighInToday = WeighInToday.NotDue,
    ) = DayLoopInput(hour, meals, waterMl, waterTargetMl, workout, weighIn)

    @Test
    fun `breakfast leads the morning`() {
        assertEquals(DayStepKind.Breakfast, DayLoopPlanner.plan(input(hour = 8)).next)
    }

    @Test
    fun `lunch leads midday once breakfast is logged`() {
        val loop = DayLoopPlanner.plan(input(hour = 12, meals = setOf(MealType.BREAKFAST), waterMl = 1000))
        assertEquals(DayStepKind.Lunch, loop.next)
    }

    @Test
    fun `an unlogged lunch at night stays open and is never asked for`() {
        val loop = DayLoopPlanner.plan(input(hour = 20, meals = setOf(MealType.DINNER), waterMl = 2000))
        val lunch = loop.steps.first { it.kind == DayStepKind.Lunch }
        assertEquals(DayStepState.Open, lunch.state)
        assertTrue(loop.next != DayStepKind.Lunch)
    }

    @Test
    fun `water is only asked for when properly behind pace`() {
        val onPace = input(hour = 16, meals = setOf(MealType.BREAKFAST, MealType.LUNCH), waterMl = 1000)
        val behind = onPace.copy(waterMl = 200)
        assertEquals(DayStepKind.Workout, DayLoopPlanner.plan(onPace).next)
        assertEquals(DayStepKind.Water, DayLoopPlanner.plan(behind).next)
    }

    @Test
    fun `nothing is next during quiet hours, however much is open`() {
        listOf(22, 23, 0, 3, 4).forEach { hour ->
            assertNull("hour $hour", DayLoopPlanner.plan(input(hour = hour)).next)
            assertEquals("greeting period at hour $hour", 2, greetingPeriodForHour(hour))
        }
        assertEquals(0, greetingPeriodForHour(5))
        assertEquals(0, greetingPeriodForHour(11))
        assertEquals(1, greetingPeriodForHour(12))
        assertEquals(1, greetingPeriodForHour(17))
        assertEquals(2, greetingPeriodForHour(18))
    }

    @Test
    fun `a rest day has no workout step and can still close`() {
        val loop = DayLoopPlanner.plan(
            input(
                hour = 20,
                meals = setOf(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER),
                waterMl = 2000,
                workout = WorkoutToday.RestOrUnknown,
            ),
        )
        assertTrue(loop.steps.none { it.kind == DayStepKind.Workout })
        assertTrue(loop.closed)
        assertNull(loop.next)
    }

    @Test
    fun `an empty day is not closed`() {
        assertFalse(DayLoop(emptyList()).closed)
    }

    @Test
    fun `weigh-in is at most weekly`() {
        val today = LocalDate.of(2026, 11, 1)
        assertEquals(WeighInToday.Due, DayLoopPlanner.weighInToday(null, today))
        assertEquals(WeighInToday.Done, DayLoopPlanner.weighInToday("2026-11-01", today))
        assertEquals(WeighInToday.NotDue, DayLoopPlanner.weighInToday("2026-10-26", today))
        assertEquals(WeighInToday.Due, DayLoopPlanner.weighInToday("2026-10-25", today))
    }

    @Test
    fun `no water target means no water step`() {
        val loop = DayLoopPlanner.plan(input(hour = 9, waterTargetMl = 0))
        assertTrue(loop.steps.none { it.kind == DayStepKind.Water })
    }
}
