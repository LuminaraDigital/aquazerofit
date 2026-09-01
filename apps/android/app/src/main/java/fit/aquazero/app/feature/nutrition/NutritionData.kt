package fit.aquazero.app.feature.nutrition

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.data.CatalogRepository
import fit.aquazero.app.core.data.LogsRepository
import fit.aquazero.app.core.data.NutritionDayRepository
import fit.aquazero.app.core.data.ProgressRepository
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.FoodDto
import fit.aquazero.app.core.model.MealLogItemDto
import fit.aquazero.app.core.model.MealType
import fit.aquazero.app.core.ui.NutritionFormat
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/** One point of a daily series (kcal bars, calendar dots). */
data class DayValue(val date: String, val value: Double)

/**
 * Everything the nutrition day view reads or writes. Same seam rationale as
 * `DashboardData`: the screen talks to repositories only, and the ViewModel
 * stays JVM-testable behind a hand-written fake.
 */
interface NutritionData {

    /** The day's meal logs, Room-backed (soft-deleted rows excluded). */
    fun mealLogs(localDate: String): Flow<List<MealLogEntity>>

    /** Live day totals recomputed locally — correct offline. */
    fun dailyNutrition(localDate: String): Flow<LocalDailyNutrition>

    /** Cached daily kcal series for the weekly bars and calendar dots. */
    fun kcalTrend(): Flow<List<DayValue>>

    /** Recently used foods — the offline half of the food search sheet. */
    fun recentFoods(limit: Int = 20): Flow<List<FoodDto>>

    /** Refresh-on-observe for one day. */
    suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto>

    /** Refresh the kcal/protein trend series. */
    suspend fun refreshTrends(range: String = "7d")

    /** Server-side food search with a Room recent/frequent fallback. */
    suspend fun searchFoods(query: String): List<FoodDto>

    /** Record a food as used (feeds the recent/frequent cache policy). */
    suspend fun touchFood(foodId: String)

    /** Offline-first meal create. */
    suspend fun logMeal(mealType: MealType, items: List<MealLogItemDto>, localDate: String)

    /** Offline-first meal edit (outboxed as a follow-up PUT). */
    suspend fun updateMeal(localId: String, items: List<MealLogItemDto>)

    /** Offline-first meal delete (soft-delete + outboxed DELETE). */
    suspend fun deleteMeal(localId: String)

    /** Offline-first one-tap hydration. */
    suspend fun logWater(amountMl: Int, localDate: String)

    /**
     * Copy every meal logged on [fromDate] into [toDate]. Returns how many
     * logs were copied; zero means there was nothing to copy.
     */
    suspend fun copyDay(fromDate: String, toDate: String): Int
}

/** Production [NutritionData] over the Wave 1 repositories. */
@Singleton
class DefaultNutritionData @Inject constructor(
    private val logsRepository: LogsRepository,
    private val nutritionDayRepository: NutritionDayRepository,
    private val catalogRepository: CatalogRepository,
    private val progressRepository: ProgressRepository,
) : NutritionData {

    override fun mealLogs(localDate: String): Flow<List<MealLogEntity>> =
        logsRepository.mealLogsForDate(localDate)

    override fun dailyNutrition(localDate: String): Flow<LocalDailyNutrition> =
        logsRepository.localDailyNutrition(localDate)

    override fun kcalTrend(): Flow<List<DayValue>> =
        progressRepository.series(ProgressRepository.SERIES_KCAL)
            .map { points -> points.sortedBy { it.date }.map { DayValue(it.date, it.value) } }

    override fun recentFoods(limit: Int): Flow<List<FoodDto>> =
        catalogRepository.recentFoods(limit).map { rows ->
            rows.mapNotNull { row ->
                runCatching { AzfJson.decodeFromString(FoodDto.serializer(), row.docJson) }
                    .getOrNull()
            }
        }

    override suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto> =
        nutritionDayRepository.refreshDay(localDate)

    override suspend fun refreshTrends(range: String) {
        progressRepository.refreshNutritionTrends(range)
    }

    override suspend fun searchFoods(query: String): List<FoodDto> =
        catalogRepository.searchFoods(query)

    override suspend fun touchFood(foodId: String) {
        catalogRepository.touchFood(foodId)
    }

    override suspend fun logMeal(
        mealType: MealType,
        items: List<MealLogItemDto>,
        localDate: String,
    ) {
        logsRepository.logMeal(mealType = mealType, items = items, localDate = localDate)
    }

    override suspend fun updateMeal(localId: String, items: List<MealLogItemDto>) {
        nutritionDayRepository.updateMealItems(localId, items)
    }

    override suspend fun deleteMeal(localId: String) {
        logsRepository.deleteMeal(localId)
    }

    override suspend fun logWater(amountMl: Int, localDate: String) {
        logsRepository.logWater(amountMl, localDate)
    }

    override suspend fun copyDay(fromDate: String, toDate: String): Int {
        // Pull the source day first so a device that never opened it still
        // has something to copy; a failure here just means "cache only".
        nutritionDayRepository.refreshDay(fromDate)
        val source = nutritionDayRepository.mealLogsOnce(fromDate).filter { it.items.isNotEmpty() }
        for (log in source) {
            logsRepository.logMeal(
                mealType = NutritionFormat.mealTypeOf(log.mealType),
                items = log.items,
                localDate = toDate,
            )
        }
        return source.size
    }
}

/** Binds the production implementation of [NutritionData]. */
@Module
@InstallIn(SingletonComponent::class)
abstract class NutritionDataModule {
    @Binds
    abstract fun bindNutritionData(impl: DefaultNutritionData): NutritionData
}
