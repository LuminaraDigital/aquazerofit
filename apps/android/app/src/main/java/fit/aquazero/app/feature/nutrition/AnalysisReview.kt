package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.core.common.MealTrust
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.VisionJobDto
import fit.aquazero.app.core.model.VisionJobStatus
import fit.aquazero.app.core.model.VisionPredictionDto
import fit.aquazero.app.core.ui.NutritionFormat
import kotlin.math.roundToInt

/**
 * The arithmetic behind the confirmation gate.
 *
 * Every number the user sees after a gram edit is computed **here, in code**,
 * from the ratios captured when the list was seeded. The model is never asked
 * again, and a second opinion can never contradict the first. Pure, so all of
 * it is covered by JVM unit tests.
 */
object AnalysisReview {

    /** Matches `GramsStepper`'s clamp and the API's item-gram plausibility bounds. */
    const val MIN_GRAMS: Int = 5

    /** Upper gram clamp. */
    const val MAX_GRAMS: Int = 2000

    /** `confirmVisionSchema` accepts 1..30 items. */
    const val MAX_ITEMS: Int = 30

    /** ≥75% reads as High. */
    const val HIGH_CONFIDENCE: Double = 0.75

    /** ≥50% reads as Medium. */
    const val MEDIUM_CONFIDENCE: Double = 0.5

    /** Ratios for one gram. A zero-gram prediction yields zeroes, never NaN. */
    fun perGramOf(
        grams: Double,
        kcal: Double,
        proteinG: Double,
        carbsG: Double,
        fatG: Double,
    ): PerGram = if (grams > 0.0) {
        PerGram(
            kcal = kcal / grams,
            proteinG = proteinG / grams,
            carbsG = carbsG / grams,
            fatG = fatG / grams,
        )
    } else {
        PerGram(0.0, 0.0, 0.0, 0.0)
    }

    /**
     * Seed the editable list from the job's predictions. Called exactly once
     * per job. See [AnalysisUiState.seeded]. Never auto-commits anything.
     */
    fun seed(predictions: List<VisionPredictionDto>): List<ReviewItem> =
        predictions.take(MAX_ITEMS).mapIndexed { index, prediction ->
            ReviewItem(
                key = "pred-$index",
                foodId = prediction.foodId,
                name = prediction.name,
                grams = prediction.estimatedGrams.roundToInt().coerceIn(MIN_GRAMS, MAX_GRAMS),
                perGram = perGramOf(
                    grams = prediction.estimatedGrams,
                    kcal = prediction.kcal,
                    proteinG = prediction.proteinG,
                    carbsG = prediction.carbsG,
                    fatG = prediction.fatG,
                ),
                confidence = prediction.confidence.takeIf { it > 0.0 },
            )
        }

    /** A row for a food the user searched for and added. */
    fun fromFood(food: FoodDto, grams: Int, key: String): ReviewItem {
        val clamped = grams.coerceIn(MIN_GRAMS, MAX_GRAMS)
        return ReviewItem(
            key = key,
            foodId = food.id,
            name = food.name,
            grams = clamped,
            perGram = PerGram(
                kcal = food.per100g.kcal / 100.0,
                proteinG = food.per100g.proteinG / 100.0,
                carbsG = food.per100g.carbsG / 100.0,
                fatG = food.per100g.fatG / 100.0,
            ),
            confidence = null,
        )
    }

    /** User-applied cooking fat from a preset chip (never auto-injected). */
    fun fromCookingFatPreset(preset: MealTrust.CookingFatPreset, key: String): ReviewItem {
        val grams = preset.grams.roundToInt().coerceIn(MIN_GRAMS, MAX_GRAMS)
        val base = preset.grams.coerceAtLeast(1.0)
        return ReviewItem(
            key = key,
            foodId = null,
            name = preset.label,
            grams = grams,
            perGram = PerGram(
                kcal = preset.kcal / base,
                proteinG = 0.0,
                carbsG = 0.0,
                fatG = preset.fatG / base,
            ),
            confidence = null,
        )
    }

    fun shouldShowFatCaution(items: List<ReviewItem>): Boolean {
        val totals = totals(items)
        return MealTrust.shouldShowFatCaution(
            items.map { it.name },
            totals.kcal,
            totals.fatG,
        )
    }

    /** The wire item for one row, recomputed from its ratios. */
    fun toMealLogItem(item: ReviewItem): MealLogItemDto = MealLogItemDto(
        foodId = item.foodId,
        name = item.name,
        grams = item.grams.toDouble(),
        kcal = (item.perGram.kcal * item.grams).roundToInt().toDouble(),
        proteinG = NutritionFormat.round1(item.perGram.proteinG * item.grams),
        carbsG = NutritionFormat.round1(item.perGram.carbsG * item.grams),
        fatG = NutritionFormat.round1(item.perGram.fatG * item.grams),
    )

    /** Totals across the edited list, summed from the displayed values. */
    fun totals(items: List<ReviewItem>): ReviewTotals {
        val computed = items.map(::toMealLogItem)
        return ReviewTotals(
            kcal = computed.sumOf { it.kcal },
            proteinG = NutritionFormat.round1(computed.sumOf { it.proteinG }),
            carbsG = NutritionFormat.round1(computed.sumOf { it.carbsG }),
            fatG = NutritionFormat.round1(computed.sumOf { it.fatG }),
        )
    }

    /**
     * Fold a polled job into screen state.
     *
     * This is where the **seed-once rule** lives: predictions become editable
     * rows exactly once, and every later poll leaves [AnalysisUiState.items]
     * untouched. Without that, a re-poll landing after the user renamed an
     * item or changed a portion would silently throw the edit away, and the
     * user would then confirm numbers they never chose.
     *
     * The returned state is terminal when its phase is no longer
     * [AnalysisPhase.Scanning].
     */
    fun fold(current: AnalysisUiState, job: VisionJobDto): AnalysisUiState = when (job.status) {
        VisionJobStatus.QUEUED, VisionJobStatus.PROCESSING -> current.copy(
            phase = AnalysisPhase.Scanning,
            mealType = job.mealType,
        )

        VisionJobStatus.SUCCEEDED, VisionJobStatus.CONFIRMED -> if (current.seeded) {
            current.copy(
                phase = AnalysisPhase.Review,
                confirmed = current.confirmed || job.status == VisionJobStatus.CONFIRMED,
            )
        } else {
            current.copy(
                phase = AnalysisPhase.Review,
                mealType = job.mealType,
                items = seed(job.predictions),
                seeded = true,
                confirmed = job.status == VisionJobStatus.CONFIRMED,
            )
        }

        VisionJobStatus.FAILED -> current.copy(
            phase = AnalysisPhase.Failed,
            jobErrorMessage = job.error,
        )
    }

    /** ≥75% High, ≥50% Medium, else Low. */
    fun tierOf(confidence: Double): ConfidenceTier = when {
        confidence >= HIGH_CONFIDENCE -> ConfidenceTier.High
        confidence >= MEDIUM_CONFIDENCE -> ConfidenceTier.Medium
        else -> ConfidenceTier.Low
    }

    /** Whole-percent rendering of a 0..1 confidence. */
    fun percent(confidence: Double): Int = (confidence * 100).roundToInt()
}
