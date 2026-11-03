package fit.aquazero.app.core.health

import org.junit.Assert.assertEquals
import org.junit.Test

class HealthExpenditureBridgeTest {

    @Test
    fun `deriveActiveBurnKcal returns local workout burn when snapshot is null or empty`() {
        val burnNull = HealthExpenditureBridge.deriveActiveBurnKcal(null, localWorkoutBurnKcal = 350.0)
        assertEquals(350.0, burnNull, 0.01)

        val burnEmpty = HealthExpenditureBridge.deriveActiveBurnKcal(
            HealthDaySnapshot.EMPTY,
            localWorkoutBurnKcal = 200.0,
        )
        assertEquals(200.0, burnEmpty, 0.01)
    }

    @Test
    fun `deriveActiveBurnKcal prioritizes Health Connect energyBurnedKcal when available`() {
        val snapshot = HealthDaySnapshot(
            steps = 8000,
            energyBurnedKcal = 550,
        )
        // 550 kcal from Health Connect platform beats 300 kcal local workout
        val burn = HealthExpenditureBridge.deriveActiveBurnKcal(snapshot, localWorkoutBurnKcal = 300.0)
        assertEquals(550.0, burn, 0.01)
    }

    @Test
    fun `deriveActiveBurnKcal calculates combined step burn and workout burn when platform burn is missing`() {
        val snapshot = HealthDaySnapshot(
            steps = 10000, // 10,000 * 0.04 = 400 kcal
            energyBurnedKcal = null,
        )
        val burn = HealthExpenditureBridge.deriveActiveBurnKcal(snapshot, localWorkoutBurnKcal = 250.0)
        assertEquals(650.0, burn, 0.1)
    }

    @Test
    fun `calculateDayTdee correctly aggregates baseline BMR and active burn`() {
        val snapshot = HealthDaySnapshot(
            steps = 5000,
            energyBurnedKcal = 400,
        )
        val tdee = HealthExpenditureBridge.calculateDayTdee(
            baselineBmrKcal = 1750.0,
            snapshot = snapshot,
            localWorkoutBurnKcal = 300.0,
        )
        // 1750 + max(400, 300) = 2150 kcal
        assertEquals(2150.0, tdee, 0.1)
    }
}
