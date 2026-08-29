package fit.aquazero.app.widget

import fit.aquazero.app.core.common.DailyNutritionCalculator
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.common.MealTotals
import fit.aquazero.app.core.common.NutritionTargets
import fit.aquazero.app.core.model.WorkoutSessionStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The widget's decisions, pinned where a JVM test can reach them.
 *
 * Everything above this layer is RemoteViews and needs a host to exercise, so
 * these are the assertions that stop the widget from telling the user
 * something untrue: that a signed-out device has a zero-calorie day, that a
 * rest day is an unfinished workout, or that yesterday's session is today's.
 */
class TodayWidgetSnapshotTest {

    private fun nutrition(
        kcal: Double = 0.0,
        kcalTarget: Double = 2100.0,
        waterMl: Int = 0,
        waterTargetMl: Double = 2500.0,
    ): LocalDailyNutrition = DailyNutritionCalculator.compute(
        meals = listOf(MealTotals(kcal = kcal, proteinG = 0.0, carbsG = 0.0, fatG = 0.0)),
        waterMl = waterMl,
        targets = NutritionTargets(
            kcalTarget = kcalTarget,
            proteinG = 0.0,
            carbsG = 0.0,
            fatG = 0.0,
            waterMl = waterTargetMl,
        ),
    )

    @Test
    fun `the loading state is not treated as a real day`() {
        assertFalse(TodayWidgetSnapshot.Loading.loaded)
        assertFalse(TodayWidgetSnapshot.Loading.configured)
    }

    @Test
    fun `a Room emission is loaded even when the day is empty`() {
        val snapshot = TodayWidgetSnapshot.of(nutrition(), sessionStatus = null)

        // A fresh day is legitimately all zeroes; that is content, not absence.
        assertTrue(snapshot.loaded)
        assertTrue(snapshot.configured)
        assertEquals(0.0, snapshot.kcalConsumed, 0.0)
        assertEquals(2100.0, snapshot.kcalTarget, 0.0)
    }

    @Test
    fun `an account with no targets is unconfigured rather than a zero day`() {
        val snapshot = TodayWidgetSnapshot.of(
            nutrition(kcalTarget = 0.0, waterTargetMl = 0.0),
            sessionStatus = null,
        )

        // This is also the signed-out state: the targets row is purged with
        // the rest of the per-user rows, so the widget must show the setup
        // prompt rather than "0 / 0 kcal".
        assertTrue(snapshot.loaded)
        assertFalse(snapshot.configured)
    }

    @Test
    fun `a water-only target still counts as configured`() {
        val snapshot = TodayWidgetSnapshot.of(
            nutrition(kcalTarget = 0.0, waterTargetMl = 2000.0),
            sessionStatus = null,
        )

        assertTrue(snapshot.configured)
    }

    @Test
    fun `totals are carried through, never recomputed`() {
        val snapshot = TodayWidgetSnapshot.of(nutrition(kcal = 1240.4, waterMl = 1250), null)

        // 1240.4 survives as the calculator rounded it; the widget must not
        // apply a second rounding of its own.
        assertEquals(1240.4, snapshot.kcalConsumed, 0.0001)
        assertEquals(1250, snapshot.waterMl)
        assertEquals(2500, snapshot.waterTargetMl)
    }

    @Test
    fun `the calorie fraction tracks the day`() {
        assertEquals(0f, TodayWidgetSnapshot.of(nutrition(kcal = 0.0), null).kcalFraction, 0.0001f)
        assertEquals(0.5f, TodayWidgetSnapshot.of(nutrition(kcal = 1050.0), null).kcalFraction, 0.0001f)
        assertEquals(1f, TodayWidgetSnapshot.of(nutrition(kcal = 2100.0), null).kcalFraction, 0.0001f)
    }

    @Test
    fun `an over-target day fills the bar instead of overflowing it`() {
        val snapshot = TodayWidgetSnapshot.of(nutrition(kcal = 3000.0), null)

        assertEquals(1f, snapshot.kcalFraction, 0.0001f)
    }

    @Test
    fun `a target of zero is a fraction of zero, never a NaN`() {
        // Handing a progress bar 0-divided-by-0 is how a widget becomes a
        // blank rectangle on someone's home screen.
        val snapshot = TodayWidgetSnapshot.of(nutrition(kcal = 500.0, kcalTarget = 0.0), null)

        assertEquals(0f, snapshot.kcalFraction, 0.0001f)
        assertFalse(snapshot.kcalFraction.isNaN())
    }

    @Test
    fun `no cached session for today says nothing about the workout`() {
        val snapshot = TodayWidgetSnapshot.of(nutrition(), sessionStatus = null)

        // "No row" cannot be told apart from "rest day", so the widget stays
        // quiet rather than claiming a workout is outstanding.
        assertEquals(WidgetWorkoutState.UNKNOWN, snapshot.workout)
    }

    @Test
    fun `the status PlansRepository actually caches is recognised as done`() {
        // PlansRepository writes `status.name.lowercase()`, so this is the
        // exact string that reaches Room — not an approximation of it.
        val cached = WorkoutSessionStatus.COMPLETED.name.lowercase()

        assertEquals(
            WidgetWorkoutState.DONE,
            TodayWidgetSnapshot.of(nutrition(), cached).workout,
        )
    }

    @Test
    fun `every other status is an outstanding workout`() {
        val outstanding = WorkoutSessionStatus.entries - WorkoutSessionStatus.COMPLETED

        outstanding.forEach { status ->
            assertEquals(
                "status ${status.name} should read as outstanding",
                WidgetWorkoutState.PENDING,
                TodayWidgetSnapshot.of(nutrition(), status.name.lowercase()).workout,
            )
        }
    }

    @Test
    fun `a status whose case was mangled by the device locale still reads as done`() {
        // The cache write uses a default-locale lowercase, which is not
        // guaranteed to be the identity on every device. Matching must not
        // depend on it having been.
        assertEquals(
            WidgetWorkoutState.DONE,
            TodayWidgetSnapshot.of(nutrition(), "Completed").workout,
        )
    }
}
