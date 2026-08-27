package fit.aquazero.app.feature.dashboard

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.data.NutritionDayRepository
import fit.aquazero.app.core.data.PlansRepository
import fit.aquazero.app.core.data.ProfileRepository
import fit.aquazero.app.core.data.ProgressRepository
import fit.aquazero.app.core.database.UserEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealRecommendationDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.model.ProgressSummaryDto
import fit.aquazero.app.core.model.TodayWorkoutEnvelopeDto
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Everything the dashboard reads or writes, expressed as one narrow port over
 * `core/data`. The screen never touches Retrofit or Room — this is the single
 * seam, and the reason [DashboardViewModel] is testable on the JVM with a
 * hand-written fake (the real repositories are final classes wired to
 * WorkManager and the Room driver).
 */
interface DashboardData {

    /** Live, Room-backed day totals — correct offline (plan §4.2 recompute). */
    fun dailyNutrition(localDate: String): Flow<LocalDailyNutrition>

    /** Cached account row (drives the greeting). */
    fun user(): Flow<UserEntity?>

    /** Cached progress snapshot (weight, achievements). */
    fun progressSummary(): Flow<ProgressSummaryDto?>

    /** Cached weight trend points, oldest first. */
    fun weightSeries(): Flow<List<Double>>

    /** Refresh-on-observe for the day; returns the server's view of it. */
    suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto>

    /** Refresh the account row + derived targets. */
    suspend fun refreshProfile()

    /** Refresh the progress snapshot (weight series included). */
    suspend fun refreshProgress(): ApiResult<ProgressSummaryDto>

    /** Today's workout envelope, typed once (plan §3 envelope trap). */
    suspend fun todayWorkout(): ApiResult<TodayWorkoutEnvelopeDto>

    /** Optimistic, Room-first water log. Returns once the local row exists. */
    suspend fun logWater(amountMl: Int, localDate: String)

    /** On-demand AI meal suggestion (online-only). */
    suspend fun suggestMeal(mealType: MealType): ApiResult<MealRecommendationDto>

    /** Log a suggestion the user explicitly accepted (online-only). */
    suspend fun logRecommendation(recommendationId: String): ApiResult<MealLogDto>
}

/** Production [DashboardData], delegating to the Wave 1 repositories only. */
@Singleton
class DefaultDashboardData @Inject constructor(
    private val logsRepository: LogsRepository,
    private val nutritionDayRepository: NutritionDayRepository,
    private val profileRepository: ProfileRepository,
    private val progressRepository: ProgressRepository,
    private val plansRepository: PlansRepository,
) : DashboardData {

    override fun dailyNutrition(localDate: String): Flow<LocalDailyNutrition> =
        logsRepository.localDailyNutrition(localDate)

    override fun user(): Flow<UserEntity?> = profileRepository.user()

    override fun progressSummary(): Flow<ProgressSummaryDto?> = progressRepository.summary()

    override fun weightSeries(): Flow<List<Double>> =
        progressRepository.series(ProgressRepository.SERIES_WEIGHT)
            .map { points -> points.sortedBy { it.date }.map { it.value } }

    override suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto> =
        nutritionDayRepository.refreshDay(localDate)

    override suspend fun refreshProfile() {
        profileRepository.refreshMe()
        profileRepository.refreshProfileAndTargets()
    }

    override suspend fun refreshProgress(): ApiResult<ProgressSummaryDto> =
        progressRepository.refreshSummary()

    override suspend fun todayWorkout(): ApiResult<TodayWorkoutEnvelopeDto> =
        plansRepository.todayWorkout()

    override suspend fun logWater(amountMl: Int, localDate: String) {
        logsRepository.logWater(amountMl, localDate)
    }

    override suspend fun suggestMeal(mealType: MealType): ApiResult<MealRecommendationDto> =
        nutritionDayRepository.suggestMeal(mealType)

    override suspend fun logRecommendation(recommendationId: String): ApiResult<MealLogDto> =
        nutritionDayRepository.logRecommendation(recommendationId)
}

/** Binds the production implementation of [DashboardData]. */
@Module
@InstallIn(SingletonComponent::class)
abstract class DashboardDataModule {
    @Binds
    abstract fun bindDashboardData(impl: DefaultDashboardData): DashboardData
}
