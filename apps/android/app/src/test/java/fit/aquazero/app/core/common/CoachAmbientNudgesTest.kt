package fit.aquazero.app.core.common

import fit.aquazero.app.core.model.ReadinessMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CoachAmbientNudgesTest {

    @Test
    fun proteinGapSurfacesWhenRemainingIsMeaningful() {
        val nudges = proactiveCoachNudges(
            CoachNudgeContext(
                proteinRemainingG = 42.0,
                readinessMode = null,
                hasWorkoutToday = false,
                workoutFocus = null,
                coachLinePresent = false,
            ),
        )
        assertEquals(listOf(CoachNudgeKind.ProteinGap), nudges)
    }

    @Test
    fun readinessProtectTakesPriorityOverGenericChat() {
        val nudges = proactiveCoachNudges(
            CoachNudgeContext(
                proteinRemainingG = null,
                readinessMode = ReadinessMode.PROTECT,
                hasWorkoutToday = false,
                workoutFocus = null,
                coachLinePresent = true,
            ),
        )
        assertEquals(listOf(CoachNudgeKind.ReadinessProtect), nudges)
    }

    @Test
    fun capsAtThreeNudges() {
        val nudges = proactiveCoachNudges(
            CoachNudgeContext(
                proteinRemainingG = 30.0,
                readinessMode = ReadinessMode.PROGRESS,
                hasWorkoutToday = true,
                workoutFocus = "Upper body",
                coachLinePresent = true,
            ),
        )
        assertEquals(3, nudges.size)
        assertTrue(nudges.contains(CoachNudgeKind.ProteinGap))
        assertTrue(nudges.contains(CoachNudgeKind.ReadinessProgress))
        assertTrue(nudges.contains(CoachNudgeKind.TodaysWorkout))
    }
}
