package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/** Mirrors TS `TrendPoint`. */
@Serializable
data class TrendPointDto(
    val date: String,
    val value: Double,
)

/** One consumed/target pair inside `DailyNutrition`. */
@Serializable
data class ConsumedTargetDto(
    val consumed: Double = 0.0,
    val target: Double = 0.0,
)

/** Mirrors TS `DailyNutrition` — response of `GET /analytics/nutrition/daily`. */
@Serializable
data class DailyNutritionDto(
    val date: String,
    val kcalTarget: Double = 0.0,
    val kcalConsumed: Double = 0.0,
    val kcalBurned: Double = 0.0,
    val kcalNet: Double = 0.0,
    val kcalRemaining: Double = 0.0,
    val proteinG: ConsumedTargetDto = ConsumedTargetDto(),
    val carbsG: ConsumedTargetDto = ConsumedTargetDto(),
    val fatG: ConsumedTargetDto = ConsumedTargetDto(),
    val waterMl: ConsumedTargetDto = ConsumedTargetDto(),
    val meals: Map<MealType, List<MealLogDto>> = emptyMap(),
)

/** Response of `GET /analytics/nutrition/trends?range=`. */
@Serializable
data class NutritionTrendsDto(
    val range: String,
    val kcal: List<TrendPointDto> = emptyList(),
    val proteinG: List<TrendPointDto> = emptyList(),
    val carbsG: List<TrendPointDto> = emptyList(),
    val fatG: List<TrendPointDto> = emptyList(),
)
