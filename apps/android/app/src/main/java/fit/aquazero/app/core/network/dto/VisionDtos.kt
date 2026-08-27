package fit.aquazero.app.core.network.dto

import kotlinx.serialization.Serializable

/** Mirrors TS `VisionPrediction`. */
@Serializable
data class VisionPredictionDto(
    val name: String,
    val foodId: String? = null,
    val estimatedGrams: Double = 0.0,
    val confidence: Double = 0.0,
    val kcal: Double = 0.0,
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
)

/** Mirrors TS `VisionJob` (public projection). */
@Serializable
data class VisionJobDto(
    val id: String,
    val userId: String = "",
    val type: String = "cvJob",
    val status: VisionJobStatus,
    val mealType: MealType = MealType.SNACK,
    val predictions: List<VisionPredictionDto> = emptyList(),
    val ai: AiMetadataDto? = null,
    val error: String? = null,
    val createdAt: String = "",
    val completedAt: String? = null,
)

/** Envelope for `GET /meal-photos/:jobId` and `POST /meal-photos` — `{job}`. */
@Serializable
data class VisionJobEnvelopeDto(
    val job: VisionJobDto,
)

/**
 * Response of `POST /meal-photos/:jobId/confirm` — the confirmed meal log.
 * A replayed confirm returns CONFLICT whose `details` should carry the
 * `mealLogId` (backend delta 10); until it lands, reconcile via the day's
 * meal logs matched on `visionJobId`.
 */
@Serializable
data class VisionConfirmResponseDto(
    val log: MealLogDto? = null,
    val job: VisionJobDto? = null,
)
