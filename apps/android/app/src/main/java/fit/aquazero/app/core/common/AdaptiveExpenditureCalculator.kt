package fit.aquazero.app.core.common

import fit.aquazero.app.core.model.Sex
import fit.aquazero.app.core.model.TrendPointDto
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Adaptive Energy Expenditure calculation result.
 */
data class AdaptiveExpenditureResult(
    val estimatedTdeeKcal: Double,
    val baselineTdeeKcal: Double,
    val smoothedWeightKg: Double?,
    val weightTrendDeltaKg: Double,
    val confidence: ExpenditureConfidence,
    val recommendedTargetKcal: Double,
    val adaptationKcal: Double,
    val reasoning: String,
)

enum class ExpenditureConfidence {
    HIGH,
    MODERATE,
    LOW,
}

/**
 * Adaptive Expenditure Engine (beating MacroFactor).
 *
 * Implements an Exponentially Weighted Moving Average (EWMA) filter over scale weight
 * and matches smoothed weight velocity against logged caloric intake over a rolling window.
 *
 * Architectural Invariants:
 * 1. Arithmetic is pure and deterministic (no hallucinated AI models).
 * 2. Absolute safety floors are unconditionally enforced (AQF-02 / AQF-11):
 *    - 1,200 kcal for female users
 *    - 1,500 kcal for male users
 * 3. Weekly rate of adjustment is clamped to +/- 100 kcal to prevent wild fluctuations.
 */
object AdaptiveExpenditureCalculator {

    const val KCAL_PER_KG_WEIGHT: Double = 7700.0
    const val DEFAULT_EWMA_ALPHA: Double = 0.15
    const val MIN_DAYS_FOR_CONFIDENCE: Int = 7
    const val FEMALE_FLOOR_KCAL: Double = 1200.0
    const val MALE_FLOOR_KCAL: Double = 1500.0
    const val MAX_WEEKLY_ADJUSTMENT_KCAL: Double = 100.0

    /** Below this the adaptation is reported as "stable" rather than as a change. */
    const val STABLE_ADAPTATION_KCAL: Double = 15.0

    /**
     * Compute Exponentially Weighted Moving Average (EWMA) smoothed weight points.
     */
    fun smoothWeightSeries(
        rawPoints: List<TrendPointDto>,
        alpha: Double = DEFAULT_EWMA_ALPHA,
    ): List<TrendPointDto> {
        if (rawPoints.isEmpty()) return emptyList()
        val sorted = rawPoints.sortedBy { it.date }
        var currentSmoothed = sorted.first().value

        return sorted.map { point ->
            currentSmoothed = (alpha * point.value) + ((1.0 - alpha) * currentSmoothed)
            TrendPointDto(
                date = point.date,
                value = (currentSmoothed * 100.0).roundToInt() / 100.0,
            )
        }
    }

