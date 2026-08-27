package fit.aquazero.app.feature.dashboard

import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.ProgressSummaryDto
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/** Hand-written [DashboardData] double — no Room, no WorkManager, no network. */
class FakeDashboardData : DashboardData {

    val nutritionFlow = MutableStateFlow(EMPTY_DAY)
    val userFlow = MutableStateFlow<UserEntity?>(null)
    val summaryFlow = MutableStateFlow<ProgressSummaryDto?>(null)
    val weightFlow = MutableStateFlow<List<Double>>(emptyList())

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

    override fun dailyNutrition(localDate: String): Flow<LocalDailyNutrition> = nutritionFlow

    override fun user(): Flow<UserEntity?> = userFlow

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
