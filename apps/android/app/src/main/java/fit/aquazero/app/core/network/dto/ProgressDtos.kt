package fit.aquazero.app.core.network.dto

import kotlinx.serialization.Serializable

/** Mirrors TS `ConsistencyStatus` — the recovery-aware streak model. */
@Serializable
data class ConsistencyStatusDto(
    val currentDays: Int = 0,
    val bestDays: Int = 0,
    val activeDays: Int = 0,
    val windowDays: Int = 28,
    val graceRemaining: Int = 0,
    val state: ConsistencyState = ConsistencyState.RESTING,
    val lastActiveDate: String? = null,
)

/** One achievement row inside `ProgressSummary`. */
@Serializable
data class AchievementStatusDto(
    val definition: AchievementDefinitionDto,
    val earnedAt: String? = null,
)

/** Mirrors TS `ProgressSummary` — response of `GET /progress/summary`. */
@Serializable
data class ProgressSummaryDto(
    val currentWeightKg: Double? = null,
    val startWeightKg: Double? = null,
    val targetWeightKg: Double? = null,
    val weightSeries: List<TrendPointDto> = emptyList(),
    val streakDays: Int = 0,
    val consistency: ConsistencyStatusDto = ConsistencyStatusDto(),
    val workoutsCompleted: Int = 0,
    val totalKcalBurned: Double = 0.0,
    val achievements: List<AchievementStatusDto> = emptyList(),
)

/** Mirrors TS `ProgressInsightStats`. */
@Serializable
data class ProgressInsightStatsDto(
    val deltaKg: Double? = null,
    val weighInsCount: Int = 0,
    val streakDays: Int = 0,
    val workoutsCompleted: Int = 0,
    val avgKcalVsTarget: Double? = null,
    val waterAdherencePct: Double? = null,
    val periodDays: Int = 7,
)

/** Mirrors TS `ProgressInsightChange`. */
@Serializable
data class ProgressInsightChangeDto(
    val metric: String,
    val direction: String,
    val delta: Double? = null,
    val label: String = "",
)

/** Mirrors TS `ProgressInsight` — `GET /progress/insight`. */
@Serializable
data class ProgressInsightDto(
    val id: String,
    val userId: String,
    val type: String = "progressInsight",
    val periodStart: String,
    val periodDays: Int = 7,
    val stats: ProgressInsightStatsDto = ProgressInsightStatsDto(),
    val changes: List<ProgressInsightChangeDto> = emptyList(),
    val narrative: String = "",
    val ai: AiMetadataDto? = null,
    val createdAt: String = "",
)
