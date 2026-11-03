package fit.aquazero.app.core.common

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Performance recorded for a single completed work set.
 */
data class SetPerformance(
    val setNumber: Int,
    val weightKg: Double,
    val repsCompleted: Int,
    val targetReps: Int,
    val rir: Double? = null,
    val rpe: Double? = null,
)

/**
 * Movement classification for progressive load increments.
 */
enum class MovementCategory {
    COMPOUND_LOWER, // Squat, Deadlift, Leg Press (+2.5kg to +5kg)
    COMPOUND_UPPER, // Bench Press, Overhead Press, Barbell Row (+2.5kg)
    ISOLATION, // Lateral Raise, Bicep Curl, Tricep Pushdown (+1kg to +1.25kg)
    BODYWEIGHT, // Pull-ups, Dips, Push-ups
}

/**
 * Recommended progression action for the next session.
 */
enum class ProgressionAction {
    INCREASE_WEIGHT,
    INCREASE_REPS,
    MAINTAIN_LOAD,
    DELOAD_LOAD,
}

/**
 * Progression recommendation output.
 */
data class ProgressionRecommendation(
    val action: ProgressionAction,
    val suggestedWeightKg: Double,
    val suggestedReps: Int,
    val deltaWeightKg: Double,
    val reasoning: String,
    val estimated1RmKg: Double,
)

/**
 * Warm-up set prescription.
 */
data class WarmUpSet(
    val setNumber: Int,
    val weightKg: Double,
    val reps: Int,
    val percentOfWorkingWeight: Int,
    val restSeconds: Int,
)

/**
 * Personal Record (PR) evaluation result.
 */
data class PrEvaluation(
    val isNewPr: Boolean,
    val currentEstimated1RmKg: Double,
    val previousEstimated1RmKg: Double,
    val deltaKg: Double,
)

/**
 * Progressive Overload & Auto-Regulation Engine.
 *
 * Implements deterministic 1RM calculations (Epley & Brzycki formulas),
 * progressive overload logic based on Reps in Reserve (RIR), and warm-up set generation.
 *
 * Architectural Invariant:
 * Pure arithmetic only. Models never guess load progression.
 */
object ProgressiveOverloadEngine {

    /** Reps-in-reserve at or above which a compound-lower jump is doubled. */
    private const val ACCELERATED_JUMP_MIN_RIR = 3.0

    /** Below this load a failed set is held rather than deloaded — the bar is already light. */
    private const val DELOAD_MIN_WEIGHT_KG = 20.0

    /**
     * Calculate estimated 1 Rep Max (1RM) in kg.
     * Uses Epley formula for <= 10 reps, Brzycki for > 10 reps.
     */
    fun estimate1Rm(weightKg: Double, reps: Int): Double {
        if (weightKg <= 0.0 || reps <= 0) return 0.0
        if (reps == 1) return (weightKg * 10.0).roundToInt() / 10.0

        val estimated = if (reps <= 10) {
            // Epley formula: w * (1 + r / 30)
            weightKg * (1.0 + reps / 30.0)
        } else {
            // Brzycki formula: w * (36 / (37 - r)), clamped for safety if r >= 36
            val clampedReps = min(reps, 30)
            weightKg * (36.0 / (37.0 - clampedReps))
        }

        return (estimated * 10.0).roundToInt() / 10.0
    }

    /**
     * Evaluate if a set constitutes a new personal record (1RM).
     */
    fun evaluatePr(
        weightKg: Double,
        reps: Int,
        historicalBest1RmKg: Double,
    ): PrEvaluation {
        val current1Rm = estimate1Rm(weightKg, reps)
        val isPr = current1Rm > (historicalBest1RmKg + 0.1)
        val delta = if (isPr) (current1Rm - historicalBest1RmKg) else 0.0
        return PrEvaluation(
            isNewPr = isPr,
            currentEstimated1RmKg = current1Rm,
            previousEstimated1RmKg = historicalBest1RmKg,
            deltaKg = (delta * 10.0).roundToInt() / 10.0,
        )
    }

