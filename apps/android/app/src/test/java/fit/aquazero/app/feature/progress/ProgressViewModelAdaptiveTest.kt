package fit.aquazero.app.feature.progress

import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.TrendPointDto
import org.junit.Assert.assertNull
import org.junit.Test

class ProgressViewModelAdaptiveTest {

    @Test
    fun adaptiveExpenditureIfEnabled_returnsNullWhenFlagOff() {
        val result = adaptiveExpenditureIfEnabled(
            adaptiveEnabled = false,
            weightHistory = listOf(TrendPointDto("2026-08-01", 80.0)),
            calorieHistory = listOf(TrendPointDto("2026-08-01", 2000.0)),
            baselineTdee = 2200.0,
            sex = Sex.FEMALE,
        )
        assertNull(result)
    }

    @Test
    fun adaptiveExpenditureIfEnabled_computesWhenFlagOn() {
        val weight = (1..10).map { day ->
            TrendPointDto("2026-08-${day.toString().padStart(2, '0')}", 80.0 - day * 0.05)
        }
        val kcal = (1..10).map { day ->
            TrendPointDto("2026-08-${day.toString().padStart(2, '0')}", 1900.0)
        }
        val result = adaptiveExpenditureIfEnabled(
            adaptiveEnabled = true,
            weightHistory = weight,
            calorieHistory = kcal,
            baselineTdee = 2400.0,
            sex = Sex.FEMALE,
        )
        assert(result != null)
    }
}
