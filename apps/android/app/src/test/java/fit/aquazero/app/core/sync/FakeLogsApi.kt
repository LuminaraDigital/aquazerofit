package fit.aquazero.app.core.sync

import fit.aquazero.app.core.model.CreateMealLogRequest
import fit.aquazero.app.core.model.CreateWaterLogRequest
import fit.aquazero.app.core.model.CreateWeightLogRequest
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.MealDayDto
import fit.aquazero.app.core.model.MealLogDto
import fit.aquazero.app.core.model.MealLogEnvelopeDto
import fit.aquazero.app.core.model.NutritionTrendsDto
import fit.aquazero.app.core.model.UpdateMealLogRequest
import fit.aquazero.app.core.model.WaterDayDto
import fit.aquazero.app.core.model.WaterLogDto
import fit.aquazero.app.core.model.WeightLogDto
import fit.aquazero.app.core.model.WeightLogEnvelopeDto
import fit.aquazero.app.core.model.WeightLogsDto
import fit.aquazero.app.core.network.api.LogsApi
import okhttp3.ResponseBody

/**
 * Scriptable [LogsApi] for the drain tests.
 *
 * Each `…Throws` hook supplies the exception the next matching call should
 * raise, which is how a test picks the branch of `safeCall` it wants: an
 * [okhttp3.internal.http2.StreamResetException]-shaped `IOException` for a
 * network stall, a `retrofit2.HttpException` for a 4xx, a
 * `SerializationException` for the 2xx nobody can decode. Calls are counted so
 * a test can assert that a write never left the device, or that reconciliation
 * actually ran.
 *
 * Endpoints the outbox never touches fail loudly rather than returning a
 * plausible empty value.
 */
internal class FakeLogsApi : LogsApi {

    /** Server state the reconciliation fetch will find, keyed by local date. */
    val mealDays = mutableMapOf<String, MealDayDto>()

    /** Every `Idempotency-Key` header that reached the wire, in order. */
    val idempotencyKeys = mutableListOf<String>()

    var createMealThrows: (() -> Throwable)? = null
    var createWaterThrows: (() -> Throwable)? = null
    var createWeightThrows: (() -> Throwable)? = null
    var mealDayThrows: (() -> Throwable)? = null

    var createMealCalls = 0
        private set
    var createWaterCalls = 0
        private set
    var mealDayCalls = 0
        private set
    var updateMealCalls = 0
        private set

    override suspend fun createMealLog(
        idempotencyKey: String,
        body: CreateMealLogRequest,
    ): MealLogEnvelopeDto {
        createMealCalls++
        idempotencyKeys += idempotencyKey
        createMealThrows?.let { throw it() }
        return MealLogEnvelopeDto(log = serverMeal("srv-meal-$createMealCalls", body))
    }

    override suspend fun mealLogs(date: String?): MealDayDto {
        mealDayCalls++
        mealDayThrows?.let { throw it() }
        return mealDays[date] ?: MealDayDto(date = date.orEmpty())
    }

    override suspend fun updateMealLog(id: String, body: UpdateMealLogRequest): MealLogEnvelopeDto {
        updateMealCalls++
        return MealLogEnvelopeDto(
            log = serverMeal(id, CreateMealLogRequest(items = emptyList(), localDate = "")),
        )
    }

    override suspend fun deleteMealLog(id: String): ResponseBody? = null

    override suspend fun copyPreviousMeals(): MealDayDto = error("not used by the outbox drain")

    override suspend fun createWaterLog(idempotencyKey: String, body: CreateWaterLogRequest): WaterLogDto {
        createWaterCalls++
        idempotencyKeys += idempotencyKey
        createWaterThrows?.let { throw it() }
        return WaterLogDto(
            id = "srv-water-$createWaterCalls",
            userId = "u-1",
            amountMl = body.amountMl,
            loggedAt = "${body.localDate}T09:00:00.000Z",
            localDate = body.localDate,
        )
    }

    override suspend fun waterDay(date: String?): WaterDayDto = WaterDayDto(date = date.orEmpty(), totalMl = 0)

    override suspend fun createWeightLog(
        idempotencyKey: String,
        body: CreateWeightLogRequest,
    ): WeightLogEnvelopeDto {
        idempotencyKeys += idempotencyKey
        createWeightThrows?.let { throw it() }
        return WeightLogEnvelopeDto(
            log = WeightLogDto(
                id = "srv-weight-1",
                userId = "u-1",
                weightKg = body.weightKg,
                loggedAt = "${body.localDate}T06:00:00.000Z",
                localDate = body.localDate,
            ),
        )
    }

    override suspend fun weightLogs(range: String): WeightLogsDto = error("not used by the outbox drain")

    override suspend fun dailyNutrition(date: String?): DailyNutritionDto = error("not used by the outbox drain")

    override suspend fun nutritionTrends(range: String): NutritionTrendsDto = error("not used by the outbox drain")

    private fun serverMeal(id: String, body: CreateMealLogRequest): MealLogDto = MealLogDto(
        id = id,
        userId = "u-1",
        mealType = body.mealType,
        items = body.items,
        totalKcal = body.items.sumOf { it.kcal },
        loggedAt = "${body.localDate}T12:00:00.000Z",
        localDate = body.localDate,
    )
}