    /**
     * Recommend weight/reps progression for the next workout session.
     */
    fun recommendProgression(
        completedSets: List<SetPerformance>,
        targetMinReps: Int,
        targetMaxReps: Int,
        category: MovementCategory = MovementCategory.COMPOUND_UPPER,
        minimumWeightIncrementKg: Double? = null,
    ): ProgressionRecommendation {
        if (completedSets.isEmpty()) {
            return ProgressionRecommendation(
                action = ProgressionAction.MAINTAIN_LOAD,
                suggestedWeightKg = 0.0,
                suggestedReps = targetMinReps,
                deltaWeightKg = 0.0,
                reasoning = "No prior set data available.",
                estimated1RmKg = 0.0,
            )
        }

        val primarySet = completedSets.first()
        val best1Rm = completedSets.maxOfOrNull { estimate1Rm(it.weightKg, it.repsCompleted) } ?: 0.0

        val standardIncrement = minimumWeightIncrementKg ?: when (category) {
            MovementCategory.COMPOUND_LOWER -> 2.5
            MovementCategory.COMPOUND_UPPER -> 2.5
            MovementCategory.ISOLATION -> 1.25
            MovementCategory.BODYWEIGHT -> 0.0
        }

        val allSetsHitTopTarget = completedSets.all { it.repsCompleted >= targetMaxReps }
        val allSetsHitMinTarget = completedSets.all { it.repsCompleted >= targetMinReps }
        val averageRir = completedSets.mapNotNull { it.rir }.let { if (it.isNotEmpty()) it.average() else null }

        return when {
            // Case 1: Hit top of rep range across all sets with solid reserve -> Increase load
            allSetsHitTopTarget -> increaseLoad(
                primarySet = primarySet,
                averageRir = averageRir,
                category = category,
                standardIncrement = standardIncrement,
                targetMinReps = targetMinReps,
                best1Rm = best1Rm,
            )

            // Case 2: Hit minimum reps across sets -> Strive for rep progression at same load
            allSetsHitMinTarget -> increaseReps(
                completedSets = completedSets,
                primarySet = primarySet,
                targetMaxReps = targetMaxReps,
                best1Rm = best1Rm,
            )

            // Case 3: Missed minimum reps -> Hold weight or recover
            else -> holdOrDeload(
                completedSets = completedSets,
                primarySet = primarySet,
                targetMinReps = targetMinReps,
                best1Rm = best1Rm,
            )
        }
    }

    /** Case 1: every set reached the rep ceiling, so the load goes up. */
    private fun increaseLoad(
        primarySet: SetPerformance,
        averageRir: Double?,
        category: MovementCategory,
        standardIncrement: Double,
        targetMinReps: Int,
        best1Rm: Double,
    ): ProgressionRecommendation {
        val easyCompound = averageRir != null &&
            averageRir >= ACCELERATED_JUMP_MIN_RIR &&
            category == MovementCategory.COMPOUND_LOWER
        val weightBump = if (easyCompound) {
            standardIncrement * 2.0 // Accelerated jump for easy compound sets
        } else {
            standardIncrement
        }
        val roundedWeight = ((primarySet.weightKg + weightBump) * 10.0).roundToInt() / 10.0
        return ProgressionRecommendation(
            action = ProgressionAction.INCREASE_WEIGHT,
            suggestedWeightKg = roundedWeight,
            suggestedReps = targetMinReps,
            deltaWeightKg = weightBump,
            reasoning = "Target rep ceiling reached across all sets. " +
                "Increasing load by +${weightBump}kg.",
            estimated1RmKg = best1Rm,
        )
    }

    /** Case 2: minimum reps met at this load, so chase reps before weight. */
    private fun increaseReps(
        completedSets: List<SetPerformance>,
        primarySet: SetPerformance,
        targetMaxReps: Int,
        best1Rm: Double,
    ): ProgressionRecommendation {
        val avgReps = (completedSets.map { it.repsCompleted }.average()).roundToInt()
        return ProgressionRecommendation(
            action = ProgressionAction.INCREASE_REPS,
            suggestedWeightKg = primarySet.weightKg,
            suggestedReps = min(targetMaxReps, avgReps + 1),
            deltaWeightKg = 0.0,
            reasoning = "Weight locked in. Aim to add +1 rep per set toward top range ($targetMaxReps).",
            estimated1RmKg = best1Rm,
        )
    }

