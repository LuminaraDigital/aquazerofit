package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/** Mirrors TS `MealLogItem`. */
@Serializable
data class MealLogItemDto(
    val foodId: String? = null,
    val name: String,
    val grams: Double,
    val kcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val fiberG: Double? = null,
    val sugarG: Double? = null,
    val sodiumMg: Double? = null,
    val potassiumMg: Double? = null,
    val calciumMg: Double? = null,
    val ironMg: Double? = null,
)

/** Mirrors TS `MealLog`. */
@Serializable
data class MealLogDto(
    val id: String,
    val userId: String,
    val type: String = "mealLog",
    /** Defaulted so a meal type added server-side does not fail the decode. */
    val mealType: MealType = MealType.SNACK,
    val items: List<MealLogItemDto> = emptyList(),
    val totalKcal: Double = 0.0,
    val totalProteinG: Double = 0.0,
    val totalCarbsG: Double = 0.0,
    val totalFatG: Double = 0.0,
    val source: MealLogSource = MealLogSource.MANUAL,
    val visionJobId: String? = null,
    val loggedAt: String,
    val localDate: String,
)

/**
 * Body for `POST /meal-logs` (shared `createMealLogSchema`).
 *
 * Unlike the other request bodies this one is also *decoded*: the outbox
 * stores it as `payloadJson` and reads it back at delivery time, so it sits on
 * the tolerant-decode path and its enum needs a default like any response
 * field. Losing a queued meal outright because a downgraded build no longer
 * knows the stored meal type is worse than delivering it as a snack. Every
 * call site still passes [mealType] explicitly.
 */
@Serializable
data class CreateMealLogRequest(
    val mealType: MealType = MealType.SNACK,
    val items: List<MealLogItemDto>,
    val loggedAt: String? = null,
    val localDate: String,
)

/** Body for `PUT /meal-logs/:id` (all fields optional). */
@Serializable
data class UpdateMealLogRequest(
    val mealType: MealType? = null,
    val items: List<MealLogItemDto>? = null,
    val loggedAt: String? = null,
    val localDate: String? = null,
)

/** Response of `POST /meal-logs` and `PUT /meal-logs/:id` — `{log}`. */
@Serializable
data class MealLogEnvelopeDto(
    val log: MealLogDto,
)

/** Response of `GET /meal-logs?date=` — `{date, meals, totals}`. */
@Serializable
data class MealDayDto(
    val date: String,
    val meals: Map<MealType, List<MealLogDto>> = emptyMap(),
    val totals: FoodNutrientsDto? = null,
)

/** Mirrors TS `WaterLog`. */
@Serializable
data class WaterLogDto(
    val id: String,
    val userId: String,
    val type: String = "waterLog",
    val amountMl: Int,
    val loggedAt: String,
    val localDate: String,
)

/** Body for `POST /water-logs` (shared `waterLogSchema`; 1–3000 ml). */
@Serializable
data class CreateWaterLogRequest(
    val amountMl: Int,
    val localDate: String,
)

/** Response of `GET /water-logs?date=` — day total only. */
@Serializable
data class WaterDayDto(
    val date: String,
    val totalMl: Int,
)

/** Mirrors TS `WeightLog`. One canonical entry per local date (upsert). */
@Serializable
data class WeightLogDto(
    val id: String,
    val userId: String,
    val type: String = "weightLog",
    val weightKg: Double,
    val note: String? = null,
    val loggedAt: String,
    val localDate: String,
)

/** Body for `POST /weight-logs` (shared `weightLogSchema`; canonical kg). */
@Serializable
data class CreateWeightLogRequest(
    val weightKg: Double,
    val note: String? = null,
    val localDate: String,
)

/** Response of `POST /weight-logs` — `{log}`. */
@Serializable
data class WeightLogEnvelopeDto(
    val log: WeightLogDto,
)

/** Response of `GET /weight-logs?range=` — `{range, points, logs}`. */
@Serializable
data class WeightLogsDto(
    val range: String,
    val points: List<TrendPointDto> = emptyList(),
    val logs: List<WeightLogDto> = emptyList(),
)
