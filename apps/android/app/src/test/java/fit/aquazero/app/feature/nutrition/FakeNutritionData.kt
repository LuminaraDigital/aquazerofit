package fit.aquazero.app.feature.nutrition

import fit.aquazero.app.core.common.LocalDailyNutrition
import fit.aquazero.app.core.database.MealLogEntity
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.dto.DailyNutritionDto
import fit.aquazero.app.core.network.dto.FoodDto
import fit.aquazero.app.core.network.dto.MealLogItemDto
import fit.aquazero.app.core.network.dto.MealType
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/** Hand-written [NutritionData] double — no Room, no WorkManager, no network. */
class FakeNutritionData : NutritionData {

    val mealsByDate = MutableStateFlow<Map<String, List<MealLogEntity>>>(emptyMap())
    val nutritionByDate = MutableStateFlow<Map<String, LocalDailyNutrition>>(emptyMap())
    val trendFlow = MutableStateFlow<List<DayValue>>(emptyList())
    val recentsFlow = MutableStateFlow<List<FoodDto>>(emptyList())

    var dayResult: ApiResult<DailyNutritionDto> = ApiResult.Failure.Network(IOException("offline"))
    var searchResults: List<FoodDto> = emptyList()
    var copyCount: Int = 0
    var updateThrows: Boolean = false

    val refreshedDays = mutableListOf<String>()
    val searchedTerms = mutableListOf<String>()
    val loggedMeals = mutableListOf<Triple<MealType, List<MealLogItemDto>, String>>()
    val updatedMeals = mutableListOf<Pair<String, List<MealLogItemDto>>>()
    val deletedMeals = mutableListOf<String>()
    val touchedFoods = mutableListOf<String>()
    val loggedWater = mutableListOf<Pair<Int, String>>()
    val copiedDays = mutableListOf<Pair<String, String>>()

    override fun mealLogs(localDate: String): Flow<List<MealLogEntity>> =
        mealsByDate.map { it[localDate].orEmpty() }

    override fun dailyNutrition(localDate: String): Flow<LocalDailyNutrition> =
        nutritionByDate.map { it[localDate] ?: EMPTY_DAY }

    override fun kcalTrend(): Flow<List<DayValue>> = trendFlow

    override fun recentFoods(limit: Int): Flow<List<FoodDto>> = recentsFlow

    override suspend fun refreshDay(localDate: String): ApiResult<DailyNutritionDto> {
        refreshedDays += localDate
        return dayResult
    }

    override suspend fun refreshTrends(range: String) = Unit

    override suspend fun searchFoods(query: String): List<FoodDto> {
        searchedTerms += query
        return searchResults
    }

    override suspend fun touchFood(foodId: String) {
        touchedFoods += foodId
    }

    override suspend fun logMeal(
        mealType: MealType,
        items: List<MealLogItemDto>,
        localDate: String,
    ) {
        loggedMeals += Triple(mealType, items, localDate)
    }

    override suspend fun updateMeal(localId: String, items: List<MealLogItemDto>) {
        if (updateThrows) throw IllegalStateException("room write failed")
        updatedMeals += localId to items
    }

    override suspend fun deleteMeal(localId: String) {
        deletedMeals += localId
    }

    override suspend fun logWater(amountMl: Int, localDate: String) {
        loggedWater += amountMl to localDate
    }

    override suspend fun copyDay(fromDate: String, toDate: String): Int {
        copiedDays += fromDate to toDate
        return copyCount
    }

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
