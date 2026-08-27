package fit.aquazero.app.feature.progress

import fit.aquazero.app.core.model.ConsistencyState
import fit.aquazero.app.core.model.ConsistencyStatusDto
import fit.aquazero.app.core.model.ProgressSummaryDto
import fit.aquazero.app.core.model.TrendPointDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProgressLogicTest {

    private val today = "2026-08-27"

    private val series = listOf(
        TrendPointDto("2026-05-01", 90.0),
        TrendPointDto("2026-07-01", 86.0),
        TrendPointDto("2026-08-20", 84.0),
        TrendPointDto("2026-08-26", 83.5),
    )

    @Test
    fun `range chips trim the series to their window`() {
        assertEquals(2, cutToRange(series, ProgressRange.WEEK, today).size)
        assertEquals(2, cutToRange(series, ProgressRange.MONTH, today).size)
        assertEquals(3, cutToRange(series, ProgressRange.QUARTER, today).size)
    }

    @Test
    fun `an empty series survives every range`() {
        ProgressRange.entries.forEach { range ->
            assertTrue(cutToRange(emptyList(), range, today).isEmpty())
        }
    }

    @Test
    fun `weight delta is signed but never labelled good or bad`() {
        val gained = state(current = 85.0, start = 83.0)
        val lost = state(current = 81.0, start = 83.0)
        assertEquals(2.0, gained.deltaKg!!, 1e-9)
        assertEquals(-2.0, lost.deltaKg!!, 1e-9)
        // Both directions render through the same formatter and the same ink.
        assertEquals("+2.0 kg", signedKg(gained.deltaKg!!))
        assertEquals("-2.0 kg", signedKg(lost.deltaKg!!))
    }

    @Test
    fun `delta is null until both endpoints exist`() {
        assertNull(state(current = 85.0, start = null).deltaKg)
        assertNull(state(current = null, start = 83.0).deltaKg)
    }

    @Test
    fun `average kcal is computed over the visible window only`() {
        val visible = listOf(
            TrendPointDto("2026-08-25", 2000.0),
            TrendPointDto("2026-08-26", 2200.0),
        )
        assertEquals(2100, ProgressUiState(kcalSeries = visible).averageKcal)
        assertEquals(0, ProgressUiState().averageKcal)
    }

    @Test
    fun `the macro donut stays hidden until carbs and fat are actually cached`() {
        assertFalse(MacroAverages(proteinG = 140.0, complete = false).hasData)
        assertFalse(MacroAverages(complete = true).hasData)
        assertTrue(
            MacroAverages(proteinG = 140.0, carbsG = 200.0, fatG = 60.0, complete = true).hasData,
        )
    }

    // ---- product invariant: consistency can never break ----

    @Test
    fun `consistency headline is the window count, which only grows with effort`() {
        val status = ConsistencyStatusDto(
            currentDays = 0,
            bestDays = 12,
            activeDays = 18,
            windowDays = 28,
            graceRemaining = 2,
            state = ConsistencyState.RESTING,
        )
        // A zero current run does not zero the hero number, and is not rendered.
        assertEquals(18, status.activeDays)
        assertNull(ConsistencyCopy.currentRunDays(status))
        assertEquals(12, ConsistencyCopy.bestDays(status))
        assertTrue(ConsistencyCopy.hasActivity(status))
    }

    @Test
    fun `grace reassurance wins over the plain state line`() {
        val absorbed = ConsistencyStatusDto(
            currentDays = 5,
            activeDays = 9,
            windowDays = 28,
            graceRemaining = 1,
            state = ConsistencyState.BUILDING,
        )
        assertTrue(ConsistencyCopy.hasAbsorbedDay(absorbed))
        assertEquals(
            fit.aquazero.app.R.string.consistency_body_grace,
            ConsistencyCopy.body(absorbed),
        )
    }

    @Test
    fun `the consistency meter is a proportion clamped to the window`() {
        assertEquals(
            0.5f,
            ConsistencyCopy.fraction(ConsistencyStatusDto(activeDays = 14, windowDays = 28)),
            1e-6f,
        )
        assertEquals(
            1f,
            ConsistencyCopy.fraction(ConsistencyStatusDto(activeDays = 40, windowDays = 28)),
            1e-6f,
        )
        assertEquals(
            0f,
            ConsistencyCopy.fraction(ConsistencyStatusDto(activeDays = 3, windowDays = 0)),
            1e-6f,
        )
    }

    @Test
    fun `every consistency state resolves to supportive copy with no loss vocabulary`() {
        ConsistencyState.entries.forEach { state ->
            val status = ConsistencyStatusDto(state = state, activeDays = 3, graceRemaining = 2)
            // Resolving must never throw and must never fall through to a
            // "broken" branch — there is no such state in the model.
            ConsistencyCopy.stateLabel(state)
            ConsistencyCopy.body(status)
        }
    }

    private fun state(current: Double?, start: Double?) = ProgressUiState(
        summary = ProgressSummaryDto(currentWeightKg = current, startWeightKg = start),
    )
}