    /** Case 3: minimum reps missed — deload after repeated failures, else hold. */
    private fun holdOrDeload(
        completedSets: List<SetPerformance>,
        primarySet: SetPerformance,
        targetMinReps: Int,
        best1Rm: Double,
    ): ProgressionRecommendation {
        val failureSeverity = completedSets.count { it.repsCompleted < targetMinReps }
        if (failureSeverity >= 2 && primarySet.weightKg > DELOAD_MIN_WEIGHT_KG) {
            val deloadWeight = max(0.0, ((primarySet.weightKg * 0.9) * 2.0).roundToInt() / 2.0)
            return ProgressionRecommendation(
                action = ProgressionAction.DELOAD_LOAD,
                suggestedWeightKg = deloadWeight,
                suggestedReps = targetMinReps,
                deltaWeightKg = deloadWeight - primarySet.weightKg,
                reasoning = "Fell below minimum rep threshold ($targetMinReps). " +
                    "Suggest 10% deload to consolidate form.",
                estimated1RmKg = best1Rm,
            )
        }
        return ProgressionRecommendation(
            action = ProgressionAction.MAINTAIN_LOAD,
            suggestedWeightKg = primarySet.weightKg,
            suggestedReps = targetMinReps,
            deltaWeightKg = 0.0,
            // `$primarySet.weightKg` interpolates only `primarySet` and then appends the
            // literal ".weightKg", so this rendered the whole data class into coaching
            // copy. Braces make it the property.
            reasoning = "Maintain current load (${primarySet.weightKg} kg) " +
                "until all sets hit $targetMinReps reps.",
            estimated1RmKg = best1Rm,
        )
    }

    /**
     * Generate standard warm-up sets based on working set weight.
     */
    fun generateWarmUpSets(
        workingWeightKg: Double,
        barbellWeightKg: Double = 20.0,
    ): List<WarmUpSet> {
        if (workingWeightKg <= barbellWeightKg) {
            return emptyList()
        }

        val warmUps = mutableListOf<WarmUpSet>()
        var setIndex = 1

        // 1. Empty bar / light primer: 40-50%
        val set1Weight = max(barbellWeightKg, ((workingWeightKg * 0.45) / 2.5).roundToInt() * 2.5)
        warmUps.add(
            WarmUpSet(
                setNumber = setIndex++,
                weightKg = set1Weight,
                reps = 10,
                percentOfWorkingWeight = ((set1Weight / workingWeightKg) * 100).roundToInt(),
                restSeconds = 45,
            ),
        )

        // 2. Intermediate ramp: 65%
        val set2Weight = ((workingWeightKg * 0.65) / 2.5).roundToInt() * 2.5
        if (set2Weight > set1Weight + 2.5 && set2Weight < workingWeightKg - 5.0) {
            warmUps.add(
                WarmUpSet(
                    setNumber = setIndex++,
                    weightKg = set2Weight,
                    reps = 5,
                    percentOfWorkingWeight = ((set2Weight / workingWeightKg) * 100).roundToInt(),
                    restSeconds = 60,
                ),
            )
        }

        // 3. Heavy potentiation primer: 85%
        val set3Weight = ((workingWeightKg * 0.85) / 2.5).roundToInt() * 2.5
        if (set3Weight > set1Weight + 5.0 && set3Weight < workingWeightKg - 2.5) {
            warmUps.add(
                WarmUpSet(
                    setNumber = setIndex++,
                    weightKg = set3Weight,
                    reps = 2,
                    percentOfWorkingWeight = ((set3Weight / workingWeightKg) * 100).roundToInt(),
                    restSeconds = 90,
                ),
            )
        }

        return warmUps
    }
}
