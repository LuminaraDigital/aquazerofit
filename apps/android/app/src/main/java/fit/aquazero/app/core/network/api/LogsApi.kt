package fit.aquazero.app.core.network.api

import fit.aquazero.app.core.common.IdempotencyKeys
import fit.aquazero.app.core.model.CreateMealLogRequest
import fit.aquazero.app.core.model.CreateWaterLogRequest
import fit.aquazero.app.core.model.CreateWeightLogRequest
import fit.aquazero.app.core.model.DailyNutritionDto
import fit.aquazero.app.core.model.MealDayDto
import fit.aquazero.app.core.model.MealLogEnvelopeDto
import fit.aquazero.app.core.model.NutritionTrendsDto
import fit.aquazero.app.core.model.UpdateMealLogRequest
import fit.aquazero.app.core.model.WaterDayDto
import fit.aquazero.app.core.model.WaterLogDto
import fit.aquazero.app.core.model.WeightLogEnvelopeDto
import fit.aquazero.app.core.model.WeightLogsDto
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Meal / water / weight logging plus the nutrition analytics reads.
 * The three POST creates carry an [IdempotencyKeys.HEADER]; PUT/DELETE have
 * no server-side idempotency (see plan §4.2 for the replay rules).
 */
interface LogsApi {

    // ----- meal logs -----

    @POST("meal-logs")
    suspend fun createMealLog(
        @Header(IdempotencyKeys.HEADER) idempotencyKey: String,
        @Body body: CreateMealLogRequest,
    ): MealLogEnvelopeDto

    @GET("meal-logs")
    suspend fun mealLogs(@Query("date") date: String? = null): MealDayDto

    @PUT("meal-logs/{id}")
    suspend fun updateMealLog(
        @Path("id") id: String,
        @Body body: UpdateMealLogRequest,
    ): MealLogEnvelopeDto

    @DELETE("meal-logs/{id}")
    suspend fun deleteMealLog(@Path("id") id: String): ResponseBody?

    /** Copy the previous day's meals into today. */
    @POST("meal-logs/copy-previous")
    suspend fun copyPreviousMeals(): MealDayDto

    // ----- water logs -----

    /** Returns the created `WaterLog` document (unwrapped). */
    @POST("water-logs")
    suspend fun createWaterLog(
        @Header(IdempotencyKeys.HEADER) idempotencyKey: String,
        @Body body: CreateWaterLogRequest,
    ): WaterLogDto

    @GET("water-logs")
    suspend fun waterDay(@Query("date") date: String? = null): WaterDayDto

    // ----- weight logs -----

    @POST("weight-logs")
    suspend fun createWeightLog(
        @Header(IdempotencyKeys.HEADER) idempotencyKey: String,
        @Body body: CreateWeightLogRequest,
    ): WeightLogEnvelopeDto

    @GET("weight-logs")
    suspend fun weightLogs(@Query("range") range: String = "30d"): WeightLogsDto

    // ----- nutrition analytics -----

    @GET("analytics/nutrition/daily")
    suspend fun dailyNutrition(@Query("date") date: String? = null): DailyNutritionDto

    @GET("analytics/nutrition/trends")
    suspend fun nutritionTrends(@Query("range") range: String = "7d"): NutritionTrendsDto
}
