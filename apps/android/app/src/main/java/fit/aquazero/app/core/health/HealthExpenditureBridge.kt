package fit.aquazero.app.core.health

import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Bridge between Health Connect passive sensor data, logged workouts, and the metabolic expenditure engine.
 *
 * Resolves active burn without double counting:
 * 1. If Health Connect provides `energyBurnedKcal`, that platform aggregate takes precedence.
 * 2. If Health Connect is missing/unauthorized, calculates active burn from local workout logs + step estimation.
 */
object HealthExpenditureBridge {

    const val ESTIMATED_KCAL_PER_STEP: Double = 0.04

    /**
     * Derive total active energy expenditure (kcal) for a day.
     */
    fun deriveActiveBurnKcal(
        snapshot: HealthDaySnapshot?,
        localWorkoutBurnKcal: Double = 0.0,
    ): Double {
        if (snapshot == null || snapshot.isEmpty) {
            return localWorkoutBurnKcal
        }

        val healthConnectBurn = snapshot.energyBurnedKcal?.toDouble()
        if (healthConnectBurn != null && healthConnectBurn > 0.0) {
            // Health Connect platform aggregate already includes active steps and wearable workouts
            return max(healthConnectBurn, localWorkoutBurnKcal)
        }

        // Fallback: estimate from step count + local logged workouts
        val stepBurn = (snapshot.steps ?: 0L) * ESTIMATED_KCAL_PER_STEP
        val combined = stepBurn + localWorkoutBurnKcal
        return (combined * 10.0).roundToInt() / 10.0
    }

    /**
     * Calculate continuous Total Daily Energy Expenditure (TDEE).
     */
    fun calculateDayTdee(
        baselineBmrKcal: Double,
        snapshot: HealthDaySnapshot?,
        localWorkoutBurnKcal: Double = 0.0,
    ): Double {
        val activeBurn = deriveActiveBurnKcal(snapshot, localWorkoutBurnKcal)
        val tdee = baselineBmrKcal + activeBurn
        return (tdee * 10.0).roundToInt() / 10.0
    }
}
