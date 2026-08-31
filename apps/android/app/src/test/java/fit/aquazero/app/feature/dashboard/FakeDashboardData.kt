package fit.aquazero.app.feature.dashboard

import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.ProgressSummaryDto
import fit.aquazero.app.core.model.ProgressionStatusDto
import fit.aquazero.app.core.model.ReadinessAssessmentDto
import fit.aquazero.app.core.model.ReadinessMode
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import java.io.IOException

/** Hand-written [DashboardData] double — no Room, no WorkManager, no network. */
class FakeDashboardData : DashboardData {

    val nutritionFlow = MutableStateFlow(EMPTY_DAY)
    val userFlow = MutableStateFlow<UserEntity?>(null)
    val summaryFlow = MutableStateFlow<ProgressSummaryDto?>(null)
    val weightFlow = MutableStateFlow<List<Double>>(emptyList())
    val profileFlow = MutableStateFlow<fit.aquazero.app.core.database.ProfileEntity?>(null)
    val targetsFlow = MutableStateFlow<fit.aquazero.app.core.database.TargetsEntity?>(null)

    var dayResult: ApiResult<DailyNutritionDto> = ApiResult.Failure.Network(IOException("offline"))
    var progressResult: ApiResult<ProgressSummaryDto> = ApiResult.Success(ProgressSummaryDto())
    var workoutResult: ApiResult<TodayWorkoutEnvelopeDto> =
        ApiResult.Success(TodayWorkoutEnvelopeDto(rest = true))
    var suggestResult: ApiResult<MealRecommendationDto> =
        ApiResult.Failure.Network(IOException("offline"))
    var logRecommendationResult: ApiResult<MealLogDto> =
        ApiResult.Failure.Network(IOException("offline"))

    var logWaterThrows: Boolean = false
    val loggedWater = mutableListOf<Pair<Int, String>>()
    val suggestedFor = mutableListOf<MealType>()
    var profileRefreshes = 0

    var readinessResult: ApiResult<ReadinessAssessmentDto> =
        ApiResult.Success(ReadinessAssessmentDto(mode = ReadinessMode.MAINTAIN, score = 50, headline = "Steady week"))
    var progressionResult: ApiResult<ProgressionStatusDto> =
        ApiResult.Success(ProgressionStatusDto())

    override fun dailyNutrition(localDate: String): Flow<LocalDailyNutrition> = nutritionFlow

    override fun user(): Flow<UserEntity?> = userFlow

    override fun profile(): Flow<fit.aquazero.app.core.database.ProfileEntity?> = profileFlow

    override fun targets(): Flow<fit.aquazero.app.core.database.TargetsEntity?> = targetsFlow

    override fun progressSummary(): Flow<ProgressSummaryDto?> = summaryFlow

    override fun weightSeries(): Flow<List<Double>> = weightFlow

    override suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto> = dayResult

    override suspend fun refreshProfile() {
        profileRefreshes++
    }

    override suspend fun refreshProgress(): ApiResult<ProgressSummaryDto> = progressResult

    override suspend fun todayWorkout(): ApiResult<TodayWorkoutEnvelopeDto> = workoutResult

    override suspend fun logWater(amountMl: Int, localDate: String) {
        if (logWaterThrows) throw IllegalStateException("room write failed")
        loggedWater += amountMl to localDate
    }

    override suspend fun suggestMeal(mealType: MealType): ApiResult<MealRecommendationDto> {
        suggestedFor += mealType
        return suggestResult
    }

    override suspend fun logRecommendation(recommendationId: String): ApiResult<MealLogDto> =
        logRecommendationResult

    override suspend fun readiness(): ApiResult<ReadinessAssessmentDto> = readinessResult

    override suspend fun progression(): ApiResult<ProgressionStatusDto> = progressionResult

    companion object {
        val EMPTY_DAY = LocalDailyNutrition(
            kcalTarget = 0.0,
            kcalConsumed = 0.0,
            kcalRemaining = 0.0,
            proteinConsumed = 0.0,
            proteinTarget = 0.0,
            carbsConsumed = 0.0,
            carbsTarget = 0.0,
            fatConsumed = 0.0,
            fatTarget = 0.0,
            waterConsumedMl = 0,
            waterTargetMl = 0,
        )
    }
}