    /**
     * Calculate dynamic energy expenditure and adaptive targets.
     */
    fun calculate(
        weightHistory: List<TrendPointDto>,
        calorieHistory: List<TrendPointDto>,
        baselineTdee: Double,
        sex: Sex = Sex.UNSPECIFIED,
        targetDeficitSurplusKcal: Double = 0.0,
    ): AdaptiveExpenditureResult {
        val floorKcal = when (sex) {
            Sex.FEMALE -> FEMALE_FLOOR_KCAL
            Sex.MALE -> MALE_FLOOR_KCAL
            Sex.UNSPECIFIED -> FEMALE_FLOOR_KCAL
        }

        val smoothedWeights = smoothWeightSeries(weightHistory)
        val validDays = calorieHistory.filter { it.value > 500.0 } // Exclude empty/forgotten days

        if (smoothedWeights.size < 2 || validDays.size < MIN_DAYS_FOR_CONFIDENCE) {
            return insufficientDataResult(
                baselineTdee = baselineTdee,
                lastSmoothedWeightKg = smoothedWeights.lastOrNull()?.value,
                floorKcal = floorKcal,
                targetDeficitSurplusKcal = targetDeficitSurplusKcal,
            )
        }

        val firstWeight = smoothedWeights.first().value
        val lastWeight = smoothedWeights.last().value
        val totalWeightDelta = lastWeight - firstWeight
        val daysSpan = max(1, smoothedWeights.size)
        val dailyWeightVelocityKg = totalWeightDelta / daysSpan

        val avgLoggedKcal = validDays.map { it.value }.average()
        val dailySurplusDeficitFromScale = dailyWeightVelocityKg * KCAL_PER_KG_WEIGHT

        // TDEE = Intake - Surplus (or Intake + Deficit)
        val rawTdee = avgLoggedKcal - dailySurplusDeficitFromScale

        // Dampen wild spikes: clamp within +/- 25% of baseline TDEE
        val clampedTdee = rawTdee.coerceIn(baselineTdee * 0.75, baselineTdee * 1.25)
        val adaptationDelta = clampedTdee - baselineTdee

        // Clamp weekly change
        val boundedAdjustment = adaptationDelta.coerceIn(
            -MAX_WEEKLY_ADJUSTMENT_KCAL,
            MAX_WEEKLY_ADJUSTMENT_KCAL,
        )

        val rawTarget = (baselineTdee + boundedAdjustment) + targetDeficitSurplusKcal
        val finalTarget = max(floorKcal, rawTarget)

        val confidence = when {
            validDays.size >= 14 && smoothedWeights.size >= 10 -> ExpenditureConfidence.HIGH
            validDays.size >= 7 -> ExpenditureConfidence.MODERATE
            else -> ExpenditureConfidence.LOW
        }

        val reasoning = explainAdaptation(
            baselineTdee = baselineTdee,
            boundedAdjustment = boundedAdjustment,
            rawTarget = rawTarget,
            finalTarget = finalTarget,
            floorKcal = floorKcal,
        )

        return AdaptiveExpenditureResult(
            estimatedTdeeKcal = (clampedTdee * 10.0).roundToInt() / 10.0,
            baselineTdeeKcal = baselineTdee,
            smoothedWeightKg = lastWeight,
            weightTrendDeltaKg = (totalWeightDelta * 100.0).roundToInt() / 100.0,
            confidence = confidence,
            recommendedTargetKcal = (finalTarget * 10.0).roundToInt() / 10.0,
            adaptationKcal = (boundedAdjustment * 10.0).roundToInt() / 10.0,
            reasoning = reasoning,
        )
    }

    /**
     * Too few smoothed weights or logged days to infer adaptation: report the
     * baseline unchanged at LOW confidence rather than guessing from noise.
     */
    private fun insufficientDataResult(
        baselineTdee: Double,
        lastSmoothedWeightKg: Double?,
        floorKcal: Double,
        targetDeficitSurplusKcal: Double,
    ): AdaptiveExpenditureResult {
        val safeTarget = max(floorKcal, baselineTdee + targetDeficitSurplusKcal)
        return AdaptiveExpenditureResult(
            estimatedTdeeKcal = baselineTdee,
            baselineTdeeKcal = baselineTdee,
            smoothedWeightKg = lastSmoothedWeightKg,
            weightTrendDeltaKg = 0.0,
            confidence = ExpenditureConfidence.LOW,
            recommendedTargetKcal = (safeTarget * 10.0).roundToInt() / 10.0,
            adaptationKcal = 0.0,
            reasoning = "More consistent logging (at least $MIN_DAYS_FOR_CONFIDENCE days of food " +
                "and weight) is needed for high-confidence metabolic adaptation.",
        )
    }

    /** User-facing explanation of the adaptation, split out of [calculate] for length. */
    private fun explainAdaptation(
        baselineTdee: Double,
        boundedAdjustment: Double,
        rawTarget: Double,
        finalTarget: Double,
        floorKcal: Double,
    ): String = buildString {
        if (abs(boundedAdjustment) < STABLE_ADAPTATION_KCAL) {
            append("Metabolic expenditure is stable near baseline ($baselineTdee kcal/day).")
        } else if (boundedAdjustment > 0) {
            append(
                "Your expenditure has adapted upward by +${boundedAdjustment.roundToInt()} " +
                    "kcal/day based on recent activity and weight trends.",
            )
        } else {
            append(
                "Metabolic rate slightly adjusted by ${boundedAdjustment.roundToInt()} " +
                    "kcal/day to maintain optimal progression.",
            )
        }
        if (finalTarget <= floorKcal && rawTarget < floorKcal) {
            append(" Target clamped to safety floor (${floorKcal.toInt()} kcal).")
        }
    }
}
